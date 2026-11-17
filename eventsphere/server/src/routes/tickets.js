import { Router } from 'express';
import Ticket from '../models/Ticket.js';
import { protect } from '../middleware/auth.js';
import Event from '../models/Event.js';
import { ah, HttpError, isObjectId } from '../utils/http.js';
import { loadEventForCheckin, loadOwnedEvent } from './events.js';
import { buildTicketsPdf } from '../services/ticketPdf.js';
import { sendTicketShared } from '../services/notifications.js';
import { getGateKey, signedQr, parseScan, verifyScan } from '../services/gateKeys.js';
import User from '../models/User.js';
import { ACTIVE_TICKET } from '../utils/orders.js';
import { refundTickets } from '../services/refunds.js';
import { notify } from '../services/notify.js';
import { sendCancelRequestToOrganizer, sendCancelDeclined } from '../services/notifications.js';
import { ticketCode, newClaimToken, sha256, cleanEmail, cleanName, isEmail } from '../utils/tickets.js';

const router = Router();

// Tickets that can be scanned at a physical gate
const ONSITE = { $in: ['in-person', 'both'] };

/**
 * My tickets. `relation` says how each one relates to me:
 *   holder          - it is in my account: I see the QR and can join online
 *   transferPending - I transferred it and the other person has not accepted yet (I can still cancel)
 *   givenAway       - I bought it, but it now sits in someone else's account
 * Only the holder gets the ticket code.
 */
router.get(
  '/mine',
  protect,
  ah(async (req, res) => {
    const me = req.user._id;
    const tickets = await Ticket.find({ $or: [{ user: me }, { purchaser: me }, { transferredBy: me, user: null }] })
      .select('+claimTokenHash')
      .sort({ createdAt: -1 })
      .populate('event', 'title slug startDate endDate format location coverImage modules status allowTransfers allowCancelRequests')
      .populate('order', 'user total');
    const out = [];
    for (const t of tickets) {
      const data = t.toJSON();
      const relation = String(t.user) === String(me) ? 'holder' : !t.user && String(t.transferredBy) === String(me) ? 'transferPending' : 'givenAway';
      data.relation = relation;
      data.awaitingClaim = Boolean(t.claimTokenHash); // someone else has been emailed a link to take this ticket
      data.transferCount = t.transfers.length;
      delete data.claimTokenHash;
      delete data.transfers;
      delete data.previousCodes;
      data.status = t.status || 'valid';
      data.iBought = String(t.purchaser || t.order?.user) === String(me); // refunds go to whoever paid
      data.paid = (t.order?.total || 0) > 0;
      data.cancelRequest = t.cancelRequest?.status ? { status: t.cancelRequest.status, note: t.cancelRequest.note } : null;
      data.order = t.order?._id;
      if (relation !== 'holder' || data.status === 'cancelled') delete data.code; // a cancelled ticket has no usable QR
      else if (t.event) data.qr = await signedQr(t.event._id, t); // signed text for the QR image
      out.push(data);
    }
    res.json(out);
  })
);

// ---------- Transfer a ticket to someone else ----------
const MAX_TRANSFERS = 5;

router.post(
  '/:id/transfer',
  protect,
  ah(async (req, res) => {
    const ticket = isObjectId(req.params.id) && (await Ticket.findOne({ _id: req.params.id, user: req.user._id }));
    if (!ticket) throw new HttpError(404, 'Ticket not found');
    const event = await Event.findById(ticket.event);
    if (!event) throw new HttpError(404, 'Event not found');

    const toName = cleanName(req.body.name);
    const toEmail = cleanEmail(req.body.email);
    if (toName.length < 2) throw new HttpError(400, 'Enter the name of the person receiving the ticket');
    if (!isEmail(toEmail)) throw new HttpError(400, 'Enter a valid email address for the person receiving the ticket');
    if (toEmail === cleanEmail(req.user.email)) throw new HttpError(400, 'This ticket is already yours');
    if (event.allowTransfers === false) throw new HttpError(403, 'The organizer has switched off ticket transfers for this event');
    if (event.status !== 'published') throw new HttpError(400, 'Tickets for this event can no longer be transferred');
    if (event.startDate <= new Date()) throw new HttpError(400, 'Tickets can only be transferred before the event starts');
    if (ticket.status === 'cancelled') throw new HttpError(400, 'This ticket was cancelled and cannot be transferred');
    if (ticket.checkedIn) throw new HttpError(400, 'This ticket has already been used at the gate');
    if (ticket.transfers.length >= MAX_TRANSFERS) throw new HttpError(400, `A ticket can be transferred at most ${MAX_TRANSFERS} times`);

    // A fresh code makes every earlier copy of the QR (screenshots, PDFs, printouts) worthless
    const token = newClaimToken();
    ticket.transfers.push({ fromUser: req.user._id, fromName: req.user.name, toName, toEmail });
    ticket.previousCodes.push(ticket.code);
    ticket.code = ticketCode();
    ticket.holderName = toName;
    ticket.holderEmail = toEmail;
    ticket.user = undefined;
    ticket.transferredBy = req.user._id;
    ticket.claimTokenHash = token.hash;
    await ticket.save();

    sendTicketShared({ event, tickets: [ticket], toName, toEmail, fromName: req.user.name, token: token.raw, reason: 'transfer' }).catch(() => {});
    res.json({ ok: true, toName, toEmail });
  })
);

