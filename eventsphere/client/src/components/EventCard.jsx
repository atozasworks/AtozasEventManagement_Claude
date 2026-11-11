import { Link } from 'react-router-dom';
import { coverStyle, dateShort, money } from '../utils/format.js';

export default function EventCard({ event }) {
  const prices = (event.ticketTypes || []).map((t) => t.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const priceLabel = max === 0 ? 'Free' : min === 0 ? `Free – ${money(max, event.currency)}` : `From ${money(min, event.currency)}`;

  return (
    <Link to={`/e/${event.slug}`} className="event-card">
      <div className="event-cover" style={coverStyle(event)}>
        <span className="cover-date">
          <b>{new Date(event.startDate).getDate()}</b>
          {new Date(event.startDate).toLocaleString('en-IN', { month: 'short' })}
        </span>
        {event.featured && <span className="badge featured">Featured</span>}
      </div>
      <div className="event-body">
        <div className="event-meta">
          <span className={`pill ${event.format}`}>{event.format}</span>
          <span className="pill subtle">{event.category}</span>
        </div>
        <h3>{event.title}</h3>
        <p className="muted small">
          {dateShort(event.startDate)} · {event.format === 'virtual' ? 'Online' : event.location?.city || 'TBA'}
        </p>
        <p className="price">{priceLabel}</p>
      </div>
    </Link>
  );
}
