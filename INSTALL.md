# File Prep — Installation Guide

## What You'll Need
- A Google Workspace account (your @work email)
- About 10 minutes

## Step 1: Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **"New project"**
3. Click the project name at the top left (it says "Untitled project") and rename it to **"File Prep"**

## Step 2: Add the Code Files

The project starts with a single file called `Code.gs`. You'll add 5 total `.gs` files and 1 `.html` file.

### Replace Code.gs
1. Click on `Code.gs` in the left sidebar
2. Select all the existing code and delete it
3. Copy the entire contents of `Code.gs` from this folder and paste it in

### Add the other .gs files
For each of these files, repeat this process:
1. Click the **"+"** button next to "Files" in the left sidebar
2. Choose **"Script"**
3. Rename the new file (click on its name) — type the name *without* `.gs` (e.g., type `PseudonymGenerator`, not `PseudonymGenerator.gs`). Apps Script adds the extension automatically:
   - `PseudonymGenerator`
   - `MappingManager`
   - `SheetAnonymizer`
   - `DocAnonymizer`
4. Copy-paste the contents from the matching file in this folder

### Add the HTML file
1. Click the **"+"** button next to "Files"
2. Choose **"HTML"**
3. Name it `Sidebar` (it will become `Sidebar.html`)
4. Replace all the default HTML with the contents of `Sidebar.html` from this folder

When you're done, your project should have these files in the sidebar:
- `Code.gs`
- `PseudonymGenerator.gs`
- `MappingManager.gs`
- `SheetAnonymizer.gs`
- `DocAnonymizer.gs`
- `Sidebar.html`

## Step 3: Set Up the Manifest

1. In the Apps Script editor, click the gear icon (⚙️) labeled **"Project Settings"** in the left sidebar
2. Check the box **"Show 'appsscript.json' manifest file in editor"**
3. Go back to the Editor (< > icon) and click on `appsscript.json`
4. Replace its contents with:

```json
{
  "timeZone": "America/New_York",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/script.container.ui",
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  "addOns": {
    "common": {
      "name": "File Prep",
      "logoUrl": "https://www.gstatic.com/images/branding/product/1x/docs_2020q4_48dp.png",
      "homepageTrigger": {
        "runFunction": "onOpen"
      }
    },
    "sheets": {
      "onOpenTrigger": {
        "runFunction": "onOpen"
      }
    },
    "docs": {
      "onOpenTrigger": {
        "runFunction": "onOpen"
      }
    }
  }
}
```

(Adjust the `timeZone` if you're not on the US East Coast.)

## Step 4: Test It

1. Save all files (Ctrl+S / Cmd+S)
2. Click **"Run"** at the top and select the `onOpen` function
3. The first time, Google will ask you to authorize the script. Click through:
   - "Review Permissions"
   - Choose your account
   - If you see "Google hasn't verified this app," click "Advanced" → "Go to File Prep (unsafe)" — this is normal for personal scripts
   - Click "Allow"
4. Open any Google Sheet
5. Go to **Extensions → File Prep → Open sidebar**
6. The sidebar should appear on the right side

## Step 5: Deploy as an Add-on (Optional — for Convenience)

If you want File Prep to appear automatically in every Sheet and Doc:

1. In the Apps Script editor, click **"Deploy"** → **"Test deployments"**
2. Click **"Install"**
3. Now "File Prep" will appear under Extensions in every Sheet and Doc you open

This is a test deployment — only you can see it. Nobody else in your org will see it or know about it.

## How to Use

### Protecting a Sheet
1. Open any Google Sheet with sensitive data
2. Go to **Extensions → File Prep → Open sidebar**
3. Select a **Category** (Funders, Participants, etc.)
4. The sidebar auto-scans for headers like "Name," "Email," "Phone," "Organization"
5. Check/uncheck the detected fields, or add custom ranges
6. Click **"Protect"**
7. A new copy of the spreadsheet is created with all identifiers replaced by pseudonyms
8. Use the prepped copy for your analysis work

### Protecting a Doc
1. Open any Google Doc
2. Open the File Prep sidebar
3. Click **"Scan"** to find terms that match your mapping table
4. Optionally add new terms that aren't in the mapping yet
5. Click **"Protect"** — a prepped copy is created

### Restoring (De-anonymizing)
1. After your analysis, paste results into a Sheet or Doc
2. Open the File Prep sidebar
3. Click **"Restore"**
4. All pseudonyms are replaced back with the real values

### The Mapping Sheet
- File Prep automatically creates a private Google Sheet called **"File Prep Mapping (Resource)"** in your Google Drive
- This is where all your pseudonym mappings are stored
- You can view and edit it anytime via the "View mapping sheet" link in the sidebar
- Each tab represents a category (Funders, Participants, etc.)
- **Keep this file private** — it's the key to your anonymization

## Troubleshooting

**"File Prep" doesn't appear in the Extensions menu:**
- Make sure you ran the script at least once and authorized it
- Try refreshing the Google Sheet/Doc page

**Authorization error:**
- Go to script.google.com, open the project, and run any function to re-authorize

**"Mapping sheet not found" error:**
- The mapping sheet may have been accidentally deleted. File Prep will create a new one automatically, but previous mappings will be lost.

**Org admin restrictions:**
- If your organization blocks Apps Script add-ons, you can use File Prep from a personal Google account instead. Copy the sensitive data to a Sheet in your personal Drive, run File Prep there, and copy the prepped version back.
