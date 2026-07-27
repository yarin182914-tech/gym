// Analyzes a food photo and returns an estimated nutrition guess:
// { description, calories, proteinG, carbsG, fatG }
//
// NOT IMPLEMENTED. Wiring it up needs Gemini vision via Firebase AI Logic,
// which requires billing enabled on the Firebase project — a deliberate
// out-of-scope decision, not an oversight. Until that work happens this always
// reports AI_UNAVAILABLE so the UI can say so plainly; it must never fail with
// a vague error or, worse, invent numbers.
//
// NOTE for whoever implements it: use the `firebase/ai` subpackage (Vertex AI
// in Firebase) with a Gemini model that accepts image input, and a prompt
// demanding strict JSON back. Check the import path against the current
// Firebase JS SDK docs. The photo must never be uploaded to Storage — send it
// as inline image data and discard it once the response arrives.
export async function analyzeFoodPhoto(imageFile) {
  const err = new Error('AI_UNAVAILABLE');
  err.code = 'AI_UNAVAILABLE';
  throw err;
}
