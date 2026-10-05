// The AI Assistant's voice interaction, as a state machine with no browser code, so the workspace and
// the tests drive exactly the same transitions.
//
//   idle → starting → listening → understanding → preparing → ready ⇄ executing → complete
//
// Every start begins a new session. Results from an earlier session (a transcript arriving after the
// recruiter cancelled, say) carry its number and are ignored, and pressing the microphone while a step
// is in flight does nothing, so rapid repeated presses never start a second recording or request.

export type VoicePhase =
  | "idle"
  | "starting" // asking for the microphone
  | "listening"
  | "understanding" // transcribing
  | "preparing" // the assistant is working out the action
  | "ready" // the answer or proposal is shown; a proposal waits for confirmation
  | "executing" // confirmed: sending or publishing
  | "complete"
  | "error";

export type VoiceState = { phase: VoicePhase; session: number; transcript: string; error: string | null };

export type VoiceEvent =
  | { type: "start" }
  | { type: "listening"; session: number }
  | { type: "interim"; session: number; text: string }
  | { type: "stop"; session: number }
  | { type: "transcript"; session: number; text: string }
  | { type: "responded"; session: number; done: boolean }
  | { type: "execute"; session: number }
  | { type: "executed"; session: number }
  | { type: "fail"; session: number; message: string }
  | { type: "cancel" };

export const INITIAL_VOICE: VoiceState = { phase: "idle", session: 0, transcript: "", error: null };

export const VOICE_LABELS: Record<VoicePhase, string> = {
  idle: "Tap the microphone to speak",
  starting: "Starting the microphone…",
  listening: "Listening…",
  understanding: "Understanding…",
  preparing: "Preparing action…",
  ready: "Ready",
  executing: "Executing…",
  complete: "Complete",
  error: "Something went wrong",
};

/** Phases a new recording may start from. */
const RESTARTABLE: ReadonlySet<VoicePhase> = new Set(["idle", "ready", "complete", "error"]);

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  if (event.type === "start") {
    if (!RESTARTABLE.has(state.phase)) return state;
    return { phase: "starting", session: state.session + 1, transcript: "", error: null };
  }
  if (event.type === "cancel") {
    // A new session number, so anything still on its way from this one is dropped.
    return { ...INITIAL_VOICE, session: state.session + 1 };
  }
  if (event.session !== state.session) return state; // from an earlier, cancelled session
  switch (event.type) {
    case "listening":
      return state.phase === "starting" ? { ...state, phase: "listening" } : state;
    case "interim":
      return state.phase === "listening" ? { ...state, transcript: event.text } : state;
    case "stop":
      return state.phase === "listening" ? { ...state, phase: "understanding" } : state;
    case "transcript": {
      if (state.phase !== "understanding" && state.phase !== "listening") return state;
      const text = event.text.trim();
      if (!text) return { ...state, phase: "error", error: "I didn't catch that. Try again, a little closer to the microphone." };
      return { ...state, phase: "preparing", transcript: text };
    }
    case "responded":
      return state.phase === "preparing" ? { ...state, phase: event.done ? "complete" : "ready" } : state;
    case "execute":
      return state.phase === "ready" ? { ...state, phase: "executing" } : state;
    case "executed":
      return state.phase === "executing" ? { ...state, phase: "complete" } : state;
    case "fail":
      return state.phase === "idle" ? state : { ...state, phase: "error", error: event.message };
  }
}

/** What pressing the microphone means now: start, stop, or nothing (a step is already in flight). */
export function micAction(phase: VoicePhase): "start" | "stop" | null {
  if (phase === "listening") return "stop";
  return RESTARTABLE.has(phase) ? "start" : null;
}

/** Whether the recording should stop on its own: after a pause once speech was heard, or at the limit. */
export function shouldAutoStop({
  heardSpeech,
  silentMs,
  elapsedMs,
}: {
  heardSpeech: boolean;
  silentMs: number;
  elapsedMs: number;
}): boolean {
  return (heardSpeech && silentMs >= 1800) || elapsedMs >= 45_000;
}
