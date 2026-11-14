// The progress screen's "סיכום" tab (M4): the level card and the road of
// levels to the real reward, the streaks, and the badge shelf (earned in
// colour, still to earn in grey). Everything is derived from the points
// ledger and the data (js/lib/rewards.js) — nothing here is stored.
//
// Calm by default (M14b): the level you're on and the next one, the streaks
// that are running, and per area the badges earned plus the next one. The
// rest opens from a closed row (js/lib/summary-view.js picks what shows);
// what's open is forgotten when the screen is left.

import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { openBottomSheet } from './bottom-sheet.js';
import { showToast } from './toast.js';
import { REWARDS } from '../lib/rules.js';
import { ledgerStreak } from '../lib/rewards.js';
import { sleepStreak } from '../lib/sleep.js';
import { habitStreak, cleanStreak } from '../lib/habits.js';
import { updateUserSettings } from '../lib/firestore.js';
import { countHe } from '../lib/plural.js';
import { roadLevels, splitStreaks, badgeShelves } from '../lib/summary-view.js';

const fmt = (n) => n.toLocaleString('he-IL');
const AREA_NAMES = { sleep: 'שינה', habits: 'הרגלים', nutrition: 'תזונה', workouts: 'אימונים', general: 'כללי' };
// A streak's count in words: "לילה אחד", "3 ימים", "יום נקי אחד".
const UNITS = {
  nights: ['לילה', 'לילות'],
  days: ['יום', 'ימים'],
  weeks: ['שבוע', 'שבועות'],
  clean: ['יום נקי', 'ימים נקיים'],
};

// A closed row that opens the rest of a card ("כל הרמות").
const moreRow = (key, label, open) => `
  <button type="button" class="today-more" data-more="${key}" aria-expanded="${open}">
    <span>${label}</span>
    ${icon('chevron-down', { className: 'icon--sm' })}
  </button>`;

