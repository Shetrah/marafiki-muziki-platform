import type { Timestamp } from 'firebase/firestore';

export type EventStatus = 'draft' | 'published' | 'completed' | 'cancelled';

export type EventDoc = {
  title: string;
  slug: string;
  description: string;
  organizer: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  venue: string;
  venueNote: string;
  musicBy: string;
  posterUrl: string;
  capacity: number;
  reserved: number;
  checkedIn: number;
  maxTicketsPerBooking: number;
  bookingOpen: boolean;
  status: EventStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type BookingDoc = {
  eventId: string;
  bookingCode: string;
  fullName: string;
  phone: string;
  email: string;
  quantity: number;
  status: 'confirmed' | 'cancelled';
  checkedIn: boolean;
  checkedInAt?: Timestamp | null;
  checkedInBy?: string | null;
  ownerUid: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type PublicTicketDoc = {
  eventId: string;
  ticketCode: string;
  guestName: string;
  quantity: number;
  status: 'confirmed' | 'cancelled';
  checkedIn: boolean;
  checkedInAt?: Timestamp | null;
  createdAt?: Timestamp;
};

export type EventWithId = EventDoc & { id: string };
export type BookingWithId = BookingDoc & { id: string };
export type PublicTicketWithId = PublicTicketDoc & { id: string };
