import type {
  EventWithId,
  PublicTicketWithId,
} from './types';

import {
  formatDate,
  formatTimeRange,
} from './format';

/* ============================================================
   IMAGE HELPERS
============================================================ */

function loadImage(
  src: string,
  useCors = false
) {
  return new Promise<HTMLImageElement>(
    (
      resolve,
      reject
    ) => {
      const img =
        new Image();

      if (useCors) {
        img.crossOrigin =
          'anonymous';
      }

      img.onload =
        () =>
          resolve(img);

      img.onerror =
        () =>
          reject(
            new Error(
              `Unable to load image: ${src}`
            )
          );

      img.src =
        src;
    }
  );
}

/*
  External event posters may display perfectly in <img>
  but still block Canvas export due to CORS.

  This function checks whether the image can safely be
  used in a Canvas before adding it to the PDF.
*/
async function loadCanvasSafeImage(
  src?: string
) {
  if (!src) {
    return null;
  }

  try {
    const img =
      await loadImage(
        src,
        true
      );

    const testCanvas =
      document.createElement(
        'canvas'
      );

    testCanvas.width =
      2;

    testCanvas.height =
      2;

    const testCtx =
      testCanvas.getContext(
        '2d'
      );

    if (!testCtx) {
      return null;
    }

    testCtx.drawImage(
      img,
      0,
      0,
      2,
      2
    );

    /*
      This throws a SecurityError if
      the source taints the canvas.
    */
    testCanvas.toDataURL();

    return img;
  } catch {
    return null;
  }
}

/* ============================================================
   SVG QR CONVERSION
============================================================ */

function svgToDataUrl(
  svg: SVGElement
) {
  const xml =
    new XMLSerializer()
      .serializeToString(
        svg
      );

  return (
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      xml
    )
  );
}

/* ============================================================
   DATA URL
============================================================ */

function dataUrlToBytes(
  dataUrl: string
) {
  const base64 =
    dataUrl.split(
      ','
    )[1];

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i <
    binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(
        i
      );
  }

  return bytes;
}

/* ============================================================
   BYTE CONCAT
============================================================ */

function concat(
  chunks: Uint8Array[]
) {
  const size =
    chunks.reduce(
      (
        sum,
        chunk
      ) =>
        sum +
        chunk.length,
      0
    );

  const output =
    new Uint8Array(
      size
    );

  let offset =
    0;

  chunks.forEach(
    (chunk) => {
      output.set(
        chunk,
        offset
      );

      offset +=
        chunk.length;
    }
  );

  return output;
}

const enc =
  new TextEncoder();

/* ============================================================
   MINIMAL PDF GENERATOR
============================================================ */

function jpegToPdf(
  jpegBytes: Uint8Array,
  widthPx: number,
  heightPx: number
) {
  const pageW =
    420;

  const pageH =
    595;

  const objects:
    Uint8Array[] =
    [];

  const offsets:
    number[] =
    [0];

  const header =
    enc.encode(
      '%PDF-1.4\n'
    );

  const addObject = (
    body:
      | Uint8Array
      | string
  ) => {
    const id =
      objects.length +
      1;

    const encodedBody =
      typeof body ===
      'string'
        ? enc.encode(
            body
          )
        : body;

    objects.push(
      concat([
        enc.encode(
          `${id} 0 obj\n`
        ),

        encodedBody,

        enc.encode(
          '\nendobj\n'
        ),
      ])
    );

    return id;
  };

  addObject(
    '<< /Type /Catalog /Pages 2 0 R >>'
  );

  addObject(
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'
  );

  addObject(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`
  );

  const imageHeader =
    enc.encode(
      `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`
    );

  const imageFooter =
    enc.encode(
      '\nendstream'
    );

  addObject(
    concat([
      imageHeader,
      jpegBytes,
      imageFooter,
    ])
  );

  const content =
    `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ`;

  addObject(
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  );

  let cursor =
    header.length;

  objects.forEach(
    (obj) => {
      offsets.push(
        cursor
      );

      cursor +=
        obj.length;
    }
  );

  const xrefStart =
    cursor;

  let xref =
    `xref\n0 ${
      objects.length +
      1
    }\n`;

  xref +=
    '0000000000 65535 f \n';

  for (
    let i = 1;
    i <=
    objects.length;
    i++
  ) {
    xref +=
      `${String(
        offsets[i]
      ).padStart(
        10,
        '0'
      )} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${
      objects.length +
      1
    } /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return concat([
    header,
    ...objects,
    enc.encode(
      xref
    ),
    enc.encode(
      trailer
    ),
  ]);
}

/* ============================================================
   COVER IMAGE
============================================================ */

function drawCover(
  ctx:
    CanvasRenderingContext2D,
  img:
    HTMLImageElement,
  x:
    number,
  y:
    number,
  w:
    number,
  h:
    number
) {
  const scale =
    Math.max(
      w /
        img.width,
      h /
        img.height
    );

  const sourceW =
    w /
    scale;

  const sourceH =
    h /
    scale;

  const sourceX =
    (img.width -
      sourceW) /
    2;

  const sourceY =
    (img.height -
      sourceH) /
    2;

  ctx.drawImage(
    img,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    x,
    y,
    w,
    h
  );
}

/* ============================================================
   ROUNDED RECTANGLE
============================================================ */

function roundedRect(
  ctx:
    CanvasRenderingContext2D,
  x:
    number,
  y:
    number,
  width:
    number,
  height:
    number,
  radius:
    number
) {
  const r =
    Math.min(
      radius,
      width / 2,
      height / 2
    );

  ctx.beginPath();

  ctx.moveTo(
    x + r,
    y
  );

  ctx.lineTo(
    x +
      width -
      r,
    y
  );

  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + r
  );

  ctx.lineTo(
    x + width,
    y +
      height -
      r
  );

  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x +
      width -
      r,
    y + height
  );

  ctx.lineTo(
    x + r,
    y + height
  );

  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y +
      height -
      r
  );

  ctx.lineTo(
    x,
    y + r
  );

  ctx.quadraticCurveTo(
    x,
    y,
    x + r,
    y
  );

  ctx.closePath();
}

