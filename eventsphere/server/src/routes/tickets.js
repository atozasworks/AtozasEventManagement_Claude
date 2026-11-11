import { Router } from 'express';
import Ticket from '../models/Ticket.js';
import { protect } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { loadOwnedEvent } from './events.js';

const router = Router();

router.get(
  '/mine',
  protect,
  ah(async (req, res) => {
    const tickets = await Ticket.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('event', 'title slug startDate endDate format location coverImage modules status');
    res.json(tickets);
  })
);

// Gate manifest: lets the check-in app work OFFLINE at venues with poor connectivity
router.get(
  '/manifest/:eventId',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const tickets = await Ticket.find({ event: event._id, access: { $in: ['in-person', 'both'] } }).select(
      'code holderName ticketTypeName checkedIn checkedInAt'
    );
    res.json({ eventId: event._id, title: event.title, downloadedAt: new Date(), tickets });
  })
);

async function checkInOne(eventId, code, gate, at = new Date()) {
  const normalized = String(code || '').trim().toUpperCase();
  const ticket = await Ticket.findOne({ event: eventId, code: normalized });
  if (!ticket) return { code: normalized, result: 'invalid', message: 'Ticket not found for this event' };
  if (ticket.access === 'virtual') return { code: normalized, result: 'invalid', message: 'Virtual-only ticket', holderName: ticket.holderName };
  // Atomic: only the first scan wins (prevents duplicate entry at multiple gates)
  const updated = await Ticket.findOneAndUpdate(
    { _id: ticket._id, checkedIn: false },
    { checkedIn: true, checkedInAt: at, checkInGate: gate },
    { new: true }
  );
  if (!updated) {
    return { code: normalized, result: 'duplicate', message: `Already checked in at ${ticket.checkedInAt?.toISOString()}`, holderName: ticket.holderName };
  }
  return { code: normalized, result: 'ok', holderName: updated.holderName, ticketTypeName: updated.ticketTypeName };
}

router.post(
  '/checkin',
  protect,
  ah(async (req, res) => {
    const { eventId, code, gate = 'Gate 1' } = req.body;
    if (!code) throw new HttpError(400, 'Ticket code is required');
    const event = await loadOwnedEvent(req, eventId);
    res.json(await checkInOne(event._id, code, gate));
  })
);

// Sync scans recorded offline
router.post(
  '/checkin/sync',
  protect,
  ah(async (req, res) => {
    const { eventId, scans = [] } = req.body;
    const event = await loadOwnedEvent(req, eventId);
    const results = [];
    for (const s of scans.slice(0, 5000)) {
      results.push(await checkInOne(event._id, s.code, s.gate || 'Offline gate', s.at ? new Date(s.at) : new Date()));
    }
    res.json({ results });
  })
);

router.post(
  '/:id/undo-checkin',
  protect,
  ah(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new HttpError(404, 'Ticket not found');
    await loadOwnedEvent(req, ticket.event);
    ticket.checkedIn = false;
    ticket.checkedInAt = undefined;
    await ticket.save();
    res.json(ticket);
  })
);

export default router;
