// "חיבורים" — one card per outside source feeding the app: its status, a
// one-tap action and short steps. Opened from the profile sheet. M3c
// builds the page and its first card (steps from the iPhone); later
// milestones replace their grey "בקרוב" card with a real one. M11 adds the
// Claude connector card (personal keys, js/lib/mcp-keys.js). M7 adds
// Google Calendar (a one-time consent; the server keeps it —
// js/lib/calendar-sync.js).
//
// How-tos name the iPhone's own buttons, so each has a switch for the
// phone's language (labels in js/lib/ios-labels.js); the rest stays Hebrew.
//
// Every card is a closed row until it's tapped (M14b, js/ui/connection-fold.js):
// a connected one shows its name and one status line, one that isn't shows
// one sentence and "לחבר". What needs attention (no steps for two days, an
// expired calendar consent) shows on the closed row too.

import { listDailyActivity, listApiKeys, addApiKey, deleteApiKey, listTasks } from '../lib/firestore.js';
import { calendarStatus, startCalendarConnect, disconnectCalendar, queueCalendarSync } from '../lib/calendar-sync.js';
import { tasksToConnect } from '../lib/calendar-event.js';
import { normalizeTask } from '../lib/tasks.js';
import { routeParams } from '../lib/router.js';
import { makeSecret, formatKey, hashSecret } from '../lib/api-key.js';
import { currentUid } from '../auth.js';
import { useCloud } from '../firebase-config.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { STEPS_IMPORT, MCP } from '../lib/rules.js';
import { listMcpKeys, createMcpKey, deleteMcpKey } from '../lib/firestore.js';
import { generateKey, hashKey, keyPreview, connectorUrl } from '../lib/mcp-keys.js';
import { israelDateKey } from '../lib/steps-import.js';
import { IOS_LABELS, IOS_LANGS, IOS_SEARCH } from '../lib/ios-labels.js';
import { showToast } from '../ui/toast.js';
import { formatDayMonthHe, formatTimeHe, toDate } from '../lib/format.js';
import { beginMount, isStale } from '../core/page.js';
import { esc } from '../core/dom.js';
import { icon } from '../ui/icon.js';
import { mountUsageCard } from '../ui/usage-card.js';
import { foldHead, iosLangSwitch, syncIosLangSwitches } from '../ui/connection-fold.js';

const LANG_KEY = 'gymi.iosLang';
const DAY_MS = 24 * 60 * 60 * 1000;

const CALENDAR_SOON = { icon: 'calendar-days', title: 'יומן גוגל', text: 'משימות עם יום או שעה נכנסות ליומן' };
const SOON = [
  { icon: 'bell', title: 'התראות', text: 'תזכורת רק כשמשהו חסר' },
  { icon: 'cloud', title: 'אחסון בענן', text: 'גיבוי התכנית לדרייב, דרך קלוד' },
  { icon: 'watch', title: 'Garmin', text: 'אימונים, שינה ודופק מהשעון' },
];

let container = null;
let lang = 'he';
let lastImport = null; // Date of the newest shortcut import, or null
let loaded = false;
let stepsKey = null; // the user's steps key doc ({ id: hash, createdAt, lastUsedAt }), or null
let newKey = ''; // the key just made — shown once, until the page is left
let installing = false; // the key was made by "התקנת הקיצור" (one-tap path)
let mcpKeys = null; // the user's Claude keys, or null while loading
let newUrl = null; // the connector address of a key made just now — shown once
let mcpBusy = false;
let usageCard = null; // "אינסטגרם מהאייפון" (js/ui/usage-card.js)
let cal = null; // { configured, calendar, demo? } from the server, or null while loading
let calBusy = false;
// The cards that are open: 'steps' | 'claude' | 'calendar' (the app-time
// card keeps its own). All closed again on every visit.
let openCards = new Set();

function savedLang() {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (IOS_LANGS.includes(v)) return v;
  } catch { /* fall through to the browser's language */ }
  return (navigator.language || '').toLowerCase().startsWith('he') ? 'he' : 'en';
}

export async function mountConnections(rootEl) {
  const token = beginMount();
  container = rootEl;
  lang = savedLang();
  loaded = false;
  mcpKeys = null;
  newUrl = null;
  cal = null;
  calBusy = false;
  openCards = new Set();
  render();
  loadCalendar(token);
  listMcpKeys().catch((err) => {
    console.error('[connections] keys load failed', err);
    return [];
  }).then((list) => {
    if (isStale(token)) return;
    mcpKeys = list;
    renderClaude();
  });
  const [acts, keys] = await Promise.all([
    listDailyActivity(STEPS_IMPORT.statusDays).catch((err) => {
      console.error('[connections] activity load failed', err);
      return [];
    }),
    listApiKeys().catch((err) => {
      console.error('[connections] keys load failed', err);
      return [];
    }),
  ]);
  if (isStale(token)) return;
  stepsKey = keys.find((k) => (k.scopes || []).includes('steps')) || null;
  const times = acts.filter((a) => a.source === 'shortcut' && a.loggedAt).map((a) => toDate(a.loggedAt).getTime());
  lastImport = times.length ? new Date(Math.max(...times)) : null;
  loaded = true;
  renderSteps();
}

