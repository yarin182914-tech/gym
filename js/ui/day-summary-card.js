// "סגירת יום" — yesterday's points at the top of "היום", the first time the
// app opens after the day ended (calories and protein are only scored
// then). One line ("אתמול · +140 נק׳") that opens to the points, line by
// line (M14a). Shown once: closing it notes the day in
// users/{uid}.rewardsSeen.daySummary.

import { esc } from '../core/dom.js';
import { icon } from './icon.js';

const SOURCE_ORDER = ['sleep', 'habit', 'meal', 'nutrition', 'weight', 'workout', 'bonus'];
const SOURCE_ICON = { sleep: 'moon', habit: 'check', meal: 'utensils', nutrition: 'target', weight: 'weight', workout: 'dumbbell', bonus: 'sparkles', task: 'list-checks', decision: 'split' };

// The card's markup for that day's entries, or '' with none. open: the
// lines are showing. The screen wires [data-day-summary-toggle] and
// [data-day-summary-close].
export function daySummaryHtml(ledger, dayKey, { open = false } = {}) {
  const entries = (ledger || [])
    .filter((e) => e.date === dayKey && e.points > 0)
    .sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source));
  if (!entries.length) return '';
  const total = entries.reduce((s, e) => s + e.points, 0);
  const perfect = entries.some((e) => e.rule === 'perfect-day');
  return `
    <section class="card day-summary${perfect ? ' day-summary--perfect' : ''}${open ? ' day-summary--open' : ''}" aria-label="סיכום אתמול">
      <div class="day-summary-head">
        <button type="button" class="day-summary-toggle" data-day-summary-toggle aria-expanded="${open}">
          <span class="day-summary-title">${perfect ? `${icon('sparkles', { className: 'icon--sm' })} יום מושלם אתמול` : 'אתמול'}</span>
          <span class="day-summary-total"><span class="num" dir="ltr">+${total.toLocaleString('he-IL')}</span> נק׳</span>
          ${icon('chevron-down', { className: 'icon--sm day-summary-chevron' })}
        </button>
        <button type="button" class="set-more-btn" data-day-summary-close aria-label="סגירת הסיכום">${icon('x', { className: 'icon--sm' })}</button>
      </div>
      ${open ? `
      <ul class="day-summary-list">
        ${entries.map((e) => `
          <li>
            <span class="day-summary-icon">${icon(SOURCE_ICON[e.source] || 'check', { className: 'icon--sm' })}</span>
            <span class="day-summary-reason">${esc(e.reason || '')}</span>
            <span class="day-summary-points num" dir="ltr">+${e.points}</span>
          </li>`).join('')}
      </ul>` : ''}
    </section>`;
}
