import nodemailer from 'nodemailer';

// ─── Transporter ────────────────────────────────────────────────────────────
// Uses env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// Falls back to Gmail defaults if only SMTP_USER + SMTP_PASS are set.

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    console.warn('[EMAIL] SMTP_USER / SMTP_PASS not set — email sending disabled');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  console.log(`[EMAIL] Transporter ready (${host}:${port})`);
  return transporter;
}

// ─── Send Email ─────────────────────────────────────────────────────────────

export const sendEmail = async (to, subject, html) => {
  const t = getTransporter();
  if (!t) {
    console.warn(`[EMAIL] Skipped (no SMTP config): ${subject} → ${to}`);
    return null;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    const info = await t.sendMail({ from, to, subject, html });
    console.log(`[EMAIL] Sent: ${subject} → ${to} (${info.messageId})`);
    return info;
  } catch (err) {
    console.error(`[EMAIL] Failed: ${subject} → ${to}:`, err.message);
    return null;
  }
};

// ─── Accident Alert Email Template ──────────────────────────────────────────

export const buildAccidentEmailHtml = ({
  parentName,
  childName,
  driverName,
  vehicleNumber,
  alertType,
  confidence,
  status,
  locationLat,
  locationLon,
  timestamp,
}) => {
  const statusColor = status === 'CONFIRMED' ? '#DC2626' : '#F59E0B';
  const statusLabel = status === 'CONFIRMED' ? 'EMERGENCY CONFIRMED' : 'ACCIDENT DETECTED — MONITORING';

  const mapLink = locationLat && locationLon
    ? `https://www.google.com/maps?q=${locationLat},${locationLon}`
    : null;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff">
    <!-- Header -->
    <tr>
      <td style="background:${statusColor};padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:22px">⚠️ SISURAKSHA ALERT</h1>
        <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px">${statusLabel}</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:24px">
        <p style="color:#334155;font-size:16px;margin:0 0 16px">
          Dear <strong>${parentName}</strong>,
        </p>

        <p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 20px">
          An accident event has been detected on the school bus transporting your child
          <strong>${childName}</strong>. Our on-board sensors have automatically triggered this alert.
        </p>

        <!-- Details Table -->
        <table width="100%" cellpadding="8" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 20px">
          <tr style="background:#f8fafc">
            <td style="color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">Accident Type</td>
            <td style="color:#0f172a;font-weight:bold;font-size:13px;border-bottom:1px solid #e2e8f0">${alertType}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">Confidence</td>
            <td style="color:#0f172a;font-weight:bold;font-size:13px;border-bottom:1px solid #e2e8f0">${confidence}%</td>
          </tr>
          <tr style="background:#f8fafc">
            <td style="color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">Driver</td>
            <td style="color:#0f172a;font-weight:bold;font-size:13px;border-bottom:1px solid #e2e8f0">${driverName}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">Vehicle</td>
            <td style="color:#0f172a;font-weight:bold;font-size:13px;border-bottom:1px solid #e2e8f0">${vehicleNumber}</td>
          </tr>
          <tr style="background:#f8fafc">
            <td style="color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0">Time</td>
            <td style="color:#0f172a;font-weight:bold;font-size:13px;border-bottom:1px solid #e2e8f0">${timestamp}</td>
          </tr>
          <tr>
            <td style="color:#64748b;font-size:13px">Status</td>
            <td style="color:${statusColor};font-weight:bold;font-size:13px">${status}</td>
          </tr>
        </table>

        ${mapLink ? `
        <a href="${mapLink}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
           border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;margin:0 0 20px">
          📍 View Bus Location on Map
        </a>
        ` : ''}

        <p style="color:#64748b;font-size:13px;line-height:1.6;margin:20px 0 0">
          ${status === 'PENDING'
            ? 'The driver has 3 minutes to cancel this alert if it is a false alarm. You will receive a follow-up notification.'
            : 'Emergency services and school authorities have been notified. Please stay calm and await further instructions.'}
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0">
        <p style="color:#94a3b8;font-size:12px;margin:0">
          SISURAKSHA — Smart School Bus Safety System<br>
          This is an automated alert. Do not reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ─── Cancellation Email Template ────────────────────────────────────────────

export const buildCancelEmailHtml = ({ parentName, childName, driverName, vehicleNumber }) => {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff">
    <tr>
      <td style="background:#16a34a;padding:24px;text-align:center">
        <h1 style="color:#fff;margin:0;font-size:22px">✅ ALERT CANCELLED</h1>
        <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px">False Alarm — All Clear</p>
      </td>
    </tr>
    <tr>
      <td style="padding:24px">
        <p style="color:#334155;font-size:16px;margin:0 0 16px">Dear <strong>${parentName}</strong>,</p>
        <p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 16px">
          The accident alert for the bus carrying your child <strong>${childName}</strong>
          has been <strong style="color:#16a34a">cancelled by the driver (${driverName})</strong>.
          This was a false alarm — no accident occurred.
        </p>
        <p style="color:#64748b;font-size:13px">Vehicle: ${vehicleNumber}</p>
      </td>
    </tr>
    <tr>
      <td style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0">
        <p style="color:#94a3b8;font-size:12px;margin:0">SISURAKSHA — Smart School Bus Safety System</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
};
