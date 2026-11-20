import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import AvailabilityCalendar from '../components/AvailabilityCalendar.jsx';
import { ContactButtons, VendorCover } from './Vendors.jsx';
import { VISIT_LABEL, categoryOf, capacityText, priceText, formatsOf, niceDates, ymd } from '../utils/vendors.js';

// Default time for a visit: tomorrow at 11:00, in the form <input type="datetime-local"> wants
function tomorrowAt11() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${ymd(d)}T11:00`;
}

export default function VendorDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  const [vendor, setVendor] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('booking'); // booking | quote | visit
  const [range, setRange] = useState(() => (params.get('date') ? { start: params.get('date'), end: params.get('date') } : null));
  const [form, setForm] = useState({ guests: '', budget: '', message: '', phone: '', visitType: '', visitAt: tomorrowAt11() });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [calOpen, setCalOpen] = useState(true); // calendar under the date line: open for "Book a date", a click away for "Get a quote"
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    api.get(`/vendors/${id}`).then((r) => {
      setVendor(r.data);
      const modes = formatsOf(r.data);
      setTab(modes.direct ? 'booking' : modes.quota ? 'quote' : 'visit');
      set({ visitType: r.data.visitTypes?.[0] || '' });
    }).catch((e) => setError(errMsg(e)));
  }, [id]);
  useEffect(() => { if (user?.phone) set({ phone: user.phone }); }, [user]);

  if (error) return <div className="page"><div className="alert error">{error}</div><Link to="/vendors">← Back to all vendors</Link></div>;
  if (!vendor) return <div className="page"><div className="spinner" /></div>;

  const cat = categoryOf(vendor.category);
  const modes = formatsOf(vendor);
  const mine = user && vendor.owner === user._id;
  const dates = range ? (range.start === range.end ? [range.start] : [range.start, range.end]) : [];

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const body = { kind: tab, guests: form.guests, message: form.message, phone: form.phone };
      if (tab === 'booking' || (tab === 'quote' && range)) Object.assign(body, { date: range?.start, endDate: range?.end });
      if (tab === 'quote') body.budget = form.budget;
      if (tab === 'visit') Object.assign(body, { visitType: form.visitType, visitAt: new Date(form.visitAt) });
      const { data } = await api.post(`/vendors/${vendor._id}/requests`, body);
      setDone(data);
      setReloadKey((n) => n + 1);
    } catch (err) {
      setFormError(errMsg(err));
      setReloadKey((n) => n + 1); // the date may just have been taken - show the latest calendar
    } finally {
      setBusy(false);
    }
  }

  const doneText = done && (
    done.kind === 'booking'
      ? done.status === 'confirmed'
        ? `You are booked with ${vendor.name} for ${niceDates(done.dates)}. A confirmation has been emailed to you both.`
        : `Your booking request for ${niceDates(done.dates)} has been sent. ${vendor.name} will confirm or decline, and you will be notified.`
      : done.kind === 'quote'
        ? `Your quote request has been sent. ${vendor.name} will reply with a price, and you will be notified.`
        : `Your ${VISIT_LABEL[done.visitType].toLowerCase()} request has been sent. ${vendor.name} will confirm the time or suggest another.`
  );

  return (
    <div className="page wide">
      <p className="small"><Link to="/vendors">← All vendors</Link></p>
      <VendorCover vendor={vendor} large />
      <div className="two-col vendor-detail">
        <div>
          <span className="pill subtle">{cat.one}</span>
          {!vendor.active && <span className="pill warn">Paused — hidden from search</span>}
          <h1 className="no-margin">{vendor.name}</h1>
          <p className="muted">{[vendor.address, vendor.city, vendor.state].filter(Boolean).join(', ')}</p>
          {vendor.tagline && <p className="lead-text">{vendor.tagline}</p>}
          <div className="stats vendor-stats">
            <div className="stat"><span>Price</span><b>{priceText(vendor)}</b></div>
            <div className="stat"><span>Guests</span><b>{capacityText(vendor)}</b></div>
            <div className="stat"><span>Booking</span><b>{modes.direct && modes.quota ? 'Quote or direct' : modes.direct ? 'Direct booking' : 'Quotation'}</b><small>{modes.direct && modes.quota ? 'Ask for a price, or book a free date now' : modes.direct ? 'A free date is confirmed at once' : 'Ask for a quotation. The date is booked only if you accept the price'}</small></div>
          </div>
          {vendor.description && (<><h3>About</h3><p className="prewrap">{vendor.description}</p></>)}
          {vendor.services?.length > 0 && (<><h3>What is included</h3><div className="tags">{vendor.services.map((s) => <span key={s} className="tag">{s}</span>)}</div></>)}

          <h3>Talk to them directly</h3>
          <ContactButtons vendor={vendor} />
          {vendor.contact?.email && <p className="small muted">{vendor.contact.email}</p>}
        </div>

        <aside className="card">
          {mine ? (
            <>
              <h3>This is your listing</h3>
              <p className="muted small">Customers see this page. Manage the calendar and answer requests from your hub.</p>
              <Link className="btn block" to="/vendors/hub?tab=listings">Manage listing</Link>
            </>
          ) : done ? (
            <div className="center">
              <div className="big-check">✓</div>
              <h3>{done.status === 'confirmed' ? 'Booked!' : 'Request sent'}</h3>
              <p className="muted">{doneText}</p>
              <Link className="btn block" to="/vendors/hub">View my bookings &amp; requests</Link>
              <button className="btn ghost block" onClick={() => { setDone(null); set({ message: '' }); }}>Send another request</button>
            </div>
          ) : (
            <>
              <div className="segmented">
                {modes.direct && <button type="button" className={tab === 'booking' ? 'on' : ''} onClick={() => { setTab('booking'); setFormError(''); setCalOpen(true); }}>Book a date</button>}
                {modes.quota && <button type="button" className={tab === 'quote' ? 'on' : ''} onClick={() => { setTab('quote'); setFormError(''); setCalOpen(false); }}>Get a quote</button>}
                {vendor.visitTypes?.length > 0 && <button type="button" className={tab === 'visit' ? 'on' : ''} onClick={() => { setTab('visit'); setFormError(''); }}>Visit / tasting</button>}
              </div>

              <form onSubmit={submit}>
                {tab !== 'visit' && (
                  <div className="date-picker">
                    {/* The availability calendar opens right here, under the date line */}
                    <button type="button" className={`picked-date ${range ? 'on' : ''}`} aria-expanded={calOpen} onClick={() => setCalOpen((o) => !o)}>
                      <span key={range ? 'picked' : tab}>{range ? <b>{niceDates(dates)}</b> : tab === 'booking' ? 'Pick your date on the calendar' : 'Pick a date on the calendar (optional)'}</span>
                      <span aria-hidden="true">{calOpen ? '▴' : '▾'}</span>
                    </button>
                    {/* Hidden, not removed, when closed: it keeps the month you were looking at */}
                    <div className="date-picker-cal" hidden={!calOpen}>
                      <AvailabilityCalendar vendorId={vendor._id} mode="pick" value={range} onChange={setRange} reloadKey={reloadKey} />
                    </div>
                    {range && <button type="button" className="link-btn tiny date-picker-clear" onClick={() => setRange(null)}>Clear date</button>}
                  </div>
                )}
                {tab === 'visit' && (
                  <>
                    <label>What would you like to schedule?
                      <select value={form.visitType} onChange={(e) => set({ visitType: e.target.value })}>
                        {vendor.visitTypes.map((t) => <option key={t} value={t}>{VISIT_LABEL[t]}</option>)}
                      </select>
                    </label>
                    <label>Preferred date and time<input type="datetime-local" required min={`${ymd(new Date())}T00:00`} value={form.visitAt} onChange={(e) => set({ visitAt: e.target.value })} /></label>
                  </>
                )}
                {tab !== 'visit' && <label>Number of guests<input type="number" min={0} max={vendor.capacityMax || undefined} placeholder={vendor.capacityMax ? `Up to ${vendor.capacityMax}` : ''} value={form.guests} onChange={(e) => set({ guests: e.target.value })} /></label>}
                {tab === 'quote' && <label>Your budget in {vendor.currency} (optional)<input type="number" min={0} value={form.budget} onChange={(e) => set({ budget: e.target.value })} /></label>}
                <label key={tab === 'quote' ? 'need' : 'note'}>{tab === 'quote' ? 'What do you need? (menu, hours, style, extras…)' : 'Message (optional)'}
                  <textarea rows={3} maxLength={1000} required={tab === 'quote'} minLength={tab === 'quote' ? 10 : undefined} value={form.message} onChange={(e) => set({ message: e.target.value })} />
                </label>
                <label>Your phone / WhatsApp number<input placeholder="+91…" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></label>
                {formError && <div className="alert error">{formError}</div>}
                {user ? (
                  <button key={busy ? 'sending' : tab} className="btn block" disabled={busy || (tab === 'booking' && !range)}>
                    {busy ? 'Sending…' : tab === 'booking' ? (vendor.instantBooking ? 'Book now' : 'Request this date') : tab === 'quote' ? 'Request a quote' : 'Request this time'}
                  </button>
                ) : (
                  <Link className="btn block" to="/login" state={{ from: location.pathname + location.search }}>Log in to continue</Link>
                )}
                <p key={tab} className="muted tiny">
                  {tab === 'booking' && (vendor.instantBooking ? 'The date is held for you as soon as you book.' : 'Nothing is charged here. The date is yours once the vendor confirms; you agree payment with them directly.')}
                  {tab === 'quote' && 'The vendor replies with a price. Accepting a quote for a date books that date.'}
                  {tab === 'visit' && 'The vendor confirms the time or suggests another one.'}
                </p>
              </form>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