export function mountProgressSummary(host, { summary, ledger, ctx, userDoc, today }) {
  let rewardGoal = userDoc.rewardGoal || '';
  const open = new Set(); // 'levels' | 'streaks' | 'badges'

  function streakItem(s) {
    return `
      <li class="streak-item${s.n ? '' : ' streak-item--off'}">
        <span class="streak-icon">${icon(s.icon, { className: 'icon--sm' })}</span>
        <span class="streak-name">${esc(s.name)}</span>
        <span class="streak-count num">${icon('flame', { className: 'icon--sm' })}${countHe(s.n, ...UNITS[s.unit])}</span>
      </li>`;
  }

  function badge(b) {
    return `
      <div class="badge${b.earnedOn ? ' badge--earned' : ''}" title="${esc(b.name)}">
        <span class="badge-icon">${icon(b.icon)}</span>
        <span class="badge-name">${esc(b.name)}</span>
      </div>`;
  }

  function render() {
    const { level, total } = summary;
    const streaks = splitStreaks([
      { name: 'שינה', icon: 'moon', n: sleepStreak([...ctx.nights.values()], ctx.sleep, today), unit: 'nights' },
      { name: 'קלוריות ביעד', icon: 'target', n: ledgerStreak(ledger, 'calories', ['full'], today), unit: 'days' },
      { name: 'ימים מושלמים', icon: 'sparkles', n: ledgerStreak(ledger, 'perfect-day', null, today), unit: 'days' },
      ...ctx.goodHabits.map((h) => {
        const s = habitStreak(h, today, ctx.habitCtx);
        return { name: h.name, icon: h.icon || 'check', n: s.count, unit: s.unit === 'weeks' ? 'weeks' : 'days' };
      }),
      ...ctx.badHabits.map((h) => ({
        name: h.name, icon: h.icon || 'check', n: cleanStreak(h, today, ctx.habitCtx).current, unit: 'clean',
      })),
    ]);
    const road = roadLevels(REWARDS.levels, level.level, REWARDS.roadLevelsShown);
    const roadShown = open.has('levels') ? REWARDS.levels : road.shown;
    const shelves = badgeShelves(summary.badges);
    const hiddenBadges = shelves.reduce((n, shelf) => n + shelf.hidden, 0);
    const allBadges = open.has('badges');

    host.innerHTML = `
      <section class="card progress-level" aria-label="רמה">
        <div class="progress-level-head">
          <span class="progress-level-num num">${level.level}</span>
          <div class="progress-level-text">
            <h2 class="progress-level-name">${esc(level.name)}</h2>
            <span class="text-muted num">${fmt(total)} נקודות${summary.today ? ` · היום ${fmt(summary.today)}` : ''}</span>
          </div>
        </div>
        <div class="today-level-bar progress-level-bar"><span style="width:${Math.round(level.progress * 100)}%"></span></div>
        <p class="progress-level-sub text-muted">${level.next ? `עוד ${countHe(level.toNext, 'נקודה', 'נקודות', { feminine: true })} לרמה ${level.next.level} · ${esc(level.next.name)}` : 'הרמה הגבוהה ביותר'}</p>
        <ol class="level-road">
          ${roadShown.map((l) => {
            const state = l.level < level.level ? 'done' : l.level === level.level ? 'current' : 'ahead';
            return `
            <li class="level-road-step level-road-step--${state}">
              <span class="level-road-dot num">${state === 'done' ? icon('check', { className: 'icon--sm' }) : l.level}</span>
              <span class="level-road-text">
                <span class="level-road-name">${esc(l.name)} <span class="text-muted num">${fmt(l.min)}</span></span>
                <span class="level-road-unlock text-muted">${l.reward && rewardGoal ? `${icon('trophy', { className: 'icon--sm' })} ${esc(rewardGoal)}` : esc(l.unlock)}</span>
              </span>
            </li>`;
          }).join('')}
        </ol>
        ${road.hidden ? moreRow('levels', 'כל הרמות', open.has('levels')) : ''}
        <button type="button" class="btn btn-secondary btn-block progress-reward-btn" data-reward-goal>${icon('trophy', { className: 'icon--sm' })} ${rewardGoal ? 'שינוי הפרס שלי' : 'לבחור את הפרס שלי'}</button>
      </section>

      <section class="card" aria-label="רצפים">
        <h2 class="progress-card-title">רצפים</h2>
        ${streaks.active.length
          ? `<ul class="streak-list">${streaks.active.map(streakItem).join('')}</ul>`
          : '<p class="text-muted progress-none">עוד אין רצף פעיל. הוא מתחיל מהסימון הבא.</p>'}
        ${streaks.idle.length ? moreRow('streaks', `עוד ${countHe(streaks.idle.length, 'רצף', 'רצפים')}`, open.has('streaks')) : ''}
        ${streaks.idle.length && open.has('streaks') ? `<ul class="streak-list">${streaks.idle.map(streakItem).join('')}</ul>` : ''}
      </section>

      <section class="card" aria-label="תגים">
        <h2 class="progress-card-title">תגים <span class="text-muted num">${summary.badges.filter((b) => b.earnedOn).length}/${summary.badges.length}</span></h2>
        ${allBadges
          ? shelves.map((shelf) => `
          <div class="pill-row-label">${AREA_NAMES[shelf.area] || shelf.area}</div>
          <div class="badge-shelf">
            ${summary.badges.filter((b) => b.area === shelf.area).map(badge).join('')}
          </div>`).join('')
          // Closed: one shelf, area by area — what's earned, then the next one.
          : `<div class="badge-shelf">${shelves.flatMap((shelf) => shelf.shown).map(badge).join('')}</div>`}
        ${hiddenBadges ? moreRow('badges', 'כל התגים', allBadges) : ''}
      </section>`;
    host.querySelector('[data-reward-goal]').addEventListener('click', editRewardGoal);
    host.querySelectorAll('[data-more]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.more;
        if (open.has(key)) open.delete(key); else open.add(key);
        render();
        // The row moved under what it opened; keep it where the finger is.
        host.querySelector(`[data-more="${key}"]`)?.focus({ preventScroll: true });
      });
    });
  }

  function editRewardGoal() {
    openBottomSheet({
      ariaLabel: 'הפרס שלי',
      render(body, sheetApi) {
        body.innerHTML = `
          <h3 style="margin:0 0 4px; color:var(--text);">הפרס שלי</h3>
          <p class="text-muted" style="margin:0 0 12px; font-size:0.85rem;">משהו אמיתי שמחכה ברמה ${REWARDS.levels.find((l) => l.reward).level} — נעליים, ארוחה טובה, יום ספא.</p>
          <input type="text" class="search-bar" data-goal-input value="${esc(rewardGoal)}" placeholder="למשל נעלי ריצה חדשות" maxlength="60">
          <div class="sheet-actions">
            <button type="button" class="btn btn-secondary" data-goal-cancel>ביטול</button>
            <button type="button" class="btn btn-primary" data-goal-save>שמירה</button>
          </div>`;
        body.querySelector('[data-goal-cancel]').addEventListener('click', () => sheetApi.close());
        body.querySelector('[data-goal-save]').addEventListener('click', () => {
          rewardGoal = body.querySelector('[data-goal-input]').value.trim();
          userDoc.rewardGoal = rewardGoal;
          updateUserSettings({ rewardGoal }).catch(() => showToast('השמירה נכשלה — נסה שוב'));
          sheetApi.close();
          render();
        });
      },
    });
  }

  render();
}
