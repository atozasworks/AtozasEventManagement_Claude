import { Router } from 'express';
import Booth from '../models/Booth.js';
import Ticket from '../models/Ticket.js';
import { protect } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { loadOwnedEvent } from './events.js';

const router = Router();
const TIER_ORDER = { platinum: 0, gold: 1, silver: 2, startup: 3 };

router.get(
  '/events/:eventId/booths',
  ah(async (req, res) => {
    const booths = await Booth.find({ event: req.params.eventId }).select('-leads').lean();
    booths.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    res.json(booths);
  })
);

router.post(
  '/events/:eventId/booths',
  protect,
  ah(async (req, res) => {
    const event = await loadOwnedEvent(req, req.params.eventId);
    const booth = await Booth.create({ ...req.body, event: event._id, visits: 0, leads: [] });
    res.status(201).json(booth);
  })
);

router.put(
  '/booths/:id',
  protect,
  ah(async (req, res) => {
    const booth = await Booth.findById(req.params.id);
    if (!booth) throw new HttpError(404, 'Booth not found');
    await loadOwnedEvent(req, booth.event);
    const { visits, leads, event, ...rest } = req.body; // eslint-disable-line no-unused-vars
    booth.set(rest);
    await booth.save();
    res.json(booth);
  })
);

router.delete(
  '/booths/:id',
  protect,
  ah(async (req, res) => {
    const booth = await Booth.findById(req.params.id);
    if (!booth) throw new HttpError(404, 'Booth not found');
    await loadOwnedEvent(req, booth.event);
    await booth.deleteOne();
    res.json({ ok: true });
  })
);

router.post(
  '/booths/:id/visit',
  ah(async (req, res) => {
    await Booth.updateOne({ _id: req.params.id }, { $inc: { visits: 1 } });
    res.json({ ok: true });
  })
);

// Attendee shares contact details with a sponsor -> lead for the sponsor
router.post(
  '/booths/:id/leads',
  protect,
  ah(async (req, res) => {
    const booth = await Booth.findById(req.params.id);
    if (!booth) throw new HttpError(404, 'Booth not found');
    const hasTicket = await Ticket.exists({ event: booth.event, user: req.user._id });
    if (!hasTicket) throw new HttpError(403, 'Register for the event to connect with sponsors');
    if (booth.leads.some((l) => String(l.user) === String(req.user._id))) {
      return res.json({ ok: true, alreadyShared: true });
    }
    booth.leads.push({ user: req.user._id, name: req.user.name, email: req.user.email, note: req.body.note });
    await booth.save();
    res.status(201).json({ ok: true });
  })
);

// Sponsor lead export for the organizer
router.get(
  '/booths/:id/leads',
  protect,
  ah(async (req, res) => {
    const booth = await Booth.findById(req.params.id);
    if (!booth) throw new HttpError(404, 'Booth not found');
    await loadOwnedEvent(req, booth.event);
    res.json(booth.leads);
  })
);

export default router;
