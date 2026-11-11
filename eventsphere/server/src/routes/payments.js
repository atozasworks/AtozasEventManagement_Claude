import express, { Router } from 'express';
import Order from '../models/Order.js';
import { ah } from '../utils/http.js';
import { getGateway, verifyWebhookSignature } from '../services/payments.js';
import { finalizePaidOrder } from './orders.js';

const router = Router();

// Public payment settings for the browser (key id only - never the secret)
router.get('/config', (_req, res) => res.json(getGateway().publicConfig()));

/**
 * Razorpay webhook - the safety net. If the buyer pays but closes the tab before
 * the browser callback reaches us, Razorpay still tells us and tickets get issued.
 * Dashboard -> Settings -> Webhooks -> URL: https://<your-domain>/api/payments/razorpay/webhook
 * Events: payment.captured, payment.failed, order.paid, refund.processed
 */
router.post(
  '/razorpay/webhook',
  express.raw({ type: 'application/json' }),
  ah(async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    if (!secret) return res.status(503).json({ message: 'Webhook secret not configured' });
    if (!signature || !verifyWebhookSignature({ rawBody: req.body, signature, secret })) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    const evt = JSON.parse(req.body.toString('utf8'));
    const payment = evt.payload?.payment?.entity;
    const gateway = getGateway();

    try {
      if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && payment?.order_id) {
        const order = await Order.findOne({ 'gateway.orderId': payment.order_id });
        if (order && ['pending', 'failed'].includes(order.paymentStatus) && gateway.confirmPayment) {
          const result = await gateway.confirmPayment(order, payment.id);
          if (result.ok) await finalizePaidOrder(order._id, result);
        }
      } else if (evt.event === 'payment.failed' && payment?.order_id) {
        await Order.updateOne(
          { 'gateway.orderId': payment.order_id, paymentStatus: 'pending' },
          { paymentStatus: 'failed', 'gateway.failureReason': payment.error_description || 'Payment failed' }
        );
      } else if (evt.event === 'refund.processed') {
        const refund = evt.payload?.refund?.entity;
        if (refund?.payment_id) {
          await Order.updateOne(
            { 'gateway.paymentId': refund.payment_id },
            { paymentStatus: 'refunded', 'gateway.refundId': refund.id }
          );
        }
      }
    } catch (err) {
      // Log, but still answer 200 so Razorpay doesn't retry forever for business errors (e.g. sold out -> refunded)
      console.error(`Webhook ${evt.event} handling error:`, err.message);
    }
    res.json({ ok: true });
  })
);

export default router;
