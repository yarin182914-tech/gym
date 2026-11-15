// Feedback about ג׳יני itself (bugs, UX, ideas) — not about workouts.
// M15a (docs/specs/feedback-page.md): private. A user sees only their own
// items, folded under "המשובים שלי", each with where it stands; done and
// dismissed ones leave their list FEEDBACK.closedVisibleDays after closing.
// The admin sees everyone's: "פתוחים" on top and a folded "סגורים", and is
// the only one who changes a status. firestore.rules enforces the same
// split; the rules for what shows live in js/lib/feedback.js.

import { esc } from '../core/dom.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { icon } from '../ui/icon.js';
import { toggleGroup, patchToggleGroup } from '../ui/toggle-group.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { openFeedbackSheet } from '../ui/feedback-sheet.js';
import {
  listFeedback, setFeedbackStatus, deleteFeedback, feedbackViewer,
} from '../lib/firestore.js';
import {
  FEEDBACK_CATEGORIES, FEEDBACK_STATUSES, splitFeedback, statusOf, statusLabel,
  categoryLabel, canEdit, toMillis,
} from '../lib/feedback.js';
import { formatDateHe } from '../lib/format.js';

let container = null;
let items = [];
let viewer = { uid: null, admin: false };
// Fold state survives a refresh (a save, a status change) within one visit.
let foldOpen = false;

export async function mountFeedback(rootEl) {
  const token = beginMount();
  container = rootEl;
  foldOpen = false;
  viewer = feedbackViewer();
  renderLoading(container, 'טוען משוב...');
  let loaded = [];
  try {
    loaded = await listFeedback({ mine: !viewer.admin });
  } catch (err) {
    console.error('feedback list failed', err);
  }
  if (isStale(token)) return;
  items = loaded;
  render();
}

export function unmountFeedback() {
  container = null;
  items = [];
}

async function refresh() {
  try {
    items = await listFeedback({ mine: !viewer.admin });
  } catch (err) {
    console.error('feedback list failed', err);
  }
  if (container) render();
}

function itemCard(item) {
  const status = statusOf(item);
  const meta = [
    categoryLabel(item.category),
    viewer.admin && item.author ? item.author : null,
    formatDateHe(item.createdAt),
  ].filter(Boolean).map((t) => `<span>${esc(t)}</span>`).join('<span aria-hidden="true">·</span>');
  const more = canEdit(item, viewer)
    ? `<button type="button" class="set-more-btn" data-fb-more="${esc(item.id)}" aria-label="אפשרויות">${icon('ellipsis', { className: 'icon--sm' })}</button>`
    : '';
  const tick = status === 'done' ? `${icon('check', { className: 'icon--sm' })} ` : '';
  return `
    <article class="feedback-item feedback-item--${status}">
      <div class="feedback-item-head">
        <span class="feedback-status feedback-status--${status}">${tick}${esc(statusLabel(status, { admin: viewer.admin }))}</span>
        <span class="feedback-meta">${meta}</span>
        ${more}
      </div>
      <p class="feedback-item-text">${esc(item.text)}</p>
    </article>`;
}

function fold(label, count, list) {
  return `
    <section class="feedback-fold">
      <button type="button" class="feedback-fold-head" data-fb-fold aria-expanded="${foldOpen}" aria-controls="fb-fold-list">
        <span class="feedback-fold-title">${label}</span>
        <span class="feedback-fold-count num">${count}</span>
        <span class="feedback-fold-chevron">${icon('chevron-down', { className: 'icon--sm' })}</span>
      </button>
      <div class="feedback-list" id="fb-fold-list"${foldOpen ? '' : ' hidden'}>${list.map(itemCard).join('')}</div>
    </section>`;
}

