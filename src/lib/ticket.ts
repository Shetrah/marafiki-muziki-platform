import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import type { BookingDoc, EventDoc } from './types';
import { formatDateLabel, formatTimeRange } from './event';

async function loadImageAsDataURL(src: string): Promise<string> {
  const response = await fetch(src);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function downloadTicketPdf(booking: BookingDoc & { id?: string }, event: EventDoc, bookingId: string) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  const orange = [255, 114, 0] as const;
  const black = [8, 8, 8] as const;

  const [poster, logo, qrDataUrl] = await Promise.all([
    loadImageAsDataURL('/poster.png'),
    loadImageAsDataURL('/logo.png'),
    QRCode.toDataURL(JSON.stringify({ bookingId, bookingCode: booking.bookingCode, eventId: booking.eventId }), {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 300,
    }),
  ]);

  // Poster zone
  pdf.setFillColor(...black);
  pdf.rect(0, 0, pageW, 118, 'F');
  pdf.addImage(poster, 'PNG', 10, 10, 190, 98, undefined, 'FAST');

  // Receipt card
  pdf.setFillColor(247, 247, 247);
  pdf.roundedRect(10, 112, 190, 170, 6, 6, 'F');

  pdf.addImage(logo, 'PNG', 15, 118, 28, 28, undefined, 'FAST');
  pdf.setTextColor(...black);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text('MARAFIKI MUZIKI', 48, 128);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('A Band That Brings You Home', 48, 134);

  pdf.setDrawColor(...orange);
  pdf.setLineWidth(0.9);
  pdf.line(15, 148, 195, 148);

  pdf.setTextColor(...orange);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('EVENT E-TICKET / RECEIPT', 15, 158);
  pdf.setTextColor(...black);

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Receipt No: ${booking.bookingCode}`, 15, 166);
  pdf.text(`Status: ${booking.checkedIn ? 'CHECKED IN' : 'CONFIRMED'}`, 80, 166);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, 135, 166, { align: 'right' });

  const labelX = 15;
  const valueX = 58;
  let y = 178;
  const rowGap = 12;

  const rows: [string, string][] = [
    ['Guest Name', booking.fullName],
    ['Phone', booking.phone],
    ['Email', booking.email],
    ['Event', event.title],
    ['Date', formatDateLabel(event.eventDate)],
    ['Time', formatTimeRange(event.startTime, event.endTime)],
    ['Venue', `${event.venue} (${event.venueNote})`],
    ['Music By', event.musicBy],
    ['Admit', `${booking.quantity} guest${booking.quantity > 1 ? 's' : ''}`],
    ['Entry Fee', 'FREE'],
  ];

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  rows.forEach(([label, value]) => {
    pdf.setTextColor(70, 70, 70);
    pdf.text(label, labelX, y);
    pdf.setTextColor(...black);
    pdf.setFont('helvetica', 'bold');
    const lines = pdf.splitTextToSize(value, 80);
    pdf.text(lines, valueX, y);
    y += rowGap + (lines.length - 1) * 4;
    pdf.setFont('helvetica', 'bold');
  });

  pdf.addImage(qrDataUrl, 'PNG', 145, 178, 45, 45, undefined, 'FAST');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Scan to verify at entry', 167.5, 228, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text('Please keep this ticket safe and present it', 167.5, 234, { align: 'center' });
  pdf.text('with the QR code at the entrance.', 167.5, 238, { align: 'center' });

  pdf.setDrawColor(210, 210, 210);
  pdf.setLineDashPattern([1.2, 1.2], 0);
  pdf.line(15, 246, 195, 246);
  pdf.setLineDashPattern([], 0);

  pdf.setTextColor(...orange);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('THANK YOU FOR BOOKING YOUR SPACE', 15, 255);
  pdf.setTextColor(...black);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('This e-ticket acts as your reservation receipt. Admission remains subject to ticket verification.', 15, 261);
  pdf.text('Need help? RSVP: 0791236269 / 0713820265', 15, 267);

  pdf.save(`${booking.bookingCode}-ticket.pdf`);
}
