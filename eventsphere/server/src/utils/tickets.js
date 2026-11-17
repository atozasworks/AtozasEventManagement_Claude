import crypto from 'crypto';

// Short, human-readable, unambiguous characters (no 0/O, 1/I)
export function ticketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(10);
  let out = 'ES-';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

// Token for "add this ticket to my account" links. Only its hash is stored.
export function newClaimToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: sha256(raw) };
}

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
export const cleanEmail = (v) => String(v || '').trim().toLowerCase();
export const cleanName = (v) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, 80);
