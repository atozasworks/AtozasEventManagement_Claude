import { useEffect, useState } from 'react';
import api from '../api.js';
import { ymd } from '../utils/vendors.js';

const REFRESH_MS = 30000; // other people are booking too - keep the calendar current
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_TEXT = { available: 'Available', pending: 'Available (someone has asked)', booked: 'Booked', blocked: 'Not available', past: 'Past' };

/**
 * Live availability calendar for one listing.
 *   mode="pick"    customer picks a free date, or a run of free dates (value / onChange: { start, end })
 *   mode="manage"  the vendor clicks dates to mark them unavailable or available again (onToggle(date, isBlocked))
 * `reloadKey` changes whenever something was booked or blocked, to refresh at once.
 */
export default function AvailabilityCalendar({ vendorId, mode = 'pick', value, onChange, onToggle, reloadKey }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [days, setDays] = useState(null); // { 'YYYY-MM-DD': { status, left } }
  const [perDay, setPerDay] = useState(1);
  const [error, setError] = useState('');

  // The grid always shows 6 full weeks, starting on the Sunday on or before the 1st
  const gridStart = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const from = ymd(gridStart);

  useEffect(() => {
    let stopped = false;
    const load = () =>
      api
        .get(`/vendors/${vendorId}/availability`, { params: { from, days: 42 } })
        .then((r) => {
          if (stopped) return;
          setDays(Object.fromEntries(r.data.days.map((d) => [d.date, d])));
          setPerDay(r.data.bookingsPerDay);
          setError('');
        })
        .catch(() => { if (!stopped) setError('The calendar could not be loaded. Check your connection.'); });
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => { stopped = true; clearInterval(timer); };
  }, [vendorId, from, reloadKey]);

  const cells = Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const free = (date) => ['available', 'pending'].includes(days?.[date]?.status);
  const inRange = (date) => value?.start && date >= value.start && date <= (value.end || value.start);

  function pick(date) {
    if (!free(date)) return;
    // Second click on a later date extends to a run of days, if every day in between is free
    if (value?.start && value.start === value.end && date > value.start) {
      const run = cells.map(ymd).filter((d) => d >= value.start && d <= date);
      if (run.every(free) && run.length <= 14) return onChange({ start: value.start, end: date });
    }
    onChange({ start: date, end: date });
  }

  const thisMonth = new Date();
  const canGoBack = month > new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="btn ghost sm" disabled={!canGoBack} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">←</button>
        <b>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
        <button type="button" className="btn ghost sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">→</button>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="cal-grid" role="grid">
        {WEEKDAYS.map((w) => <span key={w} className="cal-weekday">{w}</span>)}
        {cells.map((d) => {
          const date = ymd(d);
          const info = days?.[date];
          const status = info?.status || 'loading';
          const other = d.getMonth() !== month.getMonth();
          const clickable = mode === 'manage' ? ['available', 'pending', 'blocked'].includes(status) : free(date);
          return (
            <button
              key={date}
              type="button"
              className={`cal-day ${status} ${other ? 'other' : ''} ${mode === 'pick' && inRange(date) ? 'picked' : ''}`}
              disabled={!clickable}
              title={`${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}: ${STATUS_TEXT[status] || ''}${perDay > 1 && free(date) ? ` (${info.left} of ${perDay} slots left)` : ''}`}
              onClick={() => (mode === 'manage' ? onToggle?.(date, status === 'blocked') : pick(date))}
            >
              {d.getDate()}
              {perDay > 1 && free(date) && info.left < perDay && <small>{info.left} left</small>}
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        <span><i className="available" /> Available</span>
        <span><i className="pending" /> Requested by someone, still open</span>
        <span><i className="booked" /> Booked</span>
        <span><i className="blocked" /> Not available</span>
      </div>
      <p className="muted tiny">
        {mode === 'manage'
          ? 'Click a date to mark it as not available; click it again to open it up. Booked dates are set by confirmed bookings.'
          : 'Click a free date. For an event over several days, click the first day and then the last day. Updates automatically.'}
      </p>
    </div>
  );
}
