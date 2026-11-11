import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    phone: { type: String, trim: true },
    role: { type: String, enum: ['attendee', 'organizer', 'admin'], default: 'attendee' },
    organizationName: { type: String, trim: true },
    // Tiered pricing: free self-service vs SaaS subscription tiers
    plan: { type: String, enum: ['free', 'pro', 'enterprise'], default: 'free' },
    // Networking profile
    headline: { type: String, trim: true },
    interests: [String],
    openToNetworking: { type: Boolean, default: true },
    // Consent captured for GDPR/DPDP readiness
    marketingConsent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function matchPassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  const { _id, name, email, phone, role, organizationName, plan, headline, interests, openToNetworking } = this;
  return { _id, name, email, phone, role, organizationName, plan, headline, interests, openToNetworking };
};

export default mongoose.model('User', userSchema);
