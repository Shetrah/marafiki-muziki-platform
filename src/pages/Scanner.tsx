import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, ScanLine } from 'lucide-react';
import { auth } from '../lib/firebase';
import { checkInBooking, findBookingByCode, getBooking } from '../lib/booking';
import type { BookingDoc } from '../lib/types';

export default function Scanner() {
  const [user, setUser] = useState(auth.currentUser);
  const [status, setStatus] = useState('Ready to scan a QR ticket.');
  const [booking, setBooking] = useState<(BookingDoc & { id: string }) | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [scannerReady, setScannerReady] = useState(false);
  const scannerRef = useRef<any>(null);
  const scannerId = 'ticket-qr-reader';

  useEffect(() => auth.onAuthStateChanged(setUser), []);

  async function resolveScan(decodedText: string) {
    try {
      let bookingId = '';
      let bookingCode = '';
      try {
        const parsed = JSON.parse(decodedText);
        bookingId = parsed.bookingId || '';
        bookingCode = parsed.bookingCode || '';
      } catch {
        bookingCode = decodedText.trim();
      }

      const result = bookingId ? await getBooking(bookingId) : await findBookingByCode(bookingCode);
      if (!result) {
        setStatus('Ticket not found.');
        setBooking(null);
        return;
      }
      setBooking(result);
      setStatus(result.checkedIn ? 'Ticket already checked in.' : 'Valid ticket found. You can now check in this guest.');
    } catch (err: any) {
      setStatus(err?.message || 'Unable to verify this QR code.');
    }
  }

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    let mounted = true;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted) return;
        const scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;
        const cameras = await Html5Qrcode.getCameras();
        const cameraId = cameras[0]?.id;
        if (!cameraId) {
          setStatus('No camera detected. Use manual ticket code input below.');
          return;
        }
        await scanner.start(
          cameraId,
          { fps: 10, qrbox: { width: 220, height: 220 } },
          async (decodedText: string) => {
            setStatus('QR code detected. Verifying ticket...');
            await resolveScan(decodedText);
          },
          () => {}
        );
        setScannerReady(true);
      } catch (err: any) {
        setStatus(err?.message || 'Unable to start QR scanner. Check camera permissions.');
      }
    })();

    return () => {
      mounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {}).finally(() => {
          scannerRef.current?.clear?.().catch?.(() => {});
        });
      }
    };
  }, [user]);

  async function handleCheckIn() {
    if (!booking) return;
    await checkInBooking(booking.id);
    setBooking({ ...booking, checkedIn: true });
    setStatus('Guest checked in successfully.');
  }

  const badge = useMemo(() => booking?.checkedIn ? 'Already Checked In' : 'Ready For Check-in', [booking]);

  if (!user || user.isAnonymous) {
    return <section className="section"><div className="admin-card scanner-card"><h1>Admin scanner</h1><p>Please sign in as admin first to scan and verify tickets.</p><Link className="button primary" to="/admin">Go to Admin Login</Link></div></section>;
  }

  return (
    <section className="section scanner-page">
      <div className="admin-head scanner-head">
        <div>
          <p className="eyebrow">QR TICKET VERIFICATION</p>
          <h1>Scanner</h1>
          <p className="admin-sub">Scan the guest QR code, verify the ticket details, then check in the guest instantly.</p>
        </div>
        <Link className="button ghost" to="/admin">Back to Admin</Link>
      </div>

      <div className="scanner-grid">
        <div className="admin-card scanner-card">
          <div className="scanner-title"><Camera size={20} /> Live Camera Scanner</div>
          <div id={scannerId} className="qr-reader-box"></div>
          <p className="scanner-status"><ScanLine size={18}/> {scannerReady ? status : status}</p>
          <div className="manual-verify">
            <label>Manual ticket code lookup
              <input value={manualCode} onChange={e=>setManualCode(e.target.value)} placeholder="e.g. LRV-ABCDEFGH" />
            </label>
            <button className="button primary full" onClick={()=>resolveScan(manualCode)} disabled={!manualCode.trim()}>Find Ticket</button>
          </div>
        </div>

        <div className="admin-card scanner-result-card">
          <div className="result-head"><CheckCircle2 size={22} /> Verification Result</div>
          {!booking ? <p>No ticket verified yet. Scan a QR code or enter the ticket code manually.</p> : (
            <>
              <span className={`status-pill ${booking.checkedIn ? 'checked' : ''}`}>{badge}</span>
              <ul className="result-list">
                <li><strong>Guest:</strong> {booking.fullName}</li>
                <li><strong>Phone:</strong> {booking.phone}</li>
                <li><strong>Ticket:</strong> {booking.bookingCode}</li>
                <li><strong>Admit:</strong> {booking.quantity}</li>
                <li><strong>Status:</strong> {booking.checkedIn ? 'Checked In' : 'Confirmed'}</li>
              </ul>
              {!booking.checkedIn && <button className="button primary full" onClick={handleCheckIn}>Confirm Check-in</button>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
