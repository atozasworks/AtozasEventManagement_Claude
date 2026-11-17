import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { CATEGORIES, FORMATS, toLocalInput } from '../utils/format.js';

const MODULES = [
  ['ticketing', 'Ticketing & payments', 'UPI, cards, wallets, tiered tickets'],
  ['agenda', 'Agenda', 'Multi-track sessions & speakers'],
  ['streaming', 'Live streaming', 'Virtual stage, chat, Q&A, reactions'],
  ['expo', 'Expo / sponsors', 'Virtual booths + on-site stall map, lead capture'],
  ['networking', 'Networking', 'Attendee directory & connection requests'],
  ['checkin', 'On-ground check-in', 'QR scanning, offline gate mode'],
  ['budget', 'Budget tracking', 'Estimated vs actual by category'],
  ['crm', 'CRM sync', 'Push registrations to HubSpot/Salesforce/webhook'],
];

const PRESETS = {
  conference: { format: 'hybrid', modules: { ticketing: true, agenda: true, streaming: true, expo: true, networking: true, checkin: true, budget: true, crm: true } },
  webinar: { format: 'virtual', modules: { ticketing: true, agenda: true, streaming: true, networking: false, expo: false, checkin: false, budget: false, crm: true } },
  festival: { format: 'in-person', modules: { ticketing: true, agenda: true, checkin: true, budget: true, streaming: false, expo: false, networking: false, crm: false } },
  workshop: { format: 'in-person', modules: { ticketing: true, checkin: true, agenda: false, budget: false, streaming: false, expo: false, networking: false, crm: false } },
};

const blank = {
  title: '', summary: '', description: '', category: 'conference', format: 'hybrid', visibility: 'public',
  startDate: '', endDate: '', currency: 'INR', coverImage: '', tags: [],
  location: { venueName: '', address: '', city: '', state: '', country: 'India' },
  modules: PRESETS.conference.modules,
  ticketTypes: [{ name: 'General Admission', price: 0, quantity: 100, maxPerOrder: 10, access: 'both', description: '' }],
  groupDiscount: { minQty: 0, percent: 0 },
  registrationFields: [],
  sessions: [],
  integrations: { crmProvider: 'none', webhookUrl: '' },
};

