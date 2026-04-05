# Changelog

## 2026-04-05

### Fixed
- **Doc anonymization replaces non-PII text** — Added word-boundary matching (`\b`)
  to prevent common English words in the pseudonym banks (e.g., "Amber", "Dawn",
  "Reed", "Lane") from being replaced inside unrelated document content.
- **Restore can corrupt the original document** — Both `restoreDoc()` and
  `restoreSheet()` now verify the active file has " - Prepped" in its name before
  proceeding. Blocks accidental in-place restore on originals.
- **Doc restore is irreversible** — `restoreDoc()` now creates a
  " - Pre-Restore Backup" copy before making destructive in-place replacements.
- **Replacement stats are inflated in Docs** — `anonymizeDoc()` and `restoreDoc()`
  previously counted every mapping entry as a replacement even when nothing was found.
  Stats now only increment when a match is actually replaced.
- **Cross-domain pseudonym collision** — `loadAllMappings()` previously let
  later domains silently overwrite earlier ones for the same key. Now preserves
  first-seen and logs a warning on conflict.
- **Phone counter counts all pseudonyms, not just phones** — `phoneCounter` was
  initialized from the total number of used pseudonyms (names, orgs, emails, phones),
  producing misleadingly high phone numbers. Now counts only phone-type mappings.
- **Sidebar swallows restore safety errors** — Restore success handlers now check
  `result.success` and display the error message when the safety check blocks the
  operation.
- **Quick Protect crashes on corrupted saved config** — `quickProtect()` now
  catches `JSON.parse` failures and alerts the user to re-configure via the sidebar.
- **INSTALL.md file naming instruction unclear** — Clarified that users should type
  names without `.gs` extension, with an example.
- **Restore variable naming in DocAnonymizer** — Renamed `escaped` to
  `escapedPseudonym` in restore loop for clarity (escaping was already correct).
- **Quick Protect doesn't clear corrupted config** — Now deletes the bad
  `FILE_PREP_LAST_CONFIG` property so subsequent runs don't fail repeatedly.
