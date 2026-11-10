import assert from "node:assert/strict";
import test from "node:test";
import { apiSearchParams, boardFrom, boardSearch, formatPayRange, parseBoardQuery, withChanges } from "../components/jobs/board.ts";

test("shareable board filters survive a round trip and map to the API", () => {
  const query = parseBoardQuery(new URLSearchParams("q=Engineer&arrangement=remote&arrangement=hybrid&type=full_time&source=recruiter&salary=80k&posted=7&page=2"));
  assert.deepEqual(parseBoardQuery(new URLSearchParams(boardSearch(query))), query);
  const api = apiSearchParams(query);
  assert.equal(api.get("salary"), "80000");
  assert.equal(api.get("posted_within"), "7");
  assert.equal(api.get("offset"), "20");
  assert.deepEqual(api.getAll("arrangement"), ["remote", "hybrid"]);
  assert.equal(withChanges(query, { source: "small_business" }).page, 1);
});

test("invalid filters are discarded, and a return to the board never becomes an external redirect", () => {
  const query = parseBoardQuery(new URLSearchParams("q=" + "a".repeat(110) + "&source=admin&page=-2&salary=-1&arrangement=space"));
  assert.equal(query.q.length, 100);
  assert.equal(query.source, null);
  assert.equal(query.page, 1);
  assert.equal(query.salary, null);
  assert.deepEqual(query.arrangement, []);
  assert.equal(boardFrom("https://evil.example/recruiter?next=/recruiter"), "");
});

test("salary labels keep currency and period, with no invented salary when absent", () => {
  assert.equal(formatPayRange(18, 22, "USD", "hour"), "$18–$22 an hour");
  assert.equal(formatPayRange(120000, 150000, "USD", "year"), "$120k–$150k a year");
  assert.equal(formatPayRange(null, 4000, "EUR", "month"), "Up to €4k a month");
  assert.equal(formatPayRange(null, null), null);
  assert.equal(formatPayRange(0, 0, "USD", "hour"), "$0 an hour");
});
