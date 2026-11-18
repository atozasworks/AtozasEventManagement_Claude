import { Router } from 'express';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import Coupon from '../models/Coupon.js';
import Event from '../models/Event.js';
import Order from '../models/Order.js';
import { protect } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { loadOwnedEvent } from './events.js';
import { normalizeCode } from '../services/pricing.js';
import { PAID_STATES, NET_REVENUE } from '../utils/orders.js';

const router = Router();

const toDate = (v) => (v ? new Date(v) : undefined);

// Checks and tidies what the organizer typed. `event` is used to validate ticket-type limits.
function cleanInput(body, event, { creating }) {
  const out = {};
  if (creating) {
    out.code = normalizeCode(body.code);
    if (!/^[A-Z0-9_-]{3,24}$/.test(out.code)) throw new HttpError(400, 'Code must be 3-24 characters: letters, numbers, - or _');
  }
  if ('description' in body) out.description = String(body.description || '').slice(0, 200);
  if ('type' in body || creating) out.type = body.type === 'flat' ? 'flat' : 'percent';
  if ('value' in body || creating) {
    out.value = Number(body.value);
    if (!(out.value > 0)) throw new HttpError(400, 'Discount value must be more than 0');
  }
  if ('maxUses' in body) {
    out.maxUses = Math.floor(Number(body.maxUses) || 0);
    if (out.maxUses < 0) throw new HttpError(400, 'Maximum uses cannot be negative');
  }
  if ('validFrom' in body) out.validFrom = toDate(body.validFrom);
  if ('validTo' in body) out.validTo = toDate(body.validTo);
  for (const k of ['validFrom', 'validTo']) if (out[k] && Number.isNaN(out[k].getTime())) throw new HttpError(400, 'Invalid date');
  if ('ticketTypeIds' in body) {
    const known = event.ticketTypes.map((t) => String(t._id));
    out.ticketTypeIds = (body.ticketTypeIds || []).map(String).filter((id) => known.includes(id));
  }
  if ('active' in body) out.active = Boolean(body.active);
  return out;
}

function checkCombination(c) {
  if (c.type === 'percent' && c.value > 100) throw new HttpError(400, 'A percentage discount cannot be more than 100');
  if (c.validFrom && c.validTo && c.validTo < c.validFrom) throw new HttpError(400, 'The end date must be after the start date');
}

// Invitation links (/e/<slug>?promo=CODE) ask this before the visitor has logged in, so the event page can
// say what the code is worth. It answers for one event and one code only, and is rate limited against guessing.
// The limit is generous because many phones share one address on Indian mobile networks.
const checkLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many promo code checks. Please wait a few minutes.' } });
router.get(
  '/check',
  checkLimiter,
  ah(async (req, res) => {
    const code = normalizeCode(req.query.code);
    const no = (reason) => res.json({ valid: false, code, reason });
    if (!code || !mongoose.isValidObjectId(req.query.eventId)) return no('This promo code is not valid for this event');
    const [event, coupon] = await Promise.all([
      Event.findById(req.query.eventId).select('currency ticketTypes._id ticketTypes.name'),
      Coupon.findOne({ event: req.query.eventId, code }),
    ]);
    const now = new Date();
    if (!event || !coupon || !coupon.active) return no('This promo code is not valid for this event');
    if (coupon.validFrom && coupon.validFrom > now) return no('This promo code is not active yet');
    if (coupon.validTo && coupon.validTo < now) return no('This promo code has expired');
    if (coupon.maxUses > 0 && coupon.used >= coupon.maxUses) return no('This promo code has been fully used');
    const allowed = coupon.ticketTypeIds.map(String);
    res.json({
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      currency: event.currency,
      validTo: coupon.validTo || null,
      onlyFor: allowed.length ? event.ticketTypes.filter((t) => allowed.includes(String(t._id))).map((t) => t.name) : [],
    });
  })
);

// Codes for an event with how each one has performed (paid orders only)
router.get(
  '/events/:eventId',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const [coupons, stats] = await Promise.all([
      Coupon.find({ event: event._id }).sort({ createdAt: -1 }).lean(),
      Order.aggregate([
        { $match: { event: event._id, paymentStatus: { $in: PAID_STATES }, 'discount.amount': { $gt: 0 } } },
        {
          $group: {
            _id: { kind: '$discount.kind', code: '$discount.code' },
            orders: { $sum: 1 },
            tickets: { $sum: { $sum: '$items.qty' } },
            revenue: { $sum: NET_REVENUE },
            discount: { $sum: '$discount.amount' },
          },
        },
      ]),
    ]);
    const empty = { orders: 0, tickets: 0, revenue: 0, discount: 0 };
    const pick = (s) => (s ? { orders: s.orders, tickets: s.tickets, revenue: s.revenue, discount: s.discount } : empty);
    res.json({
      coupons: coupons.map((c) => ({ ...c, stats: pick(stats.find((s) => s._id.kind === 'promo' && s._id.code === c.code)) })),
      group: { settings: event.groupDiscount, stats: pick(stats.find((s) => s._id.kind === 'group')) },
    });
  })
);

router.post(
  '/events/:eventId',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const data = cleanInput(req.body, event, { creating: true });
    checkCombination(data);
    if (await Coupon.exists({ event: event._id, code: data.code })) throw new HttpError(409, `The code ${data.code} already exists for this event`);
    res.status(201).json(await Coupon.create({ ...data, event: event._id }));
  })
);

router.put(
  '/:id',
  protect,
  ah(async (req, res) => {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new HttpError(404, 'Promo code not found');
    const event = await loadOwnedEvent(req, coupon.event);
    coupon.set(cleanInput(req.body, event, { creating: false }));
    checkCombination(coupon);
    await coupon.save();
    res.json(coupon);
  })
);

router.delete(
  '/:id',
  protect,
  ah(async (req, res) => {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) throw new HttpError(404, 'Promo code not found');
    await loadOwnedEvent(req, coupon.event);
    // Keep codes that appear on orders so reports stay complete
    if (coupon.used > 0 || (await Order.exists({ 'discount.coupon': coupon._id }))) {
      throw new HttpError(400, 'This code has been used on orders - pause it instead of deleting');
    }
    await coupon.deleteOne();
    res.json({ ok: true });
  })
);

export default router;
