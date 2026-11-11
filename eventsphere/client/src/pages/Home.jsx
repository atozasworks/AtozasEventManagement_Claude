import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import EventCard from '../components/EventCard.jsx';
import { FORMATS, photo } from '../utils/format.js';

// Three "tickets" in the hero - one per audience the platform serves
const HERO_TICKETS = [
  { img: 'conference', kind: 'Conference', where: 'Bengaluru · Hybrid', seat: 'Hall 1' },
  { img: 'festival', kind: 'Music festival', where: 'Mumbai · In person', seat: 'Fan pit' },
  { img: 'workshop', kind: 'Workshop', where: 'Pune · 20 seats', seat: 'Studio B' },
];

const BROWSE = [
  { category: 'conference', label: 'Conferences', img: 'conference' },
  { category: 'festival', label: 'Festivals', img: 'festival' },
  { category: 'concert', label: 'Concerts', img: 'concert' },
  { category: 'workshop', label: 'Workshops', img: 'craft' },
  { category: 'webinar', label: 'Webinars', img: 'speaker' },
  { category: 'exhibition', label: 'Exhibitions', img: 'exhibition' },
];

const POPULAR = ['AI', 'Startups', 'Music', 'Bengaluru', 'Mumbai'];

export default function Home() {
  const [filters, setFilters] = useState({ q: '', category: '', format: '', city: '', price: '', sort: 'date' });
  const [data, setData] = useState({ items: [], total: 0 });
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/events/cities').then((r) => setCities(r.data)).catch(() => {});
  }, []);

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

  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <h1>Every kind of event, one ticket away.</h1>
            <p className="lead">
              Find conferences, festivals, webinars and workshops across India and online.
              Book in seconds with UPI and walk in with a QR on your phone.
            </p>
            <form className="search-bar" onSubmit={(e) => { e.preventDefault(); browse(filters.category); }}>
              <input
                aria-label="Search events"
                placeholder="Search events, topics or artists"
                value={filters.q}
                onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              />
              <select aria-label="City" value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}>
                <option value="">Any city</option>
                {cities.map((c) => <option key={c}>{c}</option>)}
              </select>
              <button className="btn accent">Search</button>
            </form>
            <p className="popular">
              Popular:
              {POPULAR.map((p) => (
                <button key={p} type="button" onClick={() => setFilters((f) => ({ ...f, q: p }))}>{p}</button>
              ))}
            </p>
          </div>

          <div className="hero-tickets" aria-hidden="true">
            {HERO_TICKETS.map((t, i) => (
              <div key={t.kind} className={`hero-ticket t${i + 1}`}>
                <img src={photo(t.img, 700)} alt="" loading={i ? 'lazy' : 'eager'} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
                <div className="stub">
                  <div>
                    <b>{t.kind}</b>
                    <span>{t.where}</span>
                  </div>
                  <span className="seat">{t.seat}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page">
        <div className="section-head">
          <h2>Browse by type</h2>
        </div>
        <div className="browse-grid">
          {BROWSE.map((b) => (
            <button
              key={b.category}
              className={`browse-tile ${filters.category === b.category ? 'on' : ''}`}
              style={{ backgroundImage: `url(${photo(b.img, 500)})` }}
              onClick={() => browse(filters.category === b.category ? '' : b.category)}
            >
              <span>{b.label}</span>
            </button>
          ))}
        </div>

        <div className="section-head" id="events">
          <h2>{filters.category ? `Upcoming ${filters.category} events` : 'Upcoming events'}</h2>
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
