// Nutrition database provider: Open Food Facts (https://world.openfoodfacts.org).
//
// NOT the active provider (see nutrition-db-service.js — usda-fdc.js is)
// even though it's free with no API key. Reason, confirmed directly rather
// than assumed: Open Food Facts' only real free-text search is a separate
// service, search-a-licious (search.openfoodfacts.org), and it doesn't send
// CORS headers for third-party browser origins — a `fetch()` from this
// app's own pages is rejected, while a `{mode:'no-cors'}` probe to the same
// URL reaches the server fine, which is the textbook signature of a CORS
// block rather than a network problem. The older /api/v2/search endpoint
// *is* CORS-enabled, but its `search_terms` param is silently ignored — it's
// a structured-filter API (by category/brand/nutrient), not free-text; it
// returned the exact same top "result" for a real food and for gibberish.
// The legacy CGI endpoint used below performs real full-text search but is
// also not CORS-enabled for browser use.
//
// Kept implemented and ready rather than deleted: useful the moment Open
// Food Facts opens up CORS on search-a-licious, and its v2 API (which IS
// CORS-enabled) is the right choice if this app ever adds barcode lookup.
//
// Caveat worth knowing about the data itself (not a bug): it's a
// community-sourced *branded product* database first. Packaged foods match
// well; generic/home-cooked dishes (e.g. "grilled chicken breast") sometimes
// only get a thin or noisy match, or none — lookupFood() returning null is
// the expected, normal result in that case.
const SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// A product only counts as usable if it has real calorie data — a match
// with every nutriment missing is worse than no match at all, since it
// would silently zero out that item's contribution to the meal total.
function toFoodMatch(product) {
  const n = product.nutriments || {};
  const calories = toNumber(n['energy-kcal_100g']);
  if (calories === null) return null;
  return {
    matchedName: product.product_name || product._searchTerm,
    source: 'Open Food Facts',
    per100g: {
      calories,
      proteinG: toNumber(n.proteins_100g) || 0,
      carbsG: toNumber(n.carbohydrates_100g) || 0,
      fatG: toNumber(n.fat_100g) || 0,
    },
  };
}

export async function lookupFood(searchTerm) {
  const url = `${SEARCH_URL}?search_terms=${encodeURIComponent(searchTerm)}&search_simple=1&action=process&fields=product_name,nutriments&page_size=5&json=1`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    const wrapped = new Error(`DB_ERROR: Open Food Facts request failed — ${err.message}`);
    wrapped.code = 'DB_ERROR';
    throw wrapped;
  }

  const products = Array.isArray(data.products) ? data.products : [];
  for (const product of products) {
    product._searchTerm = searchTerm;
    const match = toFoodMatch(product);
    if (match) return match;
  }
  return null;
}