function ListEditor({ items, onChange, render, add, addLabel }) {
  const update = (i, patch) => onChange(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <div className="list-editor">
      {items.map((it, i) => (
        <div key={it._id || i} className="list-item">
          {render(it, (patch) => update(i, patch))}
          <button type="button" className="icon-btn" title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="btn ghost sm" onClick={() => onChange([...items, add()])}>+ {addLabel}</button>
    </div>
  );
}

export default function EventEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ev, setEv] = useState(blank);
  const [venues, setVenues] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    api.get('/venues').then((r) => setVenues(r.data)).catch(() => {});
    if (id) {
      api.get(`/events/${id}`).then((r) => {
        const d = r.data;
        setEv({ ...blank, ...d, location: { ...blank.location, ...d.location, venue: d.location?.venue }, integrations: { ...blank.integrations, ...d.integrations }, groupDiscount: { ...blank.groupDiscount, ...d.groupDiscount } });
        setLoaded(true);
      }).catch((e) => setError(errMsg(e)));
    }
  }, [id]);

  const set = (k, v) => setEv((e) => ({ ...e, [k]: v }));
  const setLoc = (k, v) => setEv((e) => ({ ...e, location: { ...e.location, [k]: v } }));

  function applyPreset(category) {
    const p = PRESETS[category];
    setEv((e) => ({ ...e, category, ...(p && !id ? { format: p.format, modules: p.modules } : {}) }));
  }

  function pickVenue(venueId) {
    const v = venues.find((x) => x._id === venueId);
    setEv((e) => ({
      ...e,
      location: v
        ? { venue: v._id, venueName: v.name, address: v.address || '', city: v.city, state: v.state || '', country: v.country }
        : { ...e.location, venue: undefined },
    }));
  }

  async function save(publish) {
    setBusy(true);
    setError('');
    try {
      // Date inputs hold the organizer's local time; send exact moments so the server's own timezone never shifts them
      const moment = (v) => (v ? new Date(v) : null);
      const payload = {
        ...ev,
        startDate: new Date(ev.startDate),
        endDate: new Date(ev.endDate),
        ticketTypes: ev.ticketTypes.map((t) => ({ ...t, salesStart: moment(t.salesStart), salesEnd: moment(t.salesEnd) })),
        sessions: ev.sessions.map((s) => ({ ...s, startTime: moment(s.startTime), endTime: moment(s.endTime) })),
      };
      if (!payload.location.venue) delete payload.location.venue;
      const { data } = id ? await api.put(`/events/${id}`, payload) : await api.post('/events', payload);
      if (publish) await api.post(`/events/${data._id}/status`, { status: 'published' });
      navigate(`/organize/${data._id}`);
    } catch (e) {
      setError(errMsg(e));
      window.scrollTo(0, 0);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <div className="page">{error ? <div className="alert error">{error}</div> : <div className="spinner" />}</div>;
  const needsVenue = ev.format !== 'virtual';

  return (
    <div className="page editor">
      <h1>{id ? 'Edit event' : 'Create an event'}</h1>
      {error && <div className="alert error">{error}</div>}

      <section className="card">
        <h3>1. Basics</h3>
        <label>Event title<input required value={ev.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Bengaluru AI Summit" /></label>
        <label>Short summary<input maxLength={280} value={ev.summary} onChange={(e) => set('summary', e.target.value)} /></label>
        <label>Description<textarea rows={5} value={ev.description} onChange={(e) => set('description', e.target.value)} /></label>
        <div className="grid-3">
          <label>Type
            <select value={ev.category} onChange={(e) => applyPreset(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Format
            <select value={ev.format} onChange={(e) => set('format', e.target.value)}>
              {FORMATS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label>Visibility
            <select value={ev.visibility} onChange={(e) => set('visibility', e.target.value)}>
              <option value="public">Public (listed in marketplace)</option>
              <option value="private">Private (link only)</option>
            </select>
          </label>
          <label>Starts<input type="datetime-local" value={toLocalInput(ev.startDate)} onChange={(e) => set('startDate', e.target.value)} /></label>
          <label>Ends<input type="datetime-local" value={toLocalInput(ev.endDate)} onChange={(e) => set('endDate', e.target.value)} /></label>
          <label>Currency
            <select value={ev.currency} onChange={(e) => set('currency', e.target.value)}>
              {['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>
        <label>Tags (comma separated)<input value={ev.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} /></label>
        <label>Cover image URL (optional)<input value={ev.coverImage || ''} onChange={(e) => set('coverImage', e.target.value)} /></label>
      </section>

      {needsVenue && (
        <section className="card">
          <h3>2. Venue</h3>
          <label>Pick from venue marketplace
            <select value={ev.location.venue || ''} onChange={(e) => pickVenue(e.target.value)}>
              <option value="">— Custom location —</option>
              {venues.map((v) => <option key={v._id} value={v._id}>{v.name} · {v.city} · up to {v.capacity}</option>)}
            </select>
          </label>
          <div className="grid-3">
            <label>Venue name<input value={ev.location.venueName} onChange={(e) => setLoc('venueName', e.target.value)} /></label>
            <label>City<input value={ev.location.city} onChange={(e) => setLoc('city', e.target.value)} /></label>
            <label>State<input value={ev.location.state || ''} onChange={(e) => setLoc('state', e.target.value)} /></label>
          </div>
          <label>Address<input value={ev.location.address || ''} onChange={(e) => setLoc('address', e.target.value)} /></label>
        </section>
      )}

      <section className="card">
        <h3>{needsVenue ? 3 : 2}. Modules</h3>
        <p className="muted small">Turn on only what this event needs. Choosing a type above pre-selects a sensible set.</p>
        <div className="module-grid">
          {MODULES.map(([key, label, hint]) => (
            <label key={key} className={`module ${ev.modules[key] ? 'on' : ''}`}>
              <input type="checkbox" checked={!!ev.modules[key]} onChange={(e) => set('modules', { ...ev.modules, [key]: e.target.checked })} />
              <div><b>{label}</b><div className="muted tiny">{hint}</div></div>
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Tickets</h3>
        <ListEditor
          items={ev.ticketTypes}
          onChange={(v) => set('ticketTypes', v)}
          addLabel="Add ticket type"
          add={() => ({ name: '', price: 0, quantity: 100, maxPerOrder: 10, access: 'both', description: '' })}
          render={(t, up) => (
            <div className="grid-6">
              <label>Name<input value={t.name} onChange={(e) => up({ name: e.target.value })} /></label>
              <label>Price ({ev.currency})<input type="number" min={0} value={t.price} onChange={(e) => up({ price: Number(e.target.value) })} /></label>
              <label>Quantity<input type="number" min={0} value={t.quantity} onChange={(e) => up({ quantity: Number(e.target.value) })} /></label>
              <label>Max/order<input type="number" min={1} value={t.maxPerOrder} onChange={(e) => up({ maxPerOrder: Number(e.target.value) })} /></label>
              <label>Access
                <select value={t.access} onChange={(e) => up({ access: e.target.value })}>
                  <option value="both">In-person + online</option>
                  <option value="in-person">In-person only</option>
                  <option value="virtual">Online only</option>
                </select>
              </label>
              <label>Description<input value={t.description || ''} onChange={(e) => up({ description: e.target.value })} /></label>
              <label className="span-2">Sale starts (optional)<input type="datetime-local" value={toLocalInput(t.salesStart)} onChange={(e) => up({ salesStart: e.target.value || null })} /></label>
              <label className="span-2">Sale ends (optional)<input type="datetime-local" value={toLocalInput(t.salesEnd)} onChange={(e) => up({ salesEnd: e.target.value || null })} /></label>
              {t.sold > 0 && <span className="muted tiny">{t.sold} sold</span>}
            </div>
          )}
        />
        <p className="muted tiny">Early-bird pricing: add a cheaper ticket type and give it a "Sale ends" date. It closes by itself on that date or when it sells out.</p>

        <label className="check">
          <input type="checkbox" checked={ev.allowTransfers !== false} onChange={(e) => set('allowTransfers', e.target.checked)} />
          Let ticket holders transfer a ticket to someone else (until the event starts)
        </label>

        <label className="check">
          <input type="checkbox" checked={ev.allowCancelRequests !== false} onChange={(e) => set('allowCancelRequests', e.target.checked)} />
          Let buyers request a refund from "My Tickets" (you approve or decline each request)
        </label>
        <label>Refund policy shown to buyers before they pay
          <textarea rows={2} maxLength={600} placeholder="Refunds are at the organizer's discretion. If the event is cancelled you are refunded in full." value={ev.refundPolicy ?? ''} onChange={(e) => set('refundPolicy', e.target.value)} />
        </label>

        <h4>Group discount</h4>
        <div className="grid-3">
          <label>Tickets in one order (0 = off)
            <input type="number" min={0} value={ev.groupDiscount.minQty} onChange={(e) => set('groupDiscount', { ...ev.groupDiscount, minQty: Number(e.target.value) })} />
          </label>
          <label>Percent off
            <input type="number" min={0} max={100} value={ev.groupDiscount.percent} onChange={(e) => set('groupDiscount', { ...ev.groupDiscount, percent: Number(e.target.value) })} />
          </label>
        </div>
        <p className="muted tiny">
          Example: 5 and 10 gives 10% off any order with 5 or more tickets. A buyer gets either this or a promo code, whichever saves more.
          Promo codes are managed in the "Promo codes" tab of the event dashboard.
        </p>
      </section>

      <section className="card">
        <h3>Registration form</h3>
        <p className="muted small">Name, email and WhatsApp number are always collected. Add custom questions here.</p>
        <ListEditor
          items={ev.registrationFields}
          onChange={(v) => set('registrationFields', v)}
          addLabel="Add question"
          add={() => ({ label: '', type: 'text', options: [], required: false })}
          render={(f, up) => (
            <div className="grid-4">
              <label>Question<input value={f.label} onChange={(e) => up({ label: e.target.value })} /></label>
              <label>Type
                <select value={f.type} onChange={(e) => up({ type: e.target.value })}>
                  {['text', 'email', 'number', 'select', 'checkbox'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              {f.type === 'select' ? (
                <label>Options (comma separated)<input value={(f.options || []).join(', ')} onChange={(e) => up({ options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} /></label>
              ) : <span />}
              <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => up({ required: e.target.checked })} /> Required</label>
            </div>
          )}
        />
      </section>

      {ev.modules.agenda && (
        <section className="card">
          <h3>Agenda & streams</h3>
          <ListEditor
            items={ev.sessions}
            onChange={(v) => set('sessions', v)}
            addLabel="Add session"
            add={() => ({ title: '', speaker: '', track: 'Main Stage', room: '', startTime: ev.startDate, endTime: ev.startDate, streamUrl: '' })}
            render={(s, up) => (
              <div className="grid-4">
                <label>Title<input value={s.title} onChange={(e) => up({ title: e.target.value })} /></label>
                <label>Speaker<input value={s.speaker || ''} onChange={(e) => up({ speaker: e.target.value })} /></label>
                <label>Track<input value={s.track || ''} onChange={(e) => up({ track: e.target.value })} /></label>
                <label>Room<input value={s.room || ''} onChange={(e) => up({ room: e.target.value })} /></label>
                <label>Starts<input type="datetime-local" value={toLocalInput(s.startTime)} onChange={(e) => up({ startTime: e.target.value })} /></label>
                <label>Ends<input type="datetime-local" value={toLocalInput(s.endTime)} onChange={(e) => up({ endTime: e.target.value })} /></label>
                {ev.modules.streaming && (
                  <label className="span-2">Stream URL (YouTube Live / Vimeo embed)<input value={s.streamUrl || ''} onChange={(e) => up({ streamUrl: e.target.value })} /></label>
                )}
              </div>
            )}
          />
        </section>
      )}

      {ev.modules.crm && (
        <section className="card">
          <h3>CRM integration</h3>
          <div className="grid-3">
            <label>Provider
              <select value={ev.integrations.crmProvider} onChange={(e) => set('integrations', { ...ev.integrations, crmProvider: e.target.value })}>
                {['none', 'webhook', 'hubspot', 'salesforce', 'zoho'].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="span-2">Webhook URL
              <input placeholder="https://hooks.zapier.com/…" value={ev.integrations.webhookUrl || ''} onChange={(e) => set('integrations', { ...ev.integrations, webhookUrl: e.target.value })} />
            </label>
          </div>
          <p className="muted tiny">Each paid registration is POSTed as JSON with contact, ticket and UTM attribution data.</p>
        </section>
      )}

      <div className="row gap sticky-actions">
        <button className="btn ghost" disabled={busy} onClick={() => save(false)}>{id ? 'Save changes' : 'Save as draft'}</button>
        {(!id || ev.status === 'draft') && <button className="btn" disabled={busy} onClick={() => save(true)}>Save & publish</button>}
      </div>
    </div>
  );
}
