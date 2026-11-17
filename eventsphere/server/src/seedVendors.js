/**
 * Adds the demo vendor listings (halls, caterers, planners, decorators, photographers) WITHOUT wiping anything.
 *
 *   npm run seed-vendors -- you@example.com
 *
 * The listings are owned by that existing account, and requests for them are emailed to it.
 * Safe to run twice: listings that are already there are left alone.
 * It uses MONGO_URI from server/.env, so run it on the machine whose database you mean.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Vendor from './models/Vendor.js';
import { demoVendors } from './vendorDemoData.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const email = String(process.argv[2] || '').toLowerCase().trim();
if (!email || email.startsWith('--')) {
  console.error('Usage: npm run seed-vendors -- you@example.com   (an account that already exists)');
  process.exit(1);
}

await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventsphere');
const owner = await User.findOne({ email });
if (!owner) {
  console.error(`No account uses ${email} in this database. Sign up with it first.`);
  await mongoose.disconnect();
  process.exit(1);
}

let added = 0;
for (const v of demoVendors(owner)) {
  if (await Vendor.exists({ name: v.name, city: v.city })) continue;
  await Vendor.create(v);
  added++;
}
console.log(`${added} demo listing(s) added for ${owner.name} <${owner.email}>; ${await Vendor.countDocuments()} listings in total.`);
await mongoose.disconnect();
