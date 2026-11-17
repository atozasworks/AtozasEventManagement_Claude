import mongoose from 'mongoose';

// In-app notifications shown under the bell in the top menu
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // who it is for
    type: { type: String, enum: ['booking', 'quote', 'refund-request', 'vendor'], required: true },
    title: { type: String, required: true },
    body: String,
    link: String, // page to open when it is clicked
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

export default mongoose.model('Notification', notificationSchema);
