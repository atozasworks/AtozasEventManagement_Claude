import Event from '../models/Event.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import { HttpError } from '../utils/http.js';
import { PAID_STATES, round2 } from '../utils/orders.js';
import { gatewayFor } from './payments.js';
import { sendRefundNotice } from './notifications.js';

/**
 * Refunds and ticket cancellation.
 *
 * A refund always cancels specific tickets: the ticket stops working at the gate and online, its seat
 * goes back on sale, and the buyer gets that ticket's share of what they paid (ticket price after any
 * discount, plus its share of the platform fee) back to the original payment method.
 * Cancelling every ticket of an order returns exactly what is left of the order total.
 */

const basePrice = (order) => order.listTotal || order.items.reduce((s, i) => s + i.price * i.qty, 0);
const priceOf = (order, ticket) => order.items.find((i) => String(i.ticketTypeId) === String(ticket.ticketTypeId))?.price || 0;

/** What refunding one ticket would return to the buyer (for display in the organizer's orders list). */
export function refundableFor(order, ticket) {
  const base = basePrice(order);
  if (!base || ticket.status === 'cancelled') return 0;
  const left = round2(order.total - (order.refundedAmount || 0));
  return Math.max(0, Math.min(round2((order.total * priceOf(order, ticket)) / base), left));
}

/**
 * Cancel tickets of one order and refund their value.
 *   ticketIds - which tickets (omit for every remaining ticket of the order)
 *   kind      - 'organizer' | 'attendee-request' | 'event-cancelled'
 */
export async function refundTickets({ orderId, ticketIds, reason, by, kind = 'organizer' }) {
  const order = await Order.findById(orderId);
  if (!order) throw new HttpError(404, 'Order not found');
  if (!PAID_STATES.includes(order.paymentStatus)) throw new HttpError(400, 'Only paid orders can be refunded');

  const all = await Ticket.find({ order: order._id });
  const wantedIds = ticketIds?.map(String);
  const wanted = all.filter((t) => t.status !== 'cancelled' && (!wantedIds || wantedIds.includes(String(t._id))));
  if (!wanted.length) throw new HttpError(400, 'These tickets are already cancelled');

  // Claim the tickets first so two refunds at the same moment cannot both pay out
  const now = new Date();
  const text = String(reason || '').slice(0, 300);
  const claimed = [];
  for (const t of wanted) {
    const r = await Ticket.updateOne({ _id: t._id, status: { $ne: 'cancelled' } }, { $set: { status: 'cancelled', cancelledAt: now, cancelReason: text } });
    if (r.modifiedCount) claimed.push(t);
  }
  if (!claimed.length) throw new HttpError(400, 'These tickets are already cancelled');
  const claimedIds = claimed.map((t) => t._id);

  // Money: this refund's share of the order, never more than what is left of it
  const stillValid = all.filter((t) => t.status !== 'cancelled' && !claimedIds.some((id) => String(id) === String(t._id))).length;
  const base = basePrice(order);
  const fraction = base > 0 ? claimed.reduce((s, t) => s + priceOf(order, t), 0) / base : 0;
  const leftAmount = Math.max(0, round2(order.total - (order.refundedAmount || 0)));
  const leftSubtotal = Math.max(0, round2(order.subtotal - (order.refundedSubtotal || 0)));
  const amount = stillValid === 0 ? leftAmount : Math.min(round2(order.total * fraction), leftAmount);
  const subtotalPart = stillValid === 0 ? leftSubtotal : Math.min(round2(order.subtotal * fraction), leftSubtotal);

  let refundId;
  if (amount > 0) {
    try {
      const res = await gatewayFor(order).refund(order, amount, text);
      if (!res?.ok) throw new Error('the payment provider did not accept the refund');
      refundId = res.refundId;
    } catch (err) {
      // Nothing was paid out: put the tickets back exactly as they were
      await Ticket.updateMany({ _id: { $in: claimedIds } }, { $set: { status: 'valid' }, $unset: { cancelledAt: 1, cancelReason: 1 } });
      const why = err?.error?.description || err.message || 'unknown error';
      await Order.updateOne({ _id: order._id }, { refundError: `${now.toISOString()}: ${why}`.slice(0, 300) });
      console.error(`Refund failed for order ${order._id}:`, why);
      throw new HttpError(502, `The refund could not be started (${why}). No tickets were cancelled.`);
    }
  }

  // The seats go back on sale
  const perType = new Map();
  for (const t of claimed) {
    const key = String(t.ticketTypeId);
    perType.set(key, { id: t.ticketTypeId, n: (perType.get(key)?.n || 0) + 1 });
  }
  for (const { id, n } of perType.values()) {
    await Event.updateOne({ _id: order.event, ticketTypes: { $elemMatch: { _id: id, sold: { $gte: n } } } }, { $inc: { 'ticketTypes.$.sold': -n } });
  }
  // The holder can no longer take, transfer or dispute the ticket
  await Ticket.updateMany({ _id: { $in: claimedIds } }, { $unset: { cancelRequest: 1, claimTokenHash: 1 } });

  const updated = await Order.findOneAndUpdate(
    { _id: order._id },
    {
      $push: { refunds: { amount, subtotalPart, refundId, reason: text, kind, by, tickets: claimedIds, at: now } },
      $inc: { refundedAmount: amount, refundedSubtotal: subtotalPart },
      $set: { paymentStatus: stillValid === 0 ? 'refunded' : 'partially_refunded' },
      $unset: { refundError: 1 },
    },
    { new: true }
  );

  const event = await Event.findById(order.event);
  if (event) sendRefundNotice({ order: updated, event, tickets: claimed, amount, reason: text, kind }).catch(() => {});
  return { order: updated, amount, refundId, cancelled: claimed.length };
}

/** The organizer cancelled the event: every remaining ticket is cancelled and every paid order refunded in full. */
export async function refundAllForEvent(eventId, by) {
  const orders = await Order.find({ event: eventId, paymentStatus: { $in: PAID_STATES } }).select('_id');
  let refunded = 0;
  let failed = 0;
  for (const o of orders) {
    try {
      await refundTickets({ orderId: o._id, reason: 'The event was cancelled by the organizer', by, kind: 'event-cancelled' });
      refunded++;
    } catch (err) {
      if (err.status !== 400) failed++; // 400 = nothing left to cancel on that order
    }
  }
  await Event.updateOne({ _id: eventId }, { 'cancellation.finishedAt': new Date(), 'cancellation.refunded': refunded, 'cancellation.failed': failed });
  console.log(`Event ${eventId} cancelled: ${refunded} order(s) refunded, ${failed} failed`);
  return { refunded, failed };
}
