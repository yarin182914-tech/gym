// iPhone button and menu names, exactly as the phone shows them, for the
// how-tos on "חיבורים" (js/pages/connections.js). The app's own copy stays
// Hebrew; only these labels follow the phone's language.
//
// The Hebrew strings must be checked on a real Hebrew iPhone before merge
// (docs/roadmap.md, M3c) — iOS wording shifts between versions.

export const IOS_LANGS = ['he', 'en'];

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
  },
};