export function unmountConnections() {
  container = null;
  lastImport = null;
  mcpKeys = null;
  newUrl = null;
  stepsKey = null;
  newKey = '';
  installing = false;
  usageCard = null;
  cal = null;
  openCards = new Set();
}

function render() {
  container.innerHTML = `
    <p class="text-muted connections-intro">מקורות שמעדכנים את ג׳יני לבד, בלי רישום ידני.</p>
    <section class="card connection-main" aria-labelledby="conn-steps-title" data-steps></section>
    <section class="card connection-main" aria-labelledby="conn-claude-title" data-claude></section>
    <section class="card connection-main" aria-labelledby="conn-calendar-title" data-calendar hidden></section>
    <div data-usage></div>
    <h2 class="connections-soon-title">בקרוב</h2>
    <div class="connections-soon" data-soon></div>`;

  usageCard = mountUsageCard(container.querySelector('[data-usage]'), () => lang);
  container.addEventListener('click', onToggle);
  container.addEventListener('click', onLangClick);
  container.addEventListener('click', onCopy);
  container.addEventListener('click', onKeyAction);
  container.addEventListener('click', onClaudeClick);
  container.addEventListener('click', onCalendarClick);
  renderCalendar();
  renderSteps();
  renderClaude();
}

const CARD_RENDER = { steps: () => renderSteps(), claude: () => renderClaude(), calendar: () => renderCalendar() };

// A tap on a card's top row opens or closes it.
function onToggle(e) {
  const btn = container && e.target.closest('[data-conn-toggle]');
  const id = btn?.dataset.connToggle;
  if (!CARD_RENDER[id]) return;
  if (openCards.has(id)) openCards.delete(id); else openCards.add(id);
  CARD_RENDER[id]();
  container.querySelector(`[data-conn-toggle="${id}"]`)?.focus({ preventScroll: true });
}

// The iPhone's language, from the switch inside any open card.
function onLangClick(e) {
  const btn = container && e.target.closest('[data-ioslang]');
  if (!btn || btn.dataset.ioslang === lang) return;
  lang = btn.dataset.ioslang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch { /* the choice just won't be remembered */ }
  syncIosLangSwitches(container, lang);
  const howToEl = container.querySelector('[data-howto]');
  if (howToEl) howToEl.innerHTML = howTo();
  const buildEl = container.querySelector('[data-build]');
  if (buildEl) buildEl.innerHTML = buildSteps();
  renderSilent();
  usageCard?.render();
}

function stepsStatusLine() {
  if (!loaded) return '<span class="text-muted">בודק…</span>';
  if (!lastImport) return '<span class="status-dot"></span>לא מחובר';
  const day = israelDateKey(lastImport);
  const when = day === israelDateKey() ? 'היום'
    : day === israelDateKey(new Date(Date.now() - DAY_MS)) ? 'אתמול'
      : formatDayMonthHe(lastImport);
  return `<span class="status-dot status-dot--on"></span>מחובר · עודכן ${when} ב-${formatTimeHe(lastImport)}`;
}

// Nothing has arrived for a while: said on the closed row too.
function stepsStaleHint() {
  const n = STEPS_IMPORT.staleAfterDays;
  if (!lastImport || Date.now() - lastImport.getTime() < n * DAY_MS) return '';
  return `<p class="connection-hint">לא הגיעו צעדים כבר ${n === 2 ? 'יומיים' : `${n} ימים`}. כדאי לבדוק שהאוטומציה פעילה, או להריץ את הקיצור ידנית.</p>`;
}

function renderSteps() {
  const el = container?.querySelector('[data-steps]');
  if (!el) return;
  const open = openCards.has('steps');
  el.innerHTML = `
    ${foldHead({
      id: 'steps',
      iconName: 'smartphone',
      title: 'צעדים מהאייפון',
      status: stepsStatusLine(),
      pitch: 'הצעדים של היום נכנסים לבד, בלי להקליד.',
      connected: !loaded || !!lastImport,
      open,
    })}
    ${stepsStaleHint()}
    ${open ? stepsBody() : ''}`;
  if (!open) return;
  syncIosLangSwitches(el, lang);
  renderSilent();
}

function stepsBody() {
  const url = STEPS_IMPORT.shortcutUrl;
  const action = url
    ? `<a class="btn btn-primary btn-block" href="${esc(url)}" target="_blank" rel="noopener">${icon('download', { className: 'icon--sm' })} הוספת הקיצור</a>`
    : `<button type="button" class="btn btn-primary btn-block" disabled>${icon('download', { className: 'icon--sm' })} הוספת הקיצור</button>
       <p class="text-muted connection-note">הקישור לקיצור יתווסף בקרוב.</p>`;
  return `
      <p class="text-muted connection-desc">קיצור באייפון קורא את הצעדים של היום מאפליקציית הבריאות ושולח אותם לג׳יני. הרגל הצעדים והשריפה היומית מתעדכנים לבד.</p>
      ${iosLangSwitch(lang)}
      <div class="connection-silent" data-silent></div>
      ${STEPS_IMPORT.silentShortcutUrl ? '<div data-build hidden></div>' : `
      <p class="text-muted connection-note connection-or">או בדרך הפשוטה, שפותחת את Safari לרגע:</p>
      ${action}
      <details class="connection-build"${STEPS_IMPORT.shortcutUrl ? '' : ' open'}>
        <summary>${icon('pencil', { className: 'icon--sm' })} בניית הקיצור, צעד אחר צעד</summary>
        <div data-build>${buildSteps()}</div>
      </details>`}
      <div data-howto>${howTo()}</div>`;
}

