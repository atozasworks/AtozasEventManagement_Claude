import mongoose from 'mongoose';

/**
 * One confirmed booking slot on one date for one vendor.
 * The unique index is what makes double-booking impossible: two confirmations for the last free
 * slot of a date cannot both be saved, however close together they happen.
 */
const vendorDaySchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD
    slot: { type: Number, required: true }, // 1..bookingsPerDay
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorRequest', required: true },
  },
  { timestamps: true }
);

vendorDaySchema.index({ vendor: 1, date: 1, slot: 1 }, { unique: true });
vendorDaySchema.index({ request: 1 });

export default mongoose.model('VendorDay', vendorDaySchema);
