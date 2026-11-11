// "חיבורים" — one card per outside source feeding the app: its status, a
// one-tap action and short steps. Opened from the profile sheet. M3c
// builds the page and its first card (steps from the iPhone); later
// milestones replace their grey "בקרוב" card with a real one. M11 adds the
// Claude connector card (personal keys, js/lib/mcp-keys.js).
//
// How-tos name the iPhone's own buttons, so each has a switch for the
// phone's language (labels in js/lib/ios-labels.js); the rest stays Hebrew.

import { listDailyActivity, listMcpKeys, createMcpKey, deleteMcpKey } from '../lib/firestore.js';
import { STEPS_IMPORT, MCP } from '../lib/rules.js';
import { generateKey, hashKey, keyPreview, connectorUrl } from '../lib/mcp-keys.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
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
let keys = null; // the user's Claude keys, or null while loading
let newUrl = null; // the connector address of a key made just now — shown once
let busy = false;

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
  keys = null;
  newUrl = null;
  render();
  listMcpKeys().catch((err) => {
    console.error('[connections] keys load failed', err);
    return [];
  }).then((list) => {
    if (isStale(token)) return;
    keys = list;
    renderClaude();
  });
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
  keys = null;
  newUrl = null;
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
  });
  container.addEventListener('click', onCopy);
  container.addEventListener('click', onClaudeClick);
  renderStatus();
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
  if (keys === null) return '<span class="text-muted">בודק…</span>';
  if (!keys.length) return '<span class="status-dot"></span>לא מחובר';
  const used = keys.filter((k) => k.lastUsedAt).map((k) => toDate(k.lastUsedAt).getTime());
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
  const canAdd = keys !== null && keys.length < MCP.maxKeysPerUser && !busy;
  const first = !keys?.length;
  const createBtn = `
    <button type="button" class="btn ${first ? 'btn-primary' : 'btn-secondary'} btn-block" data-mcp-create${canAdd ? '' : ' disabled'}>
      ${icon('plus', { className: 'icon--sm' })} ${busy ? 'יוצר…' : first ? 'צור מפתח' : 'מפתח נוסף'}
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
    ${keys?.length ? `<ul class="mcp-keys">${keys.map(keyRow).join('')}</ul>` : ''}
    ${newUrl ? '' : createBtn}
    ${keys !== null && first && !newUrl ? '<p class="text-muted connection-note">לוחצים, מעתיקים את הכתובת ומדביקים אותה ב-Claude. דקה אחת.</p>' : ''}`;
}

async function onClaudeClick(e) {
  if (e.target.closest('[data-mcp-create]')) {
    createKey();
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
    revokeKey(e.target.closest('[data-revoke]').dataset.revoke);
  }
}

async function createKey() {
  if (busy) return;
  busy = true;
  renderClaude();
  try {
    const key = generateKey();
    const hash = await hashKey(key);
    await createMcpKey(hash, keyPreview(key));
    keys = [...(keys || []), { id: hash, preview: keyPreview(key), createdAt: new Date(), lastUsedAt: null }];
    newUrl = connectorUrl(location.origin, key);
  } catch (err) {
    console.error('[connections] key create failed', err);
    showToast(err.message === 'offline' ? 'צריך חיבור לאינטרנט כדי ליצור מפתח' : 'לא הצלחתי ליצור מפתח, אפשר לנסות שוב');
  } finally {
    busy = false;
    renderClaude();
  }
}

async function revokeKey(hash) {
  const k = keys?.find((x) => x.id === hash);
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
    keys = keys.filter((x) => x.id !== hash);
    newUrl = null;
    showToast('המפתח בוטל');
  } catch (err) {
    console.error('[connections] key revoke failed', err);
    showToast('לא הצלחתי לבטל, אפשר לנסות שוב');
  }
  renderClaude();
}
