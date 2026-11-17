import { Router } from 'express';
import User from '../models/User.js';
import Event from '../models/Event.js';
import Order from '../models/Order.js';
import Ticket from '../models/Ticket.js';
import Venue from '../models/Venue.js';
import VenueInquiry from '../models/VenueInquiry.js';
import AdminAction from '../models/AdminAction.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ah, HttpError, isObjectId } from '../utils/http.js';
import { PAID_STATES, NET_REVENUE, ACTIVE_TICKET, round2 } from '../utils/orders.js';
import { logAdmin } from '../services/audit.js';
import { sendTakedownNotice } from '../services/notifications.js';

/**
 * Platform admin console. Every route needs an account with role "admin"
 * (create one with: npm run make-admin -- someone@example.com).
 * Admins can also open any event's organizer dashboard, refund any order and cancel any event
 * through the normal organizer routes; those actions are written to the same activity log.
 */
const router = Router();
router.use(protect, requireRole('admin'));

const PAGE = 25;
const rx = (q) => new RegExp(String(q).replace(/[^\w\s@.+-]/g, '').replace(/[.+]/g, '\\$&'), 'i');
const pageOf = (req) => Math.max(1, Number(req.query.page) || 1);

async function loadById(Model, id, label) {
  const doc = isObjectId(id) && (await Model.findById(id));
  if (!doc) throw new HttpError(404, `${label} not found`);
  return doc;
}

// ---------- Overview ----------
router.get(
  '/overview',
  ah(async (_req, res) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Platform fee actually kept = fee charged minus the fee part of any refunds
    const feeKept = { $subtract: ['$platformFee', { $subtract: [{ $ifNull: ['$refundedAmount', 0] }, { $ifNull: ['$refundedSubtotal', 0] }] }] };
    const [users, newUsers, suspended, byRole, byStatus, takenDown, money, tickets, failedRefunds, openRequests] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: weekAgo } }),
      User.countDocuments({ suspended: true }),
      User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]),
      Event.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Event.countDocuments({ 'moderation.blocked': true }),
      Order.aggregate([
        { $match: { paymentStatus: { $in: [...PAID_STATES, 'refunded'] } } },
        {
          $group: {
            _id: '$currency',
            orders: { $sum: { $cond: [{ $in: ['$paymentStatus', PAID_STATES] }, 1, 0] } },
            ticketRevenue: { $sum: NET_REVENUE }, // what organizers have earned
            platformFees: { $sum: feeKept }, // what the platform has earned
            refunded: { $sum: { $ifNull: ['$refundedAmount', 0] } },
          },
        },
        { $sort: { ticketRevenue: -1 } },
      ]),
      Ticket.countDocuments(ACTIVE_TICKET),
      Order.countDocuments({ refundError: { $exists: true, $ne: null } }),
      Ticket.countDocuments({ 'cancelRequest.status': 'requested', ...ACTIVE_TICKET }),
    ]);
    const count = (rows, key) => rows.find((r) => r._id === key)?.n || 0;
    res.json({
      users: { total: users, newThisWeek: newUsers, suspended, organizers: count(byRole, 'organizer'), attendees: count(byRole, 'attendee'), admins: count(byRole, 'admin') },
      events: { published: count(byStatus, 'published'), draft: count(byStatus, 'draft'), cancelled: count(byStatus, 'cancelled'), completed: count(byStatus, 'completed'), takenDown },
      tickets,
      // Rounded to paise: adding many amounts can otherwise leave tiny fractions such as 314.99999999999994
      money: money.map((m) => ({ currency: m._id || 'INR', orders: m.orders, ticketRevenue: round2(m.ticketRevenue), platformFees: round2(m.platformFees), refunded: round2(m.refunded) })),
      attention: { failedRefunds, openRefundRequests: openRequests },
    });
  })
);

