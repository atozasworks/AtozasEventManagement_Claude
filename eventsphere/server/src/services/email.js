import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { brandName, escapeHtml } from '../utils/format.js';

/**
 * Email channel. Works with any SMTP provider (Amazon SES, Brevo, SendGrid,
 * Zoho Mail, Gmail app password ...) - set SMTP_HOST / SMTP_PORT / SMTP_USER /
 * SMTP_PASS / EMAIL_FROM in .env.
 *
 * Without SMTP_HOST nothing is sent: each message is saved as an .eml file in
 * server/.outbox (open it with any mail app) and summarised in the console, so
 * every flow can be tested locally.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTBOX = path.resolve(__dirname, '../../.outbox');

export const emailConfigured = () => Boolean(process.env.SMTP_HOST);

let transport;
function getTransport() {
  if (transport) return transport;
  if (emailConfigured()) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    });
  } else {
    transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  }
  return transport;
}

const fromAddress = () => process.env.EMAIL_FROM || `"${brandName()}" <no-reply@eventsphere.local>`;

/** Never throws - a failed email must not break a purchase or a login. */
export async function sendEmail({ to, subject, text, html, attachments }) {
  if (!to) return { delivered: false, reason: 'no recipient' };
  try {
    const info = await getTransport().sendMail({ from: fromAddress(), to, subject, text, html, attachments });
    if (emailConfigured()) return { delivered: true, id: info.messageId };

    fs.mkdirSync(OUTBOX, { recursive: true });
    const safe = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);
    const file = path.join(OUTBOX, `${Date.now()}-${safe}.eml`);
    fs.writeFileSync(file, info.message);
    console.log(`[email:dev] to=${to} :: ${subject}\n${text}\n(saved to ${file})`);
    return { delivered: false, logged: true, file };
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
    return { delivered: false, reason: err.message };
  }
}

/** Simple branded HTML wrapper. `paragraphs` are plain strings (escaped here). */
export function renderEmail({ heading, paragraphs = [], button, footnote }) {
  const brand = escapeHtml(brandName());
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p)}</p>`).join('');
  const cta = button
    ? `<p style="margin:22px 0"><a href="${escapeHtml(button.url)}" style="background:#3a45c9;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(button.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;color:#6b7280;word-break:break-all">Or open this link: ${escapeHtml(button.url)}</p>`
    : '';
  const note = footnote ? `<p style="margin:18px 0 0;font-size:12px;color:#6b7280;line-height:1.5">${escapeHtml(footnote)}</p>` : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
  <div style="font-weight:700;font-size:18px;color:#131538;margin:0 0 14px">${brand}</div>
  <div style="background:#ffffff;border-radius:12px;padding:26px 24px;font-size:15px">
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(heading)}</h1>
    ${body}${cta}${note}
  </div>
  <p style="font-size:12px;color:#9ca3af;margin:14px 4px 0">Sent by ${brand}. If you did not expect this email you can ignore it.</p>
</div></body></html>`;
}
