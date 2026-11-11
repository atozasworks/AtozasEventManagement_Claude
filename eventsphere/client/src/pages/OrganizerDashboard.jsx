import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { dateShort, money, num } from '../utils/format.js';

function BecomeOrganizer() {
  const { becomeOrganizer } = useAuth();
  const [org, setOrg] = useState('');
  return (
    <div className="page narrow">
      <div className="card">
        <h1>Host your event on EventSphere</h1>
        <p className="muted">Free for free events. Paid events: a small fee per ticket, no contracts. Upgrade to Pro or Enterprise for CRM sync, budgeting and dedicated support.</p>
        <div className="plans">
          <div><b>Free</b><p className="small muted">Self-service ticketing, UPI, QR check-in, marketplace listing</p></div>
          <div><b>Pro</b><p className="small muted">Streaming, virtual expo, networking, custom registration</p></div>
          <div><b>Enterprise</b><p className="small muted">CRM sync, budgets, venue sourcing, SSO, SLAs</p></div>
        </div>
        <label>Organisation / brand name<input value={org} onChange={(e) => setOrg(e.target.value)} /></label>
        <button className="btn block" onClick={() => becomeOrganizer(org)}>Start hosting</button>
      </div>
    </div>
  );
}

export default function OrganizerDashboard() {
  const { user, isOrganizer } = useAuth();
  const [events, setEvents] = useState(null);
  const [inquiries, setInquiries] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOrganizer) return;
    api.get('/events/mine').then((r) => setEvents(r.data)).catch((e) => setError(errMsg(e)));
    api.get('/venues/inquiries/mine').then((r) => setInquiries(r.data)).catch(() => {});
  }, [isOrganizer]);

  if (!isOrganizer) return <BecomeOrganizer />;
  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!events) return <div className="page"><div className="spinner" /></div>;

  const totals = events.reduce(
    (t, e) => ({ revenue: t.revenue + e.stats.revenue, tickets: t.tickets + e.stats.ticketsSold, live: t.live + (e.status === 'published' ? 1 : 0) }),
    { revenue: 0, tickets: 0, live: 0 }
  );

  return (
    <div className="page">
      <div className="row between">
        <div>
          <p className="eyebrow dark">{user.organizationName || user.name} · {user.plan} plan</p>
          <h1 className="no-margin">Your events</h1>
        </div>
        <Link className="btn" to="/organize/new">+ Create event</Link>
      </div>

      <div className="stats">
        <div className="stat"><span>Ticket revenue</span><b>{money(totals.revenue)}</b></div>
        <div className="stat"><span>Tickets issued</span><b>{num(totals.tickets)}</b></div>
        <div className="stat"><span>Live events</span><b>{totals.live}</b></div>
        <div className="stat"><span>Total events</span><b>{events.length}</b></div>
      </div>

      <table className="table">
        <thead>
          <tr><th>Event</th><th>Date</th><th>Format</th><th>Status</th><th>Tickets</th><th>Revenue</th><th /></tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e._id}>
              <td><Link to={`/organize/${e._id}`}><b>{e.title}</b></Link><div className="muted tiny">{e.category}</div></td>
              <td>{dateShort(e.startDate)}</td>
              <td><span className={`pill ${e.format}`}>{e.format}</span></td>
              <td><span className={`pill status-${e.status}`}>{e.status}</span></td>
              <td>{num(e.stats.ticketsSold)}</td>
              <td>{money(e.stats.revenue, e.currency)}</td>
              <td className="right"><Link className="btn ghost sm" to={`/organize/${e._id}`}>Manage</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!events.length && <div className="empty">No events yet — create your first one.</div>}

      {inquiries.length > 0 && (
        <>
          <h2>Venue inquiries</h2>
          <table className="table">
            <thead><tr><th>Venue</th><th>Dates</th><th>Guests</th><th>Status</th></tr></thead>
            <tbody>
              {inquiries.map((q) => (
                <tr key={q._id}>
                  <td>{q.venue?.name}<div className="muted tiny">{q.venue?.city}</div></td>
                  <td>{dateShort(q.startDate)} – {dateShort(q.endDate)}</td>
                  <td>{num(q.expectedAttendees)}</td>
                  <td><span className="pill subtle">{q.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
