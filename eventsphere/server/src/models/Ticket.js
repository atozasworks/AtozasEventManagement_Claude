import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    // user = the account that holds the ticket now (sees the QR, can join online).
    // Empty while a transfer is waiting for the new person to accept it.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    purchaser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // the account that bought it
    // Set while someone else can add this ticket to their own account from an emailed link
    claimTokenHash: { type: String, select: false, index: true, sparse: true },
    transferredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // sender of a transfer that is not accepted yet
    transfers: [{ fromUser: mongoose.Schema.Types.ObjectId, fromName: String, toName: String, toEmail: String, at: { type: Date, default: Date.now } }],
    ticketTypeId: mongoose.Schema.Types.ObjectId,
    ticketTypeName: String,
    access: { type: String, enum: ['in-person', 'virtual', 'both'], default: 'both' },
    holderName: String,
    holderEmail: String,
    code: { type: String, required: true, unique: true }, // encoded in the QR
    previousCodes: { type: [String], index: true }, // codes this ticket had before a transfer - they must be refused at the gate
    // cancelled = refunded or cancelled: kept for the record, but no entry and no online access
    status: { type: String, enum: ['valid', 'cancelled'], default: 'valid' },
    cancelledAt: Date,
    cancelReason: String,
    // The buyer asked the organizer for a refund of this ticket
    cancelRequest: {
      status: { type: String, enum: ['requested', 'declined'] },
      reason: String,
      at: Date,
      note: String, // organizer's answer when declining
    },
    checkedIn: { type: Boolean, default: false },
    checkedInAt: Date,
    checkInGate: String,
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // organizer or gate staff who scanned it
  },
  { timestamps: true }
);

ticketSchema.index({ event: 1, checkedIn: 1 });

export default mongoose.model('Ticket', ticketSchema);
