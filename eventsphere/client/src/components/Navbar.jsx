import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import api from '../api.js';
import NotificationBell from './NotificationBell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout, isOrganizer } = useAuth();
  const navigate = useNavigate();
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
          {user ? (
            <>
              <NotificationBell key={user._id} />
              <span className="nav-user">
                <span className="avatar sm">{user.name[0]}</span>
                {user.name.split(' ')[0]}
              </span>
              <button className="btn ghost sm" onClick={() => { logout(); navigate('/'); }}>Log out</button>
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