// Changed your mind before the other person accepted? Take the ticket back.
router.post(
  '/:id/cancel-transfer',
  protect,
  ah(async (req, res) => {
    const ticket = isObjectId(req.params.id) && (await Ticket.findOne({ _id: req.params.id, transferredBy: req.user._id, user: null }));
    if (!ticket) throw new HttpError(404, 'This transfer has already been accepted or cancelled');
    if (ticket.checkedIn) throw new HttpError(400, 'This ticket has already been used at the gate');
    ticket.previousCodes.push(ticket.code);
    ticket.code = ticketCode(); // the copy that was emailed out stops working
    ticket.holderName = req.user.name;
    ticket.holderEmail = cleanEmail(req.user.email);
    ticket.user = req.user._id;
    ticket.transferredBy = undefined;
    ticket.claimTokenHash = undefined;
    await ticket.save();
    res.json({ ok: true });
  })
);

// ---------- Refund requests ----------
// The person who paid asks the organizer to cancel and refund one ticket. A free ticket is cancelled straight away.
async function loadBoughtTicket(req) {
  const ticket = isObjectId(req.params.id) && (await Ticket.findById(req.params.id).populate('order', 'user total buyer'));
  if (!ticket || String(ticket.purchaser || ticket.order?.user) !== String(req.user._id)) throw new HttpError(404, 'Ticket not found');
  return ticket;
}

router.post(
  '/:id/cancel-request',
  protect,
  ah(async (req, res) => {
    const ticket = await loadBoughtTicket(req);
    const event = await Event.findById(ticket.event);
    if (!event) throw new HttpError(404, 'Event not found');
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (ticket.status === 'cancelled') throw new HttpError(400, 'This ticket is already cancelled');
    if (ticket.checkedIn) throw new HttpError(400, 'This ticket has already been used at the gate');
    if (event.status !== 'published') throw new HttpError(400, 'This event is no longer open');
    if (event.startDate <= new Date()) throw new HttpError(400, 'A refund can only be requested before the event starts');

    const paid = (ticket.order?.total || 0) > 0;
    if (!paid) {
      // Nothing to refund: just free the seat for someone else
      await refundTickets({ orderId: ticket.order._id, ticketIds: [ticket._id], reason: reason || 'Cancelled by the attendee', by: req.user._id, kind: 'attendee-request' });
      return res.json({ ok: true, cancelled: true });
    }
    if (event.allowCancelRequests === false) throw new HttpError(403, 'The organizer is not accepting refund requests for this event');
    if (ticket.cancelRequest?.status === 'declined') throw new HttpError(400, 'The organizer has already declined a refund for this ticket');
    if (ticket.cancelRequest?.status !== 'requested') {
      ticket.cancelRequest = { status: 'requested', reason, at: new Date() };
      await ticket.save();
      const organizer = await User.findById(event.organizer).select('name email');
      if (organizer) sendCancelRequestToOrganizer({ organizer, event, ticket, order: ticket.order, reason }).catch(() => {});
      notify(event.organizer, {
        type: 'refund-request',
        event: event._id,
        title: `Refund request for ${event.title}`,
        body: `${ticket.order?.buyer?.name || 'A buyer'} asked to refund a ${ticket.ticketTypeName} ticket${reason ? `: "${reason}"` : ''}`,
        link: `/organize/${event._id}?tab=orders`,
      });
    }
    res.json({ ok: true, requested: true });
  })
);

