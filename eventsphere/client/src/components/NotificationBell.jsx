import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api.js';

const CHECK_EVERY_MS = 20000; // how often the unread badge refreshes in the background
const ICON = { booking: '🎟️', quote: '🏛️', 'refund-request': '↩️', vendor: '🤝' };

function timeAgo(date) {
  const mins = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Bell in the top menu for everyone who is logged in. The red badge shows how many notifications are unread:
 * ticket bookings and refund requests for an organizer's events, quote requests for venues, and everything
 * in the vendor marketplace (a new booking, quote or visit request for a vendor; the vendor's answer for a customer).
 */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  // Keep the badge fresh, also when the tab comes back into view
  useEffect(() => {
    let stopped = false;
    const check = () => {
      if (document.hidden) return;
      api.get('/notifications/unread-count').then((r) => { if (!stopped) setUnread(r.data.unread); }).catch(() => {});
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  // Close when clicking elsewhere or pressing Escape
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    try {
      const { data } = await api.get('/notifications');
      setItems(data.items);
      setUnread(data.unread);
    } catch {
      setItems([]);
    }
  }

  async function openItem(n) {
    setOpen(false);
    if (!n.read) {
      setItems((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      api.post(`/notifications/${n._id}/read`).then((r) => setUnread(r.data.unread)).catch(() => {});
    }
    if (n.link) navigate(n.link);
  }

  async function readAll() {
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    setUnread(0);
    api.post('/notifications/read-all').catch(() => {});
  }

  return (
    <div className="bell" ref={boxRef}>
      <button
        type="button"
        className="bell-btn"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            {unread > 0 && <button type="button" className="link-btn small" onClick={readAll}>Mark all as read</button>}
          </div>
          {!items && <div className="spinner" />}
          {items && !items.length && <p className="bell-empty">Nothing yet. Ticket bookings for your events, vendor bookings, quotes and visit requests, and their answers, show up here.</p>}
          {items?.map((n) => (
            <button key={n._id} type="button" className={`bell-item ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
              <span className="bell-icon" aria-hidden="true">{ICON[n.type] || '🔔'}</span>
              <span className="bell-text">
                <b>{n.title}</b>
                {n.body && <span>{n.body}</span>}
                <small>{timeAgo(n.createdAt)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
