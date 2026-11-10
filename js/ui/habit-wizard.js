// The habit wizard (M5, plan: "הגדרת הרגל: אשף של 6 שאלות" and "הרגלים
// רעים: אשף גמילה"): one question per screen, in a bottom sheet.
//   New: pick "הרגל חדש" or "להיגמל ממשהו", a template or from scratch,
//   then 6 screens and a summary card with the points to expect.
//   Edit: opens on the summary; a tap on a line jumps to its screen, and
//   "המשך" there comes back to the summary. Pause and delete live there.
// onSave(fields) gets the habit's fields (no id/order); onDelete() only for
// an existing habit. Both run after the sheet has closed.

import {
  AREAS, AUTO_STEPS, AUTO_STRENGTH, PARTS_OF_DAY, MARKED_BY, MAX_PARTS, normalizeHabit,
} from '../lib/habits.js';
import { GOOD_TEMPLATES, BAD_TEMPLATES, TRIGGER_CHIPS } from '../lib/habit-templates.js';
import { HABITS, BAD_HABITS } from '../lib/rules.js';
import { openBottomSheet } from './bottom-sheet.js';
import { confirmDialog } from './confirm-dialog.js';
import { mountNumericField } from './numeric-input.js';
import { showToast } from './toast.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';

export const WEEKDAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

// icon name → what a screen reader says for it.
const ICONS = {
  check: 'וי', 'book-open': 'ספר', footprints: 'צעדים', 'phone-off': 'בלי טלפון', smartphone: 'טלפון', droplet: 'מים',
  brain: 'מוח', heart: 'לב', languages: 'שפות', apple: 'תפוח', leaf: 'עלה', moon: 'ירח', sun: 'שמש',
  dumbbell: 'משקולת', pencil: 'עיפרון', sparkles: 'ניצוצות',
};
const UNITS = ['דקות', 'עמודים', 'פעמים', 'צעדים', 'כוסות'];
// What "אוטומטית" can count from, and what each needs from the habit.
const AUTO_LABELS = { [AUTO_STEPS]: 'צעדים יומיים', [AUTO_STRENGTH]: 'אימוני כוח' };
// The auto source this draft can really use, or null.
export function autoFor(draft) {
  if (draft.kind !== 'good' || draft.markedBy !== 'auto') return null;
  if (draft.autoSource === AUTO_STRENGTH && (draft.measure === 'yesno' || draft.measure === 'quantity')) return AUTO_STRENGTH;
  if (draft.autoSource === AUTO_STEPS && draft.measure === 'quantity' && draft.unit === 'צעדים') return AUTO_STEPS;
  return null;
}
export const partsFromText = (text) => [...new Set(String(text || '').split(',').map((p) => p.trim()).filter(Boolean))].slice(0, MAX_PARTS);
const SCHEDULES = { daily: 'כל יום', weekly: 'כמה פעמים בשבוע', days: 'ימים קבועים' };
const GOOD_MEASURES = { yesno: 'כן / לא', quantity: 'כמות', steps: 'רשימת צעדים', limit: 'מגבלה' };
const BAD_MEASURES = { clean: 'יום נקי (כן / לא)', limit: 'מגבלה', slips: 'מונה מעידות' };
const MAX_VALUE = 100000;

const GOOD_STEPS = ['what', 'why', 'often', 'done', 'when', 'who'];
const BAD_STEPS = ['what', 'why', 'trigger', 'instead', 'friction', 'measure'];
const TITLES = {
  good: { what: 'מה ההרגל?', why: 'למה זה חשוב לך?', often: 'כל כמה זמן?', done: 'מה נחשב ביצוע?', when: 'מתי ואיך?', who: 'מי מסמן?' },
  bad: { what: 'ממה רוצים להיגמל?', why: 'מה הוא עולה לך?', trigger: 'מה הטריגר?', instead: 'מה עושים במקום?', friction: 'איך מקשים על עצמך?', measure: 'איך מודדים?' },
};