// ---------- Events ----------
router.get(
  '/events',
  ah(async (req, res) => {
    const { q, status, flag } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (flag === 'featured') filter.featured = true;
    if (flag === 'takendown') filter['moderation.blocked'] = true;
    if (q) filter.$or = [{ title: rx(q) }, { 'location.city': rx(q) }, { slug: rx(q) }];
    const page = pageOf(req);
    const [events, total] = await Promise.all([
      Event.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE)
        .limit(PAGE)
        .select('title slug status featured startDate currency organizer moderation views createdAt ticketTypes.sold location.city')
        .populate('organizer', 'name email organizationName suspended')
        .lean(),
      Event.countDocuments(filter),
    ]);
    const revenue = await Order.aggregate([
      { $match: { event: { $in: events.map((e) => e._id) }, paymentStatus: { $in: PAID_STATES } } },
      { $group: { _id: '$event', revenue: { $sum: NET_REVENUE } } },
    ]);
    res.json({
      total,
      page,
      pages: Math.ceil(total / PAGE),
      items: events.map((e) => ({
        _id: e._id, title: e.title, slug: e.slug, status: e.status, featured: e.featured, startDate: e.startDate, currency: e.currency,
        city: e.location?.city, views: e.views, organizer: e.organizer,
        takenDown: e.moderation?.blocked ? { reason: e.moderation.reason, at: e.moderation.at } : null,
        ticketsSold: (e.ticketTypes || []).reduce((s, t) => s + (t.sold || 0), 0),
        revenue: revenue.find((r) => String(r._id) === String(e._id))?.revenue || 0,
      })),
    });
  })
);

// Featured events are pinned to the top of the marketplace
router.post(
  '/events/:id/feature',
  ah(async (req, res) => {
    const event = await loadById(Event, req.params.id, 'Event');
    event.featured = Boolean(req.body.featured);
    await event.save();
    await logAdmin(req, event.featured ? 'event.feature' : 'event.unfeature', 'event', event._id, `${event.featured ? 'Featured' : 'Removed featured from'} "${event.title}"`);
    res.json({ ok: true, featured: event.featured });
  })
);

// Take down: hides the event and stops sales at once; the organizer cannot publish it again until it is restored.
// Tickets already sold stay valid - to refund everyone, cancel the event from its dashboard instead.
router.post(
  '/events/:id/takedown',
  ah(async (req, res) => {
    const event = await loadById(Event, req.params.id, 'Event');
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (!reason) throw new HttpError(400, 'Give a reason - it is sent to the organizer');
    if (event.status === 'cancelled') throw new HttpError(400, 'This event is already cancelled');
    if (event.moderation?.blocked) throw new HttpError(400, 'This event is already taken down');
    event.moderation = { blocked: true, reason, at: new Date(), by: req.user._id, previousStatus: event.status };
    if (event.status === 'published') event.status = 'draft';
    event.featured = false;
    await event.save();
    await logAdmin(req, 'event.takedown', 'event', event._id, `Took down "${event.title}": ${reason}`);
    const organizer = await User.findById(event.organizer).select('name email');
    if (organizer) sendTakedownNotice({ organizer, event, reason }).catch(() => {});
    res.json({ ok: true });
  })
);

router.post(
  '/events/:id/restore',
  ah(async (req, res) => {
    const event = await loadById(Event, req.params.id, 'Event');
    if (!event.moderation?.blocked) throw new HttpError(400, 'This event is not taken down');
    const back = event.moderation.previousStatus === 'published' && event.status === 'draft' ? 'published' : event.status;
    event.moderation = undefined;
    event.status = back;
    await event.save();
    await logAdmin(req, 'event.restore', 'event', event._id, `Restored "${event.title}"${back === 'published' ? ' (live again)' : ''}`);
    res.json({ ok: true, status: event.status });
  })
);

// ---------- Users ----------
router.get(
  '/users',
  ah(async (req, res) => {
    const { q, role, flag } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (flag === 'suspended') filter.suspended = true;
    if (flag === 'unverified') filter.emailVerified = { $ne: true };
    if (q) filter.$or = [{ name: rx(q) }, { email: rx(q) }, { organizationName: rx(q) }];
    const page = pageOf(req);
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * PAGE).limit(PAGE).select('name email phone role plan organizationName emailVerified suspended suspendedReason createdAt').lean(),
      User.countDocuments(filter),
    ]);
    const hosted = await Event.aggregate([{ $match: { organizer: { $in: users.map((u) => u._id) } } }, { $group: { _id: '$organizer', n: { $sum: 1 } } }]);
    res.json({
      total,
      page,
      pages: Math.ceil(total / PAGE),
      items: users.map((u) => ({ ...u, emailVerified: Boolean(u.emailVerified), suspended: Boolean(u.suspended), events: hosted.find((h) => String(h._id) === String(u._id))?.n || 0 })),
    });
  })
);

