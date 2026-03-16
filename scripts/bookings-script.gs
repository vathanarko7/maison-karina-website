// ============================================================
// MAISON KARINA — Google Apps Script
// Receives booking form data → creates Google Calendar event
// → sends confirmation emails to client + atelier
//
// SETUP INSTRUCTIONS (takes ~5 minutes):
//
// 1. Go to script.google.com — sign in with your Google account
// 2. Click "New project"
// 3. Delete all existing code, paste THIS entire file
// 4. Edit the CONFIG section below with your details
// 5. Click Save (💾), then click "Deploy" → "New deployment"
// 6. Type: Web app
// 7. Execute as: Me
// 8. Who has access: Anyone
// 9. Click "Deploy" → copy the Web App URL
// 10. Paste that URL into index.html where it says:
//     const APPS_SCRIPT_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';
//
// FIRST RUN — Grant permissions:
// 11. Click "Deploy" → "Test deployments" → open the URL
//     Google will ask for calendar + gmail permissions — allow them
// ============================================================

// ── CONFIG — edit these ──────────────────────────────────────
const CONFIG = {
  // Your Google Calendar ID (find in Calendar Settings → "Calendar ID")
  // Usually your Gmail address for the main calendar
  CALENDAR_ID: 'sovathana.soun@gmail.com',

  // Your atelier email — receives a copy of every booking
  ATELIER_EMAIL: 'contact@maisonkarina.com',

  // Atelier name shown in emails
  ATELIER_NAME: 'Maison Karina',

  // Default consultation duration in minutes
  CONSULTATION_DURATION_MINUTES: 60,

  // Default time if client does not specify a preferred time (24h format)
  DEFAULT_HOUR: 8, // 08:00 AM
  DEFAULT_MINUTE: 0,
};
// ────────────────────────────────────────────────────────────

/**
 * Handles POST requests from the booking form
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const result = createBooking(data);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Also handle GET for testing
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'Maison Karina booking service is running.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Core booking logic
 */
function createBooking(data) {
  const {
    firstName = '',
    lastName = '',
    email = '',
    phone = '',
    creationType = 'Consultation',
    preferredDate = '',
    vision = ''
  } = data;

  const clientName = `${firstName} ${lastName}`.trim();

  // ── Parse preferred date ──────────────────────────────────
  const startDate = resolveStartDate(preferredDate);
  const endDate = new Date(startDate.getTime() + CONFIG.CONSULTATION_DURATION_MINUTES * 60 * 1000);

  // ── Create Google Calendar event ──────────────────────────
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) throw new Error('Calendar not found. Check CALENDAR_ID in CONFIG.');

  const eventTitle = `✦ Couture Consultation — ${clientName} (${creationType})`;
  const eventDescription = [
    `CLIENT: ${clientName}`,
    `EMAIL: ${email}`,
    `PHONE: ${phone || 'Not provided'}`,
    `CREATION TYPE: ${creationType}`,
    `PREFERRED DATE: ${formatDate(startDate)}`,
    ``,
    `CLIENT VISION:`,
    vision || 'Not specified',
    ``,
    `---`,
    `Booked via maison-karina-website.vercel.app`
  ].join('\n');

  const event = calendar.createEvent(eventTitle, startDate, endDate, {
    description: eventDescription,
    sendInvites: false, // We send custom emails below
  });

  // Add guest (client) to event
  if (email) {
    event.addGuest(email);
  }

  // ── Send confirmation email to CLIENT ─────────────────────
  if (email) {
    const clientSubject = `Your Maison Karina Consultation Request — ${clientName}`;
    const clientBody = buildClientEmail(clientName, creationType, startDate, vision);
    GmailApp.sendEmail(email, clientSubject, clientBody, {
      htmlBody: buildClientEmailHtml(clientName, creationType, startDate, vision),
      name: CONFIG.ATELIER_NAME,
      replyTo: CONFIG.ATELIER_EMAIL
    });
  }

  // ── Send notification email to ATELIER ───────────────────
  const atelierSubject = `New Consultation Request — ${clientName} (${creationType})`;
  const atelierBody = buildAtelierEmail(clientName, email, phone, creationType, startDate, vision);
  GmailApp.sendEmail(CONFIG.ATELIER_EMAIL, atelierSubject, atelierBody, {
    name: 'Maison Karina Booking System'
  });

  return {
    status: 'success',
    message: 'Consultation request confirmed',
    eventId: event.getId(),
    proposedDate: startDate.toISOString()
  };
}

