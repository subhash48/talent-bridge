// What a new password must be (lib/password.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { MIN_PASSWORD, passwordProblem } from "../lib/password.ts";

test("a good password passes", () => {
  assert.equal(passwordProblem("river-lamp-42"), null);
  assert.equal(passwordProblem("Café2026tables"), null);
});

test("too short, no number or no letter", () => {
  assert.equal(passwordProblem("ab1"), `Use at least ${MIN_PASSWORD} characters.`);
  assert.equal(passwordProblem("onlyletters"), "Use letters and at least one number.");
  assert.equal(passwordProblem("1234567890"), "Use letters and at least one number.");
});

test("common passwords and the email address are refused", () => {
  assert.equal(passwordProblem("Password123"), "That password is too easy to guess. Choose another.");
  assert.equal(
    passwordProblem("maria.lopez2026", "maria.lopez@example.com"),
    "Don't use your email address in your password.",
  );
  // A short email name isn't checked: "al" is inside too many good passwords.
  assert.equal(passwordProblem("totally4real", "al@example.com"), null);
});
