const DISCORD_WEBHOOK_URL = "";

const NAME_FIELD_TITLE = "Your name";
const PHONE_FIELD_TITLE = "Your contact number";
const DEFAULT_COUNTRY_CODE = "91";

const TARGET_SPREADSHEET_ID = "1geFgIn4mAlObjLG0GJhuZZdmrNVD4AZP32ccCYVuZOA";
const TARGET_SHEET_NAME = "Tutors (Applied)";
const SOURCE_SPREADSHEET_ID = "1dV81Xz5FnnN3OUrX9u1H_HtNpc0fiXeDA79gSjoi4c4";
const SOURCE_SHEET_NAME = "Tutors Applications";

const TARGET_HEADERS = [
  "App ID", "Submitted At", "Email", "Name", "Phone",
  "Student or Working", "College / Company", "Stay Location",
  "Travel Mode", "Classes", "Subjects", "Languages",
  "Extra Activities", "Available Timings", "Expected Pay",
  "Referral", "Open to Contact", "College / Work Timings",
  "Contacted", "Notes", "Mail Sent",
  "Last Called Date", "Interview Status", "Interview Scheduled At",
  "Current Students", "Rating"
];

// Headers for the Parents target sheets
const TARGET_PARENTS_HEADERS = [
  "Parent ID", "Onboarded On", "Customer Full Name", "Phone", "Email",
  "Location", "Address", "Student Name", "Student Grade",
  "Subjects Needed", "Assigned Tutor", "Last Contacted Date",
  "Contacted", "Notes", "Mailed"
];

// Fill these in before running migrateParentsToSheet()
const PARENTS_SOURCE_SPREADSHEET_ID = "PASTE_PARENTS_SOURCE_SPREADSHEET_ID_HERE";
const PARENTS_SOURCE_SHEET_NAME     = "PASTE_PARENTS_SOURCE_SHEET_NAME_HERE";
// Map: source column header → TARGET_PARENTS_HEADERS column name
// Update these to match the exact header names in your source sheet
const PARENTS_COLUMN_MAP = {
  "Customer Full Name":             "Customer Full Name",
  "Phone num":                      "Phone",
  "Email":                          "Email",
  "Location":                       "Location",
  "Office/ House Address/ other details": "Address"
};

// Maps each target column to the exact form question it comes from.
// getResponse() normalizes whitespace/case so minor header variations are tolerated.
// If a form question is renamed in future, only update this map.
const TARGET_TO_FORM = {
  "Submitted At":           "Timestamp",
  "Email":                  "Email address",
  "Name":                   "Your name",
  "Phone":                  "Your contact number",
  "Student or Working":     "Student/working",
  "College / Company":      "College/Company Name & Location",
  "Stay Location":          "Current stay location",
  "Travel Mode":            "Travel source everyday",
  "Classes":                "Classes you can teach",
  "Subjects":               "Subjects you can teach",
  "Languages":              "Languages you can teach/speak",
  "Extra Activities":       "Extra activities you can teach/train",
  "Available Timings":      "What are your available timings for classes(mention your specific timings in other)",
  "Expected Pay":           "How much pay are you expecting(be in specific per hour)",
  "Referral":               "Refer any friend who you think is best for this role(Name and their contact number)",
  "Open to Contact":        "Do you want us to contact you if any requirements? And do you want to work with us?",
  "College / Work Timings": "Your college/work timings"
};


// ─── TRIGGER ENTRY POINT ────────────────────────────────────────────────────

/**
 * Runs automatically through the spreadsheet
 * "On form submit" installable trigger.
 */
function sendFormToDiscord(e) {
  if (!e || !e.values || !e.range) {
    throw new Error(
      "No form submission was provided. Use testDiscordWebhook() for testing."
    );
  }

  const submission = createOrderedSubmissionFromEvent(e);

  console.log(JSON.stringify(submission.namedValues, null, 2));

  // Both operations run independently — a Discord failure won't block the sync.
  try {
    sendSubmissionToDiscord(submission.namedValues, submission.orderedTitles);
  } catch (discordError) {
    Logger.log("Discord notification failed: " + discordError.message);
  }

  syncSubmissionToTargetSheet(submission.namedValues);
}


// ─── TARGET SHEET SYNC ──────────────────────────────────────────────────────

/**
 * Copies one form submission into the target sheet.
 * Safe to call on trigger retry — duplicate timestamps are skipped.
 * Uses a script lock so simultaneous submissions don't race.
 */
