import mongoose from 'mongoose';

const ticketSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticketTypeId: mongoose.Schema.Types.ObjectId,
    ticketTypeName: String,
    access: { type: String, enum: ['in-person', 'virtual', 'both'], default: 'both' },
    holderName: String,
    holderEmail: String,
    code: { type: String, required: true, unique: true }, // encoded in the QR
    checkedIn: { type: Boolean, default: false },
    checkedInAt: Date,
    checkInGate: String,
  },
  { timestamps: true }
);

ticketSchema.index({ event: 1, checkedIn: 1 });

export default mongoose.model('Ticket', ticketSchema);
