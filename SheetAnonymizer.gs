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

// Each entry: { keyword, type, matchMode }
// matchMode: "exact"  = header must equal keyword exactly
//            "word"   = keyword appears as a whole word in the header
//            "startsWith" = header starts with keyword
// Each entry: { keyword, type, matchMode }
// matchMode: "exact"  = header must equal keyword exactly
//            "word"   = keyword appears as a whole word in the header
var DEFAULT_KNOWN_FIELDS_ = [
  // Names (exact matches to avoid false positives on "Funder ID", "Last Contact Date", etc.)
  { keyword: "name",             type: "name",  matchMode: "word" },
  { keyword: "first name",       type: "name",  matchMode: "exact" },
  { keyword: "last name",        type: "name",  matchMode: "exact" },
  { keyword: "full name",        type: "name",  matchMode: "exact" },
  { keyword: "donor name",       type: "name",  matchMode: "exact" },
  { keyword: "donor",            type: "name",  matchMode: "exact" },
  { keyword: "funder name",      type: "name",  matchMode: "exact" },
  { keyword: "funder",           type: "name",  matchMode: "exact" },
  { keyword: "participant",      type: "name",  matchMode: "exact" },
  { keyword: "participant name", type: "name",  matchMode: "exact" },
  { keyword: "contact name",     type: "name",  matchMode: "exact" },
  { keyword: "contact",          type: "name",  matchMode: "exact" },
  { keyword: "stewardship owner",type: "name",  matchMode: "exact" },
  { keyword: "owner",            type: "name",  matchMode: "exact" },
  // Email — "word" so "Primary Contact Email" matches
  { keyword: "email",            type: "email", matchMode: "word" },
  { keyword: "email address",    type: "email", matchMode: "exact" },
  { keyword: "e-mail",           type: "email", matchMode: "word" },
  // Phone
  { keyword: "phone",            type: "phone", matchMode: "word" },
  { keyword: "phone number",     type: "phone", matchMode: "exact" },
  { keyword: "telephone",        type: "phone", matchMode: "word" },
  { keyword: "mobile",           type: "phone", matchMode: "word" },
  { keyword: "cell",             type: "phone", matchMode: "exact" },
  // Organizations / funds
  { keyword: "organization",     type: "org",   matchMode: "word" },
  { keyword: "org",              type: "org",   matchMode: "exact" },
  { keyword: "company",          type: "org",   matchMode: "word" },
  { keyword: "foundation",       type: "org",   matchMode: "word" },
  { keyword: "institution",      type: "org",   matchMode: "word" },
  { keyword: "firm",             type: "org",   matchMode: "exact" },
  { keyword: "agency",           type: "org",   matchMode: "word" },
  { keyword: "employer",         type: "org",   matchMode: "word" },
  { keyword: "fund",             type: "org",   matchMode: "word" },
  { keyword: "daf",              type: "org",   matchMode: "word" },
  // Free-text fields that may contain PII inline
  { keyword: "notes",            type: "freetext", matchMode: "exact" },
  { keyword: "next action",      type: "freetext", matchMode: "exact" },
  { keyword: "comments",         type: "freetext", matchMode: "exact" },
  { keyword: "description",      type: "freetext", matchMode: "exact" }
];

/**
 * Get known field definitions.
 * @return {Object[]} Array of { keyword, type, matchMode }
 */
function getKnownFieldDefs() {
  return DEFAULT_KNOWN_FIELDS_;
}

/**
 * Check if a header cell matches a known field definition.
 * @param {string} header - Lowercased header text
 * @param {Object} fieldDef - { keyword, type, matchMode }
 * @return {boolean}
 * @private
 */
