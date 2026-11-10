// "ללמוד" (M8b): hand-picked books, podcasts and videos for a healthy life.
// The list itself is code (js/data/library.js); the user's own marks
// (saved / finished) are users/{uid}/libraryMarks, and their own or the
// coach's picks are users/{uid}/libraryPicks. Opened from the profile sheet.
//
// The areas where the user's own data is weakest come first (sleep under
// the minimum, workouts under the weekly goal) — js/lib/library.js.

import {
  getUserSettings, listSleep, listWorkouts, listLibraryMarks, setLibraryMark,
  listLibraryPicks, addLibraryPick, deleteLibraryPick, listHabits, newHabitId, setHabit,
} from '../lib/firestore.js';
import { LIBRARY, LIBRARY_AREAS, LIBRARY_TYPES } from '../data/library.js';
import { areaOrder, sortItems, filterItems, pickToItem } from '../lib/library.js';
import { normalizeHabit } from '../lib/habits.js';
import { dateKey } from '../lib/sleep.js';
import { workoutDayKey } from '../lib/workout-types.js';
import { SLEEP, REWARDS } from '../lib/rules.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { esc } from '../core/dom.js';
import { icon } from '../ui/icon.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { showToast } from '../ui/toast.js';
import { emptyState } from '../ui/empty-state.js';

let container = null;
let items = [];
let marks = {};
let order = [];
let filter = { area: null, type: null, saved: false };

const logFailed = (what) => (err) => console.error(`[library] ${what} failed`, err);

export async function mountLibrary(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען המלצות…');
  const soft = (p, fallback) => p.catch((err) => {
    logFailed('load')(err);
    return fallback;
  });
  const [user, nights, workouts, markList, picks] = await Promise.all([
    soft(getUserSettings(), {}),
    soft(listSleep(14), []),
    soft(listWorkouts(30), []),
    soft(listLibraryMarks(), []),
    soft(listLibraryPicks(), []),
  ]);
  if (isStale(token)) return;
  marks = Object.fromEntries(markList.map((m) => [m.id, m]));
  order = areaOrder({
    nights,
    workoutDays: workouts.map((w) => workoutDayKey(w)),
    today: dateKey(new Date()),
    minHours: user.sleepMinHours ?? SLEEP.defaults.sleepMinHours,
    weeklyGoal: user.weeklyWorkoutGoal ?? REWARDS.weeklyWorkoutGoal,
  });
  items = [...picks.map(pickToItem), ...LIBRARY];
  render();
}

export function unmountLibrary() {
  container = null;
}

function chip(label, active, attr) {
  return `<button type="button" class="pill ${active ? 'active' : ''}" ${attr}>${label}</button>`;
}

function lengthText(it) {
  if (it.pages) return `${it.pages} עמ׳`;
  if (it.minutes) return it.minutes >= 60 ? `${Math.round(it.minutes / 6) / 10} ש׳` : `${it.minutes} דק׳`;
  return '';
}

function tile(area) {
  const a = LIBRARY_AREAS[area] || LIBRARY_AREAS.mind;
  return `<span class="lib-tile lib-tile--${esc(area)}" aria-hidden="true">${icon(a.icon)}</span>`;
}

function cardHtml(it) {
  const m = marks[it.id] || {};
  const meta = [it.author, LIBRARY_TYPES[it.type], lengthText(it)].filter(Boolean).map(esc).join(' · ');
  const badge = it.pick ? `<span class="lib-badge">${it.source === 'user' ? 'ההמלצה שלי' : 'מהמאמן'}</span>` : '';
  return `
    <button type="button" class="card lib-card${m.doneAt ? ' lib-card--done' : ''}" data-item="${esc(it.id)}">
      ${tile(it.area)}
      <span class="lib-card-body">
        <span class="lib-card-title">${esc(it.title)}${badge}</span>
        <span class="lib-card-meta">${meta}</span>
        <span class="lib-card-summary">${esc(it.reason || it.summary || '')}</span>
      </span>
      <span class="lib-card-marks" aria-hidden="true">
        ${m.doneAt ? icon('check', { className: 'icon--sm' }) : m.saved ? icon('bookmark', { className: 'icon--sm' }) : ''}
      </span>
    </button>`;
}

