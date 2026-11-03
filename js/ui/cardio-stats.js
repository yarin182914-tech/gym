// "אירובי" — the Dashboard's cardio card: minutes per week over the last
// WEEKS weeks, and the average-pace trend for walking or running.
//
// Mounted into its own host, like the body-weight card; renders nothing
// at all until there's a cardio workout to show.

import { renderCardioWeeksChart, renderPaceChart } from '../lib/charts.js';
import { summarizeSegments, formatClock, cardioActivity } from '../lib/cardio.js';
import { toDate, formatDayMonthHe } from '../lib/format.js';
import { toggleGroup, patchToggleGroup } from './toggle-group.js';
import { statTile } from './stat-tile.js';

const WEEKS = 8;
const PACE_POINTS = 20; // most recent workouts on the pace chart
const PACED_ACTIVITIES = ['run', 'walk'];
let paceActivity = null; // kept across visits, like the other Dashboard toggles

// Sunday 00:00 of `d`'s week — the Israeli week.
function weekStart(d) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s;
}

// workouts: listWorkouts(), newest first.
export function mountCardioStats(host, workouts) {
  let weeksChart = null;
  let paceChart = null;

  // One entry per cardio exercise, oldest first.
  const entries = [];
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (ex.kind === 'cardio') entries.push({ date: toDate(w.date), activity: ex.activity, totals: summarizeSegments(ex.sets) });
    }
  }
  entries.reverse();

  function render() {
    if (entries.length === 0) {
      host.innerHTML = '';
      return;
    }

    const thisWeek = weekStart(new Date());
    const starts = Array.from({ length: WEEKS }, (_, i) => {
      const d = new Date(thisWeek);
      d.setDate(d.getDate() - (WEEKS - 1 - i) * 7);
      return d.getTime();
    });
    const minutes = starts.map(() => 0);
    let weekKm = 0;
    for (const e of entries) {
      const i = starts.indexOf(weekStart(e.date).getTime());
      if (i < 0) continue;
      minutes[i] += e.totals.durationSec / 60;
      if (i === WEEKS - 1) weekKm += e.totals.distanceKm;
    }
    const rounded = minutes.map((m) => Math.round(m));
    // Averaged only over weeks since cardio started being logged, so a
    // two-week-old habit isn't diluted by six empty weeks before it.
    const firstWeek = Math.max(0, starts.indexOf(weekStart(entries[0].date).getTime()));
    const counted = rounded.slice(firstWeek);
    const avgWeek = Math.round(counted.reduce((s, m) => s + m, 0) / counted.length);

    const paced = Object.fromEntries(PACED_ACTIVITIES.map((a) => [
      a, entries.filter((e) => e.activity === a && e.totals.avgPaceSec).slice(-PACE_POINTS),
    ]));
    // Whichever has the latest paced workout, unless one was picked.
    const available = PACED_ACTIVITIES
      .filter((a) => paced[a].length)
      .sort((a, b) => paced[b].at(-1).date - paced[a].at(-1).date);
    if (!available.includes(paceActivity)) paceActivity = available[0] || null;
    const pacePoints = paceActivity ? paced[paceActivity] : [];
    const fastest = pacePoints.reduce((best, p) => Math.min(best, p.totals.avgPaceSec), Infinity);

    host.innerHTML = `
      <div class="card">
        <h2 style="margin-bottom:10px;">אירובי</h2>
        <div class="row" style="gap:8px; margin-bottom:14px;">
          ${statTile(`${rounded.at(-1)}<span class="stat-unit">דק'</span>`, 'השבוע')}
          ${statTile(`${avgWeek}<span class="stat-unit">דק'</span>`, 'ממוצע לשבוע')}
          ${statTile(weekKm ? `${Math.round(weekKm * 10) / 10}<span class="stat-unit">ק"מ</span>` : '—', 'מרחק השבוע')}
        </div>
        <div class="cardio-chart-label">דקות בשבוע</div>
        <div style="height:150px;"><canvas data-cardio-weeks aria-label="דקות אירובי בשבוע"></canvas></div>
        ${paceActivity ? `
          <div class="row" style="margin:18px 0 6px; gap:8px; flex-wrap:wrap;">
            <div class="cardio-chart-label" style="margin:0;">קצב ממוצע</div>
            ${available.length > 1 ? toggleGroup({
              name: 'pace-activity',
              active: paceActivity,
              label: 'פעילות',
              groupAttrs: 'data-pace-group',
              options: available.map((a) => ({ value: a, label: cardioActivity(a).name })),
            }) : `<span class="text-muted" style="font-size:var(--text-sm);">${cardioActivity(paceActivity).name}</span>`}
          </div>
          <p class="cardio-pace-headline">אחרון <span class="num">${formatClock(pacePoints.at(-1).totals.avgPaceSec)}</span> · הכי מהיר <span class="num">${formatClock(fastest)}</span> /ק"מ</p>
          <div style="height:170px;"><canvas data-cardio-pace aria-label="מגמת קצב"></canvas></div>` : ''}
      </div>`;

    const group = host.querySelector('[data-pace-group]');
    if (group) {
      group.classList.add('toggle-group--live');
      patchToggleGroup(group, paceActivity);
      group.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          paceActivity = btn.dataset.paceActivity;
          render();
        });
      });
    }

    // Both charts load the library on demand; a canvas that's gone by the
    // time it resolves (re-rendered, or the screen was left) is dropped.
    const weeksCanvas = host.querySelector('[data-cardio-weeks]');
    const prevWeeks = weeksChart;
    weeksChart = null;
    renderCardioWeeksChart(weeksCanvas, {
      labels: starts.map((t) => formatDayMonthHe(new Date(t))),
      minutes: rounded,
    }, prevWeeks).then((c) => {
      if (weeksCanvas.isConnected) weeksChart = c;
      else c.destroy();
    }).catch((err) => console.error('[cardio] weeks chart failed', err));

    const paceCanvas = host.querySelector('[data-cardio-pace]');
    const prevPace = paceChart;
    paceChart = null;
    if (!paceCanvas) {
      prevPace?.destroy();
      return;
    }
    renderPaceChart(paceCanvas, {
      labels: pacePoints.map((p) => formatDayMonthHe(p.date)),
      paces: pacePoints.map((p) => Math.round(p.totals.avgPaceSec)),
      formatPace: formatClock,
    }, prevPace).then((c) => {
      if (paceCanvas.isConnected) paceChart = c;
      else c.destroy();
    }).catch((err) => console.error('[cardio] pace chart failed', err));
  }

  render();
  return {
    redraw: render,
    destroy() {
      weeksChart?.destroy();
      paceChart?.destroy();
      weeksChart = null;
      paceChart = null;
    },
  };
}
