// Contract every nutrition-database provider module must implement:
//
//   export async function lookupFood(searchTerm) => Promise<FoodMatch | null>
//
//   FoodMatch = {
//     matchedName: string,   // the database's own name for what it matched
//     source: string,        // e.g. 'Open Food Facts' — shown to the user
//     per100g: { calories, proteinG, carbsG, fatG },
//   }
//
// Returning null means "no match found" — an expected, normal outcome (not
// every home-cooked dish exists in any database), not an error. Only throw
// for an actual service failure (network down, bad response), with `.code`
// set to 'DB_ERROR'.
//
// This is the one seam between "what food is this and how big" (the vision
// provider's job) and "what are its nutrition facts" (this service's job) —
// swapping databases later means writing one new provider file, nothing else
// in the app changes.

import * as openFoodFacts from './providers/open-food-facts.js';
import * as usdaFdc from './providers/usda-fdc.js';

// The one line to change to switch which nutrition database the app looks
// values up from. USDA is active rather than Open Food Facts (the
// originally intended default) because Open Food Facts' only real
// free-text search service doesn't send CORS headers for third-party
// browser origins — confirmed directly (a no-cors probe reaches the server
// fine, a normal fetch is rejected by the browser). Its code is kept ready
// in case that changes, or a future feature (e.g. barcode lookup, which
// Open Food Facts' CORS-enabled v2 API does support) wants it.
const ACTIVE_PROVIDER = usdaFdc;

export const PROVIDERS = { openFoodFacts, usdaFdc };

export async function lookupFood(searchTerm) {
  return ACTIVE_PROVIDER.lookupFood(searchTerm);
}
