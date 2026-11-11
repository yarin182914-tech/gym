// "זמן באפליקציות" on חיבורים (M3e): one shared shortcut, run by an "app
// opened" and an "app closed" automation per app, posts to /api/usage, and
// the minutes in between fill that app's part of a limit habit. Each user
// picks the apps (users/{uid}.usageApps): ready-made ones or any name.
// Loads and saves on its own; js/pages/connections.js only gives it a
// place and the phone's language.

import { listApiKeys, addApiKey, deleteApiKey, listHabits, getAppUsage, getUserSettings, updateUserSettings } from '../lib/firestore.js';
import { makeSecret, formatKey, hashSecret } from '../lib/api-key.js';
import { appMeta, chosenApps, findUsageHabit } from '../lib/app-usage.js';
import { israelDateKey } from '../lib/steps-import.js';
import { USAGE } from '../lib/rules.js';
import { IOS_LABELS, IOS_SEARCH } from '../lib/ios-labels.js';
import { currentUid } from '../auth.js';
import { useCloud } from '../firebase-config.js';
import { formatDayMonthHe, formatTimeHe, toDate } from '../lib/format.js';
import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { showToast } from './toast.js';

const SCOPE = 'usage';
const OPEN_WORD = 'נפתח';
const CLOSE_WORD = 'נסגר';

const chip = (text) => `<b class="ios-label" dir="auto">${esc(text)}</b>`;
const code = (text, dir = 'ltr') => `<span class="connection-code" dir="${dir}">${esc(text)}</span>`;
const list = (steps) => `
  <ol class="connection-steps connection-steps--build">
    ${steps.map((text, i) => `<li><span class="connection-step-num">${i + 1}</span><span>${text}</span></li>`).join('')}
  </ol>`;
const copyBtn = (what, label) =>
  `<button type="button" class="btn btn-secondary connection-copy" data-usage-copy="${esc(what)}">${icon('copy', { className: 'icon--sm' })} ${esc(label)}</button>`;

