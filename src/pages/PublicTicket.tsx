import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download, MapPin, Music2, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getEvent, getPublicTicket } from '../lib/data';
import { formatDate, formatTimeRange } from '../lib/format';
import type { EventWithId, PublicTicketWithId } from '../lib/types';
import { downloadTicketPdf } from '../lib/ticketPdf';

export default function PublicTicket() {
  const { eventId='', ticketId='' } = useParams();
  const [event,setEvent] = useState<EventWithId|null>(null);
  const [ticket,setTicket] = useState<PublicTicketWithId|null>(null);
  const [loading,setLoading] = useState(true);
  const [downloading,setDownloading] = useState(false);

  useEffect(()=>{
    Promise.all([getEvent(eventId),getPublicTicket(eventId,ticketId)]).then(([e,t])=>{setEvent(e);setTicket(t)}).finally(()=>setLoading(false));
  },[eventId,ticketId]);

  if (loading) return <div className="center-screen">Opening your ticket…</div>;
  if (!event || !ticket) return <div className="center-screen">Ticket not found or no longer available.</div>;

  const ticketUrl = window.location.href;
  async function download(){setDownloading(true);try{await downloadTicketPdf(event,ticket,'public-ticket-qr')}finally{setDownloading(false)}}

  return <section className="public-ticket-page" style={{'--ticket-poster':`url(${event.posterUrl || '/poster.png'})`} as CSSProperties}>
    <div className="ticket-theme-backdrop"/>
    <div className="public-ticket-wrap">
      <div className="ticket-poster-panel"><img src={event.posterUrl || '/poster.png'} alt={event.title}/><span>OFFICIAL E-TICKET</span></div>
      <div className="ticket-info-panel">
        <div className="ticket-logo-row"><img src="/logo.png"/><div><strong>MARAFIKI MUZIKI</strong><span>A Band That Brings You Home</span></div></div>
        <span className="section-tag">YOUR SPACE IS RESERVED</span><h1>{event.title}</h1>
        <div className="public-ticket-details"><div><span>Guest</span><strong>{ticket.guestName}</strong></div><div><span>Ticket</span><strong>{ticket.ticketCode}</strong></div><div><span>Date</span><strong>{formatDate(event.eventDate)}</strong></div><div><span>Time</span><strong>{formatTimeRange(event.startTime,event.endTime)}</strong></div><div><span>Venue</span><strong>{event.venue}</strong></div><div><span>Admit</span><strong>{ticket.quantity}</strong></div></div>
        <div id="public-ticket-qr" className="ticket-qr-public"><QRCodeSVG value={ticketUrl} size={210} level="H" includeMargin/><div><strong>SCAN TO VERIFY</strong><span>Admin will scan this code at the entrance.</span></div></div>
        <div className={ticket.checkedIn ? 'ticket-state checked' : 'ticket-state'}><CheckCircle2/><span>{ticket.checkedIn ? 'Checked in successfully' : ticket.status === 'confirmed' ? 'Confirmed • Entry Free' : 'Ticket inactive'}</span></div>
        <button className="button primary full" onClick={download} disabled={downloading}><Download size={19}/>{downloading?'Preparing PDF…':'Download Ticket PDF'}</button>
        <div className="ticket-bottom-notes"><span><MapPin/> {event.venueNote}</span><span><Music2/> Music by {event.musicBy}</span><span><ShieldCheck/> Secure QR verification</span></div>
      </div>
    </div>
  </section>;
}
