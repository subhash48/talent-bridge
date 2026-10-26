// The Candidates page's search and filters (lib/candidate-query.ts): every filter matches what it says,
// shows as a chip, and survives a link. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_FILTERS,
  activeFilterCount,
  describeFilters,
  facetValues,
  interviewState,
  jobOptions,
  matchesFilters,
  matchesQuery,
  viewFromParams,
  viewToParams,
} from "../lib/candidate-query.ts";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const daysAgo = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

function candidate(overrides = {}) {
  return {
    id: "app-1",
    candidateId: "person-1",
    jobId: "job-design",
    company: "Encord",
    name: "Sophia Martinez",
    role: "Product Designer",
    email: "sophia.martinez@example.com",
    location: "London, UK",
    stage: "interview",
    lastActivity: "Confirmed interview",
    lastActivityAt: daysAgo(1),
    communication: { status: "on_track", daysSinceUpdate: 1, lastUpdateAt: daysAgo(1) },
    candidateMessagingEnabled: true,
    skills: ["Figma", "Design systems", "User research"],
    addedAt: daysAgo(12),
    ...overrides,
  };
}

const sophia = candidate();
const maya = candidate({
  id: "app-2",
  candidateId: "person-2",
  name: "Maya Brooks",
  location: "New York, NY",
  stage: "screening",
  skills: ["Figma", "Accessibility"],
  addedAt: daysAgo(3),
  candidateMessagingEnabled: false,
});
const james = candidate({
  id: "app-3",
  candidateId: "person-3",
  jobId: "job-ml",
  name: "James Park",
  role: "ML Engineer",
  location: "San Francisco, CA",
  stage: "screening",
  skills: ["PyTorch", "Python", "AWS"],
  addedAt: daysAgo(40),
  lastInterviewAt: daysAgo(2),
  communication: { status: "needs_attention", daysSinceUpdate: 5, lastUpdateAt: daysAgo(5), reason: "Interviewed, no follow-up" },
});
const all = [sophia, maya, james];
const keep = (filters) => all.filter((item) => matchesFilters(item, { ...EMPTY_FILTERS, ...filters }, NOW)).map((item) => item.name);

test("search matches name, job, employer, stage, skills and location", () => {
  assert.ok(matchesQuery(sophia, "sophia"));
  assert.ok(matchesQuery(sophia, "product designer"));
  assert.ok(matchesQuery(sophia, "encord"));
  assert.ok(matchesQuery(sophia, "interview"));
  assert.ok(matchesQuery(sophia, "design systems"));
  assert.ok(matchesQuery(sophia, "london"));
  assert.ok(!matchesQuery(sophia, "pytorch"));
  assert.deepEqual(all.filter((item) => matchesQuery(item, "screening")).map((item) => item.name), ["Maya Brooks", "James Park"]);
});

test("each filter keeps exactly what it names", () => {
  assert.deepEqual(keep({ jobs: ["job-design"] }), ["Sophia Martinez", "Maya Brooks"]);
  assert.deepEqual(keep({ skills: ["figma", "Design systems"] }), ["Sophia Martinez"], "every skill ticked, any case");
  assert.deepEqual(keep({ locations: ["New York, NY", "London, UK"] }), ["Sophia Martinez", "Maya Brooks"]);
  assert.deepEqual(keep({ applied: "7d" }), ["Maya Brooks"]);
  assert.deepEqual(keep({ applied: "30d" }), ["Sophia Martinez", "Maya Brooks"]);
  assert.deepEqual(keep({ communication: ["needs_attention"] }), ["James Park"]);
  assert.deepEqual(keep({ messaging: ["off"] }), ["Maya Brooks"]);
  assert.deepEqual(keep({ jobs: ["job-design"], messaging: ["on"] }), ["Sophia Martinez"], "filters combine");
});

test("interview status: booked, interviewed, interviewed with no update since, none", () => {
  const booked = candidate({ nextStep: { title: "Design interview", date: daysAgo(-1) } });
  assert.deepEqual([...interviewState(booked)], ["upcoming"]);
  assert.deepEqual([...interviewState(james)].sort(), ["awaiting_update", "interviewed"]);
  const heardSince = candidate({ lastInterviewAt: daysAgo(3) });
  assert.deepEqual([...interviewState(heardSince)], ["interviewed"]);
  assert.deepEqual([...interviewState(maya)], ["none"]);
  assert.deepEqual(keep({ interview: ["awaiting_update"] }), ["James Park"]);
});

test("every filter in force is a chip that removes it", () => {
  const filters = { ...EMPTY_FILTERS, jobs: ["job-design"], skills: ["Figma"], applied: "30d", messaging: ["on"] };
  const chips = describeFilters(filters, jobOptions(all));
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ["Job: Product Designer", "Skill: Figma", "Applied: last 30 days", "Can message you"],
  );
  assert.equal(activeFilterCount(filters), chips.length);
  let current = filters;
  for (const chip of chips) current = chip.remove(current);
  assert.deepEqual(current, EMPTY_FILTERS);
});

test("two employers' jobs with the same title are told apart", () => {
  const openai = candidate({ id: "app-4", jobId: "job-openai", company: "OpenAI" });
  assert.deepEqual(jobOptions([sophia, openai, james]), [
    { id: "job-ml", label: "ML Engineer" },
    { id: "job-design", label: "Product Designer · Encord" },
    { id: "job-openai", label: "Product Designer · OpenAI" },
  ]);
  assert.deepEqual(facetValues(["Figma", "figma", "AWS", undefined]), ["Figma", "AWS"]);
});

test("a link carries the same view, and ignores anything it doesn't know", () => {
  const view = {
    query: "sophia",
    stage: "interview",
    filters: { ...EMPTY_FILTERS, jobs: ["job-design"], skills: ["Figma", "Design systems, UX"], interview: ["awaiting_update"] },
  };
  const params = viewToParams(view);
  assert.deepEqual(viewFromParams(new URLSearchParams(params.toString())), view);
  const odd = viewFromParams(new URLSearchParams("stage=sideways&applied=forever&interview=maybe|upcoming&portal=x"));
  assert.equal(odd.stage, "all");
  assert.equal(odd.filters.applied, "any");
  assert.deepEqual(odd.filters.interview, ["upcoming"]);
  assert.deepEqual(odd.filters.portal, []);
});
