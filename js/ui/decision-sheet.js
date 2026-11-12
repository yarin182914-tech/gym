// A decision ("להחליט", M6b) in a bottom sheet, from the question to the
// choice: the question → two triage questions → its track → done.
//   small:  a visible 2-minute timer, 2–4 options and the feet game
//           (js/ui/choosers/), or a pick by hand;
//   medium: options, up to 3 weighted criteria, scores, a good-enough bar,
//           10-10-10 and a computed suggestion.
// The decision is saved when its track starts (startedAt starts the clock),
// and again when the sheet closes, so closing half-way keeps it open in
// the list. The sheet only builds the data; saving is the caller's
// (onSave(id, patch, { isNew })) so the screen shows it at once.

import { openBottomSheet } from './bottom-sheet.js';
import { chooser, DEFAULT_CHOOSER } from './choosers/index.js';
import { icon } from './icon.js';
import { esc } from '../core/dom.js';
import { DECISIONS } from '../lib/rules.js';
import {
  TRACKS, IMPACTS, FEELINGS, normalizeDecision, triage, secondsLeft, optionScore, suggestion, pickRandom,
} from '../lib/decisions.js';
import { noonOf } from '../lib/tasks.js';
import { dateKey, shiftDays } from '../lib/sleep.js';

const newKey = () => Math.random().toString(36).slice(2, 8);
const newOption = (text = '') => ({ id: `o${newKey()}`, text, scores: {} });
const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function pill(attr, value, label, active) {
  return `<button type="button" class="pill${active ? ' active' : ''}" ${attr}="${esc(value)}" aria-pressed="${active}">${label}</button>`;
}

