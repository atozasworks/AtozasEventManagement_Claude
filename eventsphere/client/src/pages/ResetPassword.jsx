import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { photo } from '../utils/format.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { saveSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('The two passwords do not match');
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/reset-password', { token, password: form.password });
      const u = saveSession(data); // logged in straight away with the new password
      navigate(u.role === 'attendee' ? '/' : '/organize', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-photo" style={{ backgroundImage: `url(${photo('conference', 1200)})` }}>
        <p>Choose a new password and you are back in.</p>
      </div>
      <div className="auth-panel">
        <h1>Choose a new password</h1>
        {!token ? (
          <div className="alert error">This reset link is incomplete. <Link to="/forgot-password">Request a new one</Link>.</div>
        ) : (
          <form onSubmit={submit}>
            <label>New password<input type="password" minLength={6} required autoFocus value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
            <label>Repeat new password<input type="password" minLength={6} required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></label>
            {error && (
              <div className="alert error">
                {error} {/expired|invalid/i.test(error) && <Link to="/forgot-password">Request a new link</Link>}
              </div>
            )}
            <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save password and log in'}</button>
            <p className="small muted">Saving a new password signs you out on your other devices.</p>
          </form>
        )}
        <p className="small"><Link to="/login">Back to log in</Link></p>
      </div>
    </div>
  );
}
