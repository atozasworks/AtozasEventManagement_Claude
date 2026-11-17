import { sendEmail, renderEmail } from './email.js';
import { buildTicketsPdf } from './ticketPdf.js';
import { brandName, clientUrl, formatEventDate, locationLine } from '../utils/format.js';

/**
 * Notification service - email plus WhatsApp (India-first).
 * Without WHATSAPP_API_URL / SMTP_HOST configured, messages are logged to the
 * console (and emails saved to server/.outbox) so every flow can be tested locally.
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

const hasOnline = (event, tickets) => ['virtual', 'hybrid'].includes(event.format) && tickets.some((t) => t.access !== 'in-person');
const hasOnsite = (event, tickets) => event.format !== 'virtual' && tickets.some((t) => t.access !== 'virtual');

// ---------- Ticket confirmation (email with PDF + WhatsApp) ----------
export async function sendTicketConfirmation({ order, event, tickets }) {
  const name = order.buyer?.name || 'there';
  const codes = tickets.map((t) => t.code).join(', ');
  const when = formatEventDate(event.startDate, event.timezone);
  const where = locationLine(event);
  const ticketsUrl = `${clientUrl()}/tickets`;
  const online = hasOnline(event, tickets);
  const onsite = hasOnsite(event, tickets);

  const whatsapp = sendWhatsApp(
    order.buyer?.phone,
    `Hi ${name}! You're booked for "${event.title}". ` +
      `${tickets.length} ticket(s): ${codes}. Show the QR in "My Tickets" at the entry gate.`
  );

  const lines = [
    `Hi ${name}, your booking for "${event.title}" is confirmed.`,
    `When: ${when}`,
    `Where: ${where}`,
    `Tickets (${tickets.length}): ${tickets.map((t) => `${t.ticketTypeName} ${t.code}`).join(', ')}`,
    order.discount?.amount > 0 ? `${order.discount.label}: you saved ${order.currency} ${order.discount.amount.toFixed(2)}` : null,
    order.total > 0 ? `Amount paid: ${order.currency} ${order.total.toFixed(2)} (reference ${order.paymentRef || '-'})` : 'This is a free registration.',
    onsite ? 'Your tickets are attached as a PDF. Show the QR code on your phone or a printout at the entry gate.' : 'Your tickets are attached as a PDF for your records.',
    online ? `Join online when the event starts: ${clientUrl()}/live/${event._id}` : null,
  ].filter(Boolean);

  let attachments;
  try {
    const pdf = await buildTicketsPdf({ event, tickets });
    attachments = [{ filename: `${event.slug || 'event'}-tickets.pdf`, content: pdf, contentType: 'application/pdf' }];
  } catch (err) {
    console.error('Ticket PDF could not be generated:', err.message);
  }

  const email = sendEmail({
    to: order.buyer?.email,
    subject: `Your tickets for ${event.title}`,
    text: `${lines.join('\n')}\n\nView your tickets: ${ticketsUrl}`,
    html: renderEmail({ heading: "You're in!", paragraphs: lines, button: { label: 'View my tickets', url: ticketsUrl } }),
    attachments,
  });

  const [w, e] = await Promise.all([whatsapp, email]);
  return { whatsapp: w, email: e };
}

// ---------- Event reminder ("tomorrow" / "in about an hour") ----------
export async function sendEventReminder({ event, buyer, tickets, kind }) {
  const name = buyer?.name || 'there';
  const when = formatEventDate(event.startDate, event.timezone);
  const soon = kind === 'hour' ? 'starts in about an hour' : 'is tomorrow';
  const online = hasOnline(event, tickets);
  const onsite = hasOnsite(event, tickets);
  const liveUrl = `${clientUrl()}/live/${event._id}`;
  const ticketsUrl = `${clientUrl()}/tickets`;

  const lines = [
    `Hi ${name}, a reminder that "${event.title}" ${soon}.`,
    `When: ${when}`,
    `Where: ${locationLine(event)}`,
    `You have ${tickets.length} ticket${tickets.length === 1 ? '' : 's'} for this event.`,
    onsite ? 'Keep your QR code ready at the entry gate - it is in "My Tickets" and in the PDF we emailed you.' : null,
    online ? `Join online: ${liveUrl}` : null,
  ].filter(Boolean);

  const button = online && !onsite ? { label: 'Join online', url: liveUrl } : { label: 'View my tickets', url: ticketsUrl };
  const [w, e] = await Promise.all([
    sendWhatsApp(buyer?.phone, `Reminder: "${event.title}" ${soon} (${when}). ${online && !onsite ? `Join: ${liveUrl}` : `Your QR is in My Tickets: ${ticketsUrl}`}`),
    sendEmail({
      to: buyer?.email,
      subject: `Reminder: ${event.title} ${soon}`,
      text: `${lines.join('\n')}\n\n${button.label}: ${button.url}`,
      html: renderEmail({ heading: kind === 'hour' ? 'Starting soon' : 'See you tomorrow', paragraphs: lines, button }),
    }),
  ]);
  return { whatsapp: w, email: e };
}

// ---------- A ticket for someone other than the buyer (named at checkout, or transferred) ----------
export async function sendTicketShared({ event, tickets, toName, toEmail, fromName, token, reason }) {
  const claimUrl = `${clientUrl()}/claim?token=${token}`;
  const many = tickets.length > 1;
  const online = hasOnline(event, tickets);
  const onsite = hasOnsite(event, tickets);
  const lines = [
    reason === 'transfer'
      ? `Hi ${toName}, ${fromName} has transferred ${many ? `${tickets.length} tickets` : 'a ticket'} for "${event.title}" to you.`
      : `Hi ${toName}, ${fromName} booked ${many ? `${tickets.length} tickets` : 'a ticket'} for you for "${event.title}".`,
    `When: ${formatEventDate(event.startDate, event.timezone)}`,
    `Where: ${locationLine(event)}`,
    `Ticket${many ? 's' : ''}: ${tickets.map((t) => `${t.ticketTypeName} ${t.code}`).join(', ')}`,
    onsite ? 'Your ticket is attached as a PDF. Show the QR code on your phone or a printout at the entry gate.' : 'Your ticket is attached as a PDF for your records.',
    online
      ? 'To join online, add the ticket to your own account with the button below (log in or sign up first).'
      : 'You can also add the ticket to your own account with the button below, so it shows under "My Tickets".',
  ];

  let attachments;
  try {
    const pdf = await buildTicketsPdf({ event, tickets });
    attachments = [{ filename: `${event.slug || 'event'}-ticket${many ? 's' : ''}.pdf`, content: pdf, contentType: 'application/pdf' }];
  } catch (err) {
    console.error('Ticket PDF could not be generated:', err.message);
  }

  return sendEmail({
    to: toEmail,
    subject: `Your ticket${many ? 's' : ''} for ${event.title}`,
    text: `${lines.join('\n')}\n\nAdd to my account: ${claimUrl}`,
    html: renderEmail({ heading: reason === 'transfer' ? 'A ticket was transferred to you' : 'You have a ticket', paragraphs: lines, button: { label: 'Add to my account', url: claimUrl } }),
    attachments,
  });
}

// ---------- Refunds and cancellations ----------
const moneyText = (order, amount) => `${order.currency} ${Number(amount).toFixed(2)}`;

export async function sendRefundNotice({ order, event, tickets, amount, reason, kind }) {
  const name = order.buyer?.name || 'there';
  const many = tickets.length > 1;
  const what = `${tickets.length} ticket${many ? 's' : ''} (${tickets.map((t) => t.ticketTypeName).join(', ')})`;
  const opening =
    kind === 'event-cancelled'
      ? `Hi ${name}, we are sorry: "${event.title}" has been cancelled by the organizer.`
      : `Hi ${name}, ${what} for "${event.title}" ${many ? 'have' : 'has'} been cancelled.`;
  const lines = [
    opening,
    kind === 'event-cancelled' ? `Your ${what} ${many ? 'are' : 'is'} no longer valid.` : null,
    amount > 0
      ? `A refund of ${moneyText(order, amount)} is on its way to the payment method you used. Banks usually show it within 5-7 working days.`
      : 'Nothing was charged for this booking, so there is nothing to refund.',
    reason && kind !== 'event-cancelled' ? `Reason: ${reason}` : null,
    `Order reference: ${String(order._id).slice(-8).toUpperCase()}`,
  ].filter(Boolean);
  const subject = kind === 'event-cancelled' ? `${event.title} has been cancelled` : `Your ticket${many ? 's' : ''} for ${event.title} ${many ? 'were' : 'was'} cancelled`;

  const sends = [
    sendEmail({ to: order.buyer?.email, subject, text: lines.join('\n'), html: renderEmail({ heading: kind === 'event-cancelled' ? 'Event cancelled' : 'Ticket cancelled', paragraphs: lines }) }),
    sendWhatsApp(order.buyer?.phone, `${opening} ${amount > 0 ? `Refund of ${moneyText(order, amount)} is on its way.` : ''}`.trim()),
  ];
  // Guests who hold one of these tickets (named at checkout, or received by transfer) are told too
  const buyerEmail = String(order.buyer?.email || '').toLowerCase();
  const guests = new Map();
  for (const t of tickets) if (t.holderEmail && t.holderEmail !== buyerEmail) guests.set(t.holderEmail, t.holderName);
  for (const [email, guestName] of guests) {
    const guestLines = [
      kind === 'event-cancelled'
        ? `Hi ${guestName}, we are sorry: "${event.title}" has been cancelled by the organizer.`
        : `Hi ${guestName}, your ticket for "${event.title}" has been cancelled.`,
      'The ticket is no longer valid. Any refund goes to the person who paid for it.',
    ];
    sends.push(sendEmail({ to: email, subject, text: guestLines.join('\n'), html: renderEmail({ heading: 'Ticket cancelled', paragraphs: guestLines }) }));
  }
  return Promise.all(sends);
}

export function sendCancelRequestToOrganizer({ organizer, event, ticket, order, reason }) {
  const url = `${clientUrl()}/organize/${event._id}`;
  const lines = [
    `Hi ${organizer.name}, ${order.buyer?.name || 'A buyer'} (${order.buyer?.email}) has asked for a refund of a ticket for "${event.title}".`,
    `Ticket: ${ticket.ticketTypeName}, held by ${ticket.holderName}`,
    reason ? `Their reason: ${reason}` : 'They did not give a reason.',
    'Open the "Orders & refunds" tab of the event to approve or decline.',
  ];
  return sendEmail({
    to: organizer.email,
    subject: `Refund request for ${event.title}`,
    text: `${lines.join('\n')}\n\nOpen the event dashboard: ${url}`,
    html: renderEmail({ heading: 'Refund request', paragraphs: lines, button: { label: 'Open the event dashboard', url } }),
  });
}

export function sendCancelDeclined({ order, event, ticket, note }) {
  const lines = [
    `Hi ${order.buyer?.name || 'there'}, the organizer of "${event.title}" has declined your refund request for the ${ticket.ticketTypeName} ticket.`,
    note ? `Their message: ${note}` : null,
    event.allowTransfers !== false ? 'Your ticket is still valid. If you cannot attend, you can transfer it to someone else from "My Tickets" until the event starts.' : 'Your ticket is still valid.',
  ].filter(Boolean);
  return sendEmail({
    to: order.buyer?.email,
    subject: `About your refund request for ${event.title}`,
    text: lines.join('\n'),
    html: renderEmail({ heading: 'Refund request declined', paragraphs: lines, button: { label: 'View my tickets', url: `${clientUrl()}/tickets` } }),
  });
}

// ---------- Vendor marketplace (booking, quote and visit requests and their answers) ----------
export function sendVendorMail({ to, subject, heading, lines, button }) {
  return sendEmail({
    to,
    subject,
    text: `${lines.join('\n')}\n\n${button.label}: ${button.url}`,
    html: renderEmail({ heading, paragraphs: lines, button }),
  });
}

// ---------- Platform moderation ----------
export function sendTakedownNotice({ organizer, event, reason }) {
  const lines = [
    `Hi ${organizer.name}, your event "${event.title}" has been taken down by the ${brandName()} team and is no longer visible or on sale.`,
    `Reason: ${reason}`,
    'Tickets already sold remain valid. You can still open the event dashboard, edit the event and refund orders, but you cannot publish it again until our team restores it.',
    'If you think this is a mistake, reply to this email or contact support.',
  ];
  return sendEmail({
    to: organizer.email,
    subject: `Your event "${event.title}" was taken down`,
    text: lines.join('\n'),
    html: renderEmail({ heading: 'Event taken down', paragraphs: lines, button: { label: 'Open the event dashboard', url: `${clientUrl()}/organize/${event._id}` } }),
  });
}

// ---------- Gate staff invitation ----------
export function sendStaffInvite({ person, event, invitedBy }) {
  const url = `${clientUrl()}/gate/${event._id}`;
  const lines = [
    `Hi ${person.name}, ${invitedBy?.organizationName || invitedBy?.name || 'The organizer'} added you to the check-in team for "${event.title}".`,
    `When: ${formatEventDate(event.startDate, event.timezone)}`,
    `Where: ${locationLine(event)}`,
    `Log in with ${person.email} and open the gate scanner on your phone. You can scan tickets with the camera, and it keeps working if the venue internet drops.`,
  ];
  return sendEmail({
    to: person.email,
    subject: `You are on the check-in team for ${event.title}`,
    text: `${lines.join('\n')}\n\nOpen the gate scanner: ${url}`,
    html: renderEmail({ heading: 'You are on the check-in team', paragraphs: lines, button: { label: 'Open the gate scanner', url } }),
  });
}

// ---------- Account emails ----------
export function sendVerificationEmail(user, token) {
  const url = `${clientUrl()}/verify-email?token=${token}`;
  const lines = [`Hi ${user.name}, please confirm that ${user.email} is your email address.`, 'This link works for 24 hours.'];
  return sendEmail({
    to: user.email,
    subject: `Confirm your email for ${brandName()}`,
    text: `${lines.join('\n')}\n\nConfirm email: ${url}`,
    html: renderEmail({ heading: 'Confirm your email', paragraphs: lines, button: { label: 'Confirm email', url } }),
  });
}

export function sendPasswordResetEmail(user, token) {
  const url = `${clientUrl()}/reset-password?token=${token}`;
  const lines = [
    `Hi ${user.name}, we received a request to reset the password for your ${brandName()} account.`,
    'This link works for 1 hour and can be used once.',
  ];
  return sendEmail({
    to: user.email,
    subject: `Reset your ${brandName()} password`,
    text: `${lines.join('\n')}\n\nChoose a new password: ${url}\n\nIf you did not ask for this, ignore this email - your password stays the same.`,
    html: renderEmail({
      heading: 'Reset your password',
      paragraphs: lines,
      button: { label: 'Choose a new password', url },
      footnote: 'If you did not ask for this, ignore this email - your password stays the same.',
    }),
  });
}
