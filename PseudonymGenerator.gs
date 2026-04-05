/**
 * PseudonymGenerator.gs
 * Generates mnemonic, initial-preserving pseudonyms for File Prep.
 *
 * - Person names: "Sarah Johnson" → "S. Jasper"
 * - Organizations: "Microsoft" → "Magnolia"
 * - Emails: derived from person/org pseudonym + @example.com
 * - Phones: replaced with (555) 000-XXXX pattern
 */

// ─── Word Banks (organized by first letter) ───

var FIRST_NAMES_ = {
  A: ["Aspen","Archer","Avery","Arden","Ainsley","Alder","Aubrey","Atlas"],
  B: ["Blake","Blair","Briar","Bellamy","Brooks","Bailey","Baylor","Beckett"],
  C: ["Camden","Casey","Cedar","Corin","Clarke","Carey","Cypress","Cleo"],
  D: ["Dakota","Dana","Drew","Darcy","Devin","Dale","Dawson","Dorian"],
  E: ["Ellis","Emery","Eden","Everly","Elliott","Elm","Essex","Echo"],
  F: ["Finley","Fern","Flynn","Fallon","Fraser","Fable","Fox","Fielding"],
  G: ["Glenn","Gray","Greer","Gale","Grady","Garnet","Geneva","Garland"],
  H: ["Harper","Hollis","Haven","Heath","Hadley","Hale","Henley","Hawk"],
  I: ["Indigo","Iris","Ives","Ira","Ingram","Ivory","Iden","Ilan"],
  J: ["Jasper","Jordan","Jules","Jarden","Juniper","Justice","Jessamy","Joss"],
  K: ["Kendall","Kieran","Kai","Keller","Kit","Keane","Kerry","Knox"],
  L: ["Linden","Lake","Lane","Laurel","Lark","Leigh","Logan","Lyric"],
  M: ["Morgan","Marlowe","Merit","Mercer","Moss","Monroe","Maven","Maren"],
  N: ["Noel","Neve","North","Nash","Nico","Noble","Nell","Navarro"],
  O: ["Oakley","Orion","Olive","Odell","Onyx","Oleander","Owen","Oakes"],
  P: ["Parker","Palmer","Perry","Phoenix","Peyton","Penn","Pace","Prosper"],
  Q: ["Quinn","Quill","Quest","Quillan","Quade","Quinlan","Quarry","Questa"],
  R: ["Rowan","Reed","Riley","Raven","Reese","Rio","Ridley","Rune"],
  S: ["Sage","Sawyer","Shea","Sterling","Sloane","Skyler","Sutton","Sable"],
  T: ["Tatum","Teagan","Thorne","Teal","Tierney","True","Talon","Thayer"],
  U: ["Urban","Unity","Ulrich","Uma","Usher","Umber","Upton","Ula"],
  V: ["Vale","Vesper","Vance","Valor","Verity","Voss","Vivian","Valen"],
  W: ["Wren","Wilder","Winter","Wells","Whitley","Waylon","Wynn","Wolfe"],
  X: ["Xander","Xara","Xavier","Xen","Xiomara","Xyla","Xeric","Xael"],
  Y: ["Yardley","York","Yael","Yara","Yates","Yarrow","Yves","Yale"],
  Z: ["Zephyr","Zara","Zane","Zenith","Zion","Zelda","Zola","Zaire"]
};

var ORG_WORDS_ = {
  A: ["Arbor","Alpine","Amber","Anchor","Apex","Azure","Atlas","Aspen"],
  B: ["Beacon","Birch","Bridge","Brook","Bloom","Basalt","Bay","Breeze"],
  C: ["Crest","Cedar","Coral","Compass","Canopy","Cascade","Cobalt","Cove"],
  D: ["Delta","Dawn","Drift","Dune","Dover","Denali","Dahlia","Doral"],
  E: ["Elm","Echo","Ember","Evergreen","Estuary","Edgewood","Ether","Easton"],
  F: ["Fern","Frost","Forge","Falcon","Flora","Flint","Fjord","Fable"],
  G: ["Glen","Garnet","Grove","Glacier","Glade","Granite","Gateway","Gold"],
  H: ["Harbor","Hazel","Horizon","Heath","Heron","Highland","Hollow","Haze"],
  I: ["Iris","Ivy","Inlet","Iron","Isle","Indigo","Ivory","Ice"],
  J: ["Jade","Jasmine","Junction","Juniper","Jetty","Jewel","Journey","Jay"],
  K: ["Kelp","Keystone","Kindle","Knoll","Kestrel","Kaolin","Kite","Knot"],
  L: ["Lark","Laurel","Ledge","Lily","Lumen","Lagoon","Limestone","Lodge"],
  M: ["Magnolia","Maple","Meadow","Mesa","Mineral","Moonrise","Marsh","Mist"],
  N: ["Nectar","Nimbus","Noble","Northwind","Nutmeg","Nova","Nest","Nook"],
  O: ["Oak","Oasis","Obsidian","Olive","Onyx","Orchid","Osprey","Oxbow"],
  P: ["Pine","Pearl","Pebble","Prairie","Prism","Plume","Pond","Peak"],
  Q: ["Quartz","Quarry","Quill","Quiet","Quinoa","Quest","Quay","Quasar"],
  R: ["Ridge","River","Reef","Rosewood","Raven","Rain","Redwood","Ripple"],
  S: ["Summit","Spruce","Stone","Silver","Sequoia","Sunset","Sage","Shore"],
  T: ["Timber","Tide","Trail","Thorn","Terrace","Terra","Trillium","Tundra"],
  U: ["Uplift","Umber","Unity","Ursa","Upland","Utopia","Umbra","Urchin"],
  V: ["Vine","Valley","Violet","Vista","Venture","Volcanic","Verdant","Veil"],
  W: ["Willow","Wave","Wren","Woodlands","Wharf","Windmill","Watershed","Wick"],
  X: ["Xenon","Xeris","Xylem","Xeric","Xyst","Xenolith","Xanthic","Xebec"],
  Y: ["Yarrow","Yew","Yellowstone","Yonder","Yield","Yucca","Yukon","Yoke"],
  Z: ["Zenith","Zinc","Zephyr","Zinnia","Zion","Zodiac","Zone","Zeal"]
};

