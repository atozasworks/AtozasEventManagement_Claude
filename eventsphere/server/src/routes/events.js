import { Router } from 'express';
import mongoose from 'mongoose';
import Event from '../models/Event.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import Booth from '../models/Booth.js';
import { protect, optionalAuth, requireRole } from '../middleware/auth.js';
import { ah, HttpError, slugify, isObjectId } from '../utils/http.js';

const router = Router();

export async function loadOwnedEvent(req, id) {
  const event = await Event.findById(id);
  if (!event) throw new HttpError(404, 'Event not found');
  const isOwner = String(event.organizer) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') throw new HttpError(403, 'You do not manage this event');
  return event;
}

async function uniqueSlug(title) {
  const base = slugify(title) || 'event';
  let slug = base;
  let n = 1;
  while (await Event.exists({ slug })) slug = `${base}-${++n}`;
  return slug;
}

const EDITABLE = [
  'title', 'summary', 'description', 'category', 'format', 'visibility', 'startDate', 'endDate',
  'timezone', 'currency', 'coverImage', 'tags', 'location', 'modules', 'ticketTypes',
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
        .select('-registrationFields -budget -integrations -sessions.streamUrl')
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
      { $match: { event: { $in: ids }, paymentStatus: 'paid' } },
      { $group: { _id: '$event', revenue: { $sum: '$subtotal' }, orders: { $sum: 1 } } },
    ]);
    const tickets = await Ticket.aggregate([
      { $match: { event: { $in: ids } } },
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
      // Stream links only for ticket holders with virtual access
      const hasVirtual =
        req.user && (await Ticket.exists({ event: event._id, user: req.user._id, access: { $in: ['virtual', 'both'] } }));
      if (!hasVirtual) data.sessions = data.sessions.map(({ streamUrl, ...s }) => s);
      data.hasTicket = Boolean(req.user && (await Ticket.exists({ event: event._id, user: req.user._id })));
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
    event.set(body);
    if (event.endDate < event.startDate) throw new HttpError(400, 'End date must be after start date');
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
    event.status = status;
    await event.save();
    res.json(event);
  })
);

router.delete(
  '/:id',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.id);
    if (await Order.exists({ event: event._id, paymentStatus: 'paid' })) {
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
    const tickets = await Ticket.find({ event: event._id }).populate('order', 'buyer attribution answers paymentMethod createdAt').sort({ createdAt: -1 });

    if (req.query.format === 'csv') {
      const fieldLabels = event.registrationFields.map((f) => f.label);
      const header = ['Ticket Code', 'Name', 'Email', 'Phone', 'Ticket Type', 'Access', 'Checked In', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'Payment', 'Registered At', ...fieldLabels];
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = tickets.map((t) => {
        const o = t.order || {};
        const answers = o.answers || new Map();
        return [
          t.code, t.holderName, t.holderEmail, o.buyer?.phone, t.ticketTypeName, t.access, t.checkedIn ? 'Yes' : 'No',
          o.attribution?.source, o.attribution?.medium, o.attribution?.campaign, o.paymentMethod,
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
    const paid = { event: eventId, paymentStatus: 'paid' };

    const [totals, byDay, bySource, byMethod, checkins, booths] = await Promise.all([
      Order.aggregate([{ $match: paid }, { $group: { _id: null, revenue: { $sum: '$subtotal' }, fees: { $sum: '$platformFee' }, orders: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: paid },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: event.timezone } }, orders: { $sum: 1 }, revenue: { $sum: '$subtotal' } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: paid },
        { $group: { _id: { $ifNull: ['$attribution.source', 'direct'] }, orders: { $sum: 1 }, revenue: { $sum: '$subtotal' } } },
        { $sort: { orders: -1 } },
      ]),
      Order.aggregate([{ $match: paid }, { $group: { _id: '$paymentMethod', orders: { $sum: 1 } } }]),
      Ticket.aggregate([
        { $match: { event: eventId } },
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