// The iPhone's own label, shown as it appears on the phone.
const chip = (text) => `<b class="ios-label" dir="auto">${esc(text)}</b>`;

// The address the shortcut opens, up to where the steps number goes.
const importBase = () => `${location.origin}/#/import?steps=`;

const COPY = {
  base: () => importBase(),
  date: () => '&date=',
  api: () => `${location.origin}/api/steps`,
  bearer: () => `Bearer ${newKey}`,
  key: () => newKey,
};

async function onCopy(e) {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const text = (COPY[btn.dataset.copy] || COPY.date)();
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${icon('check', { className: 'icon--sm' })} הועתק`);
  } catch {
    showToast('לא הצלחתי להעתיק, אפשר לסמן ולהעתיק ידנית');
  }
}

// Making the shortcut by hand, one action at a time. Every action is found
// by typing a short word in the actions search box.
function buildSteps() {
  const L = IOS_LABELS[lang];
  const S = IOS_SEARCH[lang];
  const find = (key) => `בשורת החיפוש למטה מקלידים ${chip(S[key])} ומוסיפים את ${chip(L[key])}.`;
  const copyBtn = (what, label) => `<button type="button" class="btn btn-secondary connection-copy" data-copy="${what}">${icon('copy', { className: 'icon--sm' })} ${label}</button>`;
  const steps = [
    `פותחים את ${chip(L.shortcutsApp)}, לוחצים ${chip('+')} למעלה. לוחצים על השם שבראש המסך, ${chip(L.rename)}, וכותבים ${chip(STEPS_IMPORT.shortcutName)}.`,
    `${find('findHealth')} בתוכה: לוחצים על הסוג ובוחרים ${chip(L.steps)}, מוודאים ש${chip(L.startDate)} הוא ${chip(L.today)}, ובשורה ${chip(L.groupBy)} בוחרים ${chip(L.day)}.`,
    `${find('getDetails')} הפעולה נראית כמו משפט אחד עם שתי מילים כחולות. לוחצים על המילה הכחולה <b>הראשונה</b> (מיד אחרי ${chip(L.getWord)}) ובוחרים ${chip(L.value)}. את המילה הכחולה השנייה לא משנים, היא כבר מחוברת לשלב 2.`,
    `${find('roundNumber')} למה: לפעמים הבריאות מחזירה מספר עם נקודה עשרונית, וג׳יני מקבלת רק מספר שלם. לא משנים בה כלום: היא לוקחת לבד את הערך משלב 3. ממשיכים לשלב הבא.`,
    `${find('formatDate')} לא מקלידים תאריך. לפי הסדר:
      <ol class="connection-substeps">
        <li>לוחצים על השדה הכחול בראש הפעולה. אם קיצורים כבר שם בו לבד את המספר משלב 4, מוחקים אותו.</li>
        <li>בשורה שמעל המקלדת (או ברשימה שנפתחת) בוחרים ${chip(L.currentDate)}.</li>
        <li>פותחים את הפעולה בחץ הקטן שבצד, ובשורת הפורמט בוחרים ${chip(L.custom)}.</li>
        <li>בשדה הפורמט כותבים בדיוק <span class="connection-code" dir="ltr">yyyy-MM-dd</span>. בדוגמה למטה אמור להופיע התאריך של היום, למשל <span class="connection-code" dir="ltr">2026-11-10</span>.</li>
      </ol>`,
    `${find('text')} בתוך תיבת הטקסט, לפי הסדר:
      <ol class="connection-substeps">
        <li>מדביקים את הכתובת: ${copyBtn('base', 'העתקת הכתובת')}</li>
        <li>לא מקלידים את המשתנה. בשורה שמעל המקלדת לוחצים על ${chip(L.roundedVar)}, והוא נכנס כבועה כחולה. אם הוא לא שם: ${chip(L.selectVar)}, ואז הפעולה ${chip(L.roundNumber)}.</li>
        <li>מיד אחרי הבועה, בלי רווח, מדביקים <span class="connection-code" dir="ltr">&amp;date=</span> ${copyBtn('date', 'העתקה')}</li>
        <li>שוב בשורה שמעל המקלדת לוחצים על ${chip(L.formattedVar)}.</li>
      </ol>
      בסוף זה נראה כך, עם שני משתנים כחולים במקום המספרים: <span class="connection-code connection-code--wrap" dir="ltr">…/#/import?steps=12450&amp;date=2026-11-09</span>`,
    `${find('openUrls')} היא לוקחת לבד את הטקסט מהשלב הקודם.`,
    `לוחצים ▶ למטה כדי להריץ פעם אחת. מאשרים גישה לבריאות (${chip(L.allow)}). Safari ייפתח: מתחברים עם גוגל, ומופיעה הודעה עם מספר הצעדים.`,
  ];
  return `
    <p class="text-muted connection-note">בונים פעם אחת, בערך 5 דקות. אחר כך מגדירים לו אוטומציה יומית (למטה).</p>
    <ol class="connection-steps connection-steps--build">
      ${steps.map((text, i) => `<li><span class="connection-step-num">${i + 1}</span><span>${text}</span></li>`).join('')}
    </ol>`;
}