function headerMatchesField_(header, fieldDef) {
  var kw = fieldDef.keyword;
  switch (fieldDef.matchMode) {
    case "exact":
      return header === kw;
    case "word":
      // keyword appears as a whole word in the header
      var re = new RegExp("\\b" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
      return re.test(header);
    case "startsWith":
      return header.indexOf(kw) === 0;
    default:
      return header === kw;
  }
}

// ─── Header Auto-Detection ───

/**
 * Find contiguous data blocks on the sheet.
 * A "block" starts at a non-empty row after a gap (or row 1)
 * and ends at the last consecutive non-empty row.
 * An empty row is one where every cell in columns 1..lastCol is blank.
 *
 * @param {Sheet} sheet
 * @return {Object[]} Array of { headerRow, dataStartRow, dataEndRow }
 *   headerRow:    1-based row number of the block's first row (treated as header)
 *   dataStartRow: 1-based row where data begins (headerRow + 1)
 *   dataEndRow:   1-based last row with data in this block
 * @private
 */
function findDataBlocks_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];

  // Read all values once for performance
  var allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  var blocks = [];
  var inBlock = false;
  var blockStart = -1;

  for (var r = 0; r < allValues.length; r++) {
    var rowEmpty = isRowEmpty_(allValues[r]);

    if (!rowEmpty && !inBlock) {
      // Starting a new block
      inBlock = true;
      blockStart = r; // 0-based
    } else if (rowEmpty && inBlock) {
      // Ending current block
      blocks.push({
        headerRow: blockStart + 1,          // 1-based
        dataStartRow: blockStart + 2,       // row after header, 1-based
        dataEndRow: r                        // last non-empty row, 1-based (r is 0-based empty row, so r is the 1-based end)
      });
      inBlock = false;
    }
  }

  // Close the last block if the sheet doesn't end with an empty row
  if (inBlock) {
    blocks.push({
      headerRow: blockStart + 1,
      dataStartRow: blockStart + 2,
      dataEndRow: lastRow
    });
  }

  // Filter out "blocks" that are just a single header row with no data
  return blocks.filter(function(b) { return b.dataStartRow <= b.dataEndRow; });
}

/**
 * Check if every cell in a row array is empty.
 * @param {Array} rowValues
 * @return {boolean}
 * @private
 */
function isRowEmpty_(rowValues) {
  for (var c = 0; c < rowValues.length; c++) {
    if (rowValues[c] !== "" && rowValues[c] !== null && rowValues[c] !== undefined) {
      return false;
    }
  }
  return true;
}

/**
 * Scan the active sheet for headers matching known field names.
 * Finds contiguous data blocks separated by empty rows, treats each
 * block's first row as a header row, and only matches against those
 * header rows — never against data values.
 *
 * @return {Object[]} Array of { header, column, colLetter, range, fieldType, headerRow }
 */
