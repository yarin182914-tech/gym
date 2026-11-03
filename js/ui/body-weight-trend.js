// "משקל גוף" — the Dashboard's body-weight card: the 7-day-average trend
// over the daily weigh-ins, plus the weekly and monthly change.
//
// Mounted into its own host, apart from the exercise progress below it,
// whose render() rebuilds its part of the screen on every pick and toggle.

import { renderBodyWeightChart } from '../lib/charts.js';
import { formatDayMonthHe, parseDateInputValue, round1 } from '../lib/format.js';
import { todayKey, shiftKey, trendAt, trendChange, signedKg, round2 } from '../lib/body-weight.js';
import { toggleGroup, patchToggleGroup } from './toggle-group.js';
import { statTile } from './stat-tile.js';
import { emptyState } from './empty-state.js';

const RANGES = [
  { value: '30', label: 'חודש' },
  { value: '90', label: '3 חודשים' },
  { value: 'all', label: 'הכל' },
];
let range = '30'; // kept across visits, like Dashboard's metric/view toggles

// weights: newest day first (listBodyWeights).
export function mountBodyWeightTrend(host, weights) {
  let chart = null;

  function render() {
    if (weights.length === 0) {
      host.innerHTML = `
        <div class="card">
          <h2 style="margin-bottom:8px;">משקל גוף</h2>
          ${emptyState('עוד אין שקילות — מזינים כל בוקר בראש מסך תזונה.')}
        </div>`;
      return;
    }

    const end = todayKey();
    const oldest = weights.at(-1).date;
    // Never starts before the first weigh-in — a month view of a week-old
    // habit would otherwise be three weeks of empty axis.
    let start = range === 'all' ? oldest : shiftKey(end, -(Number(range) - 1));
    if (start < oldest) start = oldest;

    const byDate = new Map(weights.map((w) => [w.date, w.kg]));
    const keys = [];
    for (let k = start; k <= end; k = shiftKey(k, 1)) keys.push(k);
    const raw = keys.map((k) => byDate.get(k) ?? null);
    const trend = keys.map((k) => {
      const t = trendAt(weights, k);
      return t === null ? null : round2(t);
    });

    const avg = trendAt(weights, end);
    const week = trendChange(weights, 7);
    const month = trendChange(weights, 30);
    const last = weights[0];

    host.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:10px; gap:8px; flex-wrap:wrap;">
          <h2 style="margin:0;">משקל גוף</h2>
          ${toggleGroup({ name: 'bw-range', active: range, label: 'טווח', groupAttrs: 'data-bw-range-group', options: RANGES })}
        </div>
        <p class="bw-trend-headline">${avg === null
          ? 'אין שקילות בשבוע האחרון'
          : `ממוצע שבועי <span class="num">${round1(avg)}</span> ק"ג`}</p>
        <div style="height:200px;"><canvas data-bw-canvas aria-label="גרף משקל גוף"></canvas></div>
        <div class="row" style="margin-top:14px; gap:8px;">
          ${statTile(last.kg, 'שקילה אחרונה')}
          ${statTile(week === null ? '—' : signedKg(week), 'שינוי שבועי')}
          ${statTile(month === null ? '—' : signedKg(month), 'שינוי חודשי')}
        </div>
      </div>`;

    const group = host.querySelector('[data-bw-range-group]');
    group.classList.add('toggle-group--live');
    patchToggleGroup(group, range);
    group.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        range = btn.dataset.bwRange;
        render();
      });
    });

    // The chart library loads on demand, so this resolves later — by then
    // the canvas may be gone (re-rendered or left the screen).
    const canvas = host.querySelector('[data-bw-canvas]');
    const pending = chart;
    chart = null;
    renderBodyWeightChart(canvas, {
      labels: keys.map((k) => formatDayMonthHe(parseDateInputValue(k))),
      raw,
      trend,
    }, pending).then((c) => {
      if (canvas.isConnected) chart = c;
      else c.destroy();
    }).catch((err) => console.error('[body-weight] chart failed to render', err));
  }

  render();
  return {
    redraw: render,
    destroy() {
      chart?.destroy();
      chart = null;
    },
  };
}
