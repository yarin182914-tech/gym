// Thin wrapper around Chart.js (loaded globally via CDN <script> in index.html)
// tuned to this app's design tokens and the dataviz method: one axis, thin
// navy line, selective direct labels (first/last/PR only), gold PR markers,
// hover tooltip by default, recessive gridlines.

const NAVY = '#1E3A63';
const GOLD = '#C9962C';
const MUTED = '#5E6B80';
const GRID = '#DCE3EC';
const TEXT = '#16233B';

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
        ctx.font = "600 11px 'Roboto Slab', serif";
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

// labels: x-axis labels (dates). values: numeric y per point (already the
// single chosen metric — weight OR volume, never both at once, per the
// one-axis rule). prFlags: parallel boolean array marking new-PR points.
export async function renderProgressChart(canvas, { labels, values, prFlags, formatValue = (v) => String(v) }, existingChart) {
  const Chart = await loadChartLib();
  if (existingChart) existingChart.destroy();

  const pointColors = values.map((_, i) => (prFlags[i] ? GOLD : NAVY));

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: NAVY,
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
          backgroundColor: TEXT,
          titleFont: { family: 'Assistant' },
          bodyFont: { family: 'Roboto Slab' },
          padding: 10,
          callbacks: {
            label: (ctx) => formatValue(ctx.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Assistant', size: 11 }, color: MUTED },
        },
        y: {
          grid: { color: GRID },
          ticks: { font: { family: 'Roboto Slab', size: 11 }, color: MUTED },
        },
      },
    },
    plugins: [selectiveLabelsPlugin(values, prFlags, formatValue)],
  });
}
