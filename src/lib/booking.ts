import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db } from './firebase';
import { EVENT_ID, getDefaultEventPayload } from './event';
import type { BookingDoc, EventDoc } from './types';

export async function ensureAnonymousUser() {
  if (auth.currentUser?.isAnonymous) return auth.currentUser;
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    throw new Error('Please sign out of the admin account before making a guest booking.');
  }
  try {
    const credential = await signInAnonymously(auth);
    return credential.user;
  } catch (error: any) {
    if (error?.code === 'auth/admin-restricted-operation' || error?.code === 'auth/operation-not-allowed') {
      throw new Error('Anonymous booking is not enabled yet. In Firebase Console, enable Authentication > Sign-in method > Anonymous.');
    }
    throw error;
  }
}

export async function createBooking(input: {
  fullName: string;
  phone: string;
  email: string;
  quantity: number;
}) {
  const user = await ensureAnonymousUser();
  const eventRef = doc(db, 'events', EVENT_ID);
  const bookingId = `${EVENT_ID}_${user.uid}`;
  const bookingRef = doc(db, 'bookings', bookingId);
  const bookingCode = `LRV-${user.uid.slice(0, 8).toUpperCase()}`;

  await runTransaction(db, async (tx) => {
    const eventSnap = await tx.get(eventRef);
    const existingBooking = await tx.get(bookingRef);

    if (!eventSnap.exists()) throw new Error('Event has not been initialized yet.');
    if (existingBooking.exists()) {
      throw new Error('A booking already exists on this device. Open your existing ticket instead.');
    }

    const event = eventSnap.data() as EventDoc;
    const capacity = Number(event.capacity ?? 0);
    const reserved = Number(event.reserved ?? 0);
    const open = Boolean(event.bookingOpen);
    const maxTickets = Number(event.maxTicketsPerBooking ?? 1);

    if (!open) throw new Error('Bookings are currently closed.');
    if (input.quantity < 1 || input.quantity > maxTickets) {
      throw new Error(`You can reserve 1–${maxTickets} spaces.`);
    }
    if (reserved >= capacity) {
      throw new Error('Sorry, all available slots are already fully booked.');
    }
    if (reserved + input.quantity > capacity) {
      throw new Error(`Only ${Math.max(capacity - reserved, 0)} slot(s) are left.`);
    }

    tx.update(eventRef, {
      reserved: reserved + input.quantity,
      updatedAt: serverTimestamp(),
    });

    tx.set(bookingRef, {
      eventId: EVENT_ID,
      bookingCode,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim().toLowerCase(),
      quantity: input.quantity,
      status: 'confirmed',
      checkedIn: false,
      checkedInAt: null,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
    });
  });

  return { id: bookingRef.id, bookingCode };
}

export async function getBooking(id: string) {
  const snap = await getDoc(doc(db, 'bookings', id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as BookingDoc & { id: string }) : null;
}

export async function initializeEvent() {
  const ref = doc(db, 'events', EVENT_ID);
  const existing = await getDoc(ref);
  if (existing.exists()) return false;

  await setDoc(ref, {
    ...getDefaultEventPayload(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return true;
}

export async function saveEventSettings(payload: Partial<EventDoc>) {
  const ref = doc(db, 'events', EVENT_ID);
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    const base = getDefaultEventPayload();
    await setDoc(ref, {
      ...base,
      ...payload,
      reserved: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(ref, {
    ...payload,
    updatedAt: serverTimestamp(),
  });
}

export async function checkInBooking(id: string) {
  await updateDoc(doc(db, 'bookings', id), {
    checkedIn: true,
    checkedInAt: serverTimestamp(),
  });
}

export async function ensureAdminProfile() {
  if (!auth.currentUser || auth.currentUser.isAnonymous || !auth.currentUser.email) return;
  const adminRef = doc(db, 'admins', auth.currentUser.uid);
  const snap = await getDoc(adminRef);
  if (!snap.exists()) {
    await setDoc(adminRef, {
      name: auth.currentUser.email.split('@')[0],
      email: auth.currentUser.email,
      createdAt: serverTimestamp(),
    });
  }
}

export async function findBookingByCode(code: string) {
  const q = query(collection(db, 'bookings'), where('bookingCode', '==', code.trim()), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as BookingDoc & { id: string };
}
