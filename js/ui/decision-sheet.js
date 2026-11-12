// A decision ("להחליט", M6b/M6c) in a bottom sheet, from the question to the
// choice: the question → (a matching personal rule?) → two triage
// questions → its track → done.
//   rule:   one of the user's rules carries a keyword of the question —
//           "להשתמש בכלל" decides it at once;
//   small:  a visible 2-minute timer, 2–4 options and the feet game
//           (js/ui/choosers/), or a pick by hand;
//   medium: options, up to 3 weighted criteria, scores, a good-enough bar,
//           10-10-10 and a computed suggestion;
//   large:  a decide-by date (a week by default) and the WRAP steps —
//           options (3+), a friend's advice, the score check, 10-10-10, a
//           premortem and a small experiment. Every step is optional and
//           "החלטתי" is on each.
// Once decided, it offers to turn the decision into a rule.
// The decision is saved when its track starts (startedAt starts the clock),
// and again when the sheet closes, so closing half-way keeps it open in
// the list. The sheet only builds the data; saving is the caller's
// (onSave(id, patch, { isNew }), onSaveRule(data)) so the screen shows it
// at once.

import { openBottomSheet } from './bottom-sheet.js';
import { chooser, DEFAULT_CHOOSER } from './choosers/index.js';
import { mountDateField, friendlyDate } from './date-time-picker.js';
import { ruleFormHtml, readRuleForm } from './decision-rules.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';
import { DECISIONS } from '../lib/rules.js';
import {
  TRACKS, IMPACTS, FEELINGS, normalizeDecision, triage, secondsLeft, optionScore, suggestion, pickRandom,
  daysLeft, largeDecideByKey, matchRule, suggestKeywords,
} from '../lib/decisions.js';
import { noonOf } from '../lib/tasks.js';
import { dateKey, shiftDays } from '../lib/sleep.js';
import { toDate } from '../lib/format.js';

const newKey = () => Math.random().toString(36).slice(2, 8);
const newOption = (text = '') => ({ id: `o${newKey()}`, text, scores: {} });
const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const FAR = '2099-12-31';
const minOptions = (track) => (track === 'large' ? DECISIONS.minOptionsLarge : DECISIONS.minOptions);

// The large track's steps, in order. Each is optional.
const LARGE_STEPS = [
  ['options', 'אפשרויות'],
  ['friend', 'חבר'],
  ['reality', 'ציון'],
  ['distance', '10-10-10'],
  ['premortem', 'מה ישתבש'],
  ['experiment', 'ניסוי'],
  ['choose', 'החלטה'],
];
const EXPERIMENT_DAYS = [[1, 'מחר'], [3, '3 ימים'], [7, 'שבוע']];

function pill(attr, value, label, active) {
  return `<button type="button" class="pill${active ? ' active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${label}</button>`;
}

