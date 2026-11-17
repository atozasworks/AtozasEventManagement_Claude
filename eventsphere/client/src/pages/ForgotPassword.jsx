import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { photo } from '../utils/format.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-photo" style={{ backgroundImage: `url(${photo('conference', 1200)})` }}>
        <p>Back to your tickets in a minute.</p>
      </div>
      <div className="auth-panel">
        <h1>Forgot your password?</h1>
        {sent ? (
          <>
            <div className="alert success">
              If an account exists for <b>{email}</b>, a reset link is on its way. The link works for 1 hour.
            </div>
            <p className="small muted">Nothing in your inbox? Check spam, or <button type="button" className="link-btn" onClick={() => setSent(false)}>try another email</button>.</p>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted">Enter the email you signed up with and we will send you a link to choose a new password.</p>
            <label>Email<input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {error && <div className="alert error">{error}</div>}
            <button className="btn block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          </form>
        )}
        <p className="small"><Link to="/login">Back to log in</Link></p>
      </div>
    </div>
  );
}