function howTo() {
  const L = IOS_LABELS[lang];
  const steps = [
    ['smartphone', `פותחים את ${chip(L.shortcutsApp)} ועוברים ללשונית ${chip(L.automationTab)}.`],
    ['plus', `לוחצים ${chip('+')} (או ${chip(L.newAutomation)}) ובוחרים ${chip(L.timeOfDay)}.`],
    ['clock', `מגדירים <span dir="ltr">${esc(STEPS_IMPORT.automationTime)}</span> ${chip(L.daily)}, מסמנים ${chip(L.runImmediately)} ולוחצים ${chip(L.next)}.`],
    ['check', `בוחרים את הקיצור ${chip(STEPS_IMPORT.shortcutName)} ולוחצים ${chip(L.done)}.`],
  ];
  return `
    <p class="connection-note">${STEPS_IMPORT.silentShortcutUrl ? 'אחרי שהקיצור נוסף,' : STEPS_IMPORT.shortcutUrl ? `אחרי הלחיצה, באייפון לוחצים ${chip(L.addShortcut)}. ואז` : 'כשהקיצור מוכן,'} אוטומציה יומית:</p>
    <ol class="connection-steps">
      ${steps.map(([name, text], i) => `<li><span class="connection-step-num">${i + 1}</span>${icon(name, { className: 'icon--sm' })}<span>${text}</span></li>`).join('')}
    </ol>
    <ul class="connection-notes text-muted">
      ${STEPS_IMPORT.silentShortcutUrl ? '' : '<li>האוטומציה פותחת את Safari לרגע ושומרת. בפעם הראשונה צריך להתחבר עם גוגל גם ב-Safari.</li>'}
      <li>אם הטלפון נעול בשעה הזאת, האוטומציה עלולה לא לרוץ. אפשר תמיד להריץ את הקיצור ידנית: לחיצה עליו ב${chip(L.shortcutsApp)}, או מהווידג׳ט במסך הבית.</li>
    </ul>`;
}

// ---------- the silent way: the shortcut posts to /api/steps ----------
// A personal key (js/lib/api-key.js) lets the shortcut send the steps in
// the background — no Safari, and it runs with the phone locked.

function renderSilent() {
  const host = container?.querySelector('[data-silent]');
  if (!host) return;
  const L = IOS_LABELS[lang];
  const S = IOS_SEARCH[lang];
  const copyBtn = (what, label) => `<button type="button" class="btn btn-secondary connection-copy" data-copy="${what}">${icon('copy', { className: 'icon--sm' })} ${label}</button>`;
  const head = `<b class="connection-silent-title">${icon('sparkles', { className: 'icon--sm' })} שליחה שקטה — מומלץ</b>
    <p class="text-muted connection-note">הקיצור שולח את הצעדים ישירות לג׳יני: שום דבר לא נפתח, וזה עובד גם כשהטלפון נעול.</p>`;
  if (!loaded) {
    host.innerHTML = head;
    return;
  }
  if (STEPS_IMPORT.silentShortcutUrl) {
    host.innerHTML = `${head}${oneTap(L)}`;
    return;
  }
  if (!stepsKey && !newKey) {
    host.innerHTML = `${head}
      <button type="button" class="btn btn-primary btn-block" data-key-create>${icon('plug', { className: 'icon--sm' })} יצירת מפתח אישי</button>`;
    return;
  }
  if (!newKey) {
    const used = stepsKey.lastUsedAt ? `נשלח לאחרונה ${formatDayMonthHe(toDate(stepsKey.lastUsedAt))} ב-${formatTimeHe(toDate(stepsKey.lastUsedAt))}` : 'עוד לא נשלח בו כלום';
    host.innerHTML = `${head}
      <p class="connection-key-status"><span class="status-dot status-dot--on"></span>יש מפתח אישי · ${used}</p>
      <p class="text-muted connection-note">המפתח מוצג רק פעם אחת, כשיוצרים אותו. החלפת טלפון או מפתח שאבד: מבטלים ויוצרים חדש.</p>
      <button type="button" class="btn btn-outline btn-block" data-key-revoke>ביטול המפתח ויצירת חדש</button>`;
    return;
  }
  const find = (key) => `בשורת החיפוש מקלידים ${chip(S[key])} ומוסיפים את ${chip(L[key])}`;
  const steps = [
    `פותחים את הקיצור ${chip(STEPS_IMPORT.shortcutName)} ב${chip(L.shortcutsApp)} (לוחצים על שלוש הנקודות שלו). מוחקים את שתי הפעולות האחרונות, ${chip(L.text)} ו${chip(L.openUrls)} (מחליקים שמאלה או ✕).`,
    `${find('getContents')}. בשדה הכתובת מדביקים: ${copyBtn('api', 'העתקת הכתובת')}`,
    `פותחים את הפעולה בחץ הקטן. ${chip(L.method)}: בוחרים ${chip(L.post)}.`,
    `${chip(L.headers)} ← ${chip(L.addHeader)}. ב${chip(L.key)} כותבים <span class="connection-code" dir="ltr">Authorization</span>, וב${chip(L.value)} מדביקים: ${copyBtn('bearer', 'העתקת המפתח')}`,
    `${chip(L.requestBody)}: בוחרים ${chip(L.json)}. ${chip(L.addField)} ← ${chip(L.number)}: מפתח <span class="connection-code" dir="ltr">steps</span>, ובערך לוחצים על המשתנה ${chip(L.roundedVar)}. שוב ${chip(L.addField)} ← ${chip(L.textField)}: מפתח <span class="connection-code" dir="ltr">date</span>, ובערך המשתנה ${chip(L.formattedVar)}.`,
    `לוחצים ▶ להרצה. אם רוצים לראות את התשובה ("נשמרו … צעדים"), מוסיפים בסוף ${chip(L.showResult)}. אחר כך האוטומציה היומית (למטה) עושה את זה לבד.`,
  ];
  host.innerHTML = `${head}
    <div class="connection-key-box">
      <p class="connection-key-warn">${icon('triangle-alert', { className: 'icon--sm' })} המפתח מוצג רק עכשיו. מעתיקים אותו לקיצור לפי השלבים, ולא משתפים אותו עם אף אחד.</p>
      <span class="connection-code connection-code--wrap" dir="ltr">${esc(newKey)}</span>
    </div>
    <p class="text-muted connection-note">אין עדיין קיצור? קודם בונים את שלבים 1–5 במדריך "בניית הקיצור" למטה, ואז ממשיכים כאן.</p>
    <ol class="connection-steps connection-steps--build">
      ${steps.map((text, i) => `<li><span class="connection-step-num">${i + 1}</span><span>${text}</span></li>`).join('')}
    </ol>`;
}

