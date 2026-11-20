import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { VENDOR_CATEGORIES, VISIT_LABEL, categoryOf, capacityText, priceText, formatsOf, whatsappLink, phoneLink, emailLink, niceDate, ymd } from '../utils/vendors.js';

const MAX_COMPARE = 3;

export function VendorCover({ vendor, large }) {
  const cat = categoryOf(vendor.category);
  return (
    <div className={`vendor-cover ${large ? 'large' : ''}`} style={vendor.imageUrl ? { backgroundImage: `url(${vendor.imageUrl})` } : { background: `linear-gradient(135deg, ${cat.tint}, #131538)` }}>
      {!vendor.imageUrl && <span aria-hidden="true">{cat.icon}</span>}
    </div>
  );
}

// WhatsApp / call / email buttons for a listing
export function ContactButtons({ vendor, small }) {
  const text = `Hi, I found ${vendor.name} on EventSphere and would like to know more.`;
  const wa = whatsappLink(vendor, text);
  const tel = phoneLink(vendor);
  const mail = emailLink(vendor, `Enquiry about ${vendor.name} (via EventSphere)`);
  const cls = `btn ghost ${small ? 'sm' : ''}`;
  return (
    <div className="row gap wrap">
      {wa && <a className={`${cls} wa`} href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
      {tel && <a className={cls} href={tel}>Call{!small && vendor.contact.phone ? ` ${vendor.contact.phone}` : ''}</a>}
      {mail && <a className={cls} href={mail}>Email</a>}
    </div>
  );
}

/**
 * One listing card. Used by the Vendors page and by the "Listed businesses" section of the Venues page,
 * so a business looks and books the same wherever it is found.
 *   date     keeps a chosen "free on" date when the booking page opens
 *   compare  { checked, disabled, onToggle } adds the Compare tick box (Vendors page only)
 */
export function VendorCard({ vendor: v, date, compare }) {
  const modes = formatsOf(v);
  const cta = modes.direct && modes.quota ? 'Quote or book' : modes.direct ? 'Book a date' : 'Request quote';
  return (
    <div className="card venue vendor-card">
      <div className="row between">
        <span className="pill subtle">{categoryOf(v.category).one}</span>
        {compare ? (
          <label className="check small vendor-compare"><input type="checkbox" checked={compare.checked} disabled={compare.disabled} onChange={compare.onToggle} /> Compare</label>
        ) : null}
      </div>
      <h3><Link to={`/vendors/${v._id}`}>{v.name}</Link></h3>
      <p className="small muted">{v.city}{v.state && `, ${v.state}`}</p>
      <p className="small"><b>{capacityText(v)}</b> · <b>{priceText(v)}</b></p>
      {!!v.services?.length && (
        <div className="tags">{v.services.slice(0, 4).map((s) => <span key={s} className="tag">{s}</span>)}</div>
      )}
      <Link className="btn sm" to={`/vendors/${v._id}${date ? `?date=${date}` : ''}`}>{cta}</Link>
    </div>
  );
}

export default function Vendors() {
  const { user } = useAuth();
  const [f, setF] = useState({ category: '', q: '', city: '', guests: '', maxBudget: '', date: '', sort: 'price' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [cities, setCities] = useState([]);
  const [error, setError] = useState('');
  const [compare, setCompare] = useState([]);
  const [showCompare, setShowCompare] = useState(false);
  const set = (patch) => { setF((x) => ({ ...x, ...patch })); setPage(1); };

  useEffect(() => { api.get('/vendors/meta').then((r) => setCities(r.data.cities)).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      const params = Object.fromEntries(Object.entries({ ...f, page }).filter(([, v]) => v !== '' && v != null));
      api.get('/vendors', { params }).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errMsg(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [f, page]);

  const picked = (v) => compare.some((c) => c._id === v._id);
  const toggleCompare = (v) => setCompare((list) => (picked(v) ? list.filter((c) => c._id !== v._id) : list.length < MAX_COMPARE ? [...list, v] : list));
  const unit = f.category ? { 'per-day': 'per day', 'per-plate': 'per plate', 'per-event': 'per event' }[categoryOf(f.category).unit] : '';

  return (
    <div className="page wide">
      <div className="row between wrap">
        <div>
          <h1 className="no-margin">Halls, caterers and everyone else your event needs</h1>
          <p className="muted">Search, compare and book marriage halls, convention centres, banquet halls, event planners, caterers, decorators and photographers.</p>
        </div>
        <div className="row gap wrap">
          {user && <Link className="btn ghost" to="/vendors/hub">My bookings &amp; requests</Link>}
          <Link className="btn" to={user ? '/vendors/hub?tab=listings' : '/login'} state={user ? undefined : { from: '/vendors/hub?tab=listings' }}>List your business</Link>
        </div>
      </div>

      <div className="filter-row">
        <button className={`chip-btn ${f.category === '' ? 'on' : ''}`} onClick={() => set({ category: '' })}>All</button>
        {VENDOR_CATEGORIES.map((c) => (
          <button key={c.id} className={`chip-btn ${f.category === c.id ? 'on' : ''}`} onClick={() => set({ category: c.id })}>{c.icon} {c.label}</button>
        ))}
      </div>

      <div className="filter-bar card vendor-filters">
        <label>Search<input placeholder="Name or service, e.g. AC hall" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
        <label>City
          <select value={f.city} onChange={(e) => set({ city: e.target.value })}>
            <option value="">Any city</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Guests<input type="number" min={0} placeholder="e.g. 500" value={f.guests} onChange={(e) => set({ guests: e.target.value })} /></label>
        <label>Budget: starting price up to{unit && ` (${unit})`}<input type="number" min={0} placeholder="₹" value={f.maxBudget} onChange={(e) => set({ maxBudget: e.target.value })} /></label>
        <label>Free on date<input type="date" min={ymd(new Date())} value={f.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label>Sort by
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
            <option value="price">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="capacity">Largest capacity</option>
            <option value="new">Newest</option>
          </select>
        </label>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!data ? <div className="spinner" /> : (
        <>
          <p className="muted small">
            {data.total} listing{data.total === 1 ? '' : 's'} found{f.date && ` that are free on ${niceDate(f.date)}`}. Tick "Compare" on up to {MAX_COMPARE} to see them side by side.
          </p>
          <div className="vendor-grid">
            {data.items.map((v) => (
              <VendorCard
                key={v._id}
                vendor={v}
                date={f.date}
                compare={{ checked: picked(v), disabled: !picked(v) && compare.length >= MAX_COMPARE, onToggle: () => toggleCompare(v) }}
              />
            ))}
          </div>
          {!data.items.length && <div className="empty">Nothing matches these filters. Try another city, a bigger budget or a different date.</div>}
          {data.pages > 1 && (
            <div className="row gap pager">
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
              <span className="small muted">Page {data.page} of {data.pages}</span>
              <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </>
      )}

      {compare.length > 0 && (
        <div className="compare-bar">
          <span>{compare.map((c) => c.name).join(' · ')}</span>
          <div className="row gap">
            <button className="btn accent sm" disabled={compare.length < 2} onClick={() => setShowCompare(true)}>Compare {compare.length}</button>
            <button className="btn ghost sm" onClick={() => setCompare([])}>Clear</button>
          </div>
        </div>
      )}

      {showCompare && (
        <div className="modal-backdrop" onClick={() => setShowCompare(false)}>
          <div className="modal compare-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Compare</h2>
            <div className="compare-scroll">
              <table className="table compare-table">
                <thead><tr><th />{compare.map((v) => <th key={v._id}><Link to={`/vendors/${v._id}`}>{v.name}</Link></th>)}</tr></thead>
                <tbody>
                  <tr><th>Type</th>{compare.map((v) => <td key={v._id}>{categoryOf(v.category).one}</td>)}</tr>
                  <tr><th>City</th>{compare.map((v) => <td key={v._id}>{v.city}</td>)}</tr>
                  <tr><th>Price</th>{compare.map((v) => <td key={v._id}><b>{priceText(v)}</b></td>)}</tr>
                  <tr><th>Guests</th>{compare.map((v) => <td key={v._id}>{capacityText(v)}</td>)}</tr>
                  <tr><th>Includes</th>{compare.map((v) => <td key={v._id}>{v.services?.join(', ') || '—'}</td>)}</tr>
                  <tr><th>Before you book</th>{compare.map((v) => <td key={v._id}>{v.visitTypes?.map((t) => VISIT_LABEL[t]).join(', ') || '—'}</td>)}</tr>
                  <tr><th>Booking</th>{compare.map((v) => <td key={v._id}>{formatsOf(v).direct && formatsOf(v).quota ? 'Quote or direct booking' : formatsOf(v).direct ? 'Direct booking, confirmed instantly' : 'Quotation only'}</td>)}</tr>
                  {f.date && <tr><th>{niceDate(f.date)}</th>{compare.map((v) => <td key={v._id} className="ok-text">Free</td>)}</tr>}
                  <tr><th>Contact</th>{compare.map((v) => <td key={v._id}><ContactButtons vendor={v} small /></td>)}</tr>
                  <tr><th />{compare.map((v) => <td key={v._id}><Link className="btn sm" to={`/vendors/${v._id}${f.date ? `?date=${f.date}` : ''}`}>Check dates &amp; book</Link></td>)}</tr>
                </tbody>
              </table>
            </div>
            <button className="btn ghost" onClick={() => setShowCompare(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
