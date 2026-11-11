import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { HttpError } from '../utils/http.js';

export function signToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

async function resolveUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(payload.id);
  } catch {
    return null;
  }
}

// Requires a valid token
export async function protect(req, _res, next) {
  const user = await resolveUser(req);
  if (!user) return next(new HttpError(401, 'Please log in to continue'));
  req.user = user;
  next();
}

// Attaches req.user if a token is present, but never blocks
export async function optionalAuth(req, _res, next) {
  req.user = await resolveUser(req);
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, `This action needs one of these roles: ${roles.join(', ')}`));
    }
    next();
  };
}
