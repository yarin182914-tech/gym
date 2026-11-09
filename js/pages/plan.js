import { beginMount } from '../core/page.js';
import { icon } from '../ui/icon.js';

// "התכנית שלי" — opened from the profile button. A placeholder until the
// settings screen is built; meanwhile it points to where each setting
// already lives. It still takes a mount token so that navigating here
// invalidates any load still in flight from the page being left.
export function mountPlan(rootEl) {
  beginMount();
  rootEl.innerHTML = `
    <div class="card soon-card">
      <span class="soon-icon">${icon('target')}</span>
      <h2>התכנית שלי — בקרוב</h2>
      <p class="text-muted">כאן יוגדרו המטרות, השינה, ההרגלים, האימונים והתזונה. בינתיים: שעות השינה בכפתור ההגדרות שבכרטיס השינה, וההרגלים במסך "היום".</p>
    </div>`;
}
