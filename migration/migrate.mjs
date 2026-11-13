import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');
const servicePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
if (!servicePath || !supabaseUrl || !serviceKey || !bucketName) {
  throw new Error('Set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_STORAGE_BUCKET, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

const serviceAccount = JSON.parse(await readFile(servicePath, 'utf8'));
const firebaseApp = initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName }, 'migration-source');
const firestore = getFirestore(firebaseApp);
const firebaseAuth = getAuth(firebaseApp);
const firebaseBucket = getStorage(firebaseApp).bucket(bucketName);
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const report = { mode: apply ? 'apply' : 'dry-run', source: {}, destination: {}, warnings: [], errors: [] };

const eventSnapshots = await firestore.collection('events').get();
const adminSnapshots = await firestore.collection('admins').get();
const sourceEvents = [];
for (const eventDoc of eventSnapshots.docs) {
  const [bookingSnapshot, ticketSnapshot] = await Promise.all([
    eventDoc.ref.collection('bookings').get(),
    eventDoc.ref.collection('tickets').get(),
  ]);
  sourceEvents.push({ id: eventDoc.id, data: eventDoc.data(), bookings: bookingSnapshot.docs, tickets: ticketSnapshot.docs });
  report.source.bookings = (report.source.bookings ?? 0) + bookingSnapshot.size;
  report.source.tickets = (report.source.tickets ?? 0) + ticketSnapshot.size;
}
report.source.events = sourceEvents.length;
report.source.admins = adminSnapshots.size;
report.source.firebaseAuthUsers = await countFirebaseUsers(firebaseAuth);
const [sourceFiles] = await firebaseBucket.getFiles();
report.source.storageFiles = sourceFiles.length;

console.log(JSON.stringify({ mode: report.mode, source: report.source }, null, 2));
if (!apply) {
  console.log('Dry run only. Re-run with --apply after reviewing source counts and configuring Supabase.');
  process.exit(0);
}

const users = await listFirebaseUsers(firebaseAuth);
const adminIds = new Set(adminSnapshots.docs.map((doc) => doc.id));
const identityMap = new Map();
const existingUsers = await listSupabaseUsers(supabase);

for (const firebaseUser of users) {
  if (!firebaseUser.email) {
    report.warnings.push(`Firebase user ${firebaseUser.uid} has no email; identity was not recreated. Its existing bookings remain preserved with the legacy UID.`);
    continue;
  }
  let supabaseId = await lookupIdentity(supabase, firebaseUser.uid);
  if (!supabaseId) {
    const existing = existingUsers.get(firebaseUser.email.toLowerCase());
    if (existing) supabaseId = existing.id;
    else {
      const generatedPassword = randomBytes(36).toString('base64url');
      const { data, error } = await supabase.auth.admin.createUser({
        email: firebaseUser.email,
        password: generatedPassword,
        email_confirm: firebaseUser.emailVerified,
        user_metadata: { full_name: firebaseUser.displayName ?? '', migrated_from_firebase: true },
        app_metadata: { legacy_firebase_uid: firebaseUser.uid },
      });
      if (error) throw new Error(`Could not migrate auth user ${firebaseUser.email}: ${error.message}`);
      supabaseId = data.user.id;
      existingUsers.set(firebaseUser.email.toLowerCase(), data.user);
    }
  }
  identityMap.set(firebaseUser.uid, supabaseId);
  const { error: identityError } = await supabase.from('legacy_identity_map').upsert({ firebase_uid: firebaseUser.uid, supabase_user_id: supabaseId, email: firebaseUser.email.toLowerCase() });
  if (identityError) throw identityError;
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: supabaseId,
    email: firebaseUser.email.toLowerCase(),
    full_name: firebaseUser.displayName ?? '',
    phone: firebaseUser.phoneNumber ?? '',
    role: adminIds.has(firebaseUser.uid) ? 'admin' : 'customer',
    legacy_firebase_uid: firebaseUser.uid,
    password_reset_required: true,
  });
  if (profileError) throw profileError;
}
report.destination.authUsers = identityMap.size;

