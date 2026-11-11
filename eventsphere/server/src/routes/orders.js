import { Router } from 'express';
import crypto from 'crypto';
import Event from '../models/Event.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import { protect } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { calculateFees, getGateway } from '../services/payments.js';
import { sendTicketConfirmation } from '../services/notifications.js';
import { pushRegistrationToCRM } from '../services/crm.js';

const router = Router();

function ticketCode() {
  // Short, human-readable, unambiguous characters (no 0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let out = 'ES-';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
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
    order.paymentStatus = 'refunded';
    order.gateway.refundId = refundId;
    order.gateway.failureReason = err.message;
    await order.save();
    throw new HttpError(409, `${err.message} Your payment has been refunded${refundId ? '' : ' (our team will process it shortly)'}.`);
  }

  const docs = [];
  for (const item of order.items) {
    const tt = event.ticketTypes.id(item.ticketTypeId);
    for (let i = 0; i < item.qty; i++) {
      docs.push({
        order: order._id,
        event: event._id,
        user: order.user,
        ticketTypeId: item.ticketTypeId,
        ticketTypeName: item.name,
        access: tt?.access || 'both',
        holderName: order.buyer.name,
        holderEmail: order.buyer.email,
        code: ticketCode(),
      });
    }
  }
  const tickets = await Ticket.insertMany(docs);

  order.paymentStatus = 'paid';
  order.paymentRef = reference || paymentId;
  order.paidAt = new Date();
  await order.save();

  sendTicketConfirmation({ order, event, tickets }).catch(() => {});
  pushRegistrationToCRM(event, order).catch(() => {});
  return { order, tickets };
}

// Step 1: create an order - validates selection and prices server-side
router.post(
  '/',
  protect,
  ah(async (req, res) => {
    const { eventId, items = [], buyer = {}, answers = {}, attribution = {} } = req.body;
    const event = await Event.findById(eventId);
    if (!event || event.status !== 'published') throw new HttpError(404, 'This event is not open for registration');
    if (event.endDate < new Date()) throw new HttpError(400, 'This event has already ended');

    const lines = [];
    for (const { ticketTypeId, qty } of items) {
      const n = Number(qty);
      if (!n || n < 1) continue;
      const tt = event.ticketTypes.id(ticketTypeId);
      if (!tt) throw new HttpError(400, 'Unknown ticket type');
      if (n > tt.maxPerOrder) throw new HttpError(400, `You can buy up to ${tt.maxPerOrder} "${tt.name}" tickets per order`);
      if (tt.salesEnd && tt.salesEnd < new Date()) throw new HttpError(400, `Sales for "${tt.name}" have ended`);
      if (tt.sold + n > tt.quantity) throw new HttpError(409, `Only ${tt.quantity - tt.sold} "${tt.name}" left`);
      lines.push({ ticketTypeId: tt._id, name: tt.name, price: tt.price, qty: n });
    }
    if (!lines.length) throw new HttpError(400, 'Select at least one ticket');

    for (const f of event.registrationFields) {
      if (f.required && (answers[f.label] === undefined || answers[f.label] === '')) {
        throw new HttpError(400, `"${f.label}" is required`);
      }
    }

    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const { platformFee, total } = calculateFees(subtotal);
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
