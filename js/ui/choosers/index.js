// The small decision's game ("להחליט", M6b). Every game has the same shape —
//   { id, name, minOptions, maxOptions, mount(el, labels) → { play(winner) → Promise, reset() } }
// — so another one can be added here, or replace the feet, without
// changing the decision flow (js/ui/decision-sheet.js). The winner is drawn
// by the flow, never by the game.

import { feet } from './feet.js';

export const CHOOSERS = { feet };
export const DEFAULT_CHOOSER = 'feet';

export const chooser = (id) => CHOOSERS[id] || CHOOSERS[DEFAULT_CHOOSER];
