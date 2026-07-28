import { listWorkouts, getExerciseHistory, CATEGORY_GROUPS } from '../lib/firestore.js';
import { renderProgressChart } from '../lib/charts.js';
import { esc } from '../core/dom.js';
import { formatDayMonthHe as shortDate, unitLabel, round1 } from '../lib/format.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { statTile } from '../ui/stat-tile.js';
import { toggleGroup } from '../ui/toggle-group.js';
import { emptyState } from '../ui/empty-state.js';

let container = null;
let allExerciseNames = [];
let categoryByName = new Map();
let selectedExercise = null;
let metric = 'weight'; // 'weight' | 'volume'
let viewMode = 'chart'; // 'chart' | 'table'
let chartInstance = null;

export function unmountDashboard() {
  if (chartInstance) chartInstance.destroy();
  chartInstance = null;
  container = null;
  allExerciseNames = [];
  categoryByName = new Map();
}

export async function mountDashboard(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען נתוני התקדמות...');

  const workouts = await listWorkouts(500);
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
    const maxWeightSet = point.sets.reduce((best, s) => (s.weight > (best?.weight ?? -1) ? s : best), null);
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
      <select id="exercise-picker" class="search-bar" style="margin-bottom:14px;">
        ${allExerciseNames.map((n) => `<option value="${esc(n)}" ${n === selectedExercise ? 'selected' : ''}>${esc(n)}</option>`).join('')}
      </select>

      <div class="row" style="justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
        ${toggleGroup({
          name: 'metric',
          active: metric,
          groupAttrs: 'id="metric-toggle"',
          options: [{ value: 'weight', label: 'משקל מקסימלי' }, { value: 'volume', label: 'נפח' }],
        })}
        <button class="btn btn-secondary" id="view-toggle-btn" style="font-size:0.85rem;">${viewMode === 'chart' ? 'הצג כטבלה' : 'הצג כגרף'}</button>
      </div>

      <p class="num" style="font-size:1.05rem; font-weight:700; color:var(--accent); text-align:center; margin-bottom:14px;">${headline}</p>

      ${viewMode === 'chart'
        ? `<div style="height:220px;"><canvas id="progress-canvas"></canvas></div>`
        : renderTable(series, metric)}

      <div class="row" style="margin-top:16px; gap:8px;">
        ${statTile(best ? `${best.maxWeight}${unitLabel(best.unit)}` : '—', 'שיא')}
        ${statTile(series.length, 'אימונים')}
        ${statTile(round1(series.at(-1).volume), 'נפח אחרון')}
      </div>
    </div>

    <div id="pr-list"></div>
  `;

  if (viewMode === 'chart') {
    const canvas = container.querySelector('#progress-canvas');
    chartInstance = renderProgressChart(canvas, {
      labels: series.map((p) => shortDate(p.date)),
      values,
      prFlags,
      formatValue: (v) => (metric === 'weight' ? `${round1(v)}${unitLabel(series[0].unit)}` : `${round1(v)} נפח`),
    }, chartInstance);
  }

  container.querySelector('#exercise-picker').addEventListener('change', (e) => {
    selectedExercise = e.target.value;
    render();
  });
  container.querySelectorAll('#metric-toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      metric = btn.dataset.metric;
      render();
    });
  });
  container.querySelector('#view-toggle-btn').addEventListener('click', () => {
    viewMode = viewMode === 'chart' ? 'table' : 'chart';
    render();
  });

  renderPRList();
}

function renderTable(series, metricKey) {
  const rows = series.map((p) => `
    <tr>
      <td>${shortDate(p.date)}</td>
      <td class="num">${metricKey === 'weight' ? `${p.maxWeight}${unitLabel(p.unit)}` : round1(p.volume)}</td>
    </tr>`).join('');
  return `
    <table>
      <thead><tr><th>תאריך</th><th>${metricKey === 'weight' ? 'משקל מקסימלי' : 'נפח'}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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
    <div class="row" style="margin-bottom:8px;">
      <span>${esc(r.name)}</span>
      <span class="num" style="font-weight:700; color:var(--accent);">
        ${r.best.maxWeight}${unitLabel(r.best.unit)} × ${r.best.reps} <span class="text-muted" style="font-weight:400; font-size:0.75rem;">(${shortDate(r.best.date)})</span>
      </span>
    </div>`;

  prListEl.innerHTML = `
    <div class="card">
      <h3 style="color:var(--text); margin-bottom:10px;">שיאים אישיים</h3>
      ${orderedCategories.map((cat) => {
        const inCat = rows.filter((r) => r.category === cat);
        if (inCat.length === 0) return '';
        return `<h4 class="text-muted" style="font-size:0.8rem; margin:12px 0 6px;">${cat}</h4>${inCat.map(rowHtml).join('')}`;
      }).join('')}
    </div>`;
}
