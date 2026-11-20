import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import api from '../api.js';
import NotificationBell from './NotificationBell.jsx';
import { PwaHeaderButton } from './PwaInstall.jsx';
import LanguageMenu from './LanguageMenu.jsx';
import { useAuth } from '../context/AuthContext.jsx';

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
        <nav className="nav-links">
          <NavLink to="/" end>Discover</NavLink>
          <NavLink to="/venues">Venues</NavLink>
          <NavLink to="/vendors">Vendors</NavLink>
          {user && <NavLink to="/tickets">My Tickets</NavLink>}
          {onGateDuty && <NavLink to="/gate">Check-in</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Admin</NavLink>}
          <NavLink to="/organize">{isOrganizer ? 'Organizer' : 'Host an event'}</NavLink>
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
                  {user.name.split(' ')[0]}
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
