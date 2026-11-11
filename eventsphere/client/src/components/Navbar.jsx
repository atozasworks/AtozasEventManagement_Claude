import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Navbar() {
  const { user, logout, isOrganizer } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true" /> EventSphere
        </Link>
        <nav className="nav-links">
          <NavLink to="/" end>Discover</NavLink>
          <NavLink to="/venues">Venues</NavLink>
          {user && <NavLink to="/tickets">My Tickets</NavLink>}
          <NavLink to="/organize">{isOrganizer ? 'Organizer' : 'Host an event'}</NavLink>
        </nav>
        <div className="nav-right">
          {user ? (
            <>
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
