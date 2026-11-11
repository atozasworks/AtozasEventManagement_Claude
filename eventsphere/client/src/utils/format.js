export const money = (n, currency = 'INR') =>
  Number(n) === 0
    ? 'Free'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n || 0);

export const num = (n) => new Intl.NumberFormat('en-IN').format(Math.round(n || 0));

export const dateLong = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

export const dateShort = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '');

export const time = (d) => (d ? new Date(d).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '');

// For <input type="datetime-local">
export const toLocalInput = (d) => {
  if (!d) return '';
  const t = new Date(d);
  const off = t.getTimezoneOffset() * 60000;
  return new Date(t - off).toISOString().slice(0, 16);
};

export const CATEGORIES = ['conference', 'webinar', 'festival', 'concert', 'workshop', 'meetup', 'exhibition', 'sports', 'other'];
export const FORMATS = ['in-person', 'virtual', 'hybrid'];

/*
 * Event photography - free under the Unsplash License (https://unsplash.com/license).
 * Served from Unsplash's CDN, sized per use with ?w=. For production, download
 * these into client/public/images and point the URLs there.
 */
const UNSPLASH = 'https://images.unsplash.com/';
export const PHOTOS = {
  conference: { id: 'photo-1492538368677-f6e0afe31dcc', credit: 'Mikael Kristenson' },
  speaker: { id: 'photo-1760420940953-3958ad9f6287', credit: 'Tahsin Labib' },
  festival: { id: 'photo-1768405031181-33bb016e2fbb', credit: 'Rafael Garcin' },
  concert: { id: 'photo-1549452026-91574599e7f6', credit: 'Lee Blanchflower' },
  workshop: { id: 'photo-1753164725896-f0a39315ff8a', credit: 'Vitaly Gariev' },
  craft: { id: 'photo-1519233181562-35b0b8bb2b1d', credit: 'Maggie Markel' },
  exhibition: { id: 'photo-1752155222944-675c2c3bfafd', credit: 'Jin-Woo Lee' },
};

export const photo = (key, w = 1200) =>
  `${UNSPLASH}${(PHOTOS[key] || PHOTOS.conference).id}?auto=format&fit=crop&w=${w}&q=75`;

// Default cover photo for each event type (used when an organizer hasn't uploaded one)
const CATEGORY_PHOTO = {
  conference: 'conference',
  webinar: 'speaker',
  festival: 'festival',
  concert: 'concert',
  workshop: 'workshop',
  meetup: 'conference',
  exhibition: 'exhibition',
  sports: 'festival',
  other: 'speaker',
};

export const coverUrl = (event, w = 900) => event?.coverImage || photo(CATEGORY_PHOTO[event?.category] || 'speaker', w);

// Solid midnight fallback shows if images can't load (offline venue laptops)
export const coverStyle = (event, w = 900) => ({
  backgroundColor: '#1b1e4a',
  backgroundImage: `url(${coverUrl(event, w)})`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
});
