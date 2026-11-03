// The home page's concierge reads what a visitor types for who they are (lib/intent.ts), and opens that flow or
// asks. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyIntent, INTENT_MAX_LENGTH, INTENT_PATHS, normalizeIntentText } from "../lib/intent.ts";

test("a recruiter is heard as one", () => {
  for (const text of [
    "I'm a recruiter looking for developers.",
    "I need to shortlist candidates.",
    "I manage hiring for multiple companies.",
    "Find qualified software engineers for our company.",
    "We're hiring a backend engineer for our team",
    "Talent acquisition lead, need a pipeline",
    "Recruiter here — need to source candidates",
    "HR at a mid-size firm, screening applicants",
  ]) {
    assert.equal(classifyIntent(text), "recruiter", text);
  }
});

test("a small-business owner is heard as one", () => {
  for (const text of [
    "I own a restaurant and need employees.",
    "I need someone for my small shop.",
    "I'm hiring staff for my café.",
    "I run a small business and need workers.",
    "Hiring a barista for my coffee shop",
    "I need a cashier",
    "IM HIRING STAFF FOR MY CAFE",
    "I own the company and need staff",
  ]) {
    assert.equal(classifyIntent(text), "small_business", text);
  }
});

test("a job seeker is heard as one, whatever their trade", () => {
  for (const text of [
    "I'm looking for a software engineering job.",
    "Help me find work.",
    "I want to apply for jobs.",
    "I'm searching for internships.",
    "I need a job",
    "i'm looking for a job!!!",
    "I'm a recruiter looking for a new job",
    "Can you help me get hired as a nurse?",
    "I'm a driver looking for work",
    "Student here, want to land an internship",
  ]) {
    assert.equal(classifyIntent(text), "candidate", text);
  }
});

test("when the words don't say, it doesn't guess", () => {
  for (const text of [
    "I want to find talent.",
    "I need employees",
    "I need to hire a software engineer",
    "I want to post a job",
    "I own a shop and I'm the hiring manager",
    "Hello",
    "",
    "   ",
    "?!",
  ]) {
    assert.equal(classifyIntent(text), null, JSON.stringify(text));
  }
});

test("case, accents, contractions and punctuation don't change the reading", () => {
  assert.equal(normalizeIntentText("  I'M hiring STAFF for my Café!!  "), "i am hiring staff for my cafe");
  assert.equal(normalizeIntentText("We’re looking… for a cook; the owner's away"), "we are looking for a cook the owner away");
  assert.equal(classifyIntent("I'M LOOKING FOR WORK"), "candidate");
  assert.equal(classifyIntent("we're hiring for our team"), "recruiter");
});

test("only the first sentences are read, and each intent leads to a flow that exists", () => {
  assert.equal(classifyIntent(`${"x".repeat(600)} I'm looking for a job`), null);
  assert.equal(classifyIntent(`I'm looking for a job ${"x".repeat(600)}`), "candidate");
  assert.ok(INTENT_MAX_LENGTH >= 120 && INTENT_MAX_LENGTH <= 500);
  assert.deepEqual(Object.keys(INTENT_PATHS).sort(), ["candidate", "recruiter", "small_business"]);
  for (const path of Object.values(INTENT_PATHS)) assert.match(path, /^\/(?:login|signup)(?:\/|\?|$)/);
});
