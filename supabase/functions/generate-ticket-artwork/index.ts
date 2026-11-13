import { createClient } from 'npm:@supabase/supabase-js@2';
import Jimp from 'npm:jimp@0.22.12';
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const premiumModel = Deno.env.get('GEMINI_IMAGE_MODEL') ?? 'gemini-3-pro-image';
const fallbackModel = Deno.env.get('GEMINI_FALLBACK_IMAGE_MODEL') ?? 'gemini-3.1-flash-image';
const allowedModels = new Set(['gemini-3-pro-image', 'gemini-3.1-flash-image']);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!serviceKey || !geminiKey) return response({ error: 'Server secrets are not configured.' }, 500);

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return response({ error: 'Authentication required.' }, 401);
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return response({ error: 'Authentication required.' }, 401);
  const { data: profile } = await adminClient.from('profiles').select('role').eq('id', authData.user.id).maybeSingle();
  if (profile?.role !== 'admin') return response({ error: 'Administrator access required.' }, 403);

  let eventId = '';
  let variations = 1;
  let requestedModel = premiumModel;
  let reservedCalls = 0;
  let usageMonth = '';
  let generationId = '';
  const uploadedPaths: string[] = [];
  try {
    const body = await request.json();
    eventId = String(body.eventId ?? '');
    variations = Number(body.variations ?? 1);
    requestedModel = body.model === 'standard' ? fallbackModel : premiumModel;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(eventId)) throw new Error('Choose a valid event.');
    if (!Number.isInteger(variations) || variations < 1 || variations > 3) throw new Error('Choose one to three variations.');
    if (!allowedModels.has(requestedModel)) throw new Error('The configured Gemini model is not supported.');

    const { data: event, error: eventError } = await adminClient.from('events').select('id,title,event_date,start_time,venue,poster_path').eq('id', eventId).maybeSingle();
    if (eventError) throw eventError;
    if (!event?.poster_path) throw new Error('Upload an event poster before generating artwork.');
    const { data: poster, error: posterError } = await adminClient.storage.from('event-posters').download(event.poster_path);
    if (posterError || !poster) throw new Error('Could not load the event poster from Supabase Storage.');
    if (poster.size > 10 * 1024 * 1024) throw new Error('Poster exceeds the 10 MB limit.');
    const posterBytes = new Uint8Array(await poster.arrayBuffer());
    const posterMime = poster.type || 'image/png';

    const { data: reservation, error: budgetError } = await userClient.rpc('reserve_artwork_budget', { p_variations: variations }).single();
    if (budgetError) throw budgetError;
    reservedCalls = reservation.reserved_calls;
    usageMonth = reservation.usage_month;

    generationId = crypto.randomUUID();
    const { error: generationInsertError } = await adminClient.from('artwork_generations').insert({
      id: generationId, event_id: eventId, requested_by: authData.user.id,
      requested_model: requestedModel, variations, status: 'processing',
    });
    if (generationInsertError) throw generationInsertError;

    const results: { pngPath: string; pdfPath: string; pngUrl: string; pdfUrl: string; model: string }[] = [];
    let modelCalls = 0;
    for (let index = 0; index < variations; index += 1) {
      let usedModel = requestedModel;
      let generated: Uint8Array;
      try {
        modelCalls += 1;
        generated = await generateImage(geminiKey, usedModel, posterBytes, posterMime, event, index + 1);
      } catch {
        usedModel = usedModel === premiumModel ? fallbackModel : usedModel;
        modelCalls += 1;
        generated = await generateImage(geminiKey, usedModel, posterBytes, posterMime, event, index + 1);
      }
      const pngBytes = await renderArtwork(generated, event, index + 1);
      const pdfBytes = await renderPdf(pngBytes);
      const basePath = `artwork/${eventId}/${generationId}/variation-${index + 1}`;
      const pngPath = `${basePath}.png`;
      const pdfPath = `${basePath}.pdf`;
      const [pngUpload, pdfUpload] = await Promise.all([
        adminClient.storage.from('generated-tickets').upload(pngPath, pngBytes, { contentType: 'image/png', upsert: true }),
        adminClient.storage.from('generated-tickets').upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true }),
      ]);
      uploadedPaths.push(pngPath, pdfPath);
      if (pngUpload.error) throw pngUpload.error;
      if (pdfUpload.error) throw pdfUpload.error;
      const [pngLink, pdfLink] = await Promise.all([
        adminClient.storage.from('generated-tickets').createSignedUrl(pngPath, 900),
        adminClient.storage.from('generated-tickets').createSignedUrl(pdfPath, 900),
      ]);
      if (pngLink.error) throw pngLink.error;
      if (pdfLink.error) throw pdfLink.error;
      results.push({ pngPath, pdfPath, pngUrl: pngLink.data.signedUrl, pdfUrl: pdfLink.data.signedUrl, model: usedModel });
    }
    const { error: finalizeError } = await userClient.rpc('finalize_artwork_budget', { p_reserved: reservedCalls, p_actual: modelCalls, p_usage_month: usageMonth });
    if (finalizeError) throw finalizeError;
    await adminClient.from('artwork_generations').update({ status: 'complete', model_calls: modelCalls, results, completed_at: new Date().toISOString() }).eq('id', generationId);
    return response({ generationId, results });
  } catch (error) {
    if (uploadedPaths.length) await adminClient.storage.from('generated-tickets').remove(uploadedPaths);
    if (generationId) await adminClient.from('artwork_generations').update({ status: 'failed', error: safeMessage(error) }).eq('id', generationId);
    return response({ error: safeMessage(error), budgetReservationConsumed: reservedCalls > 0 }, 400);
  }
});

