// "חיבורים" — one card per outside source feeding the app: its status, a
// one-tap action and short steps. Opened from the profile sheet. M3c
// builds the page and its first card (steps from the iPhone); later
// milestones replace their grey "בקרוב" card with a real one. M11 adds the
// Claude connector card (personal keys, js/lib/mcp-keys.js).
//
// How-tos name the iPhone's own buttons, so each has a switch for the
// phone's language (labels in js/lib/ios-labels.js); the rest stays Hebrew.

import { listDailyActivity, listApiKeys, addApiKey, deleteApiKey } from '../lib/firestore.js';
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
import { toggleGroup, patchToggleGroup } from '../ui/toggle-group.js';

const LANG_KEY = 'gymi.iosLang';
const DAY_MS = 24 * 60 * 60 * 1000;

const SOON = [
  { icon: 'calendar-days', title: 'יומן גוגל', text: 'משימות עם שעה נכנסות ליומן' },
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
  render();
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
  renderStatus();
  renderSilent();
}

export function unmountConnections() {
  container = null;
  lastImport = null;
  mcpKeys = null;
  newUrl = null;
  stepsKey = null;
  newKey = '';
  installing = false;
}

function render() {
  container.innerHTML = `
    <p class="text-muted connections-intro">מקורות שמעדכנים את ג׳ימי לבד, בלי רישום ידני.</p>
    ${stepsCard()}
    <section class="card connection-main" aria-labelledby="conn-claude-title" data-claude></section>
    <h2 class="connections-soon-title">בקרוב</h2>
    <div class="connections-soon">
      ${SOON.map((s) => `
        <div class="connection-card connection-card--soon">
          <span class="connection-icon">${icon(s.icon)}</span>
          <span class="connection-text"><b>${s.title}</b><span class="text-muted">${s.text}</span></span>
          <span class="connection-badge">בקרוב</span>
        </div>`).join('')}
    </div>`;

  const group = container.querySelector('[data-lang-group]');
  group.classList.add('toggle-group--live', 'ios-lang-switch');
  requestAnimationFrame(() => patchToggleGroup(group, lang));
  group.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ioslang]');
    if (!btn || btn.dataset.ioslang === lang) return;
    lang = btn.dataset.ioslang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch { /* the choice just won't be remembered */ }
    patchToggleGroup(group, lang);
    container.querySelector('[data-howto]').innerHTML = howTo();
    container.querySelector('[data-build]').innerHTML = buildSteps();
    renderSilent();
  });
  container.addEventListener('click', onCopy);
  container.addEventListener('click', onKeyAction);
  container.addEventListener('click', onClaudeClick);
  renderStatus();
  renderSilent();
  renderClaude();
}

