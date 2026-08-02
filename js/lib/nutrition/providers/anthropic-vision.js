// Vision provider: Anthropic Claude Vision.
//
// NOT IMPLEMENTED, for the same reason as openai-vision.js: Anthropic's API
// requires a bearer API key with no client-safe proxy this app has today.
// Needs a server-side relay before this can call the real API.
//
// Implements the contract documented in ../vision-provider.js so that once
// a relay exists, only this file changes.
export async function detectFoods(imageFile) {
  const err = new Error('AI_UNAVAILABLE: Anthropic vision needs a server-side relay for the API key, which this app does not have yet');
  err.code = 'AI_UNAVAILABLE';
  throw err;
}
