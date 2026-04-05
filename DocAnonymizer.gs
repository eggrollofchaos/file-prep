/**
 * DocAnonymizer.gs
 * Handles anonymization and de-anonymization of Google Docs.
 *
 * Uses find-and-replace approach against the mapping table.
 * Scans document body, headers, and footers.
 */

/**
 * Build a de-duplicated list of mapping entries from a mappings object.
 * Since loadMappings/loadAllMappings stores both original-case and lowercase keys,
 * this extracts unique entries using the original-case version.
 *
 * @param {Object} mappings - Result from loadMappings() or loadAllMappings()
 * @return {Object[]} Array of { original, pseudonym, type }
 * @private
 */
function getUniqueMappingEntries_(mappings) {
  var seen = {};
  var entries = [];

  for (var key in mappings.byOriginal) {
    var entry = mappings.byOriginal[key];
    if (!entry || !entry.pseudonym) continue;

    var lowerKey = key.toLowerCase();
    if (seen[lowerKey]) continue;
    seen[lowerKey] = true;

    // Prefer the original-cased version for display
    // The original-case key is the one that doesn't equal its lowercase (unless it was already lowercase)
    var displayKey = key;
    if (key === lowerKey) {
      // Check if there's a mixed-case version stored
      for (var k2 in mappings.byOriginal) {
        if (k2.toLowerCase() === lowerKey && k2 !== lowerKey) {
          displayKey = k2;
          break;
        }
      }
    }

    entries.push({
      original: displayKey,
      pseudonym: entry.pseudonym,
      type: entry.type
    });
  }

  return entries;
}

/**
 * Scan a Google Doc for known identifiers from the mapping table.
 * Returns a list of found identifiers and their locations.
 *
 * This is used for the sidebar preview before anonymizing.
 *
 * @return {Object[]} Array of { original, pseudonym, type, count }
 */
function scanDocForIdentifiers() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();
  var bodyText = body.getText();
  var bodyTextLower = bodyText.toLowerCase();

  // Load all mappings across all domains
  var mappings = loadAllMappings();
  var entries = getUniqueMappingEntries_(mappings);
  var found = [];

  for (var i = 0; i < entries.length; i++) {
    var searchLower = entries[i].original.toLowerCase();
    var count = 0;
    var idx = 0;

    while ((idx = bodyTextLower.indexOf(searchLower, idx)) !== -1) {
      count++;
      idx += searchLower.length;
    }

    if (count > 0) {
      found.push({
        original: entries[i].original,
        pseudonym: entries[i].pseudonym,
        type: entries[i].type,
        count: count
      });
    }
  }

  // Sort by count descending
  found.sort(function(a, b) { return b.count - a.count; });
  return found;
}

/**
 * Anonymize the active Google Doc by creating a copy and replacing
 * all known identifiers with pseudonyms.
 *
 * @param {Object} config - {
 *   domain: "Funders",           // optional: limit to specific domain
 *   additionalTerms: [           // optional: new terms to add
 *     { original: "Jane Doe", type: "name" }
 *   ]
 * }
 * @return {Object} { success, copyUrl, copyId, stats }
 */
function anonymizeDoc(config) {
  config = config || {};
  var doc = DocumentApp.getActiveDocument();

  // Load mappings
  var mappings;
  if (config.domain) {
    mappings = loadMappings(config.domain);
  } else {
    mappings = loadAllMappings();
  }

  // Process any additional terms first (add to mappings)
  var additionalTerms = config.additionalTerms || [];
  var phoneCounter = countPhoneMappings_(mappings) + 1;
  var domain = config.domain || "Funders";

  for (var i = 0; i < additionalTerms.length; i++) {
    var term = additionalTerms[i];
    getOrCreatePseudonym(domain, term.original, term.type, mappings, phoneCounter);
    if (term.type === "phone") phoneCounter++;
  }

  // Create a copy of the document
  var file = DriveApp.getFileById(doc.getId());
  var copy = file.makeCopy(doc.getName() + " - Prepped");
  var copyDoc = DocumentApp.openById(copy.getId());

  var stats = { replacements: 0, termsFound: 0 };

  // Build replacement list from de-duplicated entries
  var entries = getUniqueMappingEntries_(mappings);

  // Sort by length descending to avoid partial replacement issues
  // (e.g., "Sarah Johnson" should be replaced before "Sarah")
  entries.sort(function(a, b) { return b.original.length - a.original.length; });

  // Perform replacements in the copy
  var copyBody = copyDoc.getBody();

  for (var r = 0; r < entries.length; r++) {
    var escaped = escapeRegex_(entries[r].original);
    var pattern = "(?i)" + addWordBoundaries_(entries[r].original, escaped);
    var found = copyBody.findText(pattern);
    if (found) {
      stats.termsFound++;
      copyBody.replaceText(pattern, entries[r].pseudonym);
      stats.replacements++;
    }
  }

  // Also process headers and footers
  var header = copyDoc.getHeader();
  var footer = copyDoc.getFooter();

  if (header) {
    for (var r = 0; r < entries.length; r++) {
      var hEscaped = escapeRegex_(entries[r].original);
      var hPattern = "(?i)" + addWordBoundaries_(entries[r].original, hEscaped);
      header.replaceText(hPattern, entries[r].pseudonym);
    }
  }

  if (footer) {
    for (var r = 0; r < entries.length; r++) {
      var fEscaped = escapeRegex_(entries[r].original);
      var fPattern = "(?i)" + addWordBoundaries_(entries[r].original, fEscaped);
      footer.replaceText(fPattern, entries[r].pseudonym);
    }
  }

  copyDoc.saveAndClose();

  return {
    success: true,
    copyUrl: "https://docs.google.com/document/d/" + copy.getId(),
    copyId: copy.getId(),
    stats: stats
  };
}