function syncSubmissionToTargetSheet(namedValues) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sheet = getOrCreateTargetSheet();
    const existingTimestamps = getExistingTimestamps(sheet);
    const submittedAt = getResponse(namedValues, "Timestamp");

    if (existingTimestamps.has(submittedAt)) {
      Logger.log("Duplicate — already in target sheet: " + submittedAt);
      return;
    }

    const appId = generateAppId(sheet);
    sheet.appendRow(buildTargetRow(namedValues, appId));
    Logger.log("Synced to target sheet: " + appId);
  } finally {
    lock.releaseLock();
  }
}


/**
 * One-time backfill: copies all existing parent-sheet responses
 * into the target sheet. Already-synced rows are skipped.
 * Run manually from the Apps Script editor once.
 */
function backfillParentToTarget() {
  const sourceSheet = SpreadsheetApp
    .openById(SOURCE_SPREADSHEET_ID)
    .getSheetByName(SOURCE_SHEET_NAME);

  if (!sourceSheet) throw new Error(`Source sheet "${SOURCE_SHEET_NAME}" not found.`);

  const lastRow = sourceSheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log("No data rows found in parent sheet.");
    return;
  }

  const lastCol = sourceSheet.getLastColumn();
  const headers = sourceSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  // getDisplayValues preserves the formatted timestamp string exactly as shown in the cell.
  const dataRows = sourceSheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

  const targetSheet = getOrCreateTargetSheet();
  const existingTimestamps = getExistingTimestamps(targetSheet);

  let synced = 0;
  let skipped = 0;

  dataRows.forEach(rowValues => {
    const namedValues = {};
    headers.forEach((header, index) => {
      const cleanedHeader = String(header || "").trim();
      if (cleanedHeader) {
        namedValues[cleanedHeader] = [String(rowValues[index] ?? "")];
      }
    });

    const submittedAt = getResponse(namedValues, "Timestamp");

    if (existingTimestamps.has(submittedAt)) {
      skipped++;
      return;
    }

    const appId = generateAppId(targetSheet);
    targetSheet.appendRow(buildTargetRow(namedValues, appId));
    existingTimestamps.add(submittedAt);
    synced++;

    Utilities.sleep(150); // stay within Sheets API write rate limits
  });

  Logger.log(`Backfill complete — synced: ${synced}, skipped: ${skipped}`);
}


// ─── SCHEMA INIT ────────────────────────────────────────────────────────────

/**
 * One-time: adds any missing TARGET_HEADERS columns to all Tutors tabs.
 * Safe to re-run — existing columns and data are never touched.
 * Run manually from the Apps Script editor once after updating TARGET_HEADERS.
 */
function initTutorSchemaColumns() {
  const ss      = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const tutorTabs = [
    TARGET_SHEET_NAME,
    "Tutors (In-Loop)",
    "Tutors (Onboarded)",
    "Tutors (Bin)"
  ];

  tutorTabs.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      Logger.log(`Skipped — sheet not found: ${tabName}`);
      return;
    }

    const lastCol    = sheet.getLastColumn();
    const existingHeaders = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim())
      : [];

    const headersToAdd = tabName === "Tutors (Bin)"
      ? [...TARGET_HEADERS, "Deleted At", "Original Tab"]
      : TARGET_HEADERS;

    headersToAdd.forEach((header, i) => {
      if (!existingHeaders.includes(header)) {
        const col = existingHeaders.length + 1;
        sheet.getRange(1, col).setValue(header).setFontWeight("bold");
        existingHeaders.push(header);
        Logger.log(`Added column "${header}" to "${tabName}" at col ${col}`);
      }
    });
  });

  Logger.log("initTutorSchemaColumns complete.");
}

/**
 * One-time fix: removes duplicate header columns, keeping only the first
 * occurrence of each header name. Run once after duplicate columns appeared.
 */
function fixDuplicateHeaders() {
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const tabs = ["Tutors (Applied)", "Tutors (In-Loop)", "Tutors (Onboarded)", "Tutors (Bin)"];

  tabs.forEach(tabName => {
    const sheet = ss.getSheetByName(tabName);
    if (!sheet) return;

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    const seen = new Set();
    // Iterate right-to-left so we delete later dupes first (avoids index shift)
    for (let i = lastCol - 1; i >= 0; i--) {
      const h = String(headers[i]).trim();
      if (seen.has(h)) {
        sheet.deleteColumn(i + 1);
        Logger.log(`Deleted duplicate column "${h}" at col ${i + 1} in "${tabName}"`);
      } else {
        seen.add(h);
      }
    }
  });

  Logger.log("fixDuplicateHeaders complete.");
}

