// The portal tracker's repeat guard (lib/dedupe.ts): a rerender or Strict Mode's double effect reports
// the same view twice in a moment, and it must be sent once.
import assert from "node:assert/strict";
import { test } from "node:test";

import { RecentKeys } from "../lib/dedupe.ts";

test("the same event twice in quick succession is claimed once", () => {
  const recent = new RecentKeys(2000);
  const event = JSON.stringify({ type: "page_view", page: "company", application_id: "a" });
  assert.equal(recent.claim(event, 1000), true);
  assert.equal(recent.claim(event, 1001), false); // the rerender
  assert.equal(recent.claim(event, 2500), false);
  assert.equal(recent.claim(event, 3001), true); // a real second visit later
});

test("different events don't block each other", () => {
  const recent = new RecentKeys(2000);
  assert.equal(recent.claim("company:benefits", 0), true);
  assert.equal(recent.claim("company:culture", 1), true);
  assert.equal(recent.claim("company:benefits", 2), false);
});

test("old keys are forgotten", () => {
  const recent = new RecentKeys(10);
  for (let index = 0; index < 500; index += 1) recent.claim(`key-${index}`, index * 100);
  assert.equal(recent.claim("key-0", 100_000), true);
});
