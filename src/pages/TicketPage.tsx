import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { doc, getDoc } from 'firebase/firestore';
import { Download, Printer } from 'lucide-react';
import { getBooking } from '../lib/booking';
import { db } from '../lib/firebase';
import { EVENT_DEFAULTS, EVENT_ID, formatDateLabel, formatTimeRange } from '../lib/event';
import type { BookingDoc, EventDoc } from '../lib/types';
import { downloadTicketPdf } from '../lib/ticket';

export default function TicketPage() {
  const { id = '' } = useParams();
  const [booking, setBooking] = useState<(BookingDoc & { id: string }) | null>(null);
  const [event, setEvent] = useState<EventDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    Promise.all([
      getBooking(id),
      getDoc(doc(db, 'events', EVENT_ID)).then((snap) => snap.exists() ? (snap.data() as EventDoc) : null),
    ]).then(([bookingDoc, eventDoc]) => {
      setBooking(bookingDoc);
      setEvent(eventDoc);
    }).finally(() => setLoading(false));
  }, [id]);

  const currentEvent = event ?? {
    ...EVENT_DEFAULTS,
    reserved: 0,
  } as unknown as EventDoc;

  const qrValue = useMemo(
    () => JSON.stringify({ bookingId: id, bookingCode: booking?.bookingCode, eventId: booking?.eventId }),
    [id, booking]
  );

  async function handleDownloadPdf() {
    if (!booking || !currentEvent) return;
    setDownloading(true);
    try {
      await downloadTicketPdf(booking, currentEvent, id);
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <section className="section"><p>Loading ticket…</p></section>;
  if (!booking) return <section className="section"><h1>Ticket not found</h1><Link to="/book">Make a booking</Link></section>;

  return (
    <section className="ticket-section section">
      <div className="ticket-card enhanced">
        <div className="ticket-poster-side">
          <img src="/poster.png" alt="Event poster" />
        </div>
        <div className="ticket-main-side">
          <div className="ticket-top">
            <div className="ticket-brand-row">
              <img src="/logo.png" alt="Marafiki Muziki" />
              <div>
                <p>MARAFIKI MUZIKI</p>
                <small>A Band That Brings You Home</small>
              </div>
            </div>
            <h1>THE LIVING ROOM <em>Vibe</em></h1>
          </div>
          <div className="ticket-body">
            <div>
              <span>Guest</span><strong>{booking.fullName}</strong>
              <span>Date</span><strong>{formatDateLabel(currentEvent.eventDate)}</strong>
              <span>Time</span><strong>{formatTimeRange(currentEvent.startTime, currentEvent.endTime)}</strong>
              <span>Venue</span><strong>{currentEvent.venue}</strong>
              <span>Location Note</span><strong>{currentEvent.venueNote}</strong>
              <span>Admit</span><strong>{booking.quantity}</strong>
              <span>Ticket</span><strong>{booking.bookingCode}</strong>
            </div>
            <div className="qr-box">
              <QRCodeSVG value={qrValue} size={180} level="H" includeMargin />
              <small>Present this QR code at the entrance.</small>
            </div>
          </div>
          <div className="ticket-status">{booking.checkedIn ? 'CHECKED IN' : 'CONFIRMED • ENTRY FREE'}</div>
        </div>
      </div>
      <div className="ticket-actions-row">
        <button className="button primary" onClick={handleDownloadPdf} disabled={downloading}><Download size={18}/> {downloading ? 'Preparing PDF…' : 'Download Ticket PDF'}</button>
        <button className="button ghost" onClick={()=>window.print()}><Printer size={18}/> Print Ticket</button>
      </div>
    </section>
  );
}
