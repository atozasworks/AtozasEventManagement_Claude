import AdminAction from '../models/AdminAction.js';

/** Record something a platform admin did. Never throws - logging must not break the action itself. */
export async function logAdmin(req, action, targetType, targetId, summary) {
  if (req.user?.role !== 'admin') return;
  try {
    await AdminAction.create({ admin: req.user._id, action, targetType, targetId, summary: String(summary || '').slice(0, 400) });
  } catch (err) {
    console.error('Could not write the admin activity log:', err.message);
  }
}
