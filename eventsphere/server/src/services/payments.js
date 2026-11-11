import crypto from 'crypto';
import Razorpay from 'razorpay';

/**
 * Payment gateway adapters. Both expose the same interface:
 *   provider                       'simulated' | 'razorpay'
 *   publicConfig()                 safe values for the browser (never the secret)
 *   createIntent(order)            -> { gatewayOrderId, checkout }
 *   verify(order, body)            -> { ok, paymentId, reference, method, reason }
 *   refund(order)                  -> { ok, refundId }
 *
 * PAYMENT_MODE=razorpay uses Razorpay Standard Checkout (UPI, cards, net banking,
 * wallets, EMI and pay-later are all offered inside the Razorpay window).
 * PAYMENT_MODE=simulated approves instantly so the flow can be tested offline.
 */

// ---------- helpers ----------
export const toMinorUnits = (amount) => Math.round(Number(amount) * 100); // ₹ -> paise

export function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Razorpay checkout signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret)
export function verifyCheckoutSignature({ orderId, paymentId, signature, secret }) {
  const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

// Razorpay webhook signature = HMAC_SHA256(raw request body, webhook_secret)
export function verifyWebhookSignature({ rawBody, signature, secret }) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

const METHOD_MAP = { upi: 'upi', card: 'card', netbanking: 'netbanking', wallet: 'wallet', emi: 'emi', paylater: 'paylater' };

// ---------- simulated ----------
const simulated = {
  provider: 'simulated',
  publicConfig: () => ({ provider: 'simulated' }),
  async createIntent() {
    return { gatewayOrderId: `sim_${crypto.randomBytes(6).toString('hex')}`, checkout: { provider: 'simulated' } };
  },
  async verify(_order, body) {
    if (body?.simulateFailure) return { ok: false, reason: 'Simulated failure' };
    const method = METHOD_MAP[body?.method] || 'upi';
    return { ok: true, method, paymentId: `simpay_${Date.now().toString(36)}`, reference: `SIM-${Date.now().toString(36).toUpperCase()}` };
  },
  async refund() {
    return { ok: true, refundId: `simrfnd_${Date.now().toString(36)}` };
  },
};

// ---------- razorpay ----------
function makeRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

  return {
    provider: 'razorpay',
    publicConfig: () => ({
      provider: 'razorpay',
      keyId,
      testMode: keyId.startsWith('rzp_test_'),
      brandName: process.env.BRAND_NAME || 'EventSphere',
    }),

    async createIntent(order, { event } = {}) {
      const rzpOrder = await rzp.orders.create({
        amount: toMinorUnits(order.total),
        currency: order.currency || 'INR',
        receipt: String(order._id),
        notes: { orderId: String(order._id), eventId: String(order.event), event: (event?.title || '').slice(0, 250) },
      });
      return {
        gatewayOrderId: rzpOrder.id,
        checkout: {
          provider: 'razorpay',
          key: keyId,
          orderId: rzpOrder.id,
          amount: rzpOrder.amount,
          currency: rzpOrder.currency,
          name: process.env.BRAND_NAME || 'EventSphere',
          description: event?.title || 'Event tickets',
          prefill: { name: order.buyer?.name, email: order.buyer?.email, contact: order.buyer?.phone },
          notes: { orderId: String(order._id) },
        },
      };
    },

    async verify(order, body) {
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body || {};
      if (!orderId || !paymentId || !signature) return { ok: false, reason: 'Missing payment details' };
      if (orderId !== order.gateway?.orderId) return { ok: false, reason: 'Payment does not belong to this order' };
      if (!verifyCheckoutSignature({ orderId, paymentId, signature, secret: keySecret })) {
        return { ok: false, reason: 'Payment signature could not be verified' };
      }
      return this.confirmPayment(order, paymentId);
    },

    // Double-check with Razorpay's API: right order, right amount, money actually captured
    async confirmPayment(order, paymentId) {
      let payment = await rzp.payments.fetch(paymentId);
      if (payment.order_id !== order.gateway?.orderId) return { ok: false, reason: 'Payment order mismatch' };
      if (Number(payment.amount) !== toMinorUnits(order.total)) return { ok: false, reason: 'Paid amount does not match the order total' };
      if (payment.status === 'authorized') {
        // Only needed if auto-capture is turned off in the Razorpay dashboard
        payment = await rzp.payments.capture(paymentId, payment.amount, payment.currency);
      }
      if (payment.status !== 'captured') return { ok: false, reason: `Payment is ${payment.status}` };
      return {
        ok: true,
        paymentId,
        method: METHOD_MAP[payment.method] || 'other',
        reference: payment.acquirer_data?.rrn || payment.acquirer_data?.bank_transaction_id || paymentId,
      };
    },

    async refund(order) {
      if (!order.gateway?.paymentId) return { ok: false };
      const r = await rzp.payments.refund(order.gateway.paymentId, {
        amount: toMinorUnits(order.total),
        notes: { orderId: String(order._id), reason: 'Tickets could not be issued' },
      });
      return { ok: true, refundId: r.id };
    },
  };
}

let cached;
export function getGateway() {
  if (cached) return cached;
  const mode = (process.env.PAYMENT_MODE || 'simulated').toLowerCase();
  if (mode === 'razorpay') {
    cached = makeRazorpay();
    if (!cached) {
      console.warn('PAYMENT_MODE=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing - using simulated payments.');
      cached = simulated;
    }
  } else {
    cached = simulated;
  }
  console.log(`Payments: ${cached.provider}${cached.provider === 'razorpay' && cached.publicConfig().testMode ? ' (test mode)' : ''}`);
  return cached;
}

export function calculateFees(subtotal) {
  const pct = Number(process.env.PLATFORM_FEE_PERCENT || 2.5);
  const platformFee = subtotal > 0 ? Math.round(subtotal * pct) / 100 : 0;
  return { platformFee, total: Math.round((subtotal + platformFee) * 100) / 100 };
}
