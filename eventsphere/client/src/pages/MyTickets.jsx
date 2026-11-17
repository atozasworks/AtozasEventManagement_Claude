import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { dateLong } from '../utils/format.js';

export default function MyTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);
  const [notice, setNotice] = useState(null);
  const [transfer, setTransfer] = useState(null); // ticket being transferred
  const [form, setForm] = useState({ name: '', email: '' });
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(null); // ticket a refund is being requested for
  const [reason, setReason] = useState('');

  const load = () => api.get('/tickets/mine').then((r) => setTickets(r.data)).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, []);

  async function downloadPdf(t) {
    setDownloading(t._id);
    setNotice(null);
    try {
      const r = await api.get(`/tickets/${t._id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t.event?.slug || 'ticket'}-${t.code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNotice({ type: 'error', text: 'The PDF could not be downloaded. Please try again.' });
    } finally {
      setDownloading(null);
    }
  }

  async function sendTransfer(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const { data } = await api.post(`/tickets/${transfer._id}/transfer`, form);
      setNotice({ type: 'success', text: `Ticket sent to ${data.toName} (${data.toEmail}). Your old QR code no longer works.` });
      setTransfer(null);
      setForm({ name: '', email: '' });
      await load();
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelTransfer(t) {
    if (!window.confirm(`Take this ticket back from ${t.holderName}? The copy we emailed them will stop working.`)) return;
    setNotice(null);
    try {
      await api.post(`/tickets/${t._id}/cancel-transfer`);
      setNotice({ type: 'success', text: 'The ticket is back in your account with a new QR code.' });
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err) });
    }
    await load();
  }

  // Ask the organizer for a refund (paid ticket) or free the seat straight away (free ticket)
  async function sendCancelRequest(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const { data } = await api.post(`/tickets/${cancel._id}/cancel-request`, { reason });
      setNotice({
        type: 'success',
        text: data.cancelled ? 'Your registration is cancelled and the seat has been released.' : 'Refund requested. The organizer will approve or decline it, and we will email you either way.',
      });
      setCancel(null);
      setReason('');
      await load();
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function withdrawRequest(t) {
    setNotice(null);
    try {
      await api.post(`/tickets/${t._id}/cancel-request/withdraw`);
      setNotice({ type: 'success', text: 'Refund request withdrawn. Your ticket stays valid.' });
    } catch (err) {
      setNotice({ type: 'error', text: errMsg(err) });
    }
    await load();
  }

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!tickets) return <div className="page"><div className="spinner" /></div>;

  const upcoming = (ev) => ev.status === 'published' && new Date(ev.startDate) > new Date();
  const canTransfer = (t, ev) => t.relation === 'holder' && t.status !== 'cancelled' && !t.checkedIn && ev.allowTransfers !== false && upcoming(ev);
  // Only the person who paid can ask for the money back
  const canRequest = (t, ev) => t.iBought && t.status !== 'cancelled' && !t.checkedIn && !t.cancelRequest && upcoming(ev) && (!t.paid || ev.allowCancelRequests !== false);

  return (
    <div className="page">
      <h1>My tickets</h1>
      {notice && <div className={`alert ${notice.type}`}>{notice.text}</div>}
      {!tickets.length && (
        <div className="empty">No tickets yet. <Link to="/">Discover events →</Link></div>
      )}
      <div className="ticket-grid">
        {tickets.filter((t) => t.event).map((t) => {
          const ev = t.event;
          const cancelled = t.status === 'cancelled';
          const holder = t.relation === 'holder' && !cancelled;
          const live = holder && ['virtual', 'hybrid'].includes(ev.format) && t.access !== 'in-person';
          const onsite = holder && ev.format !== 'virtual' && t.access !== 'virtual';
          const forSomeoneElse = holder && t.awaitingClaim && t.holderEmail !== user.email?.toLowerCase();
          return (
            <div key={t._id} className={`ticket ${holder ? '' : 'ticket-away'}`}>
              <div className="ticket-main">
                <span className="pill subtle">{t.ticketTypeName}</span>
                <h3><Link to={`/e/${ev.slug}`}>{ev.title}</Link></h3>
                <p className="small">{dateLong(ev.startDate)}</p>
                <p className="small muted">{ev.format === 'virtual' ? 'Online' : [ev.location?.venueName, ev.location?.city].filter(Boolean).join(', ')}</p>
                <p className="small">Holder: <b>{t.holderName}</b></p>

                {cancelled && (
                  <p className="small warn-text">
                    <span className="pill warn">Cancelled</span>{' '}
                    {t.paid && t.iBought ? 'Your refund goes back to the payment method you used, usually within 5–7 working days.' : 'This ticket is no longer valid.'}
                  </p>
                )}
                {!cancelled && t.iBought && t.cancelRequest?.status === 'requested' && (
                  <>
                    <p className="small warn-text">Refund requested — waiting for the organizer. Your ticket stays valid until they decide.</p>
                    <button className="btn ghost sm" onClick={() => withdrawRequest(t)}>Withdraw request</button>
                  </>
                )}
                {!cancelled && t.iBought && t.cancelRequest?.status === 'declined' && (
                  <p className="small muted">The organizer declined a refund for this ticket{t.cancelRequest.note ? `: "${t.cancelRequest.note}"` : '.'}</p>
                )}

                {!cancelled && t.relation === 'transferPending' && (
                  <>
                    <p className="small warn-text">Transferred to {t.holderName} ({t.holderEmail}) — waiting for them to add it to their account.</p>
                    <button className="btn ghost sm" onClick={() => cancelTransfer(t)}>Cancel transfer</button>
                  </>
                )}
                {!cancelled && t.relation === 'givenAway' && <p className="small muted">You bought this ticket. It is now in {t.holderName}'s account.</p>}
                {forSomeoneElse && (
                  <p className="small muted">
                    Booked for {t.holderName}. We emailed the ticket to {t.holderEmail}; it stays here too until they add it to their own account.
                  </p>
                )}

                {holder && (
                  <div className="row gap wrap">
                    {live && <Link className="btn sm" to={`/live/${ev._id}`}>Join online</Link>}
                    <button className="btn ghost sm" disabled={downloading === t._id} onClick={() => downloadPdf(t)}>
                      {downloading === t._id ? 'Preparing…' : 'Download PDF'}
                    </button>
                    {canTransfer(t, ev) && (
                      <button className="btn ghost sm" onClick={() => { setTransfer(t); setFormError(''); setNotice(null); }}>Transfer</button>
                    )}
                  </div>
                )}
                {canRequest(t, ev) && (
                  <button className="link-btn small" onClick={() => { setCancel(t); setReason(''); setFormError(''); setNotice(null); }}>
                    {t.paid ? 'Request a refund' : 'Cancel my registration'}
                  </button>
                )}
              </div>
              {onsite && (
                <div className="ticket-qr">
                  {/* Signed QR (verifiable offline at the gate); the short code under it still works when typed */}
                  <QRCodeSVG value={t.qr || t.code} size={164} level="M" />
                  <code>{t.code}</code>
                  {t.checkedIn ? <span className="pill ok">Checked in</span> : <span className="muted tiny">Show at entry</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cancel && (
        <div className="modal-backdrop" onClick={() => setCancel(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={sendCancelRequest}>
            <h2>{cancel.paid ? 'Request a refund' : 'Cancel my registration'}</h2>
            <p className="muted">{cancel.ticketTypeName} · {cancel.event.title} · {cancel.holderName}</p>
            <label>{cancel.paid ? 'Reason (the organizer will see this)' : 'Reason (optional)'}
              <textarea rows={3} maxLength={300} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <p className="small muted">
              {cancel.paid
                ? 'The organizer decides whether to refund. If they approve, this ticket is cancelled and the money goes back to the payment method you used. Until then your ticket stays valid.'
                : 'This ticket is cancelled straight away and the seat is offered to someone else. This cannot be undone.'}
            </p>
            {formError && <div className="alert error">{formError}</div>}
            <div className="row gap">
              <button className="btn" disabled={busy}>{busy ? 'Sending…' : cancel.paid ? 'Send request' : 'Cancel registration'}</button>
              <button type="button" className="btn ghost" onClick={() => setCancel(null)}>Keep my ticket</button>
            </div>
          </form>
        </div>
      )}

      {transfer && (
        <div className="modal-backdrop" onClick={() => setTransfer(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={sendTransfer}>
            <h2>Transfer this ticket</h2>
            <p className="muted">{transfer.ticketTypeName} · {transfer.event.title}</p>
            <label>Their full name<input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>Their email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <p className="small muted">
              We email them the ticket with a new QR code. Your current QR code, screenshots and PDF stop working straight away.
              You can cancel until they add the ticket to their account. Transfers are possible until the event starts.
            </p>
            {formError && <div className="alert error">{formError}</div>}
            <div className="row gap">
              <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send ticket'}</button>
              <button type="button" className="btn ghost" onClick={() => setTransfer(null)}>Keep my ticket</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