function render() {
  if (!container) return;
  const { open, closed } = splitFeedback(items, viewer);

  const intro = `
    <section class="card feedback-intro">
      <p class="feedback-intro-text">ראית באג או יש לך רעיון? כאן כותבים למפתח.</p>
      <button type="button" class="btn btn-primary btn-block" data-fb-add>${icon('message-square', { className: 'icon--sm' })} שליחת משוב</button>
    </section>`;

  let body;
  if (viewer.admin) {
    body = `
      <section class="feedback-section">
        <div class="today-section-head">
          <h2 class="today-section-title">פתוחים</h2>
          <span class="today-section-count num">${open.length}</span>
        </div>
        ${open.length
          ? `<div class="feedback-list">${open.map(itemCard).join('')}</div>`
          : '<p class="feedback-empty">אין משובים פתוחים.</p>'}
      </section>
      ${closed.length ? fold('סגורים', closed.length, closed) : ''}`;
  } else {
    // One list for the user, newest first, whatever the status.
    const mine = sortNewest([...open, ...closed]);
    body = mine.length
      ? fold('המשובים שלי', mine.length, mine)
      : '<p class="feedback-empty">עוד לא שלחת משוב.</p>';
  }

  container.innerHTML = intro + body;

  container.querySelector('[data-fb-add]').addEventListener('click', () => {
    openFeedbackSheet({ onSaved: refresh });
  });
  container.querySelector('[data-fb-fold]')?.addEventListener('click', (e) => {
    foldOpen = !foldOpen;
    const btn = e.currentTarget;
    btn.setAttribute('aria-expanded', String(foldOpen));
    container.querySelector('#fb-fold-list').hidden = !foldOpen;
  });
  container.querySelectorAll('[data-fb-more]').forEach((btn) => {
    const item = items.find((i) => i.id === btn.dataset.fbMore);
    if (item) btn.addEventListener('click', () => openActionsSheet(item));
  });
}

function sortNewest(list) {
  return [...list].sort((a, b) => (toMillis(b.createdAt) ?? 0) - (toMillis(a.createdAt) ?? 0));
}

// Admin: status, fix, delete. Author (only while the item is new): fix, delete.
function openActionsSheet(item) {
  openBottomSheet({
    ariaLabel: 'אפשרויות למשוב',
    render(body, sheetApi) {
      const status = statusOf(item);
      body.innerHTML = `
        ${viewer.admin ? `
          <h3 class="feedback-sheet-title">סטטוס</h3>
          <div class="feedback-status-pick">
            ${toggleGroup({
              name: 'fb-status',
              active: status,
              label: 'סטטוס משוב',
              groupAttrs: 'data-role="fb-status-group"',
              options: FEEDBACK_STATUSES.map((s) => ({ value: s.id, label: s.label })),
            })}
          </div>` : '<h3 class="feedback-sheet-title">המשוב שלך</h3>'}
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-role="fb-edit">${icon('pencil', { className: 'icon--sm' })} תיקון</button>
          <button type="button" class="btn btn-danger" data-role="fb-delete">${icon('trash-2', { className: 'icon--sm' })} מחיקה</button>
        </div>
      `;

      const group = body.querySelector('[data-role="fb-status-group"]');
      if (group) {
        group.classList.add('toggle-group--live');
        patchToggleGroup(group, status);
        group.querySelectorAll('button').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const next = btn.dataset.value;
            if (next === statusOf(item)) return;
            patchToggleGroup(group, next);
            try {
              await setFeedbackStatus(item.id, next);
              item.status = next;
              await refresh();
            } catch (err) {
              console.error('feedback status update failed', err);
              showToast('הסטטוס לא נשמר, נסו שוב');
              patchToggleGroup(group, statusOf(item));
            }
          });
        });
      }

      body.querySelector('[data-role="fb-edit"]').addEventListener('click', () => {
        sheetApi.close();
        openFeedbackSheet({ item, onSaved: refresh });
      });

      body.querySelector('[data-role="fb-delete"]').addEventListener('click', async () => {
        sheetApi.close();
        const confirmed = await confirmDialog({
          title: 'מחיקת משוב',
          message: 'למחוק את המשוב הזה? אי אפשר לבטל.',
          confirmLabel: 'מחיקה',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await deleteFeedback(item.id);
          await refresh();
        } catch (err) {
          console.error('feedback delete failed', err);
          showToast('המשוב לא נמחק, נסו שוב');
        }
      });
    },
  });
}

// The stored vocab, in one obvious place for a future automated pass.
export { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES };
