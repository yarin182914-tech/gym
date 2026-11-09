// "אימון · היסטוריה" — the two halves of the אימון tab, at the top of both
// screens. Plain links, so each half keeps its own URL (#/session,
// #/history) and the browser's back button moves between them.

export function workoutSwitch(active) {
  const link = (route, label) => `<a href="#/${route}"${route === active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  return `
    <nav class="toggle-group workout-switch" aria-label="אימון">
      ${link('session', 'אימון')}
      ${link('history', 'היסטוריה')}
    </nav>`;
}