/**
 * One-time: migrates all parent records from the source spreadsheet into
 * "Parents (To-Contact)". Fill in PARENTS_SOURCE_SPREADSHEET_ID and
 * PARENTS_SOURCE_SHEET_NAME at the top before running.
 *
 * Uses a single batch setValues() call — handles 3700+ rows in one shot,
 * well within Apps Script's 6-minute execution limit.
 */
function migrateParentsToSheet() {
  if (PARENTS_SOURCE_SPREADSHEET_ID === "PASTE_PARENTS_SOURCE_SPREADSHEET_ID_HERE") {
    throw new Error("Set PARENTS_SOURCE_SPREADSHEET_ID before running this function.");
  }

  const src   = SpreadsheetApp.openById(PARENTS_SOURCE_SPREADSHEET_ID)
                              .getSheetByName(PARENTS_SOURCE_SHEET_NAME);
  if (!src) throw new Error(`Source sheet "${PARENTS_SOURCE_SHEET_NAME}" not found.`);

  const srcLastRow = src.getLastRow();
  if (srcLastRow <= 1) { Logger.log("No data rows in source."); return; }

  const srcLastCol = src.getLastColumn();
  const srcHeaders = src.getRange(1, 1, 1, srcLastCol).getValues()[0].map(h => String(h).trim());
  const srcData    = src.getRange(2, 1, srcLastRow - 1, srcLastCol).getDisplayValues();

  const ss     = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const target = ss.getSheetByName("Parents (To-Contact)");
  if (!target) throw new Error('Sheet "Parents (To-Contact)" not found in target spreadsheet.');

  // Write headers if sheet is empty
  if (target.getLastRow() === 0) {
    target.appendRow(TARGET_PARENTS_HEADERS);
    target.getRange(1, 1, 1, TARGET_PARENTS_HEADERS.length).setFontWeight("bold");
    target.setFrozenRows(1);
  }

  // Bail if data already exists — this is a one-time migration
  if (target.getLastRow() > 1) {
    Logger.log(`Target already has ${target.getLastRow() - 1} rows. Delete them first to re-run.`);
    return;
  }

  // Build all rows in memory, then write in one batch
  let parentIdCounter = 1;
  const rows = srcData.map(srcRow => {
    const srcMap = {};
    srcHeaders.forEach((h, i) => { srcMap[h] = String(srcRow[i] || "").trim(); });

    const parentId = "KB-P-" + String(parentIdCounter++).padStart(4, "0");
    const importedAt = new Date().toLocaleDateString("en-IN"); // DD/MM/YYYY

    return TARGET_PARENTS_HEADERS.map(header => {
      if (header === "Parent ID")           return parentId;
      if (header === "Onboarded On")        return importedAt;
      if (header === "Contacted")           return "No";
      if (header === "Notes")               return "";
      if (header === "Mailed")              return "No";
      if (header === "Student Name")        return "";
      if (header === "Student Grade")       return "";
      if (header === "Subjects Needed")     return "";
      if (header === "Assigned Tutor")      return "";
      if (header === "Last Contacted Date") return "";

      const srcKey = Object.keys(PARENTS_COLUMN_MAP).find(
        k => PARENTS_COLUMN_MAP[k] === header
      );
      return srcKey ? (srcMap[srcKey] || "") : "";
    });
  });

  // Single batch write — fast even for 3700+ rows
  target.getRange(2, 1, rows.length, TARGET_PARENTS_HEADERS.length).setValues(rows);
  Logger.log(`migrateParentsToSheet complete — ${rows.length} rows written.`);
}


// ─── TARGET SHEET HELPERS ───────────────────────────────────────────────────

function getOrCreateTargetSheet() {
  const ss = SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(TARGET_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      `Sheet "${TARGET_SHEET_NAME}" not found in target spreadsheet. ` +
      "Check the sheet name matches exactly."
    );
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(TARGET_HEADERS);
    sheet.getRange(1, 1, 1, TARGET_HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    Logger.log("Header row written to target sheet.");
  }

  return sheet;
}


/**
 * Returns a Set of all "Submitted At" values already in the target sheet.
 * Used to skip duplicates during sync and backfill.
 */
function getExistingTimestamps(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();

  // "Submitted At" is column B (index 2)
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  return new Set(values.map(row => String(row[0]).trim()));
}


/**
 * Generates the next App ID by reading the current row count.
 * Format: KB-001, KB-002, …
 * Do not delete rows in the target sheet — IDs are tied to row position.
 */
function generateAppId(sheet) {
  const nextNumber = Math.max(sheet.getLastRow(), 1);
  return "KB-" + String(nextNumber).padStart(3, "0");
}


