// ============================================================
//  MAISON KARINA - Reviews Google Apps Script
//
//  SETUP:
//  1. Go to sheets.google.com - New spreadsheet
//     Name it: Maison Karina - Reviews
//     Copy the ID from the URL:
//     https://docs.google.com/spreadsheets/d/COPY_THIS_PART/edit
//
//  2. Set Script Properties:
//     REVIEWS_SPREADSHEET_ID (required)
//     REVIEWS_SHEET_NAME (optional, default: Reviews)
//     REVIEWS_ATELIER_EMAIL (optional, for notification emails)
//     REVIEWS_MIN_STARS (optional, default: 4)
//     REVIEWS_MIN_WORDS (optional, default: 10)
//     REVIEWS_MAX_DISPLAY (optional, default: 6)
//     REVIEWS_SORT (optional: newest|shuffle, default: newest)
//
//  3. Go to script.google.com - New project
//     Paste this entire file, delete existing code
//
//  4. Click Run - setupSheet()
//     (safe to run multiple times - never creates duplicates)
//
//  5. Deploy - New deployment - Web app
//     - Execute as: Me
//     - Who has access: Anyone
//
//  6. Copy the Web App URL and paste it in BOTH:
//       index.html        - REVIEWS_SCRIPT_URL
//       leave-review.html - REVIEWS_SCRIPT_URL
//
//  TO APPROVE A REVIEW:
//  Open the Google Sheet - set "Approved" column to: YES
//  Review appears on your site immediately on next page load.
// ============================================================

var REVIEWS_DEFAULTS = {
  SHEET_NAME: "Reviews",
  MIN_STARS: 4,
  MIN_WORDS: 10,
  MAX_DISPLAY: 6,
  SORT: "newest",
};

function getReviewsConfig() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = String(props.getProperty("REVIEWS_SPREADSHEET_ID") || "").trim();
  var sheetName = String(props.getProperty("REVIEWS_SHEET_NAME") || REVIEWS_DEFAULTS.SHEET_NAME).trim();
  var atelierEmail = String(props.getProperty("REVIEWS_ATELIER_EMAIL") || "").trim();

  var minStars = parseInt(props.getProperty("REVIEWS_MIN_STARS"), 10);
  var minWords = parseInt(props.getProperty("REVIEWS_MIN_WORDS"), 10);
  var maxDisplay = parseInt(props.getProperty("REVIEWS_MAX_DISPLAY"), 10);
  var sort = String(props.getProperty("REVIEWS_SORT") || REVIEWS_DEFAULTS.SORT).toLowerCase().trim();

  if (!spreadsheetId) {
    throw new Error("Missing Script Property: REVIEWS_SPREADSHEET_ID");
  }
  if (!sheetName) {
    sheetName = REVIEWS_DEFAULTS.SHEET_NAME;
  }
  if (sort !== "shuffle" && sort !== "newest") {
    sort = REVIEWS_DEFAULTS.SORT;
  }

  return {
    SPREADSHEET_ID: spreadsheetId,
    SHEET_NAME: sheetName,
    ATELIER_EMAIL: atelierEmail,
    RULES: {
      MIN_STARS: isNaN(minStars) ? REVIEWS_DEFAULTS.MIN_STARS : Math.max(1, Math.min(5, minStars)),
      MIN_WORDS: isNaN(minWords) ? REVIEWS_DEFAULTS.MIN_WORDS : Math.max(1, minWords),
      MAX_DISPLAY: isNaN(maxDisplay) ? REVIEWS_DEFAULTS.MAX_DISPLAY : Math.max(1, maxDisplay),
      SORT: sort,
    },
  };
}

// SETUP: run once to configure the sheet
function setupSheet() {
  var config = getReviewsConfig();
  var ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(config.SHEET_NAME);

  // Create the tab if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(config.SHEET_NAME);
    Logger.log("Created new sheet tab: " + config.SHEET_NAME);
  }

  // Check if already configured - skip if headers exist
  var firstCell = sheet.getRange(1, 1).getValue();
  if (firstCell === "Timestamp") {
    Logger.log("Already configured - nothing to do. URL: " + ss.getUrl());
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
        "Sample review - feel free to delete",
      ],
    ]);

  Logger.log("Setup complete! Sheet URL: " + ss.getUrl());
}

// ================================================================
//  DISPLAY RULES - adjust these values any time, then redeploy
// ================================================================

// GET: fetch approved reviews
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
    var config = getReviewsConfig();
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
      if (stars < config.RULES.MIN_STARS) continue;

      // Rule 2: minimum word count
      var words = text.split(/\s+/).filter(function (w) {
        return w.length > 0;
      }).length;
      if (words < config.RULES.MIN_WORDS) continue;

      reviews.push({
        name: name,
        city: city,
        stars: stars,
        text: text,
        date: row[dateIdx] ? new Date(row[dateIdx]).getTime() : 0,
      });
    }

    // Rule 3: sort
    if (config.RULES.SORT === "newest") {
      reviews.sort(function (a, b) {
        return b.date - a.date;
      });
    } else {
      reviews = shuffle(reviews);
    }

    // Rule 4: cap at MAX_DISPLAY
    reviews = reviews.slice(0, config.RULES.MAX_DISPLAY);

    // Strip internal date before sending to browser
    reviews = reviews.map(function (r) {
      return { name: r.name, city: r.city, stars: r.stars, text: r.text };
    });

    return buildResponse({ status: "success", reviews: reviews });
  } catch (err) {
    return buildResponse({ status: "error", message: err.message });
  }
}

