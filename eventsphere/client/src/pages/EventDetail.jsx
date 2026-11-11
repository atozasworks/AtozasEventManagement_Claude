import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg, getAttribution } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { coverStyle, dateLong, money, time } from '../utils/format.js';

const METHODS = [
  { id: 'upi', label: 'UPI', hint: 'GPay, PhonePe, Paytm, BHIM' },
  { id: 'card', label: 'Card', hint: 'Debit / credit, RuPay, Visa, Mastercard' },
  { id: 'netbanking', label: 'Net banking', hint: 'All major Indian banks' },
  { id: 'wallet', label: 'Wallet', hint: 'Paytm, PhonePe, Amazon Pay' },
];

export default function EventDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');
  const [qty, setQty] = useState({});
  const [answers, setAnswers] = useState({});
  const [buyer, setBuyer] = useState({ name: '', email: '', phone: '' });
  const [step, setStep] = useState('select'); // select | details | pay | done
  const [order, setOrder] = useState(null);
  const [method, setMethod] = useState('upi');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    api.get(`/events/${slug}`).then((r) => setEvent(r.data)).catch((e) => setError(errMsg(e)));
  }, [slug]);

  useEffect(() => {
    if (user) setBuyer({ name: user.name, email: user.email, phone: user.phone || '' });
  }, [user]);

  const selected = useMemo(
    () => (event?.ticketTypes || []).filter((t) => qty[t._id] > 0).map((t) => ({ ...t, qty: qty[t._id] })),
    [event, qty]
  );
  const subtotal = selected.reduce((s, t) => s + t.price * t.qty, 0);

  const tracks = useMemo(() => {
    const map = {};
    for (const s of event?.sessions || []) (map[s.track || 'Main'] ||= []).push(s);
    return map;
  }, [event]);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!event) return <div className="page"><div className="spinner" /></div>;

  const ended = new Date(event.endDate) < new Date();
  const virtualOn = ['virtual', 'hybrid'].includes(event.format);

  async function startCheckout() {
    if (!user) return navigate('/login', { state: { from: `/e/${slug}` } });
    setFormError('');
    setStep('details');
  }

  async function createOrder(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const { data } = await api.post('/orders', {
        eventId: event._id,
        items: selected.map((t) => ({ ticketTypeId: t._id, qty: t.qty })),
        buyer,
        answers,
        attribution: getAttribution(),
      });
      setOrder(data.order);
      setStep(data.tickets ? 'done' : 'pay');
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function pay(simulateFailure = false) {
    setBusy(true);
    setFormError('');
    try {
      const { data } = await api.post(`/orders/${order._id}/pay`, { method, simulateFailure });
      setOrder(data.order);
      setStep('done');
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="event-hero" style={coverStyle(event, 1800)}>
        <div className="event-hero-inner">
          <div className="event-meta">
            <span className={`pill ${event.format}`}>{event.format}</span>
            <span className="pill light">{event.category}</span>
            {event.status !== 'published' && <span className="pill warn">{event.status}</span>}
          </div>
          <h1>{event.title}</h1>
          <p className="lead">{event.summary}</p>
          <p>
            {dateLong(event.startDate)} → {dateLong(event.endDate)}
            <br />
            {event.format === 'virtual' ? 'Online event' : [event.location?.venueName, event.location?.city].filter(Boolean).join(', ')}
            {event.format === 'hybrid' && ' · also streaming online'}
          </p>
          <p className="small">Hosted by {event.organizer?.organizationName || event.organizer?.name}</p>
        </div>
      </section>

      <div className="page two-col">
        <div>
          {event.isOwner && (
            <div className="alert info">
              You manage this event. <Link to={`/organize/${event._id}`}>Open the dashboard →</Link>
            </div>
          )}
          {event.hasTicket && virtualOn && (
            <div className="alert success">
              You're registered. <Link to={`/live/${event._id}`}>Enter the virtual venue →</Link>
            </div>
          )}

          <h2>About</h2>
          <p className="prewrap">{event.description || event.summary}</p>
          {event.tags?.length > 0 && (
            <div className="tags">{event.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
          )}

          {event.modules?.agenda && event.sessions?.length > 0 && (
            <>
              <h2>Agenda</h2>
              {Object.entries(tracks).map(([track, sessions]) => (
                <div key={track} className="track">
                  <h4>{track}</h4>
                  {sessions.map((s) => (
                    <div key={s._id} className="session">
                      <span className="session-time">{time(s.startTime)}</span>
                      <div>
                        <b>{s.title}</b>
                        <div className="muted small">{[s.speaker, s.room].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          <h2>What's included</h2>
          <div className="module-list">
            {event.modules?.streaming && <span>📺 Live streaming</span>}
            {event.modules?.expo && <span>🏢 Virtual & on-site expo</span>}
            {event.modules?.networking && <span>🤝 Attendee networking</span>}
            {event.modules?.checkin && <span>📱 QR fast-track entry</span>}
            {event.modules?.agenda && <span>🗓️ Multi-track agenda</span>}
          </div>
        </div>

        <aside className="card sticky">
          {step === 'select' && (
            <>
              <h3>Tickets</h3>
              {event.ticketTypes.map((t) => {
                const left = t.quantity - t.sold;
                return (
                  <div key={t._id} className="ticket-row">
                    <div>
                      <b>{t.name}</b>
                      <div className="muted small">{t.description}</div>
                      <div className="small">
                        {money(t.price, event.currency)}
                        {t.access !== 'both' && <span className="pill subtle tiny">{t.access}</span>}
                        {left <= 20 && left > 0 && <span className="warn-text"> · only {left} left</span>}
                      </div>
                    </div>
                    {left <= 0 ? (
                      <span className="pill warn">Sold out</span>
                    ) : (
                      <select
                        value={qty[t._id] || 0}
                        disabled={ended || event.status !== 'published'}
                        onChange={(e) => setQty({ ...qty, [t._id]: Number(e.target.value) })}
                      >
                        {Array.from({ length: Math.min(t.maxPerOrder, left) + 1 }, (_, i) => <option key={i}>{i}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
              <div className="total-row">
                <span>Subtotal</span>
                <b>{money(subtotal, event.currency)}</b>
              </div>
              <button className="btn block" disabled={!selected.length || ended} onClick={startCheckout}>
                {ended ? 'Event has ended' : subtotal === 0 && selected.length ? 'Register' : 'Continue'}
              </button>
            </>
          )}

          {step === 'details' && (
            <form onSubmit={createOrder}>
              <h3>Your details</h3>
              <label>Full name<input required value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} /></label>
              <label>Email<input required type="email" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} /></label>
              <label>WhatsApp number<input placeholder="+91…" value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} /></label>
              {event.registrationFields?.map((f) => (
                <label key={f._id} className={f.type === 'checkbox' ? 'check' : ''}>
                  {f.type === 'checkbox' ? (
                    <>
                      <input type="checkbox" checked={!!answers[f.label]} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.checked })} />
                      {f.label}
                    </>
                  ) : (
                    <>
                      {f.label}{f.required && ' *'}
                      {f.type === 'select' ? (
                        <select required={f.required} value={answers[f.label] || ''} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })}>
                          <option value="">Choose…</option>
                          {f.options.map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input type={f.type} required={f.required} value={answers[f.label] || ''} onChange={(e) => setAnswers({ ...answers, [f.label]: e.target.value })} />
                      )}
                    </>
                  )}
                </label>
              ))}
              {formError && <div className="alert error">{formError}</div>}
              <div className="row gap">
                <button type="button" className="btn ghost" onClick={() => setStep('select')}>Back</button>
                <button className="btn grow" disabled={busy}>{busy ? 'Please wait…' : subtotal === 0 ? 'Confirm registration' : 'Continue to payment'}</button>
              </div>
            </form>
          )}

          {step === 'pay' && order && (
            <>
              <h3>Payment</h3>
              <div className="summary">
                {order.items.map((i) => (
                  <div key={i.ticketTypeId} className="row between small"><span>{i.qty} × {i.name}</span><span>{money(i.price * i.qty, order.currency)}</span></div>
                ))}
                <div className="row between small muted"><span>Platform fee</span><span>{money(order.platformFee, order.currency)}</span></div>
                <div className="row between"><b>Total</b><b>{money(order.total, order.currency)}</b></div>
              </div>
              <div className="methods">
                {METHODS.map((m) => (
                  <label key={m.id} className={`method ${method === m.id ? 'on' : ''}`}>
                    <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
                    <div><b>{m.label}</b><div className="muted small">{m.hint}</div></div>
                  </label>
                ))}
              </div>
              {formError && <div className="alert error">{formError}</div>}
              <button className="btn block" disabled={busy} onClick={() => pay(false)}>
                {busy ? 'Processing…' : `Pay ${money(order.total, order.currency)}`}
              </button>
              <button className="link-btn small" onClick={() => pay(true)}>Test a failed payment</button>
              <p className="muted tiny">Development mode: payments are simulated. Plug in Razorpay/Cashfree in server/src/services/payments.js.</p>
            </>
          )}

          {step === 'done' && (
            <div className="center">
              <div className="big-check">✓</div>
              <h3>You're in!</h3>
              <p className="muted">Your tickets and QR codes are ready. A confirmation has been sent to WhatsApp{buyer.phone ? ` (${buyer.phone})` : ''}.</p>
              <Link className="btn block" to="/tickets">View my tickets</Link>
              {virtualOn && <Link className="btn ghost block" to={`/live/${event._id}`}>Enter virtual venue</Link>}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
