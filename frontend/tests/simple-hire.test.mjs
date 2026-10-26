// A small business's job facts, as the owner reads them (lib/simple-hire.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { jobFacts, shiftLabel } from "../lib/simple-hire.ts";

test("the restaurant job reads as its facts", () => {
  assert.deepEqual(jobFacts({ pay: "$18/hour", shift: "Evenings", work_days: ["saturday", "friday"], openings: 2 }), [
    "$18/hour",
    "Evening shift",
    "Friday + Saturday",
    "2 openings",
  ]);
});

test("only what the job has, from either shape", () => {
  assert.deepEqual(jobFacts({ pay: "$16/hour", shift: "Weekends", workDays: ["saturday", "sunday"] }), [
    "$16/hour",
    "Weekend shifts",
    "Weekends",
  ]);
  assert.deepEqual(jobFacts({}), []);
  assert.equal(shiftLabel("Split shifts"), "Split shifts");
});
