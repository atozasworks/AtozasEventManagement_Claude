import { Router } from 'express';
import Event from '../models/Event.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import { protect } from '../middleware/auth.js';
import { ah, HttpError, isObjectId } from '../utils/http.js';
import { loadOwnedEvent } from './events.js';
import { refundTickets } from '../services/refunds.js';
import { logAdmin } from '../services/audit.js';
import { notify } from '../services/notify.js';
import Coupon from '../models/Coupon.js';
import { getGateway } from '../services/payments.js';
import { priceOrder } from '../services/pricing.js';
import { sendTicketConfirmation, sendTicketShared } from '../services/notifications.js';
import { ticketCode, newClaimToken, cleanEmail, cleanName, isEmail } from '../utils/tickets.js';
import { pushRegistrationToCRM } from '../services/crm.js';

const router = Router();

// Names/emails typed in the checkout for each ticket of one line. Blank entries are allowed.
function cleanAttendees(list, qty, ticketName) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, qty).map((a) => {
    const name = cleanName(a?.name);
    const email = cleanEmail(a?.email);
    if (email && !isEmail(email)) throw new HttpError(400, `"${email}" is not a valid email address (${ticketName})`);
    if (email && !name) throw new HttpError(400, `Add a name for ${email} (${ticketName})`);
    return { name, email };
  });
}

/**
 * Reserve inventory with compare-and-swap so two buyers can never
 * oversell the last seats, even under heavy festival traffic.
 */
async function reserveInventory(eventId, items) {
  const reserved = [];
  try {
    for (const item of items) {
      let ok = false;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        const ev = await Event.findById(eventId).select('ticketTypes');
        const tt = ev.ticketTypes.id(item.ticketTypeId);
        if (!tt || tt.sold + item.qty > tt.quantity) throw new HttpError(409, `"${item.name}" sold out while you were paying`);
        const r = await Event.updateOne(
          { _id: eventId, ticketTypes: { $elemMatch: { _id: tt._id, sold: tt.sold } } },
          { $inc: { 'ticketTypes.$.sold': item.qty } }
        );
        ok = r.modifiedCount === 1;
      }
      if (!ok) throw new HttpError(409, 'Tickets are selling fast. Please try again.');
      reserved.push(item);
    }
  } catch (err) {
    for (const item of reserved) {
      await Event.updateOne({ _id: eventId, 'ticketTypes._id': item.ticketTypeId }, { $inc: { 'ticketTypes.$.sold': -item.qty } });
    }
    throw err;
  }
}

/**
 * Count this order against its promo code's usage limit (once per order).
 * strict: only succeed while the code still has uses left.
 */
async function claimCoupon(order, { strict = false } = {}) {
  if (!order.discount?.coupon || order.discount.claimed) return true;
  const filter = { _id: order.discount.coupon };
  if (strict) filter.$or = [{ maxUses: 0 }, { $expr: { $lt: ['$used', '$maxUses'] } }];
  const r = await Coupon.updateOne(filter, { $inc: { used: 1 } });
  if (!r.modifiedCount) return !strict;
  order.discount.claimed = true;
  await Order.updateOne({ _id: order._id }, { 'discount.claimed': true });
  return true;
}

async function releaseCoupon(order) {
  if (!order.discount?.coupon || !order.discount.claimed) return;
  await Coupon.updateOne({ _id: order.discount.coupon, used: { $gt: 0 } }, { $inc: { used: -1 } });
  order.discount.claimed = false;
}

/**
 * Issue tickets for a verified payment. Idempotent: the browser callback and the
 * Razorpay webhook may both call this for the same order - only one wins the claim.
 */
