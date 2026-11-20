import { useEffect, useRef, useState } from 'react';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.getElementById('google-gsi');
    const done = () => (window.google?.accounts?.id ? resolve() : reject(new Error('Google sign-in failed to load')));
    if (existing) {
      existing.addEventListener('load', done, { once: true });
      existing.addEventListener('error', () => reject(new Error('Google sign-in failed to load')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = done;
    script.onerror = () => reject(new Error('Google sign-in failed to load'));
    document.head.appendChild(script);
  });
}

/**
 * Official "Continue with Google" button.
 * `extras` (role, organisation, marketing consent) is sent only when creating or linking an account.
 */
export default function GoogleContinue({ extras, onSuccess, onError }) {
  const { loginWithGoogle } = useAuth();
  const slotRef = useRef(null);
  const extrasRef = useRef(extras);
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const loginRef = useRef(loginWithGoogle);
  extrasRef.current = extras;
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  loginRef.current = loginWithGoogle;

  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/auth/google/config')
      .then((r) => {
        if (cancelled) return;
        setClientId(r.data.clientId || '');
        setStatus(r.data.enabled ? 'ready' : 'unconfigured');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !clientId || !slotRef.current) return undefined;
    let cancelled = false;
    const slot = slotRef.current;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !slotRef.current) return;
        const width = Math.min(400, Math.max(240, Math.floor(slotRef.current.clientWidth || 320)));
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            if (!response?.credential) return;
            setBusy(true);
            try {
              const user = await loginRef.current(response.credential, extrasRef.current || {});
              onSuccessRef.current?.(user);
            } catch (err) {
              onErrorRef.current?.(errMsg(err));
            } finally {
              setBusy(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
        });
        slot.innerHTML = '';
        window.google.accounts.id.renderButton(slot, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width,
        });
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      slot.innerHTML = '';
    };
  }, [status, clientId]);

  if (status === 'unconfigured') {
    return <p className="small muted google-note">Continue with Google is waiting for a client id in the server settings.</p>;
  }
  if (status === 'error') {
    return <p className="small muted google-note">Continue with Google could not be loaded. You can still sign in with email.</p>;
  }

  return (
    <div className={`google-continue${busy ? ' busy' : ''}`}>
      <div ref={slotRef} className="google-btn-slot" />
      {busy && <p className="small muted">Signing in with Google…</p>}
    </div>
  );
}
