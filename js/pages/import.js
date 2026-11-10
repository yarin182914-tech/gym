// #/import?steps=N[&date=yyyy-mm-dd] — opened by the iOS Shortcut that
// reads today's steps from Apple Health (set up on "חיבורים"). Saves them
// to dailyActivity/{date} and goes on to "היום", where the steps habit and
// the day's burn pick them up. No screen of its own beyond a moment's
// "saving" card; bad input → a toast and nothing written.
//
// A request that arrives before sign-in waits in localStorage (stashed at
// boot by js/app.js) and runs right after it.

import { beginMount, isStale } from '../core/page.js';
import { getDailyActivity, mergeDailyActivity } from '../lib/firestore.js';
import { parseImport, mergeSteps, israelDateKey } from '../lib/steps-import.js';
import { routeParams } from '../lib/router.js';
import { formatDayMonthHe, parseDateInputValue } from '../lib/format.js';
import { showToast } from '../ui/toast.js';
import { icon } from '../ui/icon.js';

const PENDING_KEY = 'gymi.pendingStepsImport';
// The write lands in Firestore's persistent local cache at once and syncs
// by itself; past this, don't keep the user waiting on the server.
const SERVER_WAIT_MS = 4000;

const ERRORS = {
  steps: 'מספר הצעדים לא תקין, לא נשמר כלום',
  date: 'התאריך מחוץ לטווח, לא נשמר כלום',
};

const fmt = (n) => Number(n).toLocaleString('en-US');

// At boot, before sign-in: keep the request so it survives the sign-in
// screen. The date is pinned now, so a request that waits past midnight
// still lands on the day it was sent for.
export function stashImportFromUrl() {
  if (!/^#\/import(\?|$)/.test(location.hash)) return;
  const params = routeParams();
  if (!params.has('steps')) return;
  if (!params.get('date')) params.set('date', israelDateKey());
  try {
    localStorage.setItem(PENDING_KEY, params.toString());
  } catch { /* private mode — the hash itself still works once signed in */ }
}

export function hasPendingImport() {
  try {
    return Boolean(localStorage.getItem(PENDING_KEY));
  } catch {
    return false;
  }
}

function takePending() {
  try {
    const q = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    return q;
  } catch {
    return null;
  }
}

export function mountImport(rootEl) {
  const token = beginMount();
  const fromHash = routeParams();
  // The stashed copy carries the pinned date; the hash is for a request
  // that arrives while the app is already open.
  const pending = takePending();
  const query = pending ?? (fromHash.has('steps') ? fromHash : null);
  rootEl.innerHTML = `
    <div class="card soon-card" aria-busy="true">
      <span class="soon-icon">${icon('footprints')}</span>
      <h2>שומר את הצעדים…</h2>
    </div>`;
  runImport(query).then((message) => {
    showToast(message);
    if (!isStale(token)) location.replace('#/today');
  });
}

// → the toast's text.
async function runImport(query) {
  const parsed = query ? parseImport(query) : { error: 'steps' };
  if (parsed.error) return ERRORS[parsed.error];
  try {
    const existing = await getDailyActivity(parsed.date);
    const patch = mergeSteps(existing, parsed.steps);
    if (patch) {
      const write = mergeDailyActivity(parsed.date, patch);
      write.catch((err) => console.error('[import] sync failed', err));
      await Promise.race([write, new Promise((r) => setTimeout(r, SERVER_WAIT_MS))]);
    }
    const steps = Math.max(parsed.steps, Number(existing?.steps) || 0);
    if (!steps) return 'לא התקבלו צעדים';
    const day = parsed.date === israelDateKey() ? '' : ` ל-${formatDayMonthHe(parseDateInputValue(parsed.date))}`;
    return `${icon('footprints', { className: 'icon--sm' })} נשמרו ${fmt(steps)} צעדים${day}`;
  } catch (err) {
    console.error('[import] save failed', err);
    return 'שמירת הצעדים נכשלה, נסו שוב';
  }
}
