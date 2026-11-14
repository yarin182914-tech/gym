// What the progress screen's "סיכום" tab shows before anything is opened
// (M14b): the level you're on and the next one, the streaks that are
// running, and per area the badges earned plus the next one to earn. The
// rest waits behind a closed row. Pure — tested by tools/test-summary-view.mjs.

// levels: REWARDS.levels (lowest first); current: the level number you're on.
// → { shown, hidden }: the current level and the ones right after it, `count`
// in all; hidden is how many levels are left out.
export function roadLevels(levels, current, count) {
  const from = Math.max(0, levels.findIndex((l) => l.level === current));
  const shown = levels.slice(from, from + Math.max(1, count));
  return { shown, hidden: levels.length - shown.length };
}

// streaks: [{ n, ... }] → { active, idle }: the ones running, and the ones
// at zero (kept in their order).
export function splitStreaks(streaks) {
  return {
    active: streaks.filter((s) => s.n > 0),
    idle: streaks.filter((s) => !(s.n > 0)),
  };
}

// badges: [{ area, earnedOn, ... }] in the order of REWARDS.badges →
// [{ area, shown, hidden }] per area, in first-seen order: every earned
// badge, then the first one not earned yet; hidden counts the rest.
export function badgeShelves(badges) {
  const areas = [...new Set(badges.map((b) => b.area))];
  return areas.map((area) => {
    const all = badges.filter((b) => b.area === area);
    const next = all.find((b) => !b.earnedOn);
    const shown = [...all.filter((b) => b.earnedOn), ...(next ? [next] : [])];
    return { area, shown, hidden: all.length - shown.length };
  });
}
