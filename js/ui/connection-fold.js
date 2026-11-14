// "חיבורים": every connection is a closed row until it's tapped (M14b).
// Shared by the cards in js/pages/connections.js and js/ui/usage-card.js.
//
// Connected (or still checking, or open): name, one status line and a
// chevron. Not connected and closed: name, one sentence about what it
// gives, and "לחבר". The whole row is the button either way.

import { icon } from './icon.js';
import { toggleGroup, patchToggleGroup } from './toggle-group.js';

// status and pitch are ready HTML; title is plain app copy.
export function foldHead({ id, iconName, title, status, pitch, connected, open }) {
  const quiet = connected || open;
  return `
    <button type="button" class="connection-head connection-toggle" data-conn-toggle="${id}" aria-expanded="${open}">
      <span class="connection-icon">${icon(iconName)}</span>
      <span class="connection-text">
        <b id="conn-${id}-title">${title}</b>
        <span class="connection-status">${quiet ? status : pitch}</span>
      </span>
      ${quiet
        ? `<span class="connection-chevron">${icon('chevron-down', { className: 'icon--sm' })}</span>`
        : '<span class="connection-connect">לחבר</span>'}
    </button>`;
}

// The how-tos name the iPhone's own buttons, so every card that has them
// carries this switch for the phone's language. The page owns the choice:
// it listens for clicks on [data-ioslang] and calls syncIosLangSwitches.
export function iosLangSwitch(lang) {
  return toggleGroup({
    name: 'ioslang',
    active: lang,
    label: 'שפת האייפון',
    groupAttrs: 'data-lang-group',
    options: [
      { value: 'he', label: 'האייפון שלי בעברית' },
      { value: 'en', label: '<span dir="ltr">My iPhone is in English</span>' },
    ],
  });
}

export function syncIosLangSwitches(root, lang) {
  root?.querySelectorAll('[data-lang-group]').forEach((group) => {
    group.classList.add('toggle-group--live', 'ios-lang-switch');
    patchToggleGroup(group, lang);
  });
}