/* ============================================================
   DOWNLOAD TICKET
============================================================ */

export async function downloadTicketPdf(
  event:
    EventWithId,
  ticket:
    PublicTicketWithId,
  qrSvgId:
    string
) {
  const canvas =
    document.createElement(
      'canvas'
    );

  canvas.width =
    1240;

  canvas.height =
    1754;

  const ctx =
    canvas.getContext(
      '2d'
    );

  if (!ctx) {
    throw new Error(
      'Unable to prepare ticket PDF.'
    );
  }

  const qrContainer =
    document.getElementById(
      qrSvgId
    );

  const qrSvg =
    qrContainer?.querySelector(
      'svg'
    ) as SVGElement | null;

  if (!qrSvg) {
    throw new Error(
      'QR code is still loading. Please try again.'
    );
  }

  /*
    Poster is optional because arbitrary external URLs
    may block Canvas usage.
  */
  const [
    poster,
    logo,
    qr,
  ] =
    await Promise.all([
      loadCanvasSafeImage(
        event.posterUrl
      ),

      loadImage(
        '/logo.png'
      ),

      loadImage(
        svgToDataUrl(
          qrSvg
        )
      ),
    ]);

  /* ============================================================
     BACKGROUND
  ============================================================ */

  ctx.fillStyle =
    '#070707';

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  if (poster) {
    drawCover(
      ctx,
      poster,
      0,
      0,
      canvas.width,
      650
    );
  } else {
    const heroGradient =
      ctx.createLinearGradient(
        0,
        0,
        canvas.width,
        650
      );

    heroGradient.addColorStop(
      0,
      '#080808'
    );

    heroGradient.addColorStop(
      0.55,
      '#251107'
    );

    heroGradient.addColorStop(
      1,
      '#ff7200'
    );

    ctx.fillStyle =
      heroGradient;

    ctx.fillRect(
      0,
      0,
      canvas.width,
      650
    );

    ctx.fillStyle =
      '#ffffff';

    ctx.textAlign =
      'center';

    ctx.font =
      '800 62px Arial';

    ctx.fillText(
      event.title.toUpperCase(),
      canvas.width /
        2,
      320,
      1050
    );

    ctx.font =
      '700 28px Arial';

    ctx.fillStyle =
      '#ffd7ba';

    ctx.fillText(
      'MARAFIKI MUZIKI',
      canvas.width /
        2,
      385
    );

    ctx.textAlign =
      'left';
  }

  const fade =
    ctx.createLinearGradient(
      0,
      430,
      0,
      760
    );

  fade.addColorStop(
    0,
    'rgba(7,7,7,0)'
  );

  fade.addColorStop(
    1,
    '#070707'
  );

  ctx.fillStyle =
    fade;

  ctx.fillRect(
    0,
    430,
    canvas.width,
    360
  );

  /* ============================================================
     WHITE TICKET CARD
  ============================================================ */

  ctx.fillStyle =
    '#ffffff';

  roundedRect(
    ctx,
    80,
    610,
    1080,
    1010,
    34
  );

  ctx.fill();

  /* ============================================================
     LOGO
  ============================================================ */

  ctx.drawImage(
    logo,
    115,
    660,
    150,
    150
  );

  ctx.fillStyle =
    '#0a0a0a';

  ctx.font =
    '700 48px Arial';

  ctx.fillText(
    'MARAFIKI MUZIKI',
    300,
    710
  );

  ctx.font =
    '28px Arial';

  ctx.fillStyle =
    '#666666';

  ctx.fillText(
    'A Band That Brings You Home',
    300,
    755
  );

  /* ============================================================
     HEADER
  ============================================================ */

  ctx.fillStyle =
    '#ff7200';

  ctx.fillRect(
    115,
    835,
    1010,
    8
  );

  ctx.font =
    '800 44px Arial';

  ctx.fillStyle =
    '#ff7200';

  ctx.fillText(
    'OFFICIAL EVENT E-TICKET',
    115,
    910
  );

  ctx.fillStyle =
    '#111111';

  ctx.font =
    '800 36px Arial';

  ctx.fillText(
    event.title.toUpperCase(),
    115,
    980,
    1000
  );

  /* ============================================================
     DETAILS
  ============================================================ */

  const rows:
    [string, string][] =
    [
      [
        'Guest',
        ticket.guestName,
      ],

      [
        'Ticket No.',
        ticket.ticketCode,
      ],

      [
        'Date',
        formatDate(
          event.eventDate
        ),
      ],

      [
        'Time',
        formatTimeRange(
          event.startTime,
          event.endTime
        ),
      ],

      [
        'Venue',
        event.venue,
      ],

      [
        'Admit',
        String(
          ticket.quantity
        ),
      ],

      [
        'Entry',
        'FREE',
      ],
    ];

  let y =
    1050;

  rows.forEach(
    ([
      label,
      value,
    ]) => {
      ctx.fillStyle =
        '#777777';

      ctx.font =
        '600 23px Arial';

      ctx.fillText(
        label.toUpperCase(),
        115,
        y
      );

      ctx.fillStyle =
        '#111111';

      ctx.font =
        '700 29px Arial';

      ctx.fillText(
        value,
        330,
        y,
        420
      );

      y +=
        72;
    }
  );

  /* ============================================================
     QR CODE
  ============================================================ */

  ctx.fillStyle =
    '#ffffff';

  ctx.fillRect(
    790,
    1040,
    290,
    290
  );

  ctx.drawImage(
    qr,
    810,
    1060,
    250,
    250
  );

  ctx.fillStyle =
    '#111111';

  ctx.font =
    '700 22px Arial';

  ctx.textAlign =
    'center';

  ctx.fillText(
    'SCAN TO VERIFY',
    935,
    1370
  );

  ctx.font =
    '20px Arial';

  ctx.fillStyle =
    '#666666';

  ctx.fillText(
    'Present this QR at the entrance',
    935,
    1405
  );

  ctx.textAlign =
    'left';

  /* ============================================================
     STATUS
  ============================================================ */

  ctx.fillStyle =
    '#ff7200';

  roundedRect(
    ctx,
    115,
    1490,
    1010,
    78,
    18
  );

  ctx.fill();

  ctx.fillStyle =
    '#080808';

  ctx.font =
    '800 27px Arial';

  ctx.textAlign =
    'center';

  ctx.fillText(
    ticket.checkedIn
      ? 'CHECKED IN'
      : 'CONFIRMED • ENTRY FREE',
    620,
    1540
  );

  ctx.textAlign =
    'left';

  /* ============================================================
     FOOTER
  ============================================================ */

  ctx.fillStyle =
    '#888888';

  ctx.font =
    '20px Arial';

  ctx.fillText(
    'Present this ticket at the entrance for verification.',
    115,
    1605
  );

  ctx.fillText(
    `Ticket: ${ticket.ticketCode}`,
    115,
    1645
  );

  ctx.fillText(
    'Marafiki Muziki • A Band That Brings You Home',
    115,
    1685
  );

  /* ============================================================
     EXPORT
  ============================================================ */

  let jpegUrl:
    string;

  try {
    jpegUrl =
      canvas.toDataURL(
        'image/jpeg',
        0.92
      );
  } catch {
    throw new Error(
      'Unable to generate the ticket PDF. The event poster may not allow secure PDF export.'
    );
  }

  const pdfBytes =
    jpegToPdf(
      dataUrlToBytes(
        jpegUrl
      ),
      canvas.width,
      canvas.height
    );

  const blob =
    new Blob(
      [
        pdfBytes.buffer as ArrayBuffer,
      ],
      {
        type:
          'application/pdf',
      }
    );

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      'a'
    );

  anchor.href =
    url;

  anchor.download =
    `${
      ticket.ticketCode
    }-${
      event.slug ||
      'ticket'
    }.pdf`;

  document.body.appendChild(
    anchor
  );

  anchor.click();

  anchor.remove();

  setTimeout(
    () => {
      URL.revokeObjectURL(
        url
      );
    },
    1000
  );
}