import mongoose from 'mongoose';

const venueInquirySchema = new mongoose.Schema(
  {
    venue: { type: mongoose.Schema.Types.ObjectId, ref: 'Venue', required: true },
    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
    startDate: Date,
    endDate: Date,
    expectedAttendees: Number,
    message: String,
    status: { type: String, enum: ['sent', 'quoted', 'confirmed', 'declined'], default: 'sent' },
  },
  { timestamps: true }
);

export default mongoose.model('VenueInquiry', venueInquirySchema);