router.post(
  '/:id/cancel-request/withdraw',
  protect,
  ah(async (req, res) => {
    const ticket = await loadBoughtTicket(req);
    if (ticket.cancelRequest?.status === 'requested') {
      ticket.cancelRequest = undefined;
      await ticket.save();
    }
    res.json({ ok: true });
  })
);

// Organizer says no (approving is a refund: POST /orders/:id/refund)
router.post(
  '/:id/cancel-request/decline',
  protect,
  ah(async (req, res) => {
    const ticket = isObjectId(req.params.id) && (await Ticket.findById(req.params.id).populate('order', 'buyer'));
    if (!ticket) throw new HttpError(404, 'Ticket not found');
    const event = await loadOwnedEvent(req, ticket.event);
    if (ticket.cancelRequest?.status !== 'requested') throw new HttpError(400, 'There is no open refund request for this ticket');
    const note = String(req.body.note || '').trim().slice(0, 300);
    ticket.cancelRequest.status = 'declined';
    ticket.cancelRequest.note = note;
    await ticket.save();
    if (ticket.order) sendCancelDeclined({ order: ticket.order, event, ticket, note }).catch(() => {});
    res.json({ ok: true });
  })
);

// "Add to my account" link from the email: moves the ticket(s) into the logged-in account
router.post(
  '/claim',
  protect,
  ah(async (req, res) => {
    const token = String(req.body.token || '');
    if (!token) throw new HttpError(400, 'This link is incomplete');
    const hash = sha256(token);
    const tickets = await Ticket.find({ claimTokenHash: hash }).populate('event', 'title slug');
    if (!tickets.length) throw new HttpError(400, 'This link has already been used or is no longer valid. Check "My Tickets" - the ticket may already be there.');
    await Ticket.updateMany({ claimTokenHash: hash }, { $set: { user: req.user._id }, $unset: { claimTokenHash: 1, transferredBy: 1 } });
    res.json({ ok: true, count: tickets.length, event: tickets[0].event });
  })
);