const eventIds = new Map();
const seenSlugs = new Set();
for (const source of sourceEvents) {
  let slug = uniqueSlug(source.data.slug || source.id, source.id);
  if (seenSlugs.has(slug)) slug = `${slug}-${source.id.slice(0, 8)}`;
  seenSlugs.add(slug);
  const { data: found, error: findError } = await supabase.from('events').select('id').eq('legacy_id', source.id).maybeSingle();
  if (findError) throw findError;
  const id = found?.id ?? randomUUID();
  eventIds.set(source.id, id);
  const { error } = await supabase.from('events').upsert({
    id,
    legacy_id: source.id,
    slug,
    title: source.data.title || slug,
    description: source.data.description || '',
    organizer: source.data.organizer || 'Marafiki Muziki',
    event_date: source.data.eventDate,
    start_time: normalizeTime(source.data.startTime),
    end_time: normalizeTime(source.data.endTime),
    venue: source.data.venue || 'Venue to be confirmed',
    venue_note: source.data.venueNote || '',
    music_by: source.data.musicBy || '',
    capacity: Number(source.data.capacity ?? 0),
    reserved: Number(source.data.reserved ?? 0),
    checked_in: Number(source.data.checkedIn ?? 0),
    max_tickets_per_booking: Number(source.data.maxTicketsPerBooking ?? 4),
    booking_open: Boolean(source.data.bookingOpen),
    status: ['draft', 'published', 'completed', 'cancelled'].includes(source.data.status) ? source.data.status : 'draft',
  }, { onConflict: 'legacy_id' });
  if (error) throw new Error(`Event ${source.id}: ${error.message}`);
}

const assetPathMap = new Map();
for (const source of sourceEvents) {
  const targetEventId = eventIds.get(source.id);
  const [files] = await firebaseBucket.getFiles({ prefix: `events/${source.id}/` });
  for (const file of files) {
    const sourcePath = file.name;
    const relativePath = sourcePath.slice(`events/${source.id}/`.length);
    const contentType = file.metadata.contentType || mimeFromPath(sourcePath);
    const isPoster = (sourcePath === objectPathFromUrl(source.data.posterUrl) || /poster|cover/i.test(relativePath)) && /^image\/(jpeg|png|webp)$/.test(contentType);
    const targetBucket = isPoster ? 'event-posters' : 'event-assets';
    const targetPath = `events/${targetEventId}/${relativePath}`;
    const [contents] = await file.download();
    const { error: uploadError } = await supabase.storage.from(targetBucket).upload(targetPath, contents, { contentType, upsert: true });
    if (uploadError) throw new Error(`Storage ${sourcePath}: ${uploadError.message}`);
    assetPathMap.set(sourcePath, targetPath);
    const { error: assetError } = await supabase.from('event_assets').upsert({ event_id: targetEventId, storage_path: targetPath, asset_type: isPoster ? 'poster' : 'other', content_type: contentType, byte_size: Number(file.metadata.size ?? contents.length), legacy_path: sourcePath }, { onConflict: 'storage_path' });
    if (assetError) throw assetError;
  }
}

// Copy any remaining legacy objects into a private bucket so no source file is silently dropped.
const migratedPaths = new Set(assetPathMap.keys());
for (const file of sourceFiles) {
  if (migratedPaths.has(file.name)) continue;
  const [contents] = await file.download();
  const path = `legacy/${file.name}`;
  const contentType = file.metadata.contentType || mimeFromPath(file.name);
  const { error } = await supabase.storage.from('event-assets').upload(path, contents, { contentType, upsert: true });
  if (error) throw new Error(`Storage ${file.name}: ${error.message}`);
  const { error: assetError } = await supabase.from('event_assets').upsert({ event_id: null, storage_path: path, asset_type: 'other', content_type: contentType, byte_size: Number(file.metadata.size ?? contents.length), legacy_path: file.name }, { onConflict: 'storage_path' });
  if (assetError) throw new Error(`Asset metadata ${file.name}: ${assetError.message}`);
  assetPathMap.set(file.name, path);
}

