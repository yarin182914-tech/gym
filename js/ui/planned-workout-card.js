// "אימון מומלץ" — the coach's proposed workout for today (a plannedWorkouts
// doc, see docs/DATA.md), shown on the workout screen while nothing is open.
// Everything in it can be changed before starting: a set's weight and reps,
// sets added or removed, exercises swapped, added, removed or reordered.
// Edits stay in this card's own draft until "התחל אימון" hands them over;
// the coach's original proposal is never written back.
//
// Owns its element, like the body-weight card: created once per plan, and
// re-attached by the workout screen on every render, so a draft survives
// the screen re-rendering around it.

import { esc } from '../core/dom.js';
import { formatWeight } from '../lib/format.js';
import { summarizeSegments, formatSummary } from '../lib/cardio.js';
import { CATEGORY_GROUPS } from '../lib/firestore.js';
import { exerciseKind, planExercisesOut, resolveType, sessionSummary } from '../lib/workout-types.js';
import { icon } from './icon.js';
import { openBottomSheet } from './bottom-sheet.js';
import { mountNumericField } from './numeric-input.js';
import { showToast } from './toast.js';

const isCardio = (ex) => exerciseKind(ex) === 'cardio';
// A session (Pilates, CrossFit…) has no sets: shown as one line, edited
// once the workout is open.
const isSession = (ex) => exerciseKind(ex) === 'session';

// A strength set as the app saves it (see buildSavedSets in active-session).
function plainSet(set, fallback = {}) {
  return {
    type: set?.type || 'working',
    weight: Number(set?.weight ?? fallback.weight ?? 0) || 0,
    weightUnit: set?.weightUnit || fallback.weightUnit || 'kg',
    weightMode: set?.weightMode || fallback.weightMode || 'total',
    reps: Number(set?.reps ?? fallback.reps ?? 10) || 0,
    notes: set?.notes || '',
    ...(set?.dropGroup ? { dropGroup: set.dropGroup } : {}),
  };
}

