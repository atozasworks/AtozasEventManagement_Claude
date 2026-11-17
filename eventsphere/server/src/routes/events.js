import { Router } from 'express';
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import Booth from '../models/Booth.js';
import { protect, optionalAuth, requireRole } from '../middleware/auth.js';
import { ah, HttpError, slugify, isObjectId } from '../utils/http.js';
import { emailConfigured } from '../services/email.js';
import User from '../models/User.js';
import { sendStaffInvite } from '../services/notifications.js';
import { brandName } from '../utils/format.js';
import { PAID_STATES, NET_REVENUE, ACTIVE_TICKET } from '../utils/orders.js';
import { refundAllForEvent, refundableFor } from '../services/refunds.js';
import { logAdmin } from '../services/audit.js';

const router = Router();

export async function loadOwnedEvent(req, id) {
  const event = await Event.findById(id);
  if (!event) throw new HttpError(404, 'Event not found');
  const isOwner = String(event.organizer) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') throw new HttpError(403, 'You do not manage this event');
  return event;
}

// Scanning tickets is open to the organizer, an admin and the event's gate staff
export async function loadEventForCheckin(req, id) {
  const event = await Event.findById(id);
  if (!event) throw new HttpError(404, 'Event not found');
  const uid = String(req.user._id);
  const allowed = String(event.organizer) === uid || req.user.role === 'admin' || event.staff.some((s) => String(s.user) === uid);
  if (!allowed) throw new HttpError(403, 'You are not on the check-in team for this event');
  return event;
}

const staffList = (event) =>
  event.staff.map((s) => ({ _id: s.user?._id || s.user, name: s.user?.name, email: s.user?.email, role: s.role, addedAt: s.addedAt }));

async function uniqueSlug(title) {
  const base = slugify(title) || 'event';
  let slug = base;
  let n = 1;
  while (await Event.exists({ slug })) slug = `${base}-${++n}`;
  return slug;
}

const EDITABLE = [
  'title', 'summary', 'description', 'category', 'format', 'visibility', 'startDate', 'endDate',
  'timezone', 'currency', 'coverImage', 'tags', 'location', 'modules', 'ticketTypes', 'groupDiscount', 'allowTransfers', 'refundPolicy', 'allowCancelRequests',
  'registrationFields', 'sessions', 'budget', 'integrations',
];

function pickEditable(body) {
  const out = {};
  for (const k of EDITABLE) if (k in body) out[k] = body[k];
  return out;
}

// ---------- Public discovery (marketplace) ----------
router.get(
  '/',
  ah(async (req, res) => {
    const { q, category, format, city, when = 'upcoming', price, sort = 'date', page = 1, limit = 12 } = req.query;
    const filter = { status: 'published', visibility: 'public' };
    if (category) filter.category = category;
    if (format) filter.format = format;
    if (city) filter['location.city'] = new RegExp(`^${city.replace(/[^\w\s]/g, '')}`, 'i');
    if (when === 'upcoming') filter.endDate = { $gte: new Date() };
    if (when === 'past') filter.endDate = { $lt: new Date() };
    if (price === 'free') filter['ticketTypes.price'] = { $not: { $gt: 0 } };
    if (price === 'paid') filter['ticketTypes.price'] = { $gt: 0 };
    if (q) {
      const rx = new RegExp(q.replace(/[^\w\s]/g, ''), 'i');
      filter.$or = [{ title: rx }, { summary: rx }, { tags: rx }, { 'location.city': rx }];
    }
    const sortBy = sort === 'popular' ? { views: -1 } : sort === 'new' ? { createdAt: -1 } : { startDate: 1 };
    const lim = Math.min(Number(limit) || 12, 50);
    const [items, total] = await Promise.all([
      Event.find(filter)
        .sort({ featured: -1, ...sortBy })
        .skip((Number(page) - 1) * lim)
        .limit(lim)
        .select('-registrationFields -budget -integrations -reminders -staff -gateKey -moderation -sessions.streamUrl')
        .populate('organizer', 'name organizationName'),
      Event.countDocuments(filter),
    ]);
    res.json({ items, total, page: Number(page), pages: Math.ceil(total / lim) });
  })
);

router.get(
  '/cities',
  ah(async (_req, res) => {
    const cities = await Event.distinct('location.city', { status: 'published', visibility: 'public' });
    res.json(cities.filter(Boolean).sort());
  })
);

