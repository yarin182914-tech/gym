// Contract every vision provider module must implement:
//
//   export async function detectFoods(imageFile) => Promise<{ items: DetectedFoodItem[] }>
//
//   DetectedFoodItem = {
//     name: string,          // display name (Hebrew) shown to the user
//     searchTerm: string,    // generic English term for the nutrition-database lookup
//     estimatedGrams: number,
//     confidence: number,    // 0..1
//   }
//
// A provider must NEVER return calories/protein/carbs/fat — estimating
// nutrition from a detected food + portion is the Nutrition Database
// Service's job (see nutrition-db-service.js), not the vision model's. This
// keeps the two concerns swappable independently: a better vision model
// doesn't require a better nutrition database and vice versa.
//
// On failure, throw an Error with `.code` set to one of:
//   'AI_UNAVAILABLE' — provider not configured/implemented yet (expected,
//                       handled gracefully by the UI, never a bug report)
//   'AI_ERROR'        — the call was attempted and failed unexpectedly
//
// An empty `items` array is not an error — it means the call succeeded but
// found nothing recognizable, which the UI shows as "enter manually".

import * as gemini from './providers/gemini-vision.js';
import * as openai from './providers/openai-vision.js';
import * as anthropic from './providers/anthropic-vision.js';

// The one line to change to switch which AI vision provider the whole app
// uses — nothing outside this file needs to know a provider changed.
const ACTIVE_PROVIDER = gemini;

// Kept only so other code can name a provider without importing every
// module directly (e.g. tests, or a future settings screen).
export const PROVIDERS = { gemini, openai, anthropic };

export async function detectFoods(imageFile) {
  return ACTIVE_PROVIDER.detectFoods(imageFile);
}
