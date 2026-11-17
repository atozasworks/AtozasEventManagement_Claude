// Shared text helpers for emails, WhatsApp messages and PDF tickets.

export const brandName = () => process.env.BRAND_NAME || 'EventSphere';

// Public address of the web app - used to build links inside emails
export const clientUrl = () => (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');

// Date in the event's own timezone, e.g. "Sat, 12 Dec 2026, 10:00 am IST"
export function formatEventDate(date, timezone = 'Asia/Kolkata') {
  if (!date) return '';
  const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  let out;
  try {
    out = new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: timezone }).format(new Date(date));
  } catch {
    out = new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'Asia/Kolkata' }).format(new Date(date));
  }
  return out.replace(/[  ]/g, ' ');
}

export function locationLine(event) {
  if (event.format === 'virtual') return 'Online event';
  const loc = event.location || {};
  const place = [loc.venueName, loc.address, loc.city].filter(Boolean).join(', ') || 'Venue to be announced';
  return event.format === 'hybrid' ? `${place} (also streaming online)` : place;
}

export const escapeHtml = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
