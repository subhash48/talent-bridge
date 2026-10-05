import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, errorMessage } from "@/services/api";
import { askAssistant, cancelAction, confirmAction, getRecentActions } from "@/services/assistant";
import type { AssistantCard, AssistantContext, AssistantHistoryItem, AssistantResponse, InputType } from "@/types/assistant";

export type AssistantTurn =
  | { id: string; role: "user"; text: string; inputType: InputType }
  | { id: string; role: "assistant"; status: "thinking" }
  | { id: string; role: "assistant"; status: "done"; response: AssistantResponse }
  | { id: string; role: "assistant"; status: "error"; error: string };

const EMPTY_CONTEXT: AssistantContext = { application_id: null, job_id: null, action_id: null };

/**
 * One conversation with the recruiter assistant. Typed and spoken requests both go through send(); the
 * context the API returns (the candidate, job draft or proposal being discussed) goes back with the next
 * request, so "make it hybrid" changes the same draft. One request at a time, and each has its own id,
 * so a double click or a repeated voice result can't run anything twice.
 */
export function useAssistant(initialApplicationId?: string) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [context, setContext] = useState<AssistantContext>({ ...EMPTY_CONTEXT, application_id: initialApplicationId ?? null });
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<AssistantHistoryItem[]>([]);
  const busy = useRef(false);
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await getRecentActions());
    } catch {
      // Recent actions are a convenience; the conversation works without them.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getRecentActions().then(
      (items) => !cancelled && setHistory(items),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  /** Ask. Returns the response, or null when it failed (the error is shown in the conversation). */
  const send = useCallback(
    async (text: string, inputType: InputType = "text", override?: Partial<AssistantContext>): Promise<AssistantResponse | null> => {
      const words = text.trim();
      if (!words || busy.current) return null;
      busy.current = true;
      setPending(true);
      const answerId = crypto.randomUUID();
      setTurns((list) => [
        ...list,
        { id: crypto.randomUUID(), role: "user", text: words, inputType },
        { id: answerId, role: "assistant", status: "thinking" },
      ]);
      try {
        const response = await askAssistant({
          text: words,
          inputType,
          context: { ...contextRef.current, ...override },
          clientRequestId: crypto.randomUUID(),
        });
        setTurns((list) => list.map((turn) => (turn.id === answerId ? { id: answerId, role: "assistant", status: "done", response } : turn)));
        setContext(response.context);
        if (response.status === "completed") void refreshHistory();
        return response;
      } catch (error) {
        const message = errorMessage(error, "I couldn't reach the assistant. Try again in a moment.");
        setTurns((list) => list.map((turn) => (turn.id === answerId ? { id: answerId, role: "assistant", status: "error", error: message } : turn)));
        return null;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [refreshHistory],
  );

  /** Replace a proposal's card everywhere it appears with its latest version. */
  const updateCards = useCallback((actionId: string, card: AssistantCard) => {
    setTurns((list) =>
      list.map((turn) =>
        turn.role === "assistant" && turn.status === "done"
          ? {
              ...turn,
              response: {
                ...turn.response,
                cards: turn.response.cards.map((existing) => ("action_id" in existing && existing.action_id === actionId ? card : existing)),
              },
            }
          : turn,
      ),
    );
  }, []);

  /** Run a proposal (send the message, publish the job). The result replaces the proposal's card. */
  const confirm = useCallback(
    async (actionId: string, body?: string): Promise<AssistantResponse> => {
      try {
        const result = await confirmAction(actionId, body);
        if (result.cards[0]) updateCards(actionId, { ...result.cards[0], action_id: actionId } as AssistantCard);
        setContext((current) => ({ ...current, action_id: null, ...withoutNulls(result.context) }));
        void refreshHistory();
        return result;
      } catch (error) {
        // Already handled (sent from another tab, or a second click that slipped through): show its
        // real outcome from Recent actions rather than pretending.
        if (error instanceof ApiError && error.code === "action_already_handled") void refreshHistory();
        throw error;
      }
    },
    [refreshHistory, updateCards],
  );

  const cancel = useCallback(
    async (actionId: string, card: AssistantCard) => {
      await cancelAction(actionId);
      updateCards(actionId, { ...card, status: "cancelled" } as AssistantCard);
      setContext((current) => (current.action_id === actionId ? { ...current, action_id: null } : current));
    },
    [updateCards],
  );

  const clearFocus = useCallback(() => setContext((current) => ({ ...current, application_id: null })), []);

  return { turns, context, pending, history, send, confirm, cancel, clearFocus };
}

function withoutNulls(context: AssistantContext): Partial<AssistantContext> {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== null)) as Partial<AssistantContext>;
}
