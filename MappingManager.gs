/**
 * MappingManager.gs
 * Manages the persistent mapping sheet — the single source of truth
 * for all pseudonym mappings across documents.
 *
 * Mapping sheet structure:
 *   - One tab per domain (Funders, Participants, Organizations, etc.)
 *   - Columns: Original | Pseudonym | Type | Date Added
 */

var MAPPING_SHEET_PROPERTY_KEY_ = "FILE_PREP_MAPPING_SHEET_ID";
var DEFAULT_DOMAINS_ = ["Funders", "Participants", "Organizations"];
var MAPPING_HEADERS_ = ["Original", "Pseudonym", "Type", "Date Added"];

// ─── Mapping Sheet Lifecycle ───

/**
 * Get or create the private mapping sheet.
 * Stores the sheet ID in user properties so it persists.
 *
 * @return {Spreadsheet} The mapping spreadsheet
 */
function getMappingSpreadsheet() {
  var props = PropertiesService.getUserProperties();
  var sheetId = props.getProperty(MAPPING_SHEET_PROPERTY_KEY_);

  if (sheetId) {
    try {
      var ss = SpreadsheetApp.openById(sheetId);
      // Verify it still exists and is accessible
      ss.getName();
      return ss;
    } catch (e) {
      // Sheet was deleted or access revoked; create a new one
      Logger.log("Mapping sheet not found, creating new one: " + e.message);
    }
  }

  return createMappingSpreadsheet_();
}

/**
 * Create a new mapping spreadsheet with default domain tabs.
 * @private
 */
function createMappingSpreadsheet_() {
  var ss = SpreadsheetApp.create("File Prep Mapping (Resource)");

  // Create default domain tabs
  for (var i = 0; i < DEFAULT_DOMAINS_.length; i++) {
    var sheet;
    if (i === 0) {
      // Rename the default sheet
      sheet = ss.getSheets()[0];
      sheet.setName(DEFAULT_DOMAINS_[i]);
    } else {
      sheet = ss.insertSheet(DEFAULT_DOMAINS_[i]);
    }
    // Add headers
    sheet.getRange(1, 1, 1, MAPPING_HEADERS_.length).setValues([MAPPING_HEADERS_]);
    sheet.getRange(1, 1, 1, MAPPING_HEADERS_.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    // Set column widths
    sheet.setColumnWidth(1, 200); // Original
    sheet.setColumnWidth(2, 200); // Pseudonym
    sheet.setColumnWidth(3, 100); // Type
    sheet.setColumnWidth(4, 130); // Date Added
  }

  // Store the ID
  var props = PropertiesService.getUserProperties();
  props.setProperty(MAPPING_SHEET_PROPERTY_KEY_, ss.getId());

  Logger.log("Created mapping sheet: " + ss.getUrl());
  return ss;
}

/**
 * Get the URL of the mapping spreadsheet.
 * @return {string} The URL
 */
function getMappingSheetUrl() {
  var ss = getMappingSpreadsheet();
  return ss.getUrl();
}

// ─── Domain (Tab) Management ───

/**
 * Get all domain tab names from the mapping sheet.
 * @return {string[]} Array of domain names
 */
function getDomains() {
  var ss = getMappingSpreadsheet();
  var sheets = ss.getSheets();
  return sheets.map(function(s) { return s.getName(); });
}

/**
 * Add a new domain tab to the mapping sheet.
 * @param {string} domainName - Name for the new domain
 * @return {boolean} True if created, false if it already exists
 */
function addDomain(domainName) {
  var ss = getMappingSpreadsheet();
  var existing = ss.getSheetByName(domainName);
  if (existing) return false;

  var sheet = ss.insertSheet(domainName);
  sheet.getRange(1, 1, 1, MAPPING_HEADERS_.length).setValues([MAPPING_HEADERS_]);
  sheet.getRange(1, 1, 1, MAPPING_HEADERS_.length).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 200);
  sheet.setColumnWidth(3, 100);
  sheet.setColumnWidth(4, 130);
  return true;
}

// ─── Mapping CRUD ───

/**
 * Load all mappings for a given domain.
 * Returns two lookup objects:
 *   - byOriginal: { "Sarah Johnson": { pseudonym: "S. Jasper", type: "name" } }
 *   - byPseudonym: { "S. Jasper": { original: "Sarah Johnson", type: "name" } }
 *
 * @param {string} domain - The domain tab name
 * @return {Object} { byOriginal, byPseudonym, usedPseudonyms }
 */
