import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, ready, setUser } = useAuth();
  const [state, setState] = useState({ status: 'working', message: '' });
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return; // the link works once - never send it twice
    started.current = true;
    if (!token) return setState({ status: 'error', message: 'This verification link is incomplete.' });
    api
      .post('/auth/verify-email', { token })
      .then(({ data }) => {
        if (user && user._id === data.user._id) setUser(data.user);
        setState({ status: 'ok', message: data.user.email });
      })
      .catch((err) => {
        // Opening an already-used link while logged in and verified is still a success
        if (user?.emailVerified) setState({ status: 'ok', message: user.email });
        else setState({ status: 'error', message: errMsg(err) });
      });
  }, [ready, token]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page narrow">
      <div className="card center">
        {state.status === 'working' && <div className="spinner" />}
        {state.status === 'ok' && (
          <>
            <div className="big-check">✓</div>
            <h2>Email confirmed</h2>
            <p className="muted">{state.message} is now verified.</p>
            <Link className="btn" to={user ? (user.role === 'attendee' ? '/' : '/organize') : '/login'}>{user ? 'Continue' : 'Log in'}</Link>
          </>
        )}
        {state.status === 'error' && (
          <>
            <h2>We could not confirm your email</h2>
            <div className="alert error">{state.message}</div>
            <p className="muted small">{user ? 'Use "Resend link" in the banner at the top of the page to get a fresh link.' : 'Log in and use "Resend link" to get a fresh link.'}</p>
            {!user && <Link className="btn" to="/login">Log in</Link>}
          </>
        )}
      </div>
    </div>
  );
}
