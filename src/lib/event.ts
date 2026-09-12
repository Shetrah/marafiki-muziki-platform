import type { EventDoc } from './types';

export const EVENT_ID = 'living-room-vibe-2026';

export const EVENT_DEFAULTS: Omit<EventDoc, 'reserved' | 'createdAt' | 'updatedAt'> & {
  dateLabel: string;
  timeLabel: string;
} = {
  title: 'The Living Room Vibe',
  organizer: 'Marafiki Muziki',
  dateLabel: '25th Sep 2026',
  timeLabel: '6:00 PM – 8:00 PM',
  eventDate: '2026-09-25',
  startTime: '18:00',
  endTime: '20:00',
  venue: 'Oasis Apartment',
  venueNote: 'Near Kwa Ndege Level 4 Hospital',
  musicBy: 'randy_muziki',
  capacity: 150,
  bookingOpen: true,
  maxTicketsPerBooking: 4,
};

export function getDefaultEventPayload(): EventDoc {
  return {
    title: EVENT_DEFAULTS.title,
    organizer: EVENT_DEFAULTS.organizer,
    eventDate: EVENT_DEFAULTS.eventDate,
    startTime: EVENT_DEFAULTS.startTime,
    endTime: EVENT_DEFAULTS.endTime,
    venue: EVENT_DEFAULTS.venue,
    venueNote: EVENT_DEFAULTS.venueNote,
    musicBy: EVENT_DEFAULTS.musicBy,
    capacity: EVENT_DEFAULTS.capacity,
    reserved: 0,
    bookingOpen: EVENT_DEFAULTS.bookingOpen,
    maxTicketsPerBooking: EVENT_DEFAULTS.maxTicketsPerBooking,
  };
}

export function formatDateLabel(eventDate: string) {
  const d = new Date(eventDate + 'T12:00:00');
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimeRange(startTime: string, endTime: string) {
  const format = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')} ${period}`;
  };
  return `${format(startTime)} – ${format(endTime)}`;
}
