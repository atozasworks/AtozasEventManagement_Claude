import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, num } from '../utils/format.js';

const TYPES = ['convention-centre', 'hotel', 'banquet', 'auditorium', 'outdoor', 'coworking', 'stadium'];

export default function Venues() {
  const { isOrganizer } = useAuth();
  const [filters, setFilters] = useState({ city: '', type: '', minCapacity: '', maxPrice: '' });
  const [venues, setVenues] = useState([]);
  const [inquire, setInquire] = useState(null);
  const [form, setForm] = useState({ startDate: '', endDate: '', expectedAttendees: '', message: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    api.get('/venues', { params }).then((r) => setVenues(r.data));
  }, [filters]);

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
      <div className="filter-bar card">
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
