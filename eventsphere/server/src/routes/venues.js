import { Router } from 'express';
import Venue from '../models/Venue.js';
import VenueInquiry from '../models/VenueInquiry.js';
import { protect, requireRole } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { notify, adminIds } from '../services/notify.js';

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
    // Matched literally (special characters escaped, not dropped), the same way the business listings are searched
    if (q) filter.name = new RegExp(String(q).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
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

// Quote requests people sent for venues I listed (admins also see requests for venues the platform listed)
router.get(
  '/inquiries/received',
  protect,
  ah(async (req, res) => {
    const mine = { listedBy: req.user._id };
    const venues = await Venue.find(req.user.role === 'admin' ? { $or: [mine, { listedBy: null }] } : mine).select('_id');
    const rows = await VenueInquiry.find({ venue: { $in: venues.map((v) => v._id) }, organizer: { $ne: req.user._id } })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('venue', 'name city')
      .populate('organizer', 'name email phone organizationName')
      .populate('event', 'title');
    res.json(rows);
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
    const owners = venue.listedBy ? [venue.listedBy] : await adminIds();
    const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '?');
    notify(owners.filter((id) => String(id) !== String(req.user._id)), {
      type: 'quote',
      title: `Quote request for ${venue.name}`,
      body: `${req.user.organizationName || req.user.name} (${req.user.email}) - ${day(startDate)} to ${day(endDate)}${expectedAttendees ? `, ${expectedAttendees} guests` : ''}${message ? ` - "${String(message).slice(0, 160)}"` : ''}`,
      link: '/organize#quotes',
    });
    res.status(201).json(inquiry);
  })
);

export default router;