/**
 * Builds a full row array in TARGET_HEADERS order.
 * Workflow columns default to their initial values.
 */
function buildTargetRow(namedValues, appId) {
  return TARGET_HEADERS.map(header => {
    if (header === "App ID")                return appId;
    if (header === "Contacted")             return "No";
    if (header === "Notes")                 return "";
    if (header === "Mail Sent")             return "No";
    if (header === "Last Called Date")      return "";
    if (header === "Interview Status")      return "";
    if (header === "Interview Scheduled At") return "";
    if (header === "Current Students")      return "";
    if (header === "Rating")                return "";

    const formQuestion = TARGET_TO_FORM[header];
    if (!formQuestion) return "";

    const value = getResponse(namedValues, formQuestion);
    return value === "—" ? "" : value;
  });
}


// ─── DISCORD ────────────────────────────────────────────────────────────────

/**
 * Reads the spreadsheet headers from left to right.
 * This guarantees the same order as the Form responses sheet.
 */
function createOrderedSubmissionFromEvent(e) {
  const sheet = e.range.getSheet();
  const startingColumn = e.range.getColumn();
  const numberOfValues = e.values.length;

  const headers = sheet
    .getRange(1, startingColumn, 1, numberOfValues)
    .getDisplayValues()[0];

  const namedValues = {};
  const orderedTitles = [];

  headers.forEach((header, index) => {
    const cleanedHeader = String(header || "").trim();

    if (!cleanedHeader) {
      return;
    }

    namedValues[cleanedHeader] = [String(e.values[index] ?? "")];
    orderedTitles.push(cleanedHeader);
  });

  return { namedValues, orderedTitles };
}


/**
 * Creates and sends one Discord message.
 */
function sendSubmissionToDiscord(namedValues, orderedTitles) {
  validateWebhookUrl();

  const tutorName =
    getResponse(namedValues, NAME_FIELD_TITLE) || "Unknown tutor";

  const rawPhoneNumber =
    getResponse(namedValues, PHONE_FIELD_TITLE) || "Not provided";

  const phoneDigits = normalizePhoneNumber(rawPhoneNumber);
  const displayPhone = phoneDigits ? `+${phoneDigits}` : rawPhoneNumber;

  const whatsappMessage =
    `Hello ${tutorName}, I'm contacting you regarding your ` +
    "submission for KidsBuddy home tuitions.";

  const whatsappUrl = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(whatsappMessage)}`
    : null;

  const fields = [
    {
      name: "› Name",
      value: truncate(tutorName, 1024),
      inline: true
    },
    {
      name: "› Phone number",
      value: `\`${truncate(displayPhone, 1000)}\``,
      inline: true
    }
  ];

  if (whatsappUrl) {
    fields.push({
      name: "› Quick contact",
      value: `**[Open WhatsApp conversation ↗](${whatsappUrl})**`,
      inline: false
    });
  }

  orderedTitles.forEach(title => {
    if (
      titlesMatch(title, NAME_FIELD_TITLE) ||
      titlesMatch(title, PHONE_FIELD_TITLE)
    ) {
      return;
    }

    const response = getResponse(namedValues, title);

    fields.push({
      name: truncate(`› ${title}`, 256),
      value: truncate(response || "—", 1024),
      inline: false
    });
  });

  /*
   * Discord allows a maximum of 25 fields per embed.
   * Extra fields are placed in another embed while
   * remaining inside the same Discord message.
   */
  const fieldGroups = chunkArray(fields, 25);

  const embeds = fieldGroups.map((group, index) => {
    const isFirstEmbed = index === 0;
    const isLastEmbed = index === fieldGroups.length - 1;

    const embed = {
      color: 0x5865F2,
      fields: group
    };

    if (isFirstEmbed) {
      embed.title = truncate(`${tutorName} | ${displayPhone}`, 256);
      embed.description = "━━━━━━━━━━━━━━━━━━━━━━━━";
    } else {
      embed.title = truncate(`${tutorName} | Continued`, 256);
    }

    if (isLastEmbed) {
      embed.footer = {
        text: "KidsBuddy Home Tuitions • Tutor Submission"
      };
      embed.timestamp = new Date().toISOString();
    }

    return embed;
  });

  const payload = {
    username: "KidsBuddy Tutor Submissions",
    allowed_mentions: { parse: [] },
    embeds
  };

  postToDiscord(payload);
}


/**
 * Posts the completed message through Discord webhook.
 */
function postToDiscord(payload) {
  const separator = DISCORD_WEBHOOK_URL.includes("?") ? "&" : "?";
  const requestUrl = `${DISCORD_WEBHOOK_URL}${separator}wait=true`;

  const response = UrlFetchApp.fetch(requestUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(`Discord returned ${status}: ` + response.getContentText());
  }

  Logger.log("Submission successfully sent to Discord.");
}


