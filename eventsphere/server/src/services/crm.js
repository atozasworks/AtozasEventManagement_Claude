import Event from '../models/Event.js';

/**
 * CRM / MarTech sync. Each paid registration is pushed as a lead with its
 * attribution data. Today this posts to a generic webhook (works with
 * Zapier, Make, n8n, HubSpot workflows, Salesforce flows). Native
 * HubSpot / Salesforce / Zoho adapters can be added per provider.
 */
export async function pushRegistrationToCRM(event, order) {
  const { crmProvider, webhookUrl } = event.integrations || {};
  if (!event.modules?.crm || !crmProvider || crmProvider === 'none' || !webhookUrl) return;

  const payload = {
    type: 'event.registration',
    provider: crmProvider,
    event: { id: event._id, title: event.title, startDate: event.startDate },
    contact: order.buyer,
    tickets: order.items.map((i) => ({ type: i.name, qty: i.qty, price: i.price })),
    total: order.total,
    currency: order.currency,
    attribution: order.attribution,
    answers: Object.fromEntries(order.answers || []),
    at: new Date().toISOString(),
  };

  let status;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    status = res.ok ? 'ok' : `http ${res.status}`;
  } catch (err) {
    status = `error: ${err.message}`;
  }
  await Event.updateOne(
    { _id: event._id },
    { 'integrations.lastSyncAt': new Date(), 'integrations.lastSyncStatus': status }
  );
}