export async function finalizePaidOrder(orderId, { paymentId, reference, method } = {}) {
  const order = await Order.findOneAndUpdate(
    { _id: orderId, paymentStatus: { $in: ['pending', 'failed'] } },
    { $set: { paymentStatus: 'processing', 'gateway.paymentId': paymentId, ...(method ? { paymentMethod: method } : {}) } },
    { new: true }
  );

  if (!order) {
    const existing = await Order.findById(orderId);
    if (!existing) throw new HttpError(404, 'Order not found');
    if (existing.paymentStatus === 'refunded') throw new HttpError(409, 'This order was refunded because the tickets sold out.');
    // Already paid (or being finished by a parallel request) - return what exists
    return { order: existing, tickets: await Ticket.find({ order: existing._id }) };
  }

  const event = await Event.findById(order.event);
  // The buyer has already paid the discounted price, so the code is honoured even if it filled up meanwhile
  await claimCoupon(order);
  try {
    await reserveInventory(event._id, order.items);
  } catch (err) {
    // Money was taken but seats are gone: refund automatically
    let refundId;
    if (order.total > 0) {
      try {
        refundId = (await getGateway().refund(order))?.refundId;
      } catch (e) {
        console.error(`REFUND NEEDED for order ${order._id}:`, e.message);
      }
    }
    await releaseCoupon(order);
    order.paymentStatus = 'refunded';
    order.gateway.refundId = refundId;
    order.gateway.failureReason = err.message;
    await order.save();
    throw new HttpError(409, `${err.message} Your payment has been refunded${refundId ? '' : ' (our team will process it shortly)'}.`);
  }

  // One ticket per seat. A ticket named for someone else stays in the buyer's account until
  // that person adds it to their own account from the link we email them.
  const buyerEmail = cleanEmail(order.buyer.email);
  const shareTokens = new Map(); // other person's email -> claim token (one link per person per order)
  const docs = [];
  for (const item of order.items) {
    const tt = event.ticketTypes.id(item.ticketTypeId);
    for (let i = 0; i < item.qty; i++) {
      const named = item.attendees?.[i] || {};
      const holderEmail = cleanEmail(named.email) || buyerEmail;
      let claimTokenHash;
      if (holderEmail !== buyerEmail) {
        if (!shareTokens.has(holderEmail)) shareTokens.set(holderEmail, newClaimToken());
        claimTokenHash = shareTokens.get(holderEmail).hash;
      }
      docs.push({
        order: order._id,
        event: event._id,
        user: order.user,
        purchaser: order.user,
        ticketTypeId: item.ticketTypeId,
        ticketTypeName: item.name,
        access: tt?.access || 'both',
        holderName: named.name || order.buyer.name,
        holderEmail,
        claimTokenHash,
        code: ticketCode(),
      });
    }
  }
  await Ticket.insertMany(docs);
  const tickets = await Ticket.find({ order: order._id }); // fresh read leaves the claim hashes out

  order.paymentStatus = 'paid';
  order.paymentRef = reference || paymentId;
  order.paidAt = new Date();
  await order.save();

  sendTicketConfirmation({ order, event, tickets }).catch(() => {});
  for (const [email, token] of shareTokens) {
    const theirs = tickets.filter((t) => t.holderEmail === email);
    sendTicketShared({ event, tickets: theirs, toName: theirs[0].holderName, toEmail: email, fromName: order.buyer.name, token: token.raw, reason: 'booked' }).catch(() => {});
  }
  pushRegistrationToCRM(event, order).catch(() => {});
  // Bell notification for the organizer of this event (not when they book their own event)
  if (String(event.organizer) !== String(order.user)) {
    const count = tickets.length;
    notify(event.organizer, {
      type: 'booking',
      event: event._id,
      title: `New booking: ${count} ticket${count === 1 ? '' : 's'} for ${event.title}`,
      body: `${order.buyer?.name || 'Someone'} booked ${order.items.map((i) => `${i.qty} x ${i.name}`).join(', ')} - ${order.total > 0 ? `${order.currency} ${order.total.toFixed(2)} paid` : 'free registration'}`,
      link: `/organize/${event._id}?tab=orders`,
    });
  }
  return { order, tickets };
}

async function loadOpenEvent(eventId) {
  const event = await Event.findById(eventId);
  if (!event || event.status !== 'published') throw new HttpError(404, 'This event is not open for registration');
  if (event.endDate < new Date()) throw new HttpError(400, 'This event has already ended');
  return event;
}

// Live price for the checkout: totals, group discount and (optionally) a promo code
router.post(
  '/quote',
  protect,
  ah(async (req, res) => {
    const { eventId, items = [], promoCode } = req.body;
    const event = await loadOpenEvent(eventId);
    const { lines, listTotal, discount, promoNote, subtotal, platformFee, total, currency } = await priceOrder(event, items, promoCode);
    res.json({
      lines,
      listTotal,
      discount: discount ? { kind: discount.kind, code: discount.code, amount: discount.amount, label: discount.label } : null,
      promoNote,
      subtotal,
      platformFee,
      total,
      currency,
    });
  })
);

