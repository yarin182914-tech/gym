// Nutrition's "מגמה" card, under the meal list: calories per day for the
// last week or month against the daily target, plus the average calories
// and protein and how many days were logged. Tapping a bar shows that day
// in the screen above.
//
// Averages count only days with something logged — a day that wasn't
// logged isn't a day of eating nothing — and leave out today, which is
// still in progress, unless it's the only day there is.

import { renderCaloriesChart } from '../lib/charts.js';
import { toDate, dateInputValue, parseDateInputValue, formatDayMonthHe } from '../lib/format.js';
import { todayKey, shiftKey } from '../lib/body-weight.js';
import { toggleGroup, patchToggleGroup } from './toggle-group.js';
import { statTile } from './stat-tile.js';
import { emptyState } from './empty-state.js';

const RANGES = [
  { value: '7', label: 'שבוע' },
  { value: '30', label: 'חודש' },
];
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
let range = '7'; // kept across visits, like the body-weight card's range

// entries: every loaded meal; targetFor(key): that day's calorie target;
// selectedDay: the day the screen shows; onPickDay(key): a bar was tapped.
// Returns { destroy }.
export function mountNutritionTrend(host, { entries, targetFor, selectedDay, onPickDay }) {
  let chart = null;

  function render() {
    const days = Number(range);
    const end = todayKey();
    const keys = [];
    for (let k = shiftKey(end, -(days - 1)); k <= end; k = shiftKey(k, 1)) keys.push(k);

    const byDay = new Map(keys.map((k) => [k, { calories: 0, proteinG: 0, count: 0 }]));
    for (const e of entries) {
      const day = byDay.get(dateInputValue(toDate(e.date)));
      if (!day) continue;
      day.calories += e.calories || 0;
      day.proteinG += e.proteinG || 0;
      day.count += 1;
    }

    const logged = keys.filter((k) => byDay.get(k).count > 0);
    const averaged = logged.length > 1 ? logged.filter((k) => k !== end) : logged;
    const avg = (field) => (averaged.length
      ? Math.round(averaged.reduce((s, k) => s + byDay.get(k)[field], 0) / averaged.length)
      : null);

    host.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:10px; gap:8px; flex-wrap:wrap;">
          <h3 style="color:var(--text); margin:0;">מגמה</h3>
          ${toggleGroup({ name: 'nut-range', active: range, label: 'טווח', groupAttrs: 'data-nut-range-group', options: RANGES })}
        </div>
        ${logged.length === 0
          ? emptyState(`לא נרשמו ארוחות ב-${days} הימים האחרונים.`)
          : `<div style="height:180px;"><canvas data-nut-canvas aria-label="קלוריות ליום"></canvas></div>
             <div class="row" style="margin-top:14px; gap:8px;">
               ${statTile(avg('calories') ?? '—', "ממוצע קל'")}
               ${statTile(avg('proteinG') === null ? '—' : `${avg('proteinG')}g`, 'ממוצע חלבון')}
               ${statTile(`${logged.length}/${days}`, 'ימים מתועדים')}
             </div>`}
      </div>`;

    const group = host.querySelector('[data-nut-range-group]');
    group.classList.add('toggle-group--live');
    patchToggleGroup(group, range);
    group.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        range = btn.dataset.nutRange;
        render();
      });
    });

    const canvas = host.querySelector('[data-nut-canvas]');
    const pending = chart;
    chart = null;
    if (!canvas) {
      pending?.destroy();
      return;
    }
    // The chart library loads on demand, so this resolves later — by then
    // the canvas may be gone (re-rendered or left the screen).
    renderCaloriesChart(canvas, {
      labels: keys.map((k) => (days === 7 ? WEEKDAYS[parseDateInputValue(k).getDay()] : formatDayMonthHe(parseDateInputValue(k)))),
      calories: keys.map((k) => Math.round(byDay.get(k).calories)),
      proteins: keys.map((k) => Math.round(byDay.get(k).proteinG)),
      targets: keys.map(targetFor),
      selectedIndex: keys.indexOf(selectedDay),
      onPick: (i) => onPickDay(keys[i]),
    }, pending).then((c) => {
      if (canvas.isConnected) chart = c;
      else c.destroy();
    }).catch((err) => console.error('[nutrition] chart failed to render', err));
  }

  render();
  return {
    destroy() {
      chart?.destroy();
      chart = null;
    },
  };
}
