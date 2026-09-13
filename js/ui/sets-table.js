import { esc } from '../core/dom.js';
import { formatWeight, setTypeLabel } from '../lib/format.js';

// The set-by-set breakdown of one exercise. Used by History's expanded rows and
// by the "last time" popup in an active session — those were separate copies
// that had already drifted apart on weight formatting once.
//
// Renders as a card-row list rather than a literal <table> — bare browser
// table markup was the most "spreadsheet" looking surface anywhere the app
// shows past performance. Escaping happens here so no caller can forget it.

// A saved set optionally carries `dropGroup` — a small per-exercise integer
// shared by a drop set's leader and every one of its stages (see
// buildSavedSets() in js/pages/active-session.js, which writes it). Walking
// the array once turns that into the same "3, 3.1, 3.2" numbering the live
// workout screen already uses (setIndexLabel), instead of a flat 1..N that
// gives no hint a drop set ever happened. A set with no dropGroup at all
// (the common case) just gets the next plain top-level number.
function computeDisplayLabels(sets) {
  let topLevel = 0;
  const groupTopLevel = new Map(); // dropGroup -> its top-level number
  const groupChildCount = new Map(); // dropGroup -> stages seen so far
  return sets.map((s) => {
    if (!s.dropGroup) {
      topLevel += 1;
      return String(topLevel);
    }
    if (!groupTopLevel.has(s.dropGroup)) {
      // First set carrying this dropGroup is the leader — it gets the next
      // plain top-level number, same as the live parent row does.
      topLevel += 1;
      groupTopLevel.set(s.dropGroup, topLevel);
      groupChildCount.set(s.dropGroup, 0);
      return String(topLevel);
    }
    const child = groupChildCount.get(s.dropGroup) + 1;
    groupChildCount.set(s.dropGroup, child);
    return `${groupTopLevel.get(s.dropGroup)}.${child}`;
  });
}

export function setsTable(sets = []) {
  const labels = computeDisplayLabels(sets);
  return `
    <div class="sets-list-view">
      ${sets.map((s, i) => `
        <div class="sets-list-row${labels[i].includes('.') ? ' sets-list-row--child' : ''}">
          <span class="sets-list-index num">${esc(labels[i])}</span>
          <span class="sets-list-type">${esc(setTypeLabel(s.type))}</span>
          <span class="sets-list-weight num">${esc(formatWeight(s))}</span>
          <span class="sets-list-reps num">${esc(s.reps)} חזרות</span>
        </div>`).join('')}
    </div>`;
}
