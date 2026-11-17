/**
 * Signed ticket QR codes, gate side.
 *
 * QR text: ES1 + EVENT ID (24) + ACCESS (P = may enter, V = online only) + CODE (10) + SIGNATURE (103).
 * The server signs it with the event's private key; this file checks it with the event's PUBLIC key,
 * which is safe to keep on gate phones because it cannot be used to create tickets.
 * That lets a gate confirm a ticket is genuine with no internet and no downloaded ticket list.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SIGNED = /^ES1([0-9A-F]{24})([PV])([0-9A-Z]{10})([A-Z2-7]{103})$/;

function base32Decode(text) {
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
  return new Uint8Array(out);
}

/** Understands both a signed QR and a plain typed code ("ES-XXXXXXXXXX"). */
export function parseScan(raw) {
  const text = String(raw || '').trim().toUpperCase();
  const m = text.match(SIGNED);
  if (!m) return { signed: false, code: text, raw: text };
  return { signed: true, eventId: m[1].toLowerCase(), access: m[2], code: `ES-${m[3]}`, message: text.slice(0, 38), signature: m[4], raw: text };
}

/** Browsers only offer the needed crypto on https:// addresses and on localhost. */
export const canVerify = () => Boolean(globalThis.crypto?.subtle);

/** true = genuine, false = forged or damaged, null = cannot be checked on this device right now. */
export async function verifyScan(scan, publicJwk) {
  if (!scan.signed) return false;
  if (!publicJwk || !canVerify()) return null;
  try {
    const signature = base32Decode(scan.signature);
    if (!signature) return false;
    const key = await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, new TextEncoder().encode(scan.message));
  } catch {
    return null;
  }
}

/**
 * What an OFFLINE gate should do with a scan.
 *   scan      - from parseScan()
 *   verified  - from verifyScan() (true / false / null)
 *   eventId   - the event this gate is for
 *   manifest  - downloaded ticket list ({ tickets, revoked }) or null
 *   queue     - scans already accepted on this device and waiting to sync
 * Returns the result to show. `accept: true` means: let them in and add the scan to the queue.
 */
export function offlineDecision({ scan, verified, eventId, manifest, queue }) {
  const code = scan.code;
  const base = { code, offline: true };
  if (scan.signed && scan.eventId !== String(eventId)) return { ...base, result: 'invalid', message: 'This ticket is for a different event' };
  if (scan.signed && verified === false) return { ...base, result: 'invalid', message: 'This QR code is not a genuine ticket' };
  if (scan.signed && scan.access === 'V') return { ...base, result: 'invalid', message: 'Online-only ticket' };
  if (manifest?.revoked?.includes(code)) {
    return { ...base, result: 'invalid', message: 'This ticket was transferred and has a new QR code. Ask the guest for their latest ticket.' };
  }

  if (manifest?.cancelled?.includes(code)) return { ...base, result: 'invalid', message: 'This ticket was cancelled and refunded' };

  const listed = manifest?.tickets.find((t) => t.code === code);
  const queued = queue.some((s) => s.code === code);
  if (listed) {
    if (listed.checkedIn || queued) return { ...base, result: 'duplicate', holderName: listed.holderName, message: 'Already scanned' };
    return { ...base, result: 'ok', accept: true, holderName: listed.holderName, ticketTypeName: listed.ticketTypeName };
  }

  // Not in the downloaded list (or no list at all): only a verified signature can vouch for it
  if (scan.signed && verified === true) {
    if (queued) return { ...base, result: 'duplicate', message: 'Already scanned on this device' };
    return {
      ...base, result: 'ok', accept: true,
      message: manifest ? 'Genuine ticket (signature verified). Not in the downloaded list - probably sold after the download.' : 'Genuine ticket (signature verified).',
    };
  }
  if (scan.signed && verified === null) {
    return { ...base, result: 'invalid', message: 'Cannot verify this ticket offline on this device. Open the gate screen once while online (on an https address) first.' };
  }
  return { ...base, result: 'invalid', message: manifest ? 'Not in downloaded list' : 'Offline, and no ticket list downloaded on this device' };
}
