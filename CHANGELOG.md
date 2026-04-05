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
