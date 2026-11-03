// History's "משקל" view: every weigh-in by day, grouped into weeks with
// each week's average and its change from the week before. Tapping a day
// edits or deletes it; "+ הוספת יום" fills in one that was missed.

import { setBodyWeight, deleteBodyWeight } from '../lib/firestore.js';
import { formatDayMonthHe, parseDateInputValue, round1 } from '../lib/format.js';
import { todayKey, shiftKey, signedKg, round2, upsertWeight } from '../lib/body-weight.js';
import { mountNumericField } from './numeric-input.js';
import { openBottomSheet } from './bottom-sheet.js';
import { confirmDialog } from './confirm-dialog.js';
import { emptyState } from './empty-state.js';
import { showToast } from './toast.js';

const dayLabel = (key) => parseDateInputValue(key).toLocaleDateString('he-IL', { weekday: 'short' });
const shortDate = (key) => formatDayMonthHe(parseDateInputValue(key));

// Sunday that starts `key`'s week — the Israeli week.
function weekStart(key) {
  return shiftKey(key, -parseDateInputValue(key).getDay());
}

// weights: newest day first (listBodyWeights); kept up to date in place.
export function mountBodyWeightHistory(host, weights) {
  function render() {
    const weeks = [];
    for (const w of weights) {
      const start = weekStart(w.date);
      if (weeks.at(-1)?.start !== start) weeks.push({ start, days: [] });
      weeks.at(-1).days.push(w);
    }
    weeks.forEach((wk) => { wk.avg = wk.days.reduce((s, d) => s + d.kg, 0) / wk.days.length; });

    host.innerHTML = `
      <button type="button" class="btn btn-dashed btn-block" data-bw-add style="margin-bottom:var(--space-3);">+ הוספת יום</button>
      ${weights.length === 0
        ? emptyState('עוד אין שקילות — מזינים כל בוקר בראש מסך תזונה.', { centered: true })
        : weeks.map((wk, i) => {
          const older = weeks[i + 1];
          return `
          <div class="card bw-week">
            <div class="bw-week-head">
              <span>${shortDate(wk.start)} – ${shortDate(shiftKey(wk.start, 6))}</span>
              <span class="bw-week-avg">ממוצע <span class="num">${round1(wk.avg)}</span>${older ? ` · ${signedKg(wk.avg - older.avg)}` : ''}</span>
            </div>
            ${wk.days.map((d) => {
              const prev = weights[weights.indexOf(d) + 1];
              const diff = prev ? round2(d.kg - prev.kg) : null;
              return `
              <button type="button" class="bw-hist-row" data-bw-day="${d.date}">
                <span class="bw-hist-date">${dayLabel(d.date)} · ${shortDate(d.date)}</span>
                <span class="bw-hist-kg num">${d.kg}</span>
                <span class="bw-hist-diff num">${diff === null ? '' : `${diff > 0 ? '↑' : diff < 0 ? '↓' : ''} ${signedKg(diff)}`}</span>
              </button>`;
            }).join('')}
          </div>`;
        }).join('')}`;

    host.querySelector('[data-bw-add]').addEventListener('click', () => openDaySheet(null));
    host.querySelectorAll('[data-bw-day]').forEach((row) => {
      row.addEventListener('click', () => openDaySheet(weights.find((w) => w.date === row.dataset.bwDay)));
    });
  }

  // entry: the day being edited, or null to add one.
  function openDaySheet(entry) {
    let dateKey = entry?.date ?? todayKey();
    let draft = entry?.kg ?? weights[0]?.kg ?? null;

    openBottomSheet({
      ariaLabel: entry ? 'עריכת שקילה' : 'הוספת שקילה',
      render(body, sheetApi) {
        body.innerHTML = `
          <h3 style="margin:0 0 14px; color:var(--text);">${entry ? `${dayLabel(entry.date)} · ${shortDate(entry.date)}` : 'הוספת שקילה'}</h3>
          ${entry ? '' : `
            <div class="sheet-field-label">תאריך</div>
            <input type="date" class="search-bar" data-bw-sheet-date value="${dateKey}" max="${todayKey()}" style="margin-bottom:12px;">`}
          <div class="sheet-field-label">משקל</div>
          <div class="bw-field" data-bw-sheet-field></div>
          <p class="text-muted" data-bw-sheet-hint style="margin:8px 0 0; font-size:0.8rem;"></p>
          <div class="sheet-actions">
            ${entry ? '<button type="button" class="btn btn-danger" data-bw-delete>מחיקה</button>' : ''}
            <button type="button" class="btn btn-secondary" data-bw-cancel>ביטול</button>
            <button type="button" class="btn btn-primary" data-bw-save>שמירה</button>
          </div>`;

        const field = mountNumericField(body.querySelector('[data-bw-sheet-field]'), {
          value: draft,
          unitLabel: 'ק"ג',
          ariaLabel: 'משקל גוף',
          nullable: true,
          onCommit: (v) => { draft = v; },
        });
        field.setPlaceholder('0.0');

        const hint = body.querySelector('[data-bw-sheet-hint]');
        const refreshHint = () => {
          const existing = !entry && weights.find((w) => w.date === dateKey);
          hint.textContent = existing ? `כבר נשמר ליום הזה: ${existing.kg} — שמירה תחליף` : '';
        };
        refreshHint();
        body.querySelector('[data-bw-sheet-date]')?.addEventListener('change', (e) => {
          const v = e.target.value;
          dateKey = v && v <= todayKey() ? v : todayKey();
          e.target.value = dateKey;
          refreshHint();
        });

        body.querySelector('[data-bw-cancel]').addEventListener('click', () => sheetApi.close());
        body.querySelector('[data-bw-save]').addEventListener('click', async () => {
          if (!draft) {
            showToast('יש להזין משקל');
            return;
          }
          const kg = round2(draft);
          const note = weights.find((w) => w.date === dateKey)?.note || '';
          try {
            await setBodyWeight(dateKey, { kg, note });
          } catch (err) {
            console.error('[body-weight] save failed', err);
            showToast('השמירה נכשלה — נסה שוב');
            return;
          }
          upsertWeight(weights, { id: dateKey, date: dateKey, kg, note });
          sheetApi.close();
          render();
        });
        body.querySelector('[data-bw-delete]')?.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'למחוק את השקילה?',
            message: `${entry.kg} ק"ג · ${shortDate(entry.date)}`,
            confirmLabel: 'מחיקה',
            danger: true,
          });
          if (!ok) return;
          try {
            await deleteBodyWeight(entry.date);
          } catch (err) {
            console.error('[body-weight] delete failed', err);
            showToast('המחיקה נכשלה — נסה שוב');
            return;
          }
          weights.splice(weights.findIndex((w) => w.date === entry.date), 1);
          sheetApi.close();
          render();
        });
      },
    });
  }

  render();
}
