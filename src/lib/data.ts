import { supabase } from './supabase';
import type { BookingWithId, EventDoc, EventWithId, PublicTicketWithId } from './types';

type EventRow = Record<string, any>;

function eventFromRow(row: EventRow): EventWithId {
  const posterPath = row.poster_path as string | null;
  const posterUrl = posterPath ? supabase.storage.from('event-posters').getPublicUrl(posterPath).data.publicUrl : '';
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? '',
    organizer: row.organizer ?? 'Marafiki Muziki',
    eventDate: row.event_date,
    startTime: row.start_time,
    endTime: row.end_time,
    venue: row.venue,
    venueNote: row.venue_note ?? '',
    musicBy: row.music_by ?? '',
    posterUrl,
    capacity: row.capacity,
    reserved: row.reserved,
    checkedIn: row.checked_in,
    maxTicketsPerBooking: row.max_tickets_per_booking,
    bookingOpen: row.booking_open,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function storagePathFromPublicUrl(url: string, bucket: string) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) throw new Error('Poster must be uploaded to the configured Supabase Storage bucket.');
  return decodeURIComponent(url.slice(index + marker.length).split('?')[0]);
}

function eventPayload(payload: Partial<EventDoc>) {
  const { posterUrl, ...rest } = payload;
  const values: Record<string, unknown> = {
    title: rest.title,
    slug: rest.slug,
    description: rest.description ?? '',
    organizer: rest.organizer ?? 'Marafiki Muziki',
    event_date: rest.eventDate,
    start_time: rest.startTime,
    end_time: rest.endTime,
    venue: rest.venue,
    venue_note: rest.venueNote ?? '',
    music_by: rest.musicBy ?? '',
    ...(posterUrl !== undefined ? { poster_path: posterUrl ? storagePathFromPublicUrl(posterUrl, 'event-posters') : null } : {}),
    capacity: rest.capacity,
    max_tickets_per_booking: rest.maxTicketsPerBooking,
    booking_open: rest.bookingOpen,
    status: rest.status,
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}

function bookingFromRow(row: Record<string, any>): BookingWithId {
  return {
    id: row.id,
    eventId: row.event_id,
    bookingCode: row.booking_code,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    quantity: row.quantity,
    status: row.status,
    checkedIn: row.checked_in,
    checkedInAt: row.checked_in_at,
    checkedInBy: row.checked_in_by,
    ownerUid: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicTicketFromRow(row: Record<string, any>): PublicTicketWithId {
  return {
    id: row.id,
    eventId: row.event_id,
    ticketCode: row.ticket_code,
    guestName: row.guest_name,
    quantity: row.quantity,
    status: row.status,
    checkedIn: row.checked_in,
    checkedInAt: row.checked_in_at,
    createdAt: row.created_at,
  };
}

async function resolveEventId(value: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  let query = supabase.from('events').select('id').limit(1);
  query = uuid ? query.eq('id', value) : query.eq('slug', value);
  let { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data && !uuid) {
    const legacy = await supabase.from('events').select('id').eq('legacy_id', value).maybeSingle();
    if (legacy.error) throw legacy.error;
    data = legacy.data;
  }
  if (!data) throw new Error('Event not found.');
  return data.id as string;
}

async function loadEvents(admin: boolean) {
  let query = supabase.from('events').select('*').order('event_date', { ascending: admin ? false : true });
  if (!admin) query = query.eq('status', 'published');
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(eventFromRow);
}

export async function ensureGuestAuth() {
  const { data: current } = await supabase.auth.getUser();
  if (current.user?.is_anonymous) return current.user;
  if (current.user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', current.user.id).maybeSingle();
    if (profile?.role === 'admin') throw new Error('You are signed in as an administrator. Sign out before making a public booking.');
    return current.user;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    if (/anonymous/i.test(error.message) || error.status === 422) throw new Error('Anonymous sign-in is not enabled in Supabase Authentication settings.');
    throw error;
  }
  return data.user;
}

export function subscribePublishedEvents(callback: (events: EventWithId[]) => void, onError?: (message: string) => void) {
  let active = true;
  const load = () => void loadEvents(false).then((rows) => { if (active) callback(rows); }).catch((error: Error) => onError?.(error.message));
  load();
  const channel = supabase.channel(`public-events-${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, load).subscribe();
  return () => { active = false; void supabase.removeChannel(channel); };
}

export function subscribeAllEvents(callback: (events: EventWithId[]) => void, onError?: (message: string) => void) {
  let active = true;
  const load = () => void loadEvents(true).then((rows) => { if (active) callback(rows); }).catch((error: Error) => onError?.(error.message));
  load();
  const channel = supabase.channel(`admin-events-${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, load).subscribe();
  return () => { active = false; void supabase.removeChannel(channel); };
}

export async function getEvent(eventId: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId);
  let query = supabase.from('events').select('*').limit(1);
  query = uuid ? query.eq('id', eventId) : query.eq('slug', eventId);
  let { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data && !uuid) {
    const legacy = await supabase.from('events').select('*').eq('legacy_id', eventId).maybeSingle();
    if (legacy.error) throw legacy.error;
    data = legacy.data;
  }
  return data ? eventFromRow(data) : null;
}

export async function createEvent(eventId: string, payload: Omit<EventDoc, 'reserved' | 'checkedIn' | 'createdAt' | 'updatedAt'>) {
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId) ? eventId : crypto.randomUUID();
  const { data, error } = await supabase.from('events').insert({ id, ...eventPayload(payload) }).select('*').single();
  if (error) throw error;
  return eventFromRow(data);
}

export async function updateEvent(eventId: string, payload: Partial<EventDoc>) {
  const id = await resolveEventId(eventId);
  const patch = eventPayload(payload);
  const { error } = await supabase.from('events').update(patch).eq('id', id);
  if (error) throw error;
}

export async function createBooking(eventId: string, input: { fullName: string; phone: string; email: string; quantity: number }) {
  await ensureGuestAuth();
  const id = await resolveEventId(eventId);
  const { data, error } = await supabase.rpc('create_booking', {
    p_event_id: id,
    p_full_name: input.fullName.trim(),
    p_email: input.email.trim().toLowerCase(),
    p_phone: input.phone.trim(),
    p_quantity: input.quantity,
  });
  if (error) throw new Error(error.message.replace(/^.*DETAIL: /, ''));
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.ticket_id || !result?.booking_code) throw new Error('Booking could not be completed.');
  return { ticketId: result.ticket_id as string, bookingCode: result.booking_code as string };
}

export async function getPublicTicket(eventId: string, ticketId: string) {
  const id = await resolveEventId(eventId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId);
  let query = supabase.from('public_tickets').select('*').eq('event_id', id).limit(1);
  query = isUuid ? query.eq('id', ticketId) : query.eq('legacy_id', ticketId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? publicTicketFromRow(data) : null;
}

export async function listEventBookings(eventId: string) {
  const id = await resolveEventId(eventId);
  const { data, error } = await supabase.from('bookings').select('*').eq('event_id', id).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(bookingFromRow);
}

export async function getBookingForAdmin(eventId: string, ticketId: string) {
  const id = await resolveEventId(eventId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId);
  let ticketQuery = supabase.from('tickets').select('id,booking_id').eq('event_id', id).limit(1);
  ticketQuery = isUuid ? ticketQuery.eq('id', ticketId) : ticketQuery.eq('legacy_id', ticketId);
  const { data: ticket, error: ticketError } = await ticketQuery.maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket) return null;
  const { data, error } = await supabase.from('bookings').select('*').eq('id', ticket.booking_id).maybeSingle();
  if (error) throw error;
  return data ? { ...bookingFromRow(data), id: ticket.id } : null;
}

export async function findBookingForAdmin(eventId: string, ticketValue: string) {
  const id = await resolveEventId(eventId);
  const value = ticketValue.trim();
  if (!value) return null;
  let ticketQuery = supabase.from('tickets').select('id,booking_id').eq('event_id', id).limit(1);
  const isUuid = /^[0-9a-f-]{36}$/i.test(value);
  if (isUuid) ticketQuery = ticketQuery.eq('id', value);
  else {
    const { data: legacyTicket } = await supabase.from('tickets').select('id,booking_id').eq('event_id', id).eq('legacy_id', value).maybeSingle();
    if (legacyTicket) {
      const { data: legacyBooking, error: legacyBookingError } = await supabase.from('bookings').select('*').eq('id', legacyTicket.booking_id).maybeSingle();
      if (legacyBookingError) throw legacyBookingError;
      return legacyBooking ? { ...bookingFromRow(legacyBooking), id: legacyTicket.id } : null;
    }
    ticketQuery = supabase.from('tickets').select('id,booking_id').eq('event_id', id).eq('ticket_code', value.toUpperCase()).limit(1);
  }
  const { data: ticket, error: ticketError } = await ticketQuery.maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket) return null;
  const { data, error } = await supabase.from('bookings').select('*').eq('id', ticket.booking_id).maybeSingle();
  if (error) throw error;
  return data ? { ...bookingFromRow(data), id: ticket.id } : null;
}

export async function checkInTicket(eventId: string, ticketId: string) {
  const id = await resolveEventId(eventId);
  const { data, error } = await supabase.rpc('check_in_ticket', { p_event_id: id, p_ticket_id: ticketId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? bookingFromRow(row as Record<string, any>) : null;
}
