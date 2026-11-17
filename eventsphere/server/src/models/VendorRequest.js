import mongoose from 'mongoose';

/**
 * Anything a customer asks a vendor for:
 *   booking - "I want this date"                      requested -> confirmed | declined | cancelled
 *   quote   - "What would this cost?"                 requested -> quoted -> confirmed/accepted | declined | cancelled
 *   visit   - site visit, food tasting or a meeting   requested -> confirmed | proposed (vendor suggests another time) | declined | cancelled
 */
const vendorRequestSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the vendor's account
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Contact details as they were when the request was made
    customerName: String,
    customerEmail: String,
    customerPhone: String,
    kind: { type: String, enum: ['booking', 'quote', 'visit'], required: true },
    status: { type: String, enum: ['requested', 'quoted', 'proposed', 'confirmed', 'accepted', 'declined', 'cancelled'], default: 'requested' },
    dates: [String], // event dates (YYYY-MM-DD); empty for a visit, optional for a quote
    guests: Number,
    budget: Number, // what the customer hopes to spend (quotes)
    message: { type: String, maxlength: 1000 },
    visitType: { type: String, enum: ['site-visit', 'tasting', 'meeting'] },
    visitAt: Date,
    // Vendor's answer
    quotedAmount: Number,
    vendorNote: { type: String, maxlength: 1000 },
    respondedAt: Date,
  },
  { timestamps: true }
);

vendorRequestSchema.index({ owner: 1, createdAt: -1 });
vendorRequestSchema.index({ customer: 1, createdAt: -1 });
vendorRequestSchema.index({ vendor: 1, status: 1 });

export default mongoose.model('VendorRequest', vendorRequestSchema);
