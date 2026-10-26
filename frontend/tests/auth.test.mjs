// Where people land after signing in (lib/auth.ts): candidates in their portal, and recruiters and admins in
// their company's workspace, the full one or Simple Hire. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { homePath, landingPath, localPath, roleHomePath } from "../lib/auth.ts";

test("each person's home follows their role and their workspace's mode", () => {
  assert.equal(roleHomePath("candidate"), "/candidate");
  assert.equal(roleHomePath("recruiter"), "/recruiter");
  assert.equal(roleHomePath("admin", "full"), "/recruiter");
  assert.equal(roleHomePath("admin", "simple"), "/hire");
  assert.equal(roleHomePath("recruiter", "simple"), "/hire");
  // A candidate never has a workspace, whatever is passed.
  assert.equal(roleHomePath("candidate", "simple"), "/candidate");
  assert.equal(homePath({ role: "admin", workspace: { mode: "simple" } }), "/hire");
  assert.equal(homePath({ role: "recruiter", workspace: null }), "/recruiter");
});

test("after signing in, a page in their own area is kept, anything else is their home", () => {
  assert.equal(landingPath("admin", "/hire/applicants", "simple"), "/hire/applicants");
  assert.equal(landingPath("admin", "/recruiter/today", "simple"), "/hire");
  assert.equal(landingPath("recruiter", "/hire", "full"), "/recruiter");
  assert.equal(landingPath("candidate", "/candidate/messages"), "/candidate/messages");
  assert.equal(landingPath("candidate", "/recruiter"), "/candidate");
  assert.equal(landingPath("recruiter", "//evil.example"), "/recruiter");
});

test("only local paths are followed", () => {
  assert.equal(localPath("/candidate"), "/candidate");
  assert.equal(localPath("https://evil.example"), null);
  assert.equal(localPath("//evil.example"), null);
  assert.equal(localPath("/\\evil"), null);
});