// One tap: make a key, copy it, then open the shared shortcut. When it's
// added, the iPhone asks for the key — it's already on the clipboard.
function oneTap(L) {
  const install = (label, cls) => `<button type="button" class="btn ${cls} btn-block" data-key-install>${icon('download', { className: 'icon--sm' })} ${label}</button>`;
  if (newKey && installing) {
    return `
      <p class="connection-key-status"><span class="status-dot status-dot--on"></span>המפתח האישי הועתק</p>
      <a class="btn btn-primary btn-block" href="${esc(STEPS_IMPORT.silentShortcutUrl)}" target="_blank" rel="noopener">${icon('download', { className: 'icon--sm' })} הוספת הקיצור לאייפון</a>
      <p class="text-muted connection-note">לוחצים ${chip(L.addShortcut)}. כשהאייפון שואל על המפתח, לוחצים בשדה ← ${chip(L.paste)}. אחר כך האוטומציה היומית (למטה), וזהו.</p>
      <details class="connection-build">
        <summary>${icon('copy', { className: 'icon--sm' })} ההדבקה לא עבדה?</summary>
        <div class="connection-key-box">
          <p class="connection-key-warn">${icon('triangle-alert', { className: 'icon--sm' })} המפתח מוצג רק עכשיו. לא משתפים אותו עם אף אחד.</p>
          <span class="connection-code connection-code--wrap" dir="ltr">${esc(newKey)}</span>
          <button type="button" class="btn btn-secondary connection-copy" data-copy="key">${icon('copy', { className: 'icon--sm' })} העתקה שוב</button>
        </div>
      </details>`;
  }
  if (!stepsKey) {
    return `${install('התקנת הקיצור', 'btn-primary')}
      <p class="text-muted connection-note">לוחצים, ומפתח אישי מועתק לבד. בשלב הבא מוסיפים את הקיצור ומדביקים.</p>`;
  }
  const used = stepsKey.lastUsedAt ? `נשלח לאחרונה ${formatDayMonthHe(toDate(stepsKey.lastUsedAt))} ב-${formatTimeHe(toDate(stepsKey.lastUsedAt))}` : 'עוד לא נשלח בו כלום';
  return `
    <p class="connection-key-status"><span class="status-dot status-dot--on"></span>הקיצור מחובר · ${used}</p>
    ${install('התקנה מחדש (טלפון חדש)', 'btn-outline')}
    <p class="text-muted connection-note">התקנה מחדש יוצרת מפתח חדש, והקיצור הישן מפסיק לשלוח.</p>`;
}

// Must start in the tap itself: Safari only lets the page write the
// clipboard during a user gesture, so the copy is handed a promise of the
// key before any await.
function installShortcut() {
  const made = createKey({ replace: true, quiet: true });
  const asBlob = made.then((key) => new Blob([key || ''], { type: 'text/plain' }));
  let copied;
  if (window.ClipboardItem && navigator.clipboard?.write) {
    copied = navigator.clipboard.write([new ClipboardItem({ 'text/plain': asBlob })]);
  } else {
    copied = made.then((key) => key && navigator.clipboard.writeText(key));
  }
  made.then((key) => {
    if (!key) return;
    installing = true;
    renderSilent();
    copied.catch(() => showToast('לא הצלחתי להעתיק. אפשר להעתיק ידנית מ"ההדבקה לא עבדה?"'));
  });
}