// plan: the plannedWorkouts doc. getLibrary(): the strength exercise list
// (may still be loading). lastWeight(name): resolves to the weight last
// lifted on an exercise, or null — the starting point for one added here.
// onStart(exercises, edited), onSkip(), onFree().
export function createPlannedWorkoutCard(plan, { getLibrary, lastWeight, onStart, onSkip, onFree }) {
  // A deep copy: the coach's original is kept as it came.
  let draft = JSON.parse(JSON.stringify(Array.isArray(plan.exercises) ? plan.exercises : []));
  let edited = false;
  let busy = false;

  const el = document.createElement('div');
  el.className = 'card plan-card';

  const changed = () => {
    edited = true;
    render();
  };

  function setsMarkup(ex, i) {
    if (isSession(ex)) {
      return `<span class="plan-set plan-set--static">${esc(sessionSummary(ex, resolveType(ex.typeId, [], ex.name)) || ex.name)}</span>`;
    }
    if (isCardio(ex)) {
      return (ex.sets || []).map((s) => `<span class="plan-set plan-set--static">${esc(formatSummary(summarizeSegments([s])) || '—')}</span>`).join('');
    }
    return `${(ex.sets || []).map((s, j) => `
      <button type="button" class="plan-set" data-set="${i}:${j}" aria-label="עריכת סט ${j + 1}">
        <span class="num">${esc(formatWeight(plainSet(s)))}</span><span class="plan-set-x">×</span><span class="num">${esc(s.reps)}</span>
      </button>`).join('')}
      <button type="button" class="plan-set plan-set--add" data-add-set="${i}" aria-label="הוספת סט">+</button>`;
  }

  function render() {
    el.innerHTML = `
      <div class="plan-card-eyebrow">${icon('target', { className: 'icon--sm' })} אימון מומלץ להיום</div>
      <h2 class="plan-card-title">${esc(plan.title || 'אימון')}</h2>
      ${plan.coachNotes ? `<p class="plan-card-notes">${esc(plan.coachNotes)}</p>` : ''}
      <div class="plan-ex-list">
        ${draft.length === 0 ? '<p class="text-muted" style="margin:0;">אין תרגילים — אפשר להוסיף.</p>' : draft.map((ex, i) => `
          <div class="plan-ex">
            <div class="plan-ex-head">
              <span class="plan-ex-num num">${String(i + 1).padStart(2, '0')}</span>
              <div class="plan-ex-name">
                <strong>${esc(ex.name)}</strong>
                <span class="text-muted">${esc(ex.category || '')}</span>
              </div>
              <button type="button" class="set-more-btn" data-ex-menu="${i}" aria-label="אפשרויות לתרגיל">${icon('ellipsis', { className: 'icon--sm' })}</button>
            </div>
            ${ex.reason ? `<div class="plan-ex-reason">${esc(ex.reason)}</div>` : ''}
            <div class="plan-sets">${setsMarkup(ex, i)}</div>
          </div>`).join('')}
      </div>
      <button type="button" class="btn btn-dashed btn-block" data-add-ex>+ תרגיל</button>
      <div class="plan-actions">
        <button type="button" class="btn btn-primary btn-block" data-plan-start${draft.length === 0 ? ' disabled' : ''}>התחל אימון</button>
        <div class="row" style="gap:8px;">
          <button type="button" class="btn btn-secondary" data-plan-skip style="flex:1;">לא היום</button>
          <button type="button" class="btn btn-secondary" data-plan-free style="flex:1;">אימון חופשי</button>
        </div>
      </div>`;

    el.querySelectorAll('[data-set]').forEach((btn) => {
      const [i, j] = btn.dataset.set.split(':').map(Number);
      btn.addEventListener('click', () => openSetSheet(i, j));
    });
    el.querySelectorAll('[data-add-set]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ex = draft[Number(btn.dataset.addSet)];
        const last = ex.sets?.at(-1);
        ex.sets = [...(ex.sets || []), plainSet(last ? { ...last, type: last.type === 'dropset' ? 'working' : last.type, dropGroup: undefined } : null)];
        changed();
      });
    });
    el.querySelectorAll('[data-ex-menu]').forEach((btn) => {
      btn.addEventListener('click', () => openExerciseMenu(Number(btn.dataset.exMenu)));
    });
    el.querySelector('[data-add-ex]').addEventListener('click', () => openLibraryPicker('הוספת תרגיל', addExercise));
    el.querySelector('[data-plan-start]').addEventListener('click', () => act(() => onStart(output(), edited)));
    el.querySelector('[data-plan-skip]').addEventListener('click', () => act(onSkip));
    el.querySelector('[data-plan-free]').addEventListener('click', () => act(onFree));
  }

  // One action at a time — they all reach the network.
  async function act(fn) {
    if (busy) return;
    busy = true;
    try {
      await fn();
    } finally {
      busy = false;
    }
  }

  // The draft as saved exercises: sets renumbered, nothing undefined.
  function output() {
    return planExercisesOut(draft, (s) => plainSet(s));
  }

  function openSetSheet(i, j) {
    const ex = draft[i];
    const set = plainSet(ex.sets[j]);
    openBottomSheet({
      ariaLabel: 'עריכת סט',
      render(body, sheetApi) {
        body.innerHTML = `
          <h3 style="margin:0 0 4px; color:var(--text);">${esc(ex.name)}</h3>
          <p class="text-muted" style="margin:0; font-size:0.8rem;">סט ${j + 1}</p>
          <div class="nut-macro-grid">
            <div><div class="sheet-field-label">משקל</div><div data-plan-weight></div></div>
            <div><div class="sheet-field-label">חזרות</div><div data-plan-reps></div></div>
          </div>
          <div class="sheet-actions">
            <button type="button" class="btn btn-danger" data-plan-del-set>מחיקת סט</button>
            <button type="button" class="btn btn-secondary" data-plan-cancel>ביטול</button>
            <button type="button" class="btn btn-primary" data-plan-save>שמירה</button>
          </div>`;
        mountNumericField(body.querySelector('[data-plan-weight]'), {
          value: set.weight,
          unitLabel: set.weightUnit === 'lb' ? 'lb' : 'ק"ג',
          ariaLabel: 'משקל',
          onCommit: (v) => { set.weight = v; },
        });
        mountNumericField(body.querySelector('[data-plan-reps]'), {
          value: set.reps,
          unitLabel: 'חזרות',
          ariaLabel: 'חזרות',
          onCommit: (v) => { set.reps = Math.round(v); },
        });
        body.querySelector('[data-plan-cancel]').addEventListener('click', () => sheetApi.close());
        body.querySelector('[data-plan-save]').addEventListener('click', () => {
          ex.sets[j] = { ...ex.sets[j], weight: set.weight, reps: set.reps };
          sheetApi.close();
          changed();
        });
        body.querySelector('[data-plan-del-set]').addEventListener('click', () => {
          ex.sets.splice(j, 1);
          sheetApi.close();
          changed();
        });
      },
    });
  }

  function openExerciseMenu(i) {
    const ex = draft[i];
    openBottomSheet({
      ariaLabel: 'אפשרויות לתרגיל',
      render(body, sheetApi) {
        const item = (attr, iconName, label) => `
          <button type="button" class="settings-item" ${attr}>
            ${icon(iconName, { className: 'icon--sm' })}
            <span class="settings-item-text">${label}</span>
          </button>`;
        body.innerHTML = `
          <h3 style="margin:0 0 10px; color:var(--text);">${esc(ex.name)}</h3>
          <div class="settings-list">
            ${i > 0 ? item('data-m="up"', 'arrow-up', 'הזזה למעלה') : ''}
            ${i < draft.length - 1 ? item('data-m="down"', 'arrow-down', 'הזזה למטה') : ''}
            ${isCardio(ex) || isSession(ex) ? '' : item('data-m="swap"', 'arrow-left-right', 'החלפה בתרגיל אחר')}
            ${item('data-m="delete"', 'trash-2', 'הסרת התרגיל')}
          </div>`;
        body.querySelectorAll('[data-m]').forEach((btn) => {
          btn.addEventListener('click', () => {
            sheetApi.close();
            const m = btn.dataset.m;
            if (m === 'up' || m === 'down') {
              const to = m === 'up' ? i - 1 : i + 1;
              [draft[i], draft[to]] = [draft[to], draft[i]];
              changed();
            } else if (m === 'delete') {
              draft.splice(i, 1);
              changed();
            } else if (m === 'swap') {
              openLibraryPicker(`במקום ${ex.name}`, (lib) => swapExercise(i, lib));
            }
          });
        });
      },
    });
  }

  // Same sets, another exercise: the weighting follows the new one's
  // defaults, and the coach's reason no longer applies.
  function swapExercise(i, lib) {
    const old = draft[i];
    draft[i] = {
      name: lib.name,
      category: lib.category || '',
      sets: (old.sets || []).map((s) => plainSet({
        ...s,
        weightUnit: lib.defaultUnit || 'kg',
        weightMode: lib.defaultWeightMode || 'total',
      })),
    };
    changed();
  }

  async function addExercise(lib) {
    const weight = await lastWeight(lib.name).catch(() => null);
    const base = { weight: weight ?? 0, weightUnit: lib.defaultUnit || 'kg', weightMode: lib.defaultWeightMode || 'total', reps: 10 };
    draft.push({
      name: lib.name,
      category: lib.category || '',
      sets: [plainSet(null, base), plainSet(null, base), plainSet(null, base)],
    });
    changed();
  }

  // The strength exercise list in a sheet, searchable, grouped by the
  // app's push/pull categories.
  function openLibraryPicker(title, onPick) {
    const library = getLibrary();
    if (library.length === 0) {
      showToast('רשימת התרגילים עוד נטענת — נסה שוב בעוד רגע');
      return;
    }
    const order = CATEGORY_GROUPS.flatMap((g) => g.categories);
    const sorted = [...library].sort((a, b) => {
      const ca = order.indexOf(a.category);
      const cb = order.indexOf(b.category);
      return (ca === -1 ? 99 : ca) - (cb === -1 ? 99 : cb) || a.name.localeCompare(b.name, 'he');
    });
    openBottomSheet({
      ariaLabel: title,
      render(body, sheetApi) {
        body.innerHTML = `
          <h3 style="margin:0 0 10px; color:var(--text);">${esc(title)}</h3>
          <input type="search" class="search-bar" data-plan-search placeholder="חיפוש תרגיל" style="margin-bottom:10px;">
          <div class="settings-list plan-picker-list" data-plan-results></div>`;
        const results = body.querySelector('[data-plan-results]');
        const show = (q) => {
          const hits = sorted.filter((lib) => !q || lib.name.includes(q));
          results.innerHTML = hits.length === 0
            ? '<p class="text-muted" style="margin:8px 0;">לא נמצא</p>'
            : hits.map((lib) => `
              <button type="button" class="settings-item" data-plan-pick="${esc(lib.name)}">
                <span class="settings-item-text">${esc(lib.name)}<span class="settings-item-hint">${esc(lib.category || '')}</span></span>
              </button>`).join('');
          results.querySelectorAll('[data-plan-pick]').forEach((btn) => {
            btn.addEventListener('click', () => {
              sheetApi.close();
              onPick(sorted.find((lib) => lib.name === btn.dataset.planPick));
            });
          });
        };
        body.querySelector('[data-plan-search]').addEventListener('input', (e) => show(e.target.value.trim()));
        show('');
      },
    });
  }

  render();
  return el;
}
