// The feet game ("להחליט", M6b): one bare foot per option, toes curled.
// "להגריל" plays a drum roll — the feet tap their toes in turn, faster and
// faster — a beat of silence, and then the chosen foot's big toe rises
// like a thumbs-up. The winner is drawn before the show (js/lib/decisions.js
// pickRandom); nothing on screen decides it.
//
// Motion is the Web Animations API on transforms only (no library). The
// drawings are in feet-art.js. Sound is synthesised (Web Audio) and can be
// muted; the choice is kept in this phone's localStorage.

import { footSvg, POSES } from './feet-art.js';
import { drumPlan } from '../../lib/decisions.js';
import { DECISIONS } from '../../lib/rules.js';
import { confetti, haptic } from '../reward-moments.js';
import { esc } from '../../core/dom.js';
import { icon } from '../icon.js';

const MUTE_KEY = 'gymi.decisionSoundOff';
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

function setMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode */ }
}

// ---------- sound ----------

let audio = null;

// Called inside the tap that starts the game — browsers only start sound there.
function wakeAudio() {
  if (!audio && window.AudioContext) {
    try { audio = new AudioContext(); } catch { audio = null; }
  }
  audio?.resume?.().catch(() => {});
}

function drum(pitch) {
  if (isMuted() || !audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(pitch, t);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.45, t + 0.07);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

function ding() {
  if (isMuted() || !audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  [1046, 1568, 2093].forEach((f, i) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    const s = t + i * 0.06;
    gain.gain.setValueAtTime(0.0001, s);
    gain.gain.exponentialRampToValueAtTime(0.09 / (i + 1), s + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, s + 0.9);
    osc.connect(gain).connect(audio.destination);
    osc.start(s);
    osc.stop(s + 1);
  });
}

// ---------- the game ----------

// el: the element to draw in; labels: the options, in order (2–4). The
// first sits on the right (RTL). Returns { play(winner) → Promise, reset() }.
function mount(el, labels) {
  el.innerHTML = `
    <div class="feet-game feet-game--n${labels.length}">
      <button type="button" class="feet-sound" data-feet-sound aria-pressed="${!isMuted()}" aria-label="${isMuted() ? 'להפעיל צליל' : 'להשתיק'}">${icon(isMuted() ? 'volume-x' : 'volume-2', { className: 'icon--sm' })}</button>
      <div class="feet-row">
        ${labels.map((label, i) => `
          <div class="feet-foot" data-foot="${i}">
            ${footSvg(i % 2 === 0 ? 'right' : 'left')}
            <span class="feet-label">${esc(label || `אפשרות ${i + 1}`)}</span>
          </div>`).join('')}
      </div>
    </div>`;
  const feet = [...el.querySelectorAll('.feet-foot')];
  const part = (i, cls) => feet[i].querySelector(cls);
  // The resting pose: toes tucked under.
  el.querySelectorAll('.foot-toes, .foot-big').forEach((g) => { g.style.transform = POSES.curled; });

  const soundBtn = el.querySelector('[data-feet-sound]');
  soundBtn.addEventListener('click', () => {
    const muted = !isMuted();
    setMuted(muted);
    soundBtn.setAttribute('aria-pressed', String(!muted));
    soundBtn.setAttribute('aria-label', muted ? 'להפעיל צליל' : 'להשתיק');
    soundBtn.innerHTML = icon(muted ? 'volume-x' : 'volume-2', { className: 'icon--sm' });
    if (!muted) wakeAudio();
  });

  let running = [];
  const animate = (node, frames, opts) => {
    const a = node.animate(frames, opts);
    running.push(a);
    return a;
  };

  function reset() {
    running.forEach((a) => a.cancel());
    running = [];
    feet.forEach((f) => f.classList.remove('feet-foot--win', 'feet-foot--out'));
    el.querySelector('.feet-game').classList.remove('feet-game--playing', 'feet-game--done');
  }

  function tap(i, gap) {
    const ms = Math.max(60, Math.min(160, gap * 0.9));
    const toes = [{ transform: POSES.curled }, { transform: POSES.tap }, { transform: POSES.curled }];
    animate(part(i, '.foot-toes'), toes, { duration: ms, easing: 'ease-out' });
    animate(part(i, '.foot-big'), toes, { duration: ms, easing: 'ease-out', delay: ms * 0.15 });
    animate(part(i, '.foot-art'), [
      { transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' },
    ], { duration: ms, easing: 'ease-out' });
    drum(i % 2 === 0 ? 150 : 115);
    if (navigator.vibrate) navigator.vibrate(6);
  }

  async function play(winner) {
    wakeAudio();
    reset();
    const game = el.querySelector('.feet-game');
    game.classList.add('feet-game--playing');
    const quick = reducedMotion();
    const G = DECISIONS.game;
    const timing = quick ? { ...G, drumMs: 500, firstBeatMs: 160, lastBeatMs: 120 } : G;
    const beats = drumPlan(feet.length, undefined, timing);
    const start = performance.now();
    for (let b = 0; b < beats.length; b += 1) {
      const delay = beats[b].at - (performance.now() - start);
      if (delay > 0) await wait(delay);
      const gap = (beats[b + 1]?.at ?? timing.drumMs) - beats[b].at;
      tap(beats[b].foot, gap);
    }
    await wait(Math.max(0, timing.drumMs - (performance.now() - start)));

    // The hush: everyone holds still and leans in.
    feet.forEach((f) => animate(f.querySelector('.foot-art'), [
      { transform: 'scale(1)' }, { transform: 'scale(1.04)' },
    ], { duration: quick ? 100 : G.hushMs, easing: 'ease-in-out', fill: 'forwards' }));
    await wait(quick ? 100 : G.hushMs);

    // The toe.
    feet.forEach((f, i) => f.classList.add(i === winner ? 'feet-foot--win' : 'feet-foot--out'));
    animate(part(winner, '.foot-big'), [
      { transform: POSES.curled }, { transform: POSES.raised },
    ], { duration: quick ? 150 : G.toeMs, easing: quick ? 'ease-out' : 'cubic-bezier(.3, 1.7, .5, 1)', fill: 'forwards' });
    animate(part(winner, '.foot-toes'), [
      { transform: POSES.curled }, { transform: POSES.tap },
    ], { duration: quick ? 150 : G.toeMs, easing: 'ease-out', fill: 'forwards' });
    feet.forEach((f, i) => {
      if (i !== winner) animate(f.querySelector('.foot-art'), [{ transform: 'scale(1.04)' }, { transform: 'scale(0.94)' }], { duration: 400, easing: 'ease-out', fill: 'forwards' });
    });
    ding();
    haptic([20, 40, 30]);
    await wait((quick ? 150 : G.toeMs) * 0.6);
    confetti();
    game.classList.remove('feet-game--playing');
    game.classList.add('feet-game--done');
    await wait(quick ? 100 : 500);
  }

  return { play, reset };
}

export const feet = {
  id: 'feet',
  name: 'כפות רגליים',
  minOptions: DECISIONS.minOptions,
  maxOptions: DECISIONS.maxOptions,
  mount,
};
