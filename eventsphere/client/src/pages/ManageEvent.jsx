import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { dateLong, money, num } from '../utils/format.js';
import CheckIn from '../components/CheckIn.jsx';
import { defaultShareMessage, offerText, promoLink, shareTargets } from '../utils/promoLink.js';

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
              <td>{t.status === 'cancelled' ? <span className="pill warn">Cancelled</span> : t.checkedIn ? <span className="pill ok">Checked in</span> : <span className="pill subtle">Registered</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">{filtered.length} of {rows.length} tickets</p>
    </>
  );
}

// Gate staff: people who can scan tickets for this event and nothing else
function GateStaff({ event }) {
  const [staff, setStaff] = useState(null);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const gateUrl = `${window.location.origin}/gate/${event._id}`;

  useEffect(() => {
    api.get(`/events/${event._id}/staff`).then((r) => setStaff(r.data)).catch((e) => setMsg({ type: 'error', text: errMsg(e) }));
  }, [event._id]);

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post(`/events/${event._id}/staff`, { email });
      setStaff(data);
      setMsg({ type: 'success', text: `${email} can now scan tickets for this event. We emailed them the link.` });
      setEmail('');
    } catch (err) {
      setMsg({ type: 'error', text: errMsg(err) });
    } finally {
      setBusy(false);
    }
  }
  async function remove(s) {
    if (!window.confirm(`Remove ${s.name || s.email} from the check-in team?`)) return;
    try { setStaff((await api.delete(`/events/${event._id}/staff/${s._id}`)).data); setMsg(null); } catch (err) { setMsg({ type: 'error', text: errMsg(err) }); }
  }

  return (
    <div className="card gate-staff">
      <h4>Gate staff</h4>
      <p className="small muted">
        Add volunteers or security staff by email. They log in with their own account and can only scan tickets for this event —
        they cannot see revenue, attendee lists or settings.
      </p>
      {staff?.length > 0 && (
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Added</th><th /></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s._id}>
                <td><b>{s.name}</b></td>
                <td>{s.email}</td>
                <td>{dateLong(s.addedAt)}</td>
                <td className="right"><button className="icon-btn" title="Remove" onClick={() => remove(s)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {staff && !staff.length && <p className="small">No gate staff yet — only you can check people in.</p>}
      <form className="row gap wrap" onSubmit={add}>
        <input className="grow staff-email" type="email" required placeholder="volunteer@example.com" aria-label="Staff email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn sm" disabled={busy}>{busy ? 'Adding…' : 'Add to check-in team'}</button>
      </form>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <p className="small muted">Staff open this address on their phone: <code>{gateUrl}</code></p>
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

const ORDER_STATUS = { paid: ['Paid', 'ok'], partially_refunded: ['Partly refunded', 'warn'], refunded: ['Refunded', 'subtle'] };

// Orders, refund requests from buyers, and refunds
function Orders({ event }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refund, setRefund] = useState(null); // { order, picked: [ticketIds], reason, fromRequest }
  const [busy, setBusy] = useState(false);
  const m = (n) => money(n, event.currency);

  const load = () => api.get(`/events/${event._id}/orders`).then((r) => setData(r.data)).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, [event._id]); // eslint-disable-line react-hooks/exhaustive-deps
  // While an event cancellation is refunding everyone, keep the list fresh
  const running = data?.cancellation?.startedAt && !data.cancellation.finishedAt;
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRefund = (order, ticketIds, fromRequest = false) => {
    const live = order.tickets.filter((t) => t.status !== 'cancelled').map((t) => t._id);
    setRefund({ order, picked: ticketIds || live, reason: '', fromRequest });
    setError('');
    setNotice('');
  };

  async function submitRefund(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data: r } = await api.post(`/orders/${refund.order._id}/refund`, { ticketIds: refund.picked, reason: refund.reason, fromRequest: refund.fromRequest });
      setNotice(`${r.cancelled} ticket${r.cancelled === 1 ? '' : 's'} cancelled${r.amount > 0 ? ` and ${money(r.amount, r.currency)} refunded` : ''}. The buyer has been emailed.`);
      setRefund(null);
      await load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function decline(ticket) {
    const note = window.prompt('Message to the buyer (optional), e.g. "Refunds closed 7 days before the event"');
    if (note === null) return;
    try {
      await api.post(`/tickets/${ticket._id}/cancel-request/decline`, { note });
      setNotice('Request declined. The buyer has been emailed.');
      await load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (!data) return error ? <div className="alert error">{error}</div> : <div className="spinner" />;

  const requests = data.orders.flatMap((o) => o.tickets.filter((t) => t.cancelRequest?.status === 'requested' && t.status !== 'cancelled').map((t) => ({ o, t })));
  const shown = data.orders.filter((o) => `${o.buyer?.name} ${o.buyer?.email} ${String(o._id).slice(-8)}`.toLowerCase().includes(q.toLowerCase()));
  const refundTotal = refund ? refund.order.tickets.filter((t) => refund.picked.includes(t._id)).reduce((s, t) => s + t.refundable, 0) : 0;
  const allPicked = refund && refund.picked.length === refund.order.tickets.filter((t) => t.status !== 'cancelled').length;
  const c = data.cancellation;

  return (
    <>
      {c?.startedAt && (
        <div className={`alert ${c.finishedAt && !c.failed ? 'success' : c.finishedAt ? 'error' : 'info'}`}>
          {!c.finishedAt
            ? 'This event was cancelled. Refunding every order and emailing attendees now…'
            : `This event was cancelled: ${c.refunded} order${c.refunded === 1 ? '' : 's'} refunded and attendees emailed.${c.failed ? ` ${c.failed} refund${c.failed === 1 ? '' : 's'} could not be started - see the orders marked below and refund them again.` : ''}`}
        </div>
      )}
      {notice && <div className="alert success">{notice}</div>}
      {error && !refund && <div className="alert error">{error}</div>}

      {requests.length > 0 && (
        <div className="card">
          <h4>Refund requests ({requests.length})</h4>
          {requests.map(({ o, t }) => (
            <div key={t._id} className="row between wrap request-row">
              <div className="small">
                <b>{o.buyer?.name}</b> · {t.ticketTypeName} for {t.holderName} · would refund <b>{m(t.refundable)}</b>
                <div className="muted">{t.cancelRequest.reason ? `"${t.cancelRequest.reason}"` : 'No reason given'}</div>
              </div>
              <div className="row gap">
                <button className="btn sm" onClick={() => openRefund(o, [t._id], true)}>Approve & refund</button>
                <button className="btn ghost sm" onClick={() => decline(t)}>Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row between">
        <input className="search" placeholder="Search buyer name, email or order reference…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{shown.length} order{shown.length === 1 ? '' : 's'}</span>
      </div>
      <table className="table">
        <thead><tr><th>Buyer</th><th>Tickets</th><th>Paid</th><th>Refunded</th><th>Status</th><th /></tr></thead>
        <tbody>
          {shown.map((o) => {
            const live = o.tickets.filter((t) => t.status !== 'cancelled');
            const [label, tone] = o.total === 0 && o.paymentStatus === 'refunded' ? ['Cancelled', 'subtle'] : ORDER_STATUS[o.paymentStatus] || [o.paymentStatus, 'subtle'];
            return (
              <tr key={o._id}>
                <td>
                  <b>{o.buyer?.name}</b>
                  <div className="muted tiny">{o.buyer?.email} · #{String(o._id).slice(-8).toUpperCase()} · {dateLong(o.createdAt)}</div>
                  {o.refundError && <div className="warn-text tiny">Refund failed: {o.refundError}</div>}
                </td>
                <td>
                  {live.length} of {o.tickets.length} valid
                  <div className="muted tiny">{[...new Set(o.tickets.map((t) => t.ticketTypeName))].join(', ')}</div>
                </td>
                <td>{o.total > 0 ? m(o.total) : 'Free'}{o.discount && <div className="muted tiny">{o.discount.label}</div>}</td>
                <td>{o.refundedAmount > 0 ? m(o.refundedAmount) : '—'}</td>
                <td><span className={`pill ${tone}`}>{label}</span></td>
                <td className="right">{live.length > 0 && <button className="btn ghost sm" onClick={() => openRefund(o)}>{o.total > 0 ? 'Refund' : 'Cancel tickets'}</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!data.orders.length && <div className="empty">No orders yet.</div>}

      {refund && (
        <div className="modal-backdrop" onClick={() => setRefund(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submitRefund}>
            <h2>{refund.order.total > 0 ? 'Refund tickets' : 'Cancel tickets'}</h2>
            <p className="muted">{refund.order.buyer?.name} · order #{String(refund.order._id).slice(-8).toUpperCase()}</p>
            {refund.order.tickets.filter((t) => t.status !== 'cancelled').map((t) => (
              <label key={t._id} className="check small">
                <input
                  type="checkbox"
                  checked={refund.picked.includes(t._id)}
                  onChange={() => setRefund((r) => ({ ...r, picked: r.picked.includes(t._id) ? r.picked.filter((x) => x !== t._id) : [...r.picked, t._id] }))}
                />
                {t.ticketTypeName} · {t.holderName} {t.checkedIn && <span className="pill ok tiny">Checked in</span>}
                {refund.order.total > 0 && <span className="muted"> · {m(t.refundable)}</span>}
              </label>
            ))}
            <label>Reason (included in the email to the buyer)<input value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} placeholder="e.g. Duplicate booking" /></label>
            <div className="summary">
              <div className="row between"><b>{refund.order.total > 0 ? 'Refund to buyer' : 'Nothing to refund'}</b><b>{refund.order.total > 0 ? m(allPicked ? refund.order.total - refund.order.refundedAmount : refundTotal) : 'Free order'}</b></div>
            </div>
            <p className="small muted">
              The selected tickets stop working at the gate and online straight away, and their seats go back on sale.
              {refund.order.total > 0 && ' The money goes back to the payment method the buyer used, including the platform fee. This cannot be undone.'}
            </p>
            {error && <div className="alert error">{error}</div>}
            <div className="row gap">
              <button className="btn" disabled={busy || !refund.picked.length}>{busy ? 'Working…' : refund.order.total > 0 ? 'Refund now' : 'Cancel tickets'}</button>
              <button type="button" className="btn ghost" onClick={() => setRefund(null)}>Keep as is</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

const blankCode = { code: '', type: 'percent', value: 10, maxUses: '', validTo: '', description: '', ticketTypeIds: [] };

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and non-HTTPS pages: fall back to a hidden text box
    const box = document.createElement('textarea');
    box.value = text;
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* nothing more to try */ }
    box.remove();
    return ok;
  }
}

// Invitation link for one promo code: whoever opens it gets the code applied automatically when they book
function SharePromo({ event, coupon, problem, onClose }) {
  const [message, setMessage] = useState(() => defaultShareMessage(event, coupon));
  const [copied, setCopied] = useState('');
  const link = promoLink(event, coupon.code);
  const targets = shareTargets(event, coupon.code, message.trim());

  async function copy(what, text) {
    setCopied((await copyText(text)) ? what : 'failed');
    setTimeout(() => setCopied(''), 2500);
  }
  async function nativeShare() {
    try { await navigator.share({ title: event.title, text: message.trim(), url: promoLink(event, coupon.code, 'share') }); } catch { /* closed without sharing */ }
  }

  return (
    <div className="card share-panel">
      <div className="row between">
        <h4 className="no-margin">Invitation link for <code>{coupon.code}</code> · {offerText(coupon, event.currency)}</h4>
        <button type="button" className="icon-btn" title="Close" onClick={onClose}>✕</button>
      </div>
      <p className="muted small">
        Anyone who opens this link sees the offer on the event page. After they log in or create an account, {coupon.code} is applied to their booking automatically - they never type it.
      </p>
      {event.status !== 'published' && <div className="alert info">This event is still a {event.status === 'draft' ? 'draft' : event.status + ' event'}. Publish it before sharing - until then visitors cannot open the page.</div>}
      {problem && <div className="alert info">This code is {problem} right now, so the link opens the event at the normal price.</div>}
      <label>Link
        <div className="share-link">
          <input readOnly aria-label="Invitation link" value={link} onFocus={(e) => e.target.select()} />
          <button type="button" className="btn sm" onClick={() => copy('link', link)}>{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
        </div>
      </label>
      <label>Message (edit it before you post)
        <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="row gap wrap share-buttons">
        {targets.map((t) => (
          <a key={t.id} className={`btn ghost sm share-${t.id}`} href={t.href} target={t.id === 'email' ? undefined : '_blank'} rel="noreferrer">{t.label}</a>
        ))}
        {typeof navigator !== 'undefined' && navigator.share && <button type="button" className="btn ghost sm" onClick={nativeShare}>More apps…</button>}
        <button type="button" className="btn ghost sm" onClick={() => copy('message', `${message.trim()}\n${link}`)}>{copied === 'message' ? 'Copied ✓' : 'Copy message + link'}</button>
      </div>
      {copied === 'failed' && <div className="alert error">Could not copy. Select the text and copy it by hand.</div>}
      <p className="muted tiny">
        Facebook and LinkedIn accept only the link, so paste your message there yourself ("Copy message + link").
        Each button uses its own tracked link, so Overview → Marketing attribution shows which network brought the bookings.
      </p>
    </div>
  );
}

// Promo codes: create, pause, and see what each code sold
function Promos({ event }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(blankCode);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Which code's invitation link is open. "?share=CODE" opens it straight after the event form created the code.
  const [shareCode, setShareCode] = useState(() => (new URLSearchParams(window.location.search).get('share') || '').toUpperCase());
  const m = (n) => money(n, event.currency);
  const paidTypes = event.ticketTypes.filter((t) => t.price > 0);

  const load = () => api.get(`/coupons/events/${event._id}`).then((r) => setData(r.data)).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, [event._id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data: created } = await api.post(`/coupons/events/${event._id}`, {
        ...form,
        maxUses: Number(form.maxUses) || 0,
        validTo: form.validTo ? new Date(form.validTo) : undefined,
      });
      setForm(blankCode);
      await load();
      setShareCode(created.code); // show the invitation link for the new code straight away
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }
  async function toggle(c) {
    try { await api.put(`/coupons/${c._id}`, { active: !c.active }); await load(); } catch (err) { setError(errMsg(err)); }
  }
  async function remove(c) {
    if (!window.confirm(`Delete the code ${c.code}?`)) return;
    try { await api.delete(`/coupons/${c._id}`); await load(); } catch (err) { setError(errMsg(err)); }
  }
  const toggleType = (id) =>
    setForm((f) => ({ ...f, ticketTypeIds: f.ticketTypeIds.includes(id) ? f.ticketTypeIds.filter((x) => x !== id) : [...f.ticketTypeIds, id] }));

  if (!data) return error ? <div className="alert error">{error}</div> : <div className="spinner" />;
  const expired = (c) => c.validTo && new Date(c.validTo) < new Date();
  const full = (c) => c.maxUses > 0 && c.used >= c.maxUses;
  const g = data.group;
  const sharing = data.coupons.find((c) => c.code === shareCode);
  const problemOf = (c) => (!c.active ? 'paused' : expired(c) ? 'expired' : full(c) ? 'used up' : '');

  return (
    <div className="grid-2">
      <div>
        {error && <div className="alert error">{error}</div>}
        {sharing && <SharePromo key={sharing._id} event={event} coupon={sharing} problem={problemOf(sharing)} onClose={() => setShareCode('')} />}
        <table className="table">
          <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Tickets</th><th>Revenue</th><th>Given away</th><th /></tr></thead>
          <tbody>
            {data.coupons.map((c) => (
              <tr key={c._id}>
                <td>
                  <code>{c.code}</code>{' '}
                  {!c.active ? <span className="pill subtle tiny">Paused</span> : expired(c) ? <span className="pill warn tiny">Expired</span> : full(c) ? <span className="pill warn tiny">Used up</span> : <span className="pill ok tiny">Live</span>}
                  <div className="muted tiny">
                    {c.description}
                    {c.validTo && ` · until ${dateLong(c.validTo)}`}
                    {c.ticketTypeIds?.length > 0 && ` · only ${event.ticketTypes.filter((t) => c.ticketTypeIds.includes(t._id)).map((t) => t.name).join(', ')}`}
                  </div>
                  <button type="button" className="link-btn small share-open" onClick={() => { setShareCode(c.code); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Share link →</button>
                </td>
                <td>{c.type === 'percent' ? `${c.value}%` : m(c.value)}</td>
                <td>{c.used}{c.maxUses > 0 ? ` / ${c.maxUses}` : ''}</td>
                <td>{num(c.stats.tickets)}</td>
                <td>{c.stats.revenue ? m(c.stats.revenue) : '—'}</td>
                <td>{c.stats.discount ? m(c.stats.discount) : '—'}</td>
                <td className="right">
                  <button className="btn ghost sm" onClick={() => toggle(c)}>{c.active ? 'Pause' : 'Resume'}</button>{' '}
                  {c.used === 0 && <button className="icon-btn" title="Delete" onClick={() => remove(c)}>✕</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.coupons.length && <div className="empty">No promo codes yet. Create one to track a campaign or give partners a discount.</div>}
        {data.coupons.length > 0 && !sharing && <p className="muted tiny">"Share link" gives you an invitation link for social media: the code is applied automatically for anyone who books through it.</p>}
        <div className="card">
          <h4>Group discount</h4>
          {g.settings?.minQty >= 2 && g.settings.percent > 0 ? (
            <p className="small">
              <b>{g.settings.percent}% off</b> for orders with {g.settings.minQty} or more tickets.
              Used on {num(g.stats.orders)} order{g.stats.orders === 1 ? '' : 's'} ({num(g.stats.tickets)} tickets){g.stats.discount ? `, ${m(g.stats.discount)} given away` : ''}.
            </p>
          ) : (
            <p className="small muted">Switched off.</p>
          )}
          <p className="muted tiny">Change it under Edit → Tickets. "Used" counts orders; revenue is what you earned after the discount.</p>
        </div>
      </div>
      <form className="card" onSubmit={add}>
        <h4>New promo code</h4>
        <label>Code<input required placeholder="LAUNCH20" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></label>
        <div className="grid-2">
          <label>Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="percent">Percent off</option>
              <option value="flat">Fixed amount off ({event.currency})</option>
            </select>
          </label>
          <label>{form.type === 'percent' ? 'Percent' : `Amount (${event.currency})`}
            <input type="number" required min={1} max={form.type === 'percent' ? 100 : undefined} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
          </label>
          <label>Max orders (blank = unlimited)<input type="number" min={0} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} /></label>
          <label>Valid until (optional)<input type="datetime-local" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></label>
        </div>
        {paidTypes.length > 1 && (
          <>
            <p className="small no-margin"><b>Limit to ticket types</b> <span className="muted">(none ticked = all paid tickets)</span></p>
            {paidTypes.map((t) => (
              <label key={t._id} className="check small">
                <input type="checkbox" checked={form.ticketTypeIds.includes(t._id)} onChange={() => toggleType(t._id)} /> {t.name}
              </label>
            ))}
          </>
        )}
        <label>Note for your team (optional)<input placeholder="LinkedIn launch campaign" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Create code'}</button>
        <p className="muted tiny">A 100% code makes tickets free, which is handy for speakers, sponsors and press.</p>
      </form>
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
  const location = useLocation();
  const [event, setEvent] = useState(null);
  // A link such as /organize/<id>?tab=orders opens straight on that tab
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') || 'overview');
  const [error, setError] = useState('');

  useEffect(() => { api.get(`/events/${id}`).then((r) => setEvent(r.data)).catch((e) => setError(errMsg(e))); }, [id]);

  async function setStatus(status) {
    if (status === 'cancelled' && !window.confirm('Cancel this event?\n\nEvery ticket will be cancelled, every paid order refunded in full, and all attendees emailed. This cannot be undone.')) return;
    try {
      const { data } = await api.post(`/events/${id}/status`, { status });
      setEvent({ ...event, status: data.status });
      if (status === 'cancelled') setTab('orders'); // refund progress shows there
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
    ['orders', 'Orders & refunds'],
    event.modules?.ticketing !== false && ['promos', 'Promo codes'],
    event.modules?.checkin && event.format !== 'virtual' && ['checkin', 'Check-in'],
    event.modules?.budget && ['budget', 'Budget'],
    event.modules?.expo && ['expo', 'Expo & sponsors'],
  ].filter(Boolean);

  return (
    <div className="page wide">
      {error && <div className="alert error">{error}</div>}
      {/* Message carried over from the event form, e.g. "2 promo codes created." */}
      {location.state?.notice && <div className="alert info">{location.state.notice}</div>}
      {event.moderation?.blocked && (
        <div className="alert error">
          This event was taken down by the platform team and is not visible or on sale: {event.moderation.reason}.
          Tickets already sold stay valid. You can still edit the event and refund orders, but it cannot be published until it is restored - contact support.
        </div>
      )}
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
      {tab === 'checkin' && (
        <>
          <CheckIn event={event} />
          <GateStaff event={event} />
        </>
      )}
      {tab === 'budget' && <Budget event={event} onSaved={(d) => setEvent({ ...event, budget: d.budget })} />}
      {tab === 'orders' && <Orders key={event.status} event={event} />}
      {tab === 'promos' && <Promos event={event} />}
      {tab === 'expo' && <Expo event={event} />}
    </div>
  );
}