async function onKeyAction(e) {
  if (e.target.closest('[data-key-install]')) return installShortcut();
  if (e.target.closest('[data-key-create]')) return createKey();
  if (e.target.closest('[data-key-revoke]')) {
    const ok = await confirmDialog({
      title: 'לבטל את המפתח?',
      message: 'הקיצור הנוכחי יפסיק לשלוח צעדים עד שתדביק בו את המפתח החדש.',
      confirmLabel: 'ביטול ויצירת חדש',
    });
    if (!ok || !stepsKey) return;
    const old = stepsKey.id;
    stepsKey = null;
    await deleteApiKey(old).catch((err) => console.error('[connections] revoke failed', err));
    createKey();
  }
}

// Makes and saves a new steps key; returns it ('' on failure). `replace`
// drops the previous key once the new one is saved.
async function createKey({ replace = false, quiet = false } = {}) {
  // The local sandbox has no signed-in user; its key is only for show.
  const uid = currentUid() || (useCloud ? null : 'devSandboxUser');
  if (!uid) return '';
  const old = replace ? stepsKey?.id : null;
  const secret = makeSecret();
  const hash = await hashSecret(secret);
  try {
    await addApiKey(hash, { label: 'קיצור הצעדים', scopes: ['steps'] });
  } catch (err) {
    console.error('[connections] key save failed', err);
    showToast('לא הצלחתי לשמור את המפתח, נסה שוב');
    return '';
  }
  if (old) deleteApiKey(old).catch((err) => console.error('[connections] revoke failed', err));
  stepsKey = { id: hash, scopes: ['steps'], lastUsedAt: null };
  newKey = formatKey(uid, secret);
  if (!quiet) renderSilent();
  return newKey;
}

// ---------- Claude (M11) ----------
// A personal key per Claude account: made here, shown once inside the
// connector address, stored only as its SHA-256 (mcpKeys/{hash}).

function whenHe(value) {
  if (!value) return null;
  const d = toDate(value);
  const day = israelDateKey(d);
  const label = day === israelDateKey() ? 'היום'
    : day === israelDateKey(new Date(Date.now() - DAY_MS)) ? 'אתמול'
      : formatDayMonthHe(d);
  return `${label} ב-${formatTimeHe(d)}`;
}

function claudeStatus() {
  if (mcpKeys === null) return '<span class="text-muted">בודק…</span>';
  if (!mcpKeys.length) return '<span class="status-dot"></span>לא מחובר';
  const used = mcpKeys.filter((k) => k.lastUsedAt).map((k) => toDate(k.lastUsedAt).getTime());
  return used.length
    ? `<span class="status-dot status-dot--on"></span>מחובר · קלוד ניגש ${whenHe(new Date(Math.max(...used)))}`
    : '<span class="status-dot status-dot--on"></span>יש מפתח · קלוד עוד לא התחבר';
}

function claudeSteps() {
  const steps = [
    ['sparkles', `ב-Claude: ${chip('Settings')} ← ${chip('Connectors')} ← ${chip('Add custom connector')}.`],
    ['copy', `שם: ${chip('ג׳יני')}. בשדה הכתובת מדביקים את מה שהעתקת ולוחצים ${chip('Add')}.`],
    ['check', `בשיחה חדשה מפעילים את ג׳יני (${chip('+')} ← ${chip('Connectors')}) ושואלים "מה מצבי היום?"`],
  ];
  return `
    <ol class="connection-steps connection-steps--build">
      ${steps.map(([name, text], i) => `<li><span class="connection-step-num">${i + 1}</span>${icon(name, { className: 'icon--sm' })}<span>${text}</span></li>`).join('')}
    </ol>`;
}

function keyRow(k) {
  const used = whenHe(k.lastUsedAt);
  return `
    <li class="mcp-key">
      <span class="mcp-key-text">
        <span class="connection-code" dir="ltr">${esc(k.preview || '')}…</span>
        <span class="text-muted">נוצר ${whenHe(k.createdAt) || 'עכשיו'} · ${used ? `בשימוש ${used}` : 'עוד לא בשימוש'}</span>
      </span>
      <button type="button" class="btn btn-secondary connection-copy" data-revoke="${esc(k.id)}" aria-label="ביטול המפתח ${esc(k.preview || '')}">${icon('x', { className: 'icon--sm' })} ביטול</button>
    </li>`;
}