function stepsCard() {
  const url = STEPS_IMPORT.shortcutUrl;
  const action = url
    ? `<a class="btn btn-primary btn-block" href="${esc(url)}" target="_blank" rel="noopener">${icon('download', { className: 'icon--sm' })} הוספת הקיצור</a>`
    : `<button type="button" class="btn btn-primary btn-block" disabled>${icon('download', { className: 'icon--sm' })} הוספת הקיצור</button>
       <p class="text-muted connection-note">הקישור לקיצור יתווסף בקרוב.</p>`;
  return `
    <section class="card connection-main" aria-labelledby="conn-steps-title">
      <div class="connection-head">
        <span class="connection-icon">${icon('smartphone')}</span>
        <span class="connection-text">
          <b id="conn-steps-title">צעדים מהאייפון</b>
          <span class="connection-status" data-status></span>
        </span>
      </div>
      <p class="connection-hint" data-stale hidden></p>
      <p class="text-muted connection-desc">קיצור באייפון קורא את הצעדים של היום מאפליקציית הבריאות ושולח אותם לג׳ימי. הרגל הצעדים והשריפה היומית מתעדכנים לבד.</p>
      ${toggleGroup({
        name: 'ioslang',
        active: lang,
        label: 'שפת האייפון',
        groupAttrs: 'data-lang-group',
        options: [
          { value: 'he', label: 'האייפון שלי בעברית' },
          { value: 'en', label: '<span dir="ltr">My iPhone is in English</span>' },
        ],
      })}
      <div class="connection-silent" data-silent></div>
      ${STEPS_IMPORT.silentShortcutUrl ? '<div data-build hidden></div>' : `
      <p class="text-muted connection-note connection-or">או בדרך הפשוטה, שפותחת את Safari לרגע:</p>
      ${action}
      <details class="connection-build"${STEPS_IMPORT.shortcutUrl ? '' : ' open'}>
        <summary>${icon('pencil', { className: 'icon--sm' })} בניית הקיצור, צעד אחר צעד</summary>
        <div data-build>${buildSteps()}</div>
      </details>`}
      <div data-howto>${howTo()}</div>
    </section>`;
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
    `${find('roundNumber')} למה: לפעמים הבריאות מחזירה מספר עם נקודה עשרונית, וג׳ימי מקבל רק מספר שלם. לא משנים בה כלום: היא לוקחת לבד את הערך משלב 3. ממשיכים לשלב הבא.`,
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

function renderStatus() {
  const el = container?.querySelector('[data-status]');
  if (!el) return;
  const staleEl = container.querySelector('[data-stale]');
  if (!loaded) {
    el.innerHTML = '<span class="text-muted">בודק…</span>';
    return;
  }
  if (!lastImport) {
    el.innerHTML = '<span class="status-dot"></span>לא מחובר';
    staleEl.hidden = true;
    return;
  }
  const day = israelDateKey(lastImport);
  const when = day === israelDateKey() ? 'היום'
    : day === israelDateKey(new Date(Date.now() - DAY_MS)) ? 'אתמול'
      : formatDayMonthHe(lastImport);
  el.innerHTML = `<span class="status-dot status-dot--on"></span>מחובר · עודכן ${when} ב-${formatTimeHe(lastImport)}`;
  const n = STEPS_IMPORT.staleAfterDays;
  staleEl.hidden = Date.now() - lastImport.getTime() < n * DAY_MS;
  staleEl.textContent = `לא הגיעו צעדים כבר ${n === 2 ? 'יומיים' : `${n} ימים`}. כדאי לבדוק שהאוטומציה פעילה, או להריץ את הקיצור ידנית.`;
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
    <p class="text-muted connection-note">הקיצור שולח את הצעדים ישירות לג׳ימי: שום דבר לא נפתח, וזה עובד גם כשהטלפון נעול.</p>`;
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
    ['copy', `שם: ${chip('ג׳ימי')}. בשדה הכתובת מדביקים את מה שהעתקת ולוחצים ${chip('Add')}.`],
    ['check', `בשיחה חדשה מפעילים את ג׳ימי (${chip('+')} ← ${chip('Connectors')}) ושואלים "מה מצבי היום?"`],
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
      <b>כתובת החיבור שלך.</b> היא מוצגת עכשיו בלבד. מי שמחזיק בה יכול לקרוא ולרשום בג׳ימי שלך, אז לא משתפים אותה.
      <span class="connection-code connection-code--wrap mcp-url" dir="ltr">${esc(newUrl)}</span>
    </div>
    <button type="button" class="btn btn-primary btn-block" data-mcp-copy>${icon('copy', { className: 'icon--sm' })} העתקת הכתובת</button>
    ${claudeSteps()}
    <button type="button" class="btn btn-secondary btn-block" data-mcp-done>${icon('check', { className: 'icon--sm' })} הדבקתי, אפשר להסתיר</button>` : '';
  el.innerHTML = `
    <div class="connection-head">
      <span class="connection-icon">${icon('sparkles')}</span>
      <span class="connection-text">
        <b id="conn-claude-title">קלוד</b>
        <span class="connection-status">${claudeStatus()}</span>
      </span>
    </div>
    <p class="text-muted connection-desc">הקלוד שלך קורא את הנתונים שלך בג׳ימי, ורושם בשבילך ארוחות, שקילה, שינה, צעדים וסימון הרגלים. הוא רואה רק את החשבון שלך ולא מוחק כלום.</p>
    ${fresh}
    ${mcpKeys?.length ? `<ul class="mcp-keys">${mcpKeys.map(keyRow).join('')}</ul>` : ''}
    ${newUrl ? '' : createBtn}
    ${mcpKeys !== null && first && !newUrl ? '<p class="text-muted connection-note">לוחצים, מעתיקים את הכתובת ומדביקים אותה ב-Claude. דקה אחת.</p>' : ''}`;
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
    message: `קלוד שמחובר עם <span dir="ltr">${esc(k.preview)}…</span> יפסיק לגשת לג׳ימי תוך דקה. הנתונים שלך נשארים כמו שהם.`,
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