// decision: a stored one to go on with, or null for a new one (prefill:
// { question, source }). newId() makes the id of a new one; onDecided(text)
// runs once it's decided.
export function openDecisionSheet({ decision = null, prefill = {}, newId, onSave, onDecided }) {
  const isNew = !decision;
  const id = decision?.id || newId();
  const d = normalizeDecision(decision || { id, question: prefill.question || '', source: prefill.source || 'manual' });
  if (isNew) d.question = String(prefill.question || '');
  while (d.options.length < DECISIONS.minOptions) d.options.push(newOption());
  let saved = !isNew; // written at least once
  let step = d.startedAt ? d.track : (d.question ? 'triage' : 'question');
  let large = false;
  let drawn = null; // the option the game picked
  let chosen = d.choiceId;
  let playing = false;
  let timer = null;
  let game = null;

  // The fields that change while deciding.
  const patchOf = () => ({
    question: d.question, track: d.track, triage: d.triage, options: d.options, criteria: d.criteria,
    goodEnough: d.goodEnough, tenTenTen: d.tenTenTen, budgetSec: d.budgetSec, startedAt: d.startedAt,
    decideBy: d.decideBy, reopened: d.reopened, reason: d.reason, feeling: d.feeling, source: d.source,
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
        else if (step === 'triage') body.innerHTML = triageStep();
        else if (step === 'small') body.innerHTML = smallStep();
        else body.innerHTML = mediumStep();
        if (step === 'small' || step === 'medium') startTimer();
        if (step === 'small') mountGame();
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

      function triageStep() {
        const t = triage(d.triage);
        const pick = d.track && d.startedAt ? d.track : t.track;
        large = t.large;
        return `
          <h3 class="decision-title">${esc(d.question)}</h3>
          <div class="sheet-field-label">אפשר לחזור מזה?</div>
          <div class="pill-row">${pill('data-d-rev', 'yes', 'כן', d.triage.reversible === true)}${pill('data-d-rev', 'no', 'לא', d.triage.reversible === false)}</div>
          <div class="sheet-field-label">כמה זה ישנה בעוד שנה?</div>
          <div class="pill-row">${Object.entries(IMPACTS).map(([k, l]) => pill('data-d-impact', k, l, d.triage.impact === k)).join('')}</div>
          <div class="decision-track card">
            <div class="decision-track-head">${icon('split', { className: 'icon--sm' })} מסלול מוצע: <strong>${TRACKS[pick]}</strong></div>
            <p class="decision-hint">${pick === 'small'
              ? `${DECISIONS.budgetSec.small / 60} דקות, ואז הגרלה. רוב ההחלטות הקטנות לא שוות יותר.`
              : 'עד מחר בסוף היום: אפשרויות, מה חשוב לך, וציון.'}</p>
            ${large ? '<p class="decision-hint">נשמע כמו החלטה גדולה. מסלול גדול מגיע בקרוב, בינתיים בינוני.</p>' : ''}
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
        return `
          <div class="decision-options">
            ${d.options.map((o, i) => `
              <div class="decision-option">
                <input type="text" class="search-bar" data-d-option="${i}" maxlength="40" placeholder="אפשרות ${i + 1}" value="${esc(o.text)}">
                ${d.options.length > DECISIONS.minOptions ? `<button type="button" class="decision-remove" data-d-remove="${i}" aria-label="להסיר אפשרות ${i + 1}">${icon('x', { className: 'icon--sm' })}</button>` : ''}
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

      function mediumStep() {
        const sug = suggestion(d);
        const pickId = chosen || sug?.id || null;
        const named = d.options.filter((o) => o.text.trim());
        return `
          <h3 class="decision-title">${esc(d.question)}</h3>
          ${timerBar()}
          <div class="sheet-field-label">האפשרויות</div>
          ${optionInputs()}

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

          ${d.criteria.length && named.length ? `
            <div class="sheet-field-label">ציון: כמה כל אפשרות עונה על זה? (1–5)</div>
            <div class="decision-grid">
              ${named.map((o) => `
                <div class="decision-grid-row card">
                  <div class="decision-grid-name"><strong>${esc(o.text)}</strong><span class="num">${optionScore(o, d.criteria) ?? '–'}</span></div>
                  ${d.criteria.map((c) => `
                    <div class="decision-grid-crit">
                      <span class="text-muted">${esc(c.name || 'קריטריון')}</span>
                      <div class="decision-scores">${[1, 2, 3, 4, 5].map((s) => `<button type="button" class="decision-score${o.scores[c.id] === s ? ' active' : ''}" data-d-score="${o.id}|${c.id}|${s}" aria-pressed="${o.scores[c.id] === s}" aria-label="${s}">${s}</button>`).join('')}</div>
                    </div>`).join('')}
                </div>`).join('')}
            </div>
            <p class="decision-hint">"מספיק טוב" = ממוצע ${d.goodEnough} ומעלה. הראשונה שמגיעה לזה היא ההצעה.</p>` : ''}

          <div class="sheet-field-label">10-10-10</div>
          <textarea class="search-bar decision-text" data-d-ten rows="2" maxlength="300" placeholder="איך תרגיש עם זה בעוד 10 דקות, 10 חודשים ו־10 שנים?">${esc(d.tenTenTen)}</textarea>

          ${sug ? `
            <div class="decision-suggest card">
              ${icon('sparkles', { className: 'icon--sm' })} ההצעה: <strong>${esc(d.options.find((o) => o.id === sug.id)?.text || '')}</strong>
              <span class="num">${sug.score}</span> · ${sug.goodEnough ? 'מספיק טוב' : 'הכי גבוהה, אבל מתחת לסף'}
            </div>` : ''}

          <div class="sheet-field-label">הבחירה שלי</div>
          <div class="pill-row">${named.map((o) => pill('data-d-pick', o.id, esc(o.text), pickId === o.id)).join('') || '<span class="text-muted">כתוב קודם את האפשרויות.</span>'}</div>
          <input type="text" class="search-bar" data-d-reason maxlength="200" placeholder="למה? (משפט אחד)" value="${esc(d.reason)}" style="margin-top:8px;">
          <div class="sheet-field-label">איך זה מרגיש?</div>
          <div class="pill-row">${Object.entries(FEELINGS).map(([k, l]) => pill('data-d-feel', k, l, d.feeling === k)).join('')}</div>
          <div class="sheet-actions">
            ${saved ? '<button type="button" class="btn btn-secondary" data-d-drop>לוותר עליה</button>' : ''}
            <button type="button" class="btn btn-primary" data-d-decide${pickId && named.some((o) => o.id === pickId) ? '' : ' disabled'}>החלטתי</button>
          </div>`;
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

      function decide() {
        const pickId = step === 'medium' ? (chosen || suggestion(d)?.id) : chosen;
        if (!pickId) return;
        const method = step === 'medium' ? (pickId === suggestion(d)?.id ? 'score' : 'manual') : (pickId === drawn ? 'feet' : 'manual');
        d.status = 'decided';
        clearInterval(timer);
        onSave(id, {
          ...patchOf(), choiceId: pickId, method, status: 'decided', decidedAt: new Date(),
        }, { isNew: !saved });
        saved = true;
        const text = d.options.find((o) => o.id === pickId)?.text || '';
        sheet.close();
        onDecided?.(text);
      }

      // ---------- events ----------

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
      });
      // A field left is saved (the app may be closed before the sheet is).
      // Medium: names typed in feed the score grid then too.
      body.addEventListener('change', (e) => {
        if (d.startedAt && d.status === 'open') persist();
        if (step === 'medium' && e.target.matches('[data-d-option], [data-d-crit]')) render();
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
          step = 'triage';
          return render();
        }
        if (a.dRev) {
          d.triage.reversible = a.dRev === 'yes';
          d.track = triage(d.triage).track;
          return render();
        }
        if (a.dImpact) {
          d.triage.impact = a.dImpact;
          d.track = triage(d.triage).track;
          return render();
        }
        if (a.dTrack) {
          d.track = a.dTrack;
          d.startedAt = null;
          body.querySelector('[data-d-start]').dataset.dStart = a.dTrack;
          body.querySelectorAll('[data-d-track]').forEach((b) => {
            const on = b.dataset.dTrack === a.dTrack;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', String(on));
          });
          return;
        }
        if (a.dStart) {
          d.track = a.dStart;
          d.budgetSec = DECISIONS.budgetSec[d.track];
          d.startedAt = new Date();
          // Medium has a day to decide: its date is known from the start.
          d.decideBy = d.track === 'medium' ? noonOf(shiftDays(dateKey(new Date()), DECISIONS.mediumDaysToDecide)) : null;
          persist({ status: 'open' });
          step = d.track;
          return render();
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
        if (a.dDecide !== undefined) return decide();
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
