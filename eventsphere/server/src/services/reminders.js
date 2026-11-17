import Event from '../models/Event.js';
import Ticket from '../models/Ticket.js';
import '../models/Order.js'; // registers the model that tickets are populated with
import { sendEventReminder } from './notifications.js';
import { ACTIVE_TICKET } from '../utils/orders.js';

/**
 * Event reminders: one roughly a day before the start and one about an hour before.
 * A sweep runs every few minutes. Each event is "claimed" with an atomic update, so
 * a reminder goes out once even if several server instances are running.
 *
 * An event first seen less than an hour before it starts only gets the 1-hour reminder.
 * Set REMINDERS_ENABLED=false in .env to switch the scheduler off.
 */
const HOUR = 60 * 60 * 1000;
const SWEEP_EVERY = 5 * 60 * 1000;
const BATCH = 20;

async function remindEvent(event, kind) {
  const tickets = await Ticket.find({ event: event._id, ...ACTIVE_TICKET }).populate('order', 'buyer');
  // One message per person, not one per ticket. Each ticket's holder is reminded, so guests named
  // at checkout and people who received a transfer hear about it too. WhatsApp goes to the buyer's number.
  const byPerson = new Map();
  for (const t of tickets) {
    const buyer = t.order?.buyer || {};
    const email = t.holderEmail || buyer.email;
    const key = email || String(t._id);
    if (!byPerson.has(key)) {
      const isBuyer = email && email === String(buyer.email || '').toLowerCase();
      byPerson.set(key, { buyer: { name: t.holderName || buyer.name, email, phone: isBuyer ? buyer.phone : undefined }, tickets: [] });
    }
    byPerson.get(key).tickets.push(t);
  }
  const groups = [...byPerson.values()];
  for (let i = 0; i < groups.length; i += BATCH) {
    await Promise.allSettled(groups.slice(i, i + BATCH).map((g) => sendEventReminder({ event, buyer: g.buyer, tickets: g.tickets, kind })));
  }
  return { event: event.title, kind, recipients: groups.length };
}

async function claimAndSend(kind, field, from, to, now) {
  const sent = [];
  for (;;) {
    const event = await Event.findOneAndUpdate(
      { status: 'published', startDate: { $gt: from, $lte: to }, [`reminders.${field}`]: null },
      { $set: { [`reminders.${field}`]: now } },
      { new: true }
    );
    if (!event) break;
    sent.push(await remindEvent(event, kind));
  }
  return sent;
}

export async function runReminderSweep(now = new Date()) {
  const t = now.getTime();
  const hour = await claimAndSend('hour', 'sent1h', now, new Date(t + HOUR), now);
  const day = await claimAndSend('day', 'sent24h', new Date(t + HOUR), new Date(t + 24 * HOUR), now);
  return [...hour, ...day];
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const sent = await runReminderSweep();
    for (const s of sent) console.log(`Reminder (${s.kind}) sent for "${s.event}" to ${s.recipients} ${s.recipients === 1 ? 'person' : 'people'}`);
  } catch (err) {
    console.error('Reminder sweep failed:', err.message);
  } finally {
    running = false;
  }
}

export function startReminderScheduler() {
  if (String(process.env.REMINDERS_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('Reminders: disabled (REMINDERS_ENABLED=false)');
    return;
  }
  setTimeout(tick, 10 * 1000).unref();
  setInterval(tick, SWEEP_EVERY).unref();
  console.log('Reminders: scheduler running (24 hours and 1 hour before each event)');
}
