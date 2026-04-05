# File Prep - Backlog

Ideas, questions, and future improvements to revisit.

## Multi-tab support
Currently Protect runs on one tab at a time. Options to explore:
- Detect if the current file is already a " - Prepped" copy and anonymize in-place instead of creating yet another copy (so she can Protect tab 1, then switch to tab 2 and Protect again on the same copy)
- Add a "per-tab" config UI in the sidebar where she sets up all tabs at once and hits Protect once
- Or just leave it as-is since she usually works one tab at a time anyway

## v2 features
- Google Slides support (similar to Docs find-and-replace, but Slides API has quirks)
- Email anonymization (unstructured text — harder than columns, needs NER-like scanning or explicit term list)
- Microsoft Office integration (VBA macros or Python script for .xlsx/.docx anonymization)
- Direct Salesforce integration (unlikely due to org restrictions, but could automate post-export anonymization)

## UX improvements
- Remember last-used ranges per spreadsheet (by file ID) so she doesn't have to re-select every time
- "Protect all tabs" button that iterates through tabs with previously saved configs
- Bulk import of known terms into the mapping sheet (paste a list of names/orgs)
- Preview mode: show a sample of what the anonymized data will look like before creating the copy
- Keyboard shortcut for Quick Protect

## Edge cases to handle
- What happens if she renames columns after setting up auto-detect?
- Merged cells in spreadsheets
- Conditional formatting that references anonymized cells
- Data validation dropdowns containing sensitive names
- Formulas that reference cells by name (e.g., VLOOKUP on a name column)
- Very large sheets (1000+ rows) — performance of row-by-row mapping lookups

## Pseudonym improvements
- Allow her to define custom pseudonym banks (e.g., specific themes)
- Better email handling: if "Sarah Johnson" maps to "S. Jasper" and her email sarah.johnson@org.com appears later, link them automatically
- Handle name variants: "Bob Smith" and "Robert Smith" might be the same person
- Support for non-Latin names and characters

## Security considerations
- Should the mapping sheet be password-protected or encrypted?
- What if she accidentally shares the mapping sheet?
- Audit log: track when Protect/Restore was run and on which files
- Auto-detect if a non-prepped file is about to be shared externally