function render() {
  if (!container) return;
  const shown = sortItems(filterItems(items, filter, marks), order, marks);
  const areas = order.filter((a) => LIBRARY_AREAS[a]);
  const done = Object.values(marks).filter((m) => m.doneAt).length;
  container.innerHTML = `
    <div class="lib-page">
      <p class="lib-intro">ספרים, פודקאסטים וסרטונים שנבחרו בשבילך. התחומים שבהם הכי כדאי להשקיע עכשיו מופיעים ראשונים.${done ? ` <span class="lib-done-count">סיימת ${done}</span>` : ''}</p>
      <div class="pill-row lib-filters">
        ${chip('הכל', !filter.area && !filter.saved, 'data-area=""')}
        ${areas.map((a) => chip(LIBRARY_AREAS[a].label, filter.area === a, `data-area="${a}"`)).join('')}
        ${chip(`${icon('bookmark', { className: 'icon--sm' })} שמורים`, filter.saved, 'data-saved')}
      </div>
      <div class="pill-row lib-filters">
        ${chip('כל הסוגים', !filter.type, 'data-type=""')}
        ${Object.entries(LIBRARY_TYPES).filter(([t]) => items.some((it) => it.type === t))
          .map(([t, label]) => chip(label, filter.type === t, `data-type="${t}"`)).join('')}
      </div>
      <button type="button" class="btn btn-dashed btn-block lib-add" data-add>${icon('plus', { className: 'icon--sm' })} הוספת המלצה</button>
      <div class="lib-list">
        ${shown.length ? shown.map(cardHtml).join('') : emptyState(filter.saved ? 'עוד לא שמרת כלום. אפשר לשמור מכל כרטיס.' : 'אין כאן פריטים בסינון הזה.', { centered: true })}
      </div>
    </div>`;

  container.querySelectorAll('[data-area]').forEach((b) => b.addEventListener('click', () => {
    filter = { ...filter, area: b.dataset.area || null, saved: false };
    render();
  }));
  container.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
    filter = { ...filter, type: b.dataset.type || null };
    render();
  }));
  container.querySelector('[data-saved]').addEventListener('click', () => {
    filter = { ...filter, saved: !filter.saved, area: null };
    render();
  });
  container.querySelector('[data-add]').addEventListener('click', openAddSheet);
  container.querySelectorAll('[data-item]').forEach((b) => b.addEventListener('click', () => {
    const it = items.find((x) => x.id === b.dataset.item);
    if (it) openItemSheet(it);
  }));
}

// Marks are written to the local cache at once; the screen updates
// without waiting for the server.
function mark(it, patch) {
  marks[it.id] = { ...(marks[it.id] || {}), ...patch };
  setLibraryMark(it.id, patch).catch(logFailed('mark'));
  render();
}

