import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { errMsg } from '../api.js';
import { photo } from '../utils/format.js';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'attendee', organizationName: '', marketingConsent: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await register(form);
      navigate(u.role === 'organizer' ? '/organize' : '/');
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-photo" style={{ backgroundImage: `url(${photo(form.role === 'organizer' ? 'exhibition' : 'festival', 1200)})` }}>
        <p>{form.role === 'organizer' ? 'From a 20-seat workshop to a 20,000-person festival.' : 'Discover what is on near you and online.'}</p>
      </div>
      <div className="auth-panel">
        <h1>Create your account</h1>
        <div className="segmented">
          <button type="button" className={form.role === 'attendee' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'attendee' })}>I want to attend</button>
          <button type="button" className={form.role === 'organizer' ? 'on' : ''} onClick={() => setForm({ ...form, role: 'organizer' })}>I want to host</button>
        </div>
        <form onSubmit={submit}>
          <label>Full name<input required value={form.name} onChange={set('name')} /></label>
          <label>Email<input type="email" required value={form.email} onChange={set('email')} /></label>
          <label>WhatsApp number (optional)<input placeholder="+91…" value={form.phone} onChange={set('phone')} /></label>
          {form.role === 'organizer' && (
            <label>Organisation / brand name<input value={form.organizationName} onChange={set('organizationName')} /></label>
          )}
          <label>Password<input type="password" minLength={6} required value={form.password} onChange={set('password')} /></label>
          <label className="check"><input type="checkbox" checked={form.marketingConsent} onChange={set('marketingConsent')} /> Send me event recommendations</label>
          {error && <div className="alert error">{error}</div>}
          <button className="btn block" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
        </form>
        <p className="small">Already have an account? <Link to="/login">Log in</Link></p>
      </div>
    </div>
  );
}
