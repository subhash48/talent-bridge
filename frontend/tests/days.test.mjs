// Work days and availability, as people say them (lib/days.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";

import { dayLabel, daysLabel, openingsLabel } from "../lib/days.ts";

test("days read the way people say them, Monday first", () => {
  assert.equal(daysLabel(["saturday", "friday"]), "Friday + Saturday");
  assert.equal(daysLabel(["sunday", "saturday"]), "Weekends");
  assert.equal(daysLabel(["monday", "tuesday", "wednesday", "thursday", "friday"]), "Weekdays");
  assert.equal(daysLabel(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]), "Every day");
  assert.equal(daysLabel(["tuesday"]), "Tuesday");
  assert.equal(daysLabel([]), "");
  assert.equal(dayLabel("wednesday"), "Wednesday");
});

test("openings", () => {
  assert.equal(openingsLabel(1), "1 opening");
  assert.equal(openingsLabel(2), "2 openings");
});

test("clock times read the way people say them", async () => {
  const { clockLabel } = await import("../lib/days.ts");
  assert.equal(clockLabel("13:00"), "1 PM");
  assert.equal(clockLabel("14:30"), "2:30 PM");
  assert.equal(clockLabel("09:00"), "9 AM");
  assert.equal(clockLabel("12:00"), "12 PM");
  assert.equal(clockLabel("00:15"), "12:15 AM");
});