router.put(
  '/users/:id',
  ah(async (req, res) => {
    const user = await loadById(User, req.params.id, 'User');
    const self = String(user._id) === String(req.user._id);
    const changes = [];
    const { role, plan, suspended, reason } = req.body;

    if (role !== undefined && role !== user.role) {
      if (!['attendee', 'organizer', 'admin'].includes(role)) throw new HttpError(400, 'Unknown role');
      if (self) throw new HttpError(400, 'You cannot change your own role - ask another admin');
      changes.push(`role ${user.role} -> ${role}`);
      user.role = role;
    }
    if (plan !== undefined && plan !== user.plan) {
      if (!['free', 'pro', 'enterprise'].includes(plan)) throw new HttpError(400, 'Unknown plan');
      changes.push(`plan ${user.plan} -> ${plan}`);
      user.plan = plan;
    }
    if (suspended !== undefined && Boolean(suspended) !== Boolean(user.suspended)) {
      if (self) throw new HttpError(400, 'You cannot suspend your own account');
      user.suspended = Boolean(suspended);
      user.suspendedReason = user.suspended ? String(reason || '').trim().slice(0, 300) : undefined;
      changes.push(user.suspended ? `suspended${user.suspendedReason ? `: ${user.suspendedReason}` : ''}` : 'suspension lifted');
    }
    if (!changes.length) return res.json({ ok: true, unchanged: true });
    await user.save();
    await logAdmin(req, user.suspended && changes.some((c) => c.startsWith('suspended')) ? 'user.suspend' : 'user.update', 'user', user._id, `${user.email}: ${changes.join(', ')}`);
    res.json({ ok: true, user: { _id: user._id, role: user.role, plan: user.plan, suspended: Boolean(user.suspended) } });
  })
);

// ---------- Orders (find any order on the platform) ----------
router.get(
  '/orders',
  ah(async (req, res) => {
    const { q, status } = req.query;
    const filter = {};
    if (status === 'failed-refund') filter.refundError = { $exists: true, $ne: null };
    else if (status) filter.paymentStatus = status;
    else filter.paymentStatus = { $in: [...PAID_STATES, 'refunded'] };
    if (q) {
      const text = String(q).trim();
      const or = [{ 'buyer.email': rx(text) }, { 'buyer.name': rx(text) }, { paymentRef: rx(text) }, { 'gateway.paymentId': rx(text) }, { 'gateway.orderId': rx(text) }];
      // Order reference shown to buyers = last 8 characters of the order id
      const ref = text.replace(/^#/, '').toLowerCase();
      if (/^[0-9a-f]{4,24}$/.test(ref)) or.push({ $expr: { $regexMatch: { input: { $toString: '$_id' }, regex: `${ref}$` } } });
      filter.$or = or;
    }
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(50).populate('event', 'title slug status').lean();
    res.json(
      orders.map((o) => ({
        _id: o._id, buyer: o.buyer, event: o.event, createdAt: o.createdAt, currency: o.currency, total: o.total,
        paymentStatus: o.paymentStatus, paymentMethod: o.paymentMethod, paymentRef: o.paymentRef, provider: o.gateway?.provider,
        refundedAmount: o.refundedAmount || 0, refundError: o.refundError,
      }))
    );
  })
);

// ---------- Venue listings ----------
router.delete(
  '/venues/:id',
  ah(async (req, res) => {
    const venue = await loadById(Venue, req.params.id, 'Venue');
    await Promise.all([venue.deleteOne(), VenueInquiry.deleteMany({ venue: venue._id })]);
    await logAdmin(req, 'venue.delete', 'venue', venue._id, `Removed venue listing "${venue.name}" (${venue.city})`);
    res.json({ ok: true });
  })
);

// ---------- Activity log ----------
router.get(
  '/activity',
  ah(async (_req, res) => {
    const rows = await AdminAction.find().sort({ createdAt: -1 }).limit(200).populate('admin', 'name email').lean();
    res.json(rows.map((r) => ({ _id: r._id, at: r.createdAt, admin: r.admin, action: r.action, targetType: r.targetType, targetId: r.targetId, summary: r.summary })));
  })
);

export default router;
