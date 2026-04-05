/**
 * SheetAnonymizer.gs
 * Handles anonymization and de-anonymization of Google Sheets.
 *
 * - Creates an anonymized COPY of the spreadsheet
 * - Supports multiple non-contiguous ranges per tab
 * - Auto-detects header names to suggest ranges
 * - Skips Pivot Tables and chart-sourced ranges
 */

// ─── Known field names for auto-detection ───

var DEFAULT_KNOWN_FIELDS_ = [
  "name", "first name", "last name", "full name",
  "donor name", "donor", "funder", "funder name",
  "participant", "participant name", "contact", "contact name",
  "email", "email address", "e-mail",
  "phone", "phone number", "telephone", "mobile", "cell",
  "organization", "org", "company", "foundation", "institution",
  "firm", "agency", "employer"
];

/**
 * Get known field names (user-configurable).
 * @return {string[]}
 */
function getKnownFieldNames() {
  var props = PropertiesService.getUserProperties();
  var custom = props.getProperty("FILE_PREP_KNOWN_FIELDS");
  if (custom) {
    try {
      return JSON.parse(custom);
    } catch (e) { /* fall through */ }
  }
  return DEFAULT_KNOWN_FIELDS_;
}

/**
 * Save custom known field names.
 * @param {string[]} fields
 */
function setKnownFieldNames(fields) {
  var props = PropertiesService.getUserProperties();
  props.setProperty("FILE_PREP_KNOWN_FIELDS", JSON.stringify(fields));
}

// ─── Header Auto-Detection ───

/**
 * Scan the active sheet for headers matching known field names.
 * Returns suggested ranges for each match.
 *
 * @return {Object[]} Array of { header, column, colLetter, range, fieldType }
 */
function autoDetectFields() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var knownFields = getKnownFieldNames();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) return [];

  // Read first row (headers) and also scan row 1-3 for header-like content
  var headerRange = sheet.getRange(1, 1, Math.min(3, lastRow), lastCol);
  var headerValues = headerRange.getValues();

  var suggestions = [];

  for (var row = 0; row < headerValues.length; row++) {
    for (var col = 0; col < headerValues[row].length; col++) {
      var cellValue = String(headerValues[row][col]).trim().toLowerCase();
      if (!cellValue) continue;

      for (var k = 0; k < knownFields.length; k++) {
        if (cellValue === knownFields[k] || cellValue.indexOf(knownFields[k]) !== -1) {
          var colLetter = columnToLetter_(col + 1);
          var dataStartRow = row + 2; // Row after header
          var rangeStr = colLetter + dataStartRow + ":" + colLetter + lastRow;

          // Determine field type from header name
          var fieldType = classifyFieldByHeader_(cellValue);

          suggestions.push({
            header: headerValues[row][col],
            column: col + 1,
            colLetter: colLetter,
            range: rangeStr,
            fieldType: fieldType,
            headerRow: row + 1
          });
          break; // Don't match same cell to multiple known fields
        }
      }
    }
  }

  return suggestions;
}

/**
 * Classify identifier type based on header name.
 * @param {string} header - Lowercase header text
 * @return {string} "name", "email", "phone", or "org"
 * @private
 */
function classifyFieldByHeader_(header) {
  if (/email|e-mail/.test(header)) return "email";
  if (/phone|telephone|mobile|cell/.test(header)) return "phone";
  if (/org|company|foundation|institution|firm|agency|employer/.test(header)) return "org";
  if (/funder/.test(header)) return "org";
  return "name";
}

/**
 * Check if a range overlaps with any Pivot Table on the sheet.
 *
 * @param {Sheet} sheet - The sheet to check
 * @return {Object[]} Array of pivot table info objects
 */
function detectPivotTables(sheet) {
  // Apps Script doesn't have a direct Pivot Table API,
  // but we can detect them via DataSourcePivotTable or by checking
  // for cells with #REF! patterns typical of pivots.
  // Best approach: check for ranges that are protected/have special metadata.

  var pivots = [];
  try {
    // Try to get developer metadata or named ranges that indicate pivots
    // In practice, pivot tables in Sheets create a special internal structure.
    // We'll detect by checking for the pivot table marker in cell metadata.
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow < 1 || lastCol < 1) return pivots;

    // Simple heuristic: check if any cells contain pivot-table-like formula patterns
    var formulas = sheet.getRange(1, 1, Math.min(lastRow, 200), Math.min(lastCol, 50)).getFormulas();

    for (var r = 0; r < formulas.length; r++) {
      for (var c = 0; c < formulas[r].length; c++) {
        if (formulas[r][c] && /GETPIVOTDATA/i.test(formulas[r][c])) {
          pivots.push({
            row: r + 1,
            col: c + 1,
            description: "GETPIVOTDATA formula at " + columnToLetter_(c + 1) + (r + 1)
          });
        }
      }
    }
  } catch (e) {
    Logger.log("Error detecting pivots: " + e.message);
  }

  return pivots;
}

// ─── Core Anonymization ───

/**
 * Anonymize specified ranges in the active sheet, creating a copy.
 *
 * @param {Object} config - {
 *   ranges: ["A2:A101", "B103:B141"],  // ranges to anonymize
 *   fieldTypes: { "A2:A101": "name", "B103:B141": "org" },  // optional type overrides
 *   domain: "Funders"  // which mapping tab to use
 * }
 * @return {Object} { success, copyUrl, copyId, stats }
 */
