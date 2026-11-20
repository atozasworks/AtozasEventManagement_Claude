import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import EventCard from '../components/EventCard.jsx';
import { FORMATS, photo } from '../utils/format.js';

const BROWSE = [
  { category: 'conference', label: 'Conferences', tone: 'lilac', icon: 'people' },
  { category: 'workshop', label: 'Workshops', tone: 'sky', icon: 'cap' },
  { category: 'concert', label: 'Music & Concerts', tone: 'rose', icon: 'music' },
  { category: 'festival', label: 'Festivals', tone: 'sand', icon: 'tent' },
  { category: 'meetup', label: 'Business', tone: 'peri', icon: 'case' },
  { category: 'sports', label: 'Health & Wellness', tone: 'mint', icon: 'heart' },
  { category: 'exhibition', label: 'Art & Culture', tone: 'cream', icon: 'palette' },
  { category: 'webinar', label: 'Online Events', tone: 'ice', icon: 'screen' },
];

function Icon({ name }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'search') return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.2-3.2" /></svg>;
  if (name === 'mic') return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v3.2M8.5 20.2h7" /></svg>;
  if (name === 'locate') return <svg {...p}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="7" /><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5" /></svg>;
  if (name === 'pin') return <svg {...p}><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.2" /></svg>;
  if (name === 'cal') return <svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M8 3.5V7M16 3.5V7M3.5 10h17" /></svg>;
  if (name === 'shield') return <svg {...p}><path d="M12 3.5l7 2.5v6.2c0 4.2-2.8 6.8-7 8.3-4.2-1.5-7-4.1-7-8.3V6z" /><path d="M9 12l2 2 4-4.5" /></svg>;
  if (name === 'ticket') return <svg {...p}><rect x="4" y="5" width="12" height="14" rx="2" /><path d="M16 9h3.5v6H16" /><path d="M8 9h4M8 12.5h4M8 16h2.5" /></svg>;
  if (name === 'people') return <svg {...p}><circle cx="8.2" cy="8" r="2.4" /><circle cx="16.3" cy="9.1" r="1.9" /><path d="M3.5 18.7c.6-2.8 2.4-4.2 4.7-4.2s4.1 1.4 4.7 4.2" /><path d="M13.8 15.1c1.4.3 2.6 1.2 3.2 3.6" /></svg>;
  if (name === 'cap') return <svg {...p}><path d="M2.8 10 12 5.4 21.2 10 12 14.6z" /><path d="M6.8 12.2V16c1.5 1.2 3.2 1.8 5.2 1.8s3.7-.6 5.2-1.8v-3.8" /><path d="M21.2 10v4.8" /></svg>;
  if (name === 'music') return <svg {...p}><path d="M9 17.8V6.2l8-1.8v9.6" /><circle cx="6.8" cy="17.8" r="2.2" fill="currentColor" stroke="none" /><circle cx="14.8" cy="15.8" r="2.2" fill="currentColor" stroke="none" /></svg>;
  if (name === 'tent') return <svg {...p}><path d="M4 20V5" /><path d="M4 6h8.5L10 9.2 12.5 12.4H4" /><path d="M4 12.4h6.2L8.4 15.2 10.2 18H4" /></svg>;
  if (name === 'case') return <svg {...p}><rect x="3" y="8" width="18" height="11" rx="2" /><path d="M8.5 8V6.4A1.4 1.4 0 0 1 9.9 5h4.2a1.4 1.4 0 0 1 1.4 1.4V8" /><path d="M3 13h18" /></svg>;
  if (name === 'heart') return <svg {...p}><path d="M12 19.2S6 15.4 6 11.2A3.3 3.3 0 0 1 12 8.4a3.3 3.3 0 0 1 6 2.8c0 4.2-6 8-6 8z" /></svg>;
  if (name === 'palette') return <svg {...p}><path d="M14.2 4.4 19.6 9.8l-8.4 8.4H5.6v-5.6z" /><path d="M12.8 5.8 18.2 11.2" /></svg>;
  return <svg {...p}><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8 20.2h8" /><path d="M10.4 9.1 15 12l-4.6 2.9z" fill="currentColor" stroke="none" /></svg>;
}

const CITY_ALIASES = {
  bangalore: 'bengaluru', bombay: 'mumbai', madras: 'chennai', calcutta: 'kolkata',
  poona: 'pune', trivandrum: 'thiruvananthapuram', calicut: 'kozhikode', baroda: 'vadodara',
  gurgaon: 'gurugram', allahabad: 'prayagraj',
};

