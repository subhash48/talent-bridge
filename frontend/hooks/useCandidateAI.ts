import { useCallback, useEffect, useRef, useState } from "react";

import { askCandidateAI, type ChatSource } from "@/services/ai";

export type AIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "thinking" | "streaming" | "done" | "error";
  sources?: ChatSource[];
};

/** One Copilot conversation about one candidate. Remount (key by candidate) to start fresh. */
export function useCandidateAI(candidateId: string) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const send = useCallback(
    async (prompt: string) => {
      const message = prompt.trim();
      if (!message || controllerRef.current) return;

      const controller = new AbortController();
      controllerRef.current = controller;
      const assistantId = crypto.randomUUID();
      const update = (patch: (current: AIMessage) => Partial<AIMessage>) =>
        setMessages((list) => list.map((item) => (item.id === assistantId ? { ...item, ...patch(item) } : item)));

      setMessages((list) => [
        ...list,
        { id: crypto.randomUUID(), role: "user", content: message, status: "done" },
        { id: assistantId, role: "assistant", content: "", status: "thinking" },
      ]);
      setPending(true);

      try {
        for await (const event of askCandidateAI({ candidateId, message, signal: controller.signal })) {
          if (event.event === "meta") update(() => ({ sources: event.data.sources }));
          else if (event.event === "delta") update((current) => ({ content: current.content + event.data.text, status: "streaming" }));
          else if (event.event === "error") {
            update(() => ({ content: event.data.fallback ?? "Something went wrong. Try again.", status: "error" }));
          }
        }
        update((current) => ({ status: current.status === "error" ? "error" : "done" }));
      } catch {
        if (controller.signal.aborted) {
          update((current) => ({ status: "done", content: current.content || "Stopped." }));
        } else {
          update(() => ({ content: "I couldn't reach the AI service. Try again in a moment.", status: "error" }));
        }
      } finally {
        controllerRef.current = null;
        setPending(false);
      }
    },
    [candidateId],
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  return { messages, pending, send, stop };
}
