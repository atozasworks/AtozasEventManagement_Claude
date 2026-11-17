import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { money } from '../utils/format.js';
import AvailabilityCalendar from '../components/AvailabilityCalendar.jsx';
import { ContactButtons } from './Vendors.jsx';
import { VENDOR_CATEGORIES, VISIT_LABEL, UNIT_LABEL, KIND_LABEL, REQUEST_STATUS, categoryOf, capacityText, priceText, niceDates, niceTime, ymd } from '../utils/vendors.js';

const summary = (r) =>
  r.kind === 'visit'
    ? `${VISIT_LABEL[r.visitType]} · ${niceTime(r.visitAt)}`
    : `${r.dates?.length ? niceDates(r.dates) : 'Date not decided'}${r.guests ? ` · ${r.guests} guests` : ''}`;

function StatusPill({ r }) {
  const [label, tone] = REQUEST_STATUS[r.status] || [r.status, 'subtle'];
  return <span className={`pill ${tone}`}>{label}</span>;
}

// ---------- What I asked vendors for ----------
function MyRequests() {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => api.get('/vendors/requests/mine').then((r) => setRows(r.data)).catch((e) => setMsg({ type: 'error', text: errMsg(e) }));
  useEffect(() => { load(); }, []);

  async function act(r, action, done, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setMsg(null);
    try { await api.post(`/vendors/requests/${r._id}/act`, { action }); setMsg({ type: 'success', text: done }); } catch (e) { setMsg({ type: 'error', text: errMsg(e) }); }
    load();
  }

  if (!rows) return msg ? <div className="alert error">{msg.text}</div> : <div className="spinner" />;
  return (
    <>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {!rows.length && <div className="empty">You have not booked or asked for anything yet. <Link to="/vendors">Browse vendors →</Link></div>}
      <div className="request-list">
        {rows.filter((r) => r.vendor).map((r) => {
          const open = ['requested', 'quoted', 'proposed', 'confirmed', 'accepted'].includes(r.status);
          return (
            <div key={r._id} className="card request-card">
              <div className="row between wrap">
                <div>
                  <span className="pill subtle">{KIND_LABEL[r.kind]}</span> <StatusPill r={r} />
                  <h3><Link to={`/vendors/${r.vendor._id}`}>{r.vendor.name}</Link></h3>
                  <p className="small">{summary(r)}</p>
                  {r.message && <p className="small muted">You wrote: "{r.message}"</p>}
                </div>
                <ContactButtons vendor={r.vendor} small />
              </div>
              {r.status === 'quoted' && (
                <div className="alert info">
                  <b>Quote: {money(r.quotedAmount, r.vendor.currency)}</b>
                  {r.vendorNote && <div>{r.vendorNote}</div>}
                  <div className="row gap wrap quote-actions">
                    <button className="btn sm" onClick={() => act(r, 'accept-quote', r.dates?.length ? `Quote accepted. You are booked with ${r.vendor.name} for ${niceDates(r.dates)}.` : `Quote accepted. ${r.vendor.name} will contact you to fix the date.`)}>
                      Accept{r.dates?.length ? ' and book the date' : ''}
                    </button>
                    <button className="btn ghost sm" onClick={() => act(r, 'decline-quote', 'Quote declined.')}>Decline</button>
                  </div>
                </div>
              )}
              {r.status === 'proposed' && (
                <div className="alert info">
                  <b>{r.vendor.name} suggests {niceTime(r.visitAt)}</b>
                  {r.vendorNote && <div>{r.vendorNote}</div>}
                  <div className="row gap quote-actions"><button className="btn sm" onClick={() => act(r, 'accept-time', 'Time confirmed.')}>That works</button></div>
                </div>
              )}
              {['confirmed', 'declined', 'cancelled', 'accepted'].includes(r.status) && r.vendorNote && <p className="small muted">Message from {r.vendor.name}: "{r.vendorNote}"</p>}
              {r.kind === 'quote' && r.status === 'confirmed' && <p className="small ok-text">Booked at the quoted price of {money(r.quotedAmount, r.vendor.currency)}.</p>}
              {open && (
                <button className="link-btn small" onClick={() => act(r, 'cancel', 'Cancelled. The vendor has been told.', r.status === 'confirmed' ? `Cancel your confirmed ${r.kind === 'visit' ? 'visit' : 'booking'} with ${r.vendor.name}? The date becomes free for others.` : null)}>
                  {r.status === 'confirmed' ? 'Cancel this booking' : 'Cancel request'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- Listing form ----------
const blank = { category: 'marriage-hall', name: '', tagline: '', description: '', city: '', state: '', address: '', capacityMin: '', capacityMax: '', priceFrom: '', priceUnit: 'per-day', services: '', imageUrl: '', phone: '', whatsapp: '', email: '', bookingsPerDay: 1, instantBooking: false, visitTypes: ['site-visit'] };
const toForm = (v) => ({ ...blank, ...v, services: (v.services || []).join(', '), phone: v.contact?.phone || '', whatsapp: v.contact?.whatsapp || '', email: v.contact?.email || '', capacityMin: v.capacityMin || '', capacityMax: v.capacityMax || '' });

function ListingForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState(initial ? toForm(initial) : blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const pickCategory = (id) => { const c = categoryOf(id); setF({ ...f, category: id, priceUnit: c.unit, visitTypes: c.visits }); };
  const toggleVisit = (t) => setF({ ...f, visitTypes: f.visitTypes.includes(t) ? f.visitTypes.filter((x) => x !== t) : [...f.visitTypes, t] });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { ...f, capacityMin: Number(f.capacityMin) || 0, capacityMax: Number(f.capacityMax) || 0, priceFrom: Number(f.priceFrom), contact: { phone: f.phone, whatsapp: f.whatsapp, email: f.email } };
    try {
      const { data } = initial ? await api.put(`/vendors/${initial._id}`, body) : await api.post('/vendors', body);
      onSaved(data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h3>{initial ? `Edit ${initial.name}` : 'List your business'}</h3>
      <div className="grid-3">
        <label>Type of business
          <select value={f.category} disabled={Boolean(initial)} onChange={(e) => pickCategory(e.target.value)}>
            {VENDOR_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.one}</option>)}
          </select>
        </label>
        <label className="span-2">Business name<input required minLength={3} value={f.name} onChange={set('name')} /></label>
      </div>
      <label>One-line summary<input maxLength={160} placeholder="e.g. AC wedding hall with parking for 200 cars" value={f.tagline} onChange={set('tagline')} /></label>
      <label>Description<textarea rows={4} value={f.description} onChange={set('description')} /></label>
      <div className="grid-3">
        <label>City<input required value={f.city} onChange={set('city')} /></label>
        <label>State<input value={f.state} onChange={set('state')} /></label>
        <label>Address / area<input value={f.address} onChange={set('address')} /></label>
        <label>Starting price ({f.currency || 'INR'})<input type="number" required min={0} value={f.priceFrom} onChange={set('priceFrom')} /></label>
        <label>Price is
          <select value={f.priceUnit} onChange={set('priceUnit')}>{Object.entries(UNIT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label>Bookings you can take per day<input type="number" min={1} max={20} value={f.bookingsPerDay} onChange={set('bookingsPerDay')} /></label>
        <label>Smallest guest count (optional)<input type="number" min={0} value={f.capacityMin} onChange={set('capacityMin')} /></label>
        <label>Largest guest count (blank = no limit)<input type="number" min={0} value={f.capacityMax} onChange={set('capacityMax')} /></label>
        <label>Photo web address (optional)<input placeholder="https://…" value={f.imageUrl} onChange={set('imageUrl')} /></label>
      </div>
      <label>What is included (comma separated)<input placeholder="AC hall, Parking, Bridal room, Generator backup" value={f.services} onChange={set('services')} /></label>
      <h4>How customers reach you</h4>
      <div className="grid-3">
        <label>Phone<input placeholder="+91…" value={f.phone} onChange={set('phone')} /></label>
        <label>WhatsApp number<input placeholder="+91…" value={f.whatsapp} onChange={set('whatsapp')} /></label>
        <label>Email<input type="email" value={f.email} onChange={set('email')} /></label>
      </div>
      <p className="muted tiny">Add at least one. These are shown on your listing; new requests are also emailed to this address.</p>
      <h4>Before they book, customers can schedule</h4>
      <div className="row gap wrap">
        {Object.entries(VISIT_LABEL).map(([k, l]) => (
          <label key={k} className="check"><input type="checkbox" checked={f.visitTypes.includes(k)} onChange={() => toggleVisit(k)} /> {l}</label>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={f.instantBooking} onChange={set('instantBooking')} /> Instant booking: confirm a free date automatically, without waiting for me</label>
      {error && <div className="alert error">{error}</div>}
      <div className="row gap">
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Publish listing'}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ---------- One incoming request, with the vendor's possible answers ----------
function IncomingRequest({ r, currency, onDone }) {
  const [mode, setMode] = useState(null); // quote | reschedule | decline
  const [amount, setAmount] = useState(r.quotedAmount || '');
  const [note, setNote] = useState('');
  const [at, setAt] = useState(r.visitAt ? `${ymd(new Date(r.visitAt))}T${new Date(r.visitAt).toTimeString().slice(0, 5)}` : '');
  const [error, setError] = useState('');

  async function respond(action, extra = {}) {
    setError('');
    try {
      await api.post(`/vendors/requests/${r._id}/respond`, { action, note, ...extra });
      setMode(null);
      onDone();
    } catch (err) {
      setError(errMsg(err));
    }
  }
  const waiting = ['requested', 'quoted', 'proposed'].includes(r.status);

  return (
    <div className="request-row incoming">
      <div className="row between wrap">
        <div className="small">
          <span className="pill subtle">{KIND_LABEL[r.kind]}</span> <StatusPill r={r} /> <b>{r.customerName}</b> · {summary(r)}
          {r.budget > 0 && <> · budget {money(r.budget, currency)}</>}
          {r.quotedAmount > 0 && <> · you quoted {money(r.quotedAmount, currency)}</>}
          <div className="muted">
            <a href={`mailto:${r.customerEmail}`}>{r.customerEmail}</a>{r.customerPhone && <> · <a href={`tel:${r.customerPhone}`}>{r.customerPhone}</a></>}
          </div>
          {r.message && <div className="muted">"{r.message}"</div>}
        </div>
        <div className="row gap wrap">
          {r.kind !== 'quote' && ['requested', 'proposed'].includes(r.status) && <button className="btn sm" onClick={() => respond('confirm')}>Confirm</button>}
          {r.kind === 'quote' && ['requested', 'quoted'].includes(r.status) && <button className="btn sm" onClick={() => setMode('quote')}>{r.status === 'quoted' ? 'Change quote' : 'Send quote'}</button>}
          {r.kind === 'visit' && ['requested', 'confirmed', 'proposed'].includes(r.status) && <button className="btn ghost sm" onClick={() => setMode('reschedule')}>Suggest another time</button>}
          {waiting && <button className="btn ghost sm" onClick={() => setMode('decline')}>Decline</button>}
          {r.status === 'confirmed' && <button className="btn ghost sm" onClick={() => window.confirm('Cancel this confirmed booking? The customer is told and the date becomes free.') && respond('cancel')}>Cancel</button>}
        </div>
      </div>
      {mode && (
        <div className="row gap wrap respond-box">
          {mode === 'quote' && <input type="number" min={1} placeholder={`Your price (${currency})`} aria-label="Quote amount" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          {mode === 'reschedule' && <input type="datetime-local" aria-label="New date and time" value={at} onChange={(e) => setAt(e.target.value)} />}
          <input className="grow" placeholder="Message to the customer (optional)" aria-label="Message to the customer" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn sm" onClick={() => (mode === 'quote' ? respond('quote', { quotedAmount: amount }) : mode === 'reschedule' ? respond('reschedule', { visitAt: new Date(at) }) : respond('decline'))}>
            {mode === 'quote' ? 'Send quote' : mode === 'reschedule' ? 'Suggest this time' : 'Decline request'}
          </button>
          <button className="btn ghost sm" onClick={() => setMode(null)}>Back</button>
        </div>
      )}
      {error && <div className="alert error">{error}</div>}
    </div>
  );
}

// ---------- My listings: calendar and incoming requests ----------
function MyListings({ startNew }) {
  const [listings, setListings] = useState(null);
  const [requests, setRequests] = useState([]);
  const [editing, setEditing] = useState(startNew ? 'new' : null); // 'new' or a listing
  const [calendarFor, setCalendarFor] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [msg, setMsg] = useState(null);

  const load = () => {
    api.get('/vendors/mine').then((r) => setListings(r.data)).catch((e) => setMsg({ type: 'error', text: errMsg(e) }));
    api.get('/vendors/requests/received').then((r) => setRequests(r.data)).catch(() => {});
    setReloadKey((n) => n + 1);
  };
  useEffect(() => { load(); }, []);

  async function toggleDate(v, date, isBlocked) {
    try { await api.post(`/vendors/${v._id}/blocked-dates`, { dates: [date], blocked: !isBlocked }); setReloadKey((n) => n + 1); } catch (e) { setMsg({ type: 'error', text: errMsg(e) }); }
  }
  async function setActive(v, active) {
    try { await api.put(`/vendors/${v._id}`, { active }); setMsg({ type: 'success', text: active ? `${v.name} is visible in search again.` : `${v.name} is paused and hidden from search.` }); } catch (e) { setMsg({ type: 'error', text: errMsg(e) }); }
    load();
  }
  async function remove(v) {
    if (!window.confirm(`Delete the listing "${v.name}"? This cannot be undone.`)) return;
    try { await api.delete(`/vendors/${v._id}`); setMsg({ type: 'success', text: 'Listing deleted.' }); } catch (e) { setMsg({ type: 'error', text: errMsg(e) }); }
    load();
  }

  if (!listings) return msg ? <div className="alert error">{msg.text}</div> : <div className="spinner" />;
  if (editing) return <ListingForm initial={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={(v) => { setEditing(null); setMsg({ type: 'success', text: `${v.name} saved.` }); load(); }} />;

  return (
    <>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <div className="row between">
        <p className="muted small">List a hall, catering service, planning service, decoration service or photography service. Customers can then book you, ask for quotes and schedule visits.</p>
        <button className="btn" onClick={() => setEditing('new')}>+ New listing</button>
      </div>
      {!listings.length && <div className="empty">You have no listings yet.</div>}
      {listings.map((v) => {
        const mine = requests.filter((r) => r.vendor?._id === v._id);
        const waiting = mine.filter((r) => ['requested', 'proposed'].includes(r.status) || (r.kind === 'quote' && r.status === 'requested'));
        const shown = calendarFor === v._id;
        return (
          <div key={v._id} className="card listing-card">
            <div className="row between wrap">
              <div>
                <span className="pill subtle">{categoryOf(v.category).one}</span> {v.active ? <span className="pill ok">Live</span> : <span className="pill warn">Paused</span>}
                {waiting.length > 0 && <span className="pill warn">{waiting.length} waiting for your answer</span>}
                <h3><Link to={`/vendors/${v._id}`}>{v.name}</Link></h3>
                <p className="small muted">{v.city} · {priceText(v)} · {capacityText(v)} · {v.bookingsPerDay} booking{v.bookingsPerDay === 1 ? '' : 's'} per day{v.instantBooking && ' · instant booking'}</p>
              </div>
              <div className="row gap wrap">
                <button className="btn ghost sm" onClick={() => setCalendarFor(shown ? null : v._id)}>{shown ? 'Hide calendar' : 'Manage calendar'}</button>
                <button className="btn ghost sm" onClick={() => setEditing(v)}>Edit</button>
                <button className="btn ghost sm" onClick={() => setActive(v, !v.active)}>{v.active ? 'Pause' : 'Make live'}</button>
                <button className="icon-btn" title="Delete listing" onClick={() => remove(v)}>✕</button>
              </div>
            </div>
            {shown && <AvailabilityCalendar vendorId={v._id} mode="manage" reloadKey={reloadKey} onToggle={(date, isBlocked) => toggleDate(v, date, isBlocked)} />}
            <h4>Requests ({mine.length})</h4>
            {!mine.length && <p className="muted small">No requests yet. Bookings, quote requests and visit requests for this listing appear here, and under the bell.</p>}
            {mine.map((r) => <IncomingRequest key={r._id} r={r} currency={v.currency} onDone={load} />)}
          </div>
        );
      })}
    </>
  );
}

export default function VendorHub() {
  const params = new URLSearchParams(window.location.search);
  const [tab, setTab] = useState(params.get('tab') === 'listings' ? 'listings' : 'requests');
  return (
    <div className="page wide">
      <div className="row between wrap">
        <h1 className="no-margin">Vendor bookings</h1>
        <Link className="btn ghost sm" to="/vendors">Browse vendors</Link>
      </div>
      <div className="tabs">
        <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>My bookings &amp; requests</button>
        <button className={tab === 'listings' ? 'on' : ''} onClick={() => setTab('listings')}>My listings</button>
      </div>
      {tab === 'requests' ? <MyRequests /> : <MyListings startNew={params.get('new') === '1'} />}
    </div>
  );
}