async function generateImage(apiKey: string, model: string, poster: Uint8Array, posterMime: string, event: Record<string, string>, variation: number) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const payload = {
    contents: [{ role: 'user', parts: [
      { text: `Create variation ${variation} of a professional landscape admission ticket artwork inspired by the attached event poster. Analyze and echo its palette, typography mood, visual hierarchy, imagery, branding, and composition, while making a fresh extension rather than placing the poster in a frame. Leave the lower area uncluttered for event details to be added programmatically. Do not invent names, dates, prices, ticket codes, or QR codes. Event: ${event.title}.` },
      { inline_data: { mime_type: posterMime, data: toBase64(poster) } },
    ] }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '4:3', imageSize: '2K' } },
  };
  const result = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(180_000) });
  const responseData = await result.json();
  if (!result.ok) throw new Error(responseData?.error?.message ?? `Gemini request failed (${result.status}).`);
  const encoded = responseData?.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData?.data || part.inline_data?.data);
  const data = encoded?.inlineData?.data ?? encoded?.inline_data?.data;
  if (!data) throw new Error('Gemini returned no image.');
  return Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
}

async function renderArtwork(imageBytes: Uint8Array, event: Record<string, string>, variation: number) {
  const image = await Jimp.read(imageBytes);
  image.cover(1600, 1120);
  const band = new Jimp(1600, 300, 0x080808e8);
  image.composite(band, 0, 820);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const smallFont = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  image.print(font, 52, 845, String(event.title).slice(0, 42));
  image.print(smallFont, 54, 930, `${event.event_date}  ·  ${event.start_time}  ·  ${event.venue}`.slice(0, 90));
  image.print(smallFont, 54, 1000, `ADMISSION TICKET  ·  DESIGN ${variation}`);
  return new Uint8Array(await image.getBufferAsync(Jimp.MIME_PNG));
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  return btoa(binary);
}

async function renderPdf(pngBytes: Uint8Array) {
  const document = await PDFDocument.create();
  const image = await document.embedPng(pngBytes);
  const page = document.addPage([800, 560]);
  page.drawImage(image, { x: 0, y: 0, width: 800, height: 560 });
  return await document.save();
}

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : 'Artwork generation failed.').slice(0, 500);
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
