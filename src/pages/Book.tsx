import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { createBooking } from '../lib/booking';
import { db } from '../lib/firebase';
import { EVENT_ID, formatDateLabel, formatTimeRange } from '../lib/event';
import type { EventDoc } from '../lib/types';

export default function Book() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', quantity: 1 });

  useEffect(() => {
    return onSnapshot(
      doc(db, 'events', EVENT_ID),
      (snap) => setEvent(snap.exists() ? (snap.data() as EventDoc) : null),
      (err) => setError(err.code === 'permission-denied' ? 'Firestore rules are blocking reads. Publish the project firestore.rules in Firebase Console.' : err.message)
    );
  }, []);

  const available = useMemo(() => event ? Math.max(event.capacity - event.reserved, 0) : 0, [event]);
  const maxAllowed = useMemo(() => {
    if (!event) return 1;
    return Math.max(1, Math.min(event.maxTicketsPerBooking, available || event.maxTicketsPerBooking));
  }, [event, available]);

  useEffect(() => {
    if (form.quantity > maxAllowed) {
      setForm((prev) => ({ ...prev, quantity: maxAllowed }));
    }
  }, [form.quantity, maxAllowed]);

  const soldOut = !!event && available <= 0;
  const bookingClosed = !!event && !event.bookingOpen;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await createBooking(form);
      navigate(`/ticket/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="form-section section">
      <div className="form-intro">
        <p className="eyebrow">FREE RESERVATION</p>
        <h1>Book your space</h1>
        <p>Your QR ticket and downloadable PDF receipt will be generated immediately after a successful reservation.</p>
        {event && (
          <div className="booking-summary-card">
            <strong>{event.title}</strong>
            <span>{formatDateLabel(event.eventDate)}</span>
            <span>{formatTimeRange(event.startTime, event.endTime)}</span>
            <span>{event.venue}</span>
            <span className={soldOut ? 'status-pill soldout' : 'status-pill'}>
              {bookingClosed ? 'Bookings closed' : soldOut ? 'Sold out' : `${available} spaces remaining`}
            </span>
          </div>
        )}
      </div>

      <form className="booking-form" onSubmit={submit}>
        <label>Full name<input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} placeholder="Your full name" /></label>
        <label>Phone number<input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="07xx xxx xxx" /></label>
        <label>Email address<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com" /></label>
        <label>Number of spaces
          <select value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})} disabled={!event || soldOut || bookingClosed}>
            {Array.from({length: maxAllowed},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {soldOut && <div className="error-box">All available slots are already fully booked. Please contact the organizer in case more slots are added.</div>}
        {bookingClosed && !soldOut && <div className="error-box">The organizer has closed bookings for this event.</div>}
        {error && <div className="error-box">{error}</div>}
        <button className="button primary full" disabled={loading || !event || soldOut || bookingClosed}>{loading ? 'Reserving…' : 'Confirm Free Booking'}</button>
        <small>By booking, you agree that your reservation details may be used to manage event attendance.</small>
      </form>
    </section>
  );
}
