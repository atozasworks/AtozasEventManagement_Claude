import { Router } from 'express';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import Connection from '../models/Connection.js';
import ChatMessage from '../models/ChatMessage.js';
import { protect } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';

const router = Router();

async function assertTicketHolder(eventId, userId) {
  if (!(await Ticket.exists({ event: eventId, user: userId }))) {
    throw new HttpError(403, 'Only registered attendees can access networking');
  }
}

// People directory for an event (attendees who opted in)
router.get(
  '/events/:eventId/people',
  protect,
  ah(async (req, res) => {
    await assertTicketHolder(req.params.eventId, req.user._id);
    const userIds = await Ticket.distinct('user', { event: req.params.eventId });
    const people = await User.find({ _id: { $in: userIds, $ne: req.user._id }, openToNetworking: true })
      .select('name headline organizationName interests')
      .limit(200);
    const conns = await Connection.find({
      event: req.params.eventId,
      $or: [{ from: req.user._id }, { to: req.user._id }],
    });
    const statusFor = (id) => {
      const c = conns.find((x) => String(x.from) === String(id) || String(x.to) === String(id));
      if (!c) return null;
      return { id: c._id, status: c.status, incoming: String(c.to) === String(req.user._id) };
    };
    res.json(people.map((p) => ({ ...p.toObject(), connection: statusFor(p._id) })));
  })
);

router.post(
  '/events/:eventId/connections',
  protect,
  ah(async (req, res) => {
    const { to, message } = req.body;
    await assertTicketHolder(req.params.eventId, req.user._id);
    if (String(to) === String(req.user._id)) throw new HttpError(400, 'You cannot connect with yourself');
    const existing = await Connection.findOne({
      event: req.params.eventId,
      $or: [{ from: req.user._id, to }, { from: to, to: req.user._id }],
    });
    if (existing) return res.json(existing);
    const conn = await Connection.create({ event: req.params.eventId, from: req.user._id, to, message });
    res.status(201).json(conn);
  })
);

router.put(
  '/connections/:id',
  protect,
  ah(async (req, res) => {
    const conn = await Connection.findOne({ _id: req.params.id, to: req.user._id });
    if (!conn) throw new HttpError(404, 'Request not found');
    conn.status = req.body.status === 'accepted' ? 'accepted' : 'declined';
    await conn.save();
    res.json(conn);
  })
);

// Accepted connections reveal contact emails (privacy by default)
router.get(
  '/events/:eventId/connections',
  protect,
  ah(async (req, res) => {
    const conns = await Connection.find({
      event: req.params.eventId,
      status: 'accepted',
      $or: [{ from: req.user._id }, { to: req.user._id }],
    }).populate('from to', 'name email headline organizationName');
    res.json(conns.map((c) => (String(c.from._id) === String(req.user._id) ? c.to : c.from)));
  })
);

// Chat history (live messages flow through Socket.IO)
router.get(
  '/events/:eventId/chat/:room',
  protect,
  ah(async (req, res) => {
    const msgs = await ChatMessage.find({ event: req.params.eventId, room: req.params.room })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(msgs.reverse());
  })
);

export default router;
