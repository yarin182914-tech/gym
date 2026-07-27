export function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function formatDateHe(dateLike) {
  const d = dateLike?.toDate ? dateLike.toDate() : new Date(dateLike);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const SET_TYPE_LABELS = { warmup: 'חימום', working: 'רגיל', dropset: 'דרופ סט' };
