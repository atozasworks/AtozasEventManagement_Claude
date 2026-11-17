import Notification from '../models/Notification.js';
import User from '../models/User.js';

/**
 * Put a notification under someone's bell. `to` is one user id or a list of them.
 * Never throws: a notification must not break a booking or a quote request.
 */
export async function notify(to, { type, title, body, link, event }) {
  const ids = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean).map(String))];
  if (!ids.length) return;
  try {
    await Notification.insertMany(
      ids.map((user) => ({ user, type, title: String(title).slice(0, 160), body: String(body || '').slice(0, 400), link, event }))
    );
  } catch (err) {
    console.error('Could not save a notification:', err.message);
  }
}

/** Platform admins look after anything that has no owner of its own (e.g. venues listed by the platform). */
export async function adminIds() {
  const admins = await User.find({ role: 'admin', suspended: { $ne: true } }).select('_id');
  return admins.map((a) => a._id);
}
