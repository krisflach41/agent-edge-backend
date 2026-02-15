export default async function handler(req, res) {
  var origin = req.headers.origin || '';
  var allowedOrigins = ['https://kristyflach.com', 'https://agent-edge-backend.vercel.app'];
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://kristyflach.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { return res.status(405).json({ error: 'Method not allowed' }); }

  try {
    var resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return res.status(500).json({ success: false, message: 'Resend API key not configured' });
    }

    var { to, subject, body, replyTo } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ success: false, message: 'Missing required fields: to, subject, body' });
    }

    // Build full HTML email with signature
    var fullHtml = buildEmail(body);

    var response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Kristy Flach <kflach@kristyflach.com>',
        reply_to: replyTo || 'KFlach@prmg.net',
        to: Array.isArray(to) ? to : [to],
        subject: subject,
        html: fullHtml
      })
    });

    var data = await response.json();

    if (!response.ok) {
      console.error('Resend error:', data);
      return res.status(500).json({ success: false, message: data.message || 'Send failed' });
    }

    return res.status(200).json({ success: true, id: data.id });

  } catch (error) {
    console.error('Send email error:', error);
    return res.status(500).json({ success: false, message: error.toString() });
  }
}

function buildEmail(bodyHtml) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    '<body style="font-family: Arial, Helvetica, sans-serif; color: #333333; margin: 0; padding: 20px; background-color: #f9f9f9;">' +
    '<table cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 4px;">' +
    '<tr><td>' +

    // Email body content
    '<div style="font-size: 14px; line-height: 1.6; color: #333333; padding-bottom: 24px; border-bottom: 1px solid #eeeeee; margin-bottom: 20px;">' +
    bodyHtml +
    '</div>' +

    // Signature
    getSignature() +

    '</td></tr></table></body></html>';
}

function getSignature() {
  return '<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; color: #333333; max-width: 600px;">' +

    // Headshot + Name + CMA
    '<tr><td style="padding-bottom: 12px;">' +
    '<table cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="vertical-align: top; padding-right: 14px;">' +
    '<img src="https://kristyflach.com/hero-headshot.jpg" alt="Kristy Flach" width="80" height="80" style="border-radius: 6px; display: block; object-fit: cover;" />' +
    '</td>' +
    '<td style="vertical-align: middle;">' +
    '<span style="font-size: 16px; font-weight: bold; color: #1a2b5a;">Kristy Flach</span><br />' +
    '<span style="font-size: 13px; color: #555555;">Certified Mortgage Advisor, Loan Originator</span><br />' +
    '<span style="font-size: 13px; color: #555555;">NMLS# 2632259</span>' +
    '</td>' +
    '<td style="vertical-align: middle; padding-left: 14px;">' +
    '<img src="https://kristyflach.com/CMA%20Logo.png" alt="Certified Mortgage Advisor" width="55" height="55" style="display: block;" />' +
    '</td>' +
    '</tr></table></td></tr>' +

    // PRMG Logo
    '<tr><td style="padding-bottom: 10px;">' +
    '<img src="https://kristyflach.com/PRMG-Logo.png" alt="PRMG - Paramount Residential Mortgage Group, Inc." width="200" style="display: block;" />' +
    '</td></tr>' +

    // Contact Info
    '<tr><td style="font-size: 13px; line-height: 20px; padding-bottom: 10px;">' +
    '\u2709\uFE0F Email: <a href="mailto:KFlach@prmg.net" style="color: #1a5dab; text-decoration: none;">KFlach@prmg.net</a><br />' +
    '\uD83D\uDCDE Direct: <a href="tel:206-313-5883" style="color: #1a5dab; text-decoration: none;">206-313-5883</a><br />' +
    '<span style="color: #555555;">10200 W. State Road 84 Suite 219 Davie, FL 33324</span>' +
    '</td></tr>' +

    // Links
    '<tr><td style="font-size: 13px; line-height: 22px; padding-bottom: 12px;">' +
    '<a href="https://apply.prmgapp.com/?_gl=1*1g5hi9n*_ga*MTYwMTYzODc1OS4xNzY4NzYwODk5*_ga_T0DMVW6TCQ*czE3Njk4MDIwMzckbzI0JGcwJHQxNzY5ODAyMDM3JGo2MCRsMCRoMA..*_ga_DZBJLC2PNV*czE3Njk4MDIwMzckbzI0JGcwJHQxNzY5ODAyMDM3JGo2MCRsMCRoMA..#/milestones?referrerId=KFlach@prmg.net&loanType=MORTGAGE" style="color: #1a5dab; font-weight: bold; text-decoration: none;">APPLY NOW!</a><br />' +
    '<a href="https://kristyflach.com/#reviews" style="color: #1a5dab; text-decoration: none;">Read My Reviews</a><br /><br />' +
    '<a href="https://www.prmg.net/loanofficer/kristy-flach" style="color: #1a5dab; text-decoration: none;">PRMG Website</a><br />' +
    '<a href="https://kristyflach.com" style="color: #1a5dab; text-decoration: none;">kristyflach.com</a>' +
    '</td></tr>' +

    // Divider
    '<tr><td style="padding-bottom: 10px;"><div style="border-top: 1px solid #cccccc;"></div></td></tr>' +

    // Lightning HELOC
    '<tr><td style="font-size: 13px; padding-bottom: 10px;">' +
    '<a href="https://homeequity.prmg.net/account/heloc/register?referrer=f5f43064-28b9-4d93-8124-7e48b63b5b1a" style="color: #1a5dab; text-decoration: none; font-weight: bold;">Click here for your Lightning Equity HELOC</a><br />' +
    '<span style="font-size: 12px; color: #666666; font-style: italic;">I go beyond loan origination; I build an indispensable community that helps to achieve more than just your financial goals.</span>' +
    '</td></tr>' +

    // Divider
    '<tr><td style="padding-bottom: 10px;"><div style="border-top: 1px solid #cccccc;"></div></td></tr>' +

    // Security Notice
    '<tr><td style="padding-bottom: 12px;">' +
    '<table cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td style="border-left: 3px solid #dddddd; padding: 8px 12px; font-size: 11px; line-height: 16px; color: #888888;">' +
    'This message was sent from a marketing platform. For your security, please do not include personal financial information (SSN, account numbers, tax documents) in replies. For secure communications, contact me directly at <a href="mailto:KFlach@prmg.net" style="color: #1a5dab; text-decoration: none;">KFlach@prmg.net</a>.' +
    '</td></tr></table>' +
    '</td></tr>' +

    // Wire Fraud Warning
    '<tr><td style="font-size: 11px; line-height: 16px; color: #666666; padding-bottom: 10px;">' +
    '<strong style="color: #333333;">WIRE FRAUD WARNING:</strong> <span style="text-decoration: underline;">Never trust wiring instructions sent by unsecure email.</span> Cyber criminals are known to hack email accounts and send emails with fake wiring instructions. These emails are convincing and sophisticated. <strong>ALWAYS</strong> confirm wiring instructions in person or by telephone using a trusted and verified phone number. <strong>NEVER</strong> wire money without confirming that the wiring instructions are correct and are from the title/closing agent. If you are in doubt, call your loan officer or real estate agent immediately.' +
    '</td></tr>' +

    '</table>';
}
