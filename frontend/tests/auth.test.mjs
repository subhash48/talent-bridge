// Where people land after signing in (lib/auth.ts): candidates in their portal, and recruiters and admins in
// their company's workspace, the full one or Simple Hire. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AUTH_NEXT_COOKIE,
  authContinuePath,
  authRedirectUrl,
  candidateCompletePath,
  homePath,
  landingPath,
  localPath,
  loginPath,
  roleHomePath,
  splitFullName,
} from "../lib/auth.ts";

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
  // A browser drops a tab or a line break, then reads "//evil.example": off the site.
  for (const sneaky of ["/\t/evil.example", "/\n/evil.example", "/\r//evil.example", "/\u0000/evil.example"]) {
    assert.equal(localPath(sneaky), null, JSON.stringify(sneaky));
  }
  assert.equal(localPath("/candidate?application=a1#messages"), "/candidate?application=a1#messages");
});

test("candidates may go back to the public job board after signing in; staff may not", () => {
  assert.equal(landingPath("candidate", "/jobs"), "/jobs");
  assert.equal(landingPath("candidate", "/jobs/j1/apply"), "/jobs/j1/apply");
  assert.equal(landingPath("candidate", "/jobs?q=chef&arrangement=remote"), "/jobs?q=chef&arrangement=remote");
  // Only /jobs itself and what's under it, not a path that merely starts with the same letters.
  assert.equal(landingPath("candidate", "/jobsearch"), "/candidate");
  assert.equal(landingPath("recruiter", "/jobs/j1", "full"), "/recruiter");
  assert.equal(landingPath("admin", "/jobs", "simple"), "/hire");
});

test("a path is judged by where it really leads once resolved", () => {
  // "/jobs/../recruiter" opens /recruiter, which isn't a candidate's.
  assert.equal(landingPath("candidate", "/jobs/../recruiter"), "/candidate");
  assert.equal(landingPath("candidate", "/jobs/%2e%2e/recruiter"), "/candidate");
  assert.equal(landingPath("candidate", "/candidate/../hire"), "/candidate");
  // Staying inside is fine, and the resolved form is what's followed.
  assert.equal(landingPath("candidate", "/jobs/a/../j1"), "/jobs/j1");
  // Off-site tricks still fail, for every role.
  for (const sneaky of ["//evil.example", "/\\evil.example", "/\t/evil.example", "https://evil.example/jobs", "/\n//evil.example/jobs"]) {
    assert.equal(landingPath("candidate", sneaky), "/candidate", JSON.stringify(sneaky));
  }
});

test("Google sign-in comes back to /auth/continue with who it was for and where to go", () => {
  assert.equal(
    authContinuePath({ audience: "candidate", intent: "signin", next: "/jobs/j1/apply" }),
    "/auth/continue?as=candidate&intent=signin&next=%2Fjobs%2Fj1%2Fapply",
  );
  assert.equal(
    authContinuePath({ audience: "employer", intent: "signup", mode: "simple" }),
    "/auth/continue?as=employer&intent=signup&mode=simple",
  );
  // A next that could leave the site is dropped rather than carried through Google.
  assert.equal(authContinuePath({ audience: null, intent: "signin", next: "//evil.example" }), "/auth/continue?intent=signin");
  assert.equal(
    authContinuePath({ audience: null, intent: "signup", via: "email" }),
    "/auth/continue?intent=signup&via=email",
  );
});

test("sign-in and sign-up links keep the page to return to", () => {
  assert.equal(loginPath({}), "/login");
  assert.equal(loginPath({ audience: "candidate", reason: "signed_out" }), "/login?as=candidate&reason=signed_out");
  assert.equal(loginPath({ audience: "employer", next: "/recruiter/jobs" }), "/login?as=employer&next=%2Frecruiter%2Fjobs");
  assert.equal(loginPath({ next: "https://evil.example" }), "/login");
  assert.equal(candidateCompletePath(null), "/signup/complete");
  assert.equal(candidateCompletePath("/jobs/j1/apply"), "/signup/complete?next=%2Fjobs%2Fj1%2Fapply");
});

test("a full name splits into first and last, or asks again", () => {
  assert.deepEqual(splitFullName("Sophia Martinez"), { firstName: "Sophia", lastName: "Martinez" });
  assert.deepEqual(splitFullName("  Ana  María de la Cruz "), { firstName: "Ana", lastName: "María de la Cruz" });
  assert.equal(splitFullName("Cher"), null);
  assert.equal(splitFullName("   "), null);
  assert.equal(splitFullName(null), null);
  assert.equal(splitFullName(`A ${"b".repeat(101)}`), null);
});

test("a sign-in's return address goes to /auth/confirm and remembers where it was going", () => {
  const cookies = [];
  globalThis.window = { location: { origin: "https://www.hirvello.com", protocol: "https:" } };
  globalThis.document = { set cookie(value) { cookies.push(value); } };
  try {
    const next = "/auth/continue?as=candidate&intent=signin&next=%2Fjobs%2F1%2Fapply";
    assert.equal(authRedirectUrl(next), `https://www.hirvello.com/auth/confirm?next=${encodeURIComponent(next)}`);
    assert.equal(cookies.at(-1), `${AUTH_NEXT_COOKIE}=${encodeURIComponent(next)}; Path=/; Max-Age=900; SameSite=Lax; Secure`);
    // Anything that could leave the site is never remembered or passed on.
    assert.equal(authRedirectUrl("https://evil.example/x"), "https://www.hirvello.com/auth/confirm?next=%2F");
    assert.ok(cookies.at(-1).startsWith(`${AUTH_NEXT_COOKIE}=%2F;`));
    globalThis.window.location = { origin: "http://localhost:3000", protocol: "http:" };
    authRedirectUrl("/reset-password");
    assert.ok(!cookies.at(-1).includes("Secure"));
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
});
