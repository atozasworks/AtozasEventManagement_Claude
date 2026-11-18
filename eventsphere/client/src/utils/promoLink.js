import { dateLong, money } from './format.js';

/**
 * Promo invitation links: /e/<event-slug>?promo=CODE
 *
 * The organizer shares the link. When a visitor opens it, the code is remembered in this browser
 * (per event) so it survives logging in, signing up and confirming an email in another tab,
 * and the checkout applies it without the buyer typing anything.
 */
const KEY = 'es_promo';
const KEEP_DAYS = 30;
const CODE = /^[A-Z0-9_-]{3,24}$/;

function readAll() {
  try {
    const all = JSON.parse(localStorage.getItem(KEY)) || {};
    const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    for (const slug of Object.keys(all)) if (!(all[slug]?.at > cutoff)) delete all[slug];
    return all;
  } catch {
    return {};
  }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private window: the link still works for this visit */ }
}

// Run once when the app opens: remember the code if this is an invitation link
export function capturePromo() {
  const m = window.location.pathname.match(/^\/e\/([^/]+)\/?$/);
  const code = String(new URLSearchParams(window.location.search).get('promo') || '').trim().toUpperCase();
  if (!m || !CODE.test(code)) return;
  const all = readAll();
  all[decodeURIComponent(m[1])] = { code, at: Date.now() };
  writeAll(all);
}

export function savedPromo(slug) {
  const fromLink = String(new URLSearchParams(window.location.search).get('promo') || '').trim().toUpperCase();
  if (CODE.test(fromLink)) return fromLink;
  return readAll()[slug]?.code || '';
}

export function forgetPromo(slug) {
  const all = readAll();
  if (!all[slug]) return;
  delete all[slug];
  writeAll(all);
}

// The event the visitor was most recently invited to, so "Email confirmed" can send them back to it
export function lastInvitedSlug() {
  const all = readAll();
  return Object.keys(all).sort((a, b) => all[b].at - all[a].at)[0] || '';
}

// "10% off" / "₹200 off"
export const offerText = (c, currency) => (c.type === 'percent' ? `${c.value}% off` : `${money(c.value, currency)} off`);

/** The link an organizer shares. `source` (whatsapp, facebook...) feeds the "Marketing attribution" report. */
export function promoLink(event, code, source) {
  const p = new URLSearchParams({ promo: code });
  if (source) {
    p.set('utm_source', source);
    p.set('utm_medium', 'social');
    p.set('utm_campaign', code.toLowerCase());
  }
  return `${window.location.origin}/e/${event.slug}?${p}`;
}

// Ready-made text for the share buttons; the organizer can edit it before posting
export function defaultShareMessage(event, coupon) {
  const where = event.format === 'virtual' ? 'online' : [event.location?.venueName, event.location?.city].filter(Boolean).join(', ');
  const lines = [
    `You're invited to ${event.title}!`,
    `${dateLong(event.startDate)}${where ? ` · ${where}` : ''}`,
    `Book with my link and get ${offerText(coupon, event.currency)} - the code ${coupon.code} is applied automatically.`,
  ];
  if (coupon.validTo) lines.push(`Offer ends ${dateLong(coupon.validTo)}.`);
  return lines.join('\n');
}

/** Where each share button sends the organizer. Facebook and LinkedIn accept only the link, not a message. */
export function shareTargets(event, code, message) {
  const enc = encodeURIComponent;
  const link = (source) => promoLink(event, code, source);
  return [
    { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(`${message}\n${link('whatsapp')}`)}` },
    { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(link('facebook'))}`, linkOnly: true },
    { id: 'x', label: 'X (Twitter)', href: `https://twitter.com/intent/tweet?text=${enc(message)}&url=${enc(link('x'))}` },
    { id: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(link('linkedin'))}`, linkOnly: true },
    { id: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${enc(link('telegram'))}&text=${enc(message)}` },
    { id: 'email', label: 'Email', href: `mailto:?subject=${enc(`Invitation: ${event.title}`)}&body=${enc(`${message}\n\n${link('email')}`)}` },
  ];
}
