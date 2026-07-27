import { renderPlateDial } from '../lib/plate-dial.js';
import { formatMMSS, formatDateHe, SET_TYPE_LABELS } from '../lib/format.js';
import {
  listExerciseLibrary, seedExerciseLibraryIfEmpty, addExerciseToLibrary,
  getLastPerformance, createWorkout, getExerciseHistory, CATEGORY_GROUPS,
} from '../lib/firestore.js';

const SET_TYPES = [
  { id: 'warmup', label: SET_TYPE_LABELS.warmup, restSec: 60 },
  { id: 'working', label: SET_TYPE_LABELS.working, restSec: 120 },
  { id: 'dropset', label: SET_TYPE_LABELS.dropset, restSec: 30 },
];

let container = null;
let library = [];
let session = null; // { startedAt, exercises: [...] }
let elapsedTimerId = null;
let restTimerId = null;
let rest = null; // { totalSec, remainingSec }
let picker = { open: false, query: '', category: null };
let lastTimeModal = null; // { name, previous }

export async function mountActiveSession(rootEl) {
  container = rootEl;
  library = await listExerciseLibrary();
  if (library.length === 0) {
    await seedExerciseLibraryIfEmpty();
    library = await listExerciseLibrary();
  }
  render();
}

export function unmountActiveSession() {
  if (elapsedTimerId) clearInterval(elapsedTimerId);
  if (restTimerId) clearInterval(restTimerId);
}

