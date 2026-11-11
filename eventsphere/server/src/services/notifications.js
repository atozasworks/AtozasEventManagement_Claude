/**
 * Notification service - WhatsApp first (India), email later.
 * Without WHATSAPP_API_URL configured, messages are logged to the console
 * so the flow can be tested end-to-end locally.
 */

async function sendWhatsApp(phone, text) {
  const url = process.env.WHATSAPP_API_URL;
  if (!url || !phone) {
    console.log(`[whatsapp:dev] to=${phone || 'n/a'} :: ${text}`);
    return { delivered: false, logged: true };
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN || ''}`,
      },
      body: JSON.stringify({ to: phone, type: 'text', text: { body: text } }),
    });
    return { delivered: res.ok };
  } catch (err) {
    console.error('WhatsApp send failed:', err.message);
    return { delivered: false };
  }
}

export async function sendTicketConfirmation({ order, event, tickets }) {
  const codes = tickets.map((t) => t.code).join(', ');
  const text =
    `Hi ${order.buyer?.name || 'there'}! You're booked for "${event.title}". ` +
    `${tickets.length} ticket(s): ${codes}. Show the QR in "My Tickets" at the entry gate.`;
  return sendWhatsApp(order.buyer?.phone, text);
}
