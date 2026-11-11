import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    buyer: {
      name: String,
      email: String,
      phone: String,
    },
    items: [
      {
        ticketTypeId: mongoose.Schema.Types.ObjectId,
        name: String,
        price: Number,
        qty: Number,
      },
    ],
    subtotal: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    // Method the buyer actually used (reported by the gateway after payment)
    paymentMethod: { type: String, enum: ['upi', 'card', 'netbanking', 'wallet', 'emi', 'paylater', 'free', 'other'], default: 'upi' },
    // processing = payment verified, tickets being issued (guards against double issue
    // when the browser callback and the gateway webhook arrive at the same time)
    paymentStatus: { type: String, enum: ['pending', 'processing', 'paid', 'failed', 'refunded'], default: 'pending' },
    paymentRef: String,
    paidAt: Date,
    gateway: {
      provider: { type: String, enum: ['simulated', 'razorpay', 'none'], default: 'none' },
      orderId: { type: String, index: true }, // e.g. Razorpay order_xxx
      paymentId: String, // e.g. Razorpay pay_xxx
      refundId: String,
      failureReason: String,
    },
    answers: { type: Map, of: mongoose.Schema.Types.Mixed },
    // Marketing attribution (UTM) for B2B ROI reporting
    attribution: {
      source: String,
      medium: String,
      campaign: String,
      referrer: String,
    },
  },
  { timestamps: true }
);

orderSchema.index({ event: 1, paymentStatus: 1, createdAt: 1 });

export default mongoose.model('Order', orderSchema);