// ── Email templates ──────────────────────────────────────────

function buildClientEmail(name, type, date, vision) {
  return `Dear ${name},

Thank you for reaching out to Maison Karina.

We have received your consultation request for ${type} and a member of our atelier team will be in touch within 24 hours to confirm your appointment.

Proposed date: ${formatDate(date)}

If you have any questions in the meantime, please do not hesitate to contact us at ${CONFIG.ATELIER_EMAIL}.

With warmth,
Maison Karina
6 Rue de la butte verte, 75008 Phnom Penh`;
}

function buildClientEmailHtml(name, type, date, vision) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F6F1EB;font-family:Georgia,serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;padding:48px;">
    <div style="text-align:center;margin-bottom:40px;">
      <p style="font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#C6A75E;margin:0 0 8px;">Maison Karina</p>
      <h1 style="font-family:Georgia,serif;font-size:28px;font-weight:400;color:#111;margin:0;">Private Couture Atelier</h1>
      <div style="width:40px;height:1px;background:#C6A75E;margin:20px auto;"></div>
    </div>
    <p style="font-size:14px;color:#5A4A46;line-height:1.8;">Dear ${name},</p>
    <p style="font-size:14px;color:#5A4A46;line-height:1.8;">Thank you for reaching out to Maison Karina. We have received your consultation request and are delighted to welcome you to our atelier.</p>
    <div style="background:#F6F1EB;padding:24px;margin:28px 0;border-left:2px solid #C6A75E;">
      <p style="font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#C6A75E;margin:0 0 8px;">Request Details</p>
      <p style="font-size:13px;color:#5A4A46;margin:4px 0;"><strong>Creation Type:</strong> ${type}</p>
      <p style="font-size:13px;color:#5A4A46;margin:4px 0;"><strong>Proposed Date:</strong> ${formatDate(date)}</p>
    </div>
    <p style="font-size:14px;color:#5A4A46;line-height:1.8;">A member of our team will be in touch within 24 hours to confirm your appointment and answer any questions.</p>
    <p style="font-size:14px;color:#5A4A46;line-height:1.8;">For immediate assistance, please contact us at <a href="mailto:${CONFIG.ATELIER_EMAIL}" style="color:#C6A75E;">${CONFIG.ATELIER_EMAIL}</a>.</p>
    <p style="font-size:14px;color:#5A4A46;line-height:1.8;margin-top:32px;">With warmth,<br><em>Maison Karina</em></p>
    <div style="border-top:1px solid #EDE8E0;margin-top:40px;padding-top:24px;text-align:center;">
      <p style="font-size:10px;color:#8A7470;letter-spacing:.12em;">6 Rue de la butte verte, 75008 Phnom Penh<br>By Appointment Only</p>
    </div>
  </div>
</body>
</html>`;
}

function buildAtelierEmail(name, email, phone, type, date, vision) {
  return `New consultation request received.

CLIENT: ${name}
EMAIL: ${email}
PHONE: ${phone || 'Not provided'}
TYPE: ${type}
PREFERRED DATE: ${formatDate(date)}

VISION / MESSAGE:
${vision || 'Not specified'}

---
A Google Calendar event has been created for ${formatDate(date)}.
Please confirm or reschedule directly with the client.`;
}

// ── Helpers ──────────────────────────────────────────────────

function resolveStartDate(preferredDate) {
  let startDate;
  if (preferredDate) {
    startDate = new Date(preferredDate);
    if (isNaN(startDate.getTime())) {
      startDate = getNextDay();
    }
  } else {
    startDate = getNextDay();
  }

  startDate.setHours(CONFIG.DEFAULT_HOUR, CONFIG.DEFAULT_MINUTE, 0, 0);
  return startDate;
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function getNextDay() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}
