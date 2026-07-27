const R = 60; // circle radius in the dial's 140x140 viewBox
const CIRCUMFERENCE = 2 * Math.PI * R;

// Renders (or updates, if called again on the same container) the
// signature circular "plate" dial — used for both the in-session rest
// timer and the wedding countdown, so the two features share one visual.
export function renderPlateDial(container, { progress = 0, valueText = '', label = '', compact = false } = {}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = CIRCUMFERENCE * (1 - clamped);

  container.classList.add('plate-dial');
  container.classList.toggle('compact', compact);

  if (!container.dataset.built) {
    container.innerHTML = `
      <svg viewBox="0 0 140 140">
        <circle class="track" cx="70" cy="70" r="${R}"></circle>
        <circle class="fill" cx="70" cy="70" r="${R}"
          stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE}"></circle>
      </svg>
      <div class="dial-center">
        <div class="dial-value num"></div>
        <div class="dial-label"></div>
      </div>`;
    container.dataset.built = '1';
  }

  container.querySelector('.fill').setAttribute('stroke-dasharray', CIRCUMFERENCE);
  container.querySelector('.fill').setAttribute('stroke-dashoffset', offset);
  container.querySelector('.dial-value').textContent = valueText;
  container.querySelector('.dial-label').textContent = label;
}
