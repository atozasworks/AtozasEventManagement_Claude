import { money, num } from './format.js';

// The kinds of business in the marketplace. `tint` is the card colour used when a listing has no photo.
export const VENDOR_CATEGORIES = [
  { id: 'marriage-hall', label: 'Marriage halls', one: 'Marriage hall', icon: '🏛️', tint: '#3a45c9', unit: 'per-day', visits: ['site-visit'] },
  { id: 'event-planner', label: 'Event planners', one: 'Event planner', icon: '📋', tint: '#0f766e', unit: 'per-event', visits: ['meeting'] },
  { id: 'caterer', label: 'Caterers', one: 'Caterer', icon: '🍽️', tint: '#b45309', unit: 'per-plate', visits: ['tasting', 'meeting'] },
  { id: 'decorator', label: 'Decorators', one: 'Decorator', icon: '💐', tint: '#be185d', unit: 'per-event', visits: ['meeting', 'site-visit'] },
  { id: 'photographer', label: 'Photographers', one: 'Photographer', icon: '📷', tint: '#4b5563', unit: 'per-event', visits: ['meeting'] },
];
export const categoryOf = (id) => VENDOR_CATEGORIES.find((c) => c.id === id) || VENDOR_CATEGORIES[0];

export const UNIT_LABEL = { 'per-day': 'per day', 'per-plate': 'per plate', 'per-event': 'per event', 'per-hour': 'per hour' };
export const VISIT_LABEL = { 'site-visit': 'Site visit', tasting: 'Food tasting', meeting: 'Meeting' };

export const priceText = (v) => (v.priceFrom > 0 ? `From ${money(v.priceFrom, v.currency)} ${UNIT_LABEL[v.priceUnit] || ''}` : 'Price on request');
export const capacityText = (v) =>
  v.capacityMax ? (v.capacityMin ? `${num(v.capacityMin)}–${num(v.capacityMax)} guests` : `Up to ${num(v.capacityMax)} guests`) : 'Any group size';

// Dates are handled as plain YYYY-MM-DD text so a booking for 14 Feb means 14 Feb for everyone
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const niceDate = (s) => fromYmd(s).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const niceDates = (dates) => (dates?.length > 1 ? `${niceDate(dates[0])} to ${niceDate(dates.at(-1))}` : dates?.length ? niceDate(dates[0]) : '');
export const niceTime = (d) => new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Contact links. Indian 10-digit numbers get the 91 country code that WhatsApp needs.
const digits = (p) => String(p || '').replace(/\D/g, '');
export function whatsappLink(vendor, text) {
  let n = digits(vendor.contact?.whatsapp || vendor.contact?.phone);
  if (!n) return null;
  if (n.length === 10) n = `91${n}`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
export const phoneLink = (vendor) => (vendor.contact?.phone || vendor.contact?.whatsapp ? `tel:${String(vendor.contact.phone || vendor.contact.whatsapp).replace(/[^\d+]/g, '')}` : null);
export const emailLink = (vendor, subject) => (vendor.contact?.email ? `mailto:${vendor.contact.email}?subject=${encodeURIComponent(subject)}` : null);

export const REQUEST_STATUS = {
  requested: ['Waiting for vendor', 'subtle'],
  quoted: ['Quote received', 'ok'],
  proposed: ['New time suggested', 'warn'],
  confirmed: ['Confirmed', 'ok'],
  accepted: ['Quote accepted', 'ok'],
  declined: ['Declined', 'warn'],
  cancelled: ['Cancelled', 'subtle'],
};
export const KIND_LABEL = { booking: 'Booking', quote: 'Quote', visit: 'Visit' };
