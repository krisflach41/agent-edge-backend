// /api/check-alerts.js — Pipeline Date Alert Engine
// Called on a schedule (Vercel cron) or manually from Mission Control
// Checks all active pipeline loans for upcoming dates and sends alerts

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Federal holidays for business day calculations
const FEDERAL_HOLIDAYS = [
  '2025-01-01','2025-01-20','2025-02-17','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-10-13','2025-11-11','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19','2026-07-03','2026-07-04','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-05-31','2027-06-18','2027-06-19','2027-07-05','2027-09-06','2027-10-11','2027-11-11','2027-11-25','2027-12-24','2027-12-25'
];

function isTRIDBusinessDay(date) {
  if (date.getDay() === 0) return false;
  var iso = date.toISOString().slice(0, 10);
  return FEDERAL_HOLIDAYS.indexOf(iso) === -1;
}

// Alert configuration for each date type
const ALERT_CONFIG = {
  date_closing: {
    label: 'Closing',
    alertDefault: false,
    warnings: [7, 3, 1, 0]  // days before
  },
  date_final_cd: {
    label: 'Final CD',
    alertDefault: true,
    warnings: [5, 2, 1, 0],
    escalateAtNoon: true
  },
  date_ctc: {
    label: 'Clear to Close',
    alertDefault: true,
    warnings: [5, 2, 1, 0],
    escalateAtNoon: true
  },
  date_conditional: {
    label: 'Conditional Approval',
    alertDefault: false,
    warnings: [5, 2, 1, 0]
  },
  date_contract_exp: {
    label: 'Contract Expiration',
    alertDefault: true,
    warnings: [7, 5, 3, 2, 1, 0],
    escalateAtNoon: true
  },
  date_emd: {
    label: 'EMD Due',
    alertDefault: false,
    warnings: [3, 1, 0]
  },
  date_appraisal: {
    label: 'Appraisal',
    alertDefault: false,
    warnings: [5, 2, 0]
  },
  date_inspection: {
    label: 'Inspection',
    alertDefault: false,
    warnings: [5, 2, 0]
  }
};

// Build alert message based on days remaining
function buildAlertMessage(loanName, dateLabel, daysOut, isEscalation) {
  if (isEscalation) {
    return '🚨 ESCALATION — ' + loanName + '\'s ' + dateLabel + ' is TODAY and has NOT been confirmed. Action needed NOW.';
  }
  if (daysOut === 0) {
    return '⚠️ TODAY — ' + loanName + '\'s ' + dateLabel + ' is due TODAY. Confirm when complete.';
  }
  if (daysOut === 1) {
    return '📋 TOMORROW — ' + loanName + '\'s ' + dateLabel + ' is due tomorrow.';
  }
  if (daysOut === 2) {
    return '📋 ' + loanName + '\'s ' + dateLabel + ' is due in 2 days. Is everything on track?';
  }
  if (daysOut <= 5) {
    return '📋 Heads up — ' + loanName + '\'s ' + dateLabel + ' is coming up in ' + daysOut + ' days.';
  }
  return '📋 ' + loanName + '\'s ' + dateLabel + ' is in ' + daysOut + ' days.';
}

