import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

// Landing page for the "Add to my account" link in a ticket email (guest named at checkout, or a transfer)
export default function ClaimTicket() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { user, ready } = useAuth();
  const location = useLocation();
  const [state, setState] = useState({ status: 'idle' });
  const started = useRef(false);

  useEffect(() => {
    if (!ready || !user || !token || started.current) return; // the link works once - never send it twice
    started.current = true;
    setState({ status: 'working' });
    api
      .post('/tickets/claim', { token })
      .then(({ data }) => setState({ status: 'ok', count: data.count, event: data.event }))
      .catch((err) => setState({ status: 'error', message: errMsg(err) }));
  }, [ready, user, token]);

  const back = { from: location.pathname + location.search };

  return (
    <div className="page narrow">
      <div className="card center">
        {!token && <div className="alert error">This ticket link is incomplete. Open the link from your email again.</div>}

        {token && ready && !user && (
          <>
            <h2>Your ticket is waiting</h2>
            <p className="muted">Log in or create a free account to add the ticket to "My Tickets". The PDF in your email already works at the gate.</p>
            <Link className="btn block" to="/login" state={back}>Log in</Link>
            <Link className="btn ghost block" to="/register" state={back}>Create an account</Link>
          </>
        )}

        {(state.status === 'working' || (token && !ready)) && <div className="spinner" />}

        {state.status === 'ok' && (
          <>
            <div className="big-check">✓</div>
            <h2>{state.count > 1 ? `${state.count} tickets added` : 'Ticket added'}</h2>
            <p className="muted">{state.event?.title ? `Your ticket${state.count > 1 ? 's' : ''} for ${state.event.title} ${state.count > 1 ? 'are' : 'is'} now in your account.` : 'It is now in your account.'}</p>
            <Link className="btn block" to="/tickets">View my tickets</Link>
          </>
        )}

        {state.status === 'error' && (
          <>
            <h2>We could not add this ticket</h2>
            <div className="alert error">{state.message}</div>
            <Link className="btn block" to="/tickets">View my tickets</Link>
          </>
        )}
      </div>
    </div>
  );
}
