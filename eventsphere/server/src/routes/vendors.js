import { Router } from 'express';
import Vendor, { VENDOR_CATEGORIES, PRICE_UNITS, VISIT_TYPES } from '../models/Vendor.js';
import VendorRequest from '../models/VendorRequest.js';
import VendorDay from '../models/VendorDay.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { ah, HttpError, isObjectId } from '../utils/http.js';
import { isEmail } from '../utils/tickets.js';
import { notify } from '../services/notify.js';
import { sendVendorMail } from '../services/notifications.js';
import { clientUrl } from '../utils/format.js';

/**
 * Vendor & facility marketplace: marriage halls, event planners, caterers, decorators, photographers.
 * Anyone can search and compare. A logged-in customer can book a date, ask for a quote, or schedule a
 * site visit / food tasting / meeting. Any logged-in user can list their own business and answer requests.
 */
const router = Router();

// ---------- helpers ----------
const HOUR = 60 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const rx = (q) => new RegExp(String(q).replace(/[^\w\s]/g, ''), 'i');
const validDate = (d) => YMD.test(d || '') && !Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
// "Today" in India, where the marketplace operates
const today = () => new Date(Date.now() + 5.5 * HOUR).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 24 * HOUR).toISOString().slice(0, 10);
const niceDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const niceDates = (dates) => (dates.length > 1 ? `${niceDate(dates[0])} to ${niceDate(dates.at(-1))}` : niceDate(dates[0]));
const niceTime = (d) => new Date(d).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const VISIT_LABEL = { 'site-visit': 'site visit', tasting: 'food tasting', meeting: 'meeting' };

function datesBetween(start, end) {
  const out = [];
  for (let d = start; d <= end && out.length <= 14; d = addDays(d, 1)) out.push(d);
  return out;
}

async function loadVendor(id, { mustBeActive = false } = {}) {
  const vendor = isObjectId(id) && (await Vendor.findById(id));
  if (!vendor || (mustBeActive && !vendor.active)) throw new HttpError(404, 'Listing not found');
  return vendor;
}
const canManage = (req, vendor) => String(vendor.owner) === String(req.user._id) || req.user.role === 'admin';

