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

    var { to, subject, body, replyTo, type, name } = req.body;

    // ===== TEMPLATE MODE: type + to + name =====
    if (type && to && name) {
      var template = getTemplate(type, name);
      if (!template) {
        return res.status(400).json({ success: false, message: 'Unknown email type: ' + type });
      }
      subject = template.subject;
      body = template.body;
    }

    // ===== GENERIC MODE: to + subject + body =====
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

// ===== EMAIL TEMPLATES =====
function getTemplate(type, name) {
  if (type === 'welcome') {
    return {
      subject: 'Welcome to the Team, ' + name + '! 🎉',
      body:
        '<h2 style="color: #1a2b5a; margin-top: 0;">Welcome to Agent Edge!</h2>' +
        '<p>Hi ' + name + ',</p>' +
        '<p>I\'m so excited to officially welcome you as a Partner! Here\'s what being my partner means for your business:</p>' +
        '<div style="background: #f0f7ff; border-radius: 8px; padding: 16px 20px; margin: 20px 0;">' +
          '<p style="margin: 0 0 8px;"><strong>✓ Co-Branded Materials</strong> — Your headshot and branding on every report and flyer</p>' +
          '<p style="margin: 0 0 8px;"><strong>✓ Unlimited AI Content</strong> — Social media posts created for you in seconds</p>' +
          '<p style="margin: 0 0 8px;"><strong>✓ Full Calculator Suite</strong> — Income, self-employed, and amortization tools</p>' +
          '<p style="margin: 0 0 8px;"><strong>✓ Credit Score Tools</strong> — Simulator and education resources</p>' +
          '<p style="margin: 0;"><strong>✓ Priority Support</strong> — Direct line to me for your deals</p>' +
        '</div>' +
        '<p>If you haven\'t uploaded your headshot yet, you can do that anytime from your <strong>Profile</strong> page inside the portal. That\'s the key to unlocking co-branded materials.</p>' +
        '<p style="text-align: center; margin: 25px 0;">' +
          '<a href="https://kristyflach.com/portal.html" style="display: inline-block; padding: 12px 32px; background: #1a2b5a; color: white; border-radius: 6px; text-decoration: none; font-weight: bold;">Go to Your Portal</a>' +
        '</p>' +
        '<p>I\'m here to help you grow. Don\'t hesitate to reach out anytime.</p>'
    };
  }

  if (type === 'goodbye') {
    return {
      subject: name + ', sorry to see you go',
      body:
        '<p>Hi ' + name + ',</p>' +
        '<p>I appreciate you giving Agent Edge a try. I understand it might not have been the right fit at this time, and that\'s completely okay.</p>' +
        '<p>Your feedback matters to me. If there\'s anything specific that didn\'t work for you, or something you wished the platform had, I\'d genuinely love to hear about it. It helps me build something better.</p>' +
        '<p>Your account has been deactivated, but your door is always open. If you\'d like to come back at any point, just reach out and I\'ll get you set up.</p>' +
        '<p>Wishing you the best,</p>'
    };
  }

  if (type === 'trial-ending') {
    return {
      subject: name + ', thanks for exploring Agent Edge!',
      body:
        '<h2 style="color: #6e7f77; margin-top: 0;">Thanks for Taking a Spin!</h2>' +
        '<p>Hi ' + name + ',</p>' +
        '<p>Your exploration period on Agent Edge wraps up tomorrow. I hope you got a feel for what the platform can do for your business!</p>' +
        '<p>What you saw was just a preview. As a full partner, you\'d have access to everything — co-branded materials with your name and photo, unlimited tools, daily market briefings, and a direct line to me when you need answers fast.</p>' +
        '<div style="background: rgba(110,127,119,0.06); border-radius: 8px; padding: 16px 20px; margin: 20px 0;">' +
          '<p style="margin: 0 0 8px; color: #333;">&#10003; Co-branded flyers, reports, and property websites</p>' +
          '<p style="margin: 0 0 8px; color: #333;">&#10003; Unlimited social media content and AI tools</p>' +
          '<p style="margin: 0 0 8px; color: #333;">&#10003; Full access to financial calculators and credit tools</p>' +
          '<p style="margin: 0; color: #333;">&#10003; Daily market briefings — agent and client versions</p>' +
        '</div>' +
        '<p>I\'d love to talk about how we can grow together. Schedule a quick call and let\'s figure out how I can help you stand out with your clients.</p>' +
        '<p style="text-align: center; margin: 25px 0;">' +
          '<a href="https://calendly.com" style="display: inline-block; padding: 12px 32px; background: #6e7f77; color: white; border-radius: 6px; text-decoration: none; font-weight: bold;">Schedule a Call</a>' +
        '</p>' +
        '<p style="font-size: 13px; color: #888;">Or reach out directly — (206) 313-5883 / kflach@prmg.net</p>'
    };
  }

  return null;
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
