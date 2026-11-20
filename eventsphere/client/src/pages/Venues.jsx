import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, num } from '../utils/format.js';
import { VendorCard } from './Vendors.jsx';
import { VENDOR_CATEGORIES } from '../utils/vendors.js';

const TYPES = ['convention-centre', 'hotel', 'banquet', 'auditorium', 'outdoor', 'coworking', 'stadium'];

export default function Venues() {
  const { user, isOrganizer } = useAuth();
  const [filters, setFiltersRaw] = useState({ q: '', city: '', type: '', minCapacity: '', maxPrice: '' });
  const [venues, setVenues] = useState([]);
  // Businesses added through "List your business". They are read from the same listings the Vendors page
  // shows (GET /vendors), never copied, so a new listing or an edit appears on both pages.
  const [category, setCategory] = useState('');
  const [bizPage, setBizPage] = useState(1);
  const [biz, setBiz] = useState(null);
  const [bizError, setBizError] = useState('');
  const setFilters = (next) => { setFiltersRaw(next); setBizPage(1); };
  const pickCategory = (id) => { setCategory(id); setBizPage(1); };
  const [inquire, setInquire] = useState(null);
  const [form, setForm] = useState({ startDate: '', endDate: '', expectedAttendees: '', message: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    api.get('/venues', { params }).then((r) => setVenues(r.data));
  }, [filters]);

  // Search, city, guests and price apply to the listed businesses too (only live listings come back)
  useEffect(() => {
    const t = setTimeout(() => {
      const wanted = { category, q: filters.q, city: filters.city, guests: filters.minCapacity, maxBudget: filters.maxPrice, page: bizPage };
      const params = Object.fromEntries(Object.entries(wanted).filter(([, v]) => v !== '' && v != null));
      api.get('/vendors', { params }).then((r) => { setBiz(r.data); setBizError(''); }).catch((e) => setBizError(errMsg(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [category, filters.q, filters.city, filters.minCapacity, filters.maxPrice, bizPage]);

  async function send(e) {
    e.preventDefault();
    try {
      await api.post(`/venues/${inquire._id}/inquiries`, form);
      setMsg(`Inquiry sent to ${inquire.name}. Track it on your organizer dashboard.`);
      setInquire(null);
    } catch (err) {
      setMsg(errMsg(err));
    }
  }

  return (
    <div className="page">
      <h1>Find a venue</h1>
      <p className="muted">From 100-seat workshop rooms to 40,000-capacity festival grounds.</p>
      <div className="filter-bar card venue-filters">
        <label>Search<input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Name, e.g. Grand Hall" /></label>
        <label>City<input value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} placeholder="Bengaluru" /></label>
        <label>Type
          <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">Any</option>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Min. guests<input type="number" value={filters.minCapacity} onChange={(e) => setFilters({ ...filters, minCapacity: e.target.value })} /></label>
        <label>Max. ₹ / day<input type="number" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} /></label>
      </div>
      {msg && <div className="alert info">{msg}</div>}
      <div className="venue-grid">
        {venues.map((v) => (
          <div key={v._id} className="card venue">
            <div className="row between"><span className="pill subtle">{v.type}</span><span className="small">★ {v.rating}</span></div>
            <h3>{v.name}</h3>
            <p className="small muted">{v.city}{v.state && `, ${v.state}`}</p>
            <p className="small">Up to <b>{num(v.capacity)}</b> guests · <b>{money(v.pricePerDay, v.currency)}</b>/day</p>
            <div className="tags">{v.amenities?.map((a) => <span key={a} className="tag">{a}</span>)}</div>
            {isOrganizer ? (
              <button className="btn sm" onClick={() => { setInquire(v); setMsg(''); }}>Request quote</button>
            ) : (
              <Link className="small" to="/organize">Become an organizer to request quotes →</Link>
            )}
          </div>
        ))}
      </div>
      {!venues.length && <div className="empty">No venues match.</div>}

      <section className="listed-businesses">
        <div className="row between wrap">
          <div>
            <h2 className="no-margin">Listed businesses</h2>
            <p className="muted small">
              Marriage halls, convention centres, banquet halls, event planners, caterers, decorators and photographers, listed by their owners.
              The same listings are on the <Link to="/vendors">Vendors page</Link>.
            </p>
          </div>
          <Link className="btn ghost sm" to={user ? '/vendors/hub?tab=listings' : '/login'} state={user ? undefined : { from: '/vendors/hub?tab=listings' }}>List your business</Link>
        </div>
        <div className="filter-row">
          <button className={`chip-btn ${category === '' ? 'on' : ''}`} onClick={() => pickCategory('')}>All</button>
          {VENDOR_CATEGORIES.map((c) => (
            <button key={c.id} className={`chip-btn ${category === c.id ? 'on' : ''}`} onClick={() => pickCategory(c.id)}>{c.icon} {c.label}</button>
          ))}
        </div>
        {bizError && <div className="alert error">{bizError}</div>}
        {!biz ? (!bizError && <div className="spinner" />) : (
          <>
            <p className="muted small">{biz.total} business{biz.total === 1 ? '' : 'es'} found. Search, city, guests and price above apply here too.</p>
            <div className="vendor-grid">
              {biz.items.map((v) => <VendorCard key={v._id} vendor={v} />)}
            </div>
            {!biz.items.length && <div className="empty">No listed businesses match. Try another category or city.</div>}
            {biz.pages > 1 && (
              <div className="row gap pager">
                <button className="btn ghost sm" disabled={bizPage <= 1} onClick={() => setBizPage(bizPage - 1)}>← Previous</button>
                <span className="small muted">Page {biz.page} of {biz.pages}</span>
                <button className="btn ghost sm" disabled={bizPage >= biz.pages} onClick={() => setBizPage(bizPage + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </section>

      {inquire && (
        <div className="modal-backdrop" onClick={() => setInquire(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={send}>
            <h2>Request a quote</h2>
            <p className="muted">{inquire.name} · up to {num(inquire.capacity)} guests</p>
            <div className="grid-2">
              <label>From<input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
              <label>To<input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            </div>
            <label>Expected attendees<input type="number" required value={form.expectedAttendees} onChange={(e) => setForm({ ...form, expectedAttendees: e.target.value })} /></label>
            <label>Message<textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
            <div className="row gap">
              <button className="btn">Send inquiry</button>
              <button type="button" className="btn ghost" onClick={() => setInquire(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
