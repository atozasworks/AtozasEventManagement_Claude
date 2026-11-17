import { Router } from 'express';
import Notification from '../models/Notification.js';
import { protect } from '../middleware/auth.js';
import { ah, HttpError, isObjectId } from '../utils/http.js';

const router = Router();
router.use(protect);

// The bell: latest notifications plus how many are unread
router.get(
  '/',
  ah(async (req, res) => {
    const [items, unread] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).select('type title body link read createdAt').lean(),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);
    res.json({ unread, items });
  })
);

// Light version for the badge, polled in the background
router.get(
  '/unread-count',
  ah(async (req, res) => {
    res.json({ unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
  })
);

router.post(
  '/read-all',
  ah(async (req, res) => {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ ok: true, unread: 0 });
  })
);

router.post(
  '/:id/read',
  ah(async (req, res) => {
    const r = isObjectId(req.params.id) && (await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { read: true }));
    if (!r || !r.matchedCount) throw new HttpError(404, 'Notification not found');
    res.json({ ok: true, unread: await Notification.countDocuments({ user: req.user._id, read: false }) });
  })
);

export default router;
