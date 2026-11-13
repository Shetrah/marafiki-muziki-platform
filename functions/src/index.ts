import { GoogleGenAI } from '@google/genai';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

initializeApp();
const db = getFirestore();
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const premiumModel = defineString('GEMINI_IMAGE_MODEL', { default: 'gemini-3-pro-image' });
const fallbackModel = defineString('GEMINI_FALLBACK_IMAGE_MODEL', { default: 'gemini-3.1-flash-image' });
const approvedAdminUids = defineString('GEMINI_ADMIN_UIDS', { default: '' });

type GenerationBudget = { enabled: boolean; maxImagesPerMonth: number; maxImagesPerRequest: number; usedImages?: number; month?: string };
const defaultBudget: GenerationBudget = { enabled: false, maxImagesPerMonth: 20, maxImagesPerRequest: 3, usedImages: 0 };
const allowedModels = new Set(['gemini-3-pro-image', 'gemini-3.1-flash-image']);

export const generateTicketArtwork = onCall({ secrets: [geminiApiKey], timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
  if (!request.auth || request.auth.token.firebase?.sign_in_provider === 'anonymous') throw new HttpsError('unauthenticated', 'Administrator sign-in required.');
  const adminId = request.auth.uid;
  const approved = approvedAdminUids.value().split(',').map((uid) => uid.trim()).filter(Boolean);
  if (!approved.includes(adminId)) throw new HttpsError('permission-denied', 'This account is not in the configured artwork administrator allowlist.');
  const admin = await db.doc(`admins/${adminId}`).get();
  if (!admin.exists) throw new HttpsError('permission-denied', 'Administrator access required.');

  const variationCount = Number(request.data?.variations ?? 1);
  const eventId = String(request.data?.eventId ?? '').trim();
  if (!eventId || eventId.length > 160) throw new HttpsError('invalid-argument', 'Choose a valid event.');
  const requestedModel = request.data?.model === 'standard' ? fallbackModel.value() : premiumModel.value();
  if (!Number.isInteger(variationCount) || variationCount < 1 || variationCount > 3) throw new HttpsError('invalid-argument', 'Choose 1–3 variations.');
  if (!allowedModels.has(requestedModel)) throw new HttpsError('failed-precondition', 'Configured image model is unsupported.');

  const eventSnap = await db.doc(`events/${eventId}`).get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');
  const event = eventSnap.data() ?? {};
  if (typeof event.posterUrl !== 'string' || !event.posterUrl) throw new HttpsError('failed-precondition', 'Upload a poster to this event before generating artwork.');
  const posterUrl = new URL(event.posterUrl);
  const bucket = getStorage().bucket();
  const validFirebaseUrl = posterUrl.protocol === 'https:' && posterUrl.hostname === 'firebasestorage.googleapis.com' && posterUrl.pathname.startsWith(`/v0/b/${bucket.name}/o/`);
  const validGoogleStorageUrl = posterUrl.protocol === 'https:' && posterUrl.hostname === 'storage.googleapis.com' && posterUrl.pathname.startsWith(`/${bucket.name}/`);
  if (!validFirebaseUrl && !validGoogleStorageUrl) {
    throw new HttpsError('failed-precondition', 'The event poster must be stored in Firebase Storage.');
  }

  const budgetRef = db.doc('settings/ticketArtworkBudget');
  const reservedCalls = variationCount * 2; // Reserve room for one fallback attempt per variation.
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(budgetRef);
    const current = { ...defaultBudget, ...(snap.exists ? snap.data() as Partial<GenerationBudget> : {}) };
    const usedImages = current.month === month ? Number(current.usedImages ?? 0) : 0;
    if (!current.enabled) throw new HttpsError('failed-precondition', 'AI artwork generation is disabled by the administrator.');
    if (variationCount > current.maxImagesPerRequest) throw new HttpsError('resource-exhausted', 'Variation count exceeds the administrator limit.');
    if (usedImages + reservedCalls > current.maxImagesPerMonth) throw new HttpsError('resource-exhausted', 'Monthly Gemini call budget reached, including fallback allowance.');
    tx.set(budgetRef, { ...current, month, usedImages: usedImages + reservedCalls, updatedAt: FieldValue.serverTimestamp() });
  });

  const attemptRef = db.collection('ticketArtworkGenerations').doc();
  await attemptRef.set({ requestedBy: adminId, eventId, model: requestedModel, variations: variationCount, status: 'processing', createdAt: FieldValue.serverTimestamp() });
  try {
    const posterResponse = await fetch(posterUrl, { signal: AbortSignal.timeout(20_000) });
    if (!posterResponse.ok) throw new Error(`Poster fetch failed with status ${posterResponse.status}.`);
    const posterType = posterResponse.headers.get('content-type')?.split(';')[0] ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(posterType)) throw new Error('Poster must be JPG, PNG or WEBP.');
    const posterBytes = Buffer.from(await posterResponse.arrayBuffer());
    if (posterBytes.length > 12 * 1024 * 1024) throw new Error('Poster exceeds the 12 MB limit.');
    const sourcePoster = posterBytes;
    const poster = await sharp(sourcePoster).png().toBuffer();
    const ai = new GoogleGenAI({ apiKey: geminiApiKey.value() });
    const results: { pngPath: string; pdfPath: string; pngUrl: string; pdfUrl: string; model: string }[] = [];
    let actualCalls = 0;
    for (let i = 0; i < variationCount; i += 1) {
      let usedModel = requestedModel;
      let generated: Buffer;
      try {
        actualCalls += 1;
        generated = await generate(ai, usedModel, poster, event, i + 1);
      } catch {
        usedModel = usedModel === premiumModel.value() ? fallbackModel.value() : usedModel;
        actualCalls += 1;
        generated = await generate(ai, usedModel, poster, event, i + 1);
      }
      const png = await compose(generated, poster, event, i + 1);
      const finalPng = png;
      const pngPath = `generated-ticket-artwork/${attemptRef.id}/variation-${i + 1}.png`;
      const pdfPath = `generated-ticket-artwork/${attemptRef.id}/variation-${i + 1}.pdf`;
      const pdf = await renderPdf(finalPng);
      await Promise.all([
        bucket.file(pngPath).save(finalPng, { metadata: { contentType: 'image/png' } }),
        bucket.file(pdfPath).save(pdf, { metadata: { contentType: 'application/pdf' } }),
      ]);
      const expires = Date.now() + 15 * 60 * 1000;
      const [[pngUrl], [pdfUrl]] = await Promise.all([
        bucket.file(pngPath).getSignedUrl({ action: 'read', expires }),
        bucket.file(pdfPath).getSignedUrl({ action: 'read', expires }),
      ]);
      results.push({ pngPath, pdfPath, pngUrl, pdfUrl, model: usedModel });
    }
    await db.runTransaction(async (tx) => {
      const latest = await tx.get(budgetRef);
      const data = latest.data() ?? {};
      if (data.month === month) tx.update(budgetRef, { usedImages: Math.max(0, Number(data.usedImages ?? 0) - (reservedCalls - actualCalls)), updatedAt: FieldValue.serverTimestamp() });
    });
    await attemptRef.update({ modelCalls: actualCalls });
    await attemptRef.update({ status: 'complete', results, completedAt: FieldValue.serverTimestamp() });
    return { generationId: attemptRef.id, results };
  } catch (error) {
    await attemptRef.update({ status: 'failed', error: safeError(error), failedAt: FieldValue.serverTimestamp() });
    // Failed requests are counted as consumed to keep retry behavior bounded and predictable.
    throw new HttpsError('internal', 'Artwork generation failed. The usage attempt was recorded; try again later.');
  }
});

