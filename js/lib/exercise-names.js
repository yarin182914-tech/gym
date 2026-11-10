// One exercise per name. Names are compared with surrounding and repeated
// spaces ignored and case folded ("לחיצת חזה " is "לחיצת חזה"), because
// history, charts and PRs are keyed by name — two library entries with the
// same name only ever split one exercise in two (feedback 10.11).

export function normalizeExerciseName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

export function sameExerciseName(a, b) {
  return normalizeExerciseName(a).toLowerCase() === normalizeExerciseName(b).toLowerCase();
}

// The library entry already using this name, or null. `exceptId` skips the
// entry being renamed.
export function findByName(library, name, exceptId = null) {
  return (library || []).find((l) => l.id !== exceptId && sameExerciseName(l.name, name)) || null;
}
