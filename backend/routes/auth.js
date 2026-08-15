const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many attempts. Please try again later.' }
});

function signToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
}

function sanitize(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    businessType: user.businessType,
    plan: user.plan,
    reportsUsedThisMonth: user.reportsUsedThisMonth,
    monthlyLimit: user.getMonthlyLimit()
  };
}

// POST /api/auth/signup
router.post('/signup', authLimiter, async (req, res) => {
  try {
    const { name, email, password, businessType } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password,
      businessType: businessType || 'general'
    });

    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    res.status(201).json({ token, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ error: 'Signup failed.', details: err.message });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const match = await user.comparePassword(password || '');
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    user.resetUsageIfNewMonth();
    await user.save();

    const token = signToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    res.json({ token, user: sanitize(user) });
  } catch (err) {
    res.status(500).json({ error: 'Login failed.', details: err.message });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: sanitize(req.user) });
});

module.exports = router;
