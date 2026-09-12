import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { signInAnonymously } from 'firebase/auth';

import { auth, db } from './firebase';

import type {
  BookingWithId,
  EventDoc,
  EventWithId,
  PublicTicketWithId,
} from './types';

/* ============================================================
   GUEST AUTH
============================================================ */

export async function ensureGuestAuth() {
  if (auth.currentUser?.isAnonymous) {
    return auth.currentUser;
  }

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    throw new Error(
      'You are signed in as an administrator. Sign out before making a public booking.'
    );
  }

  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error: any) {
    if (
      error?.code === 'auth/operation-not-allowed' ||
      error?.code === 'auth/admin-restricted-operation'
    ) {
      throw new Error(
        'Anonymous booking is not enabled. Enable Anonymous sign-in in Firebase Authentication.'
      );
    }

    throw error;
  }
}

/* ============================================================
   EVENTS
============================================================ */

export function subscribePublishedEvents(
  callback: (events: EventWithId[]) => void,
  onError?: (message: string) => void
) {
  const q = query(
    collection(db, 'events'),
    where('status', '==', 'published')
  );

  return onSnapshot(
    q,
    (snap) => {
      const events = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as EventDoc),
        }))
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

      callback(events);
    },
    (error) => {
      onError?.(error.message);
    }
  );
}

export function subscribeAllEvents(
  callback: (events: EventWithId[]) => void,
  onError?: (message: string) => void
) {
  const q = query(
    collection(db, 'events'),
    orderBy('eventDate', 'desc')
  );

  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as EventDoc),
        }))
      );
    },
    (error) => {
      onError?.(error.message);
    }
  );
}

export async function getEvent(eventId: string) {
  const snap = await getDoc(doc(db, 'events', eventId));

  if (!snap.exists()) {
    return null;
  }

  return {
    id: snap.id,
    ...(snap.data() as EventDoc),
  } as EventWithId;
}

export async function createEvent(
  eventId: string,
  payload: Omit<
    EventDoc,
    'reserved' | 'checkedIn' | 'createdAt' | 'updatedAt'
  >
) {
  await setDoc(doc(db, 'events', eventId), {
    ...payload,
    reserved: 0,
    checkedIn: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateEvent(
  eventId: string,
  payload: Partial<EventDoc>
) {
  const safePayload: Partial<EventDoc> = {
    ...payload,
  };

  delete safePayload.reserved;
  delete safePayload.checkedIn;
  delete safePayload.createdAt;

  await updateDoc(doc(db, 'events', eventId), {
    ...safePayload,
    updatedAt: serverTimestamp(),
  });
}

/* ============================================================
   CREATE BOOKING
============================================================ */

export async function createBooking(
  eventId: string,
  input: {
    fullName: string;
    phone: string;
    email: string;
    quantity: number;
  }
) {
  const guest = await ensureGuestAuth();

  const eventRef = doc(
    db,
    'events',
    eventId
  );

  const bookingRef = doc(
    db,
    'events',
    eventId,
    'bookings',
    guest.uid
  );

  const ticketRef = doc(
    db,
    'events',
    eventId,
    'tickets',
    guest.uid
  );

  const eventPrefix = eventId
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, 'X');

  const bookingCode =
    `${eventPrefix}-${guest.uid.slice(0, 8).toUpperCase()}`;

  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    const existingBooking = await tx.get(bookingRef);

    if (!eventSnap.exists()) {
      throw new Error('This event no longer exists.');
    }

    if (existingBooking.exists()) {
      throw new Error(
        'A ticket has already been booked on this device for this event.'
      );
    }

    const event = eventSnap.data() as EventDoc;

    if (event.status !== 'published') {
      throw new Error(
        'This event is not currently available for booking.'
      );
    }

    if (!event.bookingOpen) {
      throw new Error(
        'Bookings are currently closed for this event.'
      );
    }

    if (
      !Number.isInteger(input.quantity) ||
      input.quantity < 1 ||
      input.quantity > event.maxTicketsPerBooking
    ) {
      throw new Error(
        `You can reserve between 1 and ${event.maxTicketsPerBooking} spaces.`
      );
    }

    const available =
      event.capacity - event.reserved;

    if (available <= 0) {
      throw new Error(
        'This event is fully booked.'
      );
    }

    if (input.quantity > available) {
      throw new Error(
        `Only ${available} slot${available === 1 ? '' : 's'} remain.`
      );
    }

    tx.update(eventRef, {
      reserved:
        event.reserved + input.quantity,

      updatedAt:
        serverTimestamp(),
    });

    tx.set(bookingRef, {
      eventId,
      bookingCode,

      fullName:
        input.fullName.trim(),

      phone:
        input.phone.trim(),

      email:
        input.email.trim().toLowerCase(),

      quantity:
        input.quantity,

      status:
        'confirmed',

      checkedIn:
        false,

      checkedInAt:
        null,

      checkedInBy:
        null,

      ownerUid:
        guest.uid,

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp(),
    });

    tx.set(ticketRef, {
      eventId,

      ticketCode:
        bookingCode,

      guestName:
        input.fullName.trim(),

      quantity:
        input.quantity,

      status:
        'confirmed',

      checkedIn:
        false,

      checkedInAt:
        null,

      createdAt:
        serverTimestamp(),
    });
  });

  return {
    ticketId: guest.uid,
    bookingCode,
  };
}

