// The API client (services/api.ts): which failures leave the page and which the page explains itself.
// Run with `npm test`.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { ApiError, apiFetch } from "../services/api.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete globalThis.window;
});

/** On this page, with the API answering this error; returns where the page was sent. */
function onPage(pathname, status, error) {
  const went = [];
  globalThis.window = { location: { pathname, search: "", replace: (url) => went.push(url) } };
  globalThis.fetch = async () => new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json" } });
  return went;
}

test("a message refused because the hiring team turned messaging off stays on the page", async () => {
  const went = onPage("/candidate/messages", 403, {
    code: "messaging_disabled",
    message: "Messaging will become available when the hiring team enables it.",
  });
  await assert.rejects(
    apiFetch("/candidate/messages", { method: "POST", body: "{}" }),
    (error) => error instanceof ApiError && error.status === 403 && error.code === "messaging_disabled",
  );
  assert.deepEqual(went, []);
});

test("a session that's no longer allowed here, or has expired, still leaves the page", async () => {
  const forbidden = onPage("/recruiter", 403, { code: "forbidden", message: "You don't have permission to do that." });
  await assert.rejects(apiFetch("/candidates"));
  assert.deepEqual(forbidden, ["/"]);

  const expired = onPage("/recruiter", 401, { code: "unauthorized", message: "Sign in again." });
  await assert.rejects(apiFetch("/candidates"));
  assert.deepEqual(expired, ["/login?reason=expired&next=%2Frecruiter"]);
});
