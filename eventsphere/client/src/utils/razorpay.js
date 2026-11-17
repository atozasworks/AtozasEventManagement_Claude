// Razorpay Standard Checkout: the buyer pays inside Razorpay's own secure window (UPI, cards, net banking,
// wallets, EMI). Card and UPI details never touch EventSphere.

let loading;
function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  loading ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => {
      loading = null; // let the next click try again
      reject(new Error('The payment window could not be loaded. Check your internet connection and try again.'));
    };
    document.body.appendChild(s);
  });
  return loading;
}

/**
 * Opens the payment window for an order created on the server (`checkout` comes from POST /api/orders).
 * Resolves with Razorpay's proof of payment ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }),
 * which the server verifies before issuing tickets.
 * Rejects with { cancelled: true, message } when the buyer closes the window without paying.
 */
export async function openRazorpay(checkout) {
  await loadScript();
  return new Promise((resolve, reject) => {
    let done = false;
    let lastError = '';
    const rzp = new window.Razorpay({
      key: checkout.key,
      order_id: checkout.orderId,
      amount: checkout.amount,
      currency: checkout.currency,
      name: checkout.name,
      description: checkout.description,
      prefill: checkout.prefill,
      notes: checkout.notes,
      theme: { color: '#3a45c9' },
      handler: (proof) => {
        done = true;
        resolve(proof);
      },
      modal: {
        ondismiss: () => {
          if (!done) reject({ cancelled: true, message: lastError });
        },
      },
    });
    // A failed attempt keeps the window open so the buyer can try another method; remember why it failed
    rzp.on('payment.failed', (res) => { lastError = res?.error?.description || 'The payment did not go through'; });
    rzp.open();
  });
}

export const isTestKey = (key) => String(key || '').startsWith('rzp_test_');
