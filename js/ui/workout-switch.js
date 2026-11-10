// "אימון · היסטוריה · התקדמות" — the three parts of the אימון tab, at the
// top of each. Plain links, so each keeps its own URL (#/session,
// #/history, #/workout-progress) and the browser's back button moves between them.

export function workoutSwitch(active) {
  const link = (route, label) => `<a href="#/${route}"${route === active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  return `
    <nav class="toggle-group workout-switch" aria-label="אימון">
      ${link('session', 'אימון')}
      ${link('history', 'היסטוריה')}
      ${link('workout-progress', 'התקדמות')}
    </nav>`;
}
