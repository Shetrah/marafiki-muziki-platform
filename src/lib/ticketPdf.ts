import type { EventWithId, PublicTicketWithId } from './types';
import { formatDate, formatTimeRange } from './format';

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function svgToDataUrl(svg: SVGElement) {
  const xml = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concat(chunks: Uint8Array[]) {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => { out.set(chunk, offset); offset += chunk.length; });
  return out;
}

const enc = new TextEncoder();

function jpegToPdf(jpegBytes: Uint8Array, widthPx: number, heightPx: number) {
  const pageW = 420;
  const pageH = 595;
  const objects: Uint8Array[] = [];
  const offsets: number[] = [0];
  const header = enc.encode('%PDF-1.4\n%âãÏÓ\n');

  const addObject = (body: Uint8Array | string) => {
    const id = objects.length + 1;
    const b = typeof body === 'string' ? enc.encode(body) : body;
    objects.push(concat([enc.encode(`${id} 0 obj\n`), b, enc.encode('\nendobj\n')]));
    return id;
  };

  const catalog = addObject('<< /Type /Catalog /Pages 2 0 R >>');
  void catalog;
  addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);

  const imageHeader = enc.encode(`<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`);
  const imageFooter = enc.encode('\nendstream');
  addObject(concat([imageHeader, jpegBytes, imageFooter]));

  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ`;
  addObject(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

  let cursor = header.length;
  objects.forEach((obj) => { offsets.push(cursor); cursor += obj.length; });

  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return concat([header, ...objects, enc.encode(xref), enc.encode(trailer)]);
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export async function downloadTicketPdf(event: EventWithId, ticket: PublicTicketWithId, qrSvgId: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to prepare ticket PDF.');

  const qrSvg = document.getElementById(qrSvgId)?.querySelector('svg') as SVGElement | null;
  if (!qrSvg) throw new Error('QR code is still loading. Please try again.');

  const [poster, logo, qr] = await Promise.all([
    loadImage(event.posterUrl || '/poster.png'),
    loadImage('/logo.png'),
    loadImage(svgToDataUrl(qrSvg)),
  ]);

  ctx.fillStyle = '#070707';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawCover(ctx, poster, 0, 0, canvas.width, 650);

  const grad = ctx.createLinearGradient(0, 470, 0, 760);
  grad.addColorStop(0, 'rgba(7,7,7,0)');
  grad.addColorStop(1, '#070707');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 430, canvas.width, 340);

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(80, 610, 1080, 1010, 34);
  ctx.fill();

  ctx.drawImage(logo, 115, 660, 150, 150);
  ctx.fillStyle = '#0a0a0a';
  ctx.font = '700 48px Arial';
  ctx.fillText('MARAFIKI MUZIKI', 300, 710);
  ctx.font = '28px Arial';
  ctx.fillStyle = '#666';
  ctx.fillText('A Band That Brings You Home', 300, 755);

  ctx.fillStyle = '#ff7200';
  ctx.fillRect(115, 835, 1010, 8);
  ctx.font = '800 44px Arial';
  ctx.fillText('EVENT E-TICKET / RECEIPT', 115, 910);

  ctx.fillStyle = '#111';
  ctx.font = '800 34px Arial';
  ctx.fillText(event.title.toUpperCase(), 115, 980);
  ctx.font = '26px Arial';

  const rows: [string, string][] = [
    ['Guest', ticket.guestName],
    ['Ticket No.', ticket.ticketCode],
    ['Date', formatDate(event.eventDate)],
    ['Time', formatTimeRange(event.startTime, event.endTime)],
    ['Venue', event.venue],
    ['Admit', String(ticket.quantity)],
    ['Entry', 'FREE'],
  ];

  let y = 1050;
  rows.forEach(([label, value]) => {
    ctx.fillStyle = '#777';
    ctx.font = '600 23px Arial';
    ctx.fillText(label.toUpperCase(), 115, y);
    ctx.fillStyle = '#111';
    ctx.font = '700 29px Arial';
    ctx.fillText(value, 330, y);
    y += 72;
  });

  ctx.fillStyle = '#fff';
  ctx.fillRect(790, 1040, 290, 290);
  ctx.drawImage(qr, 810, 1060, 250, 250);
  ctx.fillStyle = '#111';
  ctx.font = '700 22px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN TO VERIFY', 935, 1370);
  ctx.font = '20px Arial';
  ctx.fillStyle = '#666';
  ctx.fillText('Present this QR at the entrance', 935, 1405);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#ff7200';
  ctx.beginPath();
  ctx.roundRect(115, 1490, 1010, 78, 18);
  ctx.fill();
  ctx.fillStyle = '#080808';
  ctx.font = '800 27px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(ticket.checkedIn ? 'CHECKED IN' : 'CONFIRMED • ENTRY FREE', 620, 1540);
  ctx.textAlign = 'left';

  ctx.fillStyle = '#aaa';
  ctx.font = '20px Arial';
  ctx.fillText('This ticket is your reservation receipt. Keep it safe and present the QR code for verification.', 115, 1605);

  const jpegUrl = canvas.toDataURL('image/jpeg', 0.92);
  const pdfBytes = jpegToPdf(dataUrlToBytes(jpegUrl), canvas.width, canvas.height);
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ticket.ticketCode}-${event.slug || 'ticket'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
