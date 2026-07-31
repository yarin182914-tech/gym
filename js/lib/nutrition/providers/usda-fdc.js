// Nutrition database provider: USDA FoodData Central
// (https://fdc.nal.usda.gov). Free, public REST API, genuinely CORS-enabled
// for third-party browser apps (verified directly — see the note on
// open-food-facts.js, which is NOT usable from the browser for the opposite
// reason). Strongest for generic/whole foods (raw fruit, cooked meat, rice,
// etc.) — a good match for AI-detected home-cooked meal items, more so than
// a branded-product database.
//
// Implements the contract documented in ../nutrition-db-service.js.
//
// DEMO_KEY works out of the box but is a shared, tightly rate-limited key
// (all api.data.gov demo traffic, not just this app). Get a free personal
// key in seconds at https://api.data.gov/signup/ — no cost, no card — and
// put it here before relying on this for real, regular use.
const API_KEY = 'DEMO_KEY';
const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// Standard USDA nutrient numbers — not just nutrient *names*, because the
// name "Energy" appears twice per food (kJ and kcal); matching on the wrong
// one would silently report calories 4x too high.
const NUTRIENT_NUMBERS = {
  calories: '208', // KCAL
  proteinG: '203',
  fatG: '204',
  carbsG: '205',
};

function nutrientValue(foodNutrients, number) {
  const match = foodNutrients.find((n) => n.nutrientNumber === number);
  return match ? Number(match.value) || 0 : null;
}

// Foundation and SR Legacy are USDA's lab-analyzed generic-food datasets —
// deliberately excluding "Branded" (packaged products, which Open Food
// Facts already covers) and "Survey (FNDDS)" (aggregate recipe estimates,
// noisier for a single detected item).
const DATA_TYPES = 'Foundation,SR Legacy';

export async function lookupFood(searchTerm) {
  const url = `${SEARCH_URL}?api_key=${API_KEY}&query=${encodeURIComponent(searchTerm)}&pageSize=5&dataType=${encodeURIComponent(DATA_TYPES)}`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    const wrapped = new Error(`DB_ERROR: USDA FoodData Central request failed — ${err.message}`);
    wrapped.code = 'DB_ERROR';
    throw wrapped;
  }

  const foods = Array.isArray(data.foods) ? data.foods : [];
  for (const food of foods) {
    const calories = nutrientValue(food.foodNutrients, NUTRIENT_NUMBERS.calories);
    if (calories === null) continue; // no usable data — a match with no calories is worse than no match
    return {
      matchedName: food.description,
      source: 'USDA FoodData Central',
      per100g: {
        calories,
        proteinG: nutrientValue(food.foodNutrients, NUTRIENT_NUMBERS.proteinG) || 0,
        carbsG: nutrientValue(food.foodNutrients, NUTRIENT_NUMBERS.carbsG) || 0,
        fatG: nutrientValue(food.foodNutrients, NUTRIENT_NUMBERS.fatG) || 0,
      },
    };
  }
  return null;
}
