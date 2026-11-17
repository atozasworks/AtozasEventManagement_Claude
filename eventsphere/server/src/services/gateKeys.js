import crypto from 'crypto';
import Event from '../models/Event.js';

/**
 * Signed ticket QR codes - lets a gate device check that a ticket is genuine with NO internet
 * and NO downloaded ticket list.
 *
 * Each event has its own key pair (ECDSA P-256). The private key never leaves the server and signs
 * every ticket QR. Gate devices only ever receive the PUBLIC key: it can check a signature but
 * cannot create one, so a lost or dishonest gate phone cannot be used to forge tickets.
 *
 * QR text (141 characters, capitals and digits only so handheld scanners type it reliably):
 *   ES1 + EVENT ID (24) + ACCESS (P = may enter the venue, V = online only) + CODE (10) + SIGNATURE (103)
 * The signature covers everything before it. A plain "ES-XXXXXXXXXX" code still works when typed.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SIGNED = /^ES1([0-9A-F]{24})([PV])([0-9A-Z]{10})([A-Z2-7]{103})$/;

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text) {
    const idx = B32.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const cache = new Map(); // event id -> { privateKey, publicKey, publicJwk }

/** The event's signing keys, created the first time they are needed. */
export async function getGateKey(eventId) {
  const id = String(eventId);
  if (cache.has(id)) return cache.get(id);

  let event = await Event.findById(id).select('+gateKey.privateKey');
  if (!event) throw new Error('Event not found');
  if (!event.gateKey?.privateKey) {
    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const fresh = { publicJwk: pair.publicKey.export({ format: 'jwk' }), privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) };
    // Only the first writer wins, so two server instances can never end up with different keys
    await Event.updateOne({ _id: id, 'gateKey.privateKey': { $exists: false } }, { $set: { gateKey: fresh } });
    event = await Event.findById(id).select('+gateKey.privateKey');
  }
  const keys = {
    privateKey: crypto.createPrivateKey(event.gateKey.privateKey),
    publicKey: crypto.createPublicKey({ key: event.gateKey.publicJwk, format: 'jwk' }),
    publicJwk: event.gateKey.publicJwk,
  };
  cache.set(id, keys);
  return keys;
}

/** Text to put in a ticket's QR code. */
export async function signedQr(eventId, ticket) {
  const body = String(ticket.code || '').replace(/^ES-/, '');
  if (!/^[0-9A-Z]{10}$/.test(body)) return ticket.code; // unexpected code shape: fall back to the plain code
  const { privateKey } = await getGateKey(eventId);
  const message = `ES1${String(eventId).toUpperCase()}${ticket.access === 'virtual' ? 'V' : 'P'}${body}`;
  const signature = crypto.sign('sha256', Buffer.from(message), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return message + base32Encode(signature);
}

/** Understands both a signed QR and a plain typed code. */
export function parseScan(raw) {
  const text = String(raw || '').trim().toUpperCase();
  const m = text.match(SIGNED);
  if (!m) return { signed: false, code: text };
  return { signed: true, eventId: m[1].toLowerCase(), access: m[2], code: `ES-${m[3]}`, message: text.slice(0, 38), signature: m[4] };
}

export async function verifyScan(scan) {
  if (!scan.signed) return false;
  try {
    const { publicKey } = await getGateKey(scan.eventId);
    const signature = base32Decode(scan.signature);
    return Boolean(signature) && crypto.verify('sha256', Buffer.from(scan.message), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    return false;
  }
}
