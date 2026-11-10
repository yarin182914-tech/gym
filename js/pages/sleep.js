// "שינה" — the sleep tab: the same sleep card as on "היום" (last night,
// this week), and under it the last 30 nights. A night not logged is a grey
// row with "לרשום", never a gap; tapping any row opens the card's night
// sheet to log it, fix it or delete it.

import { getUserSettings, listSleep } from '../lib/firestore.js';
import {
  dateKey, shiftDays, parseKey, clockOf, formatDuration, sleepSettings, evaluateNight, nightGrade, nightRules,
} from '../lib/sleep.js';
import { SLEEP } from '../lib/rules.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { createSleepCard } from '../ui/sleep-card.js';
import { handleQuickActions } from '../ui/quick-add.js';
import { icon } from '../ui/icon.js';
import { mountSleepTrend } from '../ui/sleep-trend.js';

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
// One word per night, its worst part (nightGrade) — grey when missed, never red.
const GRADE_TEXT = { full: 'לילה טוב', close: 'כמעט', miss: 'לא הפעם' };

let container = null;
let sleepCard = null;
let nights = [];
let settings = sleepSettings();
let stopQuickActions = null;
let trend = null; // the "מגמה" charts

// A canvas chart doesn't follow CSS colour changes — redraw on a theme flip.
window.addEventListener('gym-theme-change', () => trend?.redraw());

const todayKey = () => dateKey(new Date());

export async function mountSleep(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען את הלילות...');
  const [userDoc, loaded] = await Promise.all([
    getUserSettings().catch((err) => {
      console.error('[sleep] settings load failed', err);
      return {};
    }),
    // As many as "היום" loads, so the card's streak reads the same here.
    listSleep(Math.max(60, SLEEP.historyNights)),
  ]);
  if (isStale(token)) return;

  nights = loaded;
  settings = sleepSettings(userDoc);
  sleepCard = createSleepCard(nights, userDoc, {
    onChange(list) {
      nights = list;
      renderLog();
      trend?.redraw();
    },
    onSettingsChange(next) {
      settings = next;
      renderLog();
      trend?.redraw();
    },
  });
  container.innerHTML = `
    <div id="sleep-slot"></div>
    <section data-sleep-trend aria-label="מגמה"></section>
    <section data-sleep-log aria-label="30 לילות אחרונים"></section>`;
  container.querySelector('#sleep-slot').replaceWith(sleepCard);
  container.querySelector('[data-sleep-log]').addEventListener('click', (e) => {
    const row = e.target.closest('[data-night]');
    if (row) sleepCard.openNight(row.dataset.night);
  });
  renderLog();
  trend = mountSleepTrend(container.querySelector('[data-sleep-trend]'), {
    getNights: () => nights,
    getSettings: () => settings,
    today: todayKey,
  });

  // The + button's "שינה": last night's sheet.
  stopQuickActions = handleQuickActions('sleep', () => sleepCard?.openNight(todayKey()));
}

export function unmountSleep() {
  stopQuickActions?.();
  stopQuickActions = null;
  trend?.destroy();
  trend = null;
  container = null;
  sleepCard = null;
  nights = [];
}

function renderLog() {
  const host = container?.querySelector('[data-sleep-log]');
  if (!host) return;
  const today = todayKey();
  const keys = Array.from({ length: SLEEP.historyNights }, (_, i) => shiftDays(today, -i));
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const logged = keys.map((k) => byDate.get(k)).filter(Boolean);
  const avg = logged.length ? logged.reduce((sum, n) => sum + n.durationMin, 0) / logged.length : 0;

  host.innerHTML = `
    <div class="sleep-log-head">
      <h2 class="sleep-log-title">${SLEEP.historyNights} לילות אחרונים</h2>
      <span class="sleep-log-sub">${logged.length
        ? `<span class="num">${logged.length}</span> נרשמו · ממוצע <span class="num">${formatDuration(avg)}</span>`
        : 'עוד לא נרשמו לילות'}</span>
    </div>
    <div class="sleep-log" role="list">${keys.map((key) => row(key, byDate.get(key))).join('')}</div>`;
}

// A night is named by its evening, dated by its morning.
function row(key, night) {
  const name = `ליל ${WEEKDAY_NAMES[parseKey(shiftDays(key, -1)).getDay()]}`;
  const morning = parseKey(key).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  const flexible = nightRules(key, settings).flexible;
  const dateText = `<span class="sleep-row-date"><span class="sleep-row-name">${name}</span><span class="sleep-row-sub">עד ${morning}${flexible ? ' · גמיש' : ''}</span></span>`;

  if (!night) {
    return `
      <button type="button" class="sleep-row sleep-row--empty" data-night="${key}" role="listitem" aria-label="${name} · לא נרשם · לרשום">
        ${dateText}
        <span class="sleep-row-log">${icon('plus', { className: 'icon--sm' })} לרשום</span>
      </button>`;
  }
  const ev = evaluateNight(night, settings);
  const grade = nightGrade(ev);
  return `
    <button type="button" class="sleep-row" data-night="${key}" role="listitem" aria-label="${name} · ${formatDuration(night.durationMin)} שעות · ${GRADE_TEXT[grade]}">
      ${dateText}
      <span class="sleep-row-times num"><bdi>${clockOf(night.bedtime)}</bdi> ← <bdi>${clockOf(night.wakeTime)}</bdi></span>
      <span class="sleep-chip sleep-chip--${grade}">${GRADE_TEXT[grade]}</span>
      <span class="sleep-row-dur num">${formatDuration(night.durationMin)}</span>
    </button>`;
}
