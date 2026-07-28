// Shared page lifecycle.
//
// Exactly one page is mounted at a time, into one shared container. A page
// that loads asynchronously can therefore finish after the user has already
// navigated on, and must not touch the DOM or its own state when that happens.
//
// Checking `container !== null` is not sufficient: navigating away and back
// remounts the page and re-assigns the container, so the first load's render
// would still fire and overwrite the fresh one. Every mount takes a token
// instead; only the newest token may commit.

let currentToken = 0;

// Call once at the top of every mount, before any await.
export function beginMount() {
  return ++currentToken;
}

// Guard every resumption point after an await, before touching state or DOM.
export function isStale(token) {
  return token !== currentToken;
}

export function renderLoading(container, message) {
  if (container) container.innerHTML = `<p class="text-muted">${message}</p>`;
}
