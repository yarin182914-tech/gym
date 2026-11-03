// Thin wrapper around Chart.js (loaded globally via CDN <script> in index.html)
// tuned to this app's design tokens and the dataviz method: one axis, thin
// purple line (analytics/progress is this app's one semantic use of purple),
// selective direct labels (first/last/PR only), gold PR markers, hover
// tooltip by default, recessive gridlines.

import { round1, unitLabel, formatDayMonthHe } from './format.js';

// Read from the active colour theme (css/01-tokens.css) each time a chart is
// drawn, so it always matches whichever theme is on — a canvas can't use
// CSS variables directly.
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    line: v('--purple'),
    pr: v('--gold'),
    muted: v('--text-muted'),
    grid: v('--border'),
    text: v('--text'),
    tooltipBg: v('--surface-raised'),
  };
}

function selectiveLabelsPlugin(values, prFlags, formatValue, colors) {
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
        ctx.fillStyle = prFlags[i] ? colors.pr : colors.text;
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

  const colors = themeColors();
  const pointColors = values.map((_, i) => (prFlags[i] ? colors.pr : colors.line));

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: colors.line,
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
          backgroundColor: colors.tooltipBg,
          titleColor: colors.text,
          bodyColor: colors.text,
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
          ticks: { font: { family: 'Rubik', size: 11 }, color: colors.muted },
        },
        y: {
          grid: { color: colors.grid },
          ticks: { font: { family: 'Oswald', size: 11 }, color: colors.muted },
        },
      },
    },
    plugins: [selectiveLabelsPlugin(values, prFlags, formatValue, colors)],
  });
}

// Body weight: each morning's weigh-in as a faint dot, with the 7-day
// average drawn through them as the line — the dots show the daily noise,
// the line the trend. Both arrays run one entry per calendar day (null on
// days with nothing), so the x-axis spaces days evenly even across gaps.
export async function renderBodyWeightChart(canvas, { labels, raw, trend }, existingChart) {
  const Chart = await loadChartLib();
  if (existingChart) existingChart.destroy();

  const colors = themeColors();
  const kg = (v) => `${round1(v)} ק"ג`;

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'ממוצע 7 ימים',
          data: trend,
          borderColor: colors.line,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointBackgroundColor: colors.line,
          tension: 0.3,
          spanGaps: true,
          fill: false,
        },
        {
          label: 'שקילה',
          data: raw,
          showLine: false,
          pointRadius: 3,
          pointHoverRadius: 5,
          pointBackgroundColor: colors.muted,
          pointBorderColor: colors.muted,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: colors.tooltipBg,
          titleColor: colors.text,
          bodyColor: colors.text,
          titleFont: { family: 'Rubik' },
          bodyFont: { family: 'Rubik' },
          padding: 10,
          filter: (item) => item.parsed.y !== null,
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${kg(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Rubik', size: 11 }, color: colors.muted, maxTicksLimit: 6, maxRotation: 0 },
        },
        y: {
          grid: { color: colors.grid },
          ticks: { font: { family: 'Oswald', size: 11 }, color: colors.muted, maxTicksLimit: 5 },
        },
      },
    },
  });
}

// Shared look for the cardio charts below: no legend, themed tooltip, one
// recessive y grid.
function cardioChartOptions(colors, { yTicks, reverseY = false, tooltipLabel }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: colors.tooltipBg,
        titleColor: colors.text,
        bodyColor: colors.text,
        titleFont: { family: 'Rubik' },
        bodyFont: { family: 'Rubik' },
        padding: 10,
        callbacks: { label: tooltipLabel },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { family: 'Rubik', size: 11 }, color: colors.muted, maxTicksLimit: 8, maxRotation: 0 },
      },
      y: {
        reverse: reverseY,
        grid: { color: colors.grid },
        beginAtZero: !reverseY,
        ticks: { font: { family: 'Oswald', size: 11 }, color: colors.muted, maxTicksLimit: 5, callback: yTicks },
      },
    },
  };
}

// Cardio minutes per week — bars, the current week in the accent colour.
export async function renderCardioWeeksChart(canvas, { labels, minutes }, existingChart) {
  const Chart = await loadChartLib();
  if (existingChart) existingChart.destroy();
  const colors = themeColors();
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: minutes,
        backgroundColor: minutes.map((_, i) => (i === minutes.length - 1 ? accent : colors.line)),
        borderRadius: 4,
        maxBarThickness: 28,
      }],
    },
    options: cardioChartOptions(colors, {
      yTicks: (v) => v,
      tooltipLabel: (ctx) => `${ctx.parsed.y} דק'`,
    }),
  });
}

// Average pace per workout (seconds per km), y reversed so a faster pace
// sits higher — "up is better", like every other progress chart here.
export async function renderPaceChart(canvas, { labels, paces, formatPace }, existingChart) {
  const Chart = await loadChartLib();
  if (existingChart) existingChart.destroy();
  const colors = themeColors();
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: paces,
        borderColor: colors.line,
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: colors.line,
        pointBorderColor: colors.line,
        tension: 0.2,
        fill: false,
      }],
    },
    options: cardioChartOptions(colors, {
      reverseY: true,
      yTicks: (v) => formatPace(v),
      tooltipLabel: (ctx) => `${formatPace(ctx.parsed.y)} /ק"מ`,
    }),
  });
}

// Calories per day — bars, the day shown above in the accent colour, with
// the daily target as a dashed line across. Tapping a bar calls onPick(i).
export async function renderCaloriesChart(canvas, { labels, calories, proteins, target, selectedIndex, onPick }, existingChart) {
  const Chart = await loadChartLib();
  if (existingChart) existingChart.destroy();
  const colors = themeColors();
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const options = cardioChartOptions(colors, {
    yTicks: (v) => v,
    tooltipLabel: (ctx) => {
      const i = ctx.dataIndex;
      return calories[i] ? `${calories[i]} קל' · חלבון ${proteins[i]}g` : 'לא נרשם';
    },
  });
  options.plugins.tooltip.filter = (item) => item.datasetIndex === 0; // not the target line
  options.interaction = { mode: 'index', intersect: false };
  options.onClick = (evt, _els, chart) => {
    const hit = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false)[0];
    // Deferred: picking re-renders the screen, destroying this chart — which
    // mustn't happen while Chart.js is still inside its own click handling.
    if (hit) setTimeout(() => onPick?.(hit.index), 0);
  };
  return new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          data: calories,
          backgroundColor: calories.map((_, i) => (i === selectedIndex ? accent : colors.line)),
          borderRadius: 4,
          maxBarThickness: 28,
          order: 2,
        },
        {
          type: 'line',
          data: labels.map(() => target),
          borderColor: colors.muted,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 1,
        },
      ],
    },
    options,
  });
}
