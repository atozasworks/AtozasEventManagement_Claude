import Coupon from '../models/Coupon.js';
import { HttpError } from '../utils/http.js';
import { calculateFees } from './payments.js';
import { formatEventDate } from '../utils/format.js';

/**
 * Works out what an order costs. Used both for the live quote in the checkout
 * and when the order is created, so the buyer always pays exactly what they saw.
 *
 * Discount rules:
 *  - One discount per order: a promo code OR the event's group discount, whichever saves more.
 *  - A promo code can be limited to certain ticket types; it never applies to free tickets.
 *  - The platform fee is charged on the discounted amount.
 */
const round2 = (n) => Math.round(n * 100) / 100;

export const normalizeCode = (code) => String(code || '').trim().toUpperCase();

export async function priceOrder(event, items = [], promoCode) {
  const now = new Date();

  // ---- Validate the selection against live prices, limits and sale windows
  const lines = [];
  for (const { ticketTypeId, qty } of items) {
    const n = Number(qty);
    if (!n || n < 1) continue;
    const tt = event.ticketTypes.id(ticketTypeId);
    if (!tt) throw new HttpError(400, 'Unknown ticket type');
    if (n > tt.maxPerOrder) throw new HttpError(400, `You can buy up to ${tt.maxPerOrder} "${tt.name}" tickets per order`);
    if (tt.salesStart && tt.salesStart > now) throw new HttpError(400, `"${tt.name}" goes on sale ${formatEventDate(tt.salesStart, event.timezone)}`);
    if (tt.salesEnd && tt.salesEnd < now) throw new HttpError(400, `Sales for "${tt.name}" have ended`);
    if (tt.sold + n > tt.quantity) throw new HttpError(409, `Only ${Math.max(tt.quantity - tt.sold, 0)} "${tt.name}" left`);
    lines.push({ ticketTypeId: tt._id, name: tt.name, price: tt.price, qty: n });
  }
  if (!lines.length) throw new HttpError(400, 'Select at least one ticket');

  const listTotal = round2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const totalQty = lines.reduce((s, l) => s + l.qty, 0);

  // ---- Group discount (set by the organizer on the event)
  let group = null;
  const g = event.groupDiscount;
  if (g?.minQty >= 2 && g.percent > 0 && totalQty >= g.minQty && listTotal > 0) {
    group = {
      kind: 'group',
      amount: round2((listTotal * g.percent) / 100),
      label: `Group discount (${g.percent}% off for ${g.minQty}+ tickets)`,
    };
  }

  // ---- Promo code
  let promo = null;
  const code = normalizeCode(promoCode);
  if (code) {
    const coupon = await Coupon.findOne({ event: event._id, code });
    if (!coupon || !coupon.active) throw new HttpError(400, 'This promo code is not valid for this event');
    if (coupon.validFrom && coupon.validFrom > now) throw new HttpError(400, 'This promo code is not active yet');
    if (coupon.validTo && coupon.validTo < now) throw new HttpError(400, 'This promo code has expired');
    if (coupon.maxUses > 0 && coupon.used >= coupon.maxUses) throw new HttpError(400, 'This promo code has been fully used');

    const allowed = coupon.ticketTypeIds.map(String);
    const eligible = round2(
      lines.filter((l) => l.price > 0 && (!allowed.length || allowed.includes(String(l.ticketTypeId)))).reduce((s, l) => s + l.price * l.qty, 0)
    );
    if (eligible <= 0) throw new HttpError(400, 'This promo code does not apply to the tickets you selected');

    const amount = coupon.type === 'percent' ? round2((eligible * coupon.value) / 100) : Math.min(coupon.value, eligible);
    promo = {
      kind: 'promo',
      code: coupon.code,
      coupon: coupon._id,
      amount: round2(amount),
      label: `Promo code ${coupon.code}`,
    };
  }

  // ---- One discount per order: the better one wins
  let discount = promo || group;
  let promoNote;
  if (promo && group && group.amount > promo.amount) {
    discount = group;
    promoNote = `Your group discount saves more than ${promo.code}, so it was used instead.`;
  }

  const subtotal = round2(listTotal - (discount?.amount || 0));
  const { platformFee, total } = calculateFees(subtotal);
  return { lines, totalQty, listTotal, discount, promoNote, subtotal, platformFee, total, currency: event.currency };
}