// Step 1: create an order - validates selection and prices server-side
router.post(
  '/',
  protect,
  ah(async (req, res) => {
    const { eventId, items = [], buyer = {}, answers = {}, attribution = {}, promoCode } = req.body;
    const event = await loadOpenEvent(eventId);

    // Prices, sale windows, stock and discounts are all decided on the server
    const { lines, listTotal, discount, subtotal, platformFee, total } = await priceOrder(event, items, promoCode);

    for (const f of event.registrationFields) {
      if (f.required && (answers[f.label] === undefined || answers[f.label] === '')) {
        throw new HttpError(400, `"${f.label}" is required`);
      }
    }

    // Who each ticket is for (optional)
    for (const line of lines) {
      const sent = items.find((i) => String(i.ticketTypeId) === String(line.ticketTypeId));
      line.attendees = cleanAttendees(sent?.attendees, line.qty, line.name);
    }

    const gateway = getGateway();

    const order = await Order.create({
      event: event._id,
      user: req.user._id,
      buyer: {
        name: buyer.name || req.user.name,
        email: buyer.email || req.user.email,
        phone: buyer.phone || req.user.phone,
      },
      items: lines,
      listTotal,
      discount: discount || undefined,
      subtotal,
      platformFee,
      total,
      currency: event.currency,
      paymentMethod: total === 0 ? 'free' : 'other',
      gateway: { provider: total === 0 ? 'none' : gateway.provider },
      answers,
      attribution,
    });

    if (total === 0) {
      // Nothing to pay, so a limited code (e.g. 10 free passes) must be claimed strictly before tickets go out
      if (order.discount?.coupon && !(await claimCoupon(order, { strict: true }))) {
        order.paymentStatus = 'failed';
        order.gateway.failureReason = 'Promo code fully used';
        await order.save();
        throw new HttpError(409, 'This promo code has just been fully used. Remove it to continue.');
      }
      const result = await finalizePaidOrder(order._id, { reference: `FREE-${Date.now().toString(36).toUpperCase()}`, method: 'free' });
      return res.status(201).json(result);
    }

    let intent;
    try {
      intent = await gateway.createIntent(order, { event });
    } catch (err) {
      order.paymentStatus = 'failed';
      order.gateway.failureReason = err?.error?.description || err.message;
      await order.save();
      console.error('Payment gateway error:', err?.error || err);
      throw new HttpError(502, 'Could not start the payment. Please try again in a moment.');
    }
    order.gateway.orderId = intent.gatewayOrderId;
    await order.save();
    res.status(201).json({ order, checkout: intent.checkout });
  })
);

// Step 2: confirm payment (Razorpay callback or simulated)
router.post(
  '/:id/pay',
  protect,
  ah(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) throw new HttpError(404, 'Order not found');
    if (order.paymentStatus === 'paid') {
      return res.json({ order, tickets: await Ticket.find({ order: order._id }) });
    }

    const result = await getGateway().verify(order, req.body);
    if (!result.ok) {
      await Order.updateOne(
        { _id: order._id, paymentStatus: 'pending' },
        { paymentStatus: 'failed', 'gateway.failureReason': result.reason }
      );
      throw new HttpError(402, `${result.reason || 'Payment failed'}. No tickets were issued.`);
    }
    res.json(await finalizePaidOrder(order._id, result));
  })
);

// Buyer closed or failed the Razorpay window - record it for support / analytics
router.post(
  '/:id/failed',
  protect,
  ah(async (req, res) => {
    await Order.updateOne(
      { _id: req.params.id, user: req.user._id, paymentStatus: 'pending' },
      { paymentStatus: 'failed', 'gateway.failureReason': String(req.body.reason || 'Cancelled by buyer').slice(0, 300) }
    );
    res.json({ ok: true });
  })
);

// Organizer (or admin) cancels tickets of an order and refunds them. Leave ticketIds out for the whole order.
router.post(
  '/:id/refund',
  protect,
  ah(async (req, res) => {
    const order = isObjectId(req.params.id) && (await Order.findById(req.params.id).select('event'));
    if (!order) throw new HttpError(404, 'Order not found');
    const event = await loadOwnedEvent(req, order.event);
    const { ticketIds, reason, fromRequest } = req.body;
    if (ticketIds && (!Array.isArray(ticketIds) || !ticketIds.length)) throw new HttpError(400, 'Choose at least one ticket to refund');
    const result = await refundTickets({
      orderId: order._id,
      ticketIds,
      reason: reason || (fromRequest ? 'Refund requested by the buyer' : 'Refunded by the organizer'),
      by: req.user._id,
      kind: fromRequest ? 'attendee-request' : 'organizer',
    });
    if (String(event.organizer) !== String(req.user._id)) {
      await logAdmin(req, 'order.refund', 'order', order._id, `Refunded ${result.order.currency} ${result.amount.toFixed(2)} (${result.cancelled} ticket${result.cancelled === 1 ? '' : 's'}) on order #${String(order._id).slice(-8).toUpperCase()} for "${event.title}"`);
    }
    res.json({ ok: true, amount: result.amount, cancelled: result.cancelled, paymentStatus: result.order.paymentStatus, currency: result.order.currency });
  })
);

router.get(
  '/mine',
  protect,
  ah(async (req, res) => {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).populate('event', 'title slug startDate');
    res.json(orders);
  })
);

router.get(
  '/:id',
  protect,
  ah(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) throw new HttpError(404, 'Order not found');
    res.json({ order, tickets: order.paymentStatus === 'paid' ? await Ticket.find({ order: order._id }) : [] });
  })
);

export default router;
