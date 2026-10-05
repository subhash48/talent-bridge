import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { INITIAL_VOICE, micAction, shouldAutoStop, voiceReducer } from "@/lib/voice";
import { ApiError, errorMessage } from "@/services/api";
import { transcribe } from "@/services/assistant";

// Speech for the AI Assistant. The recording is sent to the API to be transcribed (Groq Whisper) and is
// never kept, in the browser or on the server: only the words go on to the assistant. Where the API has
// no transcription, the browser's own speech recognition does it instead. Either way the words take the
// same path as typed text (hooks/useAssistant).

export type VoiceEngine = "server" | "browser" | "unsupported";

const BARS = 28;
const SPEECH_LEVEL = 0.045; // RMS above this is someone speaking
const MIC_BLOCKED = "Microphone access is blocked. Allow it in your browser's site settings, or type your request instead.";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionClass(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as Record<string, unknown>;
  return (scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

function pickMimeType(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) ?? "";
}

type Capture = {
  session: number;
  stream: MediaStream;
  audio: AudioContext;
  recorder: MediaRecorder | null;
  recognition: SpeechRecognitionLike | null;
  chunks: Blob[];
  frame: number;
  heardSpeech: boolean;
  lastSpeechAt: number;
  startedAt: number;
  finalText: string;
  stopping: boolean;
};

export function useVoiceInput({
  serverTranscription,
  onTranscript,
}: {
  /** The API can transcribe (GET /assistant/status). */
  serverTranscription: boolean;
  /** The words, once they're known. The caller sends them to the assistant. */
  onTranscript: (text: string, session: number) => void;
}) {
  const [state, dispatch] = useReducer(voiceReducer, INITIAL_VOICE);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [browserCanRecognize, setBrowserCanRecognize] = useState(false);
  const capture = useRef<Capture | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const stateRef = useRef(state);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    stateRef.current = state;
  });
  useEffect(() => {
    // Known only in the browser, after hydration.
    const supported = recognitionClass() !== null;
    queueMicrotask(() => setBrowserCanRecognize(supported));
  }, []);

  const engine: VoiceEngine = serverTranscription ? "server" : browserCanRecognize ? "browser" : "unsupported";

  const release = useCallback(() => {
    const current = capture.current;
    if (!current) return;
    capture.current = null;
    cancelAnimationFrame(current.frame);
    current.stream.getTracks().forEach((track) => track.stop());
    void current.audio.close().catch(() => undefined);
    setLevels(Array(BARS).fill(0));
  }, []);

  const finish = useCallback(
    async (current: Capture) => {
      const { session } = current;
      try {
        let text = current.finalText;
        if (engine === "server") {
          const blob = new Blob(current.chunks, { type: current.recorder?.mimeType || "audio/webm" });
          current.chunks = [];
          text = blob.size ? await transcribe(blob) : "";
        }
        if (stateRef.current.session !== session) return; // cancelled meanwhile
        dispatch({ type: "transcript", session, text });
        if (text.trim()) onTranscriptRef.current(text.trim(), session);
      } catch (error) {
        const message =
          error instanceof ApiError && error.code === "transcription_unavailable"
            ? "Voice transcription isn't available right now. Type your request instead."
            : errorMessage(error, "We couldn't transcribe that. Try again, or type your request.");
        dispatch({ type: "fail", session, message });
      }
    },
    [engine],
  );

  const stop = useCallback(() => {
    const current = capture.current;
    if (!current || current.stopping) return;
    current.stopping = true;
    dispatch({ type: "stop", session: current.session });
    cancelAnimationFrame(current.frame);
    if (current.recorder && current.recorder.state !== "inactive") {
      current.recorder.onstop = () => {
        release();
        void finish(current);
      };
      current.recorder.stop();
    } else if (current.recognition) {
      current.recognition.onend = () => {
        release();
        void finish(current);
      };
      current.recognition.stop();
    } else {
      release();
    }
  }, [finish, release]);

  const start = useCallback(async () => {
    if (micAction(stateRef.current.phase) !== "start" || capture.current) return;
    const session = stateRef.current.session + 1;
    dispatch({ type: "start" });
    if (engine === "unsupported") {
      dispatch({ type: "fail", session, message: "Voice input isn't supported in this browser. Type your request instead." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      dispatch({
        type: "fail",
        session,
        message: name === "NotFoundError" ? "No microphone was found. Connect one, or type your request instead." : MIC_BLOCKED,
      });
      return;
    }
    if (stateRef.current.session !== session) {
      stream.getTracks().forEach((track) => track.stop()); // cancelled while the browser asked
      return;
    }

    const audio = new AudioContext();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    audio.createMediaStreamSource(stream).connect(analyser);
    const current: Capture = {
      session,
      stream,
      audio,
      recorder: null,
      recognition: null,
      chunks: [],
      frame: 0,
      heardSpeech: false,
      lastSpeechAt: performance.now(),
      startedAt: performance.now(),
      finalText: "",
      stopping: false,
    };
    capture.current = current;

    if (engine === "server") {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => event.data.size && current.chunks.push(event.data);
      recorder.start(250);
      current.recorder = recorder;
    } else {
      const Recognition = recognitionClass();
      if (Recognition) {
        const recognition = new Recognition();
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.onresult = (event) => {
          const text = Array.from(event.results, (result) => result[0]?.transcript ?? "").join(" ");
          current.finalText = text;
          dispatch({ type: "interim", session, text });
        };
        recognition.onerror = (event) => {
          if (event.error === "aborted" || event.error === "no-speech") return;
          release();
          dispatch({ type: "fail", session, message: event.error === "not-allowed" ? MIC_BLOCKED : "Voice recognition stopped. Try again." });
        };
        recognition.start();
        current.recognition = recognition;
      }
    }
    dispatch({ type: "listening", session });

    // The waveform, and stopping by itself after a pause.
    const samples = new Uint8Array(analyser.fftSize);
    const history: number[] = Array(BARS).fill(0);
    let lastPaint = 0;
    const tick = (now: number) => {
      if (capture.current !== current || current.stopping) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      const level = Math.sqrt(sum / samples.length);
      if (level > SPEECH_LEVEL) {
        current.heardSpeech = true;
        current.lastSpeechAt = now;
      }
      if (now - lastPaint > 60) {
        lastPaint = now;
        history.push(Math.min(1, level * 6));
        history.shift();
        setLevels([...history]);
      }
      if (shouldAutoStop({ heardSpeech: current.heardSpeech, silentMs: now - current.lastSpeechAt, elapsedMs: now - current.startedAt })) {
        stop();
        return;
      }
      current.frame = requestAnimationFrame(tick);
    };
    current.frame = requestAnimationFrame(tick);
  }, [engine, release, stop]);

  /** The microphone button: start, stop, or nothing while a step is in flight. */
  const press = useCallback(() => {
    const action = micAction(stateRef.current.phase);
    if (action === "start") void start();
    else if (action === "stop") stop();
  }, [start, stop]);

  const cancel = useCallback(() => {
    const current = capture.current;
    if (current) {
      current.stopping = true;
      if (current.recorder && current.recorder.state !== "inactive") {
        current.recorder.onstop = null;
        current.recorder.stop();
      }
      current.recognition?.abort();
      current.chunks = []; // the recording is discarded, never sent
    }
    release();
    dispatch({ type: "cancel" });
  }, [release]);

  useEffect(() => () => release(), [release]);

  return {
    state,
    levels,
    engine,
    press,
    stop,
    cancel,
    responded: (session: number, done: boolean) => dispatch({ type: "responded", session, done }),
    executing: (session: number) => dispatch({ type: "execute", session }),
    executed: (session: number) => dispatch({ type: "executed", session }),
    fail: (session: number, message: string) => dispatch({ type: "fail", session, message }),
  };
}