for (const source of sourceEvents) {
  const eventId = eventIds.get(source.id);
  const posterSourcePath = objectPathFromUrl(source.data.posterUrl) || sourceFiles.find((file) => file.name.startsWith(`events/${source.id}/`) && /poster|cover/i.test(file.name))?.name;
  let posterPath = posterSourcePath ? assetPathMap.get(posterSourcePath) : null;
  if (!posterPath && source.data.posterUrl) {
    try {
      const sourceUrl = new URL(source.data.posterUrl);
      if (sourceUrl.protocol !== 'https:' || isPrivateHost(sourceUrl.hostname)) throw new Error('Unsupported or private poster host.');
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) });
      const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
      if (!response.ok || !['image/jpeg','image/png','image/webp'].includes(contentType)) throw new Error('External poster is unavailable or has an unsupported type.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 10 * 1024 * 1024) throw new Error('Poster exceeds 10 MB.');
      const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/webp' ? 'webp' : 'png';
      posterPath = `events/${eventId}/poster.${extension}`;
      const { error: uploadError } = await supabase.storage.from('event-posters').upload(posterPath, bytes, { contentType, upsert: true });
      if (uploadError) throw uploadError;
      const { error: assetError } = await supabase.from('event_assets').upsert({ event_id: eventId, storage_path: posterPath, asset_type: 'poster', content_type: contentType, byte_size: bytes.length, legacy_path: source.data.posterUrl }, { onConflict: 'storage_path' });
      if (assetError) throw assetError;
      report.destination.importedExternalPosters = (report.destination.importedExternalPosters ?? 0) + 1;
    } catch (error) {
      report.warnings.push(`Event ${source.id}: poster transfer failed (${error.message}); upload a replacement poster after migration.`);
    }
  }
  if (posterPath) {
    const { error } = await supabase.from('events').update({ poster_path: posterPath }).eq('id', eventId);
    if (error) throw error;
  }

  const bookingIds = new Map();
  for (const bookingDoc of source.bookings) {
    const booking = bookingDoc.data();
    const firebaseUid = booking.ownerUid || bookingDoc.id;
    const userId = identityMap.get(firebaseUid) ?? null;
    const { data: existing, error: findError } = await supabase.from('bookings').select('id').eq('legacy_id', `${source.id}/${bookingDoc.id}`).maybeSingle();
    if (findError) throw findError;
    const id = existing?.id ?? randomUUID();
    bookingIds.set(bookingDoc.id, id);
    const { error } = await supabase.from('bookings').upsert({
      id,
      legacy_id: `${source.id}/${bookingDoc.id}`,
      event_id: eventId,
      user_id: userId,
      legacy_owner_uid: firebaseUid,
      booking_code: booking.bookingCode || `LEG-${source.id.slice(0, 6)}-${bookingDoc.id.slice(0, 8)}`.toUpperCase(),
      full_name: booking.fullName || 'Guest',
      email: (booking.email || '').toLowerCase(),
      phone: booking.phone || '',
      quantity: Number(booking.quantity ?? 1),
      status: booking.status === 'cancelled' ? 'cancelled' : 'confirmed',
      checked_in: Boolean(booking.checkedIn),
      checked_in_at: firebaseDate(booking.checkedInAt),
      checked_in_by: identityMap.get(booking.checkedInBy) ?? null,
      created_at: firebaseDate(booking.createdAt) || new Date().toISOString(),
      updated_at: firebaseDate(booking.updatedAt) || new Date().toISOString(),
    }, { onConflict: 'legacy_id' });
    if (error) throw new Error(`Booking ${source.id}/${bookingDoc.id}: ${error.message}`);
  }

  const ticketDocs = new Map(source.tickets.map((doc) => [doc.id, doc]));
  for (const bookingDoc of source.bookings) {
    const booking = bookingDoc.data();
    const ticketDoc = ticketDocs.get(bookingDoc.id);
    const ticket = ticketDoc?.data() ?? {};
    const bookingId = bookingIds.get(bookingDoc.id);
    const { data: existingBookingTicket } = await supabase.from('tickets').select('id').eq('booking_id', bookingId).maybeSingle();
    const id = existingBookingTicket?.id ?? randomUUID();
    const { error } = await supabase.from('tickets').upsert({
      id,
      legacy_id: ticketDoc?.id ?? bookingDoc.id,
      event_id: eventId,
      booking_id: bookingId,
      ticket_code: ticket.ticketCode || booking.bookingCode,
      guest_name: ticket.guestName || booking.fullName || 'Guest',
      quantity: Number(ticket.quantity ?? booking.quantity ?? 1),
      status: (ticket.status || booking.status) === 'cancelled' ? 'cancelled' : 'confirmed',
      checked_in: Boolean(ticket.checkedIn ?? booking.checkedIn),
      checked_in_at: firebaseDate(ticket.checkedInAt ?? booking.checkedInAt),
      created_at: firebaseDate(ticket.createdAt) || firebaseDate(booking.createdAt) || new Date().toISOString(),
    }, { onConflict: 'booking_id' });
    if (error) throw new Error(`Ticket ${source.id}/${bookingDoc.id}: ${error.message}`);
  }
}

