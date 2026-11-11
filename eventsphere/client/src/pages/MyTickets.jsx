import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api, { errMsg } from '../api.js';
import { dateLong } from '../utils/format.js';

export default function MyTickets() {
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/tickets/mine').then((r) => setTickets(r.data)).catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!tickets) return <div className="page"><div className="spinner" /></div>;

  return (
    <div className="page">
      <h1>My tickets</h1>
      {!tickets.length && (
        <div className="empty">No tickets yet. <Link to="/">Discover events →</Link></div>
      )}
      <div className="ticket-grid">
        {tickets.filter((t) => t.event).map((t) => {
          const ev = t.event;
          const live = ['virtual', 'hybrid'].includes(ev.format) && t.access !== 'in-person';
          const onsite = ev.format !== 'virtual' && t.access !== 'virtual';
          return (
            <div key={t._id} className="ticket">
              <div className="ticket-main">
                <span className="pill subtle">{t.ticketTypeName}</span>
                <h3><Link to={`/e/${ev.slug}`}>{ev.title}</Link></h3>
                <p className="small">{dateLong(ev.startDate)}</p>
                <p className="small muted">{ev.format === 'virtual' ? 'Online' : [ev.location?.venueName, ev.location?.city].filter(Boolean).join(', ')}</p>
                <p className="small">Holder: <b>{t.holderName}</b></p>
                {live && <Link className="btn sm" to={`/live/${ev._id}`}>Join online</Link>}
              </div>
              {onsite && (
                <div className="ticket-qr">
                  <QRCodeSVG value={t.code} size={120} />
                  <code>{t.code}</code>
                  {t.checkedIn ? <span className="pill ok">Checked in</span> : <span className="muted tiny">Show at entry</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