// ─── TEST HELPERS ────────────────────────────────────────────────────────────

/**
 * Run this manually to test the Discord output.
 */
function testDiscordWebhook() {
  const sampleSubmission = {
    "Timestamp": ["07/09/2026 13:31:31"],
    "Email address": ["rahul.sharma@example.com"],
    "Your name": ["Rahul Sharma"],
    "Your contact number": ["9876543210"],
    "Student/working": ["Working"],
    "College/Company Name & Location": ["Amazon, Gachibowli"],
    "Current stay location": ["Gachibowli, Hyderabad"],
    "Travel source everyday": ["Bike"],
    "Classes you can teach": ["Classes 6-10"],
    "Subjects you can teach": ["Mathematics and Science"],
    "Languages you can teach/speak": ["English, Telugu"],
    "Extra activities you can teach/train": ["—"],
    "What are your available timings for classes(mention your specific timings in other)": ["6pm–8pm"],
    "How much pay are you expecting(be in specific per hour)": ["500"],
    "Refer any friend who you think is best for this role(Name and their contact number)": ["—"],
    "Do you want us to contact you if any requirements? And do you want to work with us?": ["Yes"],
    "Your college/work timings": ["9am–6pm"]
  };

  sendSubmissionToDiscord(sampleSubmission, Object.keys(sampleSubmission));
}


/**
 * Run this manually to test syncing one row to the target sheet.
 * Delete the inserted test row afterwards.
 */
function testSyncToTargetSheet() {
  const sampleSubmission = {
    "Timestamp": ["TEST-" + new Date().toISOString()],
    "Email address": ["test@example.com"],
    "Your name": ["Test User"],
    "Your contact number": ["9000000000"],
    "Student/working": ["Working"],
    "College/Company Name & Location": ["Test Company, Hyderabad"],
    "Current stay location": ["Hyderabad"],
    "Travel source everyday": ["Bike"],
    "Classes you can teach": ["Classes 1-5"],
    "Subjects you can teach": ["Mathematics"],
    "Languages you can teach/speak": ["English"],
    "Extra activities you can teach/train": ["—"],
    "What are your available timings for classes(mention your specific timings in other)": ["6pm–8pm"],
    "How much pay are you expecting(be in specific per hour)": ["400"],
    "Refer any friend who you think is best for this role(Name and their contact number)": ["—"],
    "Do you want us to contact you if any requirements? And do you want to work with us?": ["Yes"],
    "Your college/work timings": ["9am–5pm"]
  };

  syncSubmissionToTargetSheet(sampleSubmission);
  Logger.log("testSyncToTargetSheet complete — delete the test row from the target sheet.");
}


// ─── UTILITIES ───────────────────────────────────────────────────────────────

/**
 * Finds a response even if the Sheet header contains
 * extra spaces or different capitalization.
 */
function getResponse(namedValues, expectedTitle) {
  const normalizedExpected = normalizeTitle(expectedTitle);

  const matchingKey = Object.keys(namedValues).find(
    key => normalizeTitle(key) === normalizedExpected
  );

  if (!matchingKey) return "";

  return formatResponse(namedValues[matchingKey]);
}


function titlesMatch(firstTitle, secondTitle) {
  return normalizeTitle(firstTitle) === normalizeTitle(secondTitle);
}


function normalizeTitle(title) {
  return String(title || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}


function formatResponse(answers) {
  if (Array.isArray(answers)) {
    const value = answers
      .map(answer => String(answer).trim())
      .filter(Boolean)
      .join(", ");

    return value || "—";
  }

  return String(answers || "").trim() || "—";
}


function normalizePhoneNumber(phoneNumber) {
  let digits = String(phoneNumber || "").replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length === 10) {
    digits = DEFAULT_COUNTRY_CODE + digits;
  }

  if (digits.startsWith("0" + DEFAULT_COUNTRY_CODE)) {
    digits = digits.substring(1);
  }

  return digits;
}


function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}


function truncate(value, maximumLength) {
  const text = String(value || "—");

  if (text.length <= maximumLength) return text;

  return text.substring(0, maximumLength - 1) + "…";
}


function validateWebhookUrl() {
  if (
    !DISCORD_WEBHOOK_URL ||
    DISCORD_WEBHOOK_URL === "PASTE_NEW_DISCORD_WEBHOOK_URL_HERE"
  ) {
    throw new Error("Paste your new Discord webhook URL at the top.");
  }
}
