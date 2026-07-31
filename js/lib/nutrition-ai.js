// Analyzes a food photo and returns a structured, per-item breakdown:
//
//   {
//     items: [{ name, estimatedGrams, confidence, dbMatch, matchedName, source,
//               per100g, calories, proteinG, carbsG, fatG }],
//     totals: { calories, proteinG, carbsG, fatG },
//     description,  // Hebrew, item names joined — prefills the meal description
//   }
//
// `per100g` (null when dbMatch is false) is included alongside the already
// -scaled macros so a review UI can recompute an item's numbers live if the
// user corrects the estimated portion, without another database round trip.
//
// This file is the orchestrator, not the AI: it asks the configured vision
// provider *only* to detect foods, estimate portions in grams and give a
// confidence score (never nutrition numbers — see vision-provider.js), then
// resolves each detected food's macros through the nutrition database
// service. Swapping either the vision model or the nutrition database means
// editing that provider's own file — this orchestration logic never changes.
//
// Throws AI_UNAVAILABLE / AI_ERROR (from the vision provider) when detection
// itself couldn't run at all. An individual food failing to match any
// database entry is not treated as a failure of the whole analysis — that
// item just comes back with dbMatch: false and zeroed macros so the UI can
// prompt the user to fill it in manually, rather than losing every other
// correctly-detected item over one miss.
import { detectFoods } from './nutrition/vision-provider.js';
import { lookupFood } from './nutrition/nutrition-db-service.js';

function scaleToPortion(per100g, grams) {
  const factor = grams / 100;
  return {
    calories: per100g.calories * factor,
    proteinG: per100g.proteinG * factor,
    carbsG: per100g.carbsG * factor,
    fatG: per100g.fatG * factor,
  };
}

export async function analyzeFoodPhoto(imageFile) {
  const { items: detected } = await detectFoods(imageFile);

  const items = await Promise.all(detected.map(async (item) => {
    let match = null;
    try {
      match = await lookupFood(item.searchTerm);
    } catch {
      // A single database lookup failing doesn't sink the rest of the
      // analysis — see the file-level comment above.
      match = null;
    }

    const macros = match
      ? scaleToPortion(match.per100g, item.estimatedGrams)
      : { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

    return {
      name: item.name,
      estimatedGrams: item.estimatedGrams,
      confidence: item.confidence,
      dbMatch: !!match,
      matchedName: match?.matchedName ?? null,
      source: match?.source ?? null,
      per100g: match?.per100g ?? null,
      ...macros,
    };
  }));

  const totals = items.reduce((acc, it) => ({
    calories: acc.calories + it.calories,
    proteinG: acc.proteinG + it.proteinG,
    carbsG: acc.carbsG + it.carbsG,
    fatG: acc.fatG + it.fatG,
  }), { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });

  return {
    items,
    totals: {
      calories: Math.round(totals.calories),
      proteinG: Math.round(totals.proteinG),
      carbsG: Math.round(totals.carbsG),
      fatG: Math.round(totals.fatG),
    },
    description: items.map((it) => it.name).join(', '),
  };
}
