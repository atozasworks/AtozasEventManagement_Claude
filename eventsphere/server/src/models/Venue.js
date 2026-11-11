import mongoose from 'mongoose';

const venueSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['convention-centre', 'hotel', 'banquet', 'auditorium', 'outdoor', 'coworking', 'stadium'],
      default: 'hotel',
    },
    city: { type: String, required: true },
    state: String,
    country: { type: String, default: 'India' },
    address: String,
    capacity: { type: Number, required: true },
    pricePerDay: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    amenities: [String],
    description: String,
    imageUrl: String,
    rating: { type: Number, min: 0, max: 5, default: 4 },
    contactEmail: String,
    listedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Venue', venueSchema);
