import { esc } from '../core/dom.js';
import { formatWeight, setTypeLabel } from '../lib/format.js';

// The set-by-set breakdown of one exercise. Used by History's expanded rows and
// by the "last time" popup in an active session — those were separate copies
// that had already drifted apart on weight formatting once.
//
// Renders as a card-row list rather than a literal <table> — bare browser
// table markup was the most "spreadsheet" looking surface anywhere the app
// shows past performance. Escaping happens here so no caller can forget it.
export function setsTable(sets = []) {
  return `
    <div class="sets-list-view">
      ${sets.map((s, i) => `
        <div class="sets-list-row">
          <span class="sets-list-index num">${i + 1}</span>
          <span class="sets-list-type">${esc(setTypeLabel(s.type))}</span>
          <span class="sets-list-weight num">${esc(formatWeight(s))}</span>
          <span class="sets-list-reps num">${esc(s.reps)} חזרות</span>
        </div>`).join('')}
    </div>`;
}
