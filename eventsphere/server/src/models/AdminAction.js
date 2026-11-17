import mongoose from 'mongoose';

// Audit trail: every change a platform admin makes, so there is always a record of who did what and when.
const adminActionSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g. "event.takedown", "user.suspend", "order.refund"
    targetType: { type: String, enum: ['event', 'user', 'order', 'venue'] },
    targetId: mongoose.Schema.Types.ObjectId,
    summary: String, // human-readable line shown in the activity log
  },
  { timestamps: true }
);

adminActionSchema.index({ createdAt: -1 });

export default mongoose.model('AdminAction', adminActionSchema);