report.destination.events = await countRows('events');
report.destination.bookings = await countRows('bookings');
report.destination.tickets = await countRows('tickets');
report.destination.eventAssets = await countRows('event_assets');
report.destination.profiles = await countRows('profiles');
report.destination.storageFiles = Object.values(assetPathMap).length;
report.destination.identityMappings = identityMap.size;
report.verification = {
  eventsMatch: await countMigratedRows('events') === report.source.events,
  bookingsMatch: await countMigratedRows('bookings') === report.source.bookings,
  ticketsMatch: await countMigratedRows('tickets') === report.source.tickets,
  assetsUploaded: report.destination.storageFiles === report.source.storageFiles,
};
if (Object.values(report.verification).some((matches) => !matches)) report.warnings.push('One or more source/destination totals differ. Review legacy IDs and orphaned nested documents before cutover.');
await writeFile('migration-report.json', JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));

async function countRows(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

async function countMigratedRows(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).not('legacy_id', 'is', null);
  if (error) throw error;
  return count ?? 0;
}

async function listFirebaseUsers(auth) {
  const users = [];
  let nextPageToken;
  do {
    const page = await auth.listUsers(1000, nextPageToken);
    users.push(...page.users);
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  return users;
}

async function countFirebaseUsers(auth) { return (await listFirebaseUsers(auth)).length; }

async function listSupabaseUsers(client) {
  const users = new Map();
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) if (user.email) users.set(user.email.toLowerCase(), user);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function lookupIdentity(client, uid) {
  const { data, error } = await client.from('legacy_identity_map').select('supabase_user_id').eq('firebase_uid', uid).maybeSingle();
  if (error) throw error;
  return data?.supabase_user_id ?? null;
}

function firebaseDate(value) {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function objectPathFromUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const encoded = url.pathname.split('/o/')[1];
    return encoded ? decodeURIComponent(encoded) : null;
  } catch { return null; }
}

function normalizeTime(value) { return value ? String(value).length === 5 ? `${value}:00` : String(value) : '18:00:00'; }
function mimeFromPath(path) {
  const extension = path.toLowerCase().split('.').pop();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' })[extension] || 'application/octet-stream';
}
function uniqueSlug(value, fallback) {
  const slug = String(value || fallback).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 150);
  return slug || `event-${fallback}`;
}

function isPrivateHost(host) {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  return value === 'localhost' || value.endsWith('.local') || value === '::1' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:') ||
    /^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value);
}
