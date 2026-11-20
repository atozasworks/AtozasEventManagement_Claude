import mongoose from 'mongoose';

// What kinds of businesses can be listed, and the usual way each one prices and meets customers
export const VENDOR_CATEGORIES = {
  'marriage-hall': { label: 'Marriage halls', priceUnit: 'per-day', visitTypes: ['site-visit'] },
  'convention-centre': { label: 'Convention centres', priceUnit: 'per-day', visitTypes: ['site-visit', 'meeting'] },
  'banquet-hall': { label: 'Banquet halls', priceUnit: 'per-day', visitTypes: ['site-visit'] },
  'event-planner': { label: 'Event planners', priceUnit: 'per-event', visitTypes: ['meeting'] },
  caterer: { label: 'Caterers', priceUnit: 'per-plate', visitTypes: ['tasting', 'meeting'] },
  decorator: { label: 'Decorators', priceUnit: 'per-event', visitTypes: ['meeting', 'site-visit'] },
  photographer: { label: 'Photographers', priceUnit: 'per-event', visitTypes: ['meeting'] },
};
export const PRICE_UNITS = ['per-day', 'per-plate', 'per-event', 'per-hour'];
export const VISIT_TYPES = ['site-visit', 'tasting', 'meeting'];

/**
 * A business listed through "List your business" (a hall, convention centre, banquet hall, caterer, planner,
 * decorator or photographer). There is ONE record per business: the Vendors page and the Venues page both
 * read this collection, so an edit, a pause or a new listing shows on both without any copying.
 */
const vendorSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, enum: Object.keys(VENDOR_CATEGORIES), required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tagline: { type: String, trim: true, maxlength: 160 },
    description: { type: String, maxlength: 3000 },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    address: { type: String, trim: true },
    // Guests the business can serve. capacityMax 0 = not limited by guest count (e.g. a photographer)
    capacityMin: { type: Number, default: 0, min: 0 },
    capacityMax: { type: Number, default: 0, min: 0 },
    // "From" price, in the unit that is normal for the trade (hall per day, caterer per plate ...)
    priceFrom: { type: Number, required: true, min: 0 },
    priceUnit: { type: String, enum: PRICE_UNITS, default: 'per-event' },
    currency: { type: String, default: 'INR' },
    services: [String], // e.g. "AC hall", "Parking", "Veg & non-veg", "Drone shots"
    imageUrl: String,
    contact: {
      phone: { type: String, trim: true },
      whatsapp: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    // Availability
    bookingsPerDay: { type: Number, default: 1, min: 1, max: 20 }, // a hall takes 1 event a day; a caterer may take several
    instantBooking: { type: Boolean, default: false }, // true = a free date is confirmed at once, without the vendor approving
    blockedDates: [String], // YYYY-MM-DD dates the vendor has marked as unavailable
    visitTypes: [{ type: String, enum: VISIT_TYPES }], // what a customer can schedule: site visit, food tasting, meeting
    active: { type: Boolean, default: true }, // paused listings are hidden from search
  },
  { timestamps: true }
);

vendorSchema.index({ active: 1, category: 1, city: 1 });

export default mongoose.model('Vendor', vendorSchema);
