// The progress screen's "סיכום" tab (M4): the level card and the road of
// levels to the real reward, the streaks, and the badge shelf (earned in
// colour, still to earn in grey). Everything is derived from the points
// ledger and the data (js/lib/rewards.js) — nothing here is stored.

import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { openBottomSheet } from './bottom-sheet.js';
import { showToast } from './toast.js';
import { REWARDS } from '../lib/rules.js';
import { ledgerStreak } from '../lib/rewards.js';
import { sleepStreak } from '../lib/sleep.js';
import { habitStreak } from '../lib/habits.js';
import { updateUserSettings } from '../lib/firestore.js';

const fmt = (n) => n.toLocaleString('he-IL');
const AREA_NAMES = { sleep: 'שינה', habits: 'הרגלים', nutrition: 'תזונה', workouts: 'אימונים', general: 'כללי' };

export function mountProgressSummary(host, { summary, ledger, ctx, userDoc, today }) {
  let rewardGoal = userDoc.rewardGoal || '';

  function render() {
    const { level, total } = summary;
    const streaks = [
      { name: 'שינה', icon: 'moon', n: sleepStreak([...ctx.nights.values()], ctx.sleep, today), unit: 'לילות' },
      { name: 'קלוריות ביעד', icon: 'target', n: ledgerStreak(ledger, 'calories', ['full'], today), unit: 'ימים' },
      { name: 'ימים מושלמים', icon: 'sparkles', n: ledgerStreak(ledger, 'perfect-day', null, today), unit: 'ימים' },
      ...ctx.habits.map((h) => {
        const s = habitStreak(h, today, ctx.habitCtx);
        return { name: h.name, icon: h.icon || 'check', n: s.count, unit: s.unit === 'weeks' ? 'שבועות' : 'ימים' };
      }),
    ];
    const areas = [...new Set(REWARDS.badges.map((b) => b.area))];
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
        <p class="progress-level-sub text-muted">${level.next ? `עוד ${fmt(level.toNext)} לרמה ${level.next.level} · ${esc(level.next.name)}` : 'הרמה הגבוהה ביותר'}</p>
        <ol class="level-road">
          ${REWARDS.levels.map((l) => {
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
        <button type="button" class="btn btn-secondary btn-block" data-reward-goal>${icon('trophy', { className: 'icon--sm' })} ${rewardGoal ? 'שינוי הפרס שלי' : 'לבחור את הפרס שלי'}</button>
      </section>

      <section class="card" aria-label="רצפים">
        <h2 class="progress-card-title">רצפים</h2>
        <ul class="streak-list">
          ${streaks.map((s) => `
            <li class="streak-item${s.n ? '' : ' streak-item--off'}">
              <span class="streak-icon">${icon(s.icon, { className: 'icon--sm' })}</span>
              <span class="streak-name">${esc(s.name)}</span>
              <span class="streak-count num">${icon('flame', { className: 'icon--sm' })}${s.n} ${s.unit}</span>
            </li>`).join('')}
        </ul>
      </section>

      <section class="card" aria-label="תגים">
        <h2 class="progress-card-title">תגים <span class="text-muted num">${summary.badges.filter((b) => b.earnedOn).length}/${summary.badges.length}</span></h2>
        ${areas.map((area) => `
          <div class="pill-row-label">${AREA_NAMES[area] || area}</div>
          <div class="badge-shelf">
            ${summary.badges.filter((b) => b.area === area).map((b) => `
              <div class="badge${b.earnedOn ? ' badge--earned' : ''}" title="${esc(b.name)}">
                <span class="badge-icon">${icon(b.icon)}</span>
                <span class="badge-name">${esc(b.name)}</span>
              </div>`).join('')}
          </div>`).join('')}
      </section>`;
    host.querySelector('[data-reward-goal]').addEventListener('click', editRewardGoal);
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