function loadMappings(domain) {
  var ss = getMappingSpreadsheet();
  var sheet = ss.getSheetByName(domain);

  var result = { byOriginal: {}, byPseudonym: {}, usedPseudonyms: {} };

  if (!sheet) return result;

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return result; // Only header row

  var data = sheet.getRange(2, 1, lastRow - 1, MAPPING_HEADERS_.length).getValues();

  for (var i = 0; i < data.length; i++) {
    var original = String(data[i][0]).trim();
    var pseudonym = String(data[i][1]).trim();
    var type = String(data[i][2]).trim();

    if (!original || !pseudonym) continue;

    result.byOriginal[original] = { pseudonym: pseudonym, type: type };
    result.byOriginal[original.toLowerCase()] = { pseudonym: pseudonym, type: type };
    result.byPseudonym[pseudonym] = { original: original, type: type };
    result.byPseudonym[pseudonym.toLowerCase()] = { original: original, type: type };
    result.usedPseudonyms[pseudonym] = true;
  }

  return result;
}

/**
 * Add a new mapping to a domain tab.
 *
 * @param {string} domain - The domain tab name
 * @param {string} original - The original value
 * @param {string} pseudonym - The pseudonym
 * @param {string} type - The identifier type (name, email, phone, org)
 */
function addMapping(domain, original, pseudonym, type) {
  var ss = getMappingSpreadsheet();
  var sheet = ss.getSheetByName(domain);

  if (!sheet) {
    addDomain(domain);
    sheet = ss.getSheetByName(domain);
  }

  var nextRow = sheet.getLastRow() + 1;
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  sheet.getRange(nextRow, 1, 1, 4).setValues([[original, pseudonym, type, now]]);
}

/**
 * Get or create a pseudonym for a given value.
 * If the value already has a mapping, returns the existing pseudonym.
 * Otherwise, generates a new one and saves it.
 *
 * @param {string} domain - The domain tab name
 * @param {string} value - The original value to anonymize
 * @param {string} type - The identifier type (name, email, phone, org)
 * @param {Object} mappings - Pre-loaded mappings from loadMappings()
 * @param {number} [phoneCounter] - Counter for phone generation
 * @return {string} The pseudonym
 */
function getOrCreatePseudonym(domain, value, type, mappings, phoneCounter) {
  var trimmed = value.trim();

  // Check existing
  var existing = mappings.byOriginal[trimmed] || mappings.byOriginal[trimmed.toLowerCase()];
  if (existing) return existing.pseudonym;

  // Generate new pseudonym
  var pseudonym;
  switch (type) {
    case "name":
      pseudonym = generatePersonPseudonym(trimmed, mappings.usedPseudonyms);
      break;
    case "org":
      pseudonym = generateOrgPseudonym(trimmed, mappings.usedPseudonyms);
      break;
    case "email":
      // Try to find associated person/org pseudonym first
      var localPart = trimmed.split("@")[0];
      var assocPseudo = mappings.byOriginal[localPart];
      if (assocPseudo) {
        pseudonym = generateEmailPseudonym(assocPseudo.pseudonym);
      } else {
        pseudonym = generateEmailPseudonym(
          generatePersonPseudonym(localPart, mappings.usedPseudonyms)
        );
      }
      break;
    case "phone":
      pseudonym = generatePhonePseudonym(trimmed, phoneCounter || 1);
      break;
    default:
      pseudonym = generatePersonPseudonym(trimmed, mappings.usedPseudonyms);
  }

  // Save to mapping sheet and update in-memory cache
  addMapping(domain, trimmed, pseudonym, type);
  mappings.byOriginal[trimmed] = { pseudonym: pseudonym, type: type };
  mappings.byOriginal[trimmed.toLowerCase()] = { pseudonym: pseudonym, type: type };
  mappings.byPseudonym[pseudonym] = { original: trimmed, type: type };
  mappings.byPseudonym[pseudonym.toLowerCase()] = { original: trimmed, type: type };
  mappings.usedPseudonyms[pseudonym] = true;

  return pseudonym;
}

/**
 * Load ALL mappings across ALL domains.
 * Used for Docs anonymization where we don't know which domain a name belongs to.
 *
 * @return {Object} Combined { byOriginal, byPseudonym, usedPseudonyms }
 */
function loadAllMappings() {
  var combined = { byOriginal: {}, byPseudonym: {}, usedPseudonyms: {} };
  var domains = getDomains();

  for (var d = 0; d < domains.length; d++) {
    var m = loadMappings(domains[d]);

    for (var key in m.byOriginal) {
      combined.byOriginal[key] = m.byOriginal[key];
    }
    for (var key in m.byPseudonym) {
      combined.byPseudonym[key] = m.byPseudonym[key];
    }
    for (var key in m.usedPseudonyms) {
      combined.usedPseudonyms[key] = true;
    }
  }

  return combined;
}
