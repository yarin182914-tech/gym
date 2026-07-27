import { isConfigured, app } from '../firebase-config.js';

// Analyzes a food photo and returns an estimated nutrition guess:
// { description, calories, proteinG, carbsG, fatG }
//
// Uses Firebase AI Logic (Gemini) once a real Firebase project is wired up
// (see js/firebase-config.js `isConfigured`). Until then this clearly
// refuses rather than pretending to work — there's no backend to call yet.
//
// NOTE for whoever wires this up once `firebase login`/project setup is
// done: this needs the `firebase/ai` subpackage from the Firebase JS SDK
// (Vertex AI in Firebase / "Firebase AI Logic"), a Gemini model that
// accepts image input, and a prompt asking for strict JSON back. The exact
// import path / API surface should be double-checked against the current
// Firebase JS SDK docs at that point, since this couldn't be tested without
// a live project. The photo itself must never be uploaded to Storage —
// send it directly as inline image data and discard it after the call.
export async function analyzeFoodPhoto(imageFile) {
  if (!isConfigured) {
    const err = new Error('AI_NOT_CONFIGURED');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  // TODO: replace with a real Firebase AI Logic (Gemini vision) call once
  // the Firebase project exists. Sketch of the intended shape:
  //
  //   const { getAI, getGenerativeModel } = await import(
  //     'https://www.gstatic.com/firebasejs/10.13.2/firebase-ai.js'
  //   );
  //   const ai = getAI(app);
  //   const model = getGenerativeModel(ai, { model: 'gemini-1.5-flash' });
  //   const imageBase64 = await fileToBase64(imageFile);
  //   const result = await model.generateContent([
  //     { inlineData: { data: imageBase64, mimeType: imageFile.type } },
  //     'Identify the food in this photo and estimate calories, protein (g), ' +
  //     'carbs (g), and fat (g). Respond as strict JSON: ' +
  //     '{"description":"","calories":0,"proteinG":0,"carbsG":0,"fatG":0}',
  //   ]);
  //   return JSON.parse(result.response.text());
  //
  // Left unimplemented on purpose — never fake a result.
  throw new Error('Gemini vision call not yet wired up.');
}

// eslint-disable-next-line no-unused-vars
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