function renderClaude() {
  const el = container?.querySelector('[data-claude]');
  if (!el) return;
  const canAdd = mcpKeys !== null && mcpKeys.length < MCP.maxKeysPerUser && !mcpBusy;
  const first = !mcpKeys?.length;
  const createBtn = `
    <button type="button" class="btn ${first ? 'btn-primary' : 'btn-secondary'} btn-block" data-mcp-create${canAdd ? '' : ' disabled'}>
      ${icon('plus', { className: 'icon--sm' })} ${mcpBusy ? 'יוצר…' : first ? 'צור מפתח' : 'מפתח נוסף'}
    </button>`;
  const fresh = newUrl ? `
    <div class="connection-hint mcp-new-key">
      <b>כתובת החיבור שלך.</b> היא מוצגת עכשיו בלבד. מי שמחזיק בה יכול לקרוא ולרשום בג׳יני שלך, אז לא משתפים אותה.
      <span class="connection-code connection-code--wrap mcp-url" dir="ltr">${esc(newUrl)}</span>
    </div>
    <button type="button" class="btn btn-primary btn-block" data-mcp-copy>${icon('copy', { className: 'icon--sm' })} העתקת הכתובת</button>
    ${claudeSteps()}
    <button type="button" class="btn btn-secondary btn-block" data-mcp-done>${icon('check', { className: 'icon--sm' })} הדבקתי, אפשר להסתיר</button>` : '';
  const open = openCards.has('claude');
  el.innerHTML = `
    ${foldHead({
      id: 'claude',
      iconName: 'sparkles',
      title: 'קלוד',
      status: claudeStatus(),
      pitch: 'הקלוד שלך קורא את הנתונים ורושם בשבילך.',
      connected: mcpKeys === null || mcpKeys.length > 0,
      open,
    })}
    ${open ? `
    <p class="text-muted connection-desc">הקלוד שלך קורא את הנתונים שלך בג׳יני, ורושם בשבילך ארוחות, שקילה, שינה, צעדים וסימון הרגלים. הוא רואה רק את החשבון שלך ולא מוחק כלום.</p>
    ${fresh}
    ${mcpKeys?.length ? `<ul class="mcp-keys">${mcpKeys.map(keyRow).join('')}</ul>` : ''}
    ${newUrl ? '' : createBtn}
    ${mcpKeys !== null && first && !newUrl ? '<p class="text-muted connection-note">לוחצים, מעתיקים את הכתובת ומדביקים אותה ב-Claude. דקה אחת.</p>' : ''}` : ''}`;
}

async function onClaudeClick(e) {
  if (e.target.closest('[data-mcp-create]')) {
    createClaudeKey();
  } else if (e.target.closest('[data-mcp-copy]')) {
    try {
      await navigator.clipboard.writeText(newUrl);
      showToast(`${icon('check', { className: 'icon--sm' })} הכתובת הועתקה`);
    } catch {
      showToast('לא הצלחתי להעתיק, אפשר לסמן ולהעתיק ידנית');
    }
  } else if (e.target.closest('[data-mcp-done]')) {
    newUrl = null;
    renderClaude();
  } else if (e.target.closest('[data-revoke]')) {
    revokeClaudeKey(e.target.closest('[data-revoke]').dataset.revoke);
  }
}

async function createClaudeKey() {
  if (mcpBusy) return;
  mcpBusy = true;
  renderClaude();
  try {
    const key = generateKey();
    const hash = await hashKey(key);
    await createMcpKey(hash, keyPreview(key));
    mcpKeys = [...(mcpKeys || []), { id: hash, preview: keyPreview(key), createdAt: new Date(), lastUsedAt: null }];
    newUrl = connectorUrl(location.origin, key);
  } catch (err) {
    console.error('[connections] key create failed', err);
    showToast(err.message === 'offline' ? 'צריך חיבור לאינטרנט כדי ליצור מפתח' : 'לא הצלחתי ליצור מפתח, אפשר לנסות שוב');
  } finally {
    mcpBusy = false;
    renderClaude();
  }
}

async function revokeClaudeKey(hash) {
  const k = mcpKeys?.find((x) => x.id === hash);
  if (!k) return;
  const yes = await confirmDialog({
    title: 'לבטל את המפתח?',
    message: `קלוד שמחובר עם <span dir="ltr">${esc(k.preview)}…</span> יפסיק לגשת לג׳יני תוך דקה. הנתונים שלך נשארים כמו שהם.`,
    confirmLabel: 'ביטול המפתח',
    cancelLabel: 'השארה',
    danger: true,
  });
  if (!yes) return;
  try {
    await deleteMcpKey(hash);
    mcpKeys = mcpKeys.filter((x) => x.id !== hash);
    newUrl = null;
    showToast('המפתח בוטל');
  } catch (err) {
    console.error('[connections] key revoke failed', err);
    showToast('לא הצלחתי לבטל, אפשר לנסות שוב');
  }
  renderClaude();
}

// ---------- Google Calendar (M7) ----------
// One consent, kept by the server; from then on a task with a day or a
// time has its event (js/lib/calendar-sync.js, docs/specs/calendar-sync.md).

// What Google's way back (#/connections?calendar=<result>) says.
const CALENDAR_RESULTS = {
  ok: 'היומן מחובר',
  cancelled: 'החיבור בוטל',
  scope: 'כדי לחבר, צריך לסמן את ההרשאה ליומן במסך של גוגל',
  account: 'צריך לבחור את אותו חשבון גוגל שאיתו נכנסת לג׳יני',
  failed: 'החיבור לא הצליח, אפשר לנסות שוב',
};

async function loadCalendar(token) {
  const result = routeParams().get('calendar');
  if (result) {
    // Shown once: the address goes back to plain #/connections.
    history.replaceState(null, '', '#/connections');
    showToast(`${result === 'ok' ? `${icon('check', { className: 'icon--sm' })} ` : ''}${CALENDAR_RESULTS[result] || CALENDAR_RESULTS.failed}`);
    // Back from Google: the card it was started from is open again.
    openCards.add('calendar');
  }
  try {
    cal = await calendarStatus();
  } catch (err) {
    console.error('[connections] calendar status failed', err);
    cal = { configured: false };
  }
  if (isStale(token)) return;
  renderCalendar();
  // Just connected: the open tasks that already have a day or a time.
  if (result === 'ok' && cal.calendar?.connected) {
    listTasks()
      .then((list) => queueCalendarSync(tasksToConnect(list.map(normalizeTask))))
      .catch((err) => console.error('[connections] first calendar sync failed', err));
  }
}

