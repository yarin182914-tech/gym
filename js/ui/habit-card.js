// One habit on the "היום" screen, as markup: icon, name, today's target,
// streak and today's mark. Tapping opens its row of buttons (מלא / מקוצר,
// which asks how much / לא בוצע / ביטול סימון); the screen (js/pages/today.js) owns the events.
// Nothing missed is ever red — an unmarked or missed day is just grey.

import { takesValue } from '../lib/habits.js';
import { WEEKDAY_LETTERS } from './habit-wizard.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';

const fmt = (n) => Number(n).toLocaleString('he-IL');

// "10 דקות · מקוצר 5", "עד 60 דקות", "8,000 צעדים".
export function targetText(habit) {
  const { full, short, unit } = habit;
  if (habit.measure === 'steps') {
    return habit.steps.length ? `${habit.steps.length} צעדים${habit.shortSteps?.length ? ` · מקוצר ${habit.shortSteps.length}` : ''}` : '';
  }
  if (full === null) return '';
  const u = unit ? ` ${unit}` : '';
  if (habit.measure === 'limit') return `עד ${fmt(full)}${u}${short !== null ? ` · מקוצר עד ${fmt(short)}` : ''}`;
  return `${fmt(full)}${u}${short !== null ? ` · מקוצר ${fmt(short)}` : ''}`;
}

export function scheduleText(habit) {
  const s = habit.schedule;
  if (s.type === 'weekly') return `${s.perWeek} בשבוע`;
  if (s.type === 'days') return s.days.map((d) => `${WEEKDAY_LETTERS[d]}׳`).join(' ');
  return 'כל יום';
}

const MARK_TEXT = { full: 'מלא', short: 'מקוצר', none: 'לא בוצע' };

// view: { entry, streak: {count, unit}, week (done this week, N-per-week
// only), due, open (buttons showing) }.
export function habitCardHtml(habit, view) {
  const { entry, streak, week, due, open } = view;
  const state = entry ? entry.level : 'unmarked';
  const meta = [];
  if (habit.schedule.type === 'weekly') meta.push(`<span class="num">${week}/${habit.schedule.perWeek}</span> השבוע`);
  else if (habit.schedule.type === 'days') meta.push(scheduleText(habit));
  const target = targetText(habit);
  if (target) meta.push(esc(target));

  let mark = '';
  if (entry) {
    const value = entry.value !== null && takesValue(habit) ? `<span class="num">${fmt(entry.value)}</span>` : '';
    mark = `${entry.level === 'none' ? '' : icon('check', { className: 'icon--sm' })}${value || MARK_TEXT[entry.level]}`;
  }
  const streakHtml = streak.count
    ? `<span class="habit-streak" aria-label="${streak.count} ${streak.unit === 'weeks' ? 'שבועות' : 'ימים'} ברצף">${icon('flame', { className: 'icon--sm' })}<span class="num">${streak.count}</span>${streak.unit === 'weeks' ? '<span class="habit-streak-unit">ש׳</span>' : ''}</span>`
    : '';

  return `
    <div class="habit-card habit-card--${state}${due ? '' : ' habit-card--off'}${open ? ' habit-card--open' : ''}" data-habit="${esc(habit.id)}">
      <div class="habit-row">
        <button type="button" class="habit-main" data-habit-tap aria-expanded="${open}"
          aria-label="${esc(habit.name)}${entry ? ` · ${MARK_TEXT[entry.level]}` : ''}">
          <span class="habit-icon">${icon(habit.icon) || icon('check')}</span>
          <span class="habit-text">
            <span class="habit-name">${esc(habit.name)}</span>
            <span class="habit-meta">${meta.join(' · ')}${entry?.auto ? (habit.autoSource === 'workouts.strength' ? ' · מהאימונים' : ' · מהצעדים') : ''}</span>
          </span>
          ${mark ? `<span class="habit-mark">${mark}</span>` : ''}
          ${streakHtml}
        </button>
        <button type="button" class="app-bar-btn habit-edit" data-habit-edit aria-label="עריכת ${esc(habit.name)}">${icon('ellipsis-vertical', { className: 'icon--sm' })}</button>
      </div>
      ${open ? `
      <div class="habit-actions">
        <button type="button" class="btn habit-btn habit-btn--full${entry?.level === 'full' && !entry.auto ? ' active' : ''}" data-mark="full">מלא</button>
        ${habit.short !== null ? `<button type="button" class="btn habit-btn${entry?.level === 'short' && !entry.auto ? ' active' : ''}" data-mark="short">מקוצר</button>` : ''}
        <button type="button" class="btn habit-btn${entry?.level === 'none' && !entry.auto ? ' active' : ''}" data-mark="none">לא בוצע</button>
        ${entry && !entry.auto ? `<button type="button" class="btn habit-btn habit-btn--undo" data-mark="undo" aria-label="ביטול סימון">${icon('undo-2', { className: 'icon--sm' })}</button>` : ''}
      </div>` : ''}
    </div>`;
}
