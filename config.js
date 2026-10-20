/*
 * Site configuration - the only file you normally need to touch in code.
 * Everything else (app details, departments, contacts, policy text) is edited in the Google Sheet.
 * See README.md > "Connect the Google Sheet".
 */
window.SITE_CONFIG = {
  // Option A (simplest): the long ID in the sheet URL
  //   https://docs.google.com/spreadsheets/d/<THIS PART>/edit
  // The sheet must be shared as "Anyone with the link - Viewer".
  googleSheetId: '',

  // Option B: if your Google Workspace blocks link sharing, use File > Share > Publish to web,
  // choose each tab + "Comma-separated values (.csv)" and paste the links here.
  // A link here overrides Option A for that tab.
  publishedCsv: {
    settings: '',
    apps: '',
    departments: '',
    tasks: '',
    glossary: '',
    faq: '',
  },

  // Tab names inside the Google Sheet (change only if you rename the tabs).
  tabs: {
    settings: 'settings',
    apps: 'apps',
    departments: 'departments',
    tasks: 'tasks',
    glossary: 'glossary',
    faq: 'faq',
  },

  // Give up on the sheet after this many seconds and show the offline copy.
  timeoutSeconds: 8,
};
