# File Prep — Requirements Specification

## Overview
"File Prep" is a private Google Workspace Editor Add-on that anonymizes sensitive identifier fields in Google Sheets and Docs, enabling safe use of external tools for analysis and reporting. A persistent mapping table allows consistent, reversible pseudonym replacement across documents.

## Core Workflow
1. User opens a Google Sheet or Doc containing sensitive data
2. User opens the File Prep sidebar
3. **For Sheets:** User selects (or confirms auto-suggested) ranges containing sensitive identifiers
4. **For Docs:** Add-on scans for known identifiers from the mapping table
5. User clicks **"Protect"** → Add-on creates an anonymized *copy* of the document
6. User works with the anonymized copy externally (e.g., uploads to analysis tools)
7. User pastes results back into a Sheet/Doc, clicks **"Restore"** → pseudonyms are replaced with real values

## Anonymization Strategy

### What Gets Anonymized
- **Person names** (donors, participants, contacts)
- **Organization names** (funders, foundations, companies)
- **Email addresses**
- **Phone numbers**

### What Stays Real
- Donation amounts
- Dates
- Regions / geography
- Pell Grant recipient status
- All other non-identifier data fields

### Pseudonym Style
- **Mnemonic / initial-preserving** pseudonyms for easy recognition
- **Person names:** Codename style preserving both initials → "Sarah Johnson" → "S. Jasper"
- **Organizations:** First-letter-matching word → "Microsoft" → "Magnolia"
- **Emails:** Pseudonymized name + generic domain → "s.jasper@example.com"
- **Phones:** Replaced with fake number preserving format → "(555) 000-XXXX"
- Auto-generated, but editable in the mapping sheet
- Collisions auto-resolved (if "Magnolia" is taken, next M-org gets "Meridian")

## Mapping Sheet
- Dedicated private Google Sheet, accessible only to the user
- **One tab per domain:** Funders, Participants, Organizations, etc.
- **Columns:** Original Value | Pseudonym | Type (name/email/phone/org) | Date Added
- Persistent across all documents — same person always gets the same pseudonym
- User can manually edit pseudonyms at any time

## Google Sheets Behavior
- Operates on **one tab (sheet) at a time**
- Supports **multiple non-contiguous ranges** per tab (e.g., A1:A101, B103:B141)
- **Auto-suggest:** Scans header rows for known field names (Name, Email, Phone, Organization, etc.), suggests matching ranges; user confirms, edits, removes, or adds custom ranges
- **Skips dynamic content:** Detects and skips Pivot Tables, charts, and formula-generated ranges; notifies user
- Creates an anonymized **copy** of the entire spreadsheet (with selected tab anonymized)

## Google Docs Behavior
- Uses **find-and-replace** approach against the mapping table
- Scans entire document body, headers, footers
- Creates an anonymized **copy** of the document
- Also supports "Restore" on a doc that contains pseudonyms

## Sidebar UI
- Clean, minimal sidebar — no mention of AI, Claude, or external tools
- **Neutral language:** "Protect" / "Restore" / "File Prep"
- **Sheets mode:**
  - Auto-detected field suggestions with checkboxes
  - Manual range input (supports multiple comma-separated ranges)
  - Domain selector (which mapping tab to use: Funders, Participants, etc.)
  - "Protect" button → creates anonymized copy
  - "Restore" button → de-anonymizes pasted content in current sheet
- **Docs mode:**
  - Shows list of recognized identifiers found in the document
  - "Protect" button → creates anonymized copy
  - "Restore" button → de-anonymizes current document
- **Settings section:**
  - Link to open/create the mapping sheet
  - Manage known field names for auto-detection
  - Manage domain tabs

## Technical Architecture
- **Platform:** Google Apps Script (Editor Add-on)
- **Deployment:** Test deployment or org-internal install (no Marketplace listing)
- **Visibility:** Only visible to installed user; admins could see if actively looking
- **Files:**
  - `Code.gs` — Entry point, menu registration, sidebar launch
  - `PseudonymGenerator.gs` — Mnemonic name generation logic
  - `MappingManager.gs` — Mapping sheet CRUD operations
  - `SheetAnonymizer.gs` — Sheets-specific anonymization engine
  - `DocAnonymizer.gs` — Docs-specific anonymization engine
  - `Sidebar.html` — Sidebar UI (HTML + inline CSS + JS)

## V1 Scope
- ✅ Google Sheets anonymization
- ✅ Google Docs anonymization
- ✅ Persistent mapping sheet with domain tabs
- ✅ Mnemonic pseudonyms (initial-preserving)
- ✅ Auto-suggest header detection for Sheets
- ✅ Multiple range selection
- ✅ Pivot Table / chart detection and skip
- ✅ Sidebar UI with Protect/Restore
- ❌ Google Slides (v2)
- ❌ Email anonymization (v2)
- ❌ Microsoft Office integration (v2)
- ❌ Direct Salesforce integration (v2)

## User Profile
- Solo user (girlfriend), non-technical
- Works on an org Google Workspace account (@nonprofit.org)
- Coworkers should not be aware of the anonymization workflow
- All shared documents must be fully de-anonymized before sharing
