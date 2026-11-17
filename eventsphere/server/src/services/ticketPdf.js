import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { brandName, clientUrl, formatEventDate, locationLine } from '../utils/format.js';
import { signedQr } from './gateKeys.js';

/**
 * Builds a printable PDF with one page per ticket. The QR holds the same ticket
 * code the gate scanner expects, so a printout works exactly like the phone.
 *
 * Uses the PDF's built-in Helvetica, which only covers Latin characters; anything
 * else (e.g. Indian-script names) is replaced with "?" rather than garbled.
 */
const pdfSafe = (v) =>
  String(v ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/₹/g, 'Rs ')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x20-\x7e\xa1-\xff]/g, '?');

const INK = '#111827';
const MUTED = '#6b7280';
const BRAND = '#131538';

export async function buildTicketsPdf({ event, tickets }) {
  const doc = new PDFDocument({ size: 'A5', margin: 0, info: { Title: pdfSafe(`${event.title} - tickets`), Author: pdfSafe(brandName()) } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const W = doc.page.width; // 419.5pt
  const M = 32;
  const inner = W - M * 2;
  const virtualOn = ['virtual', 'hybrid'].includes(event.format);

  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    if (i > 0) doc.addPage();

    // Header band
    doc.rect(0, 0, W, 64).fill(BRAND);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text(pdfSafe(brandName()), M, 24, { lineBreak: false });
    doc.font('Helvetica').fontSize(9).text(`TICKET ${i + 1} OF ${tickets.length}`, M, 28, { width: inner, align: 'right' });

    // Event
    let y = 86;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(18).text(pdfSafe(event.title), M, y, { width: inner });
    y = doc.y + 8;
    doc.font('Helvetica').fontSize(10.5).fillColor(INK).text(pdfSafe(formatEventDate(event.startDate, event.timezone)), M, y, { width: inner });
    doc.fillColor(MUTED).text(pdfSafe(locationLine(event)), M, doc.y + 2, { width: inner });
    y = doc.y + 14;

    doc.moveTo(M, y).lineTo(W - M, y).dash(3, { space: 3 }).strokeColor('#d1d5db').stroke().undash();
    y += 14;

    // Holder + ticket type
    const col = inner / 2;
    const field = (label, value, x, top, width) => {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label.toUpperCase(), x, top, { width });
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK).text(pdfSafe(value) || '-', x, top + 11, { width });
      return doc.y;
    };
    const access = { 'in-person': 'In person', virtual: 'Online only', both: virtualOn ? 'In person + online' : 'In person' }[t.access] || 'In person';
    const y1 = field('Attendee', t.holderName, M, y, col - 8);
    const y2 = field('Ticket', t.ticketTypeName, M + col, y, col);
    y = Math.max(y1, y2) + 10;
    const y3 = field('Access', access, M, y, col - 8);
    const y4 = field('Email', t.holderEmail, M + col, y, col);
    y = Math.max(y3, y4) + 16;

    // QR + code
    if (t.access !== 'virtual') {
      const size = 170;
      // Signed QR: a gate can verify it offline. The short code printed below it still works when typed.
      const qr = await QRCode.toBuffer(await signedQr(event._id, t), { width: 660, margin: 1, errorCorrectionLevel: 'M' });
      doc.image(qr, (W - size) / 2, y, { width: size, height: size });
      y += size + 6;
      doc.font('Courier-Bold').fontSize(13).fillColor(INK).text(t.code, M, y, { width: inner, align: 'center' });
      y = doc.y + 6;
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('Show this QR code at the entry gate. Each code admits one person, once.', M, y, { width: inner, align: 'center' });
      y = doc.y + 10;
    } else {
      doc.font('Courier-Bold').fontSize(13).fillColor(INK).text(t.code, M, y, { width: inner, align: 'center' });
      y = doc.y + 10;
    }

    if (virtualOn && t.access !== 'in-person') {
      const link = `${clientUrl()}/live/${event._id}`;
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text('Join online (log in with the account that booked):', M, y, { width: inner, align: 'center' });
      doc.fillColor('#3a45c9').text(link, M, doc.y + 2, { width: inner, align: 'center', link });
    }

    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`Order ${String(t.order?._id || t.order).slice(-8).toUpperCase()}  |  Issued by ${pdfSafe(brandName())}`, M, doc.page.height - 34, { width: inner, align: 'center', lineBreak: false });
  }

  doc.end();
  return done;
}
