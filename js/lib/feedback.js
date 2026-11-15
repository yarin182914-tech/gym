// The feedback page's rules (M15a, docs/specs/feedback-page.md), as pure
// functions with no DOM and no Firestore, so tools/test-feedback.mjs can run
// them in Node.
//
// Who sees what: an admin (FEEDBACK.adminUids) sees and manages every item;
// anyone else sees only their own, and their done/dismissed items drop out
// of their list FEEDBACK.closedVisibleDays after they were closed. The same
// split is enforced by firestore.rules; this module only decides what the
// screen shows.

import { FEEDBACK } from './rules.js';

// Stored ids never change (an automated pass may read them); labels may.
// `suggestion` is no longer offered, but old items keep it and read as
// "רעיון", the same as `feature`.
export const FEEDBACK_CATEGORIES = [
  { id: 'bug', label: 'באג' },
  { id: 'ux', label: 'חוויית שימוש' },
  { id: 'ui', label: 'עיצוב' },
  { id: 'feature', label: 'רעיון' },
  { id: 'other', label: 'אחר' },
];

const LEGACY_CATEGORY_LABELS = { suggestion: 'רעיון' };

export function categoryLabel(id) {
  return FEEDBACK_CATEGORIES.find((c) => c.id === id)?.label
    || LEGACY_CATEGORY_LABELS[id]
    || 'אחר';
}

// Admin labels are the real states. The author sees softer ones: "נשלח"
// for an item nobody opened yet, and "נסגר" instead of "נדחה" (no
// punishment wording, hard rule 10).
export const FEEDBACK_STATUSES = [
  { id: 'new', label: 'חדש', userLabel: 'נשלח' },
  { id: 'in_progress', label: 'בטיפול', userLabel: 'בטיפול' },
  { id: 'done', label: 'בוצע', userLabel: 'בוצע' },
  { id: 'dismissed', label: 'נדחה', userLabel: 'נסגר' },
];

export function statusOf(item) {
  const s = item?.status;
  return FEEDBACK_STATUSES.some((x) => x.id === s) ? s : 'new';
}

export function statusLabel(status, { admin = false } = {}) {
  const s = FEEDBACK_STATUSES.find((x) => x.id === status) || FEEDBACK_STATUSES[0];
  return admin ? s.label : s.userLabel;
}

export function isClosedStatus(status) {
  return status === 'done' || status === 'dismissed';
}

export function isAdminUid(uid, adminUids = FEEDBACK.adminUids) {
  return !!uid && adminUids.includes(uid);
}

// Firestore Timestamp, Date, ISO string (the ?dev store) or millis → millis.
// null when missing or unreadable.
export function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

// When a closed item was closed. Items closed before closedAt existed fall
// back to their last update, which is when their status last changed.
export function closedAtMillis(item) {
  return toMillis(item?.closedAt) ?? toMillis(item?.updatedAt) ?? toMillis(item?.createdAt);
}

function newestFirst(a, b) {
  return (toMillis(b.createdAt) ?? 0) - (toMillis(a.createdAt) ?? 0);
}

// The page's two lists.
//   admin: open = new + in progress; closed = every done/dismissed item.
//   user:  open = their new + in progress; closed = their done/dismissed
//          items still inside the visible window.
// Both newest first. A user's list is filtered to their own items here too,
// so a stray read never shows someone else's text.
export function splitFeedback(items, {
  admin = false,
  uid = null,
  now = Date.now(),
  closedVisibleDays = FEEDBACK.closedVisibleDays,
} = {}) {
  const mine = admin ? [...items] : items.filter((i) => uid && i.authorUid === uid);
  const cutoff = now - closedVisibleDays * 24 * 60 * 60 * 1000;
  const open = [];
  const closed = [];
  for (const item of mine) {
    if (!isClosedStatus(statusOf(item))) open.push(item);
    else if (admin || (closedAtMillis(item) ?? 0) >= cutoff) closed.push(item);
  }
  open.sort(newestFirst);
  closed.sort(newestFirst);
  return { open, closed };
}

// The author may fix or delete an item until the admin starts on it; the
// admin may always. Mirrors firestore.rules.
export function canEdit(item, { uid = null, admin = false } = {}) {
  if (admin) return true;
  return !!uid && item?.authorUid === uid && statusOf(item) === 'new';
}

// The fields a status change writes. `closedAt` is a marker the data layer
// turns into a server timestamp (or null when the item is reopened).
export function statusChange(status) {
  return { status, closedAt: isClosedStatus(status) ? 'now' : null };
}
