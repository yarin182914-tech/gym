import { listWorkouts, getExerciseHistory, listExerciseLibrary, CATEGORY_GROUPS } from '../lib/firestore.js';
import { renderProgressChart, heaviestSet } from '../lib/charts.js';
import { esc } from '../core/dom.js';
import { formatDayMonthHe as shortDate, unitLabel, round1 } from '../lib/format.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { statTile } from '../ui/stat-tile.js';
import { toggleGroup, patchToggleGroup } from '../ui/toggle-group.js';
import { emptyState } from '../ui/empty-state.js';
import { icon } from '../ui/icon.js';
import { openExerciseEditSheet } from '../ui/exercise-edit-sheet.js';

let container = null;
let allExerciseNames = [];
let categoryByName = new Map();
// name -> { id, name, category } — real library entries have a real id;
// a name that only exists in workout history (never added to the library,
// a real gap this app's own data had) gets id:null so it can still be
// renamed everywhere, just not deleted from a library entry that isn't there.
let libraryByName = new Map();
let selectedExercise = null;
let metric = 'weight'; // 'weight' | 'volume'
let viewMode = 'chart'; // 'chart' | 'table'
let chartInstance = null;
let picker = { open: false, query: '', category: null };

// A canvas chart doesn't follow CSS colour changes on its own — redraw it
// when the theme switch flips while this screen is showing.
window.addEventListener('gym-theme-change', () => {
  if (container && chartInstance) render();
});

export function unmountDashboard() {
  if (chartInstance) chartInstance.destroy();
  chartInstance = null;
  container = null;
  allExerciseNames = [];
  categoryByName = new Map();
  libraryByName = new Map();
  picker = { open: false, query: '', category: null };
}