// Printable PDF for one ticket - for its holder, or the organizer of the event
router.get(
  '/:id/pdf',
  protect,
  ah(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new HttpError(404, 'Ticket not found');
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new HttpError(404, 'Ticket not found');
    const event = await Event.findById(ticket.event);
    if (!event) throw new HttpError(404, 'Event not found');
    const isHolder = String(ticket.user) === String(req.user._id);
    const isManager = String(event.organizer) === String(req.user._id) || req.user.role === 'admin';
    if (!isHolder && !isManager) throw new HttpError(404, 'Ticket not found');
    if (ticket.status === 'cancelled') throw new HttpError(400, 'This ticket was cancelled');
    const pdf = await buildTicketsPdf({ event, tickets: [ticket] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${event.slug}-${ticket.code}.pdf"`);
    res.send(pdf);
  })
);

// Everything the gate screen needs: which event this is, the caller's role and the live entry count.
// Open to the organizer, an admin and the event's check-in staff.
router.get(
  '/gate/:eventId',
  protect,
  ah(async (req, res) => {
    const event = await loadEventForCheckin(req, req.params.eventId);
    const [total, checkedIn] = await Promise.all([
      Ticket.countDocuments({ event: event._id, access: ONSITE, ...ACTIVE_TICKET }),
      Ticket.countDocuments({ event: event._id, access: ONSITE, checkedIn: true, ...ACTIVE_TICKET }),
    ]);
    const isManager = String(event.organizer) === String(req.user._id) || req.user.role === 'admin';
    res.json({
      event: {
        _id: event._id, title: event.title, slug: event.slug, status: event.status, format: event.format,
        startDate: event.startDate, endDate: event.endDate, timezone: event.timezone, location: event.location,
      },
      role: isManager ? 'manager' : 'staff',
      stats: { total, checkedIn },
      gateKey: (await getGateKey(event._id)).publicJwk, // public half only: checks signatures, cannot make them
    });
  })
);

// Gate manifest: lets the check-in app work OFFLINE at venues with poor connectivity
router.get(
  '/manifest/:eventId',
  protect,
  ah(async (req, res) => {
    const event = await loadEventForCheckin(req, req.params.eventId);
    const tickets = await Ticket.find({ event: event._id, access: ONSITE, ...ACTIVE_TICKET }).select(
      'code holderName ticketTypeName checkedIn checkedInAt'
    );
    // Codes replaced by a transfer: their old QR still carries a valid signature, so gates must know to refuse them
    const revoked = await Ticket.distinct('previousCodes', { event: event._id });
    // Refunded tickets: their QR also still carries a valid signature
    const cancelled = await Ticket.distinct('code', { event: event._id, status: 'cancelled' });
    res.json({
      eventId: event._id, title: event.title, downloadedAt: new Date(), tickets, revoked, cancelled,
      gateKey: (await getGateKey(event._id)).publicJwk,
    });
  })
);

const REPLACED = 'This ticket was transferred and has a new QR code. Ask the guest for their latest ticket.';

// `raw` is what the scanner read: a signed QR, or a plain code that was typed
async function checkInOne(eventId, raw, gate, by, at = new Date()) {
  const scan = parseScan(raw);
  const normalized = scan.code;
  if (scan.signed) {
    if (scan.eventId !== String(eventId)) return { code: normalized, result: 'invalid', message: 'This ticket is for a different event' };
    if (!(await verifyScan(scan))) return { code: normalized, result: 'invalid', message: 'This QR code is not a genuine ticket' };
  }
  const ticket = await Ticket.findOne({ event: eventId, code: normalized });
  if (!ticket) {
    const replaced = await Ticket.exists({ event: eventId, previousCodes: normalized });
    return { code: normalized, result: 'invalid', message: replaced ? REPLACED : 'Ticket not found for this event' };
  }
  if (ticket.status === 'cancelled') return { code: normalized, result: 'invalid', message: 'This ticket was cancelled and refunded', holderName: ticket.holderName };
  if (ticket.access === 'virtual') return { code: normalized, result: 'invalid', message: 'Virtual-only ticket', holderName: ticket.holderName };
  // Atomic: only the first scan wins (prevents duplicate entry at multiple gates)
  const updated = await Ticket.findOneAndUpdate(
    { _id: ticket._id, checkedIn: false },
    { checkedIn: true, checkedInAt: at, checkInGate: gate, checkedInBy: by },
    { new: true }
  );
  if (!updated) {
    return {
      code: normalized, result: 'duplicate', holderName: ticket.holderName, ticketTypeName: ticket.ticketTypeName,
      message: `Already checked in at ${ticket.checkedInAt?.toISOString()}${ticket.checkInGate ? ` (${ticket.checkInGate})` : ''}`,
    };
  }
  return { code: normalized, result: 'ok', ticketId: updated._id, holderName: updated.holderName, ticketTypeName: updated.ticketTypeName };
}

router.post(
  '/checkin',
  protect,
  ah(async (req, res) => {
    const { eventId, code, gate = 'Gate 1' } = req.body;
    if (!code) throw new HttpError(400, 'Ticket code is required');
    const event = await loadEventForCheckin(req, eventId);
    res.json(await checkInOne(event._id, code, String(gate).slice(0, 60), req.user._id));
  })
);

// Sync scans recorded offline
router.post(
  '/checkin/sync',
  protect,
  ah(async (req, res) => {
    const { eventId, scans = [] } = req.body;
    const event = await loadEventForCheckin(req, eventId);
    const results = [];
    for (const s of scans.slice(0, 5000)) {
      results.push(await checkInOne(event._id, s.code, String(s.gate || 'Offline gate').slice(0, 60), req.user._id, s.at ? new Date(s.at) : new Date()));
    }
    res.json({ results });
  })
);

// Scanned the wrong person? Put the ticket back to "not entered"
router.post(
  '/:id/undo-checkin',
  protect,
  ah(async (req, res) => {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) throw new HttpError(404, 'Ticket not found');
    await loadEventForCheckin(req, ticket.event);
    ticket.checkedIn = false;
    ticket.checkedInAt = undefined;
    ticket.checkInGate = undefined;
    ticket.checkedInBy = undefined;
    await ticket.save();
    res.json(ticket);
  })
);

export default router;
