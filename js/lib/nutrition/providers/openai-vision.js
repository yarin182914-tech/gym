// Vision provider: OpenAI (GPT-4o / GPT-4 Vision style image input).
//
// NOT IMPLEMENTED — and can't be safely implemented client-side as-is.
// Unlike Gemini (called through Firebase AI Logic, which proxies the
// request so no secret ever reaches the browser), OpenAI's API expects a
// bearer API key on every request with no equivalent client-safe proxy in
// this app. Shipping that key in browser JS would expose it to every
// visitor. Implementing this provider for real needs a small server-side
// relay (e.g. a Cloud Function) that holds the key and forwards the image
// + prompt — this app currently has no backend of its own.
//
// Implements the contract documented in ../vision-provider.js so that once
// a relay exists, only this file changes: swap the fetch() below to call
// your relay endpoint instead of throwing, keep the same return shape.
export async function detectFoods(imageFile) {
  const err = new Error('AI_UNAVAILABLE: OpenAI vision needs a server-side relay for the API key, which this app does not have yet');
  err.code = 'AI_UNAVAILABLE';
  throw err;
}
