// iPhone button and menu names, exactly as the phone shows them, for the
// how-tos on "חיבורים" (js/pages/connections.js). The app's own copy stays
// Hebrew; only these labels follow the phone's language.
//
// The Hebrew strings must be checked on a real Hebrew iPhone before merge
// (docs/roadmap.md, M3c) — iOS wording shifts between versions.

export const IOS_LANGS = ['he', 'en'];

// The words to type in the actions search box. A short stem finds the
// action even when its full name differs between iOS versions.
export const IOS_SEARCH = {
  he: { findHealth: 'בריאות', getDetails: 'פרטי', roundNumber: 'עיגול', formatDate: 'תאריך', text: 'טקסט', openUrls: 'כתובות' },
  en: { findHealth: 'Health', getDetails: 'Details', roundNumber: 'Round', formatDate: 'Format Date', text: 'Text', openUrls: 'Open URL' },
};

export const IOS_LABELS = {
  he: {
    shortcutsApp: 'קיצורים',
    automationTab: 'אוטומציה',
    newAutomation: 'אוטומציה חדשה',
    timeOfDay: 'שעה ביום',
    daily: 'מדי יום',
    runImmediately: 'הפעלה מיידית',
    next: 'הבא',
    done: 'סיום',
    addShortcut: 'הוספת קיצור',
    // Building the shortcut by hand (until the iCloud link exists).
    rename: 'שינוי שם',
    findHealth: 'חיפוש דגימות בריאות',
    steps: 'צעדים',
    startDate: 'תאריך התחלה',
    today: 'היום',
    groupBy: 'קיבוץ לפי',
    day: 'יום',
    getDetails: 'קבלת פרטים על דגימות בריאות',
    value: 'ערך',
    getWord: 'קבלת',
    roundNumber: 'עיגול מספר',
    formatDate: 'המרת מבנה תאריך',
    currentDate: 'תאריך נוכחי',
    custom: 'מותאם אישית',
    text: 'טקסט',
    openUrls: 'פתיחת כתובות אינטרנט',
    allow: 'אפשר',
  },
  en: {
    shortcutsApp: 'Shortcuts',
    automationTab: 'Automation',
    newAutomation: 'New Automation',
    timeOfDay: 'Time of Day',
    daily: 'Daily',
    runImmediately: 'Run Immediately',
    next: 'Next',
    done: 'Done',
    addShortcut: 'Add Shortcut',
    rename: 'Rename',
    findHealth: 'Find Health Samples',
    steps: 'Steps',
    startDate: 'Start Date',
    today: 'Today',
    groupBy: 'Group By',
    day: 'Day',
    getDetails: 'Get Details of Health Samples',
    value: 'Value',
    getWord: 'Get',
    roundNumber: 'Round Number',
    formatDate: 'Format Date',
    currentDate: 'Current Date',
    custom: 'Custom',
    text: 'Text',
    openUrls: 'Open URLs',
    allow: 'Allow',
  },
};