// host: an element on the page; getLang: () => 'he' | 'en'.
export function mountUsageCard(host, getLang) {
  let loaded = false;
  let key = null; // the usage key doc, or null
  let newKey = ''; // shown once, until the page is left
  let today = []; // [{ name, minutes, opens }]
  let habits = [];
  let apps = []; // the user's chosen apps, metas from appMeta
  let adding = false; // the "other app" field is open
  const url = USAGE.shortcut.url;
  const shortcutName = USAGE.shortcut.name;

  function statusLine() {
    if (!loaded) return '<span class="text-muted">בודק…</span>';
    if (today.length) {
      return `<span class="status-dot status-dot--on"></span>היום: ${esc(today.map((a) => `${a.name} ${a.minutes} דק׳`).join(' · '))}`;
    }
    if (key?.lastUsedAt) {
      const at = toDate(key.lastUsedAt);
      return `<span class="status-dot status-dot--on"></span>מחובר · עודכן ${formatDayMonthHe(at)} ב-${formatTimeHe(at)}`;
    }
    return key ? '<span class="status-dot"></span>מחכה לפתיחה הראשונה' : '<span class="status-dot"></span>לא מחובר';
  }

  // ---- 1. the shared shortcut (once) ----

  function keyBox() {
    return `
      <div class="connection-key-box">
        <p class="connection-key-warn">${icon('triangle-alert', { className: 'icon--sm' })} המפתח מוצג רק עכשיו. לא משתפים אותו עם אף אחד.</p>
        <span class="connection-code connection-code--wrap" dir="ltr">${esc(newKey)}</span>
        ${copyBtn('key', 'העתקת המפתח')}
      </div>`;
  }

  // Until the shared shortcut has an iCloud link: build it by hand.
  function buildByHand(L) {
    const S = IOS_SEARCH[getLang()];
    return list([
      `ב${chip(L.shortcutsApp)} לוחצים ${chip('+')}, וקוראים לקיצור ${chip(shortcutName)}.`,
      `בחיפוש מקלידים ${chip(S.url)}, מוסיפים את ${chip(L.url)}, ומדביקים בו את הכתובת: ${copyBtn('api', 'העתקת הכתובת')}`,
      `בחיפוש מקלידים ${chip(S.getContents)} ומוסיפים את ${chip(L.getContents)}.`,
      `פותחים בחץ הקטן: ${chip(L.method)} ${chip(L.post)}. ב${chip(L.headers)} מוסיפים ${code('Authorization')}, ובערך מדביקים את המפתח (למעלה).`,
      `${chip(L.requestBody)} ${chip(L.json)}, מוסיפים שדה ${chip(L.textField)}: ${code('input')}. בערך לוחצים ובוחרים את המשתנה ${chip(L.shortcutInput)}.`,
    ]);
  }

  function shortcutStep(L) {
    if (newKey && url) {
      return `
        <p class="connection-key-status"><span class="status-dot status-dot--on"></span>המפתח האישי הועתק</p>
        <a class="btn btn-primary btn-block" href="${esc(url)}" target="_blank" rel="noopener">${icon('download', { className: 'icon--sm' })} הוספת הקיצור</a>
        <p class="text-muted connection-note">לוחצים ${chip(L.addShortcut)}, וכשהאייפון שואל על המפתח, לוחצים בשדה ← ${chip(L.paste)}.</p>
        <details class="connection-build"><summary>${icon('copy', { className: 'icon--sm' })} ההדבקה לא עבדה?</summary>${keyBox()}</details>`;
    }
    if (newKey) return `${keyBox()}${buildByHand(L)}`;
    const label = url
      ? (key ? 'התקנה מחדש (טלפון חדש)' : 'התקנת הקיצור')
      : (key ? 'מפתח חדש (הישן מפסיק לעבוד)' : 'יצירת מפתח והוראות');
    const note = key
      ? `הקיצור ${chip(shortcutName)} כבר מותקן? אפשר לדלג לשלב הבא. ${url ? 'התקנה מחדש' : 'מפתח חדש'} מחליף את המפתח, והקיצור הישן מפסיק לשלוח.`
      : (url ? 'לוחצים, ומפתח אישי מועתק לבד. אחר כך מוסיפים את הקיצור ומדביקים.' : 'קיצור אחד לכל האפליקציות, בונים אותו פעם אחת.');
    return `
      <button type="button" class="btn ${key ? 'btn-outline' : 'btn-primary'} btn-block" data-usage-install>${icon(url ? 'download' : 'plug', { className: 'icon--sm' })} ${label}</button>
      <p class="text-muted connection-note">${note}</p>`;
  }

  // ---- 2. which apps ----

  function appsStep() {
    const builtIns = Object.entries(USAGE.apps).map(([id, a]) => ({ id, name: a.name }));
    const custom = apps.filter((a) => !a.builtIn);
    const pill = (a) => {
      const on = apps.some((x) => x.id === a.id);
      return `<button type="button" class="pill${on ? ' active' : ''}" data-usage-app="${esc(a.id)}" data-name="${esc(a.name)}" aria-pressed="${on}">${esc(a.name)}</button>`;
    };
    const full = apps.length >= USAGE.maxApps;
    return `
      <div class="pill-row usage-apps">
        ${builtIns.map(pill).join('')}
        ${custom.map(pill).join('')}
        ${adding || full ? '' : `<button type="button" class="pill" data-usage-other>${icon('plus', { className: 'icon--sm' })} אחרת</button>`}
      </div>
      ${adding ? `
        <form class="usage-other" data-usage-other-form>
          <input type="text" class="search-bar" dir="auto" name="name" maxlength="${USAGE.maxNameLength}" placeholder="שם האפליקציה, למשל Strava" aria-label="שם האפליקציה" required>
          <button type="submit" class="btn btn-primary">הוספה</button>
        </form>` : ''}
      ${full ? `<p class="text-muted connection-note">אפשר עד ${USAGE.maxApps} אפליקציות.</p>` : ''}`;
  }

  // ---- 3. two automations per app ----

  function habitNote(app) {
    const t = findUsageHabit(habits, app);
    if (!t) return `<p class="connection-hint">אין הרגל "${esc(app.name)}" עם מגבלת דקות, אז הדקות רק נשמרות. אפשר להוסיף הרגל להפחית ← מגבלה, בשם "${esc(app.name)}" או עם שדה בשם הזה.</p>`;
    const where = t.part && t.habit.parts.length > 1 ? `לשדה "${esc(t.part)}" בהרגל "${esc(t.habit.name)}"` : `להרגל "${esc(t.habit.name)}"`;
    return `<p class="text-muted connection-note">${icon('check', { className: 'icon--sm' })} הדקות נכנסות לבד ${where}.</p>`;
  }

  function automationSteps(L, app) {
    const S = IOS_SEARCH[getLang()];
    const ios = USAGE.apps[app.id]?.ios || app.name;
    const openText = `${app.name} ${OPEN_WORD}`;
    const closeText = `${app.name} ${CLOSE_WORD}`;
    return list([
      `ב${chip(L.shortcutsApp)} עוברים ל${chip(L.automationTab)} ולוחצים ${chip('+')} (או ${chip(L.newAutomation)}).`,
      `בוחרים ${chip(L.appTrigger)}, ליד ${chip(L.appTrigger)} לוחצים ${chip(L.choose)}, מסמנים את ${chip(ios)} ולוחצים ${chip(L.done)}.`,
      `משאירים מסומן רק את ${chip(L.isOpened)}, בוחרים ${chip(L.runImmediately)} ולוחצים ${chip(L.next)} ← ${chip(L.blankAutomation)}.`,
      `בחיפוש מקלידים ${chip(S.text)}, מוסיפים את ${chip(L.text)} וכותבים בו בדיוק: ${code(openText, 'auto')} ${copyBtn(`text:${openText}`, 'העתקה')}`,
      `בחיפוש מקלידים ${chip(S.runShortcut)}, מוסיפים את ${chip(L.runShortcut)} ובוחרים בו את ${chip(shortcutName)}. אם יש בו שדה קלט, בוחרים בו את ${chip(L.text)}. לוחצים ${chip(L.done)}.`,
      `עוד אוטומציה בדיוק כזאת, אבל עם ${chip(L.isClosed)} ובטקסט: ${code(closeText, 'auto')} ${copyBtn(`text:${closeText}`, 'העתקה')}`,
    ]);
  }

  function automationsStep(L) {
    if (!apps.length) return '<p class="text-muted connection-note">בוחרים למעלה לפחות אפליקציה אחת.</p>';
    return apps.map((app, i) => `
      <details class="connection-build"${apps.length === 1 || i === apps.length - 1 && app.justAdded ? ' open' : ''}>
        <summary>${icon('smartphone', { className: 'icon--sm' })} ${esc(app.name)}: שתי אוטומציות</summary>
        ${habitNote(app)}
        ${automationSteps(L, app)}
      </details>`).join('');
  }

  function body() {
    if (!loaded) return '';
    const L = IOS_LABELS[getLang()];
    return `
      <h3 class="usage-step-title">1. הקיצור, פעם אחת</h3>
      ${shortcutStep(L)}
      <h3 class="usage-step-title">2. מה למדוד?</h3>
      ${appsStep()}
      <h3 class="usage-step-title">3. לכל אפליקציה, שתי אוטומציות</h3>
      ${automationsStep(L)}`;
  }

  function render() {
    host.innerHTML = `
      <section class="card connection-main" aria-labelledby="conn-usage-title">
        <div class="connection-head">
          <span class="connection-icon">${icon('smartphone')}</span>
          <span class="connection-text">
            <b id="conn-usage-title">זמן באפליקציות</b>
            <span class="connection-status">${statusLine()}</span>
          </span>
        </div>
        <p class="text-muted connection-desc">האייפון לא נותן לאף אפליקציה לקרוא את זמן המסך. במקום זה, האייפון מודיע לג׳ימי כשאפליקציה נפתחת וכשהיא נסגרת, וג׳ימי סופר את הדקות. אינסטגרם, טיקטוק, או כל אפליקציה אחרת.</p>
        <div class="connection-silent">${body()}</div>
      </section>`;
    if (adding) host.querySelector('[data-usage-other-form] input')?.focus();
  }

  // ---- actions ----

  // Starts in the tap itself, so Safari lets the page write the clipboard.
  function install() {
    const made = createKey();
    const blob = made.then((k) => new Blob([k || ''], { type: 'text/plain' }));
    const copied = window.ClipboardItem && navigator.clipboard?.write
      ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
      : made.then((k) => k && navigator.clipboard.writeText(k));
    made.then((k) => {
      if (!k) return;
      render();
      copied.then(() => showToast(`${icon('check', { className: 'icon--sm' })} המפתח הועתק`))
        .catch(() => showToast('לא הצלחתי להעתיק, אפשר להעתיק ידנית'));
    });
  }

  async function createKey() {
    const uid = currentUid() || (useCloud ? null : 'devSandboxUser');
    if (!uid) return '';
    const old = key?.id;
    const secret = makeSecret();
    const hash = await hashSecret(secret);
    try {
      await addApiKey(hash, { label: 'זמן באפליקציות', scopes: [SCOPE] });
    } catch (err) {
      console.error('[usage-card] key save failed', err);
      showToast('לא הצלחתי לשמור את המפתח, נסה שוב');
      return '';
    }
    if (old) deleteApiKey(old).catch((err) => console.error('[usage-card] revoke failed', err));
    key = { id: hash, scopes: [SCOPE], lastUsedAt: null };
    newKey = formatKey(uid, secret);
    return newKey;
  }

  async function saveApps(next) {
    const before = apps;
    apps = next;
    render();
    try {
      await updateUserSettings({ usageApps: next.map((a) => a.name) });
    } catch (err) {
      console.error('[usage-card] save apps failed', err);
      apps = before;
      render();
      showToast('לא הצלחתי לשמור, נסה שוב');
    }
  }

  function toggleApp(id, name) {
    if (apps.some((a) => a.id === id)) return saveApps(apps.filter((a) => a.id !== id));
    if (apps.length >= USAGE.maxApps) return showToast(`אפשר עד ${USAGE.maxApps} אפליקציות`);
    const meta = appMeta(name);
    if (meta) saveApps([...apps.map(({ justAdded, ...a }) => a), { ...meta, justAdded: true }]);
  }

  host.addEventListener('click', async (e) => {
    if (e.target.closest('[data-usage-install]')) return install();
    const appBtn = e.target.closest('[data-usage-app]');
    if (appBtn) return toggleApp(appBtn.dataset.usageApp, appBtn.dataset.name);
    if (e.target.closest('[data-usage-other]')) {
      adding = true;
      return render();
    }
    const btn = e.target.closest('[data-usage-copy]');
    if (!btn) return;
    const what = btn.dataset.usageCopy;
    const text = what === 'api' ? `${location.origin}/api/usage` : what === 'key' ? newKey : what.slice('text:'.length);
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${icon('check', { className: 'icon--sm' })} הועתק`);
    } catch {
      showToast('לא הצלחתי להעתיק, אפשר לסמן ולהעתיק ידנית');
    }
  });

  host.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-usage-other-form]');
    if (!form) return;
    e.preventDefault();
    const meta = appMeta(form.elements.name.value);
    if (!meta) return showToast('צריך שם קצר לאפליקציה');
    adding = false;
    if (apps.some((a) => a.id === meta.id)) return render();
    toggleApp(meta.id, meta.name);
  });

  render();
  const day = israelDateKey();
  Promise.all([
    listApiKeys().catch(() => []),
    listHabits().catch(() => []),
    getAppUsage(day).catch(() => null),
    getUserSettings().catch(() => ({})),
  ]).then(([keys, rawHabits, usage, settings]) => {
    key = keys.find((k) => (k.scopes || []).includes(SCOPE)) || null;
    habits = rawHabits;
    today = Object.entries(usage?.apps || {}).map(([id, d]) => ({
      id,
      name: d.name || USAGE.apps[id]?.name || id,
      minutes: Number(d.minutes) || 0,
      opens: Number(d.opens) || 0,
    })).filter((a) => a.minutes || a.opens);
    // Not chosen yet: start from the apps already sending.
    apps = Array.isArray(settings?.usageApps) ? chosenApps(settings.usageApps) : chosenApps(today.map((a) => a.name));
    loaded = true;
    if (host.isConnected) render();
  });

  return { render };
}