// ---------- Organizer: my events ----------
router.get(
  '/mine',
  protect,
  requireRole('organizer', 'admin'),
  ah(async (req, res) => {
    const events = await Event.find({ organizer: req.user._id }).sort({ startDate: -1 }).lean();
    const ids = events.map((e) => e._id);
    const stats = await Order.aggregate([
      { $match: { event: { $in: ids }, paymentStatus: { $in: PAID_STATES } } },
      { $group: { _id: '$event', revenue: { $sum: NET_REVENUE }, orders: { $sum: 1 } } },
    ]);
    const tickets = await Ticket.aggregate([
      { $match: { event: { $in: ids }, ...ACTIVE_TICKET } },
      { $group: { _id: '$event', sold: { $sum: 1 }, checkedIn: { $sum: { $cond: ['$checkedIn', 1, 0] } } } },
    ]);
    const byId = (arr) => Object.fromEntries(arr.map((s) => [String(s._id), s]));
    const s1 = byId(stats);
    const s2 = byId(tickets);
    res.json(
      events.map((e) => ({
        ...e,
        stats: {
          revenue: s1[e._id]?.revenue || 0,
          orders: s1[e._id]?.orders || 0,
          ticketsSold: s2[e._id]?.sold || 0,
          checkedIn: s2[e._id]?.checkedIn || 0,
        },
      }))
    );
  })
);

// ---------- Gate staff: events I am scanning tickets for ----------
router.get(
  '/staffed',
  protect,
  ah(async (req, res) => {
    const events = await Event.find({ 'staff.user': req.user._id, status: { $in: ['published', 'completed'] } })
      .select('title slug startDate endDate format location status')
      .sort({ startDate: 1 });
    res.json(events);
  })
);

// ---------- Organizer: manage the gate staff of an event ----------
router.get(
  '/:id/staff',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    await event.populate('staff.user', 'name email');
    res.json(staffList(event));
  })
);

router.post(
  '/:id/staff',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!email) throw new HttpError(400, 'Enter the email address of the person to add');
    const person = await User.findOne({ email });
    if (!person) throw new HttpError(404, `No ${brandName()} account uses ${email}. Ask them to sign up (a free attendee account is enough), then add them here.`);
    if (String(person._id) === String(event.organizer)) throw new HttpError(400, 'The organizer can already check people in');
    if (!event.staff.some((s) => String(s.user) === String(person._id))) {
      if (event.staff.length >= 100) throw new HttpError(400, 'An event can have up to 100 gate staff');
      event.staff.push({ user: person._id });
      await event.save();
      sendStaffInvite({ person, event, invitedBy: req.user }).catch(() => {});
    }
    await event.populate('staff.user', 'name email');
    res.status(201).json(staffList(event));
  })
);

router.delete(
  '/:id/staff/:userId',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    event.staff = event.staff.filter((s) => String(s.user) !== String(req.params.userId));
    await event.save();
    await event.populate('staff.user', 'name email');
    res.json(staffList(event));
  })
);

// ---------- Single event (by id or slug) ----------
router.get(
  '/:idOrSlug',
  optionalAuth,
  ah(async (req, res) => {
    const { idOrSlug } = req.params;
    const event = await Event.findOne(isObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug }).populate(
      'organizer',
      'name organizationName'
    );
    if (!event) throw new HttpError(404, 'Event not found');

    const isOwner = req.user && (String(event.organizer._id) === String(req.user._id) || req.user.role === 'admin');
    if (event.status !== 'published' && !isOwner) throw new HttpError(404, 'Event not found');

    const data = event.toJSON();
    if (!isOwner) {
      delete data.budget;
      delete data.integrations;
      delete data.reminders;
      delete data.staff;
      delete data.gateKey;
      delete data.moderation;
      // Stream links only for ticket holders with virtual access
      const hasVirtual =
        req.user && (await Ticket.exists({ event: event._id, user: req.user._id, access: { $in: ['virtual', 'both'] }, ...ACTIVE_TICKET }));
      if (!hasVirtual) data.sessions = data.sessions.map(({ streamUrl, ...s }) => s);
      data.hasTicket = Boolean(req.user && (await Ticket.exists({ event: event._id, user: req.user._id, ...ACTIVE_TICKET })));
      Event.updateOne({ _id: event._id }, { $inc: { views: 1 } }).exec();
    } else {
      data.hasTicket = true;
    }
    data.isOwner = Boolean(isOwner);
    res.json(data);
  })
);

