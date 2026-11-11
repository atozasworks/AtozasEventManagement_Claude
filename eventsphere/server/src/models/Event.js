import mongoose from 'mongoose';

const ticketTypeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, default: 0, min: 0 },
  quantity: { type: Number, default: 100, min: 0 },
  sold: { type: Number, default: 0 },
  maxPerOrder: { type: Number, default: 10 },
  access: { type: String, enum: ['in-person', 'virtual', 'both'], default: 'both' },
  salesEnd: Date,
});

const registrationFieldSchema = new mongoose.Schema({
  label: { type: String, required: true },
  type: { type: String, enum: ['text', 'email', 'number', 'select', 'checkbox'], default: 'text' },
  options: [String],
  required: { type: Boolean, default: false },
});

const sessionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  speaker: String,
  track: { type: String, default: 'Main Stage' },
  room: String,
  description: String,
  startTime: Date,
  endTime: Date,
  streamUrl: String, // YouTube/Vimeo embed or RTMP playback URL
});

const budgetItemSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['venue', 'catering', 'av-production', 'marketing', 'speakers', 'staff', 'logistics', 'technology', 'other'],
    default: 'other',
  },
  description: String,
  estimated: { type: Number, default: 0 },
  actual: { type: Number, default: 0 },
});

const eventSchema = new mongoose.Schema(
  {
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    summary: { type: String, maxlength: 280 },
    description: String,
    category: {
      type: String,
      enum: ['conference', 'webinar', 'festival', 'concert', 'workshop', 'meetup', 'exhibition', 'sports', 'other'],
      default: 'conference',
    },
    format: { type: String, enum: ['in-person', 'virtual', 'hybrid'], default: 'hybrid' },
    status: { type: String, enum: ['draft', 'published', 'cancelled', 'completed'], default: 'draft' },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    currency: { type: String, default: 'INR' },
    coverImage: String,
    tags: [String],
    location: {
      venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue' },
      venueName: String,
      address: String,
      city: String,
      state: String,
      country: { type: String, default: 'India' },
    },
    // Modular architecture: organizers toggle what each event needs
    modules: {
      ticketing: { type: Boolean, default: true },
      agenda: { type: Boolean, default: true },
      streaming: { type: Boolean, default: false },
      expo: { type: Boolean, default: false },
      networking: { type: Boolean, default: false },
      budget: { type: Boolean, default: true },
      checkin: { type: Boolean, default: true },
      crm: { type: Boolean, default: false },
    },
    ticketTypes: [ticketTypeSchema],
    registrationFields: [registrationFieldSchema],
    sessions: [sessionSchema],
    budget: {
      total: { type: Number, default: 0 },
      items: [budgetItemSchema],
    },
    integrations: {
      crmProvider: { type: String, enum: ['none', 'hubspot', 'salesforce', 'zoho', 'webhook'], default: 'none' },
      webhookUrl: String,
      lastSyncAt: Date,
      lastSyncStatus: String,
    },
    views: { type: Number, default: 0 },
    featured: { type: Boolean, default: false },
  },
  { timestamps: true }
);

eventSchema.index({ title: 'text', summary: 'text', tags: 'text', 'location.city': 'text' });
eventSchema.index({ status: 1, visibility: 1, startDate: 1 });

eventSchema.virtual('minPrice').get(function minPrice() {
  if (!this.ticketTypes?.length) return 0;
  return Math.min(...this.ticketTypes.map((t) => t.price));
});

eventSchema.set('toJSON', { virtuals: true });
eventSchema.set('toObject', { virtuals: true });

export default mongoose.model('Event', eventSchema);
