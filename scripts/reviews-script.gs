// ============================================================
//  MAISON KARINA — Reviews Google Apps Script
//
//  SETUP:
//  1. Go to sheets.google.com → New spreadsheet
//     Name it: Maison Karina — Reviews
//     Copy the ID from the URL:
//     https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
//
//  2. Paste that ID into SPREADSHEET_ID below
//
//  3. Go to script.google.com → New project
//     Paste this entire file, delete existing code
//
//  4. Click Run → setupSheet()
//     (safe to run multiple times — never creates duplicates)
//
//  5. Deploy → New deployment → Web app
//     - Execute as: Me
//     - Who has access: Anyone
//
//  6. Copy the Web App URL and paste it in BOTH:
//       index.html        → REVIEWS_SCRIPT_URL
//       leave-review.html → REVIEWS_SCRIPT_URL
//
//  TO APPROVE A REVIEW:
//  Open the Google Sheet → set "Approved" column to: YES
//  Review appears on your site immediately on next page load.
// ============================================================

var SPREADSHEET_ID = "1J3YRW-sZFCCqd4IibkTioIhzRr53a0gMIxUX1IL-4rY"; // ← paste your Sheet ID here
var SHEET_NAME = "Reviews";

// ── SETUP: run once to configure the sheet ────────────────────
function setupSheet() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  // Create the tab if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log("Created new sheet tab: " + SHEET_NAME);
  }

  // Check if already configured — skip if headers exist
  var firstCell = sheet.getRange(1, 1).getValue();
  if (firstCell === "Timestamp") {
    Logger.log("Already configured — nothing to do. URL: " + ss.getUrl());
    return;
  }

  // Set up headers
  var headers = [
    "Timestamp",
    "Name",
    "City",
    "Email",
    "Stars",
    "Review",
    "Approved",
    "Notes",
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Style header row
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground("#1A1410");
  headerRange.setFontColor("#C6A75E");
  headerRange.setFontWeight("bold");
  headerRange.setFrozenRows(1);

  // Column widths
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 120);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 60);
  sheet.setColumnWidth(6, 400);
  sheet.setColumnWidth(7, 90);
  sheet.setColumnWidth(8, 200);

  // Dropdown validation for Approved column
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["YES", "NO", "PENDING"], true)
    .build();
  sheet.getRange(2, 7, 1000, 1).setDataValidation(rule);

  // Add one sample approved review
  sheet
    .getRange(2, 1, 1, 8)
    .setValues([
      [
        new Date(),
        "Isabelle M.",
        "Paris",
        "sample@example.com",
        5,
        "Wearing my gown felt like stepping into the most confident version of myself.",
        "YES",
        "Sample review — feel free to delete",
      ],
    ]);

  Logger.log("Setup complete! Sheet URL: " + ss.getUrl());
}

// ================================================================
//  DISPLAY RULES — adjust these values any time, then redeploy
// ================================================================
var RULES = {
  MIN_STARS: 4, // only show 4 or 5 star reviews
  MIN_WORDS: 10, // minimum word count to be displayed
  MAX_DISPLAY: 6, // max reviews shown on the homepage
  SORT: "newest", // 'newest' = newest first | 'shuffle' = random each load
};

// ── GET: fetch approved reviews ────────────────────────────────
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === "getReviews") return getApprovedReviews();
  return buildResponse({
    status: "ok",
    message: "Maison Karina Reviews API running.",
  });
}

