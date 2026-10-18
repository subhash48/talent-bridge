import { useCallback, useEffect, useRef, useState } from "react";

import type { AIMessage } from "@/components/ai/AIThread";
import { errorMessage } from "@/services/api";
import { askCandidateAssistant } from "@/services/portal";

/**
 * One conversation with the candidate assistant about one application, rendered by AIThread. Its
 * endpoint sees candidate-safe context only.
 */
export function usePortalAssistant(applicationId: string | null) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [pending, setPending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const send = useCallback(async (prompt: string) => {
    const message = prompt.trim();
    if (!message || controllerRef.current) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    const assistantId = crypto.randomUUID();
    const update = (patch: Partial<AIMessage>) =>
      setMessages((list) => list.map((item) => (item.id === assistantId ? { ...item, ...patch } : item)));

    setMessages((list) => [
      ...list,
      { id: crypto.randomUUID(), role: "user", content: message, status: "done" },
      { id: assistantId, role: "assistant", content: "", status: "thinking" },
    ]);
    setPending(true);
    try {
      update({ content: await askCandidateAssistant(message, applicationId, controller.signal), status: "done" });
    } catch (error) {
      if (controller.signal.aborted) update({ content: "Stopped.", status: "done" });
      else update({ content: errorMessage(error, "The assistant is temporarily unavailable. Try again in a moment."), status: "error" });
    } finally {
      controllerRef.current = null;
      setPending(false);
    }
  }, [applicationId]);

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  return { messages, pending, send, stop };
}
