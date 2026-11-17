/**
 * Gives an existing account the platform admin role (or takes it away).
 *
 *   npm run make-admin -- someone@example.com            make them an admin
 *   npm run make-admin -- someone@example.com --remove   back to an organizer account
 *
 * The person must have signed up first. It uses MONGO_URI from server/.env, so run it on the
 * machine whose database you mean to change (your computer for local, the server for live).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const email = String(process.argv[2] || '').toLowerCase().trim();
const remove = process.argv.includes('--remove');
if (!email || email.startsWith('--')) {
  console.error('Usage: npm run make-admin -- someone@example.com [--remove]');
  process.exit(1);
}

await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventsphere');
const user = await User.findOne({ email });
if (!user) {
  console.error(`No account uses ${email} in this database. Ask them to sign up first.`);
  await mongoose.disconnect();
  process.exit(1);
}
const before = user.role;
user.role = remove ? 'organizer' : 'admin';
await user.save();
console.log(`${user.name} <${user.email}>: ${before} -> ${user.role}`);
await mongoose.disconnect();
