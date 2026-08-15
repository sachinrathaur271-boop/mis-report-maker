const express = require('express');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// POST /api/billing/request-upgrade  { plan: "199" | "499" }
// Called when user clicks Upgrade — just logs the intent so you (admin) can
// see who requested what, before they actually pay via UPI and send screenshot.
router.post('/request-upgrade', authMiddleware, async (req, res) => {
  const { plan } = req.body;
  if (!['199', '499'].includes(plan)) return res.status(400).json({ error: 'Invalid plan.' });

  req.user.pendingPlanRequest = plan;
  req.user.pendingPlanRequestedAt = new Date();
  await req.user.save();

  res.json({ ok: true });
});

// POST /api/billing/admin/upgrade  { email, plan }
// YOU call this manually (e.g. via Postman/curl) after confirming payment
// screenshot on WhatsApp. Protected by a simple admin key header.
router.post('/admin/upgrade', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const { email, plan } = req.body;
  if (!['free', '199', '499'].includes(plan)) return res.status(400).json({ error: 'Invalid plan.' });

  const user = await User.findOneAndUpdate(
    { email: (email || '').toLowerCase() },
    {
      plan,
      planExpiresAt: plan === 'free' ? null : new Date(Date.now() + 30 * 24 * 3600 * 1000),
      pendingPlanRequest: null
    },
    { new: true }
  );

  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true, user: { email: user.email, plan: user.plan, planExpiresAt: user.planExpiresAt } });
});

// GET /api/billing/admin/pending-requests
// See who requested an upgrade but hasn't been upgraded yet.
router.get('/admin/pending-requests', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.JWT_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const users = await User.find({ pendingPlanRequest: { $ne: null } })
    .select('name email plan pendingPlanRequest pendingPlanRequestedAt');
  res.json({ users });
});

// Downgrade expired plans back to free (call this from a daily cron job)
router.post('/cron/downgrade-expired', async (req, res) => {
  const cronKey = req.headers['x-cron-key'];
  if (cronKey !== process.env.JWT_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  const result = await User.updateMany(
    { plan: { $in: ['199', '499'] }, planExpiresAt: { $lt: new Date() } },
    { $set: { plan: 'free', planExpiresAt: null } }
  );
  res.json({ downgraded: result.modifiedCount });
});

module.exports = router;
