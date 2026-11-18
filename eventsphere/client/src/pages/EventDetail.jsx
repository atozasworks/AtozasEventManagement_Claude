import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg, getAttribution } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { coverStyle, dateLong, money, time } from '../utils/format.js';
import { openRazorpay, isTestKey } from '../utils/razorpay.js';
import { savedPromo, forgetPromo, offerText } from '../utils/promoLink.js';

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
  const [checkout, setCheckout] = useState(null); // how to pay for the created order (Razorpay details, or simulated)
  const [quote, setQuote] = useState(null); // server-calculated price for the current selection
  const [promo, setPromo] = useState(''); // what is typed in the promo box
  const [applied, setApplied] = useState(''); // promo code currently applied
  const [promoMsg, setPromoMsg] = useState(null);
  const [attendees, setAttendees] = useState({}); // "ticketTypeId:index" -> { name, email } for tickets meant for other people
  const setAttendee = (key, patch) => setAttendees((a) => ({ ...a, [key]: { ...a[key], ...patch } }));
  const [invite, setInvite] = useState(null); // promo code that arrived with an invitation link: { valid, code, type, value, ... }

  useEffect(() => {
    api.get(`/events/${slug}`).then((r) => setEvent(r.data)).catch((e) => setError(errMsg(e)));
  }, [slug]);

  // Back from logging in or signing up: put the tickets they had chosen back in the box
  useEffect(() => {
    if (!event) return;
    try {
      const kept = JSON.parse(sessionStorage.getItem(`es_cart:${slug}`));
      sessionStorage.removeItem(`es_cart:${slug}`);
      if (!kept) return;
      const restored = {};
      for (const t of event.ticketTypes) {
        const n = Math.min(Number(kept[t._id]) || 0, t.maxPerOrder, t.quantity - t.sold);
        if (n > 0) restored[t._id] = n;
      }
      setQty(restored);
    } catch { /* nothing kept */ }
  }, [event, slug]);

  // Opened through a promo invitation link (now, or earlier in this browser)? Ask what the code is worth.
  const eventId = event?._id;
  useEffect(() => {
    const code = savedPromo(slug);
    if (!eventId || !code) return;
    let stale = false;
    api
      .get('/coupons/check', { params: { eventId, code } })
      .then(({ data }) => {
        if (stale) return;
        setInvite(data);
        if (!data.valid) forgetPromo(slug); // do not keep offering a dead code
      })
      // The check could not be reached (busy network, many visitors behind one connection): still try the code
      // at checkout, where the price calculation has the final word.
      .catch(() => { if (!stale) setInvite({ valid: true, code, unchecked: true }); });
    return () => { stale = true; };
  }, [slug, eventId]);

  useEffect(() => {
    if (user) setBuyer({ name: user.name, email: user.email, phone: user.phone || '' });
  }, [user]);

  const selected = useMemo(
    () => (event?.ticketTypes || []).filter((t) => qty[t._id] > 0).map((t) => ({ ...t, qty: qty[t._id] })),
    [event, qty]
  );
  const subtotal = selected.reduce((s, t) => s + t.price * t.qty, 0);
  const totalQty = selected.reduce((s, t) => s + t.qty, 0);

  const tracks = useMemo(() => {
    const map = {};
    for (const s of event?.sessions || []) (map[s.track || 'Main'] ||= []).push(s);
    return map;
  }, [event]);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!event) return <div className="page"><div className="spinner" /></div>;

  const ended = new Date(event.endDate) < new Date();
  const virtualOn = ['virtual', 'hybrid'].includes(event.format);

  // Ask the server what this selection costs (group discount and promo code included)
  async function loadQuote(code = '') {
    const { data } = await api.post('/orders/quote', {
      eventId: event._id,
      items: selected.map((t) => ({ ticketTypeId: t._id, qty: t.qty })),
      promoCode: code || undefined,
    });
    setQuote(data);
    return data;
  }

  async function startCheckout() {
    if (!user) {
      // Keep the chosen tickets while they log in or sign up, so they do not have to pick again
      try { sessionStorage.setItem(`es_cart:${slug}`, JSON.stringify(qty)); } catch { /* they just choose again */ }
      return navigate('/login', { state: { from: `/e/${slug}` } });
    }
    setFormError('');
    setPromoMsg(null);
    setBusy(true);
    try {
      // A code typed earlier wins; otherwise use the one from the invitation link
      const fromInvite = !applied && invite?.valid ? invite.code : '';
      const code = applied || fromInvite;
      try {
        const q = await loadQuote(code);
        if (q.discount?.kind === 'promo') {
          setApplied(code);
          if (fromInvite) setPromoMsg({ type: 'success', text: `${code} from your invitation link is applied. You save ${money(q.discount.amount, q.currency)}.` });
        } else {
          setApplied('');
          if (fromInvite && q.promoNote) setPromoMsg({ type: 'info', text: q.promoNote });
        }
      } catch (err) {
        if (!code) throw err;
        setApplied(''); // the code does not fit this selection - carry on without it
        const q = await loadQuote('');
        if (fromInvite && q.listTotal > 0) setPromoMsg({ type: 'info', text: `${code} was not applied: ${errMsg(err)}.` });
      }
      setStep('details');
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function applyPromo() {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    setPromoMsg(null);
    try {
      const q = await loadQuote(code);
      if (q.discount?.kind === 'promo') {
        setApplied(code);
        setPromo('');
        setPromoMsg({ type: 'success', text: `${code} applied. You save ${money(q.discount.amount, q.currency)}.` });
      } else {
        setApplied('');
        setPromoMsg({ type: 'info', text: q.promoNote || 'This code does not change your price.' });
      }
    } catch (err) {
      setPromoMsg({ type: 'error', text: errMsg(err) });
    }
  }

  async function removePromo() {
    if (invite && applied === invite.code) {
      // The buyer chose not to use the invitation code: stop applying it automatically
      forgetPromo(slug);
      setInvite(null);
    }
    setApplied('');
    setPromoMsg(null);
    try { await loadQuote(''); } catch (err) { setFormError(errMsg(err)); }
  }

  async function createOrder(e) {
    e.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const { data } = await api.post('/orders', {
        eventId: event._id,
        items: selected.map((t) => ({
          ticketTypeId: t._id,
          qty: t.qty,
          attendees: Array.from({ length: t.qty }, (_, i) => attendees[`${t._id}:${i}`] || {}),
        })),
        buyer,
        answers,
        promoCode: applied || undefined,
        attribution: getAttribution(),
      });
      setOrder(data.order);
      setCheckout(data.checkout || null);
      setStep(data.tickets ? 'done' : 'pay');
    } catch (err) {
      setFormError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  // Real payment: Razorpay's window collects the money, then our server verifies it and issues the tickets
  async function payWithRazorpay() {
    setBusy(true);
    setFormError('');
    try {
      const proof = await openRazorpay(checkout);
      const { data } = await api.post(`/orders/${order._id}/pay`, proof);
      setOrder(data.order);
      setStep('done');
    } catch (err) {
      if (err?.cancelled) {
        api.post(`/orders/${order._id}/failed`, { reason: err.message || 'Payment window closed' }).catch(() => {});
        setFormError(`${err.message ? `${err.message}. ` : 'The payment was not completed. '}You have not been charged for tickets. You can try again.`);
      } else if (err?.response) {
        setFormError(errMsg(err));
      } else {
        // Paid, but we could not reach our server to confirm: Razorpay also tells the server directly
        setFormError(`${errMsg(err)} If money left your account, your tickets will appear under "My Tickets" within a few minutes.`);
      }
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
              {invite?.valid && invite.unchecked && (
                <div className="alert success invite-note">
                  <b>Invitation code {invite.code}</b> from your link will be applied at checkout if it is still valid.
                  {!user && ' Log in or create an account when you continue - the code stays with you.'}
                </div>
              )}
              {invite?.valid && !invite.unchecked && (
                <div className="alert success invite-note">
                  <b>Invitation code {invite.code}: {offerText(invite, invite.currency)}</b>
                  {invite.onlyFor?.length > 0 && ` on ${invite.onlyFor.join(', ')} tickets`}.
                  {' '}It is applied automatically at checkout{invite.validTo ? `, until ${dateLong(invite.validTo)}` : ''}.
                  {!user && ' Log in or create an account when you continue - the code stays with you.'}
                </div>
              )}
              {invite && !invite.valid && (
                <div className="alert info invite-note">The promo code {invite.code} in your link cannot be used: {invite.reason}. You can still book at the normal price.</div>
              )}
              {event.ticketTypes.map((t) => {
                const left = t.quantity - t.sold;
                const notYet = t.salesStart && new Date(t.salesStart) > new Date();
                const closed = t.salesEnd && new Date(t.salesEnd) < new Date();
                return (
                  <div key={t._id} className="ticket-row">
                    <div>
                      <b>{t.name}</b>
                      <div className="muted small">{t.description}</div>
                      <div className="small">
                        {money(t.price, event.currency)}
                        {t.access !== 'both' && <span className="pill subtle tiny">{t.access}</span>}
                        {left <= 20 && left > 0 && !closed && <span className="warn-text"> · only {left} left</span>}
                      </div>
                      {t.salesEnd && !closed && !notYet && left > 0 && <div className="muted tiny">On sale until {dateLong(t.salesEnd)}</div>}
                      {notYet && <div className="muted tiny">On sale from {dateLong(t.salesStart)}</div>}
                    </div>
                    {left <= 0 ? (
                      <span className="pill warn">Sold out</span>
                    ) : closed ? (
                      <span className="pill subtle">Sales ended</span>
                    ) : notYet ? (
                      <span className="pill subtle">Not on sale yet</span>
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
              {event.groupDiscount?.minQty >= 2 && event.groupDiscount.percent > 0 && subtotal > 0 && (
                <p className="ok-text small">
                  {totalQty >= event.groupDiscount.minQty
                    ? `Group discount: ${event.groupDiscount.percent}% off will be applied at the next step.`
                    : `Buy ${event.groupDiscount.minQty} or more tickets and save ${event.groupDiscount.percent}%.`}
                </p>
              )}
              {event.refundPolicy && subtotal > 0 && <p className="muted tiny">Refund policy: {event.refundPolicy}</p>}
              {formError && <div className="alert error">{formError}</div>}
              <button className="btn block" disabled={!selected.length || ended || busy} onClick={startCheckout}>
                {ended ? 'Event has ended' : busy ? 'Please wait…' : subtotal === 0 && selected.length ? 'Register' : 'Continue'}
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
              {totalQty > 1 && (
                <div className="attendee-box">
                  <b className="small">Who are the tickets for? (optional)</b>
                  <p className="muted tiny">
                    Leave a ticket blank to keep it in your name. Add a name to print it on the ticket; add an email too and we send that person their own ticket.
                  </p>
                  {selected.map((t) =>
                    Array.from({ length: t.qty }, (_, i) => {
                      const k = `${t._id}:${i}`;
                      return (
                        <div key={k} className="attendee-row">
                          <span className="tiny muted">{t.name} {t.qty > 1 ? `#${i + 1}` : ''}</span>
                          <input aria-label={`Name for ${t.name} ticket ${i + 1}`} placeholder={buyer.name || 'Full name'} value={attendees[k]?.name || ''} onChange={(e) => setAttendee(k, { name: e.target.value })} />
                          <input aria-label={`Email for ${t.name} ticket ${i + 1}`} type="email" placeholder="Email (optional)" value={attendees[k]?.email || ''} onChange={(e) => setAttendee(k, { email: e.target.value })} />
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              {quote?.listTotal > 0 && (
                <>
                  <div className="promo-row">
                    <input
                      aria-label="Promo code"
                      placeholder="Promo code"
                      value={promo}
                      onChange={(e) => setPromo(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }}
                    />
                    <button type="button" className="btn ghost sm" disabled={!promo.trim()} onClick={applyPromo}>Apply</button>
                  </div>
                  {promoMsg && <div className={`alert ${promoMsg.type}`}>{promoMsg.text}</div>}
                  <div className="summary">
                    <div className="row between small"><span>Tickets</span><span>{money(quote.listTotal, quote.currency)}</span></div>
                    {quote.discount && (
                      <div className="row between small ok-text">
                        <span>
                          {quote.discount.label}
                          {quote.discount.kind === 'promo' && <button type="button" className="link-btn tiny promo-remove" onClick={removePromo}>Remove</button>}
                        </span>
                        <span>− {money(quote.discount.amount, quote.currency)}</span>
                      </div>
                    )}
                    <div className="row between small muted"><span>Platform fee</span><span>{quote.platformFee > 0 ? money(quote.platformFee, quote.currency) : '—'}</span></div>
                    <div className="row between"><b>Total</b><b>{money(quote.total, quote.currency)}</b></div>
                  </div>
                </>
              )}
              {formError && <div className="alert error">{formError}</div>}
              <div className="row gap">
                <button type="button" className="btn ghost" onClick={() => { setStep('select'); setFormError(''); }}>Back</button>
                <button className="btn grow" disabled={busy}>{busy ? 'Please wait…' : (quote ? quote.total : subtotal) === 0 ? 'Confirm registration' : 'Continue to payment'}</button>
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
                {order.discount?.amount > 0 && (
                  <div className="row between small ok-text"><span>{order.discount.label}</span><span>− {money(order.discount.amount, order.currency)}</span></div>
                )}
                <div className="row between small muted"><span>Platform fee</span><span>{money(order.platformFee, order.currency)}</span></div>
                <div className="row between"><b>Total</b><b>{money(order.total, order.currency)}</b></div>
              </div>
              {checkout?.provider === 'razorpay' ? (
                <>
                  <p className="small muted">
                    You pay in Razorpay's secure window with UPI, a card, net banking or a wallet. Your tickets are issued as soon as the payment is confirmed.
                  </p>
                  {isTestKey(checkout.key) && <div className="alert info">Test mode: no real money moves. Use Razorpay's test UPI ID or test cards.</div>}
                  {formError && <div className="alert error">{formError}</div>}
                  <button className="btn block" disabled={busy} onClick={payWithRazorpay}>
                    {busy ? 'Waiting for payment…' : `Pay ${money(order.total, order.currency)}`}
                  </button>
                </>
              ) : (
                <>
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
                  <p className="muted tiny">Demo mode: payments are simulated and no money moves. Set PAYMENT_MODE=razorpay on the server to take real payments.</p>
                </>
              )}
              {event.refundPolicy && <p className="muted tiny">Refund policy: {event.refundPolicy}</p>}
            </>
          )}

          {step === 'done' && (
            <div className="center">
              <div className="big-check">✓</div>
              <h3>You're in!</h3>
              <p className="muted">
                Your tickets and QR codes are ready. We emailed a PDF copy to {buyer.email}
                {buyer.phone ? ` and sent a WhatsApp confirmation to ${buyer.phone}` : ''}.
              </p>
              <Link className="btn block" to="/tickets">View my tickets</Link>
              {virtualOn && <Link className="btn ghost block" to={`/live/${event._id}`}>Enter virtual venue</Link>}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