/**
 * Generate a pseudonym for a person name.
 * "Sarah Johnson" → "S. Jasper"
 * Preserves both initials when possible.
 *
 * @param {string} realName - The real person name
 * @param {Object} existingMappings - Map of existing pseudonyms (pseudonym → true)
 * @return {string} A mnemonic pseudonym
 */
function generatePersonPseudonym(realName, existingMappings) {
  existingMappings = existingMappings || {};
  var parts = realName.trim().split(/\s+/);

  var firstInitial = (parts[0] || "A").charAt(0).toUpperCase();
  var lastInitial = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).charAt(0).toUpperCase();

  // Ensure valid letter
  if (!FIRST_NAMES_[firstInitial]) firstInitial = "A";
  if (!FIRST_NAMES_[lastInitial]) lastInitial = "A";

  // Try to find an unused last-name from the bank matching lastInitial
  var lastNameBank = FIRST_NAMES_[lastInitial];
  for (var i = 0; i < lastNameBank.length; i++) {
    var candidate = firstInitial + ". " + lastNameBank[i];
    if (!existingMappings[candidate]) {
      return candidate;
    }
  }

  // Fallback: append a number
  for (var n = 2; n < 999; n++) {
    var fallback = firstInitial + ". " + lastNameBank[0] + n;
    if (!existingMappings[fallback]) {
      return fallback;
    }
  }

  return firstInitial + ". " + lastInitial + "-" + Date.now();
}

/**
 * Generate a pseudonym for an organization name.
 * "Microsoft" → "Magnolia"
 *
 * @param {string} realName - The real organization name
 * @param {Object} existingMappings - Map of existing pseudonyms (pseudonym → true)
 * @return {string} A mnemonic pseudonym
 */
function generateOrgPseudonym(realName, existingMappings) {
  existingMappings = existingMappings || {};
  var initial = (realName || "A").trim().charAt(0).toUpperCase();

  if (!ORG_WORDS_[initial]) initial = "A";

  var bank = ORG_WORDS_[initial];
  for (var i = 0; i < bank.length; i++) {
    if (!existingMappings[bank[i]]) {
      return bank[i];
    }
  }

  // Fallback: append a number
  for (var n = 2; n < 999; n++) {
    var fallback = bank[0] + " " + n;
    if (!existingMappings[fallback]) {
      return fallback;
    }
  }

  return initial + "-Org-" + Date.now();
}

/**
 * Generate a pseudonym email based on a person or org pseudonym.
 * "S. Jasper" → "s.jasper@example.com"
 * "Magnolia" → "magnolia@example.com"
 *
 * @param {string} pseudonym - The already-generated pseudonym for this entity
 * @return {string} A fake email address
 */
function generateEmailPseudonym(pseudonym) {
  var cleaned = pseudonym
    .replace(/\.\s+/g, ".")   // "S. Jasper" → "S.Jasper"
    .replace(/\s+/g, ".")      // spaces → dots
    .replace(/[^a-zA-Z0-9.]/g, "") // remove special chars
    .toLowerCase();
  return cleaned + "@example.com";
}

/**
 * Generate a pseudonym phone number preserving the format.
 * "(212) 555-1234" → "(555) 000-0001"
 * "212-555-1234" → "555-000-0001"
 *
 * @param {string} realPhone - The real phone number
 * @param {number} counter - A unique counter to make each phone unique
 * @return {string} A fake phone number
 */
function generatePhonePseudonym(realPhone, counter) {
  counter = counter || 1;
  var suffix = ("0000" + counter).slice(-4);

  // Try to preserve format
  if (/\(\d{3}\)\s*\d{3}-\d{4}/.test(realPhone)) {
    return "(555) 000-" + suffix;
  }
  if (/\d{3}-\d{3}-\d{4}/.test(realPhone)) {
    return "555-000-" + suffix;
  }
  if (/\d{10}/.test(realPhone.replace(/\D/g, ""))) {
    return "5550000" + suffix;
  }
  // Generic fallback
  return "555-000-" + suffix;
}

/**
 * Detect what type of identifier a value likely is.
 *
 * @param {string} value - The cell value to classify
 * @return {string} One of: "email", "phone", "name", "unknown"
 */
function detectIdentifierType(value) {
  if (!value || typeof value !== "string") return "unknown";
  value = value.trim();

  // Email pattern
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";

  // Phone pattern (various formats)
  var digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length >= 7 && digitsOnly.length <= 15 &&
      /^[\d\s\-\(\)\+\.]+$/.test(value)) return "phone";

  // If it looks like a name (1-4 words, mostly letters)
  if (/^[A-Za-z\s\.\-']{2,60}$/.test(value) && value.split(/\s+/).length <= 5) return "name";

  return "unknown";
}