function getApprovedReviews() {
  try {
    var sheet = getSheet();
    var data = sheet.getDataRange().getValues();
    if (data.length < 2)
      return buildResponse({ status: "success", reviews: [] });

    var headers = data[0].map(function (h) {
      return String(h).toLowerCase().trim();
    });
    var nameIdx = headers.indexOf("name");
    var cityIdx = headers.indexOf("city");
    var starsIdx = headers.indexOf("stars");
    var textIdx = headers.indexOf("review");
    var approvedIdx = headers.indexOf("approved");
    var dateIdx = headers.indexOf("timestamp");

    var reviews = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var approved = String(row[approvedIdx] || "")
        .toUpperCase()
        .trim();
      if (approved !== "YES") continue;

      var text = String(row[textIdx] || "").trim();
      var name = String(row[nameIdx] || "").trim();
      var city = String(row[cityIdx] || "").trim();
      var stars = parseInt(row[starsIdx]) || 5;

      if (!text || !name) continue;

      // Rule 1: minimum star rating
      if (stars < RULES.MIN_STARS) continue;

      // Rule 2: minimum word count
      var words = text.split(/\s+/).filter(function (w) {
        return w.length > 0;
      }).length;
      if (words < RULES.MIN_WORDS) continue;

      reviews.push({
        name: name,
        city: city,
        stars: stars,
        text: text,
        date: row[dateIdx] ? new Date(row[dateIdx]).getTime() : 0,
      });
    }

    // Rule 3: sort
    if (RULES.SORT === "newest") {
      reviews.sort(function (a, b) {
        return b.date - a.date;
      });
    } else {
      reviews = shuffle(reviews);
    }

    // Rule 4: cap at MAX_DISPLAY
    reviews = reviews.slice(0, RULES.MAX_DISPLAY);

    // Strip internal date before sending to browser
    reviews = reviews.map(function (r) {
      return { name: r.name, city: r.city, stars: r.stars, text: r.text };
    });

    return buildResponse({ status: "success", reviews: reviews });
  } catch (err) {
    return buildResponse({ status: "error", message: err.message });
  }
}

// ── POST: save a new review submission ─────────────────────────
// Note: browser fetch() with mode:'no-cors' sends an opaque POST.
// Apps Script receives and saves it normally even though the
// browser cannot read the response back.
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action === "submitReview") {
      return saveReview(body.data);
    }

    return buildResponse({
      status: "error",
      message: "Unknown action: " + action,
    });
  } catch (err) {
    return buildResponse({ status: "error", message: err.message });
  }
}

function saveReview(data) {
  if (!data || !data.name || !data.text || !data.email) {
    return buildResponse({
      status: "error",
      message: "Missing required fields.",
    });
  }
  if (String(data.text).length < 10) {
    return buildResponse({ status: "error", message: "Review too short." });
  }

  var sheet = getSheet();
  var stars = parseInt(data.stars) || 5;
  if (stars < 1 || stars > 5) stars = 5;

  sheet.appendRow([
    new Date(),
    sanitize(data.name),
    sanitize(data.city || ""),
    sanitize(data.email || ""),
    stars,
    sanitize(data.text),
    "PENDING",
    "",
  ]);

  notifyNewReview(data);

  return buildResponse({ status: "success", message: "Review received." });
}

// ── Email notification ─────────────────────────────────────────
var ATELIER_EMAIL = "sovathana.soun@gmail.com"; // ← replace with your email

function notifyNewReview(data) {
  try {
    if (!ATELIER_EMAIL || ATELIER_EMAIL === "YOUR_EMAIL@gmail.com") {
      Logger.log("ATELIER_EMAIL not set — skipping email notification.");
      return;
    }
    var subject =
      "New review — " + (data.name || "a client") + " — Maison Karina";
    var body =
      "A new review is waiting for your approval.\n\n" +
      "Name:   " +
      (data.name || "") +
      "\n" +
      "City:   " +
      (data.city || "") +
      "\n" +
      "Stars:  " +
      (data.stars || 5) +
      "/5\n\n" +
      "Review:\n" +
      (data.text || "") +
      "\n\n" +
      'To approve: open your Google Sheet and set "Approved" to YES.\n\n' +
      "---\nMailson Karina — Automated Review Notification";
    GmailApp.sendEmail(ATELIER_EMAIL, subject, body);
    Logger.log("Notification sent to: " + ATELIER_EMAIL);
  } catch (e) {
    Logger.log("Email notification failed: " + e.message);
  }
}

// ── Helpers ────────────────────────────────────────────────────
function getSheet() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID === "YOUR_SPREADSHEET_ID_HERE") {
    throw new Error(
      "SPREADSHEET_ID not set. Paste your Google Sheet ID at the top of the script.",
    );
  }
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet)
    throw new Error(
      'Sheet "' + SHEET_NAME + '" not found. Run setupSheet() first.',
    );
  return sheet;
}

function sanitize(str) {
  return String(str || "")
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .substring(0, 1000);
}

function shuffle(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function buildResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