function render() {
  if (!container) return;

  if (!session) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <h2>מוכן להתחיל?</h2>
        <p class="text-muted">לחיצה תתחיל שעון אימון וסטופר מנוחה בין סטים.</p>
        <button class="btn btn-primary btn-block" id="start-workout-btn">התחלת אימון</button>
      </div>`;
    container.querySelector('#start-workout-btn').addEventListener('click', startWorkout);
    return;
  }

  const elapsedSec = (Date.now() - session.startedAt.getTime()) / 1000;

  container.innerHTML = `
    <div class="card row">
      <div>
        <h3 style="margin:0;">זמן אימון</h3>
        <div class="num" style="font-size:1.8rem;">${formatMMSS(elapsedSec)}</div>
      </div>
      <button class="btn btn-secondary" id="finish-workout-btn">סיום אימון</button>
    </div>

    ${rest ? `<div class="card" style="text-align:center;" id="rest-card">
        <div class="text-muted" style="margin-bottom:8px;">מנוחה</div>
        <div id="rest-dial"></div>
        <button class="btn btn-secondary" id="skip-rest-btn" style="margin-top:12px;">דלג</button>
      </div>` : ''}

    <div id="exercise-list"></div>

    <button class="btn btn-secondary btn-block" id="add-exercise-btn">+ הוספת תרגיל</button>

    ${picker.open ? renderPicker() : ''}
    ${lastTimeModal ? renderLastTimeModal() : ''}
  `;

  const list = container.querySelector('#exercise-list');
  session.exercises.forEach((ex, exIdx) => {
    list.appendChild(renderExerciseCard(ex, exIdx));
  });

  if (rest) {
    renderPlateDial(container.querySelector('#rest-dial'), {
      progress: rest.remainingSec / rest.totalSec,
      valueText: formatMMSS(rest.remainingSec),
      label: 'שניות',
    });
    container.querySelector('#skip-rest-btn').addEventListener('click', stopRestTimer);
  }

  container.querySelector('#finish-workout-btn').addEventListener('click', finishWorkout);
  container.querySelector('#add-exercise-btn').addEventListener('click', () => {
    picker = { open: true, query: '', category: null };
    render();
  });

  if (picker.open) wirePicker();
  if (lastTimeModal) wireLastTimeModal();
}

// ---------- "last time" popup ----------

function renderLastTimeModal() {
  const { name, previous } = lastTimeModal;

  const body = !previous
    ? `<p class="text-muted">אין עדיין נתונים מפעם קודמת שביצעת את התרגיל הזה.</p>`
    : `
      <p class="text-muted" style="margin-top:-6px;">${formatDateHe(previous.workoutDate)}</p>
      <table>
        <thead><tr><th>#</th><th>סוג</th><th>משקל</th><th>חזרות</th></tr></thead>
        <tbody>
          ${previous.sets.map((s, i) => `
            <tr>
              <td class="num">${i + 1}</td>
              <td>${SET_TYPES.find((t) => t.id === s.type)?.label ?? s.type}</td>
              <td class="num">${s.weight}${unitLabel(s.weightUnit)}${s.weightMode === 'perSide' ? ' לצד' : ''}</td>
              <td class="num">${s.reps}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

  return `
    <div class="modal-overlay" id="last-time-overlay">
      <div class="modal-card">
        <button class="modal-close" id="last-time-close">✕</button>
        <h3 style="color:var(--text);">${escapeHtml(name)}</h3>
        ${body}
      </div>
    </div>`;
}

function wireLastTimeModal() {
  const overlay = container.querySelector('#last-time-overlay');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      lastTimeModal = null;
      render();
    }
  });
  container.querySelector('#last-time-close').addEventListener('click', () => {
    lastTimeModal = null;
    render();
  });
}

// ---------- exercise picker ----------

function renderPicker() {
  const q = picker.query.trim();
  const byCategory = picker.category ? library.filter((e) => e.category === picker.category) : library;
  const matches = byCategory.filter((e) => e.name.includes(q));
  const exactMatch = library.some((e) => e.name === q);

  const pillRow = (label, categories) => `
    <div class="pill-row-label">${label}</div>
    <div class="pill-row">
      ${categories.map((c) => `<button class="pill ${picker.category === c ? 'active' : ''}" data-category="${c}">${c}</button>`).join('')}
    </div>`;

  return `
    <div class="card" id="picker-card">
      <button class="pill ${!picker.category ? 'active' : ''}" data-category="" style="margin-bottom:10px;">הכל</button>
      ${CATEGORY_GROUPS.map((g) => pillRow(g.label, g.categories)).join('')}
      <input type="text" id="picker-input" class="search-bar" placeholder="חיפוש תרגיל..." value="${escapeAttr(picker.query)}"
        style="margin:10px 0;">
      <div id="picker-results">
        ${matches.map((e) => `<button class="btn btn-secondary btn-block" style="margin-bottom:6px;" data-pick="${e.id}">${e.name}</button>`).join('')}
        ${matches.length === 0 ? '<p class="text-muted" style="text-align:center;">אין תרגילים בקטגוריה הזו.</p>' : ''}
        ${q && !exactMatch ? `<button class="btn btn-primary btn-block" id="picker-add-new">+ הוספת "${escapeHtml(q)}" כתרגיל חדש</button>` : ''}
      </div>
    </div>`;
}

function wirePicker() {
  const input = container.querySelector('#picker-input');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('input', (e) => {
    picker.query = e.target.value;
    render();
  });
  container.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      picker.category = btn.dataset.category || null;
      render();
    });
  });
  container.querySelectorAll('[data-pick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lib = library.find((e) => e.id === btn.dataset.pick);
      addExerciseToSession(lib);
    });
  });
  const addNewBtn = container.querySelector('#picker-add-new');
  if (addNewBtn) {
    addNewBtn.addEventListener('click', async () => {
      const name = picker.query.trim();
      const category = picker.category || '';
      const id = await addExerciseToLibrary({ name, category, defaultWeightMode: 'total' });
      const lib = { id, name, category, defaultWeightMode: 'total', isCustom: true };
      library.push(lib);
      addExerciseToSession(lib);
    });
  }
}

async function addExerciseToSession(lib) {
  const entry = {
    name: lib.name,
    category: lib.category || '',
    weightMode: lib.defaultWeightMode || 'total',
    weightUnit: lib.defaultUnit || 'kg',
    previous: null,
    prevLoaded: false,
    history: null,
    sets: [],
  };
  session.exercises.push(entry);
  picker = { open: false, query: '', category: null };
  render();

  const [prev, hist] = await Promise.all([
    getLastPerformance(lib.name),
    getExerciseHistory(lib.name),
  ]);
  entry.previous = prev;
  entry.history = hist;
  entry.prevLoaded = true;
  render();
}

// ---------- exercise card ----------

function renderExerciseCard(ex, exIdx) {
  const el = document.createElement('div');
  el.className = 'card';

  const setsRows = ex.sets.map((set, setIdx) => {
    return `
      <div class="row" style="margin-bottom:10px; align-items:center;">
        <select data-set-type="${setIdx}" style="background:var(--surface-raised); border:1px solid var(--border); border-radius:6px; padding:6px;">
          ${SET_TYPES.map((t) => `<option value="${t.id}" ${t.id === set.type ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
        <div class="stepper">
          <button data-w-dec="${setIdx}">−</button>
          <span class="stepper-value num">${set.weight}${unitLabel(set.weightUnit)}</span>
          <button data-w-inc="${setIdx}">+</button>
        </div>
        <div class="stepper">
          <button data-r-dec="${setIdx}">−</button>
          <span class="stepper-value num">${set.reps}</span>
          <button data-r-inc="${setIdx}">+</button>
        </div>
        <button class="btn ${set.done ? 'btn-primary' : 'btn-secondary'}" data-toggle-done="${setIdx}" style="padding:0 14px;">
          ${set.done ? '✓' : 'סיום'}
        </button>
        ${set.isPR ? '<span class="pr-badge">שיא חדש 🏆</span>' : ''}
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="row" style="margin-bottom:8px; flex-wrap:wrap; gap:8px;">
      <h3 style="color:var(--text); margin:0;">${ex.name}</h3>
      <button class="btn btn-secondary" data-last-time style="padding:0 12px; font-size:0.85rem;">🕐 פעם קודמת</button>
    </div>
    <div class="row" style="margin-bottom:12px; justify-content:flex-start; gap:10px; flex-wrap:wrap;">
      <div class="toggle-group" data-weight-mode-group>
        <button data-mode="total" class="${ex.weightMode === 'total' ? 'active' : ''}">טוטאל</button>
        <button data-mode="perSide" class="${ex.weightMode === 'perSide' ? 'active' : ''}">כל צד</button>
      </div>
      <div class="toggle-group" data-weight-unit-group>
        <button data-unit="kg" class="${ex.weightUnit === 'kg' ? 'active' : ''}">ק"ג</button>
        <button data-unit="lb" class="${ex.weightUnit === 'lb' ? 'active' : ''}">lb</button>
      </div>
    </div>
    ${setsRows}
    <button class="btn btn-secondary btn-block" data-add-set>+ סט</button>
  `;

  el.querySelector('[data-last-time]').addEventListener('click', () => {
    lastTimeModal = { name: ex.name, previous: ex.previous };
    render();
  });

  el.querySelectorAll('[data-weight-mode-group] button').forEach((btn) => {
    btn.addEventListener('click', () => {
      ex.weightMode = btn.dataset.mode;
      render();
    });
  });

  el.querySelectorAll('[data-weight-unit-group] button').forEach((btn) => {
    btn.addEventListener('click', () => {
      ex.weightUnit = btn.dataset.unit;
      render();
    });
  });

  el.querySelector('[data-add-set]').addEventListener('click', () => {
    const lastType = ex.sets.at(-1)?.type ?? 'working';
    ex.sets.push({
      type: lastType,
      weight: ex.sets.at(-1)?.weight ?? 20,
      reps: ex.sets.at(-1)?.reps ?? 8,
      done: false,
      isPR: false,
      weightMode: ex.weightMode,
      weightUnit: ex.weightUnit,
    });
    render();
  });

  el.querySelectorAll('[data-set-type]').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      ex.sets[+sel.dataset.setType].type = e.target.value;
    });
  });

  el.querySelectorAll('[data-w-inc]').forEach((btn) => btn.addEventListener('click', () => {
    const set = ex.sets[+btn.dataset.wInc];
    set.weight += set.weightUnit === 'lb' ? 5 : 2.5;
    render();
  }));
  el.querySelectorAll('[data-w-dec]').forEach((btn) => btn.addEventListener('click', () => {
    const set = ex.sets[+btn.dataset.wDec];
    set.weight = Math.max(0, set.weight - (set.weightUnit === 'lb' ? 5 : 2.5));
    render();
  }));
  el.querySelectorAll('[data-r-inc]').forEach((btn) => btn.addEventListener('click', () => {
    ex.sets[+btn.dataset.rInc].reps += 1;
    render();
  }));
  el.querySelectorAll('[data-r-dec]').forEach((btn) => btn.addEventListener('click', () => {
    ex.sets[+btn.dataset.rDec].reps = Math.max(0, ex.sets[+btn.dataset.rDec].reps - 1);
    render();
  }));
  el.querySelectorAll('[data-toggle-done]').forEach((btn) => btn.addEventListener('click', () => {
    const set = ex.sets[+btn.dataset.toggleDone];
    set.done = !set.done;
    set.weightMode = ex.weightMode;
    set.weightUnit = ex.weightUnit;
    if (set.done) {
      set.isPR = computePR(ex, set);
      const type = SET_TYPES.find((t) => t.id === set.type);
      startRestTimer(type.restSec);
    }
    render();
  }));

  return el;
}

