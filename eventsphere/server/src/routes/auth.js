import { Router } from 'express';
import User from '../models/User.js';
import { protect, signToken } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/http.js';

const router = Router();

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
    res.status(201).json({ token: signToken(user), user: user.toSafeJSON() });
  })
);

router.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: String(email || '').toLowerCase() }).select('+password');
    if (!user || !(await user.matchPassword(password || ''))) throw new HttpError(401, 'Invalid email or password');
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
