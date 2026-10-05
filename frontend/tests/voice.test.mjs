// The AI Assistant's voice state machine (lib/voice.ts). Run with `npm test` (Node's own test runner,
// which loads the TypeScript module directly).
import assert from "node:assert/strict";
import { test } from "node:test";

import { INITIAL_VOICE, micAction, shouldAutoStop, voiceReducer } from "../lib/voice.ts";

const run = (events, state = INITIAL_VOICE) => events.reduce(voiceReducer, state);

test("a spoken request goes listening, understanding, preparing, ready, executing, complete", () => {
  let state = run([{ type: "start" }]);
  assert.equal(state.phase, "starting");
  const session = state.session;
  state = run(
    [
      { type: "listening", session },
      { type: "interim", session, text: "Send Sophia" },
      { type: "stop", session },
    ],
    state,
  );
  assert.equal(state.phase, "understanding");
  assert.equal(state.transcript, "Send Sophia");
  state = run([{ type: "transcript", session, text: " Send Sophia an interview invitation " }], state);
  assert.deepEqual([state.phase, state.transcript], ["preparing", "Send Sophia an interview invitation"]);
  state = run([{ type: "responded", session, done: false }], state);
  assert.equal(state.phase, "ready"); // a proposal waits for the recruiter
  state = run([{ type: "execute", session }, { type: "executed", session }], state);
  assert.equal(state.phase, "complete");
});

test("an action that needed no confirmation completes straight away", () => {
  const started = run([{ type: "start" }]);
  const { session } = started;
  const state = run(
    [
      { type: "listening", session },
      { type: "stop", session },
      { type: "transcript", session, text: "Create a Backend Engineer job" },
      { type: "responded", session, done: true },
    ],
    started,
  );
  assert.equal(state.phase, "complete");
});

test("rapid repeated microphone presses start one recording", () => {
  let state = INITIAL_VOICE;
  for (let press = 0; press < 5; press += 1) {
    if (micAction(state.phase) === "start") state = voiceReducer(state, { type: "start" });
  }
  assert.equal(state.phase, "starting");
  assert.equal(state.session, 1); // one session, not five
  assert.equal(micAction("starting"), null);
  assert.equal(micAction("understanding"), null);
  assert.equal(micAction("preparing"), null);
  assert.equal(micAction("executing"), null);
  assert.equal(micAction("listening"), "stop");
  assert.equal(micAction("complete"), "start");
});

test("start and stop repeatedly stays consistent", () => {
  let state = INITIAL_VOICE;
  for (let round = 1; round <= 3; round += 1) {
    state = voiceReducer(state, { type: "start" });
    state = voiceReducer(state, { type: "listening", session: state.session });
    state = voiceReducer(state, { type: "cancel" });
    assert.equal(state.phase, "idle");
  }
  assert.equal(state.session, 6); // each start and each cancel moved the session on
});

test("results from a cancelled session are ignored", () => {
  let state = run([{ type: "start" }]);
  const old = state.session;
  state = run([{ type: "listening", session: old }, { type: "stop", session: old }, { type: "cancel" }], state);
  const after = run([{ type: "transcript", session: old, text: "Publish the job" }, { type: "responded", session: old, done: true }], state);
  assert.deepEqual(after, state); // nothing moved
  assert.equal(after.phase, "idle");
});

test("silence and errors", () => {
  let state = run([{ type: "start" }]);
  const { session } = state;
  state = run([{ type: "listening", session }, { type: "stop", session }, { type: "transcript", session, text: "   " }], state);
  assert.equal(state.phase, "error");
  assert.match(state.error, /didn't catch/);
  assert.equal(micAction(state.phase), "start"); // try again

  const failed = run([{ type: "start" }, { type: "fail", session: 1, message: "Microphone blocked" }]);
  assert.deepEqual([failed.phase, failed.error], ["error", "Microphone blocked"]);
});

test("the recording stops itself after a pause, or at the limit", () => {
  assert.equal(shouldAutoStop({ heardSpeech: false, silentMs: 5000, elapsedMs: 5000 }), false); // waiting to hear anything
  assert.equal(shouldAutoStop({ heardSpeech: true, silentMs: 900, elapsedMs: 4000 }), false);
  assert.equal(shouldAutoStop({ heardSpeech: true, silentMs: 1900, elapsedMs: 4000 }), true);
  assert.equal(shouldAutoStop({ heardSpeech: false, silentMs: 0, elapsedMs: 45_000 }), true);
});
