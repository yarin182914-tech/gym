// "סוגי אימון" — the progress screen's card per workout type (deferred
// from M3b to M4): sessions per week over the last WEEKS weeks, the average
// effort, and the results — CrossFit's best per WOD, functional's best
// rounds per format, otherwise the latest sessions. Renders nothing until
// there's a session (js/lib/workout-types.js).

import { esc } from '../core/dom.js';
import { renderBarsChart } from '../lib/charts.js';
import { toDate, formatDayMonthHe } from '../lib/format.js';
import { exerciseKind, resolveType, sessionSummary } from '../lib/workout-types.js';
import { statTile } from './stat-tile.js';

const WEEKS = 8;
let selected = null; // kept across visits

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function weekStartMs(d) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay());
  return s.getTime();
}

// The best results of a type, newest records first: [{ label, text, date }].
export function typeResults(typeId, sessions) {
  const best = new Map();
  for (const { date, ex } of sessions) {
    const f = ex.fields || {};
    let key = null;
    let score = null;
    let text = '';
    if (typeId === 'crossfit' && f.wod && f.format === 'For Time' && f.resultSec) {
      key = `${f.wod.trim()} · For Time`;
      score = -f.resultSec;
      text = clock(f.resultSec);
    } else if (typeId === 'crossfit' && f.wod && f.format === 'AMRAP' && (f.resultRounds || f.resultReps)) {
      key = `${f.wod.trim()} · AMRAP`;
      score = (f.resultRounds || 0) * 1000 + (f.resultReps || 0);
      text = `${f.resultRounds || 0} סבבים${f.resultReps ? ` + ${f.resultReps}` : ''}`;
    } else if (typeId === 'functional' && f.format && f.rounds) {
      key = f.format;
      score = f.rounds;
      text = `${f.rounds} סבבים`;
    }
    if (key && (!best.has(key) || score > best.get(key).score)) best.set(key, { label: key, text, score, date });
  }
  return [...best.values()].sort((a, b) => b.date - a.date);
}

export function mountWorkoutTypeStats(host, workouts, customTypes = []) {
  let chart = null;
  // Every session, oldest first: { date, ex }.
  const sessions = [];
  for (const w of workouts || []) {
    for (const ex of w.exercises || []) if (exerciseKind(ex) === 'session') sessions.push({ date: toDate(w.date), ex });
  }
  sessions.sort((a, b) => a.date - b.date);
  const typeIds = [...new Set(sessions.map((s) => s.ex.typeId))];

  function render() {
    chart?.destroy();
    chart = null;
    if (!sessions.length) {
      host.innerHTML = '';
      return;
    }
    if (!typeIds.includes(selected)) selected = sessions.at(-1).ex.typeId;
    const mine = sessions.filter((s) => s.ex.typeId === selected);
    const type = resolveType(selected, customTypes, mine.at(-1).ex.name);

    const thisWeek = weekStartMs(new Date());
    const starts = Array.from({ length: WEEKS }, (_, i) => thisWeek - (WEEKS - 1 - i) * 7 * 86400000);
    const perWeek = starts.map(() => 0);
    for (const s of mine) {
      const i = starts.findIndex((t) => Math.abs(t - weekStartMs(s.date)) < 86400000 * 0.5);
      if (i >= 0) perWeek[i] += 1;
    }
    const rpes = mine.filter((s) => s.ex.rpe).map((s) => s.ex.rpe);
    const avgRpe = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : '—';
    const results = typeResults(selected, mine);
    const latest = mine.slice(-4).reverse();

    host.innerHTML = `
      <div class="card">
        <h2 style="margin-bottom:10px;">סוגי אימון</h2>
        ${typeIds.length > 1 ? `<div class="pill-row">${typeIds.map((id) => {
          const name = resolveType(id, customTypes, sessions.find((s) => s.ex.typeId === id).ex.name).name;
          return `<button type="button" class="pill${id === selected ? ' active' : ''}" data-type="${esc(id)}">${esc(name)}</button>`;
        }).join('')}</div>` : ''}
        <div class="row" style="gap:8px; margin:8px 0 14px;">
          ${statTile(mine.length, 'אימונים')}
          ${statTile(perWeek.at(-1), 'השבוע')}
          ${statTile(avgRpe, 'מאמץ ממוצע')}
        </div>
        <div style="height:150px;"><canvas data-type-chart></canvas></div>
        ${results.length ? `
          <div class="pill-row-label" style="margin-top:12px;">שיאים</div>
          <div class="sets-list-view">
            ${results.map((r) => `
              <div class="sets-list-row session-detail-row">
                <span class="sets-list-type">${esc(r.label)}</span>
                <span class="sets-list-weight num">${esc(r.text)}</span>
              </div>`).join('')}
          </div>` : `
          <div class="pill-row-label" style="margin-top:12px;">אחרונים</div>
          <div class="sets-list-view">
            ${latest.map((s) => `
              <div class="sets-list-row session-detail-row">
                <span class="sets-list-type">${esc(formatDayMonthHe(s.date))}</span>
                <span class="sets-list-weight">${esc(sessionSummary(s.ex, type) || '—')}</span>
              </div>`).join('')}
          </div>`}
      </div>`;

    host.querySelectorAll('[data-type]').forEach((btn) => btn.addEventListener('click', () => {
      selected = btn.dataset.type;
      render();
    }));
    renderBarsChart(host.querySelector('[data-type-chart]'), {
      labels: starts.map((t) => formatDayMonthHe(new Date(t))),
      values: perWeek,
      // Whole sessions only — no "0.5" on the axis.
      formatValue: (v) => (Number.isInteger(v) ? `${v}` : ''),
    }).then((c) => { chart = c; }).catch((err) => console.error('[type-stats] chart failed', err));
  }

  render();
  return {
    destroy() {
      chart?.destroy();
      chart = null;
    },
    redraw: render,
  };
}