/**
 * De-anonymize (restore) the active Google Doc in-place by replacing
 * pseudonyms with original values.
 *
 * @param {Object} config - { domain: "Funders" } (optional)
 * @return {Object} { success, stats }
 */
function restoreDoc(config) {
  config = config || {};
  var doc = DocumentApp.getActiveDocument();

  // Safety: verify this is a prepped copy
  if (doc.getName().indexOf(" - Prepped") === -1) {
    return {
      success: false,
      error: "This document doesn't appear to be a prepped copy. Restore only works on files with ' - Prepped' in the name."
    };
  }

  // Create backup before destructive in-place restore
  DriveApp.getFileById(doc.getId()).makeCopy(doc.getName() + " - Pre-Restore Backup");

  // Load mappings
  var mappings;
  if (config.domain) {
    mappings = loadMappings(config.domain);
  } else {
    mappings = loadAllMappings();
  }

  var stats = { replacements: 0, termsFound: 0 };

  // Build reverse replacement list (pseudonym → original) from byPseudonym
  var seen = {};
  var replacements = [];

  for (var pseudonym in mappings.byPseudonym) {
    var lowerP = pseudonym.toLowerCase();
    if (seen[lowerP]) continue;
    seen[lowerP] = true;

    replacements.push({
      pseudonym: pseudonym,
      original: mappings.byPseudonym[pseudonym].original
    });
  }

  // Sort by length descending
  replacements.sort(function(a, b) { return b.pseudonym.length - a.pseudonym.length; });

  var body = doc.getBody();

  for (var r = 0; r < replacements.length; r++) {
    var escapedPseudonym = escapeRegex_(replacements[r].pseudonym);
    var found = body.findText(escapedPseudonym);
    if (found) {
      stats.termsFound++;
      body.replaceText(escapedPseudonym, replacements[r].original);
      stats.replacements++;
    }
  }

  // Also process headers and footers
  var header = doc.getHeader();
  var footer = doc.getFooter();

  if (header) {
    for (var r = 0; r < replacements.length; r++) {
      header.replaceText(escapeRegex_(replacements[r].pseudonym), replacements[r].original);
    }
  }

  if (footer) {
    for (var r = 0; r < replacements.length; r++) {
      footer.replaceText(escapeRegex_(replacements[r].pseudonym), replacements[r].original);
    }
  }

  doc.saveAndClose();

  return {
    success: true,
    stats: stats
  };
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @return {string}
 * @private
 */
function escapeRegex_(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Add word boundaries to a regex pattern when the original term
 * starts/ends with alphanumeric characters. Prevents common English
 * words (e.g., "Amber", "Dawn", "Reed") in the pseudonym banks from
 * matching inside unrelated text.
 * @param {string} original - The original unescaped term
 * @param {string} escaped - The regex-escaped term
 * @return {string} Pattern with word boundaries where appropriate
 * @private
 */
function addWordBoundaries_(original, escaped) {
  var pattern = escaped;
  if (/[a-zA-Z0-9]/.test(original.charAt(0))) {
    pattern = "\\b" + pattern;
  }
  if (/[a-zA-Z0-9]/.test(original.charAt(original.length - 1))) {
    pattern = pattern + "\\b";
  }
  return pattern;
}