const normCity = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

function matchCity(raw, list) {
  const key = CITY_ALIASES[normCity(raw)] || normCity(raw);
  if (!key) return '';
  const exact = list.find((c) => normCity(c) === key);
  if (exact) return exact;
  const loose = list.find((c) => {
    const n = normCity(c);
    return n && (n.includes(key) || key.includes(n));
  });
  return loose || raw;
}

function speechLang() {
  const code = localStorage.getItem('es_lang') || 'en';
  if (code === 'en') return 'en-IN';
  if (code === 'zh-CN' || code.includes('-')) return code;
  if (['hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa', 'ur'].includes(code)) return `${code}-IN`;
  return code;
}

export default function Home() {
  const [filters, setFilters] = useState({ q: '', category: '', format: '', city: '', price: '', sort: 'date' });
  const [data, setData] = useState({ items: [], total: 0 });
  const [cities, setCities] = useState([]);
  const [citiesReady, setCitiesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [listening, setListening] = useState(false);
  const [locating, setLocating] = useState(false);
  const [detectedCity, setDetectedCity] = useState('');
  const [locNote, setLocNote] = useState('');
  const recRef = useRef(null);
  const citiesRef = useRef(cities);
  citiesRef.current = cities;
  const voiceOk = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const located = Boolean(detectedCity) && filters.city === detectedCity;

  useEffect(() => {
    api.get('/events/cities').then((r) => setCities(r.data)).catch(() => {}).finally(() => setCitiesReady(true));
  }, []);

  useEffect(() => () => recRef.current?.stop?.(), []);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      api
        .get('/events', { params: { ...params, limit: 24 } })
        .then((r) => { setData(r.data); setError(''); })
        .catch((e) => setError(errMsg(e)))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters]);

  const toggle = (k, v) => setFilters((f) => ({ ...f, [k]: f[k] === v ? '' : v }));
  const browse = (category) => {
    setFilters((f) => ({ ...f, category }));
    document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' });
  };
  const activeBrowse = BROWSE.find((b) => b.category === filters.category);

  const toggleMic = () => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) {
      recRef.current?.stop?.();
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = speechLang();
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (event) => {
      const text = Array.from(event.results).map((r) => r[0].transcript).join(' ').trim();
      if (text) setFilters((f) => ({ ...f, q: text }));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocNote('Location is not available in this browser');
      return;
    }
    setLocating(true);
    setLocNote('Finding your city');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
        const geo = await res.json();
        const raw = geo.city || geo.locality || geo.principalSubdivision || '';
        const city = matchCity(raw, citiesRef.current);
        if (!city) {
          setLocNote('Could not read a city from your location');
          setDetectedCity('');
          return;
        }
        setDetectedCity(city);
        setFilters((f) => ({ ...f, city }));
        setCities((list) => (list.includes(city) ? list : [...list, city].sort((a, b) => a.localeCompare(b))));
        setLocNote(`Using ${city}`);
      } catch {
        setLocNote('Could not look up your city');
        setDetectedCity('');
      } finally {
        setLocating(false);
      }
    }, () => {
      setLocating(false);
      setDetectedCity('');
      setLocNote('Allow location access to use your city');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  };

  useEffect(() => {
    if (citiesReady) useMyLocation();
    // Ask once, after the city list is ready, so the match can use real cities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citiesReady]);

  return (
    <>
      <div className="home-showcase">
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <h1>
              Every kind of event, <span className="hero-mark">one ticket</span> away.
            </h1>
            <p className="lead">
              Find conferences, festivals, webinars and workshops across India and online.
              Book in seconds with UPI and walk in with a QR on your phone.
            </p>
            <form className="search-bar" onSubmit={(e) => { e.preventDefault(); browse(filters.category); }}>
              <label className="search-query">
                <span className="search-ico"><Icon name="search" /></span>
                <input
                  aria-label="Search events"
                  placeholder="Search events, topics or organizers"
                  value={filters.q}
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                />
                <button
                  type="button"
                  className={`search-tool ${listening ? 'on' : ''}`}
                  aria-pressed={listening}
                  aria-label={listening ? 'Stop voice search' : 'Search by voice'}
                  title={voiceOk ? (listening ? 'Listening' : 'Search by voice') : 'Voice search is not available in this browser'}
                  disabled={!voiceOk}
                  onClick={toggleMic}
                >
                  <Icon name="mic" />
                </button>
              </label>
              <label className="search-city">
                <button
                  type="button"
                  className={`search-tool ${located || locating ? 'on' : ''}`}
                  aria-pressed={located}
                  aria-label="Use current location"
                  title={locNote || 'Use current location'}
                  onClick={useMyLocation}
                >
                  <Icon name="locate" />
                </button>
                <select aria-label="City" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}>
                  <option value="">Any City</option>
                  {cities.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <button className="btn hero-search">Search</button>
            </form>
            <ul className="hero-points">
              <li><Icon name="cal" /> Instant Booking</li>
              <li><Icon name="shield" /> Secure &amp; Reliable</li>
              <li><Icon name="ticket" /> Online &amp; In-Person</li>
            </ul>
          </div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-wash" style={{ clipPath: 'url(#heroCurve)' }} />
          <div className="hero-photo" style={{ backgroundImage: `url(${photo('hall', 1800)})`, clipPath: 'url(#heroCurve)' }} />
        </div>
        <svg className="hero-clip-def" width="0" height="0" aria-hidden="true">
          <clipPath id="heroCurve" clipPathUnits="objectBoundingBox">
            <path d="M0.24,0 C0.06,0.18 0,0.38 0.14,0.56 C0.02,0.74 0.08,0.9 0.2,1 L1,1 L1,0 Z" />
          </clipPath>
        </svg>
      </section>

      <section className="page home-cats">
        <div className="section-head">
          <h2>Popular Categories</h2>
          <button type="button" className="view-all" onClick={() => browse('')}>View All →</button>
        </div>
        <div className="browse-grid">
          {BROWSE.map((b) => (
            <button
              key={b.category}
              type="button"
              className={`browse-tile tone-${b.tone} ${filters.category === b.category ? 'on' : ''}`}
              onClick={() => browse(filters.category === b.category ? '' : b.category)}
            >
              <span className="cat-icon"><Icon name={b.icon} /></span>
              <span>{b.label}</span>
            </button>
          ))}
        </div>
      </section>
      </div>

      <section className="page">
        <div className="section-head" id="events">
          <h2>{activeBrowse ? activeBrowse.label : 'Upcoming events'}</h2>
          <select className="sort" aria-label="Sort" value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}>
            <option value="date">Soonest first</option>
            <option value="popular">Most popular</option>
            <option value="new">Newly added</option>
          </select>
        </div>
        <div className="filter-row">
          {FORMATS.map((f) => (
            <button key={f} className={`chip-btn ${filters.format === f ? 'on' : ''}`} onClick={() => toggle('format', f)}>{f}</button>
          ))}
          <span className="divider" />
          {['free', 'paid'].map((p) => (
            <button key={p} className={`chip-btn ${filters.price === p ? 'on' : ''}`} onClick={() => toggle('price', p)}>{p}</button>
          ))}
        </div>

        {error && <div className="alert error">Couldn't load events: {error}. Check that the API server is running.</div>}
        <p className="muted small">{loading ? 'Loading events' : `${data.total} event${data.total === 1 ? '' : 's'} found`}</p>
        <div className="grid">
          {data.items.map((e) => <EventCard key={e._id} event={e} />)}
        </div>
        {!loading && !data.items.length && !error && (
          <div className="empty">No events match these filters. Clear a filter or try another city.</div>
        )}
      </section>

      <section className="host-band">
        <div className="host-inner">
          <div className="host-photo" style={{ backgroundImage: `url(${photo('exhibition', 1100)})` }} />
          <div className="host-copy">
            <h2>Hosting something? Run it all from one place.</h2>
            <p>
              Sell tickets, stream sessions, fill an expo hall and scan guests in at the gate, even
              when the venue Wi-Fi drops. Free for free events; a small fee per paid ticket, no contracts.
            </p>
            <ul className="host-list">
              <li><b>Ticketing & UPI</b>Tiered tickets, custom questions, WhatsApp confirmations</li>
              <li><b>Hybrid stage</b>Live streams with chat, Q&A and reactions</li>
              <li><b>Sponsors & expo</b>Virtual booths, on-site stalls and lead capture</li>
              <li><b>Gate check-in</b>QR scanning that keeps working offline</li>
              <li><b>Venues & budget</b>Request venue quotes and track spend against plan</li>
              <li><b>CRM & attribution</b>See which campaigns sold tickets and sync leads</li>
            </ul>
            <Link to="/organize" className="btn accent">Start hosting for free</Link>
          </div>
        </div>
      </section>
    </>
  );
}