export async function mountDashboard(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען נתוני התקדמות...');

  const [workouts, libraryEntries] = await Promise.all([listWorkouts(500), listExerciseLibrary()]);
  if (isStale(token)) return;

  const namesInRecencyOrder = [];
  const seen = new Set();
  categoryByName = new Map();
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (!seen.has(ex.name)) { seen.add(ex.name); namesInRecencyOrder.push(ex.name); }
      if (ex.category) categoryByName.set(ex.name, ex.category);
    }
  }
  allExerciseNames = namesInRecencyOrder;

  libraryByName = new Map();
  libraryEntries.forEach((e) => libraryByName.set(e.name, { id: e.id, name: e.name, category: e.category }));
  allExerciseNames.forEach((name) => {
    if (!libraryByName.has(name)) {
      libraryByName.set(name, { id: null, name, category: categoryByName.get(name) || '' });
    }
  });

  if (allExerciseNames.length === 0) {
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <h2>התקדמות</h2>
        ${emptyState('עוד אין נתונים — תתחיל לתעד אימונים כדי לראות כאן גרפים.')}
      </div>`;
    return;
  }

  if (!selectedExercise || !allExerciseNames.includes(selectedExercise)) {
    selectedExercise = allExerciseNames[0];
  }

  await render();
}

async function loadSeries(exerciseName) {
  const history = await getExerciseHistory(exerciseName);
  return history.map((point) => {
    const maxWeightSet = heaviestSet(point.sets);
    const volume = point.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    return {
      date: point.date,
      maxWeight: maxWeightSet.weight,
      reps: maxWeightSet.reps,
      unit: maxWeightSet.weightUnit || 'kg',
      mode: maxWeightSet.weightMode || 'total',
      volume,
    };
  });
}

function withRunningPR(values) {
  let max = -Infinity;
  return values.map((v) => {
    const isPR = v > max;
    if (v > max) max = v;
    return isPR;
  });
}

function computeHeadline(series, metricKey) {
  if (series.length === 1) return 'אימון ראשון — עדיין אין מספיק נתונים להשוואה.';
  const values = series.map((p) => (metricKey === 'weight' ? p.maxWeight : p.volume));
  const first = values[0];
  const last = values.at(-1);
  const diff = round1(last - first);
  const unit = metricKey === 'weight' ? unitLabel(series[0].unit) : '';
  if (diff > 0) return `+${diff}${unit} מאז האימון הראשון`;
  if (diff < 0) return `${diff}${unit} מאז האימון הראשון`;
  const lastN = values.slice(-3);
  const flat = lastN.every((v) => v === lastN[0]);
  return flat ? `ללא שינוי ב-${lastN.length} האימונים האחרונים` : 'ללא שינוי כולל מאז האימון הראשון';
}

async function render() {
  const series = await loadSeries(selectedExercise);
  if (!container) return; // unmounted mid-render
  const values = series.map((p) => (metric === 'weight' ? p.maxWeight : p.volume));
  const prFlags = withRunningPR(values);
  const headline = computeHeadline(series, metric);
  const best = series.reduce((b, p) => (p.maxWeight > (b?.maxWeight ?? -1) ? p : b), null);

  container.innerHTML = `
    <div class="card">
      <h2 style="margin-bottom:12px;">התקדמות</h2>

      <button type="button" class="dash-exercise-trigger${picker.open ? ' dash-exercise-trigger--open' : ''}" id="exercise-trigger">
        <span>${esc(selectedExercise)}</span>
        <span class="dash-exercise-trigger-icon" aria-hidden="true">▾</span>
      </button>
      ${picker.open ? renderExercisePicker() : ''}

      <div class="row" style="justify-content:space-between; margin: 14px 0 10px; flex-wrap:wrap; gap:8px;">
        ${toggleGroup({
          name: 'metric',
          active: metric,
          label: 'מדד להצגה',
          groupAttrs: 'id="metric-toggle"',
          options: [{ value: 'weight', label: 'משקל מקסימלי' }, { value: 'volume', label: 'נפח' }],
        })}
        ${toggleGroup({
          name: 'view',
          active: viewMode,
          label: 'תצוגה',
          groupAttrs: 'id="view-toggle"',
          options: [{ value: 'chart', label: 'גרף' }, { value: 'table', label: 'טבלה' }],
        })}
      </div>

      <p class="num" style="font-size:1.05rem; font-weight:var(--weight-bold); letter-spacing:var(--tracking-tight); color:var(--purple); text-align:center; margin-bottom:14px;">${headline}</p>

      <div id="progress-view" class="dash-progress-view dash-progress-view--transitioning">
        ${viewMode === 'chart'
          ? `<div style="height:220px;"><canvas id="progress-canvas"></canvas></div>`
          : renderTable(series, metric)}
      </div>

      <div class="row" style="margin-top:16px; gap:8px;">
        ${statTile(best ? `${best.maxWeight}${unitLabel(best.unit)}` : '—', 'שיא')}
        ${statTile(series.length, 'אימונים')}
        ${statTile(round1(series.at(-1).volume), 'נפח אחרון')}
      </div>
    </div>

    <div id="pr-list"></div>
  `;

  const metricGroupEl = container.querySelector('#metric-toggle');
  const viewGroupEl = container.querySelector('#view-toggle');
  metricGroupEl.classList.add('toggle-group--live');
  viewGroupEl.classList.add('toggle-group--live');
  patchToggleGroup(metricGroupEl, metric);
  patchToggleGroup(viewGroupEl, viewMode);

  // Two rAFs, not one — the browser must paint the transitioning (opacity 0)
  // state before the class is removed, or the fade-in never plays. Same
  // reason as the set-row entering animation on Active Session.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    container?.querySelector('#progress-view')?.classList.remove('dash-progress-view--transitioning');
  }));

  if (viewMode === 'chart') {
    const canvas = container.querySelector('#progress-canvas');
    // The chart library is fetched on demand, so this resolves later; the
    // canvas may already be gone if the user moved on in the meantime.
    const pending = chartInstance;
    chartInstance = null;
    renderProgressChart(canvas, {
      labels: series.map((p) => shortDate(p.date)),
      values,
      prFlags,
      formatValue: (v) => (metric === 'weight' ? `${round1(v)}${unitLabel(series[0].unit)}` : `${round1(v)} נפח`),
    }, pending).then((chart) => {
      if (canvas.isConnected) chartInstance = chart;
      else chart.destroy();
    }).catch((err) => console.error('[dashboard] chart failed to render', err));
  }

  container.querySelector('#exercise-trigger').addEventListener('click', () => {
    picker = picker.open ? { open: false, query: '', category: null } : { open: true, query: '', category: null };
    render();
  });
  if (picker.open) wireExercisePicker();

  container.querySelectorAll('#metric-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      metric = btn.dataset.metric;
      render();
    });
  });
  container.querySelectorAll('#view-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.view;
      render();
    });
  });

  renderPRList();
}

// Replaces a native <select> with the same search + category-pill picker
// pattern Active Session already uses for its exercise picker — a plain
// unstyled OS dropdown was the single most "browser default" control on
// this screen.
function renderExercisePicker() {
  const q = picker.query.trim();
  const byCategory = picker.category
    ? allExerciseNames.filter((n) => categoryByName.get(n) === picker.category)
    : allExerciseNames;
  const matches = byCategory.filter((n) => n.includes(q));
  const categoriesUsed = [...new Set(allExerciseNames.map((n) => categoryByName.get(n)).filter(Boolean))];

  return `
    <div class="card" id="dash-picker-card" style="margin-top:8px;">
      <input type="text" id="dash-picker-input" class="search-bar" placeholder="חיפוש תרגיל..." value="${esc(picker.query)}" style="margin-bottom:10px;">
      <div class="pill-row" style="margin-bottom:10px;">
        <button class="pill ${!picker.category ? 'active' : ''}" data-category="">הכל</button>
        ${categoriesUsed.map((c) => `<button class="pill ${picker.category === c ? 'active' : ''}" data-category="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <div class="dash-picker-results">
        ${matches.map((n) => `
          <div class="row" style="gap:6px; margin-bottom:6px;">
            <button type="button" class="btn btn-secondary" style="flex:1;" data-pick="${esc(n)}">${esc(n)}</button>
            <button type="button" class="set-more-btn" data-edit-lib="${esc(n)}" aria-label="עריכת התרגיל">${icon('pencil', { className: 'icon--sm' })}</button>
          </div>`).join('')}
        ${matches.length === 0 ? emptyState('אין תרגילים תואמים.', { centered: true }) : ''}
      </div>
    </div>`;
}

function wireExercisePicker() {
  const input = container.querySelector('#dash-picker-input');
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
      selectedExercise = btn.dataset.pick;
      picker = { open: false, query: '', category: null };
      render();
    });
  });
  container.querySelectorAll('[data-edit-lib]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const entry = libraryByName.get(btn.dataset.editLib);
      if (!entry) return;
      openExerciseEditSheet(entry, {
        onSaved: async () => {
          await mountDashboard(container);
        },
      });
    });
  });
}

