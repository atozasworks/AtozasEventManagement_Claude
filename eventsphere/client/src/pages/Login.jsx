import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errMsg } from '../api.js';
import { photo } from '../utils/format.js';
import GoogleContinue from '../components/GoogleContinue.jsx';

const DEMO = [
  ['organizer@eventsphere.in', 'Organizer (enterprise)'],
  ['creator@eventsphere.in', 'Independent creator'],
  ['attendee@eventsphere.in', 'Attendee'],
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function go(u) {
    navigate(location.state?.from || (u.role === 'admin' ? '/admin' : u.role === 'attendee' ? '/' : '/organize'), { replace: true });
  }

  async function submit(e, creds = form) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      go(await login(creds.email, creds.password));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-photo" style={{ backgroundImage: `url(${photo('concert', 1200)})` }}>
        <p>Your tickets, live streams and connections, all in one place.</p>
      </div>
      <div className="auth-panel">
        <h1>Log in</h1>
        <GoogleContinue onSuccess={go} onError={setError} />
        <div className="auth-or"><span>or</span></div>
        {error && <div className="alert error">{error}</div>}
        <form onSubmit={submit}>
          <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
        </form>
        <p className="small"><Link to="/forgot-password">Forgot your password?</Link></p>
        <p className="small">New here? <Link to="/register" state={location.state}>Create an account</Link></p>
        <div className="demo-box">
          <p className="small muted">Demo accounts (after <code>npm run seed</code>):</p>
          {DEMO.map(([email, label]) => (
            <button key={email} className="chip-btn" onClick={() => submit(null, { email, password: 'password123' })}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