// ---------- Create / update / delete ----------
router.post(
  '/',
  protect,
  requireRole('organizer', 'admin'),
  ah(async (req, res) => {
    const body = pickEditable(req.body);
    if (!body.title || !body.startDate || !body.endDate) throw new HttpError(400, 'Title, start and end date are required');
    if (new Date(body.endDate) < new Date(body.startDate)) throw new HttpError(400, 'End date must be after start date');
    if (!body.ticketTypes?.length) body.ticketTypes = [{ name: 'General Admission', price: 0, quantity: 100 }];
    const event = await Event.create({ ...body, organizer: req.user._id, slug: await uniqueSlug(body.title) });
    res.status(201).json(event);
  })
);

router.put(
  '/:id',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    const body = pickEditable(req.body);
    // Never let edits reduce "sold" counters already recorded
    if (body.ticketTypes) {
      body.ticketTypes = body.ticketTypes.map((t) => {
        const existing = t._id && event.ticketTypes.id(t._id);
        return { ...t, sold: existing ? existing.sold : 0 };
      });
    }
    const oldStart = event.startDate?.getTime();
    event.set(body);
    if (event.endDate < event.startDate) throw new HttpError(400, 'End date must be after start date');
    // Rescheduled: attendees should be reminded again for the new time
    if (event.startDate?.getTime() !== oldStart) event.reminders = undefined;
    await event.save();
    res.json(event);
  })
);

router.post(
  '/:id/status',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    const { status } = req.body;
    if (!['draft', 'published', 'cancelled', 'completed'].includes(status)) throw new HttpError(400, 'Invalid status');
    if (status === 'published' && !event.ticketTypes.length) throw new HttpError(400, 'Add at least one ticket type');
    // Only enforced once real email sending is set up - otherwise nobody could receive the link
    if (status === 'published' && emailConfigured() && !req.user.emailVerified && req.user.role !== 'admin') {
      throw new HttpError(403, 'Confirm your email address before publishing. Use "Resend link" in the banner at the top of the page.');
    }
    // Cancelling refunds everyone, so it cannot be undone
    if (event.status === 'cancelled' && status !== 'cancelled') {
      throw new HttpError(400, 'A cancelled event cannot be reopened because its tickets have been refunded. Create a new event instead.');
    }
    if (status === 'published' && event.moderation?.blocked && req.user.role !== 'admin') {
      throw new HttpError(403, `This event was taken down by ${brandName()}: ${event.moderation.reason || 'policy review'}. Contact support to have it restored.`);
    }
    const cancelling = status === 'cancelled' && event.status !== 'cancelled';
    event.status = status;
    if (cancelling) event.cancellation = { startedAt: new Date() };
    await event.save();
    // Refund every paid order and tell every attendee. Runs in the background - a big event can take a while;
    // progress shows in the "Orders & refunds" tab.
    if (cancelling) refundAllForEvent(event._id, req.user._id).catch((err) => console.error('Event cancellation refunds failed:', err.message));
    if (String(event.organizer) !== String(req.user._id)) await logAdmin(req, `event.${status}`, 'event', event._id, `Set "${event.title}" to ${status}${cancelling ? ' (all orders refunded)' : ''}`);
    res.json(event);
  })
);

// ---------- Orders & refunds (organizer) ----------
router.get(
  '/:id/orders',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    const [orders, tickets] = await Promise.all([
      Order.find({ event: event._id, paymentStatus: { $in: [...PAID_STATES, 'refunded'] } }).sort({ createdAt: -1 }).limit(1000).lean(),
      Ticket.find({ event: event._id }).select('order holderName holderEmail ticketTypeName ticketTypeId status checkedIn cancelRequest cancelledAt').lean(),
    ]);
    const byOrder = new Map();
    for (const t of tickets) {
      const key = String(t.order);
      if (!byOrder.has(key)) byOrder.set(key, []);
      byOrder.get(key).push(t);
    }
    res.json({
      cancellation: event.cancellation,
      orders: orders.map((o) => ({
        _id: o._id,
        buyer: o.buyer,
        createdAt: o.createdAt,
        currency: o.currency,
        total: o.total,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        discount: o.discount?.amount > 0 ? { label: o.discount.label, amount: o.discount.amount } : null,
        refundedAmount: o.refundedAmount || 0,
        refundError: o.refundError,
        refunds: (o.refunds || []).map((r) => ({ amount: r.amount, reason: r.reason, kind: r.kind, at: r.at })),
        tickets: (byOrder.get(String(o._id)) || []).map((t) => ({
          _id: t._id,
          holderName: t.holderName,
          ticketTypeName: t.ticketTypeName,
          status: t.status || 'valid',
          checkedIn: t.checkedIn,
          cancelRequest: t.cancelRequest?.status ? t.cancelRequest : null,
          refundable: refundableFor(o, t), // what cancelling this one ticket would return to the buyer
        })),
      })),
    });
  })
);

