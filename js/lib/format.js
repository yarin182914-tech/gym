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

// yyyy-mm-dd for a native <input type="date"> value, in *local* time.
// Date#toISOString is UTC and rolls the date backward for anyone east of
// Greenwich — wrong for a picker whose whole point is "which calendar day".
export function dateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Parses a <input type="date"> value back into a Date at noon local time —
// noon (not midnight) keeps the picked calendar day stable regardless of
// local/UTC offset when the Date is later serialized.
export function parseDateInputValue(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0);
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

const KG_PER_LB = 0.45359237;

// Converts a weight number between units — used when the kg/lb toggle
// changes, so the figure follows its label instead of just being relabeled
// (20 kg becomes 44.1 lb, not "20 lb"). A no-op when the units already match.
export function convertWeight(weight, fromUnit, toUnit) {
  if (fromUnit === toUnit) return weight;
  const kg = fromUnit === 'lb' ? weight * KG_PER_LB : weight;
  return round1(toUnit === 'lb' ? kg / KG_PER_LB : kg);
}