function openItemSheet(it) {
  openBottomSheet({
    ariaLabel: it.title,
    render(body, sheetApi) {
      const draw = () => {
        const m = marks[it.id] || {};
        const meta = [it.author, LIBRARY_TYPES[it.type], lengthText(it)].filter(Boolean).map(esc).join(' · ');
        body.innerHTML = `
          <div class="lib-sheet">
            <div class="lib-sheet-head">
              ${tile(it.area)}
              <div>
                <h3 class="lib-sheet-title" dir="auto">${esc(it.title)}</h3>
                <p class="lib-card-meta">${meta}</p>
              </div>
            </div>
            ${it.reason ? `<p class="lib-reason">${icon('sparkles', { className: 'icon--sm' })} ${esc(it.reason)}</p>` : ''}
            ${it.summary ? `<p class="lib-summary">${esc(it.summary)}</p>` : ''}
            ${it.takeaways?.length ? `
              <div class="pill-row-label">3 דברים לקחת</div>
              <ul class="lib-takeaways">${it.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
            <div class="lib-actions">
              ${it.link ? `<a class="btn btn-primary" href="${esc(it.link)}" target="_blank" rel="noopener noreferrer">${icon('external-link', { className: 'icon--sm' })} פתיחה</a>` : ''}
              <button type="button" class="btn btn-secondary${m.saved ? ' is-on' : ''}" data-save aria-pressed="${m.saved ? 'true' : 'false'}">${icon('bookmark', { className: 'icon--sm' })} ${m.saved ? 'שמור' : 'שמירה'}</button>
              <button type="button" class="btn btn-secondary${m.doneAt ? ' is-on' : ''}" data-done aria-pressed="${m.doneAt ? 'true' : 'false'}">${icon('check', { className: 'icon--sm' })} ${m.doneAt ? 'סיימתי' : 'סימון שסיימתי'}</button>
            </div>
            ${it.habitIdea ? `
              <button type="button" class="btn btn-dashed btn-block lib-habit" data-habit>
                ${icon('plus', { className: 'icon--sm' })} להפוך להרגל: ${esc(it.habitIdea.name)}
              </button>` : ''}
            ${it.pick && it.source === 'user' ? '<button type="button" class="btn btn-outline btn-block lib-delete" data-delete>מחיקת ההמלצה</button>' : ''}
          </div>`;
        body.querySelector('[data-save]').addEventListener('click', () => {
          mark(it, { saved: !m.saved });
          draw();
        });
        body.querySelector('[data-done]').addEventListener('click', () => {
          mark(it, { doneAt: m.doneAt ? null : new Date() });
          if (!m.doneAt) showToast('כל הכבוד, סימנתי שסיימת');
          draw();
        });
        body.querySelector('[data-habit]')?.addEventListener('click', async (e) => {
          e.currentTarget.disabled = true;
          await addHabitFrom(it);
          sheetApi.close();
        });
        body.querySelector('[data-delete]')?.addEventListener('click', () => {
          deleteLibraryPick(it.id.replace(/^pick:/, '')).catch(logFailed('delete pick'));
          items = items.filter((x) => x.id !== it.id);
          sheetApi.close();
          render();
        });
      };
      draw();
    },
  });
}

// One tap from a takeaway to a habit on "היום": a daily yes/no habit the
// user can change later from the habit's own edit screen.
async function addHabitFrom(it) {
  const existing = await listHabits().catch(() => []);
  const name = it.habitIdea.name;
  if (existing.some((h) => h.name === name && h.active !== false)) {
    showToast('ההרגל הזה כבר אצלך במסך "היום"');
    return;
  }
  const order = existing.reduce((mx, h) => Math.max(mx, Number.isFinite(h.order) ? h.order : 0), 0) + 1;
  const data = normalizeHabit({
    name,
    icon: it.habitIdea.icon,
    area: it.habitIdea.area,
    schedule: { type: 'daily' },
    measure: 'yesno',
    order,
  });
  delete data.id;
  setHabit(newHabitId(), { ...data, source: 'library' }, { isNew: true }).catch(logFailed('habit add'));
  showToast(`נוסף הרגל: ${esc(name)}. אפשר לסמן אותו במסך "היום"`);
}

// "+ הוספת המלצה": the user's own pick — for now only they see it.
function openAddSheet() {
  let draft = { title: '', type: 'book', area: 'mind', link: '', reason: '' };
  openBottomSheet({
    ariaLabel: 'הוספת המלצה',
    render(body, sheetApi) {
      const draw = () => {
        body.innerHTML = `
          <div class="lib-sheet">
            <h3 class="lib-sheet-title">הוספת המלצה</h3>
            <label class="lib-field"><span>מה זה?</span>
              <input type="text" class="search-bar" data-f="title" maxlength="80" dir="auto" placeholder="שם הספר, הפודקאסט או הסרטון" value="${esc(draft.title)}">
            </label>
            <div class="pill-row-label">סוג</div>
            <div class="pill-row">${Object.entries(LIBRARY_TYPES).map(([t, l]) => chip(l, draft.type === t, `data-t="${t}"`)).join('')}</div>
            <div class="pill-row-label">תחום</div>
            <div class="pill-row">${Object.entries(LIBRARY_AREAS).map(([a, v]) => chip(v.label, draft.area === a, `data-a="${a}"`)).join('')}</div>
            <label class="lib-field"><span>קישור (לא חובה)</span>
              <input type="url" class="search-bar" data-f="link" dir="ltr" placeholder="https://" value="${esc(draft.link)}">
            </label>
            <label class="lib-field"><span>למה אתה ממליץ?</span>
              <input type="text" class="search-bar" data-f="reason" maxlength="140" placeholder="שורה אחת" value="${esc(draft.reason)}">
            </label>
            <p class="lib-hint" data-err hidden></p>
            <button type="button" class="btn btn-primary btn-block" data-save-pick>שמירה</button>
          </div>`;
        body.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('input', () => {
          draft[inp.dataset.f] = inp.value;
        }));
        body.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
          draft.type = b.dataset.t;
          draw();
        }));
        body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
          draft.area = b.dataset.a;
          draw();
        }));
        body.querySelector('[data-save-pick]').addEventListener('click', async () => {
          const title = draft.title.trim();
          const link = draft.link.trim();
          const err = body.querySelector('[data-err]');
          if (!title) {
            err.textContent = 'צריך שם להמלצה.';
            err.hidden = false;
            return;
          }
          if (link && !/^https?:\/\/\S+\.\S+/.test(link)) {
            err.textContent = 'הקישור צריך להתחיל ב-https://';
            err.hidden = false;
            return;
          }
          const pick = { title, type: draft.type, area: draft.area, link: link || null, reason: draft.reason.trim(), source: 'user' };
          const id = await addLibraryPick(pick).catch((e) => {
            logFailed('add pick')(e);
            return null;
          });
          if (!id) {
            err.textContent = 'לא נשמר. אפשר לנסות שוב.';
            err.hidden = false;
            return;
          }
          items = [pickToItem({ id, ...pick }), ...items];
          sheetApi.close();
          render();
          showToast('ההמלצה נשמרה');
        });
      };
      draw();
    },
  });
}
