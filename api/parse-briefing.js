// /api/parse-briefing.js - Uses Claude API to:
// 1. Read econ calendar screenshots and extract structured data
// 2. Rewrite raw market content into Realtor + Client-Friendly summaries

module.exports = async (req, res) => {
  // CORS
  var origin = req.headers.origin || '';
  var allowed = ['https://kristyflach.com', 'https://kristyflach41.github.io', 'https://agent-edge-backend.vercel.app'];
  if (allowed.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    var body = req.body || {};
    var action = body.action; // 'parse_calendar' or 'rewrite_summaries'

    // ===== ACTION 1: Parse Calendar Screenshot =====
    if (action === 'parse_calendar') {
      var imageData = body.image; // base64 string
      var mediaType = body.mediaType || 'image/png';

      if (!imageData) {
        return res.status(400).json({ error: 'No image data provided' });
      }

      var calendarPrompt = `You are reading a screenshot of a weekly economic calendar. Extract ALL events for each day.

Return ONLY valid JSON in this exact format (no markdown, no backticks, no explanation):
{
  "weekLabel": "WEEK OF MONTH DAY-DAY, YEAR",
  "days": [
    {
      "day": "Monday",
      "events": [
        {"time": "10:00 AM", "name": "Factory Orders"}
      ]
    },
    {
      "day": "Tuesday",
      "events": [
        {"time": "7:00 AM", "name": "China Rate Decision"},
        {"time": "8:15 AM", "name": "ADP Weekly Preliminary Estimate"}
      ]
    }
  ]
}

Rules:
- Include EVERY event visible for each day, with time and name
- If a day has no events, include it with an empty events array
- Only include Monday through Friday
- Use the exact event names as shown in the image
- Return ONLY the JSON object, nothing else`;

      var calendarResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageData
                }
              },
              { type: 'text', text: calendarPrompt }
            ]
          }]
        })
      });

      var calendarData = await calendarResponse.json();
      if (!calendarResponse.ok) {
        throw new Error(calendarData.error?.message || 'Claude API failed');
      }

      var rawText = calendarData.content.find(function(b) { return b.type === 'text'; })?.text || '';
      // Strip any markdown fencing just in case
      rawText = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      var parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        return res.status(200).json({ 
          success: false, 
          error: 'Failed to parse Claude response as JSON', 
          raw: rawText 
        });
      }

      // Transform into the portal's expected format:
      // Array of { day, mainEvent, additionalEvents[], featured }
      var portalCalendar = [];
      if (parsed.days && Array.isArray(parsed.days)) {
        parsed.days.forEach(function(dayObj) {
          if (dayObj.events && dayObj.events.length > 0) {
            var mainEvent = dayObj.events[0].name;
            var additional = dayObj.events.slice(1).map(function(e) { return e.name; });
            portalCalendar.push({
              day: dayObj.day,
              mainEvent: mainEvent,
              additionalEvents: additional,
              featured: false
            });
          }
        });
      }

      return res.status(200).json({
        success: true,
        weekLabel: parsed.weekLabel || '',
        fullCalendar: parsed,
        portalCalendar: portalCalendar
      });
    }

    // ===== ACTION 2: Rewrite Market Summaries =====
    if (action === 'rewrite_summaries') {
      var rawContent = body.rawContent; // The raw MBS Highway content

      if (!rawContent) {
        return res.status(400).json({ error: 'No raw content provided' });
      }

      var summaryPrompt = `You are a mortgage industry content writer for a loan officer named Kristy Flach. She sends a daily morning briefing to her realtor partners.

Below is raw market commentary. Rewrite it into TWO versions:

1. REALTOR PARTNER SUMMARY - Professional but approachable. Written for real estate agents who understand the market. Include:
   - A "Market Open" section (2-3 sentences on what's happening today)
   - A "What This Means" section (2-3 sentences on implications for housing/rates)
   - Keep it punchy — 150-250 words total

2. CLIENT-FRIENDLY SUMMARY - Written for homebuyers/sellers with no financial background. Conversational, reassuring tone. Explain complex concepts simply. No jargon. 150-250 words.

Return ONLY valid JSON in this exact format (no markdown, no backticks):
{
  "marketSummary": "The full realtor partner summary text here...",
  "clientFriendly": "The full client-friendly summary text here..."
}

RAW CONTENT TO REWRITE:
${rawContent}`;

      var summaryResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: summaryPrompt
          }]
        })
      });

      var summaryData = await summaryResponse.json();
      if (!summaryResponse.ok) {
        throw new Error(summaryData.error?.message || 'Claude API failed');
      }

      var summaryText = summaryData.content.find(function(b) { return b.type === 'text'; })?.text || '';
      summaryText = summaryText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      var summaryParsed;
      try {
        summaryParsed = JSON.parse(summaryText);
      } catch (e) {
        return res.status(200).json({
          success: false,
          error: 'Failed to parse summary response as JSON',
          raw: summaryText
        });
      }

      return res.status(200).json({
        success: true,
        marketSummary: summaryParsed.marketSummary || '',
        clientFriendly: summaryParsed.clientFriendly || ''
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use parse_calendar or rewrite_summaries' });

  } catch (err) {
    console.error('parse-briefing error:', err);
    return res.status(500).json({ error: err.message });
  }
};
