import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { dateLong, money, num } from '../utils/format.js';

function Bars({ rows, label, value, format = num }) {
  const max = Math.max(1, ...rows.map((r) => r[value]));
  if (!rows.length) return <p className="muted small">No data yet.</p>;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r[label]} className="bar-row">
          <span className="bar-label">{r[label]}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(r[value] / max) * 100}%` }} /></div>
          <span className="bar-value">{format(r[value])}</span>
        </div>
      ))}
    </div>
  );
}

function Overview({ event }) {
  const [a, setA] = useState(null);
  useEffect(() => { api.get(`/events/${event._id}/analytics`).then((r) => setA(r.data)); }, [event._id]);
  if (!a) return <div className="spinner" />;
  const m = (n) => money(n, event.currency);
  return (
    <>
      <div className="stats">
        <div className="stat"><span>Revenue</span><b>{m(a.revenue)}</b></div>
        <div className="stat"><span>Tickets issued</span><b>{num(a.ticketsSold)}</b></div>
        <div className="stat"><span>Checked in</span><b>{num(a.checkedIn)} <small>({a.ticketsSold ? Math.round((a.checkedIn / a.ticketsSold) * 100) : 0}%)</small></b></div>
        <div className="stat"><span>Page views → orders</span><b>{num(a.views)} → {num(a.orders)} <small>({a.conversionRate.toFixed(1)}%)</small></b></div>
      </div>
      <div className="grid-2">
        <div className="card">
          <h4>Ticket sales by type</h4>
          <Bars rows={a.ticketTypes.map((t) => ({ name: `${t.name}`, sold: t.sold }))} label="name" value="sold" />
          <p className="muted tiny">Capacity: {a.ticketTypes.map((t) => `${t.name} ${t.sold}/${t.quantity}`).join(' · ')}</p>
        </div>
        <div className="card">
          <h4>Marketing attribution (UTM source)</h4>
          <Bars rows={a.bySource} label="source" value="orders" />
          <p className="muted tiny">Share links like <code>/e/{event.slug}?utm_source=linkedin&utm_campaign=launch</code></p>
        </div>
        <div className="card">
          <h4>Orders per day</h4>
          <Bars rows={a.salesByDay} label="date" value="orders" />
        </div>
        <div className="card">
          <h4>Payment methods</h4>
          <Bars rows={a.byPaymentMethod} label="method" value="orders" />
        </div>
        {event.modules?.expo && (
          <div className="card">
            <h4>Sponsor booth engagement</h4>
            <Bars rows={a.booths.map((b) => ({ name: b.sponsorName, visits: b.visits }))} label="name" value="visits" />
            <p className="muted tiny">Leads: {a.booths.map((b) => `${b.sponsorName} ${b.leads}`).join(' · ') || '—'}</p>
          </div>
        )}
        {event.modules?.budget && (
          <div className="card">
            <h4>Budget vs revenue</h4>
            <Bars
              rows={[
                { k: 'Budget', v: a.budget.total },
                { k: 'Estimated cost', v: a.budget.estimated },
                { k: 'Actual spend', v: a.budget.actual },
                { k: 'Ticket revenue', v: a.revenue },
              ]}
              label="k" value="v" format={m}
            />
            <p className={`small ${a.budget.profit >= 0 ? 'ok-text' : 'warn-text'}`}>Revenue − actual spend: {m(a.budget.profit)}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Attendees({ event }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api.get(`/events/${event._id}/attendees`).then((r) => setRows(r.data)); }, [event._id]);

  async function exportCsv() {
    const r = await api.get(`/events/${event._id}/attendees`, { params: { format: 'csv' }, responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.slug}-attendees.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!rows) return <div className="spinner" />;
  const filtered = rows.filter((t) => `${t.holderName} ${t.holderEmail} ${t.code}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="row between">
        <input className="search" placeholder="Search name, email or code…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn ghost sm" onClick={exportCsv}>Export CSV (CRM import)</button>
      </div>
      <table className="table">
        <thead><tr><th>Name</th><th>Ticket</th><th>Code</th><th>Source</th><th>Status</th></tr></thead>
        <tbody>
          {filtered.map((t) => (
            <tr key={t._id}>
              <td><b>{t.holderName}</b><div className="muted tiny">{t.holderEmail}</div></td>
              <td>{t.ticketTypeName}<div className="muted tiny">{t.access}</div></td>
              <td><code>{t.code}</code></td>
              <td>{t.order?.attribution?.source || 'direct'}</td>
              <td>{t.checkedIn ? <span className="pill ok">Checked in</span> : <span className="pill subtle">Registered</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{filtered.length} of {rows.length} tickets</p>
    </>
  );
}

// Offline-capable gate check-in: downloads the manifest, validates locally when offline, syncs later
function CheckIn({ event }) {
  const key = `es_manifest_${event._id}`;
  const queueKey = `es_queue_${event._id}`;
  const [manifest, setManifest] = useState(() => JSON.parse(localStorage.getItem(key) || 'null'));
  const [queue, setQueue] = useState(() => JSON.parse(localStorage.getItem(queueKey) || '[]'));
  const [offline, setOffline] = useState(!navigator.onLine);
  const [gate, setGate] = useState('Gate 1');
  const [code, setCode] = useState('');
  const [last, setLast] = useState(null);
  const [log, setLog] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { localStorage.setItem(queueKey, JSON.stringify(queue)); }, [queue, queueKey]);

  async function download() {
    const { data } = await api.get(`/tickets/manifest/${event._id}`);
    localStorage.setItem(key, JSON.stringify(data));
    setManifest(data);
  }

  async function sync() {
    if (!queue.length) return;
    const { data } = await api.post('/tickets/checkin/sync', { eventId: event._id, scans: queue });
    setQueue([]);
    setLog((l) => [...data.results.map((r) => ({ ...r, synced: true })), ...l].slice(0, 50));
    await download();
  }

  function localCheck(c) {
    const t = manifest?.tickets.find((x) => x.code === c);
    if (!t) return { code: c, result: 'invalid', message: 'Not in downloaded list' };
    if (t.checkedIn || queue.some((s) => s.code === c)) return { code: c, result: 'duplicate', holderName: t.holderName, message: 'Already scanned' };
    setQueue((q) => [...q, { code: c, gate, at: new Date().toISOString() }]);
    return { code: c, result: 'ok', holderName: t.holderName, ticketTypeName: t.ticketTypeName, offline: true };
  }

  async function scan(e) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    let r;
    if (offline) r = localCheck(c);
    else {
      try {
        r = (await api.post('/tickets/checkin', { eventId: event._id, code: c, gate })).data;
      } catch {
        r = localCheck(c); // network dropped mid-event -> fall back automatically
      }
    }
    setLast(r);
    setLog((l) => [r, ...l].slice(0, 50));
    setCode('');
    inputRef.current?.focus();
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="row between">
          <h4 className="no-margin">Gate scanner</h4>
          <label className="check small"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Offline mode</label>
        </div>
        <label>Gate<input value={gate} onChange={(e) => setGate(e.target.value)} /></label>
        <form onSubmit={scan}>
          <label>Ticket code (type or use a USB/Bluetooth QR scanner)
            <input ref={inputRef} autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="ES-XXXXXXXXXX" />
          </label>
          <button className="btn block">Check in</button>
        </form>
        {last && (
          <div className={`scan-result ${last.result}`}>
            <b>{last.result === 'ok' ? '✓ Welcome' : last.result === 'duplicate' ? '⚠ Already checked in' : '✕ Invalid ticket'}</b>
            <div>{last.holderName} {last.ticketTypeName && `· ${last.ticketTypeName}`}</div>
            {last.message && <div className="small">{last.message}</div>}
            {last.offline && <div className="tiny">Saved offline — sync when back online</div>}
          </div>
        )}
      </div>
      <div className="card">
        <h4>Offline kit</h4>
        <p className="small muted">
          {manifest ? `${manifest.tickets.length} tickets downloaded ${dateLong(manifest.downloadedAt)}` : 'No ticket list on this device yet.'}
        </p>
        <div className="row gap">
          <button className="btn ghost sm" onClick={download}>Download ticket list</button>
          <button className="btn sm" disabled={!queue.length} onClick={sync}>Sync {queue.length} offline scans</button>
        </div>
        <h4>Recent scans</h4>
        <div className="scan-log">
          {log.map((r, i) => (
            <div key={i} className={`small ${r.result}`}>
              {r.result === 'ok' ? '✓' : r.result === 'duplicate' ? '⚠' : '✕'} {r.code} {r.holderName && `· ${r.holderName}`} {r.synced && '(synced)'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Budget({ event, onSaved }) {
  const [budget, setBudget] = useState(event.budget || { total: 0, items: [] });
  const [msg, setMsg] = useState('');
  const cats = ['venue', 'catering', 'av-production', 'marketing', 'speakers', 'staff', 'logistics', 'technology', 'other'];
  const upd = (i, patch) => setBudget({ ...budget, items: budget.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const est = budget.items.reduce((s, i) => s + Number(i.estimated || 0), 0);
  const act = budget.items.reduce((s, i) => s + Number(i.actual || 0), 0);

  async function save() {
    try {
      const { data } = await api.put(`/events/${event._id}`, { budget });
      onSaved(data);
      setMsg('Budget saved');
    } catch (e) {
      setMsg(errMsg(e));
    }
  }

  return (
    <div className="card">
      <div className="row between">
        <label>Total budget ({event.currency})<input type="number" value={budget.total} onChange={(e) => setBudget({ ...budget, total: Number(e.target.value) })} /></label>
        <div className="right small">
          Estimated: <b>{money(est, event.currency)}</b> · Actual: <b>{money(act, event.currency)}</b><br />
          <span className={budget.total - act >= 0 ? 'ok-text' : 'warn-text'}>Remaining: {money(budget.total - act, event.currency)}</span>
        </div>
      </div>
      <table className="table">
        <thead><tr><th>Category</th><th>Description</th><th>Estimated</th><th>Actual</th><th /></tr></thead>
        <tbody>
          {budget.items.map((it, i) => (
            <tr key={it._id || i} className={Number(it.actual) > Number(it.estimated) ? 'over' : ''}>
              <td><select value={it.category} onChange={(e) => upd(i, { category: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</select></td>
              <td><input value={it.description || ''} onChange={(e) => upd(i, { description: e.target.value })} /></td>
              <td><input type="number" value={it.estimated} onChange={(e) => upd(i, { estimated: Number(e.target.value) })} /></td>
              <td><input type="number" value={it.actual} onChange={(e) => upd(i, { actual: Number(e.target.value) })} /></td>
              <td><button className="icon-btn" onClick={() => setBudget({ ...budget, items: budget.items.filter((_, j) => j !== i) })}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row gap">
        <button className="btn ghost sm" onClick={() => setBudget({ ...budget, items: [...budget.items, { category: 'other', description: '', estimated: 0, actual: 0 }] })}>+ Line item</button>
        <button className="btn sm" onClick={save}>Save budget</button>
        {msg && <span className="small muted">{msg}</span>}
      </div>
    </div>
  );
}

function Expo({ event }) {
  const [booths, setBooths] = useState([]);
  const [form, setForm] = useState({ sponsorName: '', tier: 'silver', description: '', website: '', physicalLocation: '' });
  const [leads, setLeads] = useState(null);
  const load = () => api.get(`/expo/events/${event._id}/booths`).then((r) => setBooths(r.data));
  useEffect(() => { load(); }, [event._id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e.preventDefault();
    await api.post(`/expo/events/${event._id}/booths`, form);
    setForm({ sponsorName: '', tier: 'silver', description: '', website: '', physicalLocation: '' });
    load();
  }
  const remove = async (id) => { await api.delete(`/expo/booths/${id}`); load(); };
  const showLeads = async (b) => setLeads({ booth: b, rows: (await api.get(`/expo/booths/${b._id}/leads`)).data });

  return (
    <div className="grid-2">
      <div>
        <table className="table">
          <thead><tr><th>Sponsor</th><th>Tier</th><th>Visits</th><th /></tr></thead>
          <tbody>
            {booths.map((b) => (
              <tr key={b._id}>
                <td><b>{b.sponsorName}</b><div className="muted tiny">{b.physicalLocation}</div></td>
                <td><span className="pill subtle">{b.tier}</span></td>
                <td>{b.visits}</td>
                <td className="right">
                  <button className="btn ghost sm" onClick={() => showLeads(b)}>Leads</button>{' '}
                  <button className="icon-btn" onClick={() => remove(b._id)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {leads && (
          <div className="card">
            <h4>Leads for {leads.booth.sponsorName}</h4>
            {leads.rows.map((l) => <div key={l._id} className="small">{l.name} · <a href={`mailto:${l.email}`}>{l.email}</a></div>)}
            {!leads.rows.length && <p className="muted small">No leads yet.</p>}
          </div>
        )}
      </div>
      <form className="card" onSubmit={add}>
        <h4>Add exhibitor / sponsor</h4>
        <label>Sponsor name<input required value={form.sponsorName} onChange={(e) => setForm({ ...form, sponsorName: e.target.value })} /></label>
        <label>Tier<select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>{['platinum', 'gold', 'silver', 'startup'].map((t) => <option key={t}>{t}</option>)}</select></label>
        <label>On-site stall (hybrid)<input placeholder="Hall 1, Stall 12" value={form.physicalLocation} onChange={(e) => setForm({ ...form, physicalLocation: e.target.value })} /></label>
        <label>Website<input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
        <label>Description<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <button className="btn">Add booth</button>
      </form>
    </div>
  );
}

export default function ManageEvent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');

  useEffect(() => { api.get(`/events/${id}`).then((r) => setEvent(r.data)).catch((e) => setError(errMsg(e))); }, [id]);

  async function setStatus(status) {
    if (status === 'cancelled' && !window.confirm('Cancel this event? Attendees will no longer be able to register.')) return;
    try {
      const { data } = await api.post(`/events/${id}/status`, { status });
      setEvent({ ...event, status: data.status });
    } catch (e) { setError(errMsg(e)); }
  }
  async function remove() {
    if (!window.confirm('Delete this event permanently?')) return;
    try { await api.delete(`/events/${id}`); navigate('/organize'); } catch (e) { setError(errMsg(e)); }
  }

  if (!event) return <div className="page">{error ? <div className="alert error">{error}</div> : <div className="spinner" />}</div>;

  const tabs = [
    ['overview', 'Overview'],
    ['attendees', 'Attendees'],
    event.modules?.checkin && event.format !== 'virtual' && ['checkin', 'Check-in'],
    event.modules?.budget && ['budget', 'Budget'],
    event.modules?.expo && ['expo', 'Expo & sponsors'],
  ].filter(Boolean);

  return (
    <div className="page wide">
      {error && <div className="alert error">{error}</div>}
      <div className="row between">
        <div>
          <p className="eyebrow dark"><span className={`pill status-${event.status}`}>{event.status}</span> · {dateLong(event.startDate)}</p>
          <h1 className="no-margin">{event.title}</h1>
        </div>
        <div className="row gap wrap">
          <Link className="btn ghost sm" to={`/e/${event.slug}`}>View page</Link>
          {['virtual', 'hybrid'].includes(event.format) && <Link className="btn ghost sm" to={`/live/${event._id}`}>Virtual venue</Link>}
          <Link className="btn ghost sm" to={`/organize/${event._id}/edit`}>Edit</Link>
          {event.status === 'draft' && <button className="btn sm" onClick={() => setStatus('published')}>Publish</button>}
          {event.status === 'published' && <button className="btn ghost sm" onClick={() => setStatus('cancelled')}>Cancel event</button>}
          {event.status === 'draft' && <button className="btn ghost sm" onClick={remove}>Delete</button>}
        </div>
      </div>
      <div className="tabs">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'overview' && <Overview event={event} />}
      {tab === 'attendees' && <Attendees event={event} />}
      {tab === 'checkin' && <CheckIn event={event} />}
      {tab === 'budget' && <Budget event={event} onSaved={(d) => setEvent({ ...event, budget: d.budget })} />}
      {tab === 'expo' && <Expo event={event} />}
    </div>
  );
}
