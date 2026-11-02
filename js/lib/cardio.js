// Cardio activities — built in, not stored in the exercise library, so
// every account has them without a re-seed (seedExerciseLibraryIfEmpty only
// ever runs on an empty library).
//
// A cardio exercise is saved like any other ({ name, category, sets }), plus
// `kind: 'cardio'` and `activity`. Each of its "sets" is a segment:
// { durationSec, speedKmh?, inclinePct?, level?, distanceKm?, notes }.
// Speed is always what's stored; pace is only ever a display/input form of it.

export const CARDIO_CATEGORY = 'אירובי';

// `fields`: what a segment row shows, in order, after its duration.
export const CARDIO_ACTIVITIES = [
  { id: 'walk', name: 'הליכה', fields: ['speed', 'incline'], defaults: { durationSec: 600, speedKmh: 5.5, inclinePct: 0 } },
  { id: 'run', name: 'ריצה', fields: ['speed', 'incline'], defaults: { durationSec: 600, speedKmh: 10, inclinePct: 1 } },
  { id: 'stairs', name: 'מדרגות', fields: ['level'], defaults: { durationSec: 600, level: 6 } },
  { id: 'bike', name: 'אופניים', fields: ['level', 'speed'], defaults: { durationSec: 900, level: 8, speedKmh: 25 } },
];

// Shaped like exercise-library entries so the picker can list them alongside.
export const CARDIO_LIBRARY = CARDIO_ACTIVITIES.map((a) => ({
  id: `cardio:${a.id}`,
  name: a.name,
  category: CARDIO_CATEGORY,
  kind: 'cardio',
  activity: a.id,
}));

export function cardioActivity(id) {
  return CARDIO_ACTIVITIES.find((a) => a.id === id) || CARDIO_ACTIVITIES[0];
}

// Only walking and running are paced in min/km; a bike's speed stays km/h.
export function supportsPace(activityId) {
  return activityId === 'walk' || activityId === 'run';
}

export function hasSpeed(activityId) {
  return cardioActivity(activityId).fields.includes('speed');
}

export function segmentDistanceKm(seg) {
  const speed = Number(seg.speedKmh) || 0;
  const sec = Number(seg.durationSec) || 0;
  return (speed * sec) / 3600;
}

// Seconds per km; null when there's no speed to pace from.
export function speedToPaceSec(speedKmh) {
  const speed = Number(speedKmh) || 0;
  return speed > 0 ? 3600 / speed : null;
}

export function paceSecToSpeed(paceSec) {
  const pace = Number(paceSec) || 0;
  // Two decimals, not one: 5:47 -> 10.4 km/h would read back as 5:46.
  return pace > 0 ? Math.round((3600 / pace) * 100) / 100 : 0;
}

// "5:30", "1:02:00" — no zero-padding on the leading part.
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatKm(km) {
  return (Math.round(km * 100) / 100).toString();
}

// Totals over a list of segments — what the card's summary line and History show.
export function summarizeSegments(segments) {
  let durationSec = 0;
  let distanceKm = 0;
  let pacedSec = 0; // time spent in segments that had a speed, for average pace
  for (const seg of segments || []) {
    const sec = Number(seg.durationSec) || 0;
    durationSec += sec;
    const km = segmentDistanceKm(seg);
    if (km > 0) {
      distanceKm += km;
      pacedSec += sec;
    }
  }
  const avgPaceSec = distanceKm > 0 ? pacedSec / distanceKm : null;
  return { durationSec, distanceKm, avgPaceSec };
}

// "25:00 · 3.4 ק"מ · 7:21 /ק"מ" — distance and pace only when known.
export function formatSummary({ durationSec, distanceKm, avgPaceSec }, { withPace = true } = {}) {
  const parts = [formatClock(durationSec)];
  if (distanceKm > 0) parts.push(`${formatKm(distanceKm)} ק"מ`);
  if (withPace && avgPaceSec) parts.push(`${formatClock(avgPaceSec)} /ק"מ`);
  return parts.join(' · ');
}