// POST: save a new review submission
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

// Email notification

function notifyNewReview(data) {
  try {
    var config = getReviewsConfig();
    if (!config.ATELIER_EMAIL) {
      Logger.log("REVIEWS_ATELIER_EMAIL not set - skipping email notification.");
      return;
    }
    var subject =
      "New review - " + (data.name || "a client") + " - Maison Karina";
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
      "Maison Karina - Automated Review Notification";
    GmailApp.sendEmail(config.ATELIER_EMAIL, subject, body);
    Logger.log("Notification sent to: " + config.ATELIER_EMAIL);
  } catch (e) {
    Logger.log("Email notification failed: " + e.message);
  }
}
// Helpers
function getSheet() {
  var config = getReviewsConfig();
  var ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(config.SHEET_NAME);
  if (!sheet)
    throw new Error(
      'Sheet "' + config.SHEET_NAME + '" not found. Run setupSheet() first.',
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

// SHEET PROTECTION
// Run protectSheet() ONCE after setupSheet().
//
// Rules:
//   Row 1 (headers)          - HARD BLOCK - cannot edit at all
//   Col A (Timestamp) rows 2+ - HARD BLOCK - set by script automatically
//   Col E (Stars) rows 2+    - HARD BLOCK - set by script automatically
//   Col B (Name) rows 2+     - WARNING - can override to fix typos
//   Col C (City) rows 2+     - WARNING - can override to fix typos
//   Col D (Email) rows 2+    - WARNING - can override to fix typos
//   Col F (Review) rows 2+   - WARNING - can override to fix typos
//   Col G (Approved) rows 2+ - FREE - set YES / NO / PENDING
//   Col H (Notes) rows 2+    - FREE - write internal notes
function protectSheet() {
  var sheet = getSheet();
  var ss = sheet.getParent();

  // Remove all existing protections first
  sheet
    .getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .forEach(function (p) {
      p.remove();
    });
  sheet
    .getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .forEach(function (p) {
      p.remove();
    });

  var lastRow = Math.max(sheet.getMaxRows(), 1000);
  var me = Session.getEffectiveUser();

// 1. HARD BLOCK: Row 1 (entire header row)
  var p1 = sheet
    .getRange("1:1")
    .protect()
    .setDescription("Headers - hard blocked");
  p1.addEditor(me);
  p1.removeEditors(
    p1.getEditors().filter(function (u) {
      return u.getEmail() !== me.getEmail();
    }),
  );

// 2. HARD BLOCK: Column A rows 2+ (Timestamp)
  var p2 = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .protect()
    .setDescription("Timestamp - hard blocked, set by script");
  p2.addEditor(me);
  p2.removeEditors(
    p2.getEditors().filter(function (u) {
      return u.getEmail() !== me.getEmail();
    }),
  );

// 3. HARD BLOCK: Column E rows 2+ (Stars)
  var p3 = sheet
    .getRange(2, 5, lastRow - 1, 1)
    .protect()
    .setDescription("Stars - hard blocked, set by script");
  p3.addEditor(me);
  p3.removeEditors(
    p3.getEditors().filter(function (u) {
      return u.getEmail() !== me.getEmail();
    }),
  );

// 4. WARNING: Column B rows 2+ (Name)
  var p4 = sheet
    .getRange(2, 2, lastRow - 1, 1)
    .protect()
    .setDescription("Name - warning before editing");
  p4.setWarningOnly(true);

// 5. WARNING: Column C rows 2+ (City)
  var p5 = sheet
    .getRange(2, 3, lastRow - 1, 1)
    .protect()
    .setDescription("City - warning before editing");
  p5.setWarningOnly(true);

// 6. WARNING: Column D rows 2+ (Email)
  var p6 = sheet
    .getRange(2, 4, lastRow - 1, 1)
    .protect()
    .setDescription("Email - warning before editing");
  p6.setWarningOnly(true);

// 7. WARNING: Column F rows 2+ (Review text)
  var p7 = sheet
    .getRange(2, 6, lastRow - 1, 1)
    .protect()
    .setDescription("Review - warning before editing");
  p7.setWarningOnly(true);

  // Columns G (Approved) and H (Notes) from row 2+ - no protection, fully free

  Logger.log("Protection applied:");
  Logger.log(
    "  HARD BLOCK : Row 1 (headers), Col A (Timestamp), Col E (Stars)",
  );
  Logger.log(
    "  WARNING    : Col B (Name), Col C (City), Col D (Email), Col F (Review)",
  );
  Logger.log("  FREE       : Col G (Approved), Col H (Notes)");
}

// REMOVE ALL PROTECTION
// Run this if you need to do bulk edits, then run protectSheet() again.
function removeProtection() {
  var sheet = getSheet();
  var ss = sheet.getParent();

  sheet
    .getProtections(SpreadsheetApp.ProtectionType.RANGE)
    .forEach(function (p) {
      p.remove();
    });
  sheet
    .getProtections(SpreadsheetApp.ProtectionType.SHEET)
    .forEach(function (p) {
      p.remove();
    });

  Logger.log("All protections removed. Run protectSheet() again when done.");
}


