/**
 * Code.gs
 * Main entry point for the File Prep add-on.
 *
 * Registers the custom menu, launches the sidebar,
 * and provides bridge functions for the sidebar UI.
 */

// ─── Add-on Lifecycle ───

/**
 * Runs when the add-on is installed.
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Runs when a spreadsheet or document is opened.
 * Adds the "File Prep" menu item.
 */
function onOpen(e) {
  try {
    // For Sheets
    SpreadsheetApp.getUi()
      .createAddonMenu()
      .addItem("Open sidebar", "showSidebar")
      .addSeparator()
      .addItem("Quick Protect (last settings)", "quickProtect")
      .addToUi();
  } catch (sheetErr) {
    try {
      // For Docs
      DocumentApp.getUi()
        .createAddonMenu()
        .addItem("Open sidebar", "showSidebar")
        .addSeparator()
        .addItem("Quick Protect (last settings)", "quickProtect")
        .addToUi();
    } catch (docErr) {
      Logger.log("Could not create menu: " + docErr.message);
    }
  }
}

/**
 * Show the sidebar.
 */
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile("Sidebar")
    .setTitle("File Prep")
    .setWidth(300);

  try {
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (e) {
    try {
      DocumentApp.getUi().showSidebar(html);
    } catch (e2) {
      Logger.log("Could not show sidebar: " + e2.message);
    }
  }
}

// ─── Sidebar Bridge Functions ───

/**
 * Detect whether we're in a Spreadsheet or a Document.
 * @return {string} "sheets" or "docs"
 */
function getDocumentMode() {
  try {
    SpreadsheetApp.getActiveSpreadsheet();
    return "sheets";
  } catch (e) {
    return "docs";
  }
}

/**
 * Quick Protect — re-run the last protect operation.
 * Uses saved settings from the last sidebar run.
 */
function quickProtect() {
  var props = PropertiesService.getUserProperties();
  var lastConfig = props.getProperty("FILE_PREP_LAST_CONFIG");

  if (!lastConfig) {
    try {
      SpreadsheetApp.getUi().alert(
        "No previous settings found. Please use the sidebar to set up your first protection."
      );
    } catch (e) {
      DocumentApp.getUi().alert(
        "No previous settings found. Please use the sidebar to set up your first protection."
      );
    }
    return;
  }

  var config;
  try {
    config = JSON.parse(lastConfig);
  } catch (parseErr) {
    props.deleteProperty("FILE_PREP_LAST_CONFIG");
    try {
      SpreadsheetApp.getUi().alert(
        "Saved settings are corrupted and have been cleared. Please use the sidebar to set up protection again."
      );
    } catch (e) {
      DocumentApp.getUi().alert(
        "Saved settings are corrupted and have been cleared. Please use the sidebar to set up protection again."
      );
    }
    return;
  }
  var mode = getDocumentMode();

  var result;
  if (mode === "sheets") {
    result = anonymizeSheet(config);
  } else {
    result = anonymizeDoc(config);
  }

  if (result.success) {
    try {
      SpreadsheetApp.getUi().alert(
        "Prepped copy created!\n\nOpen it at:\n" + result.copyUrl
      );
    } catch (e) {
      DocumentApp.getUi().alert(
        "Prepped copy created!\n\nOpen it at:\n" + result.copyUrl
      );
    }
  }
}

/**
 * Save the last-used config for Quick Protect.
 * Called from the sidebar after a successful protect.
 *
 * @param {Object} config - The config object used for the last protect
 */
function saveLastConfig(config) {
  var props = PropertiesService.getUserProperties();
  props.setProperty("FILE_PREP_LAST_CONFIG", JSON.stringify(config));
}
