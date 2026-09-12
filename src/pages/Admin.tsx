import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { checkInBooking, ensureAdminProfile, initializeEvent, saveEventSettings } from '../lib/booking';
import { EVENT_DEFAULTS, EVENT_ID, formatDateLabel, formatTimeRange } from '../lib/event';
import type { BookingDoc, EventDoc } from '../lib/types';

const defaultForm = {
  title: EVENT_DEFAULTS.title,
  organizer: EVENT_DEFAULTS.organizer,
  eventDate: EVENT_DEFAULTS.eventDate,
  startTime: EVENT_DEFAULTS.startTime,
  endTime: EVENT_DEFAULTS.endTime,
  venue: EVENT_DEFAULTS.venue,
  venueNote: EVENT_DEFAULTS.venueNote,
  musicBy: EVENT_DEFAULTS.musicBy,
  capacity: EVENT_DEFAULTS.capacity,
  maxTicketsPerBooking: EVENT_DEFAULTS.maxTicketsPerBooking,
  bookingOpen: true,
};

export default function Admin() {
  const [user, setUser] = useState(auth.currentUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [bookings, setBookings] = useState<(BookingDoc & { id: string })[]>([]);
  const [saving, setSaving] = useState(false);
  const [eventForm, setEventForm] = useState(defaultForm);

  useEffect(() => auth.onAuthStateChanged(setUser), []);

  useEffect(() => {
    if (!user || user.isAnonymous) return;

    let unsubEvent = () => {};
    let unsubBookings = () => {};

    ensureAdminProfile()
      .then(() => {
        unsubEvent = onSnapshot(
          doc(db, 'events', EVENT_ID),
          (s) => setEvent(s.exists() ? (s.data() as EventDoc) : null),
          (err) => setError(err.code === 'permission-denied' ? 'Publish firestore.rules in Firebase Console, then refresh.' : err.message)
        );
        const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
        unsubBookings = onSnapshot(
          q,
          (s) => setBookings(s.docs.map((d) => ({ id: d.id, ...(d.data() as BookingDoc) }))),
          (err) => setError(err.code === 'permission-denied' ? 'Admin bookings access is blocked by Firestore rules.' : err.message)
        );
      })
      .catch((err: any) => setError(err?.message || 'Failed to prepare admin profile.'));

    return () => {
      unsubEvent();
      unsubBookings();
    };
  }, [user]);

  useEffect(() => {
    if (!event) return;
    setEventForm({
      title: event.title,
      organizer: event.organizer,
      eventDate: event.eventDate,
      startTime: event.startTime,
      endTime: event.endTime,
      venue: event.venue,
      venueNote: event.venueNote,
      musicBy: event.musicBy,
      capacity: Number(event.capacity),
      maxTicketsPerBooking: Number(event.maxTicketsPerBooking ?? EVENT_DEFAULTS.maxTicketsPerBooking),
      bookingOpen: Boolean(event.bookingOpen),
    });
  }, [event]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err?.code === 'auth/invalid-credential' ? 'Login failed. Check your email and password.' : (err?.message || 'Login failed.'));
    }
  }

  const checkedIn = useMemo(() => bookings.filter(b=>b.checkedIn).reduce((n,b)=>n+Number(b.quantity||0),0), [bookings]);
  const reserved = event?.reserved ?? bookings.filter(b=>b.status==='confirmed').reduce((n,b)=>n+Number(b.quantity||0),0);
  const capacity = event?.capacity ?? 0;

  async function handleInitialize() {
    setSuccess('');
    setError('');
    try {
      await initializeEvent();
      setSuccess('Event initialized successfully. You can now adjust settings below.');
    } catch (err: any) {
      setError(err?.message || 'Failed to initialize event.');
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await saveEventSettings({
        ...eventForm,
        capacity: Number(eventForm.capacity),
        maxTicketsPerBooking: Number(eventForm.maxTicketsPerBooking),
      });
      setSuccess('Event settings saved. Slot control is now updated live for new bookings.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save event settings.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckIn(id: string) {
    try {
      await checkInBooking(id);
    } catch (err: any) {
      setError(err?.message || 'Failed to check in guest.');
    }
  }

  if (!user || user.isAnonymous) {
    return <section className="form-section section"><div className="form-intro"><p className="eyebrow">ADMIN</p><h1>Event management</h1><p>Use your Firebase Email/Password account to manage slots, bookings, and ticket verification.</p></div><form className="booking-form" onSubmit={login}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} /></label>{error&&<div className="error-box">{error}</div>}<button className="button primary full">Sign In</button></form></section>;
  }

  return <section className="admin-section section">
    <div className="admin-head">
      <div>
        <p className="eyebrow">ADMIN DASHBOARD</p>
        <h1>Manage the event</h1>
        <p className="admin-sub">Update event capacity, close or open bookings, and verify guests by QR scanner.</p>
      </div>
      <div className="admin-actions-top">
        <Link className="button ghost" to="/scanner">Open Scanner</Link>
        <button className="button ghost" onClick={()=>signOut(auth)}>Sign Out</button>
      </div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    {!event && <div className="setup-box"><p>The event document has not been created yet.</p><button className="button primary" onClick={handleInitialize}>Initialize Event</button></div>}

    <div className="stats-grid">
      <article><span>Capacity</span><strong>{capacity}</strong></article>
      <article><span>Reserved</span><strong>{reserved}</strong></article>
      <article><span>Available</span><strong>{Math.max(capacity-reserved,0)}</strong></article>
      <article><span>Checked In</span><strong>{checkedIn}</strong></article>
    </div>

    <div className="admin-grid">
      <form className="booking-form settings-form" onSubmit={handleSaveSettings}>
        <div className="form-title-row"><h2>Event Settings</h2><span>{event ? 'Live updates enabled' : 'Create event first'}</span></div>
        <label>Event Title<input value={eventForm.title} onChange={e=>setEventForm({...eventForm,title:e.target.value})} /></label>
        <label>Organizer<input value={eventForm.organizer} onChange={e=>setEventForm({...eventForm,organizer:e.target.value})} /></label>
        <div className="two-cols">
          <label>Event Date<input type="date" value={eventForm.eventDate} onChange={e=>setEventForm({...eventForm,eventDate:e.target.value})} /></label>
          <label>Music By<input value={eventForm.musicBy} onChange={e=>setEventForm({...eventForm,musicBy:e.target.value})} /></label>
        </div>
        <div className="two-cols">
          <label>Start Time<input type="time" value={eventForm.startTime} onChange={e=>setEventForm({...eventForm,startTime:e.target.value})} /></label>
          <label>End Time<input type="time" value={eventForm.endTime} onChange={e=>setEventForm({...eventForm,endTime:e.target.value})} /></label>
        </div>
        <label>Venue<input value={eventForm.venue} onChange={e=>setEventForm({...eventForm,venue:e.target.value})} /></label>
        <label>Venue Note<input value={eventForm.venueNote} onChange={e=>setEventForm({...eventForm,venueNote:e.target.value})} /></label>
        <div className="two-cols">
          <label>Total Slots<input type="number" min={1} value={eventForm.capacity} onChange={e=>setEventForm({...eventForm,capacity:Number(e.target.value)})} /></label>
          <label>Max Tickets Per Booking<input type="number" min={1} max={10} value={eventForm.maxTicketsPerBooking} onChange={e=>setEventForm({...eventForm,maxTicketsPerBooking:Number(e.target.value)})} /></label>
        </div>
        <label className="switch-row"><input type="checkbox" checked={eventForm.bookingOpen} onChange={e=>setEventForm({...eventForm,bookingOpen:e.target.checked})} /><span>Allow bookings</span></label>
        <button className="button primary full" disabled={saving}>{saving ? 'Saving…' : 'Save Event Settings'}</button>
      </form>

      <div className="admin-card notice-card">
        <h2>Quick Event View</h2>
        <ul>
          <li><strong>Event:</strong> {event?.title ?? EVENT_DEFAULTS.title}</li>
          <li><strong>Date:</strong> {event ? formatDateLabel(event.eventDate) : EVENT_DEFAULTS.dateLabel}</li>
          <li><strong>Time:</strong> {event ? formatTimeRange(event.startTime, event.endTime) : EVENT_DEFAULTS.timeLabel}</li>
          <li><strong>Venue:</strong> {event?.venue ?? EVENT_DEFAULTS.venue}</li>
          <li><strong>Status:</strong> {event?.bookingOpen ? 'Bookings open' : 'Bookings closed'}</li>
        </ul>
        <p>If slots are exhausted, the booking page automatically notifies guests that the event is fully booked.</p>
        <Link className="button ghost full" to="/scanner">Go to QR Ticket Scanner</Link>
      </div>
    </div>

    <div className="table-wrap">
      <table>
        <thead><tr><th>Guest</th><th>Phone</th><th>Qty</th><th>Ticket</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {bookings.length === 0 ? (
            <tr><td colSpan={6}>No bookings yet.</td></tr>
          ) : bookings.map(b=><tr key={b.id}><td>{b.fullName}</td><td>{b.phone}</td><td>{b.quantity}</td><td>{b.bookingCode}</td><td>{b.checkedIn?'Checked in':'Confirmed'}</td><td>{!b.checkedIn&&<button className="mini-button" onClick={()=>handleCheckIn(b.id)}>Check In</button>}</td></tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}
