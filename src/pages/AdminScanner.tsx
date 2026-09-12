import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, CheckCircle2, QrCode, Search, ShieldCheck, XCircle } from 'lucide-react';
import { checkInTicket, getBookingForAdmin, getEvent, getPublicTicket } from '../lib/data';
import type { BookingWithId, EventWithId } from '../lib/types';

export default function AdminScanner(){
  const {eventId=''}=useParams(); const [event,setEvent]=useState<EventWithId|null>(null); const [booking,setBooking]=useState<BookingWithId|null>(null); const [message,setMessage]=useState('Point the camera at a Marafiki Muziki ticket QR code.'); const [manual,setManual]=useState(''); const [running,setRunning]=useState(false); const [error,setError]=useState('');
  const videoRef=useRef<HTMLVideoElement|null>(null); const streamRef=useRef<MediaStream|null>(null); const rafRef=useRef<number|null>(null); const busyRef=useRef(false);

  useEffect(()=>{getEvent(eventId).then(setEvent);return stopCamera;},[eventId]);

  function stopCamera(){if(rafRef.current)cancelAnimationFrame(rafRef.current);streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setRunning(false)}

  async function resolve(value:string){
    if(busyRef.current)return; busyRef.current=true; setError(''); setMessage('Verifying ticket…');
    try{
      let scannedEventId=eventId; let ticketId='';
      try{const url=new URL(value);const parts=url.pathname.split('/').filter(Boolean);const idx=parts.indexOf('ticket');if(idx>=0){scannedEventId=parts[idx+1]||eventId;ticketId=parts[idx+2]||'';}}catch{ticketId=value.trim();}
      if(scannedEventId!==eventId)throw new Error('This ticket belongs to a different event.');
      if(!ticketId)throw new Error('Ticket ID was not found in this QR code.');
      const [publicTicket,privateBooking]=await Promise.all([getPublicTicket(eventId,ticketId),getBookingForAdmin(eventId,ticketId)]);
      if(!publicTicket||!privateBooking)throw new Error('Ticket not found.');
      setBooking(privateBooking);setMessage(privateBooking.checkedIn?'This ticket has already been checked in.':'Valid ticket. Confirm check-in below.');
    }catch(err:any){setBooking(null);setError(err?.message||'Unable to verify ticket.');setMessage('Scan another ticket or use manual lookup.');}
    finally{setTimeout(()=>{busyRef.current=false},700)}
  }

  async function startCamera(){
    setError('');
    const Detector=(window as any).BarcodeDetector;
    if(!Detector){setError('Live QR detection is not supported by this browser. Use Chrome/Edge on a recent phone, or use manual ticket ID lookup below.');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}}); streamRef.current=stream; if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();}
      const detector=new Detector({formats:['qr_code']}); setRunning(true);
      const scan=async()=>{if(!videoRef.current||!streamRef.current)return;try{const codes=await detector.detect(videoRef.current);if(codes?.[0]?.rawValue)await resolve(codes[0].rawValue);}catch{}rafRef.current=requestAnimationFrame(scan)};scan();
    }catch(err:any){setError(err?.message||'Unable to access camera. Check browser camera permissions.');}
  }

  async function confirm(){if(!booking)return;try{await checkInTicket(eventId,booking.id);setBooking({...booking,checkedIn:true});setMessage('Guest checked in successfully.');}catch(err:any){setError(err?.message||'Unable to complete check-in.');}}

  return <>
    <div className="admin-page-head"><div><Link className="back-link" to={`/admin/events/${eventId}`}><ArrowLeft size={17}/> Event control</Link><span className="section-tag">ADMIN ONLY</span><h1>Ticket scanner</h1><p>{event?.title||'Event'} • Secure attendance verification</p></div></div>
    <div className="scanner-admin-grid">
      <section className="admin-panel live-scanner-panel"><div className="panel-heading"><div><h2><Camera size={20}/> Live scanner</h2><p>Camera scanning never appears on the public website.</p></div></div><div className="camera-shell"><video ref={videoRef} muted playsInline/><div className="scan-frame"><span/><span/><span/><span/></div>{!running&&<div className="camera-placeholder"><QrCode size={62}/><p>Camera is off</p></div>}</div><div className="scanner-controls">{running?<button className="button glass full" onClick={stopCamera}>Stop Camera</button>:<button className="button primary full" onClick={startCamera}>Start QR Camera</button>}</div><p className="scanner-message"><ShieldCheck size={18}/>{message}</p>{error&&<div className="error-box">{error}</div>}<div className="manual-ticket-search"><label>Manual ticket ID<input value={manual} onChange={e=>setManual(e.target.value)} placeholder="Paste ticket ID from the QR URL"/></label><button className="button glass" onClick={()=>resolve(manual)} disabled={!manual.trim()}><Search size={17}/> Verify</button></div></section>
      <section className="admin-panel verification-panel"><div className="panel-heading"><div><h2>Verification result</h2><p>Confirm guest identity before admitting.</p></div></div>{!booking?<div className="verify-empty"><QrCode/><h3>Waiting for a ticket</h3><p>Scan a QR code or search by ticket ID.</p></div>:<div className="verified-ticket"><div className={booking.checkedIn?'verify-icon checked':'verify-icon'}>{booking.checkedIn?<CheckCircle2/>:<ShieldCheck/>}</div><span className={booking.checkedIn?'table-status checked':'table-status'}>{booking.checkedIn?'Already checked in':'Valid ticket'}</span><h2>{booking.fullName}</h2><div className="verify-details"><span>Ticket<strong>{booking.bookingCode}</strong></span><span>Phone<strong>{booking.phone}</strong></span><span>Admit<strong>{booking.quantity}</strong></span><span>Status<strong>{booking.status}</strong></span></div>{booking.status!=='confirmed'?<div className="error-box"><XCircle size={18}/> Ticket is not active.</div>:booking.checkedIn?<div className="success-box">This ticket has already been used for entry.</div>:<button className="button primary full" onClick={confirm}><CheckCircle2 size={18}/> Confirm Check-in</button>}</div>}</section>
    </div>
  </>
}
