// In-app date and time fields, replacing the native <input type="date"> and
// <input type="time"> — whose OS popups (a grey spinner on iOS, a Material
// dialog on Android) were the most "web page" part of every sheet they
// appeared in. Each field is a button showing its value; tapping it opens
// the picker inline right below, so it behaves the same in a bottom sheet
// or in a card.
//
// Values use the native inputs' formats — 'yyyy-mm-dd' and 'hh:mm' (or ''
// for no time) — so callers swap over without changing their own logic.
// Stateful, so like numeric-input these mount into a host and return a
// small controller.

import { dateInputValue, parseDateInputValue, formatMonthHe } from '../lib/format.js';
import { mountWheelPicker } from './wheel-picker.js';
import { icon } from './icon.js';

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const pad = (n) => String(n).padStart(2, '0');

function keyOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return dateInputValue(d);
}

// "היום", "אתמול", or "יום ד׳, 29 באוק׳" (with the year when it isn't this one).
export function friendlyDate(key) {
  if (key === keyOffset(0)) return 'היום';
  if (key === keyOffset(-1)) return 'אתמול';
  const d = parseDateInputValue(key);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

function buildField(host, { ariaLabel, className = '' }) {
  host.innerHTML = `
    <div class="picker-field ${className}">
      <button type="button" class="picker-trigger" aria-expanded="false" aria-label="${ariaLabel}">
        <span class="picker-trigger-icon" data-icon></span>
        <span class="picker-trigger-text" data-text></span>
        <span class="picker-trigger-chevron">${icon('chevron-down', { className: 'icon--sm' })}</span>
      </button>
      <div class="picker-panel" hidden></div>
    </div>`;
  const field = host.querySelector('.picker-field');
  return {
    field,
    trigger: field.querySelector('.picker-trigger'),
    iconEl: field.querySelector('[data-icon]'),
    textEl: field.querySelector('[data-text]'),
    panel: field.querySelector('.picker-panel'),
  };
}

function setOpen(parts, open) {
  parts.panel.hidden = !open;
  parts.trigger.setAttribute('aria-expanded', String(open));
  parts.field.classList.toggle('picker-field--open', open);
}

// max: latest pickable day ('yyyy-mm-dd'), today by default — nothing in
// this app is logged ahead of time. accent: tint the trigger, e.g. to flag
// that a day other than today is being entered.
export function mountDateField(host, { value, max = keyOffset(0), onChange, ariaLabel = 'תאריך', accent = false, compact = false }) {
  const parts = buildField(host, { ariaLabel, className: compact ? 'picker-field--compact' : '' });
  let current = value;
  let month = startOfMonth(parseDateInputValue(current));
  parts.iconEl.innerHTML = icon('calendar-days', { className: 'icon--sm' });
  parts.trigger.classList.toggle('picker-trigger--accent', accent);

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function renderTrigger() {
    parts.textEl.textContent = friendlyDate(current);
  }

  function renderPanel() {
    const year = month.getFullYear();
    const m = month.getMonth();
    const days = new Date(year, m + 1, 0).getDate();
    const today = keyOffset(0);
    const nextMonthKey = dateInputValue(new Date(year, m + 1, 1));
    const cells = [];
    for (let i = 0; i < month.getDay(); i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const key = `${year}-${pad(m + 1)}-${pad(d)}`;
      const cls = ['cal-day', key === current ? 'cal-day--selected' : '', key === today ? 'cal-day--today' : ''].filter(Boolean).join(' ');
      cells.push(`<button type="button" class="${cls}" data-day="${key}"${key > max ? ' disabled' : ''}>${d}</button>`);
    }
    parts.panel.innerHTML = `
      <div class="picker-quick">
        <button type="button" class="pill${current === today ? ' active' : ''}" data-day="${today}">היום</button>
        <button type="button" class="pill${current === keyOffset(-1) ? ' active' : ''}" data-day="${keyOffset(-1)}">אתמול</button>
      </div>
      <div class="cal-head">
        <button type="button" class="cal-nav" data-month="-1" aria-label="החודש הקודם">${icon('chevron-right', { className: 'icon--sm' })}</button>
        <span class="cal-title">${formatMonthHe(month)}</span>
        <button type="button" class="cal-nav" data-month="1" aria-label="החודש הבא"${nextMonthKey > max ? ' disabled' : ''}>${icon('chevron-left', { className: 'icon--sm' })}</button>
      </div>
      <div class="cal-grid">
        ${WEEKDAYS.map((w) => `<span class="cal-weekday">${w}</span>`).join('')}
        ${cells.join('')}
      </div>`;
    parts.panel.querySelectorAll('[data-month]').forEach((btn) => {
      btn.addEventListener('click', () => {
        month = new Date(year, m + Number(btn.dataset.month), 1);
        renderPanel();
      });
    });
    parts.panel.querySelectorAll('[data-day]').forEach((btn) => {
      btn.addEventListener('click', () => {
        current = btn.dataset.day;
        renderTrigger();
        setOpen(parts, false);
        onChange?.(current);
      });
    });
  }

  parts.trigger.addEventListener('click', () => {
    const open = parts.panel.hidden;
    if (open) {
      month = startOfMonth(parseDateInputValue(current));
      renderPanel();
    }
    setOpen(parts, open);
  });

  renderTrigger();
  return {
    getValue: () => current,
  };
}

// value: 'hh:mm', or '' for no time. Opening an empty field starts it at
// the current time; "ללא שעה" clears it again.
export function mountTimeField(host, { value = '', onChange, ariaLabel = 'שעה' }) {
  const parts = buildField(host, { ariaLabel });
  let current = value;
  let wheels = [];
  parts.iconEl.innerHTML = icon('clock', { className: 'icon--sm' });

  function renderTrigger() {
    parts.textEl.textContent = current || 'הוספת שעה';
    parts.trigger.classList.toggle('picker-trigger--empty', !current);
  }

  function closePanel() {
    wheels.forEach((w) => w.destroy());
    wheels = [];
    setOpen(parts, false);
  }

  function set(next) {
    current = next;
    renderTrigger();
    onChange?.(current);
  }

  function openPanel() {
    if (!current) {
      const now = new Date();
      set(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    }
    let [h, m] = current.split(':').map(Number);
    // dir=ltr: hours on the left of the colon, as a clock reads.
    parts.panel.innerHTML = `
      <div class="time-wheels" dir="ltr">
        <div class="time-wheel" data-wheel="h"></div>
        <span class="time-colon">:</span>
        <div class="time-wheel" data-wheel="m"></div>
      </div>
      <div class="picker-actions">
        <button type="button" class="btn btn-secondary" data-clear>ללא שעה</button>
        <button type="button" class="btn btn-primary" data-done>סיום</button>
      </div>`;
    setOpen(parts, true); // visible first — a hidden wheel can't scroll to its value
    wheels = [
      mountWheelPicker(parts.panel.querySelector('[data-wheel="h"]'), {
        min: 0, max: 23, value: h, format: pad, onCommit: (v) => { h = v; set(`${pad(h)}:${pad(m)}`); },
      }),
      mountWheelPicker(parts.panel.querySelector('[data-wheel="m"]'), {
        min: 0, max: 59, value: m, format: pad, onCommit: (v) => { m = v; set(`${pad(h)}:${pad(m)}`); },
      }),
    ];
    parts.panel.querySelector('[data-clear]').addEventListener('click', () => {
      set('');
      closePanel();
    });
    parts.panel.querySelector('[data-done]').addEventListener('click', closePanel);
  }

  parts.trigger.addEventListener('click', () => {
    if (parts.panel.hidden) openPanel();
    else closePanel();
  });

  renderTrigger();
  return {
    getValue: () => current,
  };
}
