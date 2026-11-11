// "רשתות מהאייפון" on חיבורים (M3e): two shortcuts, run by the "app
// opened" / "app closed" automations, post to /api/usage, and the minutes
// in between fill the Instagram part of the limit habit. Loads and saves
// on its own; js/pages/connections.js only gives it a place and the
// phone's language.

import { listApiKeys, addApiKey, deleteApiKey, listHabits, getAppUsage } from '../lib/firestore.js';
import { makeSecret, formatKey, hashSecret } from '../lib/api-key.js';
import { findUsageHabit } from '../lib/app-usage.js';
import { israelDateKey } from '../lib/steps-import.js';
import { USAGE } from '../lib/rules.js';
import { IOS_LABELS, IOS_SEARCH } from '../lib/ios-labels.js';
import { currentUid } from '../auth.js';
import { useCloud } from '../firebase-config.js';
import { formatDayMonthHe, formatTimeHe, toDate } from '../lib/format.js';
import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { showToast } from './toast.js';

const APP = 'instagram';
const SCOPE = 'usage';

const chip = (text) => `<b class="ios-label" dir="auto">${esc(text)}</b>`;
const code = (text) => `<span class="connection-code" dir="ltr">${esc(text)}</span>`;
const list = (steps) => `
  <ol class="connection-steps connection-steps--build">
    ${steps.map((text, i) => `<li><span class="connection-step-num">${i + 1}</span><span>${text}</span></li>`).join('')}
  </ol>`;

