// "סגירת יום" — yesterday's points, line by line, at the top of "היום" the
// first time the app opens after the day ended (calories and protein are
// only scored then). Shown once: closing it notes the day in
// users/{uid}.rewardsSeen.daySummary.

import { esc } from '../core/dom.js';
import { icon } from './icon.js';

const SOURCE_ORDER = ['sleep', 'habit', 'meal', 'nutrition', 'weight', 'workout', 'bonus'];
const SOURCE_ICON = { sleep: 'moon', habit: 'check', meal: 'utensils', nutrition: 'target', weight: 'weight', workout: 'dumbbell', bonus: 'sparkles', task: 'list-checks', decision: 'split' };

// The card's markup for that day's entries, or '' with none.
export function daySummaryHtml(ledger, dayKey) {
  const entries = (ledger || [])
    .filter((e) => e.date === dayKey && e.points > 0)
    .sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));
  if (!entries.length) return '';
  const total = entries.reduce((s, e) => s + e.points, 0);
  const perfect = entries.some((e) => e.rule === 'perfect-day');
  return `
    <section class="card day-summary${perfect ? ' day-summary--perfect' : ''}" aria-label="סיכום אתמול">
      <div class="day-summary-head">
        <h2 class="day-summary-title">${perfect ? `${icon('sparkles', { className: 'icon--sm' })} יום מושלם` : 'סיכום אתמול'}</h2>
        <span class="day-summary-total num" dir="ltr">+${total}</span>
        <button type="button" class="set-more-btn" data-day-summary-close aria-label="סגירת הסיכום">${icon('x', { className: 'icon--sm' })}</button>
      </div>
      <ul class="day-summary-list">
        ${entries.map((e) => `
          <li>
            <span class="day-summary-icon">${icon(SOURCE_ICON[e.source] || 'check', { className: 'icon--sm' })}</span>
            <span class="day-summary-reason">${esc(e.reason || '')}</span>
            <span class="day-summary-points num" dir="ltr">+${e.points}</span>
          </li>`).join('')}
      </ul>
    </section>`;
}