// Get borrower name for a loan
function getLoanDisplayName(loan) {
  if (loan.first_name && loan.last_name) {
    return loan.first_name + ' ' + loan.last_name;
  }
  if (loan.last_name) return loan.last_name;
  if (loan.subject_street) return loan.subject_street;
  return 'Loan ' + (loan.ae_id || '').substring(0, 8);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const mode = req.query.mode || req.body?.mode || 'check'; // 'check' = return alerts, 'send' = check + send SMS
    const userId = req.query.user_id || req.body?.user_id;
    const isNoonEscalation = req.query.escalation === 'true' || req.body?.escalation === true;

    // Get today's date in YYYY-MM-DD
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const today = new Date(todayStr + 'T00:00:00');

    // Fetch all active pipeline loans
    let query = supabase
      .from('ae_loans')
      .select('*, ae_contacts!inner(first_name, last_name)')
      .not('pipeline_stage', 'in', '("closed","archived","funded")');

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: loans, error: loanError } = await query;
    if (loanError) throw loanError;

    // Fetch user alert preferences
    let alertPrefs = {};
    if (userId) {
      const { data: prefs } = await supabase
        .from('ae_users')
        .select('alert_phone, alert_sms_enabled, alert_preferences')
        .eq('id', userId)
        .single();
      if (prefs) alertPrefs = prefs;
    }

    const alerts = [];

    (loans || []).forEach(loan => {
      const borrowerName = (loan.ae_contacts?.first_name || '') + ' ' + (loan.ae_contacts?.last_name || '');
      const loanName = borrowerName.trim() || getLoanDisplayName(loan);

      Object.keys(ALERT_CONFIG).forEach(dateCol => {
        const dateVal = loan[dateCol];
        if (!dateVal) return;

        const config = ALERT_CONFIG[dateCol];
        const dateObj = new Date(dateVal + 'T00:00:00');
        const daysOut = Math.round((dateObj - today) / 86400000);

        // Skip past dates (except today) and dates too far out
        if (daysOut < 0) return;
        if (daysOut > Math.max(...config.warnings)) return;

        // Check if this date has been confirmed
        const confirmed = loan['confirmed_' + dateCol.replace('date_', '')] || false;
        if (confirmed && daysOut > 0) return; // Confirmed and not yet due, skip

        // Check if this warning threshold is hit
        const shouldAlert = config.warnings.includes(daysOut);
        if (!shouldAlert) return;

        // Check if escalation applies
        const isEscalation = isNoonEscalation && daysOut === 0 && !confirmed && config.escalateAtNoon;

        // Determine priority
        let priority = 'normal';
        if (daysOut === 0) priority = 'critical';
        else if (daysOut <= 2) priority = 'high';
        else if (daysOut <= 5) priority = 'medium';

        alerts.push({
          loan_id: loan.ae_id,
          loan_name: loanName,
          date_type: dateCol,
          date_label: config.label,
          date_value: dateVal,
          days_out: daysOut,
          priority: priority,
          confirmed: confirmed,
          is_escalation: isEscalation,
          message: buildAlertMessage(loanName, config.label, daysOut, isEscalation),
          subject_street: loan.subject_street || ''
        });
      });
    });

    // Sort: escalations first, then by days out, then by priority
    alerts.sort((a, b) => {
      if (a.is_escalation && !b.is_escalation) return -1;
      if (!a.is_escalation && b.is_escalation) return 1;
      if (a.days_out !== b.days_out) return a.days_out - b.days_out;
      const pOrder = { critical: 0, high: 1, medium: 2, normal: 3 };
      return (pOrder[a.priority] || 3) - (pOrder[b.priority] || 3);
    });

    // If mode is 'send' and user has SMS enabled, send the alerts
    let smsSent = 0;
    if (mode === 'send' && alertPrefs.alert_sms_enabled && alertPrefs.alert_phone) {
      const smsAlerts = alerts.filter(a => {
        // Only send SMS for critical/high or escalations
        return a.is_escalation || a.priority === 'critical' || a.priority === 'high';
      });

      for (const alert of smsAlerts) {
        try {
          const smsResponse = await fetch(process.env.VERCEL_URL
            ? 'https://' + process.env.VERCEL_URL + '/api/send-sms'
            : 'https://agent-edge-backend.vercel.app/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: alertPrefs.alert_phone,
              message: alert.message
            })
          });
          if (smsResponse.ok) smsSent++;
        } catch (smsErr) {
          console.error('SMS send error:', smsErr);
        }
      }

      // Log alert run
      await supabase.from('ae_alert_log').insert({
        user_id: userId,
        alert_count: alerts.length,
        sms_sent: smsSent,
        run_type: isNoonEscalation ? 'noon_escalation' : 'morning_check',
        created_at: new Date().toISOString()
      }).catch(() => {}); // Don't fail if log table doesn't exist yet
    }

    return res.status(200).json({
      success: true,
      today: todayStr,
      alert_count: alerts.length,
      sms_sent: smsSent,
      alerts: alerts
    });

  } catch (err) {
    console.error('check-alerts error:', err);
    return res.status(500).json({ error: err.message });
  }
};