function autoDetectFields() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var fieldDefs = getKnownFieldDefs();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) return [];

  // 1. Find contiguous data blocks
  var blocks = findDataBlocks_(sheet);
  if (blocks.length === 0) return [];

  // 2. Read all values once (reuse for header scanning)
  var allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  var suggestions = [];

  // 3. For each block, scan its header row for columnar fields
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b];
    var headerRowIdx = block.headerRow - 1; // 0-based index into allValues
    var headerCells = allValues[headerRowIdx];
    var columnarHits = 0;

    for (var col = 0; col < headerCells.length; col++) {
      var cellValue = String(headerCells[col]).trim().toLowerCase();
      if (!cellValue) continue;

      // Find the best (longest keyword) matching field definition
      var bestMatch = null;
      for (var k = 0; k < fieldDefs.length; k++) {
        if (headerMatchesField_(cellValue, fieldDefs[k])) {
          if (!bestMatch || fieldDefs[k].keyword.length > bestMatch.keyword.length) {
            bestMatch = fieldDefs[k];
          }
        }
      }

      if (!bestMatch) continue;
      columnarHits++;

      var colLetter = columnToLetter_(col + 1);
      var rangeStr = colLetter + block.dataStartRow + ":" + colLetter + block.dataEndRow;

      suggestions.push({
        header: headerCells[col],
        column: col + 1,
        colLetter: colLetter,
        range: rangeStr,
        fieldType: bestMatch.type,
        headerRow: block.headerRow
      });
    }

    // 4. Key-value row scan: for blocks where the header row didn't
    //    produce columnar hits, check each data row for label → value pairs.
    //    A label in column A (or the first non-empty col) that matches a
    //    known field means the cell to its right contains PII.
    //    Uses word-matching since these labels are headers, not data.
    if (columnarHits === 0) {
      for (var r = block.dataStartRow - 1; r < block.dataEndRow; r++) {
        var rowData = allValues[r]; // 0-based
        // Find the first non-empty cell as the "label"
        var labelCol = -1;
        for (var c = 0; c < rowData.length; c++) {
          if (rowData[c] !== "" && rowData[c] !== null && rowData[c] !== undefined) {
            labelCol = c;
            break;
          }
        }
        if (labelCol < 0) continue;

        var labelText = String(rowData[labelCol]).trim().toLowerCase();
        if (!labelText) continue;

        // Find the value cell (next non-empty cell to the right)
        var valueCol = -1;
        for (var c2 = labelCol + 1; c2 < rowData.length; c2++) {
          if (rowData[c2] !== "" && rowData[c2] !== null && rowData[c2] !== undefined) {
            valueCol = c2;
            break;
          }
        }
        if (valueCol < 0) continue;

        // Match label against known fields using WORD matching
        // (safe here because these are labels, not data values)
        var bestKV = null;
        for (var k = 0; k < fieldDefs.length; k++) {
          var kwRe = new RegExp("\\b" + fieldDefs[k].keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b");
          if (kwRe.test(labelText)) {
            if (!bestKV || fieldDefs[k].keyword.length > bestKV.keyword.length) {
              bestKV = fieldDefs[k];
            }
          }
        }

        if (!bestKV) continue;

        var kvColLetter = columnToLetter_(valueCol + 1);
        var kvRow = r + 1; // 1-based
        var kvRange = kvColLetter + kvRow;

        suggestions.push({
          header: String(rowData[labelCol]).trim(),
          column: valueCol + 1,
          colLetter: kvColLetter,
          range: kvRange,
          fieldType: bestKV.type,
          headerRow: kvRow  // the label is on the same row
        });
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
  if (/org|company|foundation|institution|firm|agency|employer|fund|daf/.test(header)) return "org";
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

  // 3. First pass: process all NON-freetext ranges (builds up the mapping table)
  var ranges = config.ranges || [];
  var fieldTypes = config.fieldTypes || {};
  var freetextRanges = [];

  for (var r = 0; r < ranges.length; r++) {
    var rangeStr = ranges[r].trim();
    if (!rangeStr) continue;
    var type = fieldTypes[rangeStr] || "name";

    // Defer freetext ranges to second pass (so all PII mappings exist first)
    if (type === "freetext") {
      freetextRanges.push(rangeStr);
      continue;
    }

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

          // Determine type from config or auto-detect
          var cellType = type;
          if (cellType === "unknown") cellType = "name";

          // Check if mapping exists before counting as new
          var existingMapping = mappings.byOriginal[strValue] || mappings.byOriginal[strValue.toLowerCase()];
          if (!existingMapping) stats.newMappings++;

          var pseudonym = getOrCreatePseudonym(domain, strValue, cellType, mappings, phoneCounter);
          if (cellType === "phone") phoneCounter++;

          rowData.push(pseudonym);
          stats.anonymized++;
        }
        newValues.push(rowData);
      }

      copyRange.setValues(newValues);

    } catch (e) {
      Logger.log("Error processing range " + rangeStr + ": " + e.message);
      stats.skipped++;
    }
  }

  // 4. Second pass: process freetext ranges using inline replacement.
  //    By now, all structured PII columns have been processed, so the
  //    mapping table contains every name/org/email/phone we know about.
  //    We scan each freetext cell for those known originals and replace
  //    only the matching substrings, preserving the surrounding text.
  //    Also discovers NEW PII (emails, phones, Title Case names) and
  //    creates mappings for them on the fly.
  if (freetextRanges.length > 0) {
    // Reload mappings to pick up anything added in pass 1
    mappings = loadMappings(domain);

    // Build sorted replacement list (longest originals first to avoid partial matches)
    var replacements = buildFreetextReplacements_(mappings);

    // Wrap phoneCounter in object so it can be mutated by the freetext function
    var phoneCounterObj = { value: phoneCounter };

    for (var ft = 0; ft < freetextRanges.length; ft++) {
      var ftRangeStr = freetextRanges[ft];
      try {
        var ftSourceRange = sheet.getRange(ftRangeStr);
        var ftCopyRange = copySheet.getRange(ftRangeStr);
        var ftValues = ftSourceRange.getValues();

        var ftNewValues = [];
        for (var row = 0; row < ftValues.length; row++) {
          var rowData = [];
          for (var col = 0; col < ftValues[row].length; col++) {
            var cellValue = ftValues[row][col];
            stats.processed++;

            if (!cellValue || String(cellValue).trim() === "") {
              rowData.push(cellValue);
              stats.skipped++;
              continue;
            }

            var original = String(cellValue);
            var replaced = anonymizeFreetextCell_(
              original, replacements, domain, mappings, phoneCounterObj, stats
            );
            if (replaced !== original) {
              stats.anonymized++;
            } else {
              stats.skipped++;
            }
            rowData.push(replaced);
          }
          ftNewValues.push(rowData);
        }

        ftCopyRange.setValues(ftNewValues);

      } catch (e) {
        Logger.log("Error processing freetext range " + ftRangeStr + ": " + e.message);
        stats.skipped++;
      }
    }
  }

  return {
    success: true,
    copyUrl: copy.getUrl(),
    copyId: copy.getId(),
    stats: stats
  };
}

