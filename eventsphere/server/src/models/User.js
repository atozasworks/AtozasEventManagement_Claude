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
    // Email ownership + password recovery. Only SHA-256 hashes of the emailed tokens are stored.
    emailVerified: { type: Boolean, default: false },
    emailVerifyTokenHash: { type: String, select: false },
    emailVerifyExpires: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    // Set by a platform admin: a suspended account cannot log in or do anything
    suspended: { type: Boolean, default: false },
    suspendedReason: String,
    // Logins issued before this moment stop working (set when the password is reset)
    passwordChangedAt: Date,
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
  const { _id, name, email, phone, role, organizationName, plan, headline, interests, openToNetworking, emailVerified } = this;
  return { _id, name, email, phone, role, organizationName, plan, headline, interests, openToNetworking, emailVerified: Boolean(emailVerified) };
};

export default mongoose.model('User', userSchema);
