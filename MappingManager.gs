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
      // Check if this org/fund name is related to an existing org
      // E.g., "Kim Family DAF - Goldman Sachs" contains "Kim Family" which
      // matches "Kim Family Trust" → derive from its pseudonym "Kelp"
      var orgAssoc = findOrgAssociation_(trimmed, mappings);
      if (orgAssoc) {
        pseudonym = deriveRelatedOrgName_(orgAssoc, mappings.usedPseudonyms);
      } else {
        pseudonym = generateOrgPseudonym(trimmed, mappings.usedPseudonyms);
      }
      break;
    case "email":
      // Derive email from the associated person/org pseudonym
      var emailAssoc = findEmailAssociation_(trimmed, mappings);
      if (emailAssoc) {
        pseudonym = generateEmailPseudonym(emailAssoc);
      } else {
        var localPart = trimmed.split("@")[0];
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
  saveMappingToCache_(domain, trimmed, pseudonym, type, mappings);

  // For coupled names ("David & Rachel Kim" → "D. & R. Kendall"),
  // also create sub-mappings for individual names so freetext can catch them.
  if (type === "name") {
    var couple = parseCoupledName(trimmed);
    if (couple) {
      // Extract the pseudonym's last name: "D. & R. Kendall" → "Kendall"
      var pseudoParts = pseudonym.match(/(\S+)$/);
      var pseudoLast = pseudoParts ? pseudoParts[1] : pseudonym;

      // Map each individual: "Rachel Kim" → "R. Kendall", "David Kim" → "D. Kendall"
      var subMappings = [
        { original: couple.person1Full, pseudo: couple.person1First.charAt(0).toUpperCase() + ". " + pseudoLast },
        { original: couple.person2Full, pseudo: couple.person2First.charAt(0).toUpperCase() + ". " + pseudoLast },
        { original: couple.person1First, pseudo: couple.person1First.charAt(0).toUpperCase() + ". " + pseudoLast },
        { original: couple.person2First, pseudo: couple.person2First.charAt(0).toUpperCase() + ". " + pseudoLast }
      ];

      for (var s = 0; s < subMappings.length; s++) {
        var sub = subMappings[s];
        if (!mappings.byOriginal[sub.original] && !mappings.byOriginal[sub.original.toLowerCase()]) {
          saveMappingToCache_(domain, sub.original, sub.pseudo, "name", mappings);
        }
      }
    }
  }

  return pseudonym;
}

/**
 * Save a mapping to the sheet and update in-memory cache.
 * @private
 */
function saveMappingToCache_(domain, original, pseudonym, type, mappings) {
  addMapping(domain, original, pseudonym, type);
  mappings.byOriginal[original] = { pseudonym: pseudonym, type: type, original: original };
  mappings.byOriginal[original.toLowerCase()] = { pseudonym: pseudonym, type: type, original: original };
  mappings.byPseudonym[pseudonym] = { original: original, type: type, pseudonym: pseudonym };
  mappings.byPseudonym[pseudonym.toLowerCase()] = { original: original, type: type, pseudonym: pseudonym };
  mappings.usedPseudonyms[pseudonym] = true;
}

/**
 * Find if an org/fund name is related to an existing mapped org.
 * E.g., "Kim Family DAF - Goldman Sachs Philanthropy Fund" contains
 * "Kim Family" which overlaps with "Kim Family Trust" → return "Kelp".
 *
 * @param {string} orgName - The org/fund name to check
 * @param {Object} mappings
 * @return {string|null} The associated org pseudonym, or null
 * @private
 */
