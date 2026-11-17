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
        // Optional: who each ticket is for. Blank entries stay in the buyer's name.
        attendees: [{ _id: false, name: String, email: String }],
      },
    ],
    // listTotal = tickets at full price; subtotal = what the organizer earns after any discount
    listTotal: { type: Number, default: 0 },
    discount: {
      kind: { type: String, enum: ['promo', 'group'] },
      code: String,
      coupon: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
      amount: { type: Number, default: 0 },
      label: String,
      claimed: { type: Boolean, default: false }, // this order has been counted against the code's usage limit
    },
    subtotal: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    // Method the buyer actually used (reported by the gateway after payment)
    paymentMethod: { type: String, enum: ['upi', 'card', 'netbanking', 'wallet', 'emi', 'paylater', 'free', 'other'], default: 'upi' },
    // processing = payment verified, tickets being issued (guards against double issue
    // when the browser callback and the gateway webhook arrive at the same time)
    paymentStatus: { type: String, enum: ['pending', 'processing', 'paid', 'failed', 'partially_refunded', 'refunded'], default: 'pending' },
    // Refund history. refundedAmount = money returned to the buyer; refundedSubtotal = the part of it the organizer had earned
    refunds: [
      {
        amount: Number,
        subtotalPart: Number,
        refundId: String,
        reason: String,
        kind: { type: String, enum: ['organizer', 'attendee-request', 'event-cancelled'] },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        tickets: [mongoose.Schema.Types.ObjectId],
        at: { type: Date, default: Date.now },
      },
    ],
    refundedAmount: { type: Number, default: 0 },
    refundedSubtotal: { type: Number, default: 0 },
    refundError: String, // last failed refund attempt, shown to the organizer
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
