import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { captureAttribution } from './api.js';

import Home from './pages/Home.jsx';
import EventDetail from './pages/EventDetail.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import MyTickets from './pages/MyTickets.jsx';
import VirtualVenue from './pages/VirtualVenue.jsx';
import OrganizerDashboard from './pages/OrganizerDashboard.jsx';
import EventEditor from './pages/EventEditor.jsx';
import ManageEvent from './pages/ManageEvent.jsx';
import Venues from './pages/Venues.jsx';

function RequireAuth({ children, organizer }) {
  const { user, ready, isOrganizer } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="page"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (organizer && !isOrganizer) return <Navigate to="/organize" replace />;
  return children;
}

export default function App() {
  useEffect(() => captureAttribution(), []);

  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/e/:slug" element={<EventDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/venues" element={<Venues />} />
          <Route path="/tickets" element={<RequireAuth><MyTickets /></RequireAuth>} />
          <Route path="/live/:id" element={<RequireAuth><VirtualVenue /></RequireAuth>} />
          <Route path="/organize" element={<RequireAuth><OrganizerDashboard /></RequireAuth>} />
          <Route path="/organize/new" element={<RequireAuth organizer><EventEditor /></RequireAuth>} />
          <Route path="/organize/:id/edit" element={<RequireAuth organizer><EventEditor /></RequireAuth>} />
          <Route path="/organize/:id" element={<RequireAuth organizer><ManageEvent /></RequireAuth>} />
          <Route path="*" element={<div className="page"><h1>Page not found</h1></div>} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <span className="brand"><span className="brand-mark" aria-hidden="true" /> EventSphere</span>
            <p>Tickets, streams and gate check-in for events of every size. Made in India.</p>
          </div>
          <nav>
            <b>Attend</b>
            <Link to="/">Discover events</Link>
            <Link to="/tickets">My tickets</Link>
          </nav>
          <nav>
            <b>Host</b>
            <Link to="/organize">Organizer dashboard</Link>
            <Link to="/organize/new">Create an event</Link>
            <Link to="/venues">Find a venue</Link>
          </nav>
          <nav>
            <b>Payments</b>
            <span>UPI, cards, net banking and wallets</span>
            <span>Prices in INR, USD, EUR and more</span>
          </nav>
        </div>
        <p className="footer-fine">
          © {new Date().getFullYear()} EventSphere. Event photography from <a href="https://unsplash.com" target="_blank" rel="noreferrer">Unsplash</a>.
        </p>
      </footer>
    </>
  );
}