function renderTable(series, metricKey) {
  const rows = series.map((p) => `
    <div class="dash-table-row">
      <span class="text-muted">${shortDate(p.date)}</span>
      <span class="num" style="font-weight:var(--weight-semibold);">${metricKey === 'weight' ? `${p.maxWeight}${unitLabel(p.unit)}` : round1(p.volume)}</span>
    </div>`).join('');
  return `<div class="dash-table-view">${rows}</div>`;
}

async function renderPRList() {
  if (!container) return;
  const prListEl = container.querySelector('#pr-list');
  if (!prListEl) return;

  const rows = await Promise.all(allExerciseNames.map(async (name) => {
    const series = await loadSeries(name);
    const best = series.reduce((b, p) => (p.maxWeight > (b?.maxWeight ?? -1) ? p : b), null);
    return { name, best, category: categoryByName.get(name) || 'אחר' };
  }));
  if (!container) return; // unmounted while the per-exercise loads resolved

  const knownCategories = CATEGORY_GROUPS.flatMap((g) => g.categories);
  const orderedCategories = [...knownCategories, 'אחר'];
  const rowHtml = (r) => `
    <div class="pr-row">
      <span class="pr-row-name">${esc(r.name)}</span>
      <span class="pr-row-value">
        <span class="pr-row-weight num">${r.best.maxWeight}${unitLabel(r.best.unit)}</span>
        <span class="pr-row-reps">× ${r.best.reps}</span>
        <span class="pr-row-date">${shortDate(r.best.date)}</span>
      </span>
    </div>`;

  prListEl.innerHTML = `
    <h3 style="color:var(--text); margin-bottom:10px;">שיאים אישיים</h3>
    ${orderedCategories.map((cat) => {
      const inCat = rows.filter((r) => r.category === cat);
      if (inCat.length === 0) return '';
      return `
        <div class="card pr-category-card">
          <div class="pr-category-label">${esc(cat)}</div>
          ${inCat.map(rowHtml).join('')}
        </div>`;
    }).join('')}
  `;
}