// ─── Freetext Helpers ───

/**
 * Build a list of { original, pseudonym, regex } sorted longest-first
 * from the current mapping table, for use in freetext replacement.
 *
 * @param {Object} mappings - Result from loadMappings()
 * @return {Object[]}
 * @private
 */
function buildFreetextReplacements_(mappings) {
  var seen = {};
  var list = [];

  for (var key in mappings.byOriginal) {
    var entry = mappings.byOriginal[key];
    if (!entry || !entry.pseudonym) continue;

    var lowerKey = key.toLowerCase();
    if (seen[lowerKey]) continue;
    seen[lowerKey] = true;

    // Use the original-case version
    var original = entry.original || key;
    // Skip very short originals (1-2 chars) to avoid false replacements
    if (original.length < 3) continue;

    var escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word-boundary regex, case-insensitive
    var regex = new RegExp("\\b" + escaped + "\\b", "gi");

    list.push({
      original: original,
      pseudonym: entry.pseudonym,
      regex: regex
    });
  }

  // Sort longest first so "James & Dorothy Whitfield" replaces before "James"
  list.sort(function(a, b) { return b.original.length - a.original.length; });
  return list;
}

/**
 * Replace known PII substrings within a freetext cell value,
 * then discover and replace NEW PII patterns (emails, phones,
 * Title Case names/orgs) that aren't yet in the mapping table.
 *
 * @param {string} text - The cell text
 * @param {Object[]} replacements - From buildFreetextReplacements_()
 * @param {string} domain - Mapping domain
 * @param {Object} mappings - Current mappings (mutated as new entries are added)
 * @param {Object} phoneCounter - { value: n } (object so it can be mutated)
 * @param {Object} stats - Stats object (mutated)
 * @return {string} Text with PII substrings replaced by pseudonyms
 * @private
 */
