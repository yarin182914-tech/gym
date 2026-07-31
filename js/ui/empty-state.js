// "Nothing here yet" message.
//
// `centered` exists only to preserve today's inconsistency: History and the
// exercise picker centre their message, the dashboard and nutrition ones do
// not. Worth unifying when the screens get their design pass — doing it here
// would be a visual change, and this milestone is behaviour-preserving.
export function emptyState(message, { centered = false } = {}) {
  return `<p class="text-muted"${centered ? ' style="text-align:center;"' : ''}>${message}</p>`;
}
