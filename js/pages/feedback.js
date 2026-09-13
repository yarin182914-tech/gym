// Site Feedback — a shared backlog of bugs/UX/UI/feature notes about the
// *website itself*, deliberately unrelated to workout data (see
// js/lib/firestore.js's "site feedback" section for the data model: a
// top-level siteFeedback/ collection, not scoped under users/{uid} like
// everything else in this app, since every signed-in user reads and writes
// the same shared list). Each entry is a small structured record — text,
// author, category, status, createdAt/updatedAt — meant to be readable by
// a future automated pass over the collection, not just by a human here.

import { esc } from '../core/dom.js';
import { beginMount, isStale, renderLoading } from '../core/page.js';
import { emptyState } from '../ui/empty-state.js';
import { confirmDialog } from '../ui/confirm-dialog.js';
import { showToast } from '../ui/toast.js';
import { icon } from '../ui/icon.js';
import { toggleGroup, patchToggleGroup } from '../ui/toggle-group.js';
import { openBottomSheet } from '../ui/bottom-sheet.js';
import { openFeedbackSheet, FEEDBACK_CATEGORIES, categoryLabel } from '../ui/feedback-sheet.js';
import { listFeedback, updateFeedback, deleteFeedback } from '../lib/firestore.js';
import { formatDateHe } from '../lib/format.js';

// id: stored value (stable, read by any future automated pass over the
// collection). label: what a person sees. Order here is also the order
// the status toggle's segmented control presents them in.
const STATUSES = [
  { id: 'new', label: 'חדש' },
  { id: 'in_progress', label: 'בטיפול' },
  { id: 'done', label: 'בוצע' },
  { id: 'dismissed', label: 'נדחה' },
];

function statusLabel(id) {
  return STATUSES.find((s) => s.id === id)?.label || STATUSES[0].label;
}

let container = null;
let items = [];

export async function mountFeedback(rootEl) {
  const token = beginMount();
  container = rootEl;
  renderLoading(container, 'טוען משוב...');
  const loaded = await listFeedback(200);
  if (isStale(token)) return;
  items = loaded;
  render();
}

export function unmountFeedback() {
  container = null;
  items = [];
}

async function refresh() {
  items = await listFeedback(200);
  if (container) render();
}

function itemRow(item) {
  return `
    <div class="card feedback-item" data-uid="${esc(item.id)}">
      <div class="row" style="margin-bottom:6px;">
        <span class="feedback-status feedback-status--${esc(item.status || 'new')}">${esc(statusLabel(item.status))}</span>
        <button type="button" class="set-more-btn" data-role="fb-more" aria-label="עוד אפשרויות">⋯</button>
      </div>
      <p style="margin:0 0 8px; color:var(--text); white-space:pre-wrap;">${esc(item.text)}</p>
      <div class="text-muted" style="font-size:0.78rem; display:flex; gap:6px; flex-wrap:wrap;">
        <span>${esc(categoryLabel(item.category))}</span>
        <span>·</span>
        ${item.author ? `<span>${esc(item.author)}</span><span>·</span>` : ''}
        <span>${esc(formatDateHe(item.createdAt))}</span>
      </div>
    </div>`;
}

function render() {
  if (!container) return;

  container.innerHTML = `
    <div class="card" style="text-align:center;">
      <h2 style="margin-bottom:4px;">משוב על האתר</h2>
      <p class="text-muted" style="margin:0 0 12px;">מקום משותף לדווח על באגים, בעיות שימושיות ורעיונות לשיפור האתר — לא הערות על אימונים.</p>
      <button type="button" class="btn btn-primary btn-block" id="fb-add-btn">+ הוספת משוב</button>
    </div>

    <div id="feedback-list">
      ${items.length === 0 ? emptyState('אין עדיין משוב — תהיה הראשון/ה להוסיף.', { centered: true }) : items.map(itemRow).join('')}
    </div>
  `;

  container.querySelector('#fb-add-btn').addEventListener('click', () => {
    openFeedbackSheet({ onSaved: refresh });
  });

  container.querySelectorAll('.feedback-item').forEach((el) => {
    const item = items.find((i) => i.id === el.dataset.uid);
    if (!item) return;
    el.querySelector('[data-role="fb-more"]').addEventListener('click', () => {
      openFeedbackActionsSheet(item);
    });
  });
}

function openFeedbackActionsSheet(item) {
  openBottomSheet({
    ariaLabel: 'אפשרויות למשוב',
    render(body, sheetApi) {
      body.innerHTML = `
        <h3 style="margin:0 0 4px; color:var(--text);">סטטוס</h3>
        <div style="margin-bottom:18px;">
          ${toggleGroup({
            name: 'fb-status',
            active: item.status || 'new',
            label: 'סטטוס משוב',
            groupAttrs: 'data-role="fb-status-group"',
            options: STATUSES.map((s) => ({ value: s.id, label: s.label })),
          })}
        </div>
        <div class="sheet-actions">
          <button type="button" class="btn btn-secondary" data-role="fb-edit">${icon('pencil', { className: 'icon--sm' })} עריכה</button>
          <button type="button" class="btn btn-danger" data-role="fb-delete">${icon('trash-2', { className: 'icon--sm' })} מחיקה</button>
        </div>
      `;

      const statusGroupEl = body.querySelector('[data-role="fb-status-group"]');
      statusGroupEl.classList.add('toggle-group--live');
      patchToggleGroup(statusGroupEl, item.status || 'new');
      statusGroupEl.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const status = btn.dataset.fbStatus;
          if (status === item.status) return;
          patchToggleGroup(statusGroupEl, status);
          try {
            await updateFeedback(item.id, { status });
            item.status = status;
            await refresh();
          } catch (err) {
            console.error('feedback status update failed', err);
            showToast('שגיאה בעדכון הסטטוס — נסה שוב');
            patchToggleGroup(statusGroupEl, item.status);
          }
        });
      });

      body.querySelector('[data-role="fb-edit"]').addEventListener('click', () => {
        sheetApi.close();
        openFeedbackSheet({ item, onSaved: refresh });
      });

      body.querySelector('[data-role="fb-delete"]').addEventListener('click', async () => {
        sheetApi.close();
        const confirmed = await confirmDialog({
          title: 'מחיקת משוב',
          message: 'למחוק את פריט המשוב הזה? הפעולה לא הפיכה.',
          confirmLabel: 'מחיקה',
          danger: true,
        });
        if (!confirmed) return;
        try {
          await deleteFeedback(item.id);
          await refresh();
        } catch (err) {
          console.error('feedback delete failed', err);
          showToast('שגיאה במחיקת המשוב — נסה שוב');
        }
      });
    },
  });
}

// Exported only so a future automated pass (see this file's header
// comment) has one obvious place to import the canonical category/status
// vocab from, instead of re-deriving it from the rendered markup.
export { FEEDBACK_CATEGORIES, STATUSES };