/** Confirmed bookings per date for a vendor: { 'YYYY-MM-DD': count } */
async function bookedCounts(vendorId, dates) {
  const rows = await VendorDay.aggregate([{ $match: { vendor: vendorId, date: { $in: dates } } }, { $group: { _id: '$date', n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

/** Why a date cannot be booked, or null when it can. */
async function whyUnavailable(vendor, dates) {
  const counts = await bookedCounts(vendor._id, dates);
  for (const d of dates) {
    if (d < today()) return `${niceDate(d)} is in the past`;
    if (vendor.blockedDates.includes(d)) return `${vendor.name} is not available on ${niceDate(d)}`;
    if ((counts[d] || 0) >= vendor.bookingsPerDay) return `${niceDate(d)} is already booked`;
  }
  return null;
}

/** Take a slot on every date for this request, or take none. The unique index decides races. */
async function reserve(vendor, dates, requestId) {
  for (const date of dates) {
    let got = false;
    for (let slot = 1; slot <= vendor.bookingsPerDay && !got; slot++) {
      try {
        await VendorDay.create({ vendor: vendor._id, date, slot, request: requestId });
        got = true;
      } catch (err) {
        if (err.code !== 11000) throw err; // 11000 = that slot was just taken, try the next one
      }
    }
    if (!got) {
      await VendorDay.deleteMany({ request: requestId });
      throw new HttpError(409, `${niceDate(date)} has just been booked by someone else`);
    }
  }
}
const release = (requestId) => VendorDay.deleteMany({ request: requestId });

// Tell the other side: bell notification + email
async function tell({ userId, email, title, lines, link }) {
  notify(userId, { type: 'vendor', title, body: lines.slice(0, 2).join(' - '), link });
  if (email) sendVendorMail({ to: email, subject: title, heading: title, lines, button: { label: 'Open in EventSphere', url: `${clientUrl()}${link}` } }).catch(() => {});
}

const requestSummary = (r) =>
  r.kind === 'visit'
    ? `${VISIT_LABEL[r.visitType] || 'visit'} on ${niceTime(r.visitAt)}`
    : `${r.kind === 'quote' ? 'quote' : 'booking'}${r.dates.length ? ` for ${niceDates(r.dates)}` : ''}${r.guests ? `, ${r.guests} guests` : ''}`;

// What the organizer of a listing typed, tidied and checked
function cleanListing(body, { creating }) {
  const out = {};
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  if (creating || 'category' in body) {
    if (!VENDOR_CATEGORIES[body.category]) throw new HttpError(400, 'Choose what kind of business this is');
    out.category = body.category;
  }
  if (creating || 'name' in body) {
    out.name = str(body.name, 120);
    if (out.name.length < 3) throw new HttpError(400, 'Enter the business name');
  }
  if (creating || 'city' in body) {
    out.city = str(body.city, 60);
    if (!out.city) throw new HttpError(400, 'Enter the city');
  }
  if (creating || 'priceFrom' in body) {
    out.priceFrom = Number(body.priceFrom);
    if (!(out.priceFrom >= 0)) throw new HttpError(400, 'Enter a starting price');
  }
  for (const k of ['tagline', 'description', 'state', 'address', 'imageUrl']) if (k in body) out[k] = str(body[k], k === 'description' ? 3000 : 300);
  if ('priceUnit' in body) {
    if (!PRICE_UNITS.includes(body.priceUnit)) throw new HttpError(400, 'Unknown price unit');
    out.priceUnit = body.priceUnit;
  } else if (creating) out.priceUnit = VENDOR_CATEGORIES[body.category].priceUnit;
  for (const k of ['capacityMin', 'capacityMax']) {
    if (k in body) {
      out[k] = Math.floor(Number(body[k]) || 0);
      if (out[k] < 0) throw new HttpError(400, 'Guest numbers cannot be negative');
    }
  }
  if (out.capacityMax && out.capacityMin > out.capacityMax) throw new HttpError(400, 'Smallest guest count cannot be more than the largest');
  if ('services' in body) out.services = (Array.isArray(body.services) ? body.services : String(body.services).split(',')).map((s) => str(s, 40)).filter(Boolean).slice(0, 20);
  if ('contact' in body) {
    const c = body.contact || {};
    const phone = (v) => str(v, 20).replace(/[^\d+]/g, '');
    out.contact = { phone: phone(c.phone), whatsapp: phone(c.whatsapp), email: str(c.email, 120).toLowerCase() };
    if (out.contact.email && !isEmail(out.contact.email)) throw new HttpError(400, 'The contact email is not valid');
    if (!out.contact.phone && !out.contact.whatsapp && !out.contact.email) throw new HttpError(400, 'Add at least one way to contact you: phone, WhatsApp or email');
  } else if (creating) throw new HttpError(400, 'Add at least one way to contact you: phone, WhatsApp or email');
  if ('bookingsPerDay' in body) {
    out.bookingsPerDay = Math.floor(Number(body.bookingsPerDay) || 1);
    if (out.bookingsPerDay < 1 || out.bookingsPerDay > 20) throw new HttpError(400, 'Bookings per day must be between 1 and 20');
  }
  if ('instantBooking' in body) out.instantBooking = Boolean(body.instantBooking);
  if ('visitTypes' in body) out.visitTypes = [...new Set((body.visitTypes || []).filter((v) => VISIT_TYPES.includes(v)))];
  else if (creating) out.visitTypes = VENDOR_CATEGORIES[body.category].visitTypes;
  if ('active' in body) out.active = Boolean(body.active);
  return out;
}

// ---------- search ----------
router.get(
  '/',
  ah(async (req, res) => {
    const { category, city, guests, maxBudget, date, q, sort = 'price', page = 1 } = req.query;
    const filter = { active: true };
    if (category && VENDOR_CATEGORIES[category]) filter.category = category;
    if (city) filter.city = new RegExp(`^${String(city).replace(/[^\w\s]/g, '')}`, 'i');
    if (Number(maxBudget) > 0) filter.priceFrom = { $lte: Number(maxBudget) };
    const and = [];
    if (Number(guests) > 0) {
      // Fits the guest count; businesses with no guest limit (capacityMax 0) always fit
      and.push({ $or: [{ capacityMax: 0 }, { capacityMax: { $gte: Number(guests) } }] }, { capacityMin: { $lte: Number(guests) } });
    }
    if (q) and.push({ $or: [{ name: rx(q) }, { tagline: rx(q) }, { services: rx(q) }, { city: rx(q) }] });
    if (date) {
      if (!validDate(date)) throw new HttpError(400, 'Dates must look like 2027-02-14');
      // Free on that date: not blocked by the vendor and not fully booked
      filter.blockedDates = { $ne: date };
      const booked = await VendorDay.aggregate([{ $match: { date } }, { $group: { _id: '$vendor', n: { $sum: 1 } } }]);
      if (booked.length) {
        const limits = await Vendor.find({ _id: { $in: booked.map((b) => b._id) } }).select('bookingsPerDay');
        const full = booked.filter((b) => b.n >= (limits.find((l) => String(l._id) === String(b._id))?.bookingsPerDay || 1)).map((b) => b._id);
        if (full.length) filter._id = { $nin: full };
      }
    }
    if (and.length) filter.$and = and;
    const order = { price: { priceFrom: 1 }, 'price-desc': { priceFrom: -1 }, capacity: { capacityMax: -1 }, new: { createdAt: -1 } }[sort] || { priceFrom: 1 };
    const LIMIT = 24;
    const p = Math.max(1, Number(page) || 1);
    const [items, total] = await Promise.all([
      Vendor.find(filter).sort(order).skip((p - 1) * LIMIT).limit(LIMIT).select('-blockedDates -description'),
      Vendor.countDocuments(filter),
    ]);
    res.json({ items, total, page: p, pages: Math.ceil(total / LIMIT) });
  })
);

router.get(
  '/meta',
  ah(async (_req, res) => {
    const cities = await Vendor.distinct('city', { active: true });
    res.json({ cities: cities.filter(Boolean).sort(), categories: VENDOR_CATEGORIES });
  })
);

// ---------- my listings ----------
router.get(
  '/mine',
  protect,
  ah(async (req, res) => {
    res.json(await Vendor.find({ owner: req.user._id }).sort({ createdAt: -1 }));
  })
);

router.post(
  '/',
  protect,
  ah(async (req, res) => {
    if ((await Vendor.countDocuments({ owner: req.user._id })) >= 20) throw new HttpError(400, 'One account can have up to 20 listings');
    const data = cleanListing(req.body, { creating: true });
    res.status(201).json(await Vendor.create({ ...data, owner: req.user._id }));
  })
);

// ---------- requests (bookings, quotes, visits) ----------
// Declared before "/:id" so "requests" is never mistaken for a listing id
router.get(
  '/requests/mine',
  protect,
  ah(async (req, res) => {
    const rows = await VendorRequest.find({ customer: req.user._id }).sort({ createdAt: -1 }).limit(100).populate('vendor', 'name category city contact priceUnit currency');
    res.json(rows);
  })
);

router.get(
  '/requests/received',
  protect,
  ah(async (req, res) => {
    const rows = await VendorRequest.find({ owner: req.user._id }).sort({ createdAt: -1 }).limit(200).populate('vendor', 'name category city bookingsPerDay currency');
    res.json(rows);
  })
);

// The vendor answers a request
router.post(
  '/requests/:id/respond',
  protect,
  ah(async (req, res) => {
    const r = isObjectId(req.params.id) && (await VendorRequest.findById(req.params.id));
    if (!r) throw new HttpError(404, 'Request not found');
    const vendor = await loadVendor(r.vendor);
    if (!canManage(req, vendor)) throw new HttpError(404, 'Request not found');
    const { action } = req.body;
    const note = String(req.body.note || '').trim().slice(0, 1000);
    const open = ['requested', 'quoted', 'proposed'];
    let headline;

    if (action === 'confirm') {
      if (r.kind === 'quote') throw new HttpError(400, 'Send a quote first - the customer confirms it');
      if (!['requested', 'proposed'].includes(r.status)) throw new HttpError(400, 'This request has already been answered');
      if (r.kind === 'booking') {
        const why = await whyUnavailable(vendor, r.dates);
        if (why) throw new HttpError(409, why);
        await reserve(vendor, r.dates, r._id);
      }
      r.status = 'confirmed';
      headline = r.kind === 'booking' ? `Booking confirmed: ${vendor.name}, ${niceDates(r.dates)}` : `Your ${VISIT_LABEL[r.visitType]} with ${vendor.name} is confirmed for ${niceTime(r.visitAt)}`;
    } else if (action === 'decline') {
      if (!open.includes(r.status)) throw new HttpError(400, 'This request has already been answered');
      r.status = 'declined';
      headline = `${vendor.name} cannot take your ${r.kind === 'visit' ? VISIT_LABEL[r.visitType] : r.kind} request`;
    } else if (action === 'quote') {
      if (r.kind !== 'quote' || !['requested', 'quoted'].includes(r.status)) throw new HttpError(400, 'A quote can only be sent for an open quote request');
      const amount = Number(req.body.quotedAmount);
      if (!(amount > 0)) throw new HttpError(400, 'Enter the amount you are quoting');
      r.quotedAmount = Math.round(amount * 100) / 100;
      r.status = 'quoted';
      headline = `${vendor.name} sent you a quote: ${vendor.currency} ${r.quotedAmount.toLocaleString('en-IN')}`;
    } else if (action === 'reschedule') {
      if (r.kind !== 'visit' || !['requested', 'confirmed', 'proposed'].includes(r.status)) throw new HttpError(400, 'Only an open visit can be moved');
      const at = new Date(req.body.visitAt);
      if (Number.isNaN(at.getTime()) || at <= new Date()) throw new HttpError(400, 'Choose a new date and time in the future');
      r.visitAt = at;
      r.status = 'proposed';
      headline = `${vendor.name} suggests ${niceTime(at)} for your ${VISIT_LABEL[r.visitType]}`;
    } else if (action === 'cancel') {
      if (r.status !== 'confirmed') throw new HttpError(400, 'Only a confirmed booking or visit can be cancelled');
      await release(r._id);
      r.status = 'cancelled';
      headline = `${vendor.name} cancelled your ${r.kind === 'visit' ? VISIT_LABEL[r.visitType] : `booking for ${niceDates(r.dates)}`}`;
    } else throw new HttpError(400, 'Unknown action');

    if (note || action !== 'confirm') r.vendorNote = note || r.vendorNote;
    r.respondedAt = new Date();
    await r.save();
    tell({ userId: r.customer, email: r.customerEmail, title: headline, lines: [`Your request: ${requestSummary(r)}`, note ? `Message from ${vendor.name}: ${note}` : null].filter(Boolean), link: '/vendors/hub' });
    res.json(r);
  })
);

// The customer acts on their own request
router.post(
  '/requests/:id/act',
  protect,
  ah(async (req, res) => {
    const r = isObjectId(req.params.id) && (await VendorRequest.findOne({ _id: req.params.id, customer: req.user._id }));
    if (!r) throw new HttpError(404, 'Request not found');
    const vendor = await loadVendor(r.vendor);
    const { action } = req.body;
    let headline;

    if (action === 'cancel') {
      if (!['requested', 'quoted', 'proposed', 'confirmed', 'accepted'].includes(r.status)) throw new HttpError(400, 'This request is already closed');
      await release(r._id);
      r.status = 'cancelled';
      headline = `${r.customerName} cancelled their ${r.kind === 'visit' ? VISIT_LABEL[r.visitType] : r.kind} request`;
    } else if (action === 'accept-quote') {
      if (r.kind !== 'quote' || r.status !== 'quoted') throw new HttpError(400, 'There is no quote to accept');
      if (r.dates.length) {
        // Accepting a quote for a date books that date
        const why = await whyUnavailable(vendor, r.dates);
        if (why) throw new HttpError(409, `${why}. Ask ${vendor.name} about another date.`);
        await reserve(vendor, r.dates, r._id);
        r.status = 'confirmed';
      } else r.status = 'accepted';
      headline = `${r.customerName} accepted your quote of ${vendor.currency} ${r.quotedAmount.toLocaleString('en-IN')}`;
    } else if (action === 'decline-quote') {
      if (r.kind !== 'quote' || r.status !== 'quoted') throw new HttpError(400, 'There is no quote to decline');
      r.status = 'declined';
      headline = `${r.customerName} declined your quote`;
    } else if (action === 'accept-time') {
      if (r.kind !== 'visit' || r.status !== 'proposed') throw new HttpError(400, 'There is no new time to accept');
      r.status = 'confirmed';
      headline = `${r.customerName} confirmed ${niceTime(r.visitAt)} for the ${VISIT_LABEL[r.visitType]}`;
    } else throw new HttpError(400, 'Unknown action');

    await r.save();
    const owner = await User.findById(r.owner).select('email');
    tell({ userId: r.owner, email: vendor.contact?.email || owner?.email, title: headline, lines: [`${vendor.name}: ${requestSummary(r)}`, `Customer: ${r.customerName}, ${r.customerEmail}${r.customerPhone ? `, ${r.customerPhone}` : ''}`], link: '/vendors/hub?tab=listings' });
    res.json(r);
  })
);

// ---------- one listing ----------
router.get(
  '/:id',
  ah(async (req, res) => {
    const vendor = await loadVendor(req.params.id);
    res.json(vendor);
  })
);

router.put(
  '/:id',
  protect,
  ah(async (req, res) => {
    const vendor = await loadVendor(req.params.id);
    if (!canManage(req, vendor)) throw new HttpError(403, 'This is not your listing');
    vendor.set(cleanListing(req.body, { creating: false }));
    if (vendor.capacityMax && vendor.capacityMin > vendor.capacityMax) throw new HttpError(400, 'Smallest guest count cannot be more than the largest');
    await vendor.save();
    res.json(vendor);
  })
);

router.delete(
  '/:id',
  protect,
  ah(async (req, res) => {
    const vendor = await loadVendor(req.params.id);
    if (!canManage(req, vendor)) throw new HttpError(403, 'This is not your listing');
    if (await VendorDay.exists({ vendor: vendor._id, date: { $gte: today() } })) {
      throw new HttpError(400, 'This listing has confirmed bookings coming up. Pause it instead, or cancel those bookings first.');
    }
    await Promise.all([vendor.deleteOne(), VendorDay.deleteMany({ vendor: vendor._id }), VendorRequest.updateMany({ vendor: vendor._id, status: { $in: ['requested', 'quoted', 'proposed'] } }, { status: 'declined', vendorNote: 'This listing was removed' })]);
    res.json({ ok: true });
  })
);

// Live availability calendar: one entry per day
router.get(
  '/:id/availability',
  ah(async (req, res) => {
    const vendor = await loadVendor(req.params.id);
    const from = validDate(req.query.from) ? req.query.from : today();
    const days = Math.min(Math.max(Number(req.query.days) || 42, 1), 120);
    const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
    const [counts, pending] = await Promise.all([
      bookedCounts(vendor._id, dates),
      VendorRequest.distinct('dates', { vendor: vendor._id, status: { $in: ['requested', 'quoted'] }, dates: { $in: dates } }),
    ]);
    const now = today();
    res.json({
      bookingsPerDay: vendor.bookingsPerDay,
      asOf: new Date(),
      days: dates.map((date) => {
        const booked = counts[date] || 0;
        const status =
          date < now ? 'past' : vendor.blockedDates.includes(date) ? 'blocked' : booked >= vendor.bookingsPerDay ? 'booked' : pending.includes(date) ? 'pending' : 'available';
        return { date, status, left: Math.max(vendor.bookingsPerDay - booked, 0) };
      }),
    });
  })
);

// The vendor marks dates as unavailable (or available again)
router.post(
  '/:id/blocked-dates',
  protect,
  ah(async (req, res) => {
    const vendor = await loadVendor(req.params.id);
    if (!canManage(req, vendor)) throw new HttpError(403, 'This is not your listing');
    const dates = [...new Set((req.body.dates || []).filter(validDate))].slice(0, 120);
    if (!dates.length) throw new HttpError(400, 'Choose at least one date');
    await Vendor.updateOne({ _id: vendor._id }, req.body.blocked === false ? { $pull: { blockedDates: { $in: dates } } } : { $addToSet: { blockedDates: { $each: dates } } });
    res.json({ ok: true, blockedDates: (await Vendor.findById(vendor._id).select('blockedDates')).blockedDates.sort() });
  })
);

// A customer books a date, asks for a quote, or schedules a visit
router.post(
  '/:id/requests',
  protect,
  ah(async (req, res) => {
    const vendor = await loadVendor(req.params.id, { mustBeActive: true });
    if (String(vendor.owner) === String(req.user._id)) throw new HttpError(400, 'This is your own listing');
    const { kind } = req.body;
    if (!['booking', 'quote', 'visit'].includes(kind)) throw new HttpError(400, 'Unknown request type');
    if ((await VendorRequest.countDocuments({ vendor: vendor._id, customer: req.user._id, status: { $in: ['requested', 'quoted', 'proposed'] } })) >= 5) {
      throw new HttpError(400, `You already have 5 open requests with ${vendor.name}. Wait for a reply or cancel one first.`);
    }

    const doc = {
      vendor: vendor._id,
      owner: vendor.owner,
      customer: req.user._id,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: String(req.body.phone || req.user.phone || '').trim().slice(0, 20),
      kind,
      message: String(req.body.message || '').trim().slice(0, 1000),
      guests: Math.max(0, Math.floor(Number(req.body.guests) || 0)) || undefined,
      dates: [],
    };
    if (doc.guests && vendor.capacityMax && doc.guests > vendor.capacityMax) throw new HttpError(400, `${vendor.name} can take up to ${vendor.capacityMax} guests`);

    // Dates: required for a booking, optional for a quote
    const { date, endDate } = req.body;
    if (kind === 'booking' || (kind === 'quote' && date)) {
      if (!validDate(date)) throw new HttpError(400, 'Choose the date of your event');
      const last = endDate || date;
      if (!validDate(last) || last < date) throw new HttpError(400, 'The last day must be on or after the first day');
      doc.dates = datesBetween(date, last);
      if (doc.dates.length > 14) throw new HttpError(400, 'A booking can cover up to 14 days');
      const why = await whyUnavailable(vendor, doc.dates);
      if (why) throw new HttpError(409, why);
    }

    if (kind === 'quote') {
      doc.budget = Number(req.body.budget) > 0 ? Number(req.body.budget) : undefined;
      if (doc.message.length < 10) throw new HttpError(400, 'Describe what you need in a sentence or two, so the quote is accurate');
    }
    if (kind === 'visit') {
      if (!vendor.visitTypes.includes(req.body.visitType)) throw new HttpError(400, `${vendor.name} does not offer that kind of visit`);
      const at = new Date(req.body.visitAt);
      if (Number.isNaN(at.getTime()) || at <= new Date()) throw new HttpError(400, 'Choose a date and time in the future');
      if (at > new Date(Date.now() + 180 * 24 * HOUR)) throw new HttpError(400, 'Choose a date within the next 6 months');
      doc.visitType = req.body.visitType;
      doc.visitAt = at;
    }

    const request = await VendorRequest.create(doc);
    // Instant booking: a free date is confirmed straight away
    if (kind === 'booking' && vendor.instantBooking) {
      try {
        await reserve(vendor, request.dates, request._id);
        request.status = 'confirmed';
        request.respondedAt = new Date();
        await request.save();
      } catch (err) {
        await request.deleteOne();
        throw err;
      }
    }

    const owner = await User.findById(vendor.owner).select('email');
    const what = kind === 'visit' ? `${VISIT_LABEL[request.visitType]} request` : kind === 'quote' ? 'quote request' : request.status === 'confirmed' ? 'booking (confirmed automatically)' : 'booking request';
    tell({
      userId: vendor.owner,
      email: vendor.contact?.email || owner?.email,
      title: `New ${what} for ${vendor.name}`,
      lines: [
        `${request.customerName} (${request.customerEmail}${request.customerPhone ? `, ${request.customerPhone}` : ''}): ${requestSummary(request)}`,
        request.budget ? `Budget: ${vendor.currency} ${request.budget.toLocaleString('en-IN')}` : null,
        request.message ? `Message: ${request.message}` : null,
      ].filter(Boolean),
      link: '/vendors/hub?tab=listings',
    });
    res.status(201).json(request);
  })
);

export default router;