function findOrgAssociation_(orgName, mappings) {
  var nameLower = orgName.toLowerCase();
  var bestMatch = null;
  var bestScore = 0;

  for (var key in mappings.byOriginal) {
    var entry = mappings.byOriginal[key];
    if (!entry || !entry.pseudonym || entry.type !== "org") continue;

    var origLower = key.toLowerCase();
    // Skip if it's the same value
    if (origLower === nameLower) continue;

    var origTokens = origLower.split(/[\s&,.\-']+/).filter(function(t) { return t.length > 2; });

    var score = 0;
    var matchedTokens = 0;
    for (var i = 0; i < origTokens.length; i++) {
      if (nameLower.indexOf(origTokens[i]) !== -1) {
        score += origTokens[i].length;
        matchedTokens++;
      }
    }

    // Require at least 2 matching tokens or 1 long token (>5 chars)
    // to avoid false matches on short common words
    if (matchedTokens >= 2 || (matchedTokens >= 1 && score > 5)) {
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry.pseudonym;
      }
    }
  }

  return bestMatch;
}

/**
 * Generate a related org name from an existing org pseudonym.
 * "Kelp" → "Kelp 2", "Kelp 3", etc.
 *
 * @param {string} basePseudonym - The existing org pseudonym to derive from
 * @param {Object} usedPseudonyms - Set of already-used pseudonyms
 * @return {string}
 * @private
 */
function deriveRelatedOrgName_(basePseudonym, usedPseudonyms) {
  for (var n = 2; n < 999; n++) {
    var candidate = basePseudonym + " " + n;
    if (!usedPseudonyms[candidate]) {
      return candidate;
    }
  }
  return basePseudonym + "-" + Date.now();
}

/**
 * Search existing mappings to find a person or org whose name matches
 * components of an email address. Returns their pseudonym if found.
 *
 * E.g., "r.blackwell@blackwellindustries.com" →
 *   checks "blackwell" against all mapped names/orgs →
 *   finds "Robert Blackwell III" → returns "R. Indigo"
 *
 * @param {string} email - The real email address
 * @param {Object} mappings - Current mappings with byOriginal
 * @return {string|null} The associated pseudonym, or null if no match
 * @private
 */
function findEmailAssociation_(email, mappings) {
  var atIdx = email.indexOf("@");
  if (atIdx < 0) return null;

  var localPart = email.substring(0, atIdx).toLowerCase();  // "r.blackwell"
  var domainPart = email.substring(atIdx + 1).toLowerCase(); // "blackwellindustries.com"
  var domainName = domainPart.split(".")[0];                  // "blackwellindustries"

  // Split local part into tokens: "r.blackwell" → ["r", "blackwell"]
  // Also split domain: "blackwellindustries" stays whole, plus try splitting camelCase/compounds
  var localTokens = localPart.split(/[.\-_]+/).filter(function(t) { return t.length > 1; });

  var bestMatch = null;
  var bestScore = 0;

  for (var key in mappings.byOriginal) {
    var entry = mappings.byOriginal[key];
    if (!entry || !entry.pseudonym) continue;
    // Only match against name and org types
    if (entry.type !== "name" && entry.type !== "org") continue;

    var originalLower = key.toLowerCase();
    var originalTokens = originalLower.split(/[\s&,.\-']+/).filter(function(t) { return t.length > 1; });

    var score = 0;

    // Check how many original name tokens appear in the local part or domain
    for (var i = 0; i < originalTokens.length; i++) {
      var tok = originalTokens[i];
      if (tok.length < 2) continue;
      if (localPart.indexOf(tok) !== -1) score += tok.length;
      if (domainName.indexOf(tok) !== -1) score += tok.length;
    }

    // Check if any local tokens appear in the original name
    for (var j = 0; j < localTokens.length; j++) {
      if (localTokens[j].length < 2) continue;
      if (originalLower.indexOf(localTokens[j]) !== -1) score += localTokens[j].length;
    }

    if (score < 3) continue;

    // Prefer person matches over org matches (emails belong to people).
    // Give name-type a 50% score boost so "Robert Blackwell III" wins
    // over "Blackwell Industries" even when the org has more token overlap.
    if (entry.type === "name") {
      score = Math.round(score * 1.5);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry.pseudonym;
    }
  }

  return bestScore >= 3 ? bestMatch : null;
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
      if (!combined.byOriginal[key]) {
        combined.byOriginal[key] = m.byOriginal[key];
      } else if (combined.byOriginal[key].pseudonym !== m.byOriginal[key].pseudonym) {
        Logger.log("Warning: cross-domain conflict for '" + key + "' — keeping first-seen pseudonym");
      }
    }
    for (var key in m.byPseudonym) {
      if (!combined.byPseudonym[key]) {
        combined.byPseudonym[key] = m.byPseudonym[key];
      }
    }
    for (var key in m.usedPseudonyms) {
      combined.usedPseudonyms[key] = true;
    }
  }

  return combined;
}

/**
 * Count unique phone-type mappings to initialize the phone counter correctly.
 * @param {Object} mappings - Result from loadMappings() or loadAllMappings()
 * @return {number}
 */
function countPhoneMappings_(mappings) {
  var seen = {};
  var count = 0;
  for (var key in mappings.byOriginal) {
    var entry = mappings.byOriginal[key];
    if (entry.type === "phone" && !seen[entry.pseudonym]) {
      seen[entry.pseudonym] = true;
      count++;
    }
  }
  return count;
}