router.delete(
  '/:id',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    if (await Order.exists({ event: event._id, paymentStatus: { $in: [...PAID_STATES, 'refunded'] } })) {
      throw new HttpError(400, 'This event has paid orders - cancel it instead of deleting');
    }
    await Promise.all([event.deleteOne(), Booth.deleteMany({ event: event._id })]);
    res.json({ ok: true });
  })
);

// ---------- Attendees (with CSV export for CRM import) ----------
router.get(
  '/:id/attendees',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    const tickets = await Ticket.find({ event: event._id }).populate('order', 'buyer attribution answers paymentMethod discount createdAt').sort({ createdAt: -1 });

    if (req.query.format === 'csv') {
      const fieldLabels = event.registrationFields.map((f) => f.label);
      const header = ['Ticket Code', 'Name', 'Email', 'Phone', 'Ticket Type', 'Access', 'Status', 'Checked In', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Payment', 'Discount', 'Registered At', ...fieldLabels];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = tickets.map((t) => {
        const o = t.order || {};
        const answers = o.answers || new Map();
        return [
          t.code, t.holderName, t.holderEmail, o.buyer?.phone, t.ticketTypeName, t.access, t.status === 'cancelled' ? 'Cancelled' : 'Valid', t.checkedIn ? 'Yes' : 'No',
          o.attribution?.source, o.attribution?.medium, o.attribution?.campaign, o.paymentMethod,
          o.discount?.amount > 0 ? (o.discount.kind === 'promo' ? o.discount.code : 'Group discount') : '',
          t.createdAt?.toISOString(), ...fieldLabels.map((l) => answers.get?.(l)),
        ].map(esc).join(',');
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${event.slug}-attendees.csv"`);
      return res.send([header.map(esc).join(','), ...rows].join('\n'));
    }
    res.json(tickets);
  })
);

// ---------- Analytics & attribution ----------
router.get(
  '/:id/analytics',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    const eventId = new mongoose.Types.ObjectId(event._id);
    const paid = { event: eventId, paymentStatus: { $in: PAID_STATES } };

    const [totals, byDay, bySource, byMethod, checkins, booths] = await Promise.all([
      Order.aggregate([{ $match: paid }, { $group: { _id: null, revenue: { $sum: NET_REVENUE }, fees: { $sum: '$platformFee' }, orders: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: paid },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: event.timezone } }, orders: { $sum: 1 }, revenue: { $sum: NET_REVENUE } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: paid },
        { $group: { _id: { $ifNull: ['$attribution.source', 'direct'] }, orders: { $sum: 1 }, revenue: { $sum: NET_REVENUE } } },
        { $sort: { orders: -1 } },
      ]),
      Order.aggregate([{ $match: paid }, { $group: { _id: '$paymentMethod', orders: { $sum: 1 } } }]),
      Ticket.aggregate([
        { $match: { event: eventId, ...ACTIVE_TICKET } },
        { $group: { _id: null, total: { $sum: 1 }, checkedIn: { $sum: { $cond: ['$checkedIn', 1, 0] } } } },
      ]),
      Booth.find({ event: eventId }).select('sponsorName tier visits leads'),
    ]);

    const budgetEstimated = event.budget.items.reduce((s, i) => s + (i.estimated || 0), 0);
    const budgetActual = event.budget.items.reduce((s, i) => s + (i.actual || 0), 0);
    const revenue = totals[0]?.revenue || 0;

    res.json({
      revenue,
      platformFees: totals[0]?.fees || 0,
      orders: totals[0]?.orders || 0,
      views: event.views,
      conversionRate: event.views ? ((totals[0]?.orders || 0) / event.views) * 100 : 0,
      ticketsSold: checkins[0]?.total || 0,
      checkedIn: checkins[0]?.checkedIn || 0,
      ticketTypes: event.ticketTypes.map((t) => ({ name: t.name, sold: t.sold, quantity: t.quantity, price: t.price })),
      salesByDay: byDay.map((d) => ({ date: d._id, orders: d.orders, revenue: d.revenue })),
      bySource: bySource.map((s) => ({ source: s._id, orders: s.orders, revenue: s.revenue })),
      byPaymentMethod: byMethod.map((m) => ({ method: m._id, orders: m.orders })),
      booths: booths.map((b) => ({ id: b._id, sponsorName: b.sponsorName, tier: b.tier, visits: b.visits, leads: b.leads.length })),
      budget: { total: event.budget.total, estimated: budgetEstimated, actual: budgetActual, profit: revenue - budgetActual },
    });
  })
);

export default router;
