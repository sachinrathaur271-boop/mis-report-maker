const express = require('express');
const authMiddleware = require('../middleware/auth');
// Use node-fetch explicitly so this works regardless of the Node.js version
// Render (or any host) happens to be running — older Node versions don't
// have a built-in global fetch, which was silently crashing this route.
const fetch = require('node-fetch');

const router = express.Router();

/**
 * POST /api/ai/customize-report
 * Body: { instructions, businessType, headers, kpis, sampleRows }
 *
 * User types free-text instructions (e.g. "Mujhe region-wise profit trend
 * chahiye aur ek risk warning agar kisi mahine sales 20% se zyada gira ho").
 * This calls Google Gemini to return:
 *   - executiveSummary: a management-ready paragraph
 *   - extraInsights: array of {label, value} bonus KPIs/observations
 *   - recommendations: array of short action bullets
 * Uses Gemini's free tier (get key from aistudio.google.com/app/apikey).
 * All computed ONLY from the data summary sent (small sample + KPI numbers),
 * never the full raw dataset, to keep payload small and reasonably private.
 */
router.post('/customize-report', authMiddleware, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'AI feature not configured. Set GEMINI_API_KEY on the server.' });
    }

    const { instructions, businessType, headers, kpis, sampleRows } = req.body;
    if (!instructions || !instructions.trim()) {
      return res.status(400).json({ error: 'Please describe what you want in the report.' });
    }

    const dataSummary = {
      businessType,
      headers,
      kpis,
      sampleRows: (sampleRows || []).slice(0, 30) // small sample only, not full dataset
    };

    const systemPrompt = `You are a senior business analyst writing a management report add-on for an
Indian SME owner. You will be given: (1) a user's free-text instructions in Hindi/English/Hinglish describing
what they want added or improved in their report, and (2) a JSON summary of their data (headers, computed
KPIs — which may already include growth rates, best/worst periods, top contributors — and a small row sample).

Write like a sharp analyst briefing a business owner: specific, numbers-driven, and directly useful for a
decision — not generic filler like "sales look good". Reference actual KPI values/names from the data summary
wherever possible. If the user's instructions ask for a breakdown the raw sample can approximate (e.g.
salesperson-wise, month-wise), do your best from the sample rows given and say so briefly if precision is limited.

Respond ONLY with valid JSON (no markdown, no code fences, no extra text before or after) in this exact shape:
{
  "executiveSummary": "3-5 sentence management-ready summary paragraph covering overall performance, the
     single biggest driver of results, and one area of concern — in the same language mix the user used",
  "extraInsights": [{"label": "short label", "value": "specific finding with a number where possible"}],
  "recommendations": ["short actionable bullet tied to a specific insight above", "..."]
}
Keep extraInsights to max 6 items and recommendations to max 5 items. Base everything strictly on the
provided KPIs/sample data — do not invent numbers not derivable from what's given. If the user's
instructions ask for something the data genuinely doesn't support, note that briefly inside executiveSummary
instead of fabricating it.`;

    const userMessage = `User's instructions: """${instructions}"""\n\nData summary:\n${JSON.stringify(dataSummary, null, 2)}`;

    const model = 'gemini-flash-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1000,
          responseMimeType: 'application/json'
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Gemini API error:', JSON.stringify(data));
      return res.status(502).json({ error: 'AI request failed.', details: data });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    const cleaned = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'AI returned an unexpected format. Please try again.' });
    }

    res.json(parsed);
  } catch (err) {
    console.error('AI route crashed:', err);
    res.status(500).json({ error: 'AI customization failed.', details: err.message });
  }
});

module.exports = router;