// The wizard's working copy of a habit — every field the screens touch.
function draftFrom(raw) {
  const h = normalizeHabit(raw);
  return {
    kind: h.kind,
    name: raw.name ? h.name : '',
    icon: h.icon,
    area: h.area,
    schedule: h.schedule,
    measure: h.measure,
    unit: h.unit || 'דקות',
    full: h.full,
    short: h.short,
    steps: [...h.steps],
    shortSteps: [...h.shortSteps],
    autoSource: h.autoSource,
    partsText: (h.parts || []).join(', '),
    active: h.active,
    why: h.why,
    partOfDay: h.partOfDay,
    anchor: h.anchor,
    reminder: h.reminder,
    markedBy: h.markedBy,
    trigger: h.trigger,
    replacement: h.replacement,
    friction: h.friction,
    cleanWeekTarget: h.cleanWeekTarget,
  };
}

// Roughly what a week of doing it well is worth (the summary card).
export function expectedWeekPoints(d) {
  if (d.kind === 'bad') return d.cleanWeekTarget * BAD_HABITS.points.clean.full + BAD_HABITS.points.weekBonus;
  const perWeek = d.schedule.type === 'weekly' ? d.schedule.perWeek : d.schedule.type === 'days' ? d.schedule.days.length : 7;
  return perWeek * HABITS.points.full + (d.schedule.type === 'weekly' ? HABITS.weeklyBonus : 0);
}

const fmt = (n) => Number(n).toLocaleString('he-IL');