// decision: a stored one to go on with, or null for a new one (prefill:
// { question, source }). newId() makes the id of a new one; onDecided(text)
// runs once it's decided. rules: the user's personal rules (normalized);
// onSaveRule(data) saves a new one ({ name, rule, keywords, fromDecisionId }).
export function openDecisionSheet({ decision = null, prefill = {}, newId, onSave, onDecided, rules = [], onSaveRule = null }) {
  const isNew = !decision;
  const id = decision?.id || newId();
  const d = normalizeDecision(decision || { id, question: prefill.question || '', source: prefill.source || 'manual' });
  if (isNew) d.question = String(prefill.question || '');
  while (d.options.length < minOptions(d.startedAt ? d.track : 'small')) d.options.push(newOption());
  let saved = !isNew; // written at least once
  let step = d.startedAt ? d.track : (d.question ? 'triage' : 'question');
  let largeStep = 'options';
  let manualTrack = null; // a track picked by hand on the triage step
  let drawn = null; // the option the game picked
  let chosen = d.choiceId;
  let playing = false;
  let timer = null;
  let game = null;
  let matched = null; // the rule the question matched
  let ruleOpen = false; // "להפוך לכלל?" form showing
  let decidedText = '';

  // The fields that change while deciding.
  const patchOf = () => ({
    question: d.question, track: d.track, triage: d.triage, options: d.options, criteria: d.criteria,
    goodEnough: d.goodEnough, tenTenTen: d.tenTenTen, budgetSec: d.budgetSec, startedAt: d.startedAt,
    decideBy: d.decideBy, reopened: d.reopened, reason: d.reason, feeling: d.feeling, source: d.source,
    friendAdvice: d.friendAdvice, premortem: d.premortem, experiment: d.experiment,
  });

  function persist(extra = {}) {
    onSave(id, { ...patchOf(), ...extra }, { isNew: !saved });
    saved = true;
  }

  openBottomSheet({
    ariaLabel: 'החלטה',
    onClose() {
      clearInterval(timer);
      // Half-way: keep what was written, the decision stays open.
      if (d.status === 'open' && d.startedAt) persist();
    },
    render(body, sheet) {
      function render() {
        clearInterval(timer);
        game = null;
        if (step === 'question') body.innerHTML = questionStep();
        else if (step === 'rule') body.innerHTML = ruleStep();
        else if (step === 'triage') body.innerHTML = triageStep();
        else if (step === 'small') body.innerHTML = smallStep();
        else if (step === 'large') body.innerHTML = largeView();
        else if (step === 'done') body.innerHTML = doneStep();
        else body.innerHTML = mediumStep();
        if (step === 'small' || step === 'medium') startTimer();
        if (step === 'small') mountGame();
        if (step === 'large') mountDecideBy();
        if (step === 'question') body.querySelector('[data-d-question]')?.focus();
      }

      // ---------- steps ----------

      function questionStep() {
        return `
          <h3 class="decision-title">החלטה חדשה</h3>
          <p class="decision-hint">על מה צריך להחליט?</p>
          <input type="text" class="search-bar" data-d-question maxlength="120" placeholder="למשל: איזו מסעדה הערב?" value="${esc(d.question)}">
          <div class="sheet-actions">
            <button type="button" class="btn btn-primary" data-d-next>המשך</button>
          </div>`;
      }

      // A personal rule fits the question: decide by it in one tap.
      function ruleStep() {
        return `
          <h3 class="decision-title">${esc(d.question)}</h3>
          <div class="decision-track card decision-rule-match">
            <div class="decision-track-head">${icon('bookmark', { className: 'icon--sm' })} יש לך כלל לזה</div>
            <div class="decision-result-choice">${esc(matched.name)}: ${esc(matched.rule)}</div>
            <p class="decision-hint">החלטת על זה כבר פעם. אין צורך להתלבט שוב.</p>
          </div>
          <div class="sheet-actions">
            <button type="button" class="btn btn-secondary" data-d-skip-rule>לא הפעם</button>
            <button type="button" class="btn btn-primary" data-d-use-rule>להשתמש בכלל</button>
          </div>`;
      }

      function triageStep() {
        const t = triage(d.triage);
        const pick = manualTrack || (d.startedAt ? d.track : t.track);
        const hints = {
          small: `${DECISIONS.budgetSec.small / 60} דקות, ואז הגרלה. רוב ההחלטות הקטנות לא שוות יותר.`,
          medium: 'עד מחר בסוף היום: אפשרויות, מה חשוב לך, וציון.',
          large: `${DECISIONS.decideByDays} ימים לחשוב, בשלבים. כל שלב רשות, ואפשר להחליט בכל רגע.`,
        };
        return `
          <h3 class="decision-title">${esc(d.question)}</h3>
          <div class="sheet-field-label">אפשר לחזור מזה?</div>
          <div class="pill-row">${pill('data-d-rev', 'yes', 'כן', d.triage.reversible === true)}${pill('data-d-rev', 'no', 'לא', d.triage.reversible === false)}</div>
          <div class="sheet-field-label">כמה זה ישנה בעוד שנה?</div>
          <div class="pill-row">${Object.entries(IMPACTS).map(([k, l]) => pill('data-d-impact', k, l, d.triage.impact === k)).join('')}</div>
          <div class="decision-track card">
            <div class="decision-track-head">${icon('split', { className: 'icon--sm' })} מסלול מוצע: <strong data-d-track-name>${TRACKS[pick]}</strong></div>
            <p class="decision-hint" data-d-track-hint>${hints[pick]}</p>
            <div class="pill-row">${Object.entries(TRACKS).map(([k, l]) => pill('data-d-track', k, l, pick === k)).join('')}</div>
          </div>
          <div class="sheet-actions">
            <button type="button" class="btn btn-primary" data-d-start="${pick}">להתחיל</button>
          </div>`;
      }

      function timerBar() {
        const left = secondsLeft(d);
        const over = left === 0;
        const share = Math.max(0, Math.min(1, left / d.budgetSec));
        const note = d.track === 'medium'
          ? (over ? 'עברו 10 הדקות. עדיין בזמן עד מחר בסוף היום.' : 'אפשר גם עד מחר בסוף היום.')
          : (over ? 'הזמן נגמר. עדיין אפשר להחליט עכשיו.' : '');
        return `
          <div class="decision-timer${over ? ' decision-timer--over' : ''}" data-d-timer>
            <span class="decision-timer-clock num" dir="ltr">${clock(left)}</span>
            <span class="decision-timer-track"><span class="decision-timer-fill" style="transform:scaleX(${share})"></span></span>
          </div>
          ${note ? `<p class="decision-hint" data-d-timer-note>${note}</p>` : ''}`;
      }

      function optionInputs() {
        const min = minOptions(d.track);
        return `
          <div class="decision-options">
            ${d.options.map((o, i) => `
              <div class="decision-option">
                <input type="text" class="search-bar" data-d-option="${i}" maxlength="40" placeholder="אפשרות ${i + 1}" value="${esc(o.text)}">
                ${d.options.length > min ? `<button type="button" class="decision-remove" data-d-remove="${i}" aria-label="להסיר אפשרות ${i + 1}">${icon('x', { className: 'icon--sm' })}</button>` : ''}
              </div>`).join('')}
          </div>
          ${d.options.length < DECISIONS.maxOptions ? '<button type="button" class="btn-mini-dashed" data-d-add>+ הוספת אפשרות</button>' : ''}`;
      }

      function smallStep() {
        return `
          <h3 class="decision-title">${esc(d.question)}</h3>
          ${timerBar()}
          ${optionInputs()}
          <div class="decision-game" data-d-game></div>
          <div data-d-result>${resultBlock()}</div>`;
      }

      // The game's outcome, or the draw button before it.
      function resultBlock() {
        const filled = d.options.filter((o) => o.text.trim()).length === d.options.length;
        if (playing) return '<p class="decision-hint decision-center">מתופפים…</p>';
        if (!chosen) {
          return `
            <button type="button" class="btn btn-primary decision-draw" data-d-draw${filled ? '' : ' disabled'}>${icon('shuffle', { className: 'icon--sm' })} להגריל</button>
            ${filled ? '' : '<p class="decision-hint decision-center">כתוב משהו על כל רגל.</p>'}
            <div class="sheet-field-label">או לבחור ביד</div>
            <div class="pill-row">${d.options.map((o) => pill('data-d-choose', o.id, esc(o.text || '…'), false)).join('')}</div>`;
        }
        const text = d.options.find((o) => o.id === chosen)?.text || '';
        const others = d.options.filter((o) => o.id !== chosen);
        return `
          <div class="decision-result card">
            <div class="decision-result-label">${drawn === chosen ? 'הרגל בחרה' : 'בחרת'}</div>
            <div class="decision-result-choice">${esc(text)}</div>
            <div class="sheet-field-label">איך הרגשת כשזה יצא?</div>
            <div class="pill-row">${Object.entries(FEELINGS).map(([k, l]) => pill('data-d-feel', k, l, d.feeling === k)).join('')}</div>
            ${d.feeling === 'disappointed' ? `
              <p class="decision-hint">התאכזבת? זו תחושת הבטן. מותר לבחור באחרת.</p>
              <div class="pill-row">${others.map((o) => pill('data-d-choose', o.id, esc(o.text), false)).join('')}</div>` : ''}
          </div>
          <div class="sheet-actions">
            ${drawn ? '<button type="button" class="btn btn-secondary" data-d-redraw>להגריל שוב</button>' : ''}
            <button type="button" class="btn btn-primary" data-d-decide>החלטתי</button>
          </div>`;
      }

      // ---------- medium and large blocks ----------

      const named = () => d.options.filter((o) => o.text.trim());
      const pickIdOf = () => chosen || suggestion(d)?.id || null;

      function criteriaBlock() {
        const list = named();
        return `
          <div class="sheet-field-label">מה חשוב לך? (עד ${DECISIONS.maxCriteria})</div>
          <div class="decision-criteria">
            ${d.criteria.map((c, i) => `
              <div class="decision-criterion">
                <input type="text" class="search-bar" data-d-crit="${i}" maxlength="30" placeholder="למשל: מחיר" value="${esc(c.name)}">
                <div class="pill-row decision-weights" aria-label="משקל">${DECISIONS.weights.map((w) => pill('data-d-weight', `${i}|${w}`, '★'.repeat(w), c.weight === w)).join('')}</div>
                <button type="button" class="decision-remove" data-d-crit-remove="${i}" aria-label="להסיר">${icon('x', { className: 'icon--sm' })}</button>
              </div>`).join('')}
          </div>
          ${d.criteria.length < DECISIONS.maxCriteria ? '<button type="button" class="btn-mini-dashed" data-d-crit-add>+ קריטריון</button>' : ''}

          ${d.criteria.length && list.length ? `
            <div class="sheet-field-label">ציון: כמה כל אפשרות עונה על זה? (1–5)</div>
            <div class="decision-grid">
              ${list.map((o) => `
                <div class="decision-grid-row card">
                  <div class="decision-grid-name"><strong>${esc(o.text)}</strong><span class="num">${optionScore(o, d.criteria) ?? '–'}</span></div>
                  ${d.criteria.map((c) => `
                    <div class="decision-grid-crit">
                      <span class="text-muted">${esc(c.name || 'קריטריון')}</span>
                      <div class="decision-scores">${[1, 2, 3, 4, 5].map((s) => `<button type="button" class="decision-score${o.scores[c.id] === s ? ' active' : ''}" data-d-score="${o.id}|${c.id}|${s}" aria-pressed="${o.scores[c.id] === s}" aria-label="${s}">${s}</button>`).join('')}</div>
                    </div>`).join('')}
                </div>`).join('')}
            </div>
            <p class="decision-hint">"מספיק טוב" = ממוצע ${d.goodEnough} ומעלה. הראשונה שמגיעה לזה היא ההצעה.</p>` : ''}`;
      }

      const tenBlock = () => `
        <div class="sheet-field-label">10-10-10</div>
        <textarea class="search-bar decision-text" data-d-ten rows="2" maxlength="300" placeholder="איך תרגיש עם זה בעוד 10 דקות, 10 חודשים ו־10 שנים?">${esc(d.tenTenTen)}</textarea>`;

      function suggestBlock() {
        const sug = suggestion(d);
        return sug ? `
          <div class="decision-suggest card">
            ${icon('sparkles', { className: 'icon--sm' })} ההצעה: <strong>${esc(d.options.find((o) => o.id === sug.id)?.text || '')}</strong>
            <span class="num">${sug.score}</span> · ${sug.goodEnough ? 'מספיק טוב' : 'הכי גבוהה, אבל מתחת לסף'}
          </div>` : '';
      }

      function chooseBlock() {
        const list = named();
        const pickId = pickIdOf();
        return `
          <div class="sheet-field-label">הבחירה שלי</div>
          <div class="pill-row">${list.map((o) => pill('data-d-pick', o.id, esc(o.text), pickId === o.id)).join('') || '<span class="text-muted">כתוב קודם את האפשרויות.</span>'}</div>
          <input type="text" class="search-bar" data-d-reason maxlength="200" placeholder="למה? (משפט אחד)" value="${esc(d.reason)}" style="margin-top:8px;">
          <div class="sheet-field-label">איך זה מרגיש?</div>
          <div class="pill-row">${Object.entries(FEELINGS).map(([k, l]) => pill('data-d-feel', k, l, d.feeling === k)).join('')}</div>`;
      }

      const canDecide = () => {
        const pickId = pickIdOf();
        return !!pickId && named().some((o) => o.id === pickId);
      };

      function mediumStep() {
        return `
          <h3 class="decision-title">${esc(d.question)}</h3>
          ${timerBar()}
          <div class="sheet-field-label">האפשרויות</div>
          ${optionInputs()}
          ${criteriaBlock()}
          ${tenBlock()}
          ${suggestBlock()}
          ${chooseBlock()}
          <div class="sheet-actions">
            ${saved ? '<button type="button" class="btn btn-secondary" data-d-drop>לוותר עליה</button>' : ''}
            <button type="button" class="btn btn-primary" data-d-decide${canDecide() ? '' : ' disabled'}>החלטתי</button>
          </div>`;
      }

      // ---------- large ----------

      function decideByLine() {
        const left = daysLeft(d);
        const text = left === null ? '' : left > 1 ? `עוד ${left} ימים` : left === 1 ? 'עד מחר' : left === 0 ? 'היום' : 'התאריך עבר. אפשר להזיז, או להחליט עכשיו.';
        return `
          <div class="decision-by">
            <span class="decision-by-label">${icon('calendar-days', { className: 'icon--sm' })} להחליט עד</span>
            <div class="decision-by-field" data-d-by></div>
          </div>
          <p class="decision-hint" data-d-by-left>${text}</p>`;
      }

      function largeBody() {
        if (largeStep === 'options') {
          return `
            <p class="decision-hint">לפחות ${DECISIONS.minOptionsLarge}. ואם אף אחת מהן לא הייתה קיימת, מה היית עושה?</p>
            ${optionInputs()}`;
        }
        if (largeStep === 'friend') {
          return `
            <p class="decision-hint">חבר טוב שואל אותך בדיוק את השאלה הזאת. מה היית אומר לו?</p>
            <textarea class="search-bar decision-text" data-d-friend rows="3" maxlength="400" placeholder="הייתי אומר לו…">${esc(d.friendAdvice)}</textarea>`;
        }
        if (largeStep === 'reality') return `<p class="decision-hint">רשות: מה חשוב לך, וכמה כל אפשרות עונה על זה.</p>${criteriaBlock()}${suggestBlock()}`;
        if (largeStep === 'distance') return tenBlock();
        if (largeStep === 'premortem') {
          return `
            <p class="decision-hint">עברה שנה, ובחרת, וזה לא הצליח. מה הכי סביר שקרה? כך אפשר להתכונן מראש.</p>
            <textarea class="search-bar decision-text" data-d-premortem rows="3" maxlength="400" placeholder="זה לא הצליח כי…">${esc(d.premortem)}</textarea>`;
        }
        if (largeStep === 'experiment') {
          const exp = d.experiment || { text: '', by: null, learned: '' };
          const byKey = exp.by ? dateKey(toDate(exp.by)) : null;
          return `
            <p class="decision-hint">צעד קטן שבודק לפני שמתחייבים. למשל: לדבר עם מישהו שעשה את זה, או לנסות שבוע.</p>
            <input type="text" class="search-bar" data-d-exp maxlength="120" placeholder="מה בודקים?" value="${esc(exp.text)}">
            ${exp.text.trim() ? `
              <div class="sheet-field-label">עד מתי? (רשות)</div>
              <div class="pill-row">${EXPERIMENT_DAYS.map(([n, l]) => pill('data-d-exp-by', n, l, false)).join('')}${pill('data-d-exp-by', 0, 'בלי', !byKey)}</div>
              ${byKey ? `<p class="decision-hint">עד ${friendlyDate(byKey)}</p>` : ''}
              <div class="sheet-field-label">מה למדתי?</div>
              <textarea class="search-bar decision-text" data-d-learned rows="2" maxlength="300" placeholder="אחרי הניסוי">${esc(exp.learned)}</textarea>` : ''}`;
        }
        return `${suggestBlock()}${chooseBlock()}`;
      }

      function largeView() {
        const i = LARGE_STEPS.findIndex(([k]) => k === largeStep);
        const last = i === LARGE_STEPS.length - 1;
        return `
          <h3 class="decision-title">${esc(d.question)}</h3>
          ${decideByLine()}
          <nav class="decision-steps" aria-label="שלבים">
            ${LARGE_STEPS.map(([k, l], n) => `<button type="button" class="decision-step${k === largeStep ? ' active' : ''}" data-d-lstep="${k}"${k === largeStep ? ' aria-current="step"' : ''}><span class="num">${n + 1}</span> ${l}</button>`).join('')}
          </nav>
          <div class="decision-large-body">${largeBody()}</div>
          <div class="sheet-actions">
            ${saved ? '<button type="button" class="btn btn-secondary" data-d-drop>לוותר עליה</button>' : ''}
            ${last
              ? `<button type="button" class="btn btn-primary" data-d-decide${canDecide() ? '' : ' disabled'}>החלטתי</button>`
              : `<button type="button" class="btn btn-secondary" data-d-lstep="${LARGE_STEPS[i + 1][0]}">הבא</button>
                 <button type="button" class="btn btn-primary" data-d-lstep="choose">החלטתי</button>`}
          </div>`;
      }

      function mountDecideBy() {
        const host = body.querySelector('[data-d-by]');
        if (!host) return;
        const value = d.decideBy ? dateKey(toDate(d.decideBy)) : largeDecideByKey(dateKey(new Date()));
        mountDateField(host, {
          value,
          max: FAR,
          compact: true,
          ariaLabel: 'להחליט עד',
          onChange: (v) => {
            d.decideBy = noonOf(v);
            persist();
            const left = daysLeft(d);
            const p = body.querySelector('[data-d-by-left]');
            if (p) p.textContent = left > 1 ? `עוד ${left} ימים` : left === 1 ? 'עד מחר' : left === 0 ? 'היום' : 'התאריך עבר. אפשר להזיז, או להחליט עכשיו.';
          },
        });
      }

      // ---------- done: offer a rule ----------

      function doneStep() {
        return `
          <div class="decision-result card">
            <div class="decision-result-label">${icon('check', { className: 'icon--sm' })} החלטת</div>
            <div class="decision-result-choice">${esc(decidedText)}</div>
          </div>
          ${ruleOpen ? `
            <h3 class="decision-title decision-rule-head">כלל חדש</h3>
            ${ruleFormHtml({ name: suggestKeywords(d.question)[0] || '', rule: decidedText, keywords: suggestKeywords(d.question) })}
            <div class="sheet-actions">
              <button type="button" class="btn btn-secondary" data-d-done>בלי כלל</button>
              <button type="button" class="btn btn-primary" data-d-rule-save>לשמור כלל</button>
            </div>` : `
            ${onSaveRule ? `
              <div class="decision-track card">
                <div class="decision-track-head">${icon('bookmark', { className: 'icon--sm' })} זה חוזר על עצמו?</div>
                <p class="decision-hint">הפוך את זה לכלל, ובפעם הבאה זה ייסגר בלחיצה. +${DECISIONS.ruleNew} נקודות.</p>
                <button type="button" class="btn-mini-dashed" data-d-rule-open>להפוך לכלל</button>
              </div>` : ''}
            <div class="sheet-actions">
              <button type="button" class="btn btn-primary" data-d-done>סיום</button>
            </div>`}`;
      }

      // ---------- live parts ----------

      function startTimer() {
        const tick = () => {
          const host = body.querySelector('[data-d-timer]');
          if (!host) return;
          const left = secondsLeft(d);
          host.querySelector('.decision-timer-clock').textContent = clock(left);
          host.querySelector('.decision-timer-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, left / d.budgetSec))})`;
          if (left === 0 && !host.classList.contains('decision-timer--over')) {
            host.classList.add('decision-timer--over');
            clearInterval(timer);
            const note = d.track === 'medium' ? 'עברו 10 הדקות. עדיין בזמן עד מחר בסוף היום.' : 'הזמן נגמר. עדיין אפשר להחליט עכשיו.';
            const p = body.querySelector('[data-d-timer-note]');
            if (p) p.textContent = note;
            else host.insertAdjacentHTML('afterend', `<p class="decision-hint" data-d-timer-note>${note}</p>`);
          }
        };
        timer = setInterval(tick, 1000);
      }

      function mountGame() {
        const host = body.querySelector('[data-d-game]');
        game = chooser(DEFAULT_CHOOSER).mount(host, d.options.map((o) => o.text));
      }

      const renderResult = () => {
        const host = body.querySelector('[data-d-result]');
        if (host) host.innerHTML = resultBlock();
      };

      async function draw({ again = false } = {}) {
        if (playing || !game) return;
        if (again) d.reopened = true;
        persist();
        const winner = pickRandom(d.options.length);
        playing = true;
        chosen = null;
        d.feeling = null;
        renderResult();
        body.querySelectorAll('[data-d-option], [data-d-remove], [data-d-add]').forEach((n) => { n.disabled = true; });
        await game.play(winner);
        playing = false;
        drawn = d.options[winner].id;
        chosen = drawn;
        body.querySelectorAll('[data-d-option], [data-d-remove], [data-d-add]').forEach((n) => { n.disabled = false; });
        renderResult();
        body.querySelector('.decision-result')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }

      function finish(text) {
        decidedText = text;
        onDecided?.(text);
        step = 'done';
        render();
      }

      function decide() {
        const scored = step === 'medium' || step === 'large';
        const pickId = scored ? pickIdOf() : chosen;
        if (!pickId) return;
        const method = scored ? (pickId === suggestion(d)?.id ? 'score' : 'manual') : (pickId === drawn ? 'feet' : 'manual');
        d.status = 'decided';
        clearInterval(timer);
        onSave(id, {
          ...patchOf(), choiceId: pickId, method, status: 'decided', decidedAt: new Date(),
        }, { isNew: !saved });
        saved = true;
        finish(d.options.find((o) => o.id === pickId)?.text || '');
      }

      // Decided by a personal rule: a small one, on time, closed at once.
      function useRule() {
        const now = new Date();
        const option = newOption(matched.rule);
        Object.assign(d, { track: 'small', options: [option], criteria: [], budgetSec: DECISIONS.budgetSec.small, startedAt: now, decideBy: null, status: 'decided' });
        onSave(id, {
          ...patchOf(), choiceId: option.id, method: 'rule', ruleId: matched.id, status: 'decided', decidedAt: now,
        }, { isNew: !saved });
        saved = true;
        onDecided?.(matched.rule);
        sheet.close();
      }

      // ---------- events ----------

      const experiment = () => {
        d.experiment = d.experiment || { text: '', by: null, learned: '' };
        return d.experiment;
      };

      body.addEventListener('input', (e) => {
        const t = e.target;
        if (t.matches('[data-d-question]')) d.question = t.value;
        else if (t.matches('[data-d-option]')) {
          const i = Number(t.dataset.dOption);
          d.options[i].text = t.value;
          if (step === 'small') {
            body.querySelectorAll('.feet-label')[i].textContent = t.value || `אפשרות ${i + 1}`;
            if (!chosen && !playing) renderResult();
          }
        } else if (t.matches('[data-d-crit]')) d.criteria[Number(t.dataset.dCrit)].name = t.value;
        else if (t.matches('[data-d-ten]')) d.tenTenTen = t.value;
        else if (t.matches('[data-d-reason]')) d.reason = t.value;
        else if (t.matches('[data-d-friend]')) d.friendAdvice = t.value;
        else if (t.matches('[data-d-premortem]')) d.premortem = t.value;
        else if (t.matches('[data-d-exp]')) experiment().text = t.value;
        else if (t.matches('[data-d-learned]')) experiment().learned = t.value;
      });
      // A field left is saved (the app may be closed before the sheet is).
      // Medium and large: names typed in feed the score grid then too; the
      // experiment's text opens its date and "what I learned".
      body.addEventListener('change', (e) => {
        if (d.startedAt && d.status === 'open') persist();
        if ((step === 'medium' || step === 'large') && e.target.matches('[data-d-option], [data-d-crit], [data-d-exp]')) render();
      });
      body.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('[data-d-question]')) body.querySelector('[data-d-next]')?.click();
      });

      body.addEventListener('click', (e) => {
        const el = e.target.closest('button');
        if (!el || el.disabled || !body.contains(el)) return;
        const a = el.dataset;
        if (a.dNext !== undefined) {
          if (!d.question.trim()) return body.querySelector('[data-d-question]').focus();
          matched = matchRule(d.question, rules);
          step = matched ? 'rule' : 'triage';
          return render();
        }
        if (a.dUseRule !== undefined) return useRule();
        if (a.dSkipRule !== undefined) {
          step = 'triage';
          return render();
        }
        if (a.dRev) {
          d.triage.reversible = a.dRev === 'yes';
          manualTrack = null;
          d.track = triage(d.triage).track;
          return render();
        }
        if (a.dImpact) {
          d.triage.impact = a.dImpact;
          manualTrack = null;
          d.track = triage(d.triage).track;
          return render();
        }
        if (a.dTrack) {
          d.track = a.dTrack;
          manualTrack = a.dTrack;
          d.startedAt = null;
          return render();
        }
        if (a.dStart) {
          d.track = a.dStart;
          d.budgetSec = DECISIONS.budgetSec[d.track];
          d.startedAt = new Date();
          // Medium has a day to decide, large a week: the date is known from the start.
          const today = dateKey(new Date());
          d.decideBy = d.track === 'medium' ? noonOf(shiftDays(today, DECISIONS.mediumDaysToDecide))
            : d.track === 'large' ? noonOf(largeDecideByKey(today)) : null;
          while (d.options.length < minOptions(d.track)) d.options.push(newOption());
          persist({ status: 'open' });
          step = d.track;
          return render();
        }
        if (a.dLstep) {
          largeStep = a.dLstep;
          render();
          body.querySelector('.decision-steps .active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          return;
        }
        if (a.dAdd !== undefined) {
          d.options.push(newOption());
          chosen = null;
          drawn = null;
          render();
          body.querySelector(`[data-d-option="${d.options.length - 1}"]`)?.focus();
          return;
        }
        if (a.dRemove) {
          d.options.splice(Number(a.dRemove), 1);
          chosen = null;
          drawn = null;
          return render();
        }
        if (a.dDraw !== undefined) return draw();
        if (a.dRedraw !== undefined) return draw({ again: true });
        if (a.dChoose) {
          chosen = a.dChoose;
          if (step === 'small') game?.reset();
          return renderResult();
        }
        if (a.dFeel) {
          d.feeling = a.dFeel;
          if (step === 'small') return renderResult();
          return render();
        }
        if (a.dCritAdd !== undefined) {
          d.criteria.push({ id: `c${newKey()}`, name: '', weight: 2 });
          render();
          body.querySelector(`[data-d-crit="${d.criteria.length - 1}"]`)?.focus();
          return;
        }
        if (a.dCritRemove) {
          const [c] = d.criteria.splice(Number(a.dCritRemove), 1);
          d.options.forEach((o) => { delete o.scores[c.id]; });
          return render();
        }
        if (a.dWeight) {
          const [i, w] = a.dWeight.split('|').map(Number);
          d.criteria[i].weight = w;
          return render();
        }
        if (a.dScore) {
          const [oid, cid, s] = a.dScore.split('|');
          const o = d.options.find((x) => x.id === oid);
          if (o) o.scores[cid] = Number(s);
          return render();
        }
        if (a.dPick) {
          chosen = a.dPick;
          return render();
        }
        if (a.dExpBy !== undefined) {
          const n = Number(a.dExpBy);
          experiment().by = n ? noonOf(shiftDays(dateKey(new Date()), n)) : null;
          persist();
          return render();
        }
        if (a.dDecide !== undefined) return decide();
        if (a.dRuleOpen !== undefined) {
          ruleOpen = true;
          render();
          body.querySelector('[data-r-rule]')?.focus();
          return;
        }
        if (a.dRuleSave !== undefined) {
          const data = readRuleForm(body);
          if (!data) return body.querySelector(body.querySelector('[data-r-rule]').value.trim() ? '[data-r-keywords]' : '[data-r-rule]').focus();
          onSaveRule({ ...data, fromDecisionId: id });
          return sheet.close();
        }
        if (a.dDone !== undefined) return sheet.close();
        if (a.dDrop !== undefined) {
          // Kept, not deleted: it just leaves the open list.
          d.status = 'dropped';
          clearInterval(timer);
          onSave(id, { ...patchOf(), status: 'dropped' }, { isNew: !saved });
          sheet.close();
        }
      });

      render();
    },
  });
}
