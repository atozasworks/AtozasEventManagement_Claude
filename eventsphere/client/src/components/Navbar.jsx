import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import api from '../api.js';
import NotificationBell from './NotificationBell.jsx';
import { PwaHeaderButton } from './PwaInstall.jsx';
import LanguageMenu from './LanguageMenu.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function NavIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const ICONS = {
  discover: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z" />
    </>
  ),
  events: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5V7M16 3.5V7M4 10h16" />
      <path d="M8 14h.01M12 14h.01M16 14h.01" />
    </>
  ),
  venues: (
    <>
      <path d="M4 20V7l8-3 8 3v13" />
      <path d="M9 20v-6h6v6" />
      <path d="M4 20h16" />
    </>
  ),
  vendors: (
    <>
      <path d="M3 10h18v10H3z" />
      <path d="m3 10 2-5h14l2 5" />
      <path d="M9 20v-5h6v5" />
    </>
  ),
  tickets: (
    <>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V11a2 2 0 0 0 0 4v2.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5V15a2 2 0 0 0 0-4z" />
      <path d="M12 6v14" />
    </>
  ),
  gate: (
    <>
      <path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" />
      <path d="M8 12h8" />
    </>
  ),
  admin: <path d="M12 3 5 6v6c0 4.2 2.8 6.8 7 8.5 4.2-1.7 7-4.3 7-8.5V6z" />,
  host: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16M12 13v4M10 15h4" />
    </>
  ),
};

function Item({ to, end, icon, long, short }) {
  return (
    <NavLink to={to} end={end}>
      <NavIcon>{ICONS[icon]}</NavIcon>
      <span className="nav-label-long">{long}</span>
      <span className="nav-label-short">{short}</span>
    </NavLink>
  );
}

export default function Navbar() {
  const { user, logout, isOrganizer } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (e) => { if (!menuRef.current?.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); }, [user?._id]);
  // Show "Check-in" only to people an organizer has added to a check-in team
  const [onGateDuty, setOnGateDuty] = useState(false);
  useEffect(() => {
    if (!user) return setOnGateDuty(false);
    api.get('/events/staffed').then((r) => setOnGateDuty(r.data.length > 0)).catch(() => setOnGateDuty(false));
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" /> EventSphere
        </Link>
        <nav className="nav-links" aria-label="Main">
          <Item to="/" end icon="discover" long="Discover" short="Discover" />
          <Item to="/events" icon="events" long="Events" short="Events" />
          <Item to="/venues" icon="venues" long="Venues" short="Venues" />
          <Item to="/vendors" icon="vendors" long="Vendors" short="Vendors" />
          {user && <Item to="/tickets" icon="tickets" long="My Tickets" short="Tickets" />}
          {onGateDuty && <Item to="/gate" icon="gate" long="Check-in" short="Gate" />}
          {user?.role === 'admin' && <Item to="/admin" icon="admin" long="Admin" short="Admin" />}
          <Item to="/organize" icon="host" long={isOrganizer ? 'Organizer' : 'Host an event'} short="Host" />
        </nav>
        <div className="nav-right">
          <LanguageMenu />
          <PwaHeaderButton />
          {user ? (
            <>
              <NotificationBell key={user._id} />
              <div className="profile-menu" ref={menuRef}>
                <button
                  type="button"
                  className="profile-trigger"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <span className="avatar sm">{user.name[0]}</span>
                  <span className="nav-name">{user.name.split(' ')[0]}</span>
                  <span className="profile-caret" aria-hidden="true">▾</span>
                </button>
                {menuOpen && (
                  <div className="profile-panel" role="menu">
                    <div className="profile-head">
                      <b>{user.name}</b>
                      <span className="small muted">{user.email}</span>
                    </div>
                    <Link role="menuitem" to="/settings" onClick={() => setMenuOpen(false)}>Settings</Link>
                    <Link role="menuitem" to="/settings#language" onClick={() => setMenuOpen(false)}>Language</Link>
                    <button
                      type="button"
                      role="menuitem"
                      className="profile-logout"
                      onClick={() => { setMenuOpen(false); logout(); navigate('/'); }}
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link className="btn ghost sm" to="/login">Log in</Link>
              <Link className="btn sm" to="/register">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
