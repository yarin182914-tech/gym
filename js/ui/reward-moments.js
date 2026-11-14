// Reward moments (M4, plan: "רגעי תגמול על המסך"), on every screen. After
// each scoring pass (js/lib/rewards-sync.js fires 'gym-rewards'):
//   - new points: a glowing "+10" tag that rises from where you just tapped
//     (or the top of the screen when it came from elsewhere) and fades;
//     on "היום" the level card shines and counts up to its new total;
//   - a perfect day: confetti and a double buzz;
//   - a new badge: a toast with the badge;
//   - a new level: a full screen with what it opens and the way to the
//     real reward.
// What was already celebrated is kept in users/{uid}.rewardsSeen, so a
// second phone doesn't celebrate it again. Points never go down, so there
// is nothing to show for a miss.
//
// Haptics: navigator.vibrate on Android. iOS Safari has no vibrate; a
// hidden <input switch> toggle gives a tap on iOS 18 inside a tap's own
// handler — later than that it's the animation and a short sound.

import { esc } from '../core/dom.js';
import { icon } from './icon.js';
import { showToast } from './toast.js';
import { REWARDS, BAD_HABITS, TODAY } from '../lib/rules.js';
import { rewardsUserDoc, markSeen } from '../lib/rewards-sync.js';

let lastTap = { x: 0, y: 0, t: 0 };
let audio = null;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let mounted = false;

export function mountRewardMoments() {
  if (mounted) return;
  mounted = true;
  document.addEventListener('pointerdown', (e) => {
    lastTap = { x: e.clientX, y: e.clientY, t: Date.now() };
    // Browsers only start sound inside a tap; a later chime needs this.
    if (!audio && window.AudioContext) {
      try { audio = new AudioContext(); } catch { audio = null; }
    }
    audio?.resume?.().catch(() => {});
  }, { capture: true, passive: true });
  window.addEventListener('gym-rewards', (e) => onRewards(e.detail));
}

function onRewards({ summary, writes }) {
  const userDoc = rewardsUserDoc();
  const earned = summary.badges.filter((b) => b.earnedOn).map((b) => b.id);
  // The first time: whatever is already there was earned before the
  // moments existed — note it, celebrate nothing.
  if (!userDoc.rewardsSeen) {
    markSeen({ level: summary.level.level, badges: earned });
    return;
  }
  const seen = userDoc.rewardsSeen;

  const gained = writes.reduce((s, w) => s + Math.max(0, w.points - (w.before || 0)), 0);
  if (gained > 0) {
    floatPoints(gained);
    haptic(15);
  }
  if (writes.some((w) => w.rule === 'perfect-day' && !w.before)) {
    confetti();
    haptic([30, 60, 30]);
    chime([660, 880, 1100]);
  }
  // A clean-streak milestone (M5): a toast of its own, confetti from 30 days.
  writes.filter((w) => w.rule === 'bad-streak' && !w.before).forEach((w, i) => setTimeout(() => {
    const days = Number(w.grade);
    showToast(`${icon('flame', { className: 'icon--sm' })} ${days} ימים נקיים — +${w.points}`);
    if (days >= BAD_HABITS.confettiFromDays) confetti();
    haptic([30, 60, 30]);
    chime([660, 990]);
  }, 300 + i * 2000));

  const fresh = summary.badges.filter((b) => b.earnedOn && !(seen.badges || []).includes(b.id));
  fresh.forEach((b, i) => setTimeout(() => {
    showToast(`${icon(b.icon, { className: 'icon--sm' })} תג חדש — ${esc(b.name)}`);
    chime([880, 1320]);
  }, 700 + i * 2000));

  const levelUp = summary.level.level > (seen.level || 1);
  if (fresh.length || levelUp) markSeen({ badges: earned, level: Math.max(summary.level.level, seen.level || 1) });
  if (levelUp) setTimeout(() => levelUpScreen(summary), 400);
}

// ---------- the pieces ----------

