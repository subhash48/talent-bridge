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
