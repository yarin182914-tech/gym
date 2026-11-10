// The progress screen's "מעקב" tab (M4): one row per tracked area with
// this week as 7 dots, or this month as a heat-grid; tap a row for its last
// 30 days as a chart. "מה אני עוקב אחריו" picks the rows, their order and
// the weekly workout goal (users/{uid}.trackedRows, .weeklyWorkoutGoal).
// A miss is grey, never red. Row logic: js/lib/progress.js.

import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { openBottomSheet } from './bottom-sheet.js';
import { toggleGroup } from './toggle-group.js';
import { stepper } from './stepper.js';
import { showToast } from './toast.js';
import { renderBarsChart } from '../lib/charts.js';
import { formatDayMonthHe } from '../lib/format.js';
import { parseKey } from '../lib/sleep.js';
import { updateUserSettings } from '../lib/firestore.js';
import { requestRewardsSync } from '../lib/rewards-sync.js';
import {
  allRows, visibleRows, dayCell, weekDays, monthGrid, rowSummary, rowSeries, formatRowValue,
} from '../lib/progress.js';

const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
let view = 'week'; // kept across visits, like the other progress toggles

export function mountProgressRows(host, { ctx, today, userDoc }) {
  let openRow = null;
  let chart = null;
  let tracked = userDoc.trackedRows || {};

  const cellHtml = (row, key) => {
    if (!key) return '<span class="progress-cell progress-cell--blank"></span>';
    const { status } = dayCell(row, key, ctx, today);
    const day = parseKey(key).getDate();
    return `<span class="progress-cell progress-cell--${status}${key === today ? ' progress-cell--today' : ''}" title="${esc(formatDayMonthHe(parseKey(key)))}">${view === 'month' ? `<span class="num">${day}</span>` : ''}</span>`;
  };

  function render() {
    chart?.destroy();
    chart = null;
    const rows = visibleRows(ctx, tracked);
    const days = view === 'week' ? weekDays(today) : monthGrid(today);
    host.innerHTML = `
      <div class="progress-rows-head">
        ${toggleGroup({
          name: 'pview',
          active: view,
          label: 'תצוגה',
          groupAttrs: 'data-pview',
          options: [{ value: 'week', label: 'שבוע' }, { value: 'month', label: 'חודש' }],
        })}
        <button type="button" class="btn-mini-dashed" data-track-edit>${icon('settings', { className: 'icon--sm' })} מה אני עוקב אחריו</button>
      </div>
      <div class="card progress-rows">
        ${view === 'week' ? `<div class="progress-row-days" aria-hidden="true">${WEEKDAY_LETTERS.map((l) => `<span>${l}</span>`).join('')}</div>` : ''}
        ${rows.length ? '' : '<p class="text-muted" style="margin:0;">אין שורות — בחרו מה לעקוב.</p>'}
        ${rows.map((row) => `
          <div class="progress-row${openRow === row.id ? ' progress-row--open' : ''}">
            <button type="button" class="progress-row-head" data-row="${esc(row.id)}" aria-expanded="${openRow === row.id}">
              <span class="progress-row-icon">${icon(row.icon, { className: 'icon--sm' })}</span>
              <span class="progress-row-text">
                <span class="progress-row-name">${esc(row.name)}</span>
                <span class="progress-row-sub text-muted">${esc(rowSummary(row, days, ctx, today))}</span>
              </span>
              ${view === 'week' ? `<span class="progress-week">${days.map((k) => cellHtml(row, k)).join('')}</span>` : ''}
            </button>
            ${view === 'month' ? `<div class="progress-month">${WEEKDAY_LETTERS.map((l) => `<span class="progress-month-head">${l}</span>`).join('')}${days.map((k) => cellHtml(row, k)).join('')}</div>` : ''}
            ${openRow === row.id ? '<div class="progress-row-chart"><canvas data-row-chart></canvas></div>' : ''}
          </div>`).join('')}
        <p class="progress-legend text-muted">
          <span class="progress-cell progress-cell--full"></span> ביעד
          <span class="progress-cell progress-cell--close"></span> קרוב
          <span class="progress-cell progress-cell--miss"></span> פספוס
        </p>
      </div>`;

    host.querySelectorAll('[data-pview] button').forEach((btn) => btn.addEventListener('click', () => {
      view = btn.dataset.pview;
      render();
    }));
    host.querySelector('[data-track-edit]').addEventListener('click', editTracked);
    host.querySelectorAll('[data-row]').forEach((btn) => btn.addEventListener('click', () => {
      openRow = openRow === btn.dataset.row ? null : btn.dataset.row;
      render();
    }));
    const canvas = host.querySelector('[data-row-chart]');
    const row = rows.find((r) => r.id === openRow);
    if (canvas && row) {
      const { keys, values } = rowSeries(row, today, ctx);
      if (!values.some((v) => v)) {
        canvas.parentElement.innerHTML = '<p class="text-muted progress-row-empty">עוד אין נתונים ב-30 הימים האחרונים.</p>';
        return;
      }
      renderBarsChart(canvas, {
        labels: keys.map((k) => formatDayMonthHe(parseKey(k))),
        values,
        formatValue: (v) => formatRowValue(row, v),
      }).then((c) => { chart = c; }).catch((err) => console.error('[progress] chart failed', err));
    }
  }

  // Which rows show, in what order, and the weekly workout goal.
  function editTracked() {
    const all = allRows(ctx);
    let order = visibleRows(ctx, { order: tracked.order }).map((r) => r.id);
    const hidden = new Set(tracked.hidden || []);
    let goal = ctx.workoutGoal;
    openBottomSheet({
      ariaLabel: 'מה אני עוקב אחריו',
      render(body, sheetApi) {
        const draw = () => {
          body.innerHTML = `
            <h3 style="margin:0 0 4px; color:var(--text);">מה אני עוקב אחריו</h3>
            <p class="text-muted" style="margin:0 0 10px; font-size:0.85rem;">השורות שבמסך ההתקדמות, בסדר שלך.</p>
            <div class="settings-list track-list">
              ${order.map((id, i) => {
                const row = all.find((r) => r.id === id);
                return `
                <div class="track-item">
                  <label class="track-check">
                    <input type="checkbox" data-track="${esc(id)}" ${hidden.has(id) ? '' : 'checked'}>
                    ${icon(row.icon, { className: 'icon--sm' })}
                    <span>${esc(row.name)}</span>
                  </label>
                  <button type="button" class="set-more-btn" data-move="${i}:-1" aria-label="למעלה" ${i === 0 ? 'disabled' : ''}>${icon('arrow-up', { className: 'icon--sm' })}</button>
                  <button type="button" class="set-more-btn" data-move="${i}:1" aria-label="למטה" ${i === order.length - 1 ? 'disabled' : ''}>${icon('arrow-down', { className: 'icon--sm' })}</button>
                </div>`;
              }).join('')}
            </div>
            <div class="sheet-field-label">יעד אימונים שבועי</div>
            <div class="track-goal">
              ${stepper({ decAttrs: 'type="button" data-goal="-1" aria-label="פחות"', incAttrs: 'type="button" data-goal="1" aria-label="יותר"', value: goal })}
              <span class="text-muted">ימי אימון בשבוע · בונוס כשמגיעים</span>
            </div>
            <div class="sheet-actions">
              <button type="button" class="btn btn-secondary" data-track-cancel>ביטול</button>
              <button type="button" class="btn btn-primary" data-track-save>שמירה</button>
            </div>`;
          body.querySelectorAll('[data-track]').forEach((cb) => cb.addEventListener('change', () => {
            if (cb.checked) hidden.delete(cb.dataset.track);
            else hidden.add(cb.dataset.track);
          }));
          body.querySelectorAll('[data-move]').forEach((btn) => btn.addEventListener('click', () => {
            const [i, d] = btn.dataset.move.split(':').map(Number);
            [order[i], order[i + d]] = [order[i + d], order[i]];
            order = [...order];
            draw();
          }));
          body.querySelectorAll('[data-goal]').forEach((btn) => btn.addEventListener('click', () => {
            goal = Math.min(7, Math.max(1, goal + Number(btn.dataset.goal)));
            draw();
          }));
          body.querySelector('[data-track-cancel]').addEventListener('click', () => sheetApi.close());
          body.querySelector('[data-track-save]').addEventListener('click', () => {
            tracked = { order, hidden: [...hidden] };
            userDoc.trackedRows = tracked;
            const goalChanged = goal !== ctx.workoutGoal;
            ctx.workoutGoal = goal;
            userDoc.weeklyWorkoutGoal = goal;
            updateUserSettings({ trackedRows: tracked, weeklyWorkoutGoal: goal })
              .then(() => { if (goalChanged) requestRewardsSync(0); })
              .catch(() => showToast('השמירה נכשלה — נסה שוב'));
            sheetApi.close();
            render();
          });
        };
        draw();
      },
    });
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