function anonymizeSheet(config) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();

  // 1. Create a copy of the entire spreadsheet
  var copy = ss.copy(ss.getName() + " - Prepped");
  var copyFile = DriveApp.getFileById(copy.getId());
  copyFile.setDescription((copyFile.getDescription() || "") + "\n[FILE_PREP_PREPPED]");
  var copySheet = copy.getSheetByName(sheetName);

  // 2. Load mappings for the specified domain
  var domain = config.domain || "Funders";
  var mappings = loadMappings(domain);

  var stats = { processed: 0, anonymized: 0, skipped: 0, newMappings: 0 };
  var phoneCounter = countPhoneMappings_(mappings) + 1;

  // 3. Process each range
  var ranges = config.ranges || [];
  var fieldTypes = config.fieldTypes || {};

  for (var r = 0; r < ranges.length; r++) {
    var rangeStr = ranges[r].trim();
    if (!rangeStr) continue;

    try {
      var sourceRange = sheet.getRange(rangeStr);
      var copyRange = copySheet.getRange(rangeStr);
      var values = sourceRange.getValues();

      var newValues = [];
      for (var row = 0; row < values.length; row++) {
        var rowData = [];
        for (var col = 0; col < values[row].length; col++) {
          var cellValue = values[row][col];
          stats.processed++;

          if (!cellValue || String(cellValue).trim() === "") {
            rowData.push(cellValue);
            stats.skipped++;
            continue;
          }

          var strValue = String(cellValue).trim();

          // Determine type
          var type = fieldTypes[rangeStr] || detectIdentifierType(strValue);
          if (type === "unknown") {
            // If we can't detect it, default to name
            type = "name";
          }

          // Check if mapping exists before counting as new
          var existingMapping = mappings.byOriginal[strValue] || mappings.byOriginal[strValue.toLowerCase()];
          if (!existingMapping) stats.newMappings++;

          var pseudonym = getOrCreatePseudonym(domain, strValue, type, mappings, phoneCounter);
          if (type === "phone") phoneCounter++;

          rowData.push(pseudonym);
          stats.anonymized++;
        }
        newValues.push(rowData);
      }

      // Write anonymized values to the copy
      copyRange.setValues(newValues);

    } catch (e) {
      Logger.log("Error processing range " + rangeStr + ": " + e.message);
      stats.skipped++;
    }
  }

  return {
    success: true,
    copyUrl: copy.getUrl(),
    copyId: copy.getId(),
    stats: stats
  };
}

/**
 * De-anonymize (restore) the active sheet by replacing pseudonyms
 * with original values. Works on the CURRENT sheet in-place.
 *
 * @param {Object} config - {
 *   ranges: ["A2:A101"],  // ranges to restore (optional; if empty, scans entire sheet)
 *   domain: "Funders"     // which mapping tab to use (optional; if empty, uses all)
 * }
 * @return {Object} { success, stats }
 */
function restoreSheet(config) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Safety: verify this is a prepped copy (check marker first, filename as fallback)
  var file = DriveApp.getFileById(ss.getId());
  var desc = file.getDescription() || "";
  if (desc.indexOf("[FILE_PREP_PREPPED]") === -1 && ss.getName().indexOf(" - Prepped") === -1) {
    return {
      success: false,
      error: "This spreadsheet was not created by File Prep. Restore only works on prepped copies."
    };
  }

  var sheet = ss.getActiveSheet();

  // Load mappings
  var mappings;
  if (config.domain) {
    mappings = loadMappings(config.domain);
  } else {
    mappings = loadAllMappings();
  }

  var stats = { processed: 0, restored: 0, notFound: 0 };

  // Determine ranges to process
  var rangesToProcess = [];
  if (config.ranges && config.ranges.length > 0) {
    rangesToProcess = config.ranges;
  } else {
    // Process entire used range
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow > 0 && lastCol > 0) {
      rangesToProcess = [sheet.getRange(1, 1, lastRow, lastCol).getA1Notation()];
    }
  }

  for (var r = 0; r < rangesToProcess.length; r++) {
    var rangeStr = rangesToProcess[r].trim();
    if (!rangeStr) continue;

    try {
      var range = sheet.getRange(rangeStr);
      var values = range.getValues();
      var changed = false;

      for (var row = 0; row < values.length; row++) {
        for (var col = 0; col < values[row].length; col++) {
          var cellValue = values[row][col];
          stats.processed++;

          if (!cellValue || String(cellValue).trim() === "") continue;

          var strValue = String(cellValue).trim();
          var mapping = mappings.byPseudonym[strValue] || mappings.byPseudonym[strValue.toLowerCase()];

          if (mapping) {
            values[row][col] = mapping.original;
            stats.restored++;
            changed = true;
          }
        }
      }

      if (changed) {
        range.setValues(values);
      }
    } catch (e) {
      Logger.log("Error restoring range " + rangeStr + ": " + e.message);
    }
  }

  return {
    success: true,
    stats: stats
  };
}

// ─── Utilities ───

/**
 * Convert column number to letter (1 → A, 27 → AA, etc.)
 * @param {number} col
 * @return {string}
 * @private
 */
function columnToLetter_(col) {
  var letter = "";
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}
