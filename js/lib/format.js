// Single source of truth for turning stored values into display strings.
// Anything user-visible that involves a date, a weight or a set type belongs
// here — these were previously reimplemented per page, which is how History
// and the rest of the app drifted apart on spacing.

const HE_MONTHS_SHORT = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

export const SET_TYPE_LABELS = { warmup: 'חימום', working: 'רגיל', dropset: 'דרופ סט' };

// Default rest, in seconds, per set type. Warm-ups get a shorter default than
// working sets; drop sets are taken back-to-back.
export const SET_TYPE_REST_SEC = { warmup: 60, working: 120, dropset: 30 };

export const SET_TYPES = Object.keys(SET_TYPE_LABELS).map((id) => ({
  id,
  label: SET_TYPE_LABELS[id],
  restSec: SET_TYPE_REST_SEC[id],
}));

export function setTypeLabel(type) {
  return SET_TYPE_LABELS[type] || type;
}

// Firestore hands back Timestamp objects; the local store hands back ISO
// strings. Everything downstream just wants a Date.
export function toDate(value) {
  return value?.toDate ? value.toDate() : new Date(value);
}

export function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// "26 ביולי 2026" — full date, for History rows and the last-time popup.
export function formatDateHe(value) {
  return toDate(value).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

// "יולי 2026" — the History calendar heading.
export function formatMonthHe(date) {
  return toDate(date).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

// "26 ביול" — compact form for chart axis labels, where space is tight.
export function formatDayMonthHe(value) {
  const d = toDate(value);
  return `${d.getDate()} ב${HE_MONTHS_SHORT[d.getMonth()]}`;
}

export function unitLabel(unit) {
  return unit === 'lb' ? ' lb' : ' ק"ג';
}

// How much one tap of the +/- stepper moves the weight, per unit.
export function weightStep(unit) {
  return unit === 'lb' ? 5 : 2.5;
}

// Canonical rendering of a logged set's load: '22.5 ק"ג לצד'.
export function formatWeight({ weight, weightUnit, weightMode }) {
  return `${weight}${unitLabel(weightUnit)}${weightMode === 'perSide' ? ' לצד' : ''}`;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}
