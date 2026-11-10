// One bad habit in the "להיגמל" section of "היום" (M5), as markup: the
// clean streak and the best one, the week's chain of days, what happened
// on the chosen day, and its buttons — "מעדתי" (one tap, the time), "יום
// נקי ✓", or "כמה היום?" for a limit. The screen (js/pages/today.js) owns
// the events. Neutral colours only: a slip is grey, never red; a day
// nobody reported is an outline.

import { badDayLevel, badMark, slipsOf, cleanDaysThrough, cleanStreak, weekStart } from '../lib/habits.js';
import { shiftDays } from '../lib/sleep.js';
import { toDate } from '../lib/format.js';
import { BAD_HABITS } from '../lib/rules.js';
import { WEEKDAY_LETTERS } from './habit-wizard.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';

const fmt = (n) => Number(n).toLocaleString('he-IL');

// A slip's time on the clock in Israel, whatever the phone's zone.
export const slipClock = (t) => toDate(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });

// view: { key (the day shown), today, ctx (habitContext) }.
export function badHabitCardHtml(habit, { key, today, ctx }) {
  const mark = badMark(habit, key, ctx);
  const level = badDayLevel(habit, mark);
  const slips = slipsOf(mark);
  const { current, best, lastEnded } = cleanStreak(habit, today, ctx);

  // The streak line: the current one, or a warm word for one that just ended.
  let streakLine = '';
  if (current) {
    const days = current === 1 ? 'יום נקי אחד' : `<span class="num">${current}</span> ימים נקיים`;
    streakLine = `<span class="bad-streak">${icon('flame', { className: 'icon--sm' })}${days}</span>${best > current ? ` · <span class="text-muted">השיא שלך: <span class="num">${best}</span></span>` : ''}`;
  } else if (lastEnded && lastEnded.days >= 3 && lastEnded.end >= shiftDays(today, -BAD_HABITS.fillInDays)) {
    streakLine = `<span class="text-muted"><span class="num">${lastEnded.days}</span> ימים זה הישג. מתחילים רצף חדש</span>`;
  } else if (best) {
    streakLine = `<span class="text-muted">השיא שלך: <span class="num">${best}</span> ימים נקיים</span>`;
  }

  const start = weekStart(key);
  const chain = Array.from({ length: 7 }, (_, i) => {
    const k = shiftDays(start, i);
    const l = k > today ? 'future' : (badDayLevel(habit, badMark(habit, k, ctx)) || 'unknown');
    return `<span class="bad-day bad-day--${l}${k === key ? ' bad-day--selected' : ''}" title="${WEEKDAY_LETTERS[i]}׳"><span>${WEEKDAY_LETTERS[i]}</span></span>`;
  }).join('');

  let dayLine = '';
  if (habit.measure === 'limit' && mark?.value !== undefined && mark?.value !== null) {
    dayLine = `<span class="num">${fmt(mark.value)}</span> ${esc(habit.unit)}${level === 'full' ? ' · בתוך המגבלה' : ''}`;
  } else if (slips.length) {
    dayLine = `${slips.length === 1 ? 'מעידה אחת' : `${slips.length} מעידות`} · <span class="num" dir="ltr">${slips.map(slipClock).join(', ')}</span>`;
  } else if (level === 'full') {
    dayLine = 'יום נקי';
  }

  const limitText = habit.measure === 'limit' && habit.full !== null
    ? ` · עד ${fmt(habit.full)} ${esc(habit.unit)}` : '';
  const buttons = habit.measure === 'limit'
    ? `<button type="button" class="btn habit-btn" data-bad-value>${icon('pencil', { className: 'icon--sm' })} כמה היום?</button>`
    : `<button type="button" class="btn habit-btn" data-bad-slip>מעדתי</button>
       <button type="button" class="btn habit-btn${level === 'full' ? ' habit-btn--full active' : ''}" data-bad-clean aria-pressed="${level === 'full'}" ${slips.length ? 'disabled' : ''}>${icon('check', { className: 'icon--sm' })} יום נקי</button>`;

  return `
    <div class="habit-card bad-card" data-bad="${esc(habit.id)}">
      <div class="habit-row">
        <div class="habit-main bad-main">
          <span class="habit-icon">${icon(habit.icon) || icon('check')}</span>
          <span class="habit-text">
            <span class="habit-name">${esc(habit.name)}</span>
            <span class="habit-meta">${streakLine || `<span class="text-muted">עוד אין רצף${limitText}</span>`}</span>
          </span>
        </div>
        <button type="button" class="app-bar-btn habit-edit" data-bad-edit aria-label="עריכת ${esc(habit.name)}">${icon('ellipsis-vertical', { className: 'icon--sm' })}</button>
      </div>
      <div class="bad-week">
        <span class="bad-chain" aria-hidden="true">${chain}</span>
        <span class="bad-week-count text-muted"><span class="num">${cleanDaysThrough(habit, shiftDays(start, 6), ctx)}/${habit.cleanWeekTarget}</span> נקיים השבוע</span>
      </div>
      ${dayLine ? `<p class="bad-day-line">${dayLine}</p>` : ''}
      <div class="habit-actions">${buttons}</div>
      ${habit.replacement ? `<p class="bad-instead text-muted">במקום: ${esc(habit.replacement)}</p>` : ''}
    </div>`;
}