function anonymizeFreetextCell_(text, replacements, domain, mappings, phoneCounter, stats) {
  var result = text;

  // Pass 1: Replace all known mappings (longest first)
  for (var i = 0; i < replacements.length; i++) {
    replacements[i].regex.lastIndex = 0;
    result = result.replace(replacements[i].regex, replacements[i].pseudonym);
  }

  // Pass 2: Discover new PII patterns in the ORIGINAL text
  //         (using original avoids matching pseudonyms or partial replacements)

  // 2a. Emails
  var emailRe = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
  var emailMatch;
  while ((emailMatch = emailRe.exec(text)) !== null) {
    var email = emailMatch[0];
    if (!mappings.byOriginal[email] && !mappings.byOriginal[email.toLowerCase()]) {
      var pseudo = getOrCreatePseudonym(domain, email, "email", mappings, phoneCounter.value);
      addFreetextReplacement_(replacements, email, pseudo);
      if (stats) stats.newMappings++;
    }
  }

  // 2b. Phone numbers: (xxx) xxx-xxxx, xxx-xxx-xxxx, xxx.xxx.xxxx
  var phoneRe = /(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g;
  var phoneMatch;
  while ((phoneMatch = phoneRe.exec(text)) !== null) {
    var phone = phoneMatch[0];
    if (!mappings.byOriginal[phone] && !mappings.byOriginal[phone.toLowerCase()]) {
      var phonePseudo = getOrCreatePseudonym(domain, phone, "phone", mappings, phoneCounter.value);
      phoneCounter.value++;
      addFreetextReplacement_(replacements, phone, phonePseudo);
      if (stats) stats.newMappings++;
    }
  }

  // 2c. Title Case sequences (2+ capitalized words) — likely names or orgs.
  //     Excludes common non-PII phrases and already-replaced pseudonyms.
  //     Pattern requires 2+ consecutive Title Case words, optionally joined by & or -.
  //     We run it on the ORIGINAL text (not the partially-replaced result)
  //     to avoid matching pseudonyms or mangled text.
  var titleCaseRe = /\b([A-Z][a-z]+(?:[\s\-]+(?:&\s+)?[A-Z][a-z]+)+)\b/g;
  var tcMatch;
  var skipWords = buildSkipSet_();
  var commonWords = buildCommonWords_();
  while ((tcMatch = titleCaseRe.exec(text)) !== null) {
    var candidate = tcMatch[1].trim();
    var candidateLower = candidate.toLowerCase();

    // Skip if already mapped, already a pseudonym, or a common phrase
    if (mappings.byOriginal[candidate] || mappings.byOriginal[candidateLower]) continue;
    if (mappings.byPseudonym[candidate] || mappings.byPseudonym[candidateLower]) continue;
    if (skipWords[candidateLower]) continue;
    if (candidate.length < 4) continue;

    // Strip common sentence-start words that aren't part of names
    candidate = candidate.replace(/^(Met|The|Our|His|Her|Its|Was|Had|Has|Did|Does|Can|May|Got|Set|Let|See|Per|Via|For|But|And|Also|Will|Just|Very|Most|Some|Many|They|This|That|With|From|Have|Been|Each|Both|Such|When|Then|Said|Told|Gave|Sent|Made|Took|Want|Need|Like|Into|Over|About|After|Before|During|Since|Until|While|Where)\s+/g, "");
    if (!/[A-Z]/.test(candidate) || candidate.split(/\s+/).length < 2) continue;
    candidateLower = candidate.toLowerCase();
    // Re-check after trimming
    if (mappings.byOriginal[candidate] || mappings.byOriginal[candidateLower]) continue;
    if (skipWords[candidateLower]) continue;

    // Skip if ALL words are common English words (not a real name).
    // E.g., "Annual Renewal" — both "annual" and "renewal" are common → skip.
    // But "Sandra Okonkwo" — "okonkwo" is NOT common → keep.
    var candidateWords = candidateLower.split(/[\s\-&]+/).filter(function(w) { return w.length > 1; });
    var allCommon = true;
    for (var cw = 0; cw < candidateWords.length; cw++) {
      if (!commonWords[candidateWords[cw]]) {
        allCommon = false;
        break;
      }
    }
    if (allCommon) continue;

    // Heuristic: classify as org if it contains org-like words, else name
    var type = /foundation|trust|fund|group|llc|inc|corp|partners|ventures|associates|industries|holdings|capital/i.test(candidate) ? "org" : "name";
    var tcPseudo = getOrCreatePseudonym(domain, candidate, type, mappings, phoneCounter.value);
    addFreetextReplacement_(replacements, candidate, tcPseudo);
    if (stats) stats.newMappings++;
  }

  // 2d. Single capitalized words that match a known first name from the mapping.
  //     E.g., "Rachel" in prose when "Rachel Kim" → "R. Kendall" exists.
  //     Only match if the word is NOT a common English word.
  var singleCapRe = /\b([A-Z][a-z]{2,})\b/g;
  var scMatch;
  while ((scMatch = singleCapRe.exec(text)) !== null) {
    var word = scMatch[1];
    var wordLower = word.toLowerCase();

    // Skip common words and already-mapped values
    if (commonWords[wordLower]) continue;
    if (mappings.byOriginal[word] || mappings.byOriginal[wordLower]) continue;

    // Check if this word is a known first name from an existing mapping.
    // Look for mapped names that START with this word (e.g., "Rachel Kim").
    var foundAssoc = null;
    for (var mk in mappings.byOriginal) {
      var me = mappings.byOriginal[mk];
      if (!me || me.type !== "name") continue;
      var mNameLower = mk.toLowerCase();
      // Check if mapped name starts with this word followed by a space
      if (mNameLower.indexOf(wordLower + " ") === 0 ||
          mNameLower.indexOf(wordLower + " ") > 0) {
        foundAssoc = me.pseudonym;
        break;
      }
    }

    if (foundAssoc) {
      // Derive pseudonym: "Rachel" → use the initial + last name from the association
      var pseudoParts = foundAssoc.match(/(\S+)$/);
      var pseudoLast = pseudoParts ? pseudoParts[1] : foundAssoc;
      var singlePseudo = word.charAt(0).toUpperCase() + ". " + pseudoLast;

      // Save and add to replacements
      if (!mappings.byOriginal[word]) {
        saveMappingToCache_(domain, word, singlePseudo, "name", mappings);
        addFreetextReplacement_(replacements, word, singlePseudo);
        if (stats) stats.newMappings++;
      }
    }
  }

  // Pass 3: Re-run replacements to catch newly discovered entries
  for (var j = 0; j < replacements.length; j++) {
    replacements[j].regex.lastIndex = 0;
    result = result.replace(replacements[j].regex, replacements[j].pseudonym);
  }

  return result;
}

/**
 * Add a new entry to the replacements list, maintaining longest-first order.
 * @private
 */
function addFreetextReplacement_(replacements, original, pseudonym) {
  var escaped = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  var regex = new RegExp("\\b" + escaped + "\\b", "gi");
  var entry = { original: original, pseudonym: pseudonym, regex: regex };

  // Insert in sorted position (longest first)
  var inserted = false;
  for (var i = 0; i < replacements.length; i++) {
    if (original.length > replacements[i].original.length) {
      replacements.splice(i, 0, entry);
      inserted = true;
      break;
    }
  }
  if (!inserted) replacements.push(entry);
}

/**
 * Common phrases to skip during Title Case PII discovery.
 * @return {Object} Set of lowercase phrases to ignore
 * @private
 */
function buildSkipSet_() {
  var phrases = [
    // Geography
    "west coast", "east coast", "pacific nw", "mid-atlantic",
    "new york", "los angeles", "san francisco", "san diego",
    "san jose", "san antonio", "new orleans", "orange county",
    "palo alto", "silicon valley",
    // Time / reporting
    "first quarter", "second quarter", "third quarter", "fourth quarter",
    "fiscal year", "annual report", "annual renewal", "annual review",
    "annual appeal", "annual meeting", "annual fund",
    "multi year", "year end", "end of year", "class of",
    // Nonprofit / fundraising
    "board member", "advisory council", "advisory board",
    "pro bono", "pell grant", "gift size", "total donations",
    "recurring donors", "top donor", "top organization",
    "direct gift", "major gift", "major donor", "planned giving",
    "named scholarship", "impact report", "site visit",
    "cultivation event", "renewal meeting", "renewal proposal",
    "discovery meeting", "outreach call", "phone outreach",
    "stewardship plan", "giving level", "pledge year",
    "capacity rating", "priority score",
    "holiday event", "thank you", "follow up",
    // Common sentence fragments that look like names
    "strong pell", "high capacity", "very loyal", "very engaged",
    "deep interest", "warm lead"
  ];
  var set = {};
  for (var i = 0; i < phrases.length; i++) {
    set[phrases[i]] = true;
  }
  return set;
}

/**
 * Common English words that appear in nonprofit text but aren't names.
 * If ALL words in a Title Case candidate are common words, skip it.
 * @return {Object} Set of lowercase common words
 * @private
 */
function buildCommonWords_() {
  var words = [
    // Actions / verbs
    "send", "prepare", "schedule", "discuss", "finalize", "coordinate",
    "invite", "request", "follow", "review", "draft", "plan", "set",
    "await", "monitor", "propose", "deliver", "complete", "update",
    // Nonprofit terminology
    "annual", "renewal", "meeting", "report", "impact", "donor",
    "gift", "pledge", "fund", "grant", "event", "gala", "appeal",
    "scholarship", "program", "capacity", "cultivation", "stewardship",
    "engagement", "solicitation", "outreach", "prospect", "pipeline",
    "advisory", "board", "council", "member", "volunteer",
    "foundation", "trust", "giving", "charitable", "philanthropic",
    // General adjectives / adverbs
    "annual", "quarterly", "monthly", "weekly", "daily",
    "first", "second", "third", "fourth", "last", "next",
    "new", "old", "high", "low", "major", "minor",
    "total", "direct", "strong", "steady", "very", "deep",
    // Common nouns
    "year", "quarter", "month", "week", "date", "time",
    "site", "visit", "call", "letter", "email", "phone",
    "lunch", "dinner", "tour", "trip", "residence",
    "family", "community", "region", "area", "county",
    "coast", "valley", "island", "park", "lake",
    "level", "score", "rating", "status", "stage", "type",
    "action", "strategy", "proposal", "package", "summary",
    "interest", "focus", "connection", "referral", "conversion",
    // Descriptors
    "corporate", "personal", "rural", "urban", "local",
    "national", "regional", "international",
    // Meeting / process types
    "discovery", "introductory", "initial", "preliminary",
    // Demonyms / ethnicity (often Title Case in text)
    "american", "african", "asian", "european", "latin", "hispanic",
    "haitian", "mexican", "chinese", "japanese", "korean", "indian",
    "vietnamese", "caribbean", "cuban", "dominican", "puerto"
  ];
  var set = {};
  for (var i = 0; i < words.length; i++) {
    set[words[i]] = true;
  }
  return set;
}

/**
 * Reverse of anonymizeFreetextCell_: replace pseudonyms back to originals
 * within a freetext cell.
 *
 * @param {string} text - The anonymized cell text
 * @param {Object} mappings - Result from loadMappings() / loadAllMappings()
 * @return {string} Text with pseudonyms replaced by originals
 * @private
 */
function restoreFreetextCell_(text, mappings) {
  var seen = {};
  var list = [];

  for (var key in mappings.byPseudonym) {
    var entry = mappings.byPseudonym[key];
    if (!entry || !entry.original) continue;

    var lowerKey = key.toLowerCase();
    if (seen[lowerKey]) continue;
    seen[lowerKey] = true;

    var pseudonym = entry.pseudonym || key;
    if (pseudonym.length < 3) continue;

    var escaped = pseudonym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var regex = new RegExp("\\b" + escaped + "\\b", "gi");

    list.push({ pseudonym: pseudonym, original: entry.original, regex: regex });
  }

  list.sort(function(a, b) { return b.pseudonym.length - a.pseudonym.length; });

  var result = text;
  for (var i = 0; i < list.length; i++) {
    list[i].regex.lastIndex = 0;
    result = result.replace(list[i].regex, list[i].original);
  }
  return result;
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

          // Try whole-cell match first (structured columns)
          var mapping = mappings.byPseudonym[strValue] || mappings.byPseudonym[strValue.toLowerCase()];

          if (mapping) {
            values[row][col] = mapping.original;
            stats.restored++;
            changed = true;
          } else {
            // Try inline replacement (freetext cells with embedded pseudonyms)
            var restored = restoreFreetextCell_(strValue, mappings);
            if (restored !== strValue) {
              values[row][col] = restored;
              stats.restored++;
              changed = true;
            }
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
