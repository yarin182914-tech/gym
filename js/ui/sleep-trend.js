// "מגמה" on the שינה screen: hours per night against the minimum, and
// bedtime against the target, over the last 14 or 30 nights. Missed nights
// are faded, never red.

import { renderSleepHoursChart, renderBedtimeChart } from '../lib/charts.js';
import { sleepSeries, clockFromMinutesAfterSix, parseKey } from '../lib/sleep.js';
import { toggleGroup, patchToggleGroup } from './toggle-group.js';
import { statTile } from './stat-tile.js';
import { emptyState } from './empty-state.js';

const RANGES = [{ value: '14', label: 'שבועיים' }, { value: '30', label: 'חודש' }];
let range = '14'; // kept across visits

export function mountSleepTrend(host, { getNights, getSettings, today }) {
  let hoursChart = null;
  let bedChart = null;

  function destroy() {
    hoursChart?.destroy();
    bedChart?.destroy();
    hoursChart = null;
    bedChart = null;
  }

  function render() {
    destroy();
    const settings = getSettings();
    const s = sleepSeries(getNights(), settings, today(), Number(range));
    if (!s.logged) {
      host.innerHTML = `<div class="card"><h2 style="margin-bottom:8px;">מגמה</h2>${emptyState('אחרי כמה לילות רשומים יופיעו כאן גרפים.')}</div>`;
      return;
    }
    const labels = s.keys.map((k) => { const d = parseKey(k); return `${d.getDate()}.${d.getMonth() + 1}`; });
    host.innerHTML = `
      <div class="card sleep-trend">
        <div class="row" style="margin-bottom:10px; gap:8px; flex-wrap:wrap;">
          <h2 style="margin:0;">מגמה</h2>
          ${toggleGroup({ name: 'sl-range', active: range, label: 'טווח', groupAttrs: 'data-sl-range', options: RANGES })}
        </div>
        <div class="row" style="gap:8px; margin-bottom:14px;">
          ${statTile(s.avgHours ?? '—', 'ממוצע שעות')}
          ${statTile(`${s.onTarget}/${s.logged}`, `לילות של ${settings.sleepMinHours}+ שעות`)}
        </div>
        <h3 class="sleep-trend-sub">שעות שינה</h3>
        <div style="height:170px;"><canvas data-sl-hours aria-label="גרף שעות שינה"></canvas></div>
        <h3 class="sleep-trend-sub">שעת הירדמות</h3>
        <div style="height:170px;"><canvas data-sl-bed aria-label="גרף שעת הירדמות"></canvas></div>
        <p class="text-muted sleep-trend-note">קו מקווקו = היעד · עיגול ריק = לילה גמיש</p>
      </div>`;
    const group = host.querySelector('[data-sl-range]');
    group.classList.add('toggle-group--live');
    patchToggleGroup(group, range);
    group.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
      range = btn.dataset.slRange;
      render();
    }));

    const hCanvas = host.querySelector('[data-sl-hours]');
    renderSleepHoursChart(hCanvas, { labels, hours: s.hours, minHours: settings.sleepMinHours })
      .then((c) => { if (hCanvas.isConnected) hoursChart = c; else c.destroy(); })
      .catch((err) => console.error('[sleep] chart failed', err));
    const bCanvas = host.querySelector('[data-sl-bed]');
    renderBedtimeChart(bCanvas, {
      labels, minutes: s.bed, targets: s.target, flexible: s.flexible, formatClock: clockFromMinutesAfterSix,
    })
      .then((c) => { if (bCanvas.isConnected) bedChart = c; else c.destroy(); })
      .catch((err) => console.error('[sleep] chart failed', err));
  }

  render();
  return { redraw: render, destroy };
}
