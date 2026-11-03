// The home page's concierge reads what a visitor types (lib/intent.ts): how the words are normalised, and where each
// kind of visitor is sent. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { INTENT_MAX_LENGTH, INTENT_PATHS, normalizeIntentText } from "../lib/intent.ts";

test("case, accents, contractions and punctuation don't change the reading", () => {
  assert.equal(normalizeIntentText("  I'M hiring STAFF for my Café!!  "), "i am hiring staff for my cafe");
  assert.equal(normalizeIntentText("We’re looking… for a cook; the owner's away"), "we are looking for a cook the owner away");
});

test("each intent leads to a flow that exists", () => {
  assert.ok(INTENT_MAX_LENGTH >= 120 && INTENT_MAX_LENGTH <= 500);
  assert.deepEqual(Object.keys(INTENT_PATHS).sort(), ["candidate", "recruiter", "small_business"]);
  for (const path of Object.values(INTENT_PATHS)) assert.match(path, /^\/(?:login|signup)(?:\/|\?|$)/);
});
