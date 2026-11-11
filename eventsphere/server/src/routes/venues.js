import { Router } from 'express';
import Venue from '../models/Venue.js';
import VenueInquiry from '../models/VenueInquiry.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';

const router = Router();

router.get(
  '/',
  ah(async (req, res) => {
    const { city, type, minCapacity, maxPrice, q } = req.query;
    const filter = {};
    if (city) filter.city = new RegExp(`^${city.replace(/[^\w\s]/g, '')}`, 'i');
    if (type) filter.type = type;
    if (minCapacity) filter.capacity = { $gte: Number(minCapacity) };
    if (maxPrice) filter.pricePerDay = { $lte: Number(maxPrice) };
    if (q) filter.name = new RegExp(q.replace(/[^\w\s]/g, ''), 'i');
    res.json(await Venue.find(filter).sort({ rating: -1, capacity: -1 }).limit(60));
  })
);

router.get(
  '/inquiries/mine',
  protect,
  ah(async (req, res) => {
    res.json(await VenueInquiry.find({ organizer: req.user._id }).sort({ createdAt: -1 }).populate('venue', 'name city').populate('event', 'title'));
  })
);

router.get(
  '/:id',
  ah(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) throw new HttpError(404, 'Venue not found');
    res.json(venue);
  })
);

router.post(
  '/',
  protect,
  requireRole('organizer', 'admin'),
  ah(async (req, res) => {
    const venue = await Venue.create({ ...req.body, listedBy: req.user._id });
    res.status(201).json(venue);
  })
);

router.post(
  '/:id/inquiries',
  protect,
  requireRole('organizer', 'admin'),
  ah(async (req, res) => {
    const venue = await Venue.findById(req.params.id);
    if (!venue) throw new HttpError(404, 'Venue not found');
    const { eventId, startDate, endDate, expectedAttendees, message } = req.body;
    if (expectedAttendees && Number(expectedAttendees) > venue.capacity) {
      throw new HttpError(400, `This venue holds up to ${venue.capacity} people`);
    }
    const inquiry = await VenueInquiry.create({
      venue: venue._id,
      organizer: req.user._id,
      event: eventId || undefined,
      startDate,
      endDate,
      expectedAttendees,
      message,
    });
    res.status(201).json(inquiry);
  })
);

export default router;
