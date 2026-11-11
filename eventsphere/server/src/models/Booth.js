import mongoose from 'mongoose';

const boothSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    sponsorName: { type: String, required: true },
    tier: { type: String, enum: ['platinum', 'gold', 'silver', 'startup'], default: 'silver' },
    description: String,
    logoUrl: String,
    website: String,
    videoUrl: String,
    contactEmail: String,
    physicalLocation: String, // e.g. "Hall B, Stall 12" for hybrid events
    resources: [{ title: String, url: String }],
    visits: { type: Number, default: 0 },
    leads: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        name: String,
        email: String,
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Booth', boothSchema);
