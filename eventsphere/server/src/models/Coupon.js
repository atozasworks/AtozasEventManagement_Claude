import mongoose from 'mongoose';

// A promo code for one event. Codes are stored in capitals and are unique per event.
const couponSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: String, // organizer's own note, e.g. "LinkedIn launch campaign"
    type: { type: String, enum: ['percent', 'flat'], default: 'percent' },
    value: { type: Number, required: true, min: 0 }, // percent (1-100) or an amount in the event currency
    maxUses: { type: Number, default: 0, min: 0 }, // number of orders; 0 = unlimited
    used: { type: Number, default: 0 },
    validFrom: Date,
    validTo: Date,
    ticketTypeIds: [mongoose.Schema.Types.ObjectId], // empty = every paid ticket type
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index({ event: 1, code: 1 }, { unique: true });

export default mongoose.model('Coupon', couponSchema);
