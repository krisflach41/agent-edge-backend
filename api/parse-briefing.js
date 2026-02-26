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

Below is a raw technical market report. You must read and understand ALL of the information in this report, then write TWO complete summaries.

CRITICAL RULE: Both summaries must cover ALL of the same topics and information from the report. Do NOT split the content between them. Do NOT put some topics in one and different topics in the other. Every key point in the Market Summary must also appear in the Client-Friendly Summary, just explained differently.

1. REALTOR PARTNER SUMMARY
   - This is a technical summary for real estate professionals who understand industry terminology
   - Cover EVERYTHING in the report — rates, bonds, economic data, Fed commentary, all of it
   - Use proper industry terms (MBS, basis points, yield curve, etc.)
   - Structure: "Market Open" (what happened today) then "What This Means" (implications for housing/rates)
   - 200-350 words

2. CLIENT-FRIENDLY SUMMARY
   - This is what a realtor copies and texts or emails to a client who is buying or selling a home
   - The client does NOT want to know WHY rates moved or what reports came out — they just want to know what it means for them
   - NO market mechanics — never mention bonds, MBS, jobs reports, economic data, Fed, yields, or how any of it works behind the scenes
   - ONLY tell them: What are rates doing right now? Is it a good time to buy/sell? Anything exciting to share?
   - Always lead with something positive and encouraging
   - If government policy or political decisions are involved, only mention the impact on rates or housing — no sides, no party names
   - Write like a friendly realtor leaving a 3-sentence voicemail for a client
   - 50-80 words MAX — if it's longer than a short text message, it's too long
   - Example tone: "Great news — rates held steady this week at 6.21%, actually lower than a year ago. More buyers are jumping in and activity is up. If you've been on the fence, conditions are looking really solid right now."

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

    // ===== ACTION 3: Generate Week in Review =====
    if (action === 'generate_wir') {
      var dailySummaries = body.dailySummaries; // array of { date, marketSummary, clientFriendly }
      var weekStart = body.weekStart;
      var weekEnd = body.weekEnd;

      if (!dailySummaries || !Array.isArray(dailySummaries) || dailySummaries.length === 0) {
        return res.status(400).json({ error: 'No daily summaries provided' });
      }

      // Build the context from the week's summaries
      var summaryContext = dailySummaries.map(function(day) {
        var dateObj = new Date(day.publish_date || day.date);
        var dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        return dayName + ':\n' + (day.market_summary || day.marketSummary || 'No summary published');
      }).join('\n\n---\n\n');

      // Format the week ending date
      var endDate = new Date(weekEnd);
      var weekEndFormatted = endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      var wirPrompt = 'You are writing a Week in Review for a mortgage loan officer\'s realtor partner portal. Below are the daily market summaries published Monday through Friday.\n\nWrite a concise weekly recap (200-300 words) that:\n- Highlights the most significant market moves of the week\n- Notes the direction of mortgage rates and bonds\n- Mentions key economic data releases and their impact\n- Ends with a forward-looking sentence about what to watch next week\n- Uses a professional but approachable tone\n\nReturn ONLY valid JSON (no markdown, no backticks):\n{\n  "weekInReview": "The full week in review text here...",\n  "weekEndingLabel": "Week Ending ' + weekEndFormatted + '"\n}\n\nDAILY SUMMARIES:\n\n' + summaryContext;

      var wirResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: wirPrompt }]
        })
      });

      var wirData = await wirResponse.json();
      if (!wirResponse.ok) {
        throw new Error(wirData.error?.message || 'Claude API failed');
      }

      var wirText = wirData.content.find(function(b) { return b.type === 'text'; })?.text || '';
      wirText = wirText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      var wirParsed;
      try {
        wirParsed = JSON.parse(wirText);
      } catch (e) {
        return res.status(200).json({
          success: false,
          error: 'Failed to parse WIR response as JSON',
          raw: wirText
        });
      }

      return res.status(200).json({
        success: true,
        weekInReview: wirParsed.weekInReview || '',
        weekEndingLabel: wirParsed.weekEndingLabel || 'Week Ending ' + weekEndFormatted
      });
    }

    return res.status(400).json({ error: 'Invalid action. Use parse_calendar, rewrite_summaries, or generate_wir' });

  } catch (err) {
    console.error('parse-briefing error:', err);
    return res.status(500).json({ error: err.message });
  }
};
