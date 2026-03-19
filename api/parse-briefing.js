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

      var summaryPrompt = `You are writing as Kristy Flach, a Certified Mortgage Advisor. She sends a daily morning briefing to her realtor partners.

KRISTY'S VOICE:
- Conversational, warm, real. Short sentences. Plain words. Like a smart friend who happens to know everything about mortgages.
- Wicked dry humor — casual asides, not forced jokes. She makes complex stuff feel approachable.
- NOT a salesperson. Never pushy. She educates and lets people come to her.
- Honest to a fault. If news is bad, she says so — but always with perspective and calm, never alarm.
- No corporate jargon unless talking to industry pros. No buzzwords. Contractions always.
- She would never make anyone feel dumb for not understanding something.

Below is a raw technical market report. You must read and understand ALL of the information in this report, then write TWO complete summaries.

CRITICAL RULE: Both summaries must cover ALL of the same topics and information from the report. Do NOT split the content between them. Do NOT put some topics in one and different topics in the other. Every key point in the Market Summary must also appear in the Client-Friendly Summary, just explained differently.

1. REALTOR PARTNER SUMMARY
   - This is a technical summary for real estate professionals who understand industry terminology
   - Cover EVERYTHING in the report — rates, bonds, economic data, Fed commentary, all of it
   - Use proper industry terms (MBS, basis points, yield curve, etc.)
   - Written in Kristy's voice — knowledgeable and direct, not stuffy
   - Structure it with these clearly labeled sections, each as its own paragraph:
     "Market Open" — 2-3 sentences on what happened at open (stocks, bonds, MBS, yields)
     "Economic Data" — key reports and numbers released today, what they showed
     "Housing & Rates" — what this means for mortgage rates, inventory, buyer/seller activity
     "What This Means" — bottom line implications, what to watch next
   - Use line breaks between sections (double newline)
   - 250-400 words

2. CLIENT-FRIENDLY SUMMARY
   - Written in Kristy's voice — like she's explaining today's market to a friend over coffee
   - Take the complicated market information and make it simple — someone with zero industry knowledge should follow every word
   - Structure it exactly like this:
     a) A short intro (2-3 sentences) explaining what happened today in plain terms and why it matters
     b) A "What really matters:" section with 3-4 bullet points of the key takeaways (rates, buyer activity, market conditions)
     c) A "Why this matters to you:" section with bullet points for buyers, sellers, and refinancers — one sentence each telling them what this means for THEM specifically
     d) A brief 1-sentence closing that reassures or looks ahead — open door, not a sales pitch
   - Always frame things through the lens of "should I buy/sell/refinance right now?"
   - Lead with perspective and reassurance, not alarm — even when news is mixed
   - Use plain conversational language, short sentences, contractions
   - Keep the whole thing under 200 words

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

      var wirPrompt = 'You are writing as Kristy Flach, a Certified Mortgage Advisor, creating a Week in Review for her realtor partner portal.\n\nKRISTY\'S VOICE: Conversational, warm, real. Short sentences. Plain words. Wicked dry humor as casual asides. Knowledgeable and direct, not stuffy. Never salesy. Honest to a fault. Contractions always.\n\nBelow are the daily market summaries published Monday through Friday.\n\nWrite a comprehensive weekly recap (300-450 words) structured with these clearly labeled sections, each as its own paragraph separated by double newlines:\n\n"Rate & Bond Recap" — How mortgage rates and bonds moved this week. Where did MBS and the 10-year yield start vs end? Overall direction.\n\n"Economic Highlights" — The most significant economic data releases of the week and what they showed. Key numbers and surprises.\n\n"Housing & Market Impact" — What this week\'s data and rate moves mean for the housing market, buyers, sellers, and refinancers.\n\n"Week Ahead" — What to watch next week. Key data releases, Fed activity, or technical levels that could move rates.\n\nEach section heading should appear on its own line in ALL CAPS before the paragraph (e.g. "RATE & BOND RECAP\\n\\nMortgage bonds traded higher this week...").\n\nWrite in Kristy\'s voice — knowledgeable, direct, approachable. Be specific with numbers and data points.\n\nReturn ONLY valid JSON (no markdown, no backticks):\n{\n  "weekInReview": "The full week in review text with section headings here...",\n  "weekEndingLabel": "Week Ending ' + weekEndFormatted + '"\n}\n\nDAILY SUMMARIES:\n\n' + summaryContext;

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