async function generate(ai: GoogleGenAI, model: string, poster: Buffer, event: Record<string, unknown>, variation: number) {
  const prompt = `Create variation ${variation} of a professional landscape admission ticket artwork inspired by this reference poster. Study and carry through its palette, typography mood, visual hierarchy, imagery and composition, but create a distinct ticket design; do not just place the poster as a rectangle. Leave a clean, high contrast information panel and a clear empty square at lower right for a programmatically added QR. Do not invent or render names, dates, prices, ticket codes, or other event text; those are added in a trusted post-processing step. Event: ${String(event.title ?? 'The Living Room Vibe')}.`;
  const response = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/png', data: poster.toString('base64') } }] }], config: { responseModalities: ['TEXT', 'IMAGE'] } });
  const part = response.candidates?.[0]?.content?.parts?.find((entry) => entry.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error('Gemini returned no image.');
  return Buffer.from(part.inlineData.data, 'base64');
}

async function compose(generated: Buffer, _poster: Buffer, event: Record<string, unknown>, variation: number) {
  const art = await sharp(generated).resize(1600, 1120, { fit: 'cover' }).png().toBuffer();
  const metadata = await sharp(art).metadata();
  const width = metadata.width ?? 1600;
  const svg = Buffer.from(`<svg width="${width}" height="260"><rect width="100%" height="100%" fill="#080808" fill-opacity=".9"/><text x="70" y="80" fill="#fff" font-size="50" font-family="Arial" font-weight="700">${escapeXml(String(event.title ?? 'THE LIVING ROOM VIBE'))}</text><text x="70" y="145" fill="#ff7200" font-size="30" font-family="Arial">${escapeXml(String(event.eventDate ?? 'Event date'))} · ${escapeXml(String(event.venue ?? 'Venue'))}</text><text x="70" y="205" fill="#fff" font-size="23" font-family="Arial">ADMISSION TICKET · DESIGN ${variation}</text></svg>`);
  return sharp(art).composite([{ input: svg, left: 0, top: (metadata.height ?? 1120) - 260 }]).png().toBuffer();
}

function renderPdf(png: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: [800, 560], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.image(png, 0, 0, { width: 800, height: 560 });
    doc.end();
  });
}

function escapeXml(value: string) { return value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char] ?? char); }
function safeError(error: unknown) { return error instanceof Error ? error.message.slice(0, 500) : 'Unknown generation error'; }
