// Which type a new set starts as. Pure, so tools/test-feedback-fixes.mjs
// can check it under Node.
//
// Warm-ups don't repeat by themselves (feedback 7.11): every set after one
// warm-up used to be saved as a warm-up too, and PRs skip warm-ups, so the
// heaviest sets never counted. A drop-set stage never starts a new set.

// The set right after `lastType` in this session.
export function typeAfter(lastType) {
  return lastType === 'warmup' || lastType === 'dropset' || !lastType ? 'working' : lastType;
}

// The set at the same position last time, given this session's sets so far:
// last time's leading warm-ups are kept only until a working set is logged.
export function typeFromLastTime(prevType, setsSoFar = []) {
  if (!prevType || prevType === 'dropset') return 'working';
  if (prevType === 'warmup' && setsSoFar.some((s) => s.type !== 'warmup')) return 'working';
  return prevType;
}
