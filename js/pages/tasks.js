import { beginMount } from '../core/page.js';
import { icon } from '../ui/icon.js';

// "משימות" — a placeholder tab until the tasks page arrives (roadmap M6).
// It still takes a mount token so that navigating here invalidates any
// load still in flight from the page being left.
export function mountTasks(rootEl) {
  beginMount();
  rootEl.innerHTML = `
    <div class="card soon-card">
      <span class="soon-icon">${icon('list-checks')}</span>
      <h2>משימות — בקרוב</h2>
      <p class="text-muted">רשימת המשימות של היום, מה חשוב ומה מחכה, ותזכורת עדינה למה שנדחה. בינתיים אפשר לסמן הרגלים במסך "היום".</p>
    </div>`;
}
