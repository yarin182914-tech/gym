// "חיבורים" — one card per outside source feeding the app: its status, a
// one-tap action and short steps. Opened from the profile sheet. M3c
// builds the page and its first card (steps from the iPhone); later
// milestones replace their grey "בקרוב" card with a real one.
//
// How-tos name the iPhone's own buttons, so each has a switch for the
// phone's language (labels in js/lib/ios-labels.js); the rest stays Hebrew.

import { listDailyActivity } from '../lib/firestore.js';
import { STEPS_IMPORT } from '../lib/rules.js';
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
  { icon: 'sparkles', title: 'קלוד', text: 'המאמן האישי קורא ורושם בשבילך' },
  { icon: 'cloud', title: 'אחסון בענן', text: 'גיבוי התכנית לדרייב, דרך קלוד' },
  { icon: 'watch', title: 'Garmin', text: 'אימונים, שינה ודופק מהשעון' },
];

let container = null;
let lang = 'he';
let lastImport = null; // Date of the newest shortcut import, or null
let loaded = false;

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
  render();
  const acts = await listDailyActivity(STEPS_IMPORT.statusDays).catch((err) => {
    console.error('[connections] activity load failed', err);
    return [];
  });
  if (isStale(token)) return;
  const times = acts.filter((a) => a.source === 'shortcut' && a.loggedAt).map((a) => toDate(a.loggedAt).getTime());
  lastImport = times.length ? new Date(Math.max(...times)) : null;
  loaded = true;
  renderStatus();
}

export function unmountConnections() {
  container = null;
  lastImport = null;
}

function render() {
  container.innerHTML = `
    <p class="text-muted connections-intro">מקורות שמעדכנים את ג׳ימי לבד, בלי רישום ידני.</p>
    ${stepsCard()}
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
  });
  container.addEventListener('click', onCopy);
  renderStatus();
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
      ${action}
      <details class="connection-build"${STEPS_IMPORT.shortcutUrl ? '' : ' open'}>
        <summary>${icon('pencil', { className: 'icon--sm' })} בניית הקיצור, צעד אחר צעד</summary>
        <div data-build>${buildSteps()}</div>
      </details>
      <div data-howto>${howTo()}</div>
    </section>`;
}

// The iPhone's own label, shown as it appears on the phone.
const chip = (text) => `<b class="ios-label" dir="auto">${esc(text)}</b>`;

// The address the shortcut opens, up to where the steps number goes.
const importBase = () => `${location.origin}/#/import?steps=`;

async function onCopy(e) {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const text = btn.dataset.copy === 'base' ? importBase() : '&date=';
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
        <li>מעל המקלדת לוחצים על המשתנה של המספר המעוגל.</li>
        <li>מדביקים <span class="connection-code" dir="ltr">&amp;date=</span> ${copyBtn('date', 'העתקה')}</li>
        <li>לוחצים על המשתנה של התאריך המעוצב.</li>
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
    <p class="connection-note">${STEPS_IMPORT.shortcutUrl ? `אחרי הלחיצה, באייפון לוחצים ${chip(L.addShortcut)}. ואז` : 'כשהקיצור מוכן,'} אוטומציה יומית:</p>
    <ol class="connection-steps">
      ${steps.map(([name, text], i) => `<li><span class="connection-step-num">${i + 1}</span>${icon(name, { className: 'icon--sm' })}<span>${text}</span></li>`).join('')}
    </ol>
    <ul class="connection-notes text-muted">
      <li>האוטומציה פותחת את Safari לרגע ושומרת. בפעם הראשונה צריך להתחבר עם גוגל גם ב-Safari.</li>
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
