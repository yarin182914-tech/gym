// One night's sheet: two clocks, the hours they add up to, save — and
// delete for a night that is already logged. Opened by the sleep card
// (js/ui/sleep-card.js, any night of its week) and by "היום"
// (js/pages/today.js, "לרשום את הלילה"), which has no sleep card of its own
// since M14a. Saving and deleting happen here; the caller gets the new list.

import { setSleep, deleteSleep } from '../lib/firestore.js';
import {
  buildNight, evaluateNight, nightRules, usualTimes, clockOf, formatDuration, shiftDays, parseKey,
} from '../lib/sleep.js';
import { mountTimeField } from './date-time-picker.js';
import { openBottomSheet } from './bottom-sheet.js';
import { confirmDialog } from './confirm-dialog.js';
import { showToast } from './toast.js';
import { esc } from '../core/dom.js';

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const DURATION_TEXT = { full: 'שעות מלאות', close: 'כמעט', miss: 'קצר' };

// "ליל חמישי" — a night is named by its evening; its key is the morning's.
export const nightName = (morningKey) => `ליל ${WEEKDAY_NAMES[parseKey(shiftDays(morningKey, -1)).getDay()]}`;

// Duration and verdict for two clock values, before saving.
export function nightPreview(key, bed, wake, settings) {
  const night = buildNight(key, bed, wake);
  if (!night) return 'הקימה לפני ההירדמות';
  const ev = evaluateNight(night, settings);
  return `${formatDuration(night.durationMin)} שעות · ${DURATION_TEXT[ev.duration]}`;
}

// Saves a night. Resolves to the new list of nights, or to null when
// nothing was saved (a toast has said why).
export async function saveNight(nights, key, bed, wake) {
  const night = buildNight(key, bed, wake);
  if (!night) {
    showToast('שעת הקימה צריכה להיות אחרי שעת ההירדמות');
    return null;
  }
  const isNew = !nights.some((n) => n.date === key);
  try {
    await setSleep(key, { ...night, source: 'manual' }, { isNew });
  } catch (err) {
    console.error('[sleep] save failed', err);
    showToast('השמירה נכשלה — נסה שוב');
    return null;
  }
  return nights.filter((n) => n.date !== key).concat({ id: key, ...night, source: 'manual' });
}

// key: the morning's date. nights: sleep docs (any order). settings: from
// sleepSettings(userDoc). onChange(nights) after a save or a delete.
export function openNightSheet({ key, nights, settings, onChange }) {
  const existing = nights.find((n) => n.date === key);
  const usual = usualTimes(key, settings);
  let bed = existing ? clockOf(existing.bedtime) : usual.bed;
  let wake = existing ? clockOf(existing.wakeTime) : usual.wake;
  const morning = parseKey(key).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  openBottomSheet({
    ariaLabel: nightName(key),
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 4px; color:var(--text);">${esc(nightName(key))}</h3>
        <p class="text-muted" style="margin:0; font-size:0.8rem;">עד הבוקר של ${esc(morning)}${nightRules(key, settings).flexible ? ' · לילה גמיש: נספר רק המשך' : ''}</p>
        <div class="sleep-clocks">
          <div><div class="sheet-field-label">נרדמתי</div><div data-n-bed></div></div>
          <div><div class="sheet-field-label">קמתי</div><div data-n-wake></div></div>
        </div>
        <p class="text-muted" data-n-preview style="margin:10px 0 0; font-size:0.85rem;"></p>
        <div class="sheet-actions">
          ${existing ? '<button type="button" class="btn btn-danger" data-n-delete>מחיקה</button>' : ''}
          <button type="button" class="btn btn-secondary" data-n-cancel>ביטול</button>
          <button type="button" class="btn btn-primary" data-n-save>שמירה</button>
        </div>`;
      const previewEl = body.querySelector('[data-n-preview]');
      const refresh = () => { previewEl.textContent = nightPreview(key, bed, wake, settings); };
      refresh();
      mountTimeField(body.querySelector('[data-n-bed]'), { value: bed, clearable: false, ariaLabel: 'שעת הירדמות', onChange: (v) => { bed = v; refresh(); } });
      mountTimeField(body.querySelector('[data-n-wake]'), { value: wake, clearable: false, ariaLabel: 'שעת קימה', onChange: (v) => { wake = v; refresh(); } });
      body.querySelector('[data-n-cancel]').addEventListener('click', () => sheetApi.close());
      const saveBtn = body.querySelector('[data-n-save]');
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        const next = await saveNight(nights, key, bed, wake);
        if (!next) {
          saveBtn.disabled = false;
          return;
        }
        sheetApi.close();
        onChange?.(next);
      });
      body.querySelector('[data-n-delete]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'למחוק את הלילה?',
          message: `${nightName(key)} · ${formatDuration(existing.durationMin)} שעות`,
          confirmLabel: 'מחיקה',
          danger: true,
        });
        if (!ok) return;
        try {
          await deleteSleep(key);
        } catch (err) {
          console.error('[sleep] delete failed', err);
          showToast('המחיקה נכשלה — נסה שוב');
          return;
        }
        sheetApi.close();
        onChange?.(nights.filter((n) => n.date !== key));
      });
    },
  });
}
