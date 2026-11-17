import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// Shown to logged-in people who have not confirmed their email address yet
export default function VerifyBanner() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [state, setState] = useState({ status: 'idle', message: '' });

  if (!user || user.emailVerified || pathname === '/verify-email') return null;

  async function resend() {
    setState({ status: 'busy', message: '' });
    try {
      await api.post('/auth/resend-verification');
      setState({ status: 'sent', message: '' });
    } catch (err) {
      setState({ status: 'error', message: errMsg(err) });
    }
  }

  return (
    <div className="verify-banner" role="status">
      <div className="verify-banner-inner">
        {state.status === 'sent' ? (
          <span>We sent a new link to <b>{user.email}</b>. It works for 24 hours.</span>
        ) : (
          <>
            <span>
              Please confirm your email address. We sent a link to <b>{user.email}</b>
              {user.role !== 'attendee' && ' — you need it before publishing an event'}.
            </span>
            <button className="btn ghost sm" disabled={state.status === 'busy'} onClick={resend}>
              {state.status === 'busy' ? 'Sending…' : 'Resend link'}
            </button>
          </>
        )}
        {state.status === 'error' && <span className="warn-text">{state.message}</span>}
      </div>
    </div>
  );
}
