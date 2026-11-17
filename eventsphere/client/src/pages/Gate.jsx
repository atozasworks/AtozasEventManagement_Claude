import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import CheckIn from '../components/CheckIn.jsx';
import { dateLong, num } from '../utils/format.js';

// "My gate duties": events this person has been added to as check-in staff
export function GateList() {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/events/staffed').then((r) => setEvents(r.data)).catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!events) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1>Check-in duty</h1>
      <p className="muted">Events where the organizer has added you to the check-in team.</p>
      {!events.length && (
        <div className="empty">You are not on a check-in team yet. Ask the organizer to add the email address you log in with.</div>
      )}
      <div className="venue-grid">
        {events.map((e) => (
          <div key={e._id} className="card">
            <span className={`pill ${e.format}`}>{e.format}</span>
            <h3>{e.title}</h3>
            <p className="small">{dateLong(e.startDate)}</p>
            <p className="small muted">{[e.location?.venueName, e.location?.city].filter(Boolean).join(', ')}</p>
            <Link className="btn" to={`/gate/${e._id}`}>Open gate scanner</Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// The gate screen itself - for gate staff, and for organizers who want a clean scanning view
export default function Gate() {
  const { id } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    api
      .get(`/tickets/gate/${id}`)
      .then((r) => { setInfo(r.data); setError(''); })
      .catch((e) => { if (e.response) setError(errMsg(e)); }); // offline: keep showing the last numbers
  }, [id]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20000); // other gates are scanning too - keep the count fresh
    return () => clearInterval(timer);
  }, [refresh]);

  if (error && !info) {
    return (
      <div className="page narrow">
        <div className="card center">
          <h2>Gate scanner</h2>
          <div className="alert error">{error}</div>
          <Link className="btn ghost" to="/gate">My check-in duties</Link>
        </div>
      </div>
    );
  }
  if (!info) return <div className="page"><div className="spinner" /></div>;

  const { event, stats, role } = info;
  const pct = stats.total ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  return (
    <div className="page wide">
      <div className="row between wrap">
        <div>
          <p className="eyebrow dark">Gate scanner · {dateLong(event.startDate)}</p>
          <h1 className="no-margin">{event.title}</h1>
          <p className="small muted">{[event.location?.venueName, event.location?.city].filter(Boolean).join(', ')}</p>
        </div>
        <div className="gate-count" aria-live="polite">
          <b>{num(stats.checkedIn)}</b> of {num(stats.total)} in
          <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      {role === 'manager' && <p className="small"><Link to={`/organize/${event._id}`}>← Back to the event dashboard</Link></p>}
      <CheckIn event={event} onChange={refresh} />
    </div>
  );
}
