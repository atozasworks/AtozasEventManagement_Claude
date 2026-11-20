import { Router } from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { protect, signToken } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/notifications.js';

const router = Router();

const HOUR = 60 * 60 * 1000;
const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

// The raw token only ever exists in the emailed link; the database keeps its hash
function newToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: sha256(raw) };
}

async function issueVerification(user) {
  const { raw, hash } = newToken();
  await User.updateOne({ _id: user._id }, { emailVerifyTokenHash: hash, emailVerifyExpires: new Date(Date.now() + 24 * HOUR) });
  sendVerificationEmail(user, raw).catch(() => {});
}

router.post(
  '/register',
  ah(async (req, res) => {
    const { name, email, password, phone, role, organizationName, marketingConsent } = req.body;
    if (!name || !email || !password) throw new HttpError(400, 'Name, email and password are required');
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    const safeRole = role === 'organizer' ? 'organizer' : 'attendee'; // admins are created via seed only
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) throw new HttpError(409, 'An account with this email already exists');
    const user = await User.create({ name, email, password, phone, role: safeRole, organizationName, marketingConsent });
    await issueVerification(user);
    res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

router.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password || ''))) {
      if (user && !user.password) throw new HttpError(401, 'This account uses Continue with Google. Use that button to sign in.');
      throw new HttpError(401, 'Invalid email or password');
    }
    if (user.suspended) throw new HttpError(403, 'This account has been suspended. Please contact support.');
    res.json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

// The web client reads this so the Google button can be rendered. The client id is public.
router.get('/google/config', (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  res.json({ enabled: Boolean(clientId), clientId });
});

let googleClient;
let googleClientId;
function googleVerifier() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return null;
  if (!googleClient || googleClientId !== clientId) {
    googleClient = new OAuth2Client(clientId);
    googleClientId = clientId;
  }
  return googleClient;
}

router.post(
  '/google',
  ah(async (req, res) => {
    const credential = String(req.body.credential || '');
    if (!credential) throw new HttpError(400, 'Missing Google sign-in credential');
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const client = googleVerifier();
    if (!clientId || !client) throw new HttpError(503, 'Google sign-in is not configured yet');

    let payload;
    try {
      const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
      payload = ticket.getPayload();
    } catch {
      throw new HttpError(401, 'Google sign-in could not be verified. Please try again.');
    }

    const email = String(payload?.email || '').toLowerCase().trim();
    const googleId = String(payload?.sub || '');
    if (!email || !googleId || payload.email_verified !== true) {
      throw new HttpError(401, 'Google did not confirm this email address');
    }

    let user = (await User.findOne({ googleId })) || (await User.findOne({ email }));
    if (user?.suspended) throw new HttpError(403, 'This account has been suspended. Please contact support.');

    const wantsOrganizer = req.body.role === 'organizer';
    const organizationName = String(req.body.organizationName || '').trim().slice(0, 120);

    if (!user) {
      const name = String(payload.name || email.split('@')[0]).trim().slice(0, 80) || 'Guest';
      user = await User.create({
        name,
        email,
        googleId,
        role: wantsOrganizer ? 'organizer' : 'attendee',
        organizationName: wantsOrganizer ? organizationName : undefined,
        marketingConsent: Boolean(req.body.marketingConsent),
        emailVerified: true,
      });
    } else {
      if (user.googleId && user.googleId !== googleId) {
        throw new HttpError(409, 'This email is already linked to a different Google account');
      }
      if (!user.googleId) user.googleId = googleId;
      user.emailVerified = true;
      if (wantsOrganizer && user.role === 'attendee') user.role = 'organizer';
      if (wantsOrganizer && organizationName && !user.organizationName) user.organizationName = organizationName;
      if (req.body.marketingConsent) user.marketingConsent = true;
      await user.save();
    }

    res.json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

router.get('/me', protect, (req, res) => res.json({ user: req.user.toSafeJSON() }));

router.put(
  '/me',
  protect,
  ah(async (req, res) => {
    const allowed = ['name', 'phone', 'organizationName', 'headline', 'interests', 'openToNetworking', 'marketingConsent'];
    for (const key of allowed) if (key in req.body) req.user[key] = req.body[key];
    await req.user.save();
    res.json({ user: req.user.toSafeJSON() });
  })
);

// ---------- Email verification ----------
router.post(
  '/verify-email',
  ah(async (req, res) => {
    const token = String(req.body.token || '');
    if (!token) throw new HttpError(400, 'Verification link is incomplete');
    const user = await User.findOneAndUpdate(
      { emailVerifyTokenHash: sha256(token), emailVerifyExpires: { $gt: new Date() } },
      { $set: { emailVerified: true }, $unset: { emailVerifyTokenHash: 1, emailVerifyExpires: 1 } },
      { new: true }
    );
    if (!user) throw new HttpError(400, 'This verification link is invalid or has expired. Log in and request a new one.');
    res.json({ ok: true, user: user.toSafeJSON() });
  })
);

router.post(
  '/resend-verification',
  protect,
  ah(async (req, res) => {
    if (req.user.emailVerified) return res.json({ ok: true, alreadyVerified: true });
    await issueVerification(req.user);
    res.json({ ok: true });
  })
);

// ---------- Password reset ----------
router.post(
  '/forgot-password',
  ah(async (req, res) => {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!email) throw new HttpError(400, 'Enter your email address');
    const user = await User.findOne({ email });
    if (user) {
      const { raw, hash } = newToken();
      await User.updateOne({ _id: user._id }, { passwordResetTokenHash: hash, passwordResetExpires: new Date(Date.now() + HOUR) });
      sendPasswordResetEmail(user, raw).catch(() => {});
    }
    // Same answer either way, so nobody can use this form to discover who has an account
    res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
  })
);

router.post(
  '/reset-password',
  ah(async (req, res) => {
    const token = String(req.body.token || '');
    const password = String(req.body.password || '');
    if (!token) throw new HttpError(400, 'Reset link is incomplete');
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    const user = await User.findOne({ passwordResetTokenHash: sha256(token), passwordResetExpires: { $gt: new Date() } });
    if (!user) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
    user.password = password; // hashed by the model's save hook
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    user.passwordChangedAt = new Date();
    user.emailVerified = true; // opening the emailed link proves the address is theirs
    await user.save();
    res.json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

// Organizer upgrade (self-service). Real billing for Pro/Enterprise plugs in here.
router.post(
  '/become-organizer',
  protect,
  ah(async (req, res) => {
    if (req.user.role === 'attendee') req.user.role = 'organizer';
    if (req.body.organizationName) req.user.organizationName = req.body.organizationName;
    await req.user.save();
    res.json({ token: signToken(req.user), user: req.user.toSafeJSON() });
  })
);

export default router;
