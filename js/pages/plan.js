import { beginMount } from '../core/page.js';

// Placeholder screen. It still takes a mount token so that navigating here
// invalidates any load still in flight from the page being left.
export function mountPlan(rootEl) {
  beginMount();
  rootEl.innerHTML = `
    <div class="card" style="text-align:center;">
      <h2>תוכנית לחתונה</h2>
      <p class="text-muted">בניית תוכנית אימונים ותזונה לקראת החתונה תופיע כאן בשלב הבא.</p>
    </div>`;
}
