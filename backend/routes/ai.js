const express = require('express');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/ai/customize-report
 * Body: { instructions, businessType, headers, kpis, sampleRows }
 *
 * User types free-text instructions (e.g. "Mujhe region-wise profit trend
 * chahiye aur ek risk warning agar kisi mahine sales 20% se zyada gira ho").
 * This calls Claude to return:
 *   - executiveSummary: a management-ready paragraph
 *   - extraInsights: array of {label, value} bonus KPIs/observations
 *   - recommendations: array of short action bullets
 * All computed ONLY from the data summary sent (small sample + KPI numbers),
 * never the full raw dataset, to keep payload small and reasonably private.
 */
router.post('/customize-report', authMiddleware, async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'AI feature not configured. Set ANTHROPIC_API_KEY on the server.' });
    }

    const { instructions, businessType, headers, kpis, sampleRows } = req.body;
    if (!instructions || !instructions.trim()) {
      return res.status(400).json({ error: 'Please describe what you want in the report.' });
    }

    const dataSummary = {
      businessType,
      headers,
      kpis,
      sampleRows: (sampleRows || []).slice(0, 15) // small sample only, not full dataset
    };

    const systemPrompt = `You are a business analyst generating a management report add-on.
You will be given: (1) a user's free-text instructions in Hindi/English/Hinglish describing what
they want added or improved in their report, and (2) a JSON summary of their data (headers, computed
KPIs, and a small row sample). Respond ONLY with valid JSON (no markdown, no code fences) in this exact shape:
{
  "executiveSummary": "2-4 sentence management-ready summary paragraph, in the same language mix the user used",
  "extraInsights": [{"label": "short label", "value": "short value or finding"}],
  "recommendations": ["short actionable bullet", "..."]
}
Keep extraInsights to max 6 items and recommendations to max 5 items. Base everything strictly on the
provided KPIs/sample data — do not invent numbers not derivable from what's given. If the user's
instructions ask for something the data doesn't support, note that briefly inside executiveSummary instead
of fabricating it.`;

    const userMessage = `User's instructions: """${instructions}"""\n\nData summary:\n${JSON.stringify(dataSummary, null, 2)}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: 'AI request failed.', details: data });
    }

    const rawText = (data.content || []).map((b) => b.text || '').join('');
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'AI returned an unexpected format. Please try again.' });
    }

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: 'AI customization failed.', details: err.message });
  }
});

module.exports = router;