/* ============================================================
   PUBLIC TICKET
============================================================ */

export async function getPublicTicket(
  eventId: string,
  ticketId: string
) {
  const snap = await getDoc(
    doc(
      db,
      'events',
      eventId,
      'tickets',
      ticketId
    )
  );

  if (!snap.exists()) {
    return null;
  }

  return {
    id: snap.id,
    ...(snap.data() as any),
  } as PublicTicketWithId;
}

/* ============================================================
   ADMIN BOOKING LIST
============================================================ */

export async function listEventBookings(
  eventId: string
) {
  const q = query(
    collection(
      db,
      'events',
      eventId,
      'bookings'
    ),
    orderBy('createdAt', 'desc')
  );

  const snap = await getDocs(q);

  return snap.docs.map(
    (d) =>
      ({
        id: d.id,
        ...(d.data() as any),
      } as BookingWithId)
  );
}

/* ============================================================
   GET BOOKING BY DOCUMENT ID
============================================================ */

export async function getBookingForAdmin(
  eventId: string,
  ticketId: string
) {
  const snap = await getDoc(
    doc(
      db,
      'events',
      eventId,
      'bookings',
      ticketId
    )
  );

  if (!snap.exists()) {
    return null;
  }

  return {
    id: snap.id,
    ...(snap.data() as any),
  } as BookingWithId;
}

/* ============================================================
   FIND BOOKING BY ID OR VISIBLE TICKET NUMBER
============================================================ */

export async function findBookingForAdmin(
  eventId: string,
  ticketValue: string
) {
  const value =
    ticketValue.trim();

  if (!value) {
    return null;
  }

  // First try as Firestore booking document ID.
  const directSnap = await getDoc(
    doc(
      db,
      'events',
      eventId,
      'bookings',
      value
    )
  );

  if (directSnap.exists()) {
    return {
      id: directSnap.id,
      ...(directSnap.data() as any),
    } as BookingWithId;
  }

  // Otherwise search using visible ticket number.
  const code =
    value.toUpperCase();

  const q = query(
    collection(
      db,
      'events',
      eventId,
      'bookings'
    ),
    where(
      'bookingCode',
      '==',
      code
    ),
    limit(1)
  );

  const snap =
    await getDocs(q);

  if (snap.empty) {
    return null;
  }

  const bookingDoc =
    snap.docs[0];

  return {
    id: bookingDoc.id,
    ...(bookingDoc.data() as any),
  } as BookingWithId;
}

/* ============================================================
   CHECK IN
============================================================ */

export async function checkInTicket(
  eventId: string,
  ticketId: string
) {
  if (
    !auth.currentUser ||
    auth.currentUser.isAnonymous
  ) {
    throw new Error(
      'Admin authentication required.'
    );
  }

  const eventRef = doc(
    db,
    'events',
    eventId
  );

  const bookingRef = doc(
    db,
    'events',
    eventId,
    'bookings',
    ticketId
  );

  const ticketRef = doc(
    db,
    'events',
    eventId,
    'tickets',
    ticketId
  );

  await runTransaction(db, async (tx) => {
    const eventSnap =
      await tx.get(eventRef);

    const bookingSnap =
      await tx.get(bookingRef);

    const ticketSnap =
      await tx.get(ticketRef);

    if (
      !eventSnap.exists() ||
      !bookingSnap.exists() ||
      !ticketSnap.exists()
    ) {
      throw new Error(
        'Ticket could not be verified.'
      );
    }

    const event =
      eventSnap.data() as EventDoc;

    const booking =
      bookingSnap.data() as any;

    if (booking.status !== 'confirmed') {
      throw new Error(
        'This ticket is not active.'
      );
    }

    if (booking.checkedIn) {
      throw new Error(
        'This ticket has already been checked in.'
      );
    }

    tx.update(bookingRef, {
      checkedIn: true,
      checkedInAt: serverTimestamp(),
      checkedInBy: auth.currentUser!.uid,
      updatedAt: serverTimestamp(),
    });

    tx.update(ticketRef, {
      checkedIn: true,
      checkedInAt: serverTimestamp(),
    });

    tx.update(eventRef, {
      checkedIn: Math.min(
        event.reserved,
        (event.checkedIn || 0) +
          booking.quantity
      ),

      updatedAt:
        serverTimestamp(),
    });
  });
}