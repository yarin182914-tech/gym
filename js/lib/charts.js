// Thin wrapper around Chart.js (loaded globally via CDN <script> in index.html)
// tuned to this app's design tokens and the dataviz method: one axis, thin
// purple line (analytics/progress is this app's one semantic use of purple),
// selective direct labels (first/last/PR only), gold PR markers, hover
// tooltip by default, recessive gridlines.

import { round1, unitLabel, formatDayMonthHe } from './format.js';

const PURPLE = '#8b6bb0';
const GOLD = '#facb8d';
const MUTED = '#9b9797';
const GRID = 'rgba(255, 255, 255, 0.12)';
const TEXT = '#f3f0ec';
// The tooltip chip stays a dark surface (not TEXT, which is this theme's
// near-white foreground colour) — Chart.js's default white tooltip text
// already reads fine against it, same as it did against the old theme's
// dark-navy tooltip background.
const TOOLTIP_BG = '#2a2724';

function selectiveLabelsPlugin(values, prFlags, formatValue) {
  return {
    id: 'selectiveLabels',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      const { ctx } = chart;
      meta.data.forEach((point, i) => {
        const isFirst = i === 0;
        const isLast = i === values.length - 1;
        if (!isFirst && !isLast && !prFlags[i]) return;
        ctx.save();
        ctx.fillStyle = prFlags[i] ? GOLD : TEXT;
        ctx.font = "600 11px 'Oswald', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText(formatValue(values[i]), point.x, point.y - 12);
        ctx.restore();
      });
    },
  };
}

const CHART_SRC = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
let chartLib = null;

// Chart.js is ~200KB and only the progress screen uses it, so it is fetched on
// first use instead of blocking every page load. Injecting the UMD build keeps
// the existing global-Chart API rather than swapping to the ESM bundle.
function loadChartLib() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartLib) {
    chartLib = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = CHART_SRC;
      script.async = true;
      script.onload = () => resolve(window.Chart);
      script.onerror = () => {
        chartLib = null; // let a later attempt retry
        reject(new Error('Chart.js failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return chartLib;
}

// The heaviest single set in one workout's sets array — the one bit of math
// both this module and js/pages/dashboard.js's own (richer) series-building
// need, so it lives here rather than being computed twice.
export function heaviestSet(sets) {
  return sets.reduce((best, s) => (s.weight > (best?.weight ?? -1) ? s : best), null);
}

// Turns getExerciseHistory()'s raw output into exactly what renderProgressChart
// needs for a weight-only series — what Active Session's per-set progress
// graph wants. Dashboard needs a richer per-point shape (volume/reps/mode
// too, for its table view and metric toggle) so it builds its own via
// heaviestSet() above rather than calling this; this is for a caller that
// only ever wants the weight line.
export function buildWeightSeries(history) {
  const points = history.map((point) => {
    const top = heaviestSet(point.sets);
    return { date: point.date, maxWeight: top.weight, unit: top.weightUnit || 'kg' };
  });
  const values = points.map((p) => p.maxWeight);
  let max = -Infinity;
  const prFlags = values.map((v) => {
    const isPR = v > max;
    if (v > max) max = v;
    return isPR;
  });
  const unit = points[0] ? unitLabel(points[0].unit) : '';
  return {
    labels: points.map((p) => formatDayMonthHe(p.date)),
    values,
    prFlags,
    formatValue: (v) => `${round1(v)}${unit}`,
  };
}

// labels: x-axis labels (dates). values: numeric y per point (already the
// single chosen metric — weight OR volume, never both at once, per the
// one-axis rule). prFlags: parallel boolean array marking new-PR points.
export async function renderProgressChart(canvas, { labels, values, prFlags, formatValue = (v) => String(v) }, existingChart) {
  const Chart = await loadChartLib();
  if (existingChart) existingChart.destroy();

  const pointColors = values.map((_, i) => (prFlags[i] ? GOLD : PURPLE));

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: PURPLE,
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 6,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        tension: 0.15,
        fill: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 20 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: TOOLTIP_BG,
          titleFont: { family: 'Rubik' },
          bodyFont: { family: 'Oswald' },
          padding: 10,
          callbacks: {
            label: (ctx) => formatValue(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Rubik', size: 11 }, color: MUTED },
        },
        y: {
          grid: { color: GRID },
          ticks: { font: { family: 'Oswald', size: 11 }, color: MUTED },
        },
      },
    },
    plugins: [selectiveLabelsPlugin(values, prFlags, formatValue)],
  });
}