function floatPoints(n) {
  const recent = Date.now() - lastTap.t < REWARDS.floatAnchorMs;
  const el = document.createElement('div');
  el.className = 'reward-float num';
  el.dir = 'ltr';
  el.textContent = `+${n}`;
  el.setAttribute('aria-live', 'polite');
  el.style.left = `${recent ? lastTap.x : window.innerWidth / 2}px`;
  el.style.top = `${recent ? lastTap.y : 90}px`;
  document.body.appendChild(el);
  // "היום" redraws its level card on this same event; once it has, the
  // card gets its moment.
  requestAnimationFrame(() => levelCardMoment(n));
  setTimeout(() => el.remove(), 1100);
}

// On Today's level card (js/pages/today.js): a shine crosses it, its bar
// fills, and its number counts up from the old total. Nothing moves under
// "reduce motion" — the card already shows the new number.
function levelCardMoment(gained) {
  const card = document.querySelector('.today-hero');
  if (!card || reducedMotion()) return;
  card.classList.remove('today-hero--moment');
  void card.offsetWidth; // lets the animation start over
  card.classList.add('today-hero--moment');

  const totalEl = card.querySelector('[data-hero-total]');
  const to = Number(totalEl?.dataset.heroTotal);
  if (!totalEl || !Number.isFinite(to) || to < gained) return;
  const from = to - gained;
  const startedAt = performance.now();
  const step = (now) => {
    if (!totalEl.isConnected) return; // the card was redrawn meanwhile
    const t = Math.min(1, (now - startedAt) / TODAY.countUpMs);
    const eased = 1 - (1 - t) ** 3;
    totalEl.textContent = Math.round(from + (to - from) * eased).toLocaleString('he-IL');
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function haptic(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
    return;
  }
  // iOS 18: toggling a switch input buzzes, inside a tap only.
  try {
    const label = document.createElement('label');
    label.className = 'reward-haptic';
    label.innerHTML = '<input type="checkbox" switch tabindex="-1" aria-hidden="true">';
    document.body.appendChild(label);
    label.click();
    label.remove();
  } catch { /* no haptics here */ }
}

function chime(freqs) {
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  freqs.forEach((f, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const t = now + i * 0.09;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

// A short burst of the theme's own colours, hand-rolled on a canvas.
export function confetti() {
  if (reducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'reward-confetti';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const colors = ['--accent', '--cardio', '--gold', '--purple', '--success']
    .map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
  const w = window.innerWidth;
  const bits = Array.from({ length: 120 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * 80,
    y: window.innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 11 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    s: 5 + Math.random() * 5,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, w, window.innerHeight);
    for (const b of bits) {
      b.vy += 0.32;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 1800);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2);
      ctx.restore();
    }
    if (t < 1800) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// The full screen for a new level: its name, what it opens, and how far the
// real reward is.
export function levelUpScreen(summary) {
  const { level } = summary;
  const rewardLevel = REWARDS.levels.find((l) => l.reward && l.min > summary.total);
  const goal = rewardsUserDoc().rewardGoal;
  const toReward = rewardLevel
    ? `עוד ${(rewardLevel.min - summary.total).toLocaleString('he-IL')} נקודות ${goal ? `עד ${esc(goal)}` : 'עד הפרס האמיתי'}`
    : 'הגעת לפרס האמיתי';
  const el = document.createElement('div');
  el.className = 'reward-levelup';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', `רמה ${level.level}`);
  el.innerHTML = `
    <div class="reward-levelup-card">
      <div class="reward-levelup-eyebrow">עלית רמה</div>
      <div class="reward-levelup-num num">${level.level}</div>
      <h2 class="reward-levelup-name">${esc(level.name)}</h2>
      <p class="reward-levelup-unlock">${icon('sparkles', { className: 'icon--sm' })} נפתח: ${esc(level.unlock)}</p>
      <p class="reward-levelup-next text-muted">${toReward}</p>
      <button type="button" class="btn btn-primary btn-block" data-levelup-close>יאללה</button>
    </div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('reward-levelup--open'));
  confetti();
  haptic([40, 80, 40, 80, 40]);
  chime([523, 659, 784, 1047]);
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    el.classList.remove('reward-levelup--open');
    setTimeout(() => el.remove(), 250);
  };
  document.addEventListener('keydown', onKey);
  el.querySelector('[data-levelup-close]').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.querySelector('[data-levelup-close]').focus();
}
