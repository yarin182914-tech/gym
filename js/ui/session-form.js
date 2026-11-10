// The form on a session's card in the workout screen (Pilates, CrossFit…,
// see js/lib/workout-types.js): time, effort, heart rate and place, which
// every type has, then the type's own fields and notes. Compact — two
// columns, the same numeric/clock fields as a set row.
//
// Edits `values` in place ({ durationSec, rpe, avgHr, place, fields,
// notes }) and calls onChange() after each committed change.

import { esc } from '../core/dom.js';
import { FIELD_KINDS, fieldShown, swimPaceSec } from '../lib/workout-types.js';
import { formatClock } from '../lib/cardio.js';
import { mountNumericField } from './numeric-input.js';
import { mountClockField } from './clock-input.js';
import { stepper } from './stepper.js';

const RPE_START = 5; // the first tap on an empty effort lands here

export function mountSessionForm(host, { values, type, onChange }) {
  values.fields ||= {};
  const fields = values.fields;
  // Fields others depend on (showIf) redraw the type's part when changed.
  const controllers = new Set(type.fields.flatMap((f) => Object.keys(f.showIf || {})));

  host.innerHTML = `
    <div class="session-form">
      <div class="session-form-grid">
        <div><div class="sheet-field-label">${esc(type.durationLabel || 'משך')}</div><div data-sf-duration></div></div>
        <div><div class="sheet-field-label">מאמץ (1–10)</div><div data-sf-rpe></div></div>
        <div><div class="sheet-field-label">דופק ממוצע</div><div data-sf-hr></div></div>
        <div><div class="sheet-field-label">מקום</div><input type="text" class="search-bar session-form-text" data-sf-place value="${esc(values.place || '')}" placeholder="סטודיו / מקום"></div>
      </div>
      <div class="session-form-grid" data-sf-fields></div>
      <div class="sheet-field-label">הערות</div>
      <input type="text" class="search-bar session-form-text" data-sf-notes value="${esc(values.notes || '')}">
    </div>`;

  const changed = () => onChange?.(values);

  mountClockField(host.querySelector('[data-sf-duration]'), {
    seconds: values.durationSec,
    ariaLabel: 'משך',
    onCommit: (v) => { values.durationSec = v; drawPace(); changed(); },
  });
  mountNumericField(host.querySelector('[data-sf-hr]'), {
    value: values.avgHr,
    unitLabel: 'bpm',
    ariaLabel: 'דופק ממוצע',
    nullable: true,
    max: 250,
    onCommit: (v) => { values.avgHr = v === null ? null : Math.round(v); changed(); },
  });

  const rpeHost = host.querySelector('[data-sf-rpe]');
  const drawRpe = () => {
    rpeHost.innerHTML = stepper({
      decAttrs: 'type="button" data-rpe="-1" aria-label="פחות מאמץ"',
      incAttrs: 'type="button" data-rpe="1" aria-label="יותר מאמץ"',
      value: values.rpe ?? '—',
    });
    rpeHost.querySelectorAll('[data-rpe]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const step = Number(btn.dataset.rpe);
        values.rpe = values.rpe == null ? RPE_START : Math.min(10, Math.max(1, values.rpe + step));
        drawRpe();
        changed();
      });
    });
  };
  drawRpe();

  const textInput = (el, set) => {
    el.addEventListener('input', () => set(el.value));
    el.addEventListener('change', changed);
  };
  textInput(host.querySelector('[data-sf-place]'), (v) => { values.place = v; });
  textInput(host.querySelector('[data-sf-notes]'), (v) => { values.notes = v; });

  const fieldsHost = host.querySelector('[data-sf-fields]');
  let paceEl = null;

  // Swimming shows its pace per 100 m as soon as time and distance are in.
  function drawPace() {
    if (!paceEl) return;
    const pace = swimPaceSec({ durationSec: values.durationSec, fields });
    paceEl.textContent = pace ? `קצב ${formatClock(pace)} /100 מ׳` : '';
  }

  function drawFields() {
    fieldsHost.innerHTML = '';
    paceEl = null;
    for (const f of type.fields) {
      if (!fieldShown(f, fields)) continue;
      const kind = FIELD_KINDS[f.kind];
      if (!kind) continue;
      const wide = kind.input === 'pick' || kind.input === 'text' || kind.input === 'stations';
      const cell = document.createElement('div');
      if (wide) cell.className = 'session-field--wide';
      cell.innerHTML = `<div class="sheet-field-label">${esc(f.label)}</div><div data-sf-input></div>`;
      fieldsHost.appendChild(cell);
      const slot = cell.querySelector('[data-sf-input]');
      if (kind.input === 'clock') drawClock(slot, f);
      else if (kind.input === 'number') drawNumber(slot, f, kind);
      else if (kind.input === 'pick') drawPick(slot, f, kind);
      else if (kind.input === 'text') drawText(slot, f);
      else if (kind.input === 'stations') drawStations(slot, f);
    }
    if (type.id === 'swim') {
      paceEl = document.createElement('div');
      paceEl.className = 'session-form-hint num session-field--wide';
      fieldsHost.appendChild(paceEl);
      drawPace();
    }
  }

  function drawClock(slot, f) {
    mountClockField(slot, {
      seconds: fields[f.id],
      ariaLabel: f.label,
      onCommit: (v) => { fields[f.id] = v; changed(); },
    });
  }

  function drawNumber(slot, f, kind) {
    mountNumericField(slot, {
      value: fields[f.id] ?? null,
      unitLabel: kind.unit || '',
      ariaLabel: f.label,
      nullable: true,
      max: kind.max ?? 999,
      onCommit: (v) => {
        fields[f.id] = v === null ? null : (kind.int ? Math.round(v) : v);
        drawPace();
        changed();
      },
    });
  }

  // One of the options; tapping the picked one again clears it.
  function drawPick(slot, f, kind) {
    const options = f.options || kind.options || [];
    slot.innerHTML = `<div class="pill-row session-form-pills">${options.map((o) => `
      <button type="button" class="pill${fields[f.id] === o ? ' active' : ''}" data-opt="${esc(o)}" aria-pressed="${fields[f.id] === o}">${esc(o)}</button>`).join('')}</div>`;
    slot.querySelectorAll('[data-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        fields[f.id] = fields[f.id] === btn.dataset.opt ? null : btn.dataset.opt;
        if (controllers.has(f.id)) drawFields();
        else drawPick(slot, f, kind);
        changed();
      });
    });
  }

  function drawText(slot, f) {
    slot.innerHTML = `<input type="text" class="search-bar session-form-text" value="${esc(fields[f.id] || '')}" aria-label="${esc(f.label)}">`;
    textInput(slot.querySelector('input'), (v) => { fields[f.id] = v; });
  }

  // Functional: exercise, reps or time (free text — "12" or "0:40"), weight.
  function drawStations(slot, f) {
    const list = Array.isArray(fields[f.id]) ? fields[f.id] : [];
    fields[f.id] = list;
    slot.innerHTML = `
      <div class="session-stations">
        ${list.map((s, i) => `
          <div class="session-station" data-station="${i}">
            <input type="text" class="search-bar session-form-text" data-st="name" value="${esc(s.name || '')}" placeholder="תרגיל" aria-label="תרגיל">
            <input type="text" class="search-bar session-form-text num" data-st="amount" value="${esc(s.amount || '')}" placeholder="12 / 0:40" aria-label="חזרות או זמן" dir="ltr">
            <div data-st-weight></div>
            <button type="button" class="set-more-btn" data-st-remove aria-label="הסרת תחנה">×</button>
          </div>`).join('')}
        <button type="button" class="btn btn-dashed" data-st-add>+ תחנה</button>
      </div>`;
    slot.querySelectorAll('[data-station]').forEach((row) => {
      const s = list[Number(row.dataset.station)];
      row.querySelectorAll('[data-st]').forEach((input) => textInput(input, (v) => { s[input.dataset.st] = v; }));
      mountNumericField(row.querySelector('[data-st-weight]'), {
        value: s.weight ?? null,
        unitLabel: 'ק"ג',
        ariaLabel: 'משקל',
        nullable: true,
        onCommit: (v) => { s.weight = v; changed(); },
      });
      row.querySelector('[data-st-remove]').addEventListener('click', () => {
        list.splice(list.indexOf(s), 1);
        drawStations(slot, f);
        changed();
      });
    });
    slot.querySelector('[data-st-add]').addEventListener('click', () => {
      list.push({ name: '', amount: '', weight: null });
      drawStations(slot, f);
      slot.querySelector('.session-station:last-of-type [data-st="name"]')?.focus();
    });
  }

  drawFields();
}