// host: an element on the page; getLang: () => 'he' | 'en'.
export function mountUsageCard(host, getLang) {
  let loaded = false;
  let key = null; // the usage key doc, or null
  let newKey = ''; // shown once, until the page is left
  let today = null; // { minutes, opens } or null
  let target = null; // { habit, part } or null
  const urls = USAGE.shortcuts[APP];
  const names = USAGE.shortcutNames[APP];
  const oneTap = !!(urls.open && urls.close);

  function statusLine() {
    if (!loaded) return '<span class="text-muted">בודק…</span>';
    if (today && (today.opens || today.minutes)) {
      return `<span class="status-dot status-dot--on"></span>היום: ${today.text}`;
    }
    if (key?.lastUsedAt) {
      const at = toDate(key.lastUsedAt);
      return `<span class="status-dot status-dot--on"></span>מחובר · עודכן ${formatDayMonthHe(at)} ב-${formatTimeHe(at)}`;
    }
    return key ? '<span class="status-dot"></span>מחכה לפתיחה הראשונה' : '<span class="status-dot"></span>לא מחובר';
  }

  function habitLine() {
    if (!loaded) return '';
    if (!target) {
      return `<p class="connection-hint">אין הרגל של אינסטגרם עם מגבלת דקות, אז הדקות רק נשמרות. כדאי להוסיף הרגל "אינסטגרם" (הרגל להפחית ← מגבלה).</p>`;
    }
    const where = target.part && target.habit.parts.length > 1 ? `לשדה "${esc(target.part)}" בהרגל "${esc(target.habit.name)}"` : `להרגל "${esc(target.habit.name)}"`;
    return `<p class="text-muted connection-note">${icon('check', { className: 'icon--sm' })} הדקות נכנסות לבד ${where}${target.habit.parts.length > 1 ? '. את השאר ממשיכים למלא כרגיל' : ''}.</p>`;
  }

  function automation(L) {
    const steps = [
      `ב${chip(L.shortcutsApp)} עוברים ללשונית ${chip(L.automationTab)} ולוחצים ${chip('+')} (או ${chip(L.newAutomation)}).`,
      `בוחרים ${chip(L.appTrigger)}. ליד ${chip(L.appTrigger)} לוחצים ${chip(L.choose)}, מסמנים את Instagram ולוחצים ${chip(L.done)}.`,
      `משאירים מסומן רק את ${chip(L.isOpened)}, בוחרים ${chip(L.runImmediately)} ולוחצים ${chip(L.next)}.`,
      `בוחרים את הקיצור ${chip(names.open)}.`,
      `עוד אוטומציה, בדיוק אותו דבר, אבל עם ${chip(L.isClosed)} ועם הקיצור ${chip(names.close)}.`,
      `גם פייסבוק? משכפלים את שני הקיצורים, ובעותקים משנים ${code('instagram')} ל־${code('facebook')}. ואז שתי אוטומציות כאלה עם Facebook. הדקות נכנסות לשדה "פייסבוק" בהרגל.`,
    ];
    return `<p class="connection-note">ואז שתי אוטומציות, פעם אחת:</p>${list(steps)}`;
  }

  function keyBox() {
    return `
      <div class="connection-key-box">
        <p class="connection-key-warn">${icon('triangle-alert', { className: 'icon--sm' })} המפתח מוצג רק עכשיו. לא משתפים אותו עם אף אחד.</p>
        <span class="connection-code connection-code--wrap" dir="ltr">${esc(newKey)}</span>
        <button type="button" class="btn btn-secondary connection-copy" data-usage-copy="key">${icon('copy', { className: 'icon--sm' })} העתקת המפתח</button>
      </div>`;
  }

  // Until the shared shortcuts exist: build them by hand, from the steps
  // shortcut (its "קבלת תוכן של URL" part).
  function buildByHand(L) {
    const S = IOS_SEARCH[getLang()];
    const steps = [
      `ב${chip(L.shortcutsApp)} לוחצים ${chip('+')}, וקוראים לקיצור ${chip(names.open)}.`,
      `בשורת החיפוש מקלידים ${chip(S.getContents)} ומוסיפים את ${chip(L.getContents)}. בכתובת מדביקים: <button type="button" class="btn btn-secondary connection-copy" data-usage-copy="api">${icon('copy', { className: 'icon--sm' })} העתקת הכתובת</button>`,
      `פותחים בחץ הקטן: ${chip(L.method)} ${chip(L.post)}. ב${chip(L.headers)} מוסיפים ${code('Authorization')} ובערך מדביקים את המפתח (למעלה).`,
      `${chip(L.requestBody)} ${chip(L.json)}: שני שדות ${chip(L.textField)}: ${code('app')} = ${code('instagram')}, ו־${code('event')} = ${code('open')}.`,
      `משכפלים את הקיצור, קוראים לעותק ${chip(names.close)} ומשנים בו רק את ${code('open')} ל־${code('close')}.`,
    ];
    return list(steps);
  }

  function body() {
    const L = IOS_LABELS[getLang()];
    if (!loaded) return '';
    if (oneTap) {
      if (newKey) {
        return `
          <p class="connection-key-status"><span class="status-dot status-dot--on"></span>המפתח האישי הועתק</p>
          <a class="btn btn-primary btn-block" href="${esc(urls.open)}" target="_blank" rel="noopener">${icon('download', { className: 'icon--sm' })} 1. קיצור הפתיחה</a>
          <a class="btn btn-primary btn-block" href="${esc(urls.close)}" target="_blank" rel="noopener">${icon('download', { className: 'icon--sm' })} 2. קיצור הסגירה</a>
          <p class="text-muted connection-note">בכל אחד לוחצים ${chip(L.addShortcut)}, וכשהאייפון שואל על המפתח, לוחצים בשדה ← ${chip(L.paste)}.</p>
          ${automation(L)}
          <details class="connection-build"><summary>${icon('copy', { className: 'icon--sm' })} ההדבקה לא עבדה?</summary>${keyBox()}</details>`;
      }
      return `
        <button type="button" class="btn ${key ? 'btn-outline' : 'btn-primary'} btn-block" data-usage-install>${icon('download', { className: 'icon--sm' })} ${key ? 'התקנה מחדש (טלפון חדש)' : 'התקנת הקיצורים'}</button>
        <p class="text-muted connection-note">${key ? 'התקנה מחדש יוצרת מפתח חדש, והקיצורים הישנים מפסיקים לשלוח.' : 'לוחצים, ומפתח אישי מועתק לבד. אחר כך מוסיפים שני קיצורים קטנים ומדביקים.'}</p>`;
    }
    if (newKey) return `${keyBox()}${buildByHand(L)}${automation(L)}`;
    return `
      <button type="button" class="btn ${key ? 'btn-outline' : 'btn-primary'} btn-block" data-usage-install>${icon('plug', { className: 'icon--sm' })} ${key ? 'מפתח חדש (הישן מפסיק לעבוד)' : 'יצירת מפתח אישי'}</button>`;
  }

  function render() {
    host.innerHTML = `
      <section class="card connection-main" aria-labelledby="conn-usage-title">
        <div class="connection-head">
          <span class="connection-icon">${icon('smartphone')}</span>
          <span class="connection-text">
            <b id="conn-usage-title">רשתות מהאייפון</b>
            <span class="connection-status">${statusLine()}</span>
          </span>
        </div>
        <p class="text-muted connection-desc">האייפון לא נותן לאף אפליקציה לקרוא את זמן המסך. במקום זה, האייפון מודיע לג׳ימי כשאינסטגרם (או פייסבוק) נפתח וכשהוא נסגר, וג׳ימי סופר את הדקות.</p>
        ${habitLine()}
        <div class="connection-silent">${body()}</div>
      </section>`;
  }

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
      await addApiKey(hash, { label: 'קיצורי רשתות', scopes: [SCOPE] });
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

  host.addEventListener('click', async (e) => {
    if (e.target.closest('[data-usage-install]')) return install();
    const btn = e.target.closest('[data-usage-copy]');
    if (!btn) return;
    const text = btn.dataset.usageCopy === 'api' ? `${location.origin}/api/usage` : newKey;
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${icon('check', { className: 'icon--sm' })} הועתק`);
    } catch {
      showToast('לא הצלחתי להעתיק, אפשר לסמן ולהעתיק ידנית');
    }
  });

  render();
  Promise.all([
    listApiKeys().catch(() => []),
    listHabits().catch(() => []),
    getAppUsage(israelDateKey()).catch(() => null),
  ]).then(([keys, habits, usage]) => {
    key = keys.find((k) => (k.scopes || []).includes(SCOPE)) || null;
    target = findUsageHabit(habits, APP);
    const apps = Object.entries(usage?.apps || {}).filter(([app]) => USAGE.apps[app]);
    today = apps.length ? {
      minutes: apps.reduce((n, [, d]) => n + (Number(d.minutes) || 0), 0),
      opens: apps.reduce((n, [, d]) => n + (Number(d.opens) || 0), 0),
      text: apps.map(([app, d]) => `${USAGE.apps[app].name} ${Number(d.minutes) || 0} דק׳`).join(' · '),
    } : null;
    loaded = true;
    if (host.isConnected) render();
  });

  return { render };
}
