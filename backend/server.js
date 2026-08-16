require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const reportsRoutes = require('./routes/reports');
const aiRoutes = require('./routes/ai');

const app = express();

// Render (and most cloud hosts) sit behind a reverse proxy, so Express needs
// to trust the X-Forwarded-For header to correctly identify client IPs —
// required for express-rate-limit to work properly.
app.set('trust proxy', 1);

// Allow the production Vercel URL, any Vercel preview URL for this project,
// and localhost (for local testing). Adjust ALLOWED_ORIGIN_MATCH below if
// your Vercel project name changes.
const ALLOWED_ORIGIN_MATCH = /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/;

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser requests (curl, health checks)
    if (origin === process.env.CLIENT_URL) return callback(null, true);
    if (origin === 'http://localhost:3000') return callback(null, true);
    if (ALLOWED_ORIGIN_MATCH.test(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`MIS Report Maker API running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
