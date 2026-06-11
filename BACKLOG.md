# File Prep - Backlog

Ideas, questions, and future improvements to revisit.

## Multi-tab support
Currently Protect runs on one tab at a time. Options to explore:
- Detect if the current file is already a " - Prepped" copy and anonymize in-place instead of creating yet another copy (so she can Protect tab 1, then switch to tab 2 and Protect again on the same copy)
- Add a "per-tab" config UI in the sidebar where she sets up all tabs at once and hits Protect once
- Or just leave it as-is since she usually works one tab at a time anyway

## Deployment: Publish privately to Google Workspace Marketplace
Currently using test deployments (only works per-document). To make File Prep appear in Extensions for every Sheet and Doc automatically, publish internally:
1. Create a Google Cloud project (free) at console.cloud.google.com
2. Link it to the Apps Script project
3. Configure the OAuth consent screen (internal only)
4. Deploy > New deployment > Add-on
5. Publish to Workspace Marketplace as "Internal" (no Google review needed)
This is ~20 min one-time setup. Only people in her org can see it exists.

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

## Ideas for prompts
1. create a pivot table in a new tab with useful dimensions extract.
2. on another new tab, make a chart from either the main data or the pivot table. make a different chart in that tab showing other aggregations.
3. generate some analytical human-readable summary lines, include insights.
4. come up with next steps for follow-up stewardship organized by pipeline stage

## Generated prompts to try
Sample Donor Report Q1 2026 (12 donors, donations, funds, regions)

"Summarize Q1 giving performance. What's the total raised, average gift size, and how does recurring vs. one-time giving break down? Flag any trends worth noting."
"Which regions are strongest and weakest in Q1? Break down total giving and donor count by region. Where should we focus cultivation efforts next quarter?"
"Identify our top 3 donors by gift size. For each, note whether they're recurring, what fund they gave through, and anything in the Notes column that affects stewardship planning."
"How much of Q1 giving came through DAFs vs. direct gifts? What are the implications for our cash flow timing and acknowledgment process?"
"Draft a short Q1 donor summary I can include in a board report. Keep it to 4-5 bullets covering total raised, donor count, notable gifts, and recurring donor retention."
"Look at the Scholarship Recipients tab. What's the average scholarship amount by region? How many are Pell-eligible? Summarize the program's reach for a funder update."

Funder Database FY2026 (80 funders, 37 columns, pipeline stages, multi-year pledges)

"Give me a pipeline health check. How many funders are at each stage (Identification through Stewardship)? What's the total lifetime giving at each stage? Where are the bottlenecks?"
"Pull a list of all prospects and qualification-stage funders with a Capacity Rating of 4 or 5 and Likelihood Rating of 3+. Sort by Priority Score descending. This is my hot prospect list for Q2."
"Which multi-year pledges are ending this fiscal year or next? Show the donor, pledge total, annual amount, and current pledge year. I need to plan renewal conversations."
"Analyze giving trends across FY2023-FY2026 for our active donors. Who's increasing, who's flat, who's declining? Flag anyone who dropped more than 25% year-over-year."
"How is stewardship workload distributed? Break down the number of funders and total lifetime giving by Stewardship Owner. Are any owners overloaded relative to portfolio value?"
"Identify all lapsed or inactive funders who gave $50K+ lifetime. What stage are they in, when was last contact, and what's the next action? Build me a re-engagement priority list."
"Compare giving by Donor Type (Individual/Family vs. Foundation vs. Corporate). What's the average gift size, recurring rate, and DAF usage for each type?"
"What's our board and advisory council engagement look like among top donors? Cross-reference Board Member and Advisory Council columns with giving levels. Are our biggest givers involved in governance?"
"Draft talking points for a Q2 fundraising strategy meeting. Cover pipeline status, at-risk renewals, top prospects to move forward, and regional gaps based on the data."
"Create a simple forecast: based on current pledge schedules and FY2026 YTD giving, what's our projected total for the fiscal year? What's the gap to goal if our target is $5M?"


