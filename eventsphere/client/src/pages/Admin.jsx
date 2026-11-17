import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { dateLong, dateShort, money, num } from '../utils/format.js';

// Small helper: load a list whenever its filters change (typing is debounced)
function useList(url, params) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(params);
  useEffect(() => {
    const t = setTimeout(() => {
      const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
      api.get(url, { params: clean }).then((r) => { setData(r.data); setError(''); }).catch((e) => setError(errMsg(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [url, key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, reload: () => setTick((n) => n + 1) };
}

function Pager({ data, page, setPage }) {
  if (!data || data.pages <= 1) return null;
  return (
    <div className="row gap pager">
      <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
      <span className="small muted">Page {data.page} of {data.pages} · {num(data.total)} in total</span>
      <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
    </div>
  );
}

// ---------- Overview ----------
function Overview({ go }) {
  const { data, error } = useList('/admin/overview', {});
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="spinner" />;
  const { users, events, money: rows, attention } = data;
  return (
    <>
      {(attention.failedRefunds > 0 || events.takenDown > 0 || users.suspended > 0) && (
        <div className="alert info">
          Needs attention:{' '}
          {attention.failedRefunds > 0 && <button className="link-btn" onClick={() => go('orders', 'failed-refund')}>{attention.failedRefunds} refund{attention.failedRefunds === 1 ? '' : 's'} failed</button>}{' '}
          {events.takenDown > 0 && <button className="link-btn" onClick={() => go('events', 'takendown')}>{events.takenDown} event{events.takenDown === 1 ? '' : 's'} taken down</button>}{' '}
          {users.suspended > 0 && <button className="link-btn" onClick={() => go('users', 'suspended')}>{users.suspended} account{users.suspended === 1 ? '' : 's'} suspended</button>}
        </div>
      )}
      <div className="stats">
        <div className="stat"><span>People</span><b>{num(users.total)}</b><small>{num(users.newThisWeek)} joined this week</small></div>
        <div className="stat"><span>Organizers</span><b>{num(users.organizers)}</b><small>{num(users.attendees)} attendees · {users.admins} admin{users.admins === 1 ? '' : 's'}</small></div>
        <div className="stat"><span>Live events</span><b>{num(events.published)}</b><small>{events.draft} draft · {events.cancelled} cancelled</small></div>
        <div className="stat"><span>Valid tickets</span><b>{num(data.tickets)}</b><small>{attention.openRefundRequests} refund request{attention.openRefundRequests === 1 ? '' : 's'} waiting on organizers</small></div>
      </div>
      <h3>Money</h3>
      <table className="table">
        <thead><tr><th>Currency</th><th>Paid orders</th><th>Organizers earned</th><th>Platform fees earned</th><th>Refunded to buyers</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.currency}>
              <td><b>{m.currency}</b></td>
              <td>{num(m.orders)}</td>
              <td>{m.ticketRevenue ? money(m.ticketRevenue, m.currency) : '—'}</td>
              <td>{m.platformFees ? money(m.platformFees, m.currency) : '—'}</td>
              <td>{m.refunded ? money(m.refunded, m.currency) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">No paid orders yet.</div>}
      <p className="muted tiny">"Organizers earned" is ticket value after discounts and refunds. "Platform fees earned" is the fee kept after refunds. Each currency is shown separately because they cannot be added together.</p>
    </>
  );
}

// ---------- Events ----------
function Events({ initialFlag }) {
  const [f, setF] = useState({ q: '', status: '', flag: initialFlag || '' });
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState(null);
  const { data, error, reload } = useList('/admin/events', { ...f, page });
  const set = (patch) => { setF({ ...f, ...patch }); setPage(1); };

  async function act(fn, done) {
    setMsg(null);
    try { await fn(); setMsg({ type: 'success', text: done }); reload(); } catch (e) { setMsg({ type: 'error', text: errMsg(e) }); }
  }
  const feature = (e) => act(() => api.post(`/admin/events/${e._id}/feature`, { featured: !e.featured }), e.featured ? `"${e.title}" is no longer featured.` : `"${e.title}" is now featured at the top of the marketplace.`);
  function takeDown(e) {
    const reason = window.prompt(`Take down "${e.title}"?\n\nIt disappears from the site and sales stop. Tickets already sold stay valid.\nReason (emailed to the organizer):`);
    if (!reason?.trim()) return;
    act(() => api.post(`/admin/events/${e._id}/takedown`, { reason }), `"${e.title}" was taken down and the organizer emailed.`);
  }
  const restore = (e) => act(() => api.post(`/admin/events/${e._id}/restore`), `"${e.title}" was restored.`);

  return (
    <>
      <div className="filter-bar card">
        <label>Search<input placeholder="Title, city or web address" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
        <label>Status
          <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any</option>
            {['published', 'draft', 'cancelled', 'completed'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label>Show
          <select value={f.flag} onChange={(e) => set({ flag: e.target.value })}>
            <option value="">All events</option>
            <option value="featured">Featured only</option>
            <option value="takendown">Taken down only</option>
          </select>
        </label>
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {error && <div className="alert error">{error}</div>}
      {!data ? <div className="spinner" /> : (
        <>
          <table className="table">
            <thead><tr><th>Event</th><th>Organizer</th><th>Date</th><th>Status</th><th>Tickets</th><th>Revenue</th><th /></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e._id}>
                  <td>
                    <Link to={`/e/${e.slug}`}><b>{e.title}</b></Link> {e.featured && <span className="pill ok tiny">Featured</span>}
                    <div className="muted tiny">{e.city || 'Online'} · {num(e.views)} views</div>
                    {e.takenDown && <div className="warn-text tiny">Taken down {dateShort(e.takenDown.at)}: {e.takenDown.reason}</div>}
                  </td>
                  <td>
                    {e.organizer?.organizationName || e.organizer?.name}
                    <div className="muted tiny">{e.organizer?.email}{e.organizer?.suspended && ' · suspended'}</div>
                  </td>
                  <td>{dateShort(e.startDate)}</td>
                  <td><span className={`pill status-${e.status}`}>{e.status}</span></td>
                  <td>{num(e.ticketsSold)}</td>
                  <td>{e.revenue ? money(e.revenue, e.currency) : '—'}</td>
                  <td className="right nowrap">
                    <Link className="btn ghost sm" to={`/organize/${e._id}`}>Manage</Link>{' '}
                    {e.status === 'published' && <button className="btn ghost sm" onClick={() => feature(e)}>{e.featured ? 'Unfeature' : 'Feature'}</button>}{' '}
                    {e.takenDown
                      ? <button className="btn sm" onClick={() => restore(e)}>Restore</button>
                      : e.status !== 'cancelled' && <button className="btn ghost sm" onClick={() => takeDown(e)}>Take down</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.items.length && <div className="empty">No events match.</div>}
          <Pager data={data} page={page} setPage={setPage} />
          <p className="muted tiny">"Manage" opens the organizer's own dashboard for that event, where you can refund orders or cancel the event (which refunds everyone).</p>
        </>
      )}
    </>
  );
}

// ---------- Users ----------
function Users({ initialFlag }) {
  const { user: me } = useAuth();
  const [f, setF] = useState({ q: '', role: '', flag: initialFlag || '' });
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState(null);
  const { data, error, reload } = useList('/admin/users', { ...f, page });
  const set = (patch) => { setF({ ...f, ...patch }); setPage(1); };

  async function update(u, body, done) {
    setMsg(null);
    try { await api.put(`/admin/users/${u._id}`, body); setMsg({ type: 'success', text: done }); } catch (e) { setMsg({ type: 'error', text: errMsg(e) }); }
    reload();
  }
  function changeRole(u, role) {
    if (role === 'admin' && !window.confirm(`Make ${u.name} a platform admin?\n\nAdmins can manage every event, refund any order and suspend any account.`)) return reload();
    update(u, { role }, `${u.name} is now ${role === 'admin' ? 'an admin' : role === 'organizer' ? 'an organizer' : 'an attendee'}.`);
  }
  function suspend(u) {
    const reason = window.prompt(`Suspend ${u.name} (${u.email})?\n\nThey are signed out everywhere and cannot log in. Their events and tickets are not changed.\nReason (for your records):`);
    if (reason === null) return;
    update(u, { suspended: true, reason }, `${u.name} is suspended.`);
  }

  return (
    <>
      <div className="filter-bar card">
        <label>Search<input placeholder="Name, email or organisation" value={f.q} onChange={(e) => set({ q: e.target.value })} /></label>
        <label>Role
          <select value={f.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="">Any</option>
            {['attendee', 'organizer', 'admin'].map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label>Show
          <select value={f.flag} onChange={(e) => set({ flag: e.target.value })}>
            <option value="">Everyone</option>
            <option value="suspended">Suspended only</option>
            <option value="unverified">Email not confirmed</option>
          </select>
        </label>
      </div>
      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      {error && <div className="alert error">{error}</div>}
      {!data ? <div className="spinner" /> : (
        <>
          <table className="table">
            <thead><tr><th>Person</th><th>Joined</th><th>Role</th><th>Plan</th><th>Events</th><th /></tr></thead>
            <tbody>
              {data.items.map((u) => {
                const self = u._id === me._id;
                return (
                  <tr key={u._id}>
                    <td>
                      <b>{u.name}</b> {self && <span className="pill subtle tiny">You</span>} {u.suspended && <span className="pill warn tiny">Suspended</span>}
                      <div className="muted tiny">{u.email}{!u.emailVerified && ' · email not confirmed'}{u.organizationName && ` · ${u.organizationName}`}</div>
                      {u.suspended && u.suspendedReason && <div className="warn-text tiny">{u.suspendedReason}</div>}
                    </td>
                    <td>{dateShort(u.createdAt)}</td>
                    <td>
                      <select aria-label={`Role for ${u.name}`} value={u.role} disabled={self} onChange={(e) => changeRole(u, e.target.value)}>
                        {['attendee', 'organizer', 'admin'].map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </td>
                    <td>
                      <select aria-label={`Plan for ${u.name}`} value={u.plan} onChange={(e) => update(u, { plan: e.target.value }, `${u.name} is now on the ${e.target.value} plan.`)}>
                        {['free', 'pro', 'enterprise'].map((p) => <option key={p}>{p}</option>)}
                      </select>
                    </td>
                    <td>{u.events || '—'}</td>
                    <td className="right">
                      {!self && (u.suspended
                        ? <button className="btn sm" onClick={() => update(u, { suspended: false }, `${u.name} can log in again.`)}>Lift suspension</button>
                        : <button className="btn ghost sm" onClick={() => suspend(u)}>Suspend</button>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!data.items.length && <div className="empty">Nobody matches.</div>}
          <Pager data={data} page={page} setPage={setPage} />
        </>
      )}
    </>
  );
}

// ---------- Orders ----------
const ORDER_PILL = { paid: 'ok', partially_refunded: 'warn', refunded: 'subtle', failed: 'warn', pending: 'subtle' };
function Orders({ initialFlag }) {
  const [f, setF] = useState({ q: '', status: initialFlag || '' });
  const { data, error } = useList('/admin/orders', f);
  return (
    <>
      <div className="filter-bar card">
        <label>Find an order<input placeholder="Buyer email or name, order reference (#1A2B3C4D) or payment reference" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        <label>Status
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">Paid and refunded</option>
            <option value="paid">Paid</option>
            <option value="partially_refunded">Partly refunded</option>
            <option value="refunded">Refunded</option>
            <option value="failed-refund">Refund failed</option>
            <option value="failed">Payment failed</option>
            <option value="pending">Payment not completed</option>
          </select>
        </label>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!data ? <div className="spinner" /> : (
        <>
          <table className="table">
            <thead><tr><th>Buyer</th><th>Event</th><th>Paid</th><th>Refunded</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((o) => (
                <tr key={o._id}>
                  <td>
                    <b>{o.buyer?.name}</b>
                    <div className="muted tiny">{o.buyer?.email} · #{String(o._id).slice(-8).toUpperCase()} · {dateLong(o.createdAt)}</div>
                    {o.paymentRef && <div className="muted tiny">Payment ref {o.paymentRef} ({o.provider}, {o.paymentMethod})</div>}
                    {o.refundError && <div className="warn-text tiny">Refund failed: {o.refundError}</div>}
                  </td>
                  <td>{o.event?.title || 'Deleted event'}</td>
                  <td>{o.total > 0 ? money(o.total, o.currency) : 'Free'}</td>
                  <td>{o.refundedAmount > 0 ? money(o.refundedAmount, o.currency) : '—'}</td>
                  <td><span className={`pill ${ORDER_PILL[o.paymentStatus] || 'subtle'}`}>{o.paymentStatus.replace('_', ' ')}</span></td>
                  <td className="right">{o.event && <Link className="btn ghost sm" to={`/organize/${o.event._id}?tab=orders`}>Open in event</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.length && <div className="empty">No orders match.</div>}
          <p className="muted tiny">Shows the 50 most recent matches. "Open in event" goes to that event's Orders &amp; refunds tab, where you can refund the order.</p>
        </>
      )}
    </>
  );
}

// ---------- Activity log ----------
function Activity() {
  const { data, error } = useList('/admin/activity', {});
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <div className="spinner" />;
  return (
    <>
      <table className="table">
        <thead><tr><th>When</th><th>Admin</th><th>What happened</th></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a._id}>
              <td className="nowrap">{dateLong(a.at)}</td>
              <td>{a.admin?.name || 'Removed account'}<div className="muted tiny">{a.admin?.email}</div></td>
              <td>{a.summary}<div className="muted tiny">{a.action}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!data.length && <div className="empty">Nothing yet. Every change an admin makes is recorded here.</div>}
    </>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [flag, setFlag] = useState('');
  if (user.role !== 'admin') return <Navigate to="/" replace />;

  const go = (t, fl = '') => { setFlag(fl); setTab(t); };
  const tabs = [['overview', 'Overview'], ['events', 'Events'], ['users', 'People'], ['orders', 'Orders'], ['activity', 'Activity log']];

  return (
    <div className="page wide">
      <p className="eyebrow dark">Platform admin</p>
      <h1 className="no-margin">Admin console</h1>
      <div className="tabs">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}
      </div>
      {tab === 'overview' && <Overview go={go} />}
      {tab === 'events' && <Events key={flag} initialFlag={flag} />}
      {tab === 'users' && <Users key={flag} initialFlag={flag} />}
      {tab === 'orders' && <Orders key={flag} initialFlag={flag} />}
      {tab === 'activity' && <Activity />}
    </div>
  );
}
