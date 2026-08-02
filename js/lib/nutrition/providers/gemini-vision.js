// Vision provider: Google Gemini, via the Firebase AI Logic client SDK
// (never a raw API key shipped to the browser — Firebase + App Check proxy
// the call). Configured for the free Gemini Developer API backend rather
// than Vertex AI, so no billing plan is required on the Firebase project.
//
// Implements the contract documented in ../vision-provider.js.
//
// Two things must be true on the Firebase project before this can ever
// succeed, neither of which this code can do for you:
//   1. Firebase Console > Build > AI Logic — run the setup wizard choosing
//      "Gemini Developer API" as the backend.
//   2. Firebase Console > App Check — register this web app with a real
//      reCAPTCHA v3 site key, and put that key in js/firebase-config.js
//      (RECAPTCHA_SITE_KEY). Until that's done, isAppCheckConfigured is
//      false and this reports AI_UNAVAILABLE without attempting a request
//      that's guaranteed to be rejected.
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-ai.js';
import { app, useCloud, isAppCheckConfigured } from '../../../firebase-config.js';

const MODEL_NAME = 'gemini-3.6-flash';

const RESPONSE_SCHEMA = Schema.object({
  properties: {
    items: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          searchTerm: Schema.string(),
          estimatedGrams: Schema.number(),
          confidence: Schema.number(),
        },
      }),
    }),
  },
});

const PROMPT = `זהה את פריטי המזון הנפרדים בתמונה הזו של ארוחה.

עבור כל פריט החזר:
- name: שם המזון בעברית, לתצוגה למשתמש
- searchTerm: אותו מזון באנגלית, מונח גנרי פשוט המתאים לחיפוש במאגר מזון (למשל "grilled chicken breast", "white rice", "banana") — לעולם לא שם מותג
- estimatedGrams: הערכת משקל המנה בגרמים, לפי הגודל היחסי הנראה בתמונה
- confidence: מספר בין 0 ל-1 המבטא עד כמה אתה בטוח בזיהוי הפריט

חשוב מאוד: אל תחשב ואל תעריך קלוריות, חלבון, פחמימות או שומן בעצמך בשום צורה — זה נעשה בנפרד על ידי מאגר תזונה ייעודי. התפקיד שלך הוא אך ורק זיהוי המזון והערכת המשקל.

אם אינך מזהה שום מזון בתמונה, החזר items כמערך ריק.`;

let modelPromise = null;

function getModel() {
  if (!modelPromise) {
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    modelPromise = getGenerativeModel(ai, {
      model: MODEL_NAME,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });
  }
  return modelPromise;
}

function fileToInlineDataPart(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({
      inlineData: { data: reader.result.split(',')[1], mimeType: file.type },
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function unavailable(reason) {
  const err = new Error(`AI_UNAVAILABLE: ${reason}`);
  err.code = 'AI_UNAVAILABLE';
  return err;
}

export async function detectFoods(imageFile) {
  if (!useCloud) throw unavailable('dev sandbox has no real Firebase project to call');
  if (!isAppCheckConfigured) throw unavailable('App Check / reCAPTCHA site key not configured yet');

  let imagePart;
  try {
    imagePart = await fileToInlineDataPart(imageFile);
    const model = getModel();
    const result = await model.generateContent([PROMPT, imagePart]);
    const parsed = JSON.parse(result.response.text());
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      items: items
        .filter((it) => it && it.name && it.searchTerm)
        .map((it) => ({
          name: String(it.name),
          searchTerm: String(it.searchTerm),
          estimatedGrams: Number(it.estimatedGrams) || 0,
          confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0)),
        })),
    };
  } catch (err) {
    if (err.code === 'AI_UNAVAILABLE') throw err;
    const wrapped = new Error(`AI_ERROR: ${err.message}`);
    wrapped.code = 'AI_ERROR';
    throw wrapped;
  }
}
