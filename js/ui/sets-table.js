import { esc } from '../core/dom.js';
import { formatWeight, setTypeLabel } from '../lib/format.js';

// The set-by-set breakdown of one exercise. Used by History's expanded rows and
// by the "last time" popup in an active session — those were separate copies
// that had already drifted apart on weight formatting once.
//
// Escaping happens here so no caller can forget it.
export function setsTable(sets = []) {
  return `
    <table>
      <thead><tr><th>#</th><th>סוג</th><th>משקל</th><th>חזרות</th></tr></thead>
      <tbody>
        ${sets.map((s, i) => `
          <tr>
            <td class="num">${i + 1}</td>
            <td>${esc(setTypeLabel(s.type))}</td>
            <td class="num">${esc(formatWeight(s))}</td>
            <td class="num">${esc(s.reps)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}