function calendarStatusLine() {
  const c = cal.calendar;
  if (cal.demo && c?.connected) return '<span class="status-dot status-dot--on"></span>מחובר (הדגמה)';
  if (c?.connected) {
    const synced = whenHe(c.lastSyncAt);
    return `<span class="status-dot status-dot--on"></span><span>מחובר${c.email ? ` · <span dir="ltr">${esc(c.email)}</span>` : ''}${synced ? ` · סנכרון אחרון ${synced}` : ''}</span>`;
  }
  return '<span class="status-dot"></span>לא מחובר';
}

// The real card once the server is set up; until then (and while
// checking) the grey "בקרוב" one, in its old place.
function renderCalendar() {
  const card = container?.querySelector('[data-calendar]');
  const soon = container?.querySelector('[data-soon]');
  if (!card || !soon) return;
  const ready = !!cal?.configured;
  soon.innerHTML = [...(ready ? [] : [CALENDAR_SOON]), ...SOON].map((s) => `
    <div class="connection-card connection-card--soon">
      <span class="connection-icon">${icon(s.icon)}</span>
      <span class="connection-text"><b>${s.title}</b><span class="text-muted">${s.text}</span></span>
      <span class="connection-badge">בקרוב</span>
    </div>`).join('');
  card.hidden = !ready;
  if (!ready) return;
  const c = cal.calendar;
  const connected = !!c?.connected;
  const connectBtn = (label) => `
    <button type="button" class="btn btn-primary btn-block" data-cal-connect${calBusy ? ' disabled' : ''}>
      ${icon('calendar-days', { className: 'icon--sm' })} ${calBusy ? 'פותח את גוגל…' : label}
    </button>`;
  const open = openCards.has('calendar');
  card.innerHTML = `
    ${foldHead({
      id: 'calendar',
      iconName: 'calendar-days',
      title: 'יומן גוגל',
      status: calendarStatusLine(),
      pitch: 'משימות עם יום או שעה נכנסות ליומן.',
      connected,
      open,
    })}
    ${!connected && c?.needsReconnect ? '<p class="connection-hint">החיבור ליומן פג. חיבור מחדש לוקח רגע, והמשימות שלך לא נפגעו.</p>' : ''}
    ${open ? `
    <p class="text-muted connection-desc">משימה עם יום או שעה נכנסת לבד ליומן שלך. כשמזיזים אותה האירוע זז, וכשמסיימים הוא מקבל ✓. ג׳יני נוגעת רק באירועים שהיא יצרה.</p>
    ${connected
      ? `<button type="button" class="btn btn-outline btn-block" data-cal-disconnect${calBusy ? ' disabled' : ''}>ניתוק היומן</button>`
      : `${connectBtn(c?.needsReconnect ? 'חיבור מחדש' : 'חיבור היומן')}
         <p class="text-muted connection-note">מאשרים פעם אחת במסך של גוגל, וזה נשאר מחובר.</p>`}` : ''}`;
}

async function onCalendarClick(e) {
  if (calBusy) return;
  if (e.target.closest('[data-cal-connect]')) {
    calBusy = true;
    renderCalendar();
    try {
      if (await startCalendarConnect()) return; // left for Google's screen
      cal = await calendarStatus();
      showToast(`${icon('check', { className: 'icon--sm' })} ${CALENDAR_RESULTS.ok} (הדגמה)`);
      calBusy = false;
      renderCalendar();
    } catch (err) {
      console.error('[connections] calendar connect failed', err);
      showToast(navigator.onLine ? 'לא הצלחתי לפתוח את החיבור, אפשר לנסות שוב' : 'צריך חיבור לאינטרנט כדי לחבר את היומן');
      calBusy = false;
      renderCalendar();
    }
  } else if (e.target.closest('[data-cal-disconnect]')) {
    const yes = await confirmDialog({
      title: 'לנתק את היומן?',
      message: 'ג׳יני תפסיק לכתוב ליומן. האירועים שכבר שם נשארים, והמשימות שלך לא משתנות.',
      confirmLabel: 'ניתוק',
      cancelLabel: 'השארה',
    });
    if (!yes) return;
    calBusy = true;
    renderCalendar();
    try {
      await disconnectCalendar();
      cal = { ...cal, calendar: { connected: false, needsReconnect: false } };
      showToast('היומן נותק');
    } catch (err) {
      console.error('[connections] calendar disconnect failed', err);
      showToast('לא הצלחתי לנתק, אפשר לנסות שוב');
    }
    calBusy = false;
    renderCalendar();
  }
}

// Back from Google's screen with the browser's back button: the page is
// restored as it was left, mid-"opening".
window.addEventListener('pageshow', (e) => {
  if (!e.persisted || !container) return;
  calBusy = false;
  renderCalendar();
});