export function openHabitWizard({ habit = null, onSave, onDelete }) {
  let draft = draftFrom(habit || { name: '' });
  // 'start' (new only) · a step id · 'summary'.
  let screen = habit ? 'summary' : 'start';
  let editing = !!habit; // a step reached from the summary returns to it
  let startKind = 'good';

  openBottomSheet({
    ariaLabel: habit ? `עריכת ${habit.name}` : 'הרגל חדש',
    render(body, sheetApi) {
      const steps = () => (draft.kind === 'bad' ? BAD_STEPS : GOOD_STEPS);
      const pill = (attr, value, label, active, extra = '') => `<button type="button" class="pill${active ? ' active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}" ${extra}>${label}</button>`;
      const perWeek = () => (draft.schedule.type === 'weekly' ? draft.schedule.perWeek : 3);
      const days = () => (draft.schedule.type === 'days' ? draft.schedule.days : []);

      function go(next) {
        screen = next;
        paint();
        body.closest('.bottom-sheet')?.scrollTo?.(0, 0);
      }

      // ---------- screens ----------

      function startScreen() {
        const list = startKind === 'bad' ? BAD_TEMPLATES : GOOD_TEMPLATES;
        return `
          <h3 class="wizard-title">מה מוסיפים?</h3>
          <div class="wizard-kind">
            ${pill('data-w-kind', 'good', `${icon('plus', { className: 'icon--sm' })} הרגל חדש`, startKind === 'good')}
            ${pill('data-w-kind', 'bad', `${icon('leaf', { className: 'icon--sm' })} להיגמל ממשהו`, startKind === 'bad')}
          </div>
          <div class="sheet-field-label">תבנית מוכנה — רק לתקן</div>
          <div class="wizard-templates">
            ${list.map((t) => `
              <button type="button" class="wizard-template" data-w-template="${t.id}">
                <span class="habit-icon">${icon(t.icon)}</span><span>${esc(t.name)}</span>
              </button>`).join('')}
          </div>
          <button type="button" class="btn btn-secondary btn-block" data-w-scratch>${startKind === 'bad' ? 'להתחיל מאפס' : 'הרגל משלי, מאפס'}</button>`;
      }

      function stepScreen(id) {
        const i = steps().indexOf(id);
        return `
          <div class="wizard-progress" aria-label="שלב ${i + 1} מתוך 6">
            ${steps().map((_, j) => `<span class="wizard-dot${j <= i ? ' wizard-dot--on' : ''}"></span>`).join('')}
          </div>
          <h3 class="wizard-title">${TITLES[draft.kind][id]}</h3>
          <div class="wizard-body">${stepBody(id)}</div>
          <div class="sheet-actions">
            <button type="button" class="btn btn-secondary" data-w-back>${editing ? 'לסיכום' : i === 0 && !habit ? 'חזרה' : 'הקודם'}</button>
            <button type="button" class="btn btn-primary" data-w-next>${editing || i === 5 ? 'המשך' : 'הבא'}</button>
          </div>`;
      }

      function stepBody(id) {
        const area = `<div class="sheet-field-label">תחום</div><div class="pill-row">${Object.entries(AREAS).map(([k, l]) => pill('data-w-area', k, l, draft.area === k)).join('')}</div>`;
        const textArea = (field, placeholder, hint = '') => `
          ${hint ? `<p class="wizard-hint">${hint}</p>` : ''}
          <textarea class="search-bar wizard-text" data-w-text="${field}" rows="3" maxlength="140" placeholder="${esc(placeholder)}">${esc(draft[field])}</textarea>`;
        if (id === 'what') {
          return `
            <input type="text" class="search-bar" data-w-name placeholder="${draft.kind === 'bad' ? 'למשל כסיסת ציפורניים' : 'שם ההרגל'}" value="${esc(draft.name)}" maxlength="40">
            <div class="sheet-field-label">אייקון</div>
            <div class="pill-row habit-icon-row">${Object.entries(ICONS).map(([name, label]) => `
              <button type="button" class="pill habit-icon-pill${draft.icon === name ? ' active' : ''}" data-w-icon="${name}" aria-pressed="${draft.icon === name}" aria-label="${label}">${icon(name, { className: 'icon--sm' })}</button>`).join('')}
            </div>
            ${area}`;
        }
        if (id === 'why') {
          return draft.kind === 'bad'
            ? textArea('why', 'למשל: נרדם מאוחר ועייף בבוקר', 'משפט אחד. העוזר מזכיר אותו ברגעים קשים.')
            : textArea('why', 'למשל: רוצה לסיים ספר בחודש', 'משפט אחד. העוזר משתמש בו בתזכורות ובימים קשים.');
        }
        if (id === 'often') {
          return `
            <div class="pill-row">${Object.entries(SCHEDULES).map(([k, l]) => pill('data-w-sched', k, l, draft.schedule.type === k)).join('')}</div>
            ${draft.schedule.type === 'weekly' ? `<div class="pill-row">${[1, 2, 3, 4, 5, 6].map((n) => pill('data-w-per', n, `${n}×`, perWeek() === n)).join('')}</div>` : ''}
            ${draft.schedule.type === 'days' ? `<div class="pill-row">${WEEKDAY_LETTERS.map((l, i) => pill('data-w-day', i, `${l}׳`, days().includes(i))).join('')}</div>` : ''}
            ${draft.schedule.type === 'weekly' ? '<p class="wizard-hint">יום בלי ביצוע לא נחשב פספוס — סופרים את השבוע.</p>' : ''}`;
        }
        if (id === 'done') return measureBody(GOOD_MEASURES);
        if (id === 'when') {
          return `
            <div class="sheet-field-label">חלק ביום</div>
            <div class="pill-row">${Object.entries(PARTS_OF_DAY).map(([k, l]) => pill('data-w-part', k, l, draft.partOfDay === k)).join('')}</div>
            <div class="sheet-field-label">עוגן — אחרי מה?</div>
            <input type="text" class="search-bar" data-w-anchor value="${esc(draft.anchor)}" maxlength="60" placeholder="למשל: אחרי הקפה">
            <p class="wizard-hint">הרגל שנצמד לפעולה קיימת קל יותר לביצוע.</p>
            <div class="sheet-field-label">תזכורת</div>
            <input type="time" class="search-bar wizard-time" data-w-reminder value="${esc(draft.reminder || '')}" dir="ltr">
            <p class="wizard-hint">התזכורות יישלחו כשההתראות ייכנסו לאפליקציה.</p>`;
        }
        if (id === 'who') return whoBody();
        if (id === 'trigger') {
          return `
            ${textArea('trigger', 'מתי, איפה ומה מרגישים לפני', 'לזהות את הרגע זה חצי מהדרך.')}
            <div class="pill-row">${TRIGGER_CHIPS.map((c) => pill('data-w-chip', c, `+ ${c}`, false)).join('')}</div>`;
        }
        if (id === 'instead') return textArea('replacement', 'למשל: לסגור אגרוף לדקה', 'משהו שאי אפשר לעשות ביחד עם ההרגל.');
        if (id === 'friction') return textArea('friction', 'למשל: מטען בסלון, ציפורניים קצרות', 'שינוי קטן בסביבה שמקשה להתחיל.');
        if (id === 'measure') {
          return `
            ${measureBody(BAD_MEASURES)}
            <div class="sheet-field-label">כמה ימים נקיים בשבוע לבונוס</div>
            <div class="pill-row">${[3, 4, 5, 6, 7].map((n) => pill('data-w-target', n, `${n}`, draft.cleanWeekTarget === n)).join('')}</div>
            ${whoBody()}`;
        }
        return '';
      }

      function measureBody(options) {
        const counts = draft.measure === 'quantity' || draft.measure === 'limit';
        const fullLabel = { quantity: 'מלא (היעד)', limit: 'מלא: עד' }[draft.measure] || 'מלא';
        const shortLabel = { quantity: 'מקוצר (המינימום)', limit: 'מקוצר: עד' }[draft.measure] || 'מקוצר';
        return `
          <div class="pill-row">${Object.entries(options).map(([k, l]) => pill('data-w-measure', k, l, draft.measure === k)).join('')}</div>
          ${counts ? `
            <div class="pill-row">${UNITS.map((u) => pill('data-w-unit', u, u, draft.unit === u)).join('')}</div>
            <div class="sleep-clocks">
              <div><div class="sheet-field-label">${fullLabel}</div><div data-w-full></div></div>
              <div><div class="sheet-field-label">${shortLabel}</div><div data-w-short></div></div>
            </div>
            <p class="wizard-hint">"מלא" הוא האידיאל, "מקוצר" המינימום שעדיף מכלום.</p>
            <div class="sheet-field-label">פירוק לכמה שדות (לא חובה)</div>
            <input type="text" class="search-bar" data-w-parts value="${esc(draft.partsText)}" maxlength="80" placeholder="למשל: אינסטגרם, פייסבוק">
            <p class="wizard-hint">מפרידים בפסיק. בסימון יופיע שדה לכל אחד, והסכום הוא מה שנספר.</p>` : ''}
          ${draft.measure === 'steps' ? `
            <div class="wizard-steps">
              ${draft.steps.map((s, i) => `
                <div class="wizard-step">
                  <input type="text" class="search-bar" data-w-step="${i}" value="${esc(s)}" maxlength="40" placeholder="צעד">
                  <label class="wizard-short"><input type="checkbox" data-w-short-step="${i}" ${draft.shortSteps.includes(i) ? 'checked' : ''}> מקוצר</label>
                  <button type="button" class="set-more-btn" data-w-step-remove="${i}" aria-label="הסרת הצעד">${icon('x', { className: 'icon--sm' })}</button>
                </div>`).join('')}
              <button type="button" class="btn btn-dashed" data-w-step-add>+ צעד</button>
            </div>
            <p class="wizard-hint">מלא: כל הצעדים. מקוצר: הצעדים שסימנת.</p>` : ''}
          ${draft.measure === 'yesno' ? '<p class="wizard-hint">לחיצה אחת מסמנת שבוצע.</p>' : ''}
          ${draft.measure === 'clean' ? '<p class="wizard-hint">כל ערב: "יום נקי ✓", או "מעדתי" ברגע שקרה.</p>' : ''}
          ${draft.measure === 'slips' ? `<p class="wizard-hint">כל מעידה בלחיצה אחת. עד ${BAD_HABITS.shortSlips} ביום עדיין נחשב "כמעט נקי".</p>` : ''}`;
      }

      function whoBody() {
        const autoOk = draft.kind === 'good' && (draft.measure === 'quantity' || draft.measure === 'yesno');
        return `
          ${draft.kind === 'bad' ? '<div class="sheet-field-label">מי מסמן</div>' : ''}
          <div class="pill-row">${Object.entries(MARKED_BY).map(([k, l]) => {
            const disabled = k === 'auto' && !autoOk;
            return pill('data-w-who', k, disabled ? `${l} · בקרוב` : l, draft.markedBy === k, disabled ? 'disabled' : '');
          }).join('')}</div>
          ${draft.markedBy === 'coach' ? '<p class="wizard-hint">העוזר ישאל בבדיקת הערב ויסמן בשבילך.</p>' : ''}
          ${draft.markedBy === 'auto' && autoOk ? `
            <div class="sheet-field-label">נספר מ...</div>
            <div class="pill-row">${Object.entries(AUTO_LABELS).map(([k, l]) => pill('data-w-auto', k, l, draft.autoSource === k)).join('')}</div>
            ${draft.autoSource === AUTO_STEPS ? '<p class="wizard-hint">נספר מהצעדים היומיים שמגיעים מהאייפון.</p>' : ''}
            ${draft.autoSource === AUTO_STRENGTH ? '<p class="wizard-hint">כל יום עם אימון כוח שמור נספר כביצוע מלא.</p>' : ''}` : ''}`;
      }

      function summaryScreen() {
        const line = (step, label, value) => `
          <button type="button" class="wizard-line" data-w-jump="${step}">
            <span class="wizard-line-label">${label}</span>
            <span class="wizard-line-value">${value || '<span class="text-muted">—</span>'}</span>
            ${icon('chevron-left', { className: 'icon--sm' })}
          </button>`;
        const sched = draft.schedule.type === 'weekly' ? `${draft.schedule.perWeek} פעמים בשבוע`
          : draft.schedule.type === 'days' ? draft.schedule.days.map((d) => `${WEEKDAY_LETTERS[d]}׳`).join(' ') : 'כל יום';
        const target = draft.measure === 'steps' ? `${draft.steps.length} צעדים${draft.shortSteps.length ? ` · מקוצר ${draft.shortSteps.length}` : ''}`
          : draft.measure === 'quantity' ? `${fmt(draft.full)} ${draft.unit}${draft.short !== null ? ` · מקוצר ${fmt(draft.short)}` : ''}`
            : draft.measure === 'limit' ? `עד ${fmt(draft.full)} ${draft.unit}${draft.short !== null ? ` · מקוצר עד ${fmt(draft.short)}` : ''}`
              : (draft.kind === 'bad' ? BAD_MEASURES : GOOD_MEASURES)[draft.measure];
        const when = [draft.partOfDay && PARTS_OF_DAY[draft.partOfDay], draft.anchor, draft.reminder].filter(Boolean).map(esc).join(' · ');
        const lines = draft.kind === 'bad' ? [
          line('what', 'ההרגל', esc(draft.name)),
          line('why', 'מה הוא עולה', esc(draft.why)),
          line('trigger', 'טריגר', esc(draft.trigger)),
          line('instead', 'במקום', esc(draft.replacement)),
          line('friction', 'מקשים', esc(draft.friction)),
          line('measure', 'מדידה', `${esc(target)} · ${draft.cleanWeekTarget} ימים נקיים בשבוע · ${MARKED_BY[draft.markedBy]}`),
        ] : [
          line('what', 'ההרגל', `${esc(draft.name)} · ${AREAS[draft.area]}`),
          line('why', 'למה', esc(draft.why)),
          line('often', 'כל כמה', sched),
          line('done', 'ביצוע', esc(target)),
          line('when', 'מתי', when),
          line('who', 'מי מסמן', MARKED_BY[draft.markedBy]),
        ];
        return `
          <div class="wizard-summary-head">
            <span class="habit-icon">${icon(draft.icon) || icon('check')}</span>
            <h3 class="wizard-title">${esc(draft.name || 'הרגל')}</h3>
          </div>
          <div class="wizard-lines">${lines.join('')}</div>
          <p class="wizard-points"><span class="num">~${expectedWeekPoints(draft)}</span> נקודות בשבוע טוב${draft.kind === 'bad' ? ' · מעידה לא מורידה נקודות' : ''}</p>
          ${habit ? `<div class="pill-row">${pill('data-w-paused', '1', 'מושהה', !draft.active)}</div>` : ''}
          <div class="sheet-actions">
            ${habit ? '<button type="button" class="btn btn-danger" data-w-delete>מחיקה</button>' : '<button type="button" class="btn btn-secondary" data-w-back>הקודם</button>'}
            <button type="button" class="btn btn-primary" data-w-save>שמירה</button>
          </div>`;
      }

      // ---------- paint + wiring ----------

      function paint() {
        body.innerHTML = `<div class="wizard">${screen === 'start' ? startScreen() : screen === 'summary' ? summaryScreen() : stepScreen(screen)}</div>`;
        body.querySelector('[data-w-name]')?.addEventListener('input', (e) => { draft.name = e.target.value; });
        body.querySelectorAll('[data-w-text]').forEach((el) => el.addEventListener('input', () => { draft[el.dataset.wText] = el.value; }));
        body.querySelector('[data-w-anchor]')?.addEventListener('input', (e) => { draft.anchor = e.target.value; });
        body.querySelector('[data-w-parts]')?.addEventListener('input', (e) => { draft.partsText = e.target.value; });
        body.querySelector('[data-w-reminder]')?.addEventListener('change', (e) => { draft.reminder = e.target.value || null; });
        body.querySelectorAll('[data-w-step]').forEach((el) => el.addEventListener('input', () => { draft.steps[Number(el.dataset.wStep)] = el.value; }));
        body.querySelectorAll('[data-w-short-step]').forEach((el) => el.addEventListener('change', () => {
          const i = Number(el.dataset.wShortStep);
          draft.shortSteps = el.checked ? [...new Set([...draft.shortSteps, i])].sort((a, b) => a - b) : draft.shortSteps.filter((x) => x !== i);
        }));
        const fullHost = body.querySelector('[data-w-full]');
        if (fullHost) {
          mountNumericField(fullHost, { value: draft.full, unitLabel: draft.unit, ariaLabel: 'יעד מלא', nullable: true, max: MAX_VALUE, onCommit: (v) => { draft.full = v; } });
          mountNumericField(body.querySelector('[data-w-short]'), { value: draft.short, unitLabel: draft.unit, ariaLabel: 'יעד מקוצר', nullable: true, max: MAX_VALUE, onCommit: (v) => { draft.short = v; } });
        }
        body.querySelector('[data-w-scratch]')?.addEventListener('click', () => {
          draft = draftFrom({ name: '', kind: startKind, measure: startKind === 'bad' ? 'clean' : 'yesno' });
          go('what');
        });
        body.querySelector('[data-w-back]')?.addEventListener('click', back);
        body.querySelector('[data-w-next]')?.addEventListener('click', next);
        body.querySelector('[data-w-save]')?.addEventListener('click', () => save(sheetApi));
        body.querySelector('[data-w-delete]')?.addEventListener('click', async () => {
          const ok = await confirmDialog({
            title: 'למחוק את ההרגל?',
            message: `${esc(habit.name)} — הוא ייעלם מהמסך. אפשר גם להשהות במקום.`,
            confirmLabel: 'מחיקה',
            danger: true,
          });
          if (!ok) return;
          sheetApi.close();
          onDelete?.();
        });
      }

      function back() {
        if (editing) return go('summary');
        if (screen === 'summary') return go(steps()[5]);
        const i = steps().indexOf(screen);
        if (i <= 0) return habit ? go('summary') : go('start');
        go(steps()[i - 1]);
      }

      function next() {
        const problem = problemOn(draft, screen);
        if (problem) return showToast(problem);
        if (editing) return go('summary');
        const i = steps().indexOf(screen);
        go(i >= 5 ? 'summary' : steps()[i + 1]);
      }

      // One delegated listener for every pill and template.
      body.addEventListener('click', (e) => {
        const tpl = e.target.closest('[data-w-template]');
        if (tpl) {
          const list = startKind === 'bad' ? BAD_TEMPLATES : GOOD_TEMPLATES;
          const { id, ...fields } = list.find((t) => t.id === tpl.dataset.wTemplate);
          draft = draftFrom({ kind: startKind, ...fields });
          return go('what');
        }
        const jump = e.target.closest('[data-w-jump]');
        if (jump) {
          editing = true;
          return go(jump.dataset.wJump);
        }
        const btn = e.target.closest('.pill, [data-w-step-add], [data-w-step-remove]');
        if (!btn || btn.disabled) return;
        const ds = btn.dataset;
        if (ds.wKind) startKind = ds.wKind;
        else if (ds.wIcon) draft.icon = ds.wIcon;
        else if (ds.wArea) draft.area = ds.wArea;
        else if (ds.wSched === 'daily') draft.schedule = { type: 'daily' };
        else if (ds.wSched === 'weekly') draft.schedule = { type: 'weekly', perWeek: perWeek() };
        else if (ds.wSched === 'days') draft.schedule = { type: 'days', days: days().length ? days() : [new Date().getDay()] };
        else if (ds.wPer) draft.schedule = { type: 'weekly', perWeek: Number(ds.wPer) };
        else if (ds.wDay !== undefined) {
          const set = new Set(days());
          const day = Number(ds.wDay);
          if (set.has(day)) set.delete(day); else set.add(day);
          draft.schedule = { type: 'days', days: [...set].sort() };
        } else if (ds.wMeasure) {
          draft.measure = ds.wMeasure;
          if (ds.wMeasure === 'slips') { draft.full = 0; draft.short = BAD_HABITS.shortSlips; }
          if (ds.wMeasure === 'steps' && !draft.steps.length) draft.steps = [''];
        } else if (ds.wUnit) draft.unit = ds.wUnit;
        else if (ds.wPart) draft.partOfDay = draft.partOfDay === ds.wPart ? null : ds.wPart;
        else if (ds.wWho) {
          draft.markedBy = ds.wWho;
          if (ds.wWho !== 'auto') draft.autoSource = null;
          else if (!draft.autoSource) draft.autoSource = draft.unit === 'צעדים' ? AUTO_STEPS : AUTO_STRENGTH;
        } else if (ds.wAuto) {
          draft.autoSource = ds.wAuto;
          // Steps are counted as a quantity in צעדים; strength days as done / not.
          if (ds.wAuto === AUTO_STEPS) { draft.measure = 'quantity'; draft.unit = 'צעדים'; }
          else if (draft.measure !== 'quantity') draft.measure = 'yesno';
        } else if (ds.wTarget) draft.cleanWeekTarget = Number(ds.wTarget);
        else if (ds.wChip) draft.trigger = draft.trigger ? `${draft.trigger}, ${ds.wChip}` : ds.wChip;
        else if (ds.wPaused) draft.active = !draft.active;
        else if (btn.matches('[data-w-step-add]')) draft.steps.push('');
        else if (ds.wStepRemove !== undefined) {
          const i = Number(ds.wStepRemove);
          draft.steps.splice(i, 1);
          draft.shortSteps = draft.shortSteps.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x));
        } else return;
        paint();
      });

      paint();
    },
  });

  function save(sheetApi) {
    for (const id of draft.kind === 'bad' ? BAD_STEPS : GOOD_STEPS) {
      const problem = problemOn(draft, id);
      if (problem) return showToast(problem);
    }
    const steps = draft.steps.map((s) => s.trim());
    const keep = steps.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    const fields = {
      kind: draft.kind,
      name: draft.name.trim(),
      icon: draft.icon,
      area: draft.area,
      schedule: draft.kind === 'bad' ? { type: 'daily' } : draft.schedule,
      measure: draft.measure,
      unit: draft.unit,
      full: draft.full,
      short: draft.short,
      steps: draft.measure === 'steps' ? keep.map((i) => steps[i]) : [],
      shortSteps: draft.measure === 'steps' ? draft.shortSteps.filter((i) => keep.includes(i)).map((i) => keep.indexOf(i)) : [],
      autoSource: autoFor(draft),
      parts: draft.measure === 'quantity' || draft.measure === 'limit' ? partsFromText(draft.partsText) : [],
      active: draft.active,
      why: draft.why.trim(),
      partOfDay: draft.partOfDay,
      anchor: draft.anchor.trim(),
      reminder: draft.reminder,
      markedBy: draft.markedBy === 'auto' && !autoFor(draft) ? 'me' : draft.markedBy,
      ...(draft.kind === 'bad' ? {
        trigger: draft.trigger.trim(),
        replacement: draft.replacement.trim(),
        friction: draft.friction.trim(),
        cleanWeekTarget: draft.cleanWeekTarget,
      } : {}),
    };
    sheetApi.close();
    onSave(fields);
  }
}

// What stops screen `id` from moving on (and a save), or ''.
export function problemOn(d, id) {
  if (id === 'what' && !d.name.trim()) return 'צריך שם להרגל';
  if (id === 'often' && d.schedule.type === 'days' && !d.schedule.days.length) return 'בחרו לפחות יום אחד';
  if (id === 'done' || id === 'measure') {
    const counts = d.measure === 'quantity' || d.measure === 'limit';
    if (counts && d.full === null) return 'צריך יעד "מלא"';
    if (counts && d.short !== null) {
      if (d.measure === 'quantity' && d.short >= d.full) return '"מקוצר" צריך להיות פחות מ"מלא"';
      if (d.measure === 'limit' && d.short <= d.full) return 'במגבלה, "מקוצר" מרשה יותר מ"מלא"';
    }
    if (d.measure === 'steps' && !d.steps.some((s) => s.trim())) return 'צריך לפחות צעד אחד';
  }
  return '';
}
