const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  businessType: { type: String, enum: ['retail', 'mis', 'finance', 'general'], default: 'general' },

  plan: { type: String, enum: ['free', '199', '499'], default: 'free' },
  planExpiresAt: { type: Date, default: null },

  // Manual UPI upgrade tracking (set when user clicks "Upgrade", cleared when admin confirms)
  pendingPlanRequest: { type: String, enum: ['199', '499', null], default: null },
  pendingPlanRequestedAt: { type: Date, default: null },

  // Usage tracking (resets monthly via cron/cron-like check)
  reportsUsedThisMonth: { type: Number, default: 0 },
  usageMonth: { type: String, default: () => new Date().toISOString().slice(0, 7) }, // "2026-08"

  createdAt: { type: Date, default: Date.now }
});

UserSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

const PLAN_LIMITS = { free: 3, '199': 20, '499': Infinity };
UserSchema.methods.getMonthlyLimit = function () {
  return PLAN_LIMITS[this.plan] ?? 3;
};

// Ensures usage counter resets when a new calendar month starts
UserSchema.methods.resetUsageIfNewMonth = function () {
  const nowMonth = new Date().toISOString().slice(0, 7);
  if (this.usageMonth !== nowMonth) {
    this.usageMonth = nowMonth;
    this.reportsUsedThisMonth = 0;
  }
};

module.exports = mongoose.model('User', UserSchema);