function computePR(ex, set) {
  const history = ex.history || [];
  const bestPrev = history.flatMap((h) => h.sets || [])
    .filter((s) => s.weightMode === set.weightMode && (s.weightUnit || 'kg') === set.weightUnit)
    .reduce((max, s) => Math.max(max, s.weight), 0);
  return set.weight > bestPrev;
}

function unitLabel(unit) {
  return unit === 'lb' ? ' lb' : ' ק"ג';
}

// ---------- timers ----------

function startWorkout() {
  session = { startedAt: new Date(), exercises: [] };
  elapsedTimerId = setInterval(render, 1000);
  render();
}

function startRestTimer(totalSec) {
  if (restTimerId) clearInterval(restTimerId);
  rest = { totalSec, remainingSec: totalSec };
  restTimerId = setInterval(() => {
    rest.remainingSec -= 1;
    if (rest.remainingSec <= 0) {
      stopRestTimer();
      if (navigator.vibrate) navigator.vibrate(200);
    } else {
      render();
    }
  }, 1000);
}

function stopRestTimer() {
  if (restTimerId) clearInterval(restTimerId);
  restTimerId = null;
  rest = null;
  render();
}

async function finishWorkout() {
  const exercises = session
    ? session.exercises.map((ex) => ({
        name: ex.name,
        category: ex.category,
        sets: ex.sets.filter((s) => s.done).map((s, i) => ({
          setNumber: i + 1,
          type: s.type,
          weight: s.weight,
          weightUnit: s.weightUnit,
          weightMode: s.weightMode,
          reps: s.reps,
        })),
      })).filter((ex) => ex.sets.length > 0)
    : [];

  if (exercises.length > 0) {
    await createWorkout({
      date: session.startedAt,
      startTime: session.startedAt,
      endTime: new Date(),
      exercises,
    });
  }

  if (elapsedTimerId) clearInterval(elapsedTimerId);
  if (restTimerId) clearInterval(restTimerId);
  session = null;
  rest = null;
  render();
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
