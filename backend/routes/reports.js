const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const authMiddleware = require('../middleware/auth');
const Report = require('../models/Report');
const { TEMPLATES } = require('../utils/templates');
const { cleanRows, computeKPIs } = require('../utils/engine');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// GET /api/reports/templates -> list available business templates for the UI dropdown
router.get('/templates', (req, res) => {
  const list = Object.entries(TEMPLATES).map(([id, t]) => ({ id, label: t.label }));
  res.json({ templates: list });
});

// POST /api/reports/process  (multipart: file, field: businessType)
// Enforces plan limits, cleans data, computes KPIs, saves history, returns JSON
// (frontend renders charts + builds the Excel/PDF client-side from this JSON,
// OR you can extend this route to stream back a generated .xlsx directly).
router.post('/process', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const user = req.user;
    const limit = user.getMonthlyLimit();

    if (user.reportsUsedThisMonth >= limit) {
      return res.status(403).json({
        error: `Monthly limit reached (${limit} reports on ${user.plan} plan). Please upgrade your plan.`
      });
    }

    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const businessType = TEMPLATES[req.body.businessType] ? req.body.businessType : 'general';
    const template = TEMPLATES[businessType];

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const { clean, headers, numericCols, textCols, log } = cleanRows(rawRows);
    const { colMap, kpis } = computeKPIs(clean, headers, template);

    // increment usage + save history
    user.reportsUsedThisMonth += 1;
    await user.save();

    await Report.create({
      user: user._id,
      fileName: req.file.originalname,
      businessType,
      rowCount: clean.length,
      kpis: kpis.reduce((acc, k) => ({ ...acc, [k.key]: k.value }), {})
    });

    res.json({
      businessType,
      templateLabel: template.label,
      cleaningLog: log,
      headers,
      numericCols,
      textCols,
      colMap,
      kpis,
      chartsConfig: template.charts,
      rows: clean, // full cleaned dataset for client-side chart rendering + export
      usage: { used: user.reportsUsedThisMonth, limit }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process file.', details: err.message });
  }
});

// GET /api/reports/history -> past reports for the logged-in user
router.get('/history', authMiddleware, async (req, res) => {
  const reports = await Report.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50);
  res.json({ reports });
});

module.exports = router;
