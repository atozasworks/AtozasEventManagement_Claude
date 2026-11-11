/**
 * Seeds demo data for the "Universal Pilot Hybrid Event" plus a few other
 * event types, venues, sponsors and sample registrations.
 *   npm run seed   (WARNING: wipes the eventsphere database first)
 */
import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Event from './models/Event.js';
import Venue from './models/Venue.js';
import VenueInquiry from './models/VenueInquiry.js';
import Order from './models/Order.js';
import Ticket from './models/Ticket.js';
import Booth from './models/Booth.js';
import Connection from './models/Connection.js';
import ChatMessage from './models/ChatMessage.js';

const day = 24 * 60 * 60 * 1000;
const inDays = (d, hour = 10) => {
  const t = new Date(Date.now() + d * day);
  t.setHours(hour, 0, 0, 0);
  return t;
};
const at = (base, hours) => new Date(base.getTime() + hours * 60 * 60 * 1000);
const code = () => 'ES-' + crypto.randomBytes(5).toString('hex').toUpperCase();

async function run() {
  await connectDB(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventsphere');
  await Promise.all(
    [User, Event, Venue, VenueInquiry, Order, Ticket, Booth, Connection, ChatMessage].map((m) => m.deleteMany({}))
  );

  // ---------- Users ----------
  const password = 'password123';
  const admin = await User.create({ name: 'Platform Admin', email: 'admin@eventsphere.in', password, role: 'admin' });
  const organizer = await User.create({
    name: 'Ananya Rao', email: 'organizer@eventsphere.in', password, role: 'organizer',
    organizationName: 'Pilot Events Pvt Ltd', plan: 'enterprise', phone: '+919800000001',
  });
  const creator = await User.create({
    name: 'Kabir Shah', email: 'creator@eventsphere.in', password, role: 'organizer',
    organizationName: 'Indie Workshops', plan: 'free',
  });
  const attendee = await User.create({
    name: 'Rohan Mehta', email: 'attendee@eventsphere.in', password, role: 'attendee',
    headline: 'Product Manager, fintech', interests: ['AI', 'Payments'], phone: '+919800000002',
  });
  const others = await User.create(
    ['Priya Nair', 'Arjun Singh', 'Meera Iyer', 'Vikram Das', 'Sara Khan', 'Dev Patel'].map((name, i) => ({
      name,
      email: `${name.split(' ')[0].toLowerCase()}@example.com`,
      password,
      headline: ['Founder, SaaS startup', 'Engineer', 'Designer', 'CTO', 'Marketing lead', 'Student'][i],
      interests: ['AI', 'Music', 'Startups'],
    }))
  );

  // ---------- Venues ----------
  const venues = await Venue.create([
    { name: 'Bangalore International Exhibition Centre', type: 'convention-centre', city: 'Bengaluru', state: 'Karnataka', capacity: 15000, pricePerDay: 950000, amenities: ['Exhibition halls', 'Parking', 'Wi-Fi', 'Catering', 'AV'], rating: 4.5 },
    { name: 'Palace Grounds', type: 'outdoor', city: 'Bengaluru', state: 'Karnataka', capacity: 40000, pricePerDay: 1500000, amenities: ['Open grounds', 'Power backup', 'Parking'], rating: 4.2 },
    { name: 'The Lalit Ashok Ballroom', type: 'hotel', city: 'Bengaluru', state: 'Karnataka', capacity: 800, pricePerDay: 350000, amenities: ['Ballroom', 'Catering', 'AV', 'Stay'], rating: 4.4 },
    { name: 'Jio World Convention Centre', type: 'convention-centre', city: 'Mumbai', state: 'Maharashtra', capacity: 10000, pricePerDay: 1800000, amenities: ['Halls', 'Theatre', 'Catering', 'Wi-Fi'], rating: 4.8 },
    { name: 'NSCI Dome', type: 'stadium', city: 'Mumbai', state: 'Maharashtra', capacity: 8000, pricePerDay: 1200000, amenities: ['Indoor arena', 'Lighting rig'], rating: 4.3 },
    { name: 'Bharat Mandapam', type: 'convention-centre', city: 'New Delhi', state: 'Delhi', capacity: 7000, pricePerDay: 1400000, amenities: ['Plenary hall', 'Expo halls', 'AV'], rating: 4.7 },
    { name: 'HICC Novotel', type: 'convention-centre', city: 'Hyderabad', state: 'Telangana', capacity: 5000, pricePerDay: 900000, amenities: ['Halls', 'Hotel', 'Catering'], rating: 4.5 },
    { name: '91springboard Koramangala', type: 'coworking', city: 'Bengaluru', state: 'Karnataka', capacity: 120, pricePerDay: 25000, amenities: ['Projector', 'Wi-Fi', 'Coffee'], rating: 4.1 },
  ]);

  // ---------- The Universal Pilot Hybrid Event ----------
  const summitStart = inDays(30, 9);
  const summit = await Event.create({
    organizer: organizer._id,
    title: 'Bengaluru Tech & Culture Summit 2026',
    slug: 'bengaluru-tech-culture-summit-2026',
    summary: 'Two days of AI, startups and live music - in person at BIEC and streamed worldwide.',
    description:
      'The EventSphere universal pilot: a B2B conference track with sponsor expo and buyer meetings, ' +
      'creator workshops, and an evening music festival - all on one hybrid platform.\n\n' +
      'Attend in person in Bengaluru or join the virtual venue for live streams, the online expo and networking.',
    category: 'conference',
    format: 'hybrid',
    status: 'published',
    featured: true,
    startDate: summitStart,
    endDate: at(summitStart, 36),
    tags: ['AI', 'Startups', 'Music', 'Hybrid', 'B2B'],
    location: { venue: venues[0]._id, venueName: venues[0].name, address: 'Tumkur Road, Madavara', city: 'Bengaluru', state: 'Karnataka' },
    modules: { ticketing: true, agenda: true, streaming: true, expo: true, networking: true, budget: true, checkin: true, crm: true },
    ticketTypes: [
      { name: 'Virtual Pass', price: 0, quantity: 5000, access: 'virtual', description: 'Live streams, online expo and networking' },
      { name: 'Delegate (In-person)', price: 2999, quantity: 1500, access: 'both', description: 'Both days, all tracks, lunch' },
      { name: 'Festival Night Only', price: 999, quantity: 3000, access: 'in-person', description: 'Evening music festival entry' },
      { name: 'VIP All Access', price: 9999, quantity: 150, access: 'both', maxPerOrder: 4, description: 'Front rows, VIP lounge, speaker dinner' },
    ],
    registrationFields: [
      { label: 'Company', type: 'text', required: true },
      { label: 'Job role', type: 'select', options: ['Founder/CXO', 'Engineering', 'Product', 'Marketing', 'Student', 'Other'], required: true },
      { label: 'Interested in buyer meetings', type: 'checkbox' },
    ],
    sessions: [
      { title: 'Opening Keynote: India\'s AI Decade', speaker: 'Dr. Leela Krishnan', track: 'Main Stage', room: 'Hall 1', startTime: summitStart, endTime: at(summitStart, 1) },
      { title: 'Building for Bharat: UPI-first products', speaker: 'Nikhil Varma', track: 'Main Stage', room: 'Hall 1', startTime: at(summitStart, 1.5), endTime: at(summitStart, 2.5) },
      { title: 'B2B Marketing Attribution that CFOs Trust', speaker: 'Sneha Kapoor', track: 'B2B Growth', room: 'Hall 2', startTime: at(summitStart, 1.5), endTime: at(summitStart, 2.5) },
      { title: 'Workshop: Ship an AI Agent in 90 Minutes', speaker: 'Kabir Shah', track: 'Creator Workshops', room: 'Lab A', startTime: at(summitStart, 4), endTime: at(summitStart, 5.5) },
      { title: 'Founders Fireside: Scaling from Bengaluru to the World', speaker: 'Panel', track: 'Main Stage', room: 'Hall 1', startTime: at(summitStart, 6), endTime: at(summitStart, 7) },
      { title: 'Festival Night: Indie & Electronic Live', speaker: 'Various Artists', track: 'Festival Stage', room: 'Open Arena', startTime: at(summitStart, 10), endTime: at(summitStart, 14) },
    ],
    budget: {
      total: 4500000,
      items: [
        { category: 'venue', description: 'BIEC Halls 1-2 + Open Arena (2 days)', estimated: 1900000, actual: 1900000 },
        { category: 'av-production', description: 'Stage, LED wall, multi-camera streaming crew', estimated: 900000, actual: 820000 },
        { category: 'catering', description: 'Delegate lunches & VIP dinner', estimated: 650000, actual: 0 },
        { category: 'marketing', description: 'Paid social, LinkedIn, influencer campaign', estimated: 400000, actual: 285000 },
        { category: 'speakers', description: 'Travel & honorarium', estimated: 300000, actual: 120000 },
        { category: 'staff', description: 'Volunteers, security, gate staff', estimated: 250000, actual: 0 },
      ],
    },
    integrations: { crmProvider: 'none' },
    views: 1840,
  });

  // ---------- Other event types for the marketplace ----------
  const fest = await Event.create({
    organizer: organizer._id, title: 'Sunburn-style Monsoon Music Festival', slug: 'monsoon-music-festival',
    summary: 'A one-night open-air music festival with 6 artists and 2 stages.',
    description: 'High-volume B2C ticketing test: tiered early-bird pricing, gate scanning and offline check-in.',
    category: 'festival', format: 'in-person', status: 'published', startDate: inDays(45, 16), endDate: inDays(45, 23),
    tags: ['Music', 'EDM', 'Outdoor'], location: { venue: venues[1]._id, venueName: venues[1].name, city: 'Bengaluru', state: 'Karnataka' },
    modules: { ticketing: true, agenda: true, checkin: true, budget: true },
    ticketTypes: [
      { name: 'Early Bird', price: 1499, quantity: 2000, maxPerOrder: 6 },
      { name: 'General', price: 1999, quantity: 15000, maxPerOrder: 6 },
      { name: 'Fan Pit', price: 3999, quantity: 1000, maxPerOrder: 4 },
    ],
    views: 920,
  });
  const webinar = await Event.create({
    organizer: organizer._id, title: 'Webinar: GST & Compliance for Event Businesses', slug: 'gst-compliance-webinar',
    summary: 'A free 60-minute online session with live Q&A.', category: 'webinar', format: 'virtual', status: 'published',
    startDate: inDays(7, 17), endDate: inDays(7, 18), tags: ['Finance', 'Compliance'],
    modules: { ticketing: true, agenda: true, streaming: true, networking: false, checkin: false, budget: false },
    ticketTypes: [{ name: 'Free Registration', price: 0, quantity: 1000, access: 'virtual' }],
    sessions: [{ title: 'GST for event organisers - live', speaker: 'CA Rhea Joshi', track: 'Main Stage', startTime: inDays(7, 17), endTime: inDays(7, 18) }],
    views: 410,
  });
  const workshop = await Event.create({
    organizer: creator._id, title: 'Weekend Pottery Workshop for Beginners', slug: 'weekend-pottery-workshop',
    summary: 'Hands-on wheel throwing, all materials included. Max 20 people.', category: 'workshop', format: 'in-person',
    status: 'published', startDate: inDays(10, 11), endDate: inDays(10, 15), tags: ['Art', 'Hands-on'],
    location: { venueName: 'Clay Studio, Indiranagar', city: 'Bengaluru', state: 'Karnataka' },
    modules: { ticketing: true, checkin: true },
    ticketTypes: [{ name: 'Workshop Seat', price: 1200, quantity: 20, maxPerOrder: 2 }],
    views: 150,
  });
  await Event.create({
    organizer: organizer._id, title: 'Mumbai SaaS Founders Meetup', slug: 'mumbai-saas-founders-meetup',
    summary: 'Evening meetup with lightning talks and networking.', category: 'meetup', format: 'in-person', status: 'published',
    startDate: inDays(14, 18), endDate: inDays(14, 21), tags: ['SaaS', 'Startups'],
    location: { venue: venues[3]._id, venueName: venues[3].name, city: 'Mumbai', state: 'Maharashtra' },
    modules: { ticketing: true, checkin: true, networking: true },
    ticketTypes: [{ name: 'RSVP', price: 0, quantity: 200 }], views: 230,
  });
  await Event.create({
    organizer: organizer._id, title: 'Delhi Design & Build Expo (Draft)', slug: 'delhi-design-build-expo',
    summary: 'Draft event - only visible to the organizer.', category: 'exhibition', format: 'hybrid', status: 'draft',
    startDate: inDays(90, 10), endDate: inDays(92, 18), location: { venue: venues[5]._id, venueName: venues[5].name, city: 'New Delhi' },
    ticketTypes: [{ name: 'Trade Visitor', price: 499, quantity: 5000 }],
  });

  // ---------- Sponsors / Expo booths ----------
  await Booth.create([
    { event: summit._id, sponsorName: 'CloudNova', tier: 'platinum', description: 'GPU cloud built for Indian startups. Free credits for attendees.', website: 'https://example.com', physicalLocation: 'Hall 1, Stall P1', resources: [{ title: 'Startup credits programme', url: 'https://example.com' }], visits: 312 },
    { event: summit._id, sponsorName: 'PayLoop', tier: 'gold', description: 'UPI AutoPay and subscriptions API.', website: 'https://example.com', physicalLocation: 'Hall 1, Stall G3', visits: 188 },
    { event: summit._id, sponsorName: 'TalentBridge', tier: 'silver', description: 'Hiring engineers across India.', physicalLocation: 'Hall 2, Stall S7', visits: 95 },
    { event: summit._id, sponsorName: 'Kriya Labs', tier: 'startup', description: 'AI note-taker for Indian languages.', physicalLocation: 'Startup Alley 14', visits: 61 },
  ]);

  // ---------- Sample registrations (for analytics) ----------
  const sources = [
    { source: 'linkedin', medium: 'paid-social', campaign: 'summit-launch' },
    { source: 'instagram', medium: 'social', campaign: 'festival-night' },
    { source: 'google', medium: 'cpc', campaign: 'brand' },
    { source: 'newsletter', medium: 'email', campaign: 'oct-digest' },
    {},
  ];
  const buyers = [attendee, ...others];
  let i = 0;
  for (const buyer of buyers) {
    for (const tt of summit.ticketTypes.slice(0, 3)) {
      if ((i += 1) % 2 === 0 && buyer !== attendee) continue;
      const qty = 1;
      const subtotal = tt.price * qty;
      const order = await Order.create({
        event: summit._id, user: buyer._id, buyer: { name: buyer.name, email: buyer.email, phone: buyer.phone },
        items: [{ ticketTypeId: tt._id, name: tt.name, price: tt.price, qty }], subtotal,
        platformFee: Math.round(subtotal * 2.5) / 100, total: subtotal * 1.025, currency: 'INR',
        paymentMethod: subtotal === 0 ? 'free' : ['upi', 'card', 'upi', 'wallet', 'netbanking'][i % 5],
        paymentStatus: 'paid', paymentRef: `SEED-${i}`, paidAt: new Date(Date.now() - (i % 6) * day),
        answers: { Company: 'Demo Co', 'Job role': 'Product' }, attribution: sources[i % sources.length],
        createdAt: new Date(Date.now() - (i % 6) * day),
      });
      await Ticket.create({
        order: order._id, event: summit._id, user: buyer._id, ticketTypeId: tt._id, ticketTypeName: tt.name,
        access: tt.access, holderName: buyer.name, holderEmail: buyer.email, code: code(), checkedIn: false,
      });
      await Event.updateOne({ _id: summit._id, 'ticketTypes._id': tt._id }, { $inc: { 'ticketTypes.$.sold': qty } });
    }
  }

  await ChatMessage.create([
    { event: summit._id, room: 'main', user: others[0]._id, name: others[0].name, text: 'Excited for the keynote! Joining from Kochi 👋' },
    { event: summit._id, room: 'main', user: others[1]._id, name: others[1].name, text: 'Will the slides be shared after?', kind: 'question' },
  ]);

  console.log('\nSeed complete. Log in with any of these (password: password123):');
  console.log('  organizer@eventsphere.in  - enterprise organizer (owns the pilot summit)');
  console.log('  creator@eventsphere.in    - independent creator (free plan)');
  console.log('  attendee@eventsphere.in   - attendee with tickets');
  console.log('  admin@eventsphere.in      - platform admin');
  console.log(`\nIDs: summit=${summit._id} festival=${fest._id} webinar=${webinar._id} workshop=${workshop._id} admin=${admin._id}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
