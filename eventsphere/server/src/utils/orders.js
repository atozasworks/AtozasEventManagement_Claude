// Shared definitions for reading orders and tickets consistently across reports and access checks.

// Orders that count as sales (a partly refunded order still has live tickets)
export const PAID_STATES = ['paid', 'partially_refunded'];

// What the organizer keeps from an order: ticket value after discount, minus anything refunded.
// Use inside a MongoDB $sum.
export const NET_REVENUE = { $subtract: ['$subtotal', { $ifNull: ['$refundedSubtotal', 0] }] };

// Tickets that still admit someone (cancelled/refunded tickets are kept for the record but give no access)
export const ACTIVE_TICKET = { status: { $ne: 'cancelled' } };

export const round2 = (n) => Math.round(n * 100) / 100;
