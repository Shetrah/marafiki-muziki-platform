import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Clock3, MapPin, Music2, ShieldCheck, Ticket } from 'lucide-react';
import { createBooking, getEvent } from '../lib/data';
import { formatDate, formatTimeRange } from '../lib/format';
import type { EventWithId } from '../lib/types';

export default function EventDetails() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventWithId | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ fullName:'', phone:'', email:'', quantity:1 });

  useEffect(() => {
    getEvent(eventId).then(setEvent).catch((e)=>setError(e.message)).finally(()=>setLoading(false));
  }, [eventId]);

  const available = useMemo(() => event ? Math.max(event.capacity-event.reserved,0) : 0, [event]);
  const maxQty = event ? Math.max(1, Math.min(event.maxTicketsPerBooking, available || 1)) : 1;
  const soldOut = !!event && available <= 0;
  const canBook = !!event && event.status === 'published' && event.bookingOpen && !soldOut;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!event) return;
    setError(''); setSubmitting(true);
    try {
      const result = await createBooking(event.id, form);
      navigate(`/ticket/${event.id}/${result.ticketId}`);
    } catch (err:any) {
      setError(err?.message || 'Unable to complete this booking.');
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="center-screen">Loading event…</div>;
  if (!event) return <div className="center-screen">Event not found.</div>;

  return <>
    <section className="event-detail-hero">
      <div className="event-detail-bg" style={{backgroundImage:`linear-gradient(90deg,rgba(5,5,5,.98),rgba(5,5,5,.72),rgba(5,5,5,.2)),url(${event.posterUrl || '/poster.png'})`}}/>
      <div className="event-detail-copy"><span className="hero-kicker">MARAFIKI MUZIKI PRESENTS</span><h1>{event.title}</h1><p>{event.description}</p><div className="detail-meta"><span><CalendarDays/> {formatDate(event.eventDate)}</span><span><Clock3/> {formatTimeRange(event.startTime,event.endTime)}</span><span><MapPin/> {event.venue}</span><span><Music2/> {event.musicBy}</span></div></div>
    </section>

    <section className="booking-zone section-pad">
      <div className="booking-event-panel"><img src={event.posterUrl || '/poster.png'} alt={event.title}/><div className="slot-panel"><div><span>Capacity</span><strong>{event.capacity}</strong></div><div><span>Reserved</span><strong>{event.reserved}</strong></div><div><span>Available</span><strong>{available}</strong></div></div><div className="mini-meter"><i style={{width:`${Math.min(100,(event.reserved/Math.max(event.capacity,1))*100)}%`}}/></div><p>{event.venueNote}</p></div>
      <form className="booking-form big-booking-form" onSubmit={submit}>
        <span className="section-tag">FREE RESERVATION</span><h2>Book your space</h2><p>Your themed QR e-ticket is created immediately after booking.</p>
        <label>Full name<input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} placeholder="Your full name"/></label>
        <label>Phone number<input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="07xx xxx xxx"/></label>
        <label>Email address<input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="you@example.com"/></label>
        <label>Number of spaces<select value={form.quantity} disabled={!canBook} onChange={e=>setForm({...form,quantity:Number(e.target.value)})}>{Array.from({length:maxQty},(_,i)=>i+1).map(n=><option key={n}>{n}</option>)}</select></label>
        {soldOut && <div className="error-box">This event is fully booked. Please contact Marafiki Muziki if more spaces are released.</div>}
        {!event.bookingOpen && !soldOut && <div className="error-box">Online bookings are currently closed for this event.</div>}
        {error && <div className="error-box">{error}</div>}
        <button className="button primary full" disabled={!canBook || submitting}><Ticket size={19}/>{submitting ? 'Creating your ticket…' : 'Confirm Free Booking'}</button>
        <div className="safe-note"><ShieldCheck size={18}/><span>Your booking details are kept private. The public QR ticket only shows the information needed for entry verification.</span></div>
      </form>
    </section>
  </>;
}
