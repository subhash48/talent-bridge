import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, errorMessage } from "@/services/api";
import { askAssistant, cancelAction, confirmAction, getRecentActions } from "@/services/assistant";
import type {
  AssistantCard,
  AssistantContext,
  AssistantHistoryItem,
  AssistantResponse,
  ConfirmEdits,
  InputType,
} from "@/types/assistant";

export type AssistantTurn =
  | { id: string; role: "user"; text: string; inputType: InputType }
  | { id: string; role: "assistant"; status: "thinking" }
  | { id: string; role: "assistant"; status: "done"; response: AssistantResponse }
  | { id: string; role: "assistant"; status: "error"; error: string };

const EMPTY_CONTEXT: AssistantContext = {
  application_id: null,
  action_id: null,
  job_id: null,
  search: null,
  selected_application_ids: [],
};

/**
 * One conversation with the recruiter assistant. Typed and spoken requests both go through send(); the
 * context the API returns (the candidate, list, job or proposal being discussed) goes back with the next
 * request, with the candidates the recruiter has ticked, so "send them" means the drafts just made and
 * "these candidates" the ones ticked. What the recruiter changed on that proposal's card (who's unticked,
 * an edited message or job) goes too, so a typed or spoken "yes" approves exactly what they see. One
 * request at a time, and each has its own id, so a double click or a repeated voice result can't run
 * anything twice.
 */
export function useAssistant(initialApplicationId?: string) {
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [context, setContext] = useState<AssistantContext>({ ...EMPTY_CONTEXT, application_id: initialApplicationId ?? null });
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<AssistantHistoryItem[]>([]);
  const busy = useRef(false);
  // Card edits not yet sent, by proposal; and the recruiter's ticks, counted so a reply can't undo newer ones.
  const edits = useRef(new Map<string, ConfirmEdits>());
  const selection = useRef({ version: 0, ids: context.selected_application_ids ?? [] });
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

  /** Show a selection: in the context sent next, and as the ticks in every candidate list. */
  const applySelection = useCallback((ids: string[]) => {
    setContext((current) => ({ ...current, selected_application_ids: ids }));
    setTurns((list) =>
      list.map((turn) =>
        turn.role === "assistant" && turn.status === "done"
          ? {
              ...turn,
              response: {
                ...turn.response,
                cards: turn.response.cards.map((card) => (card.type === "candidate_match" ? { ...card, selected: ids } : card)),
              },
            }
          : turn,
      ),
    );
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
      const sent = { ...contextRef.current, ...override };
      const changes = sent.action_id ? edits.current.get(sent.action_id) : undefined;
      const ticks = selection.current.version;
      try {
        const response = await askAssistant({
          text: words,
          inputType,
          context: sent,
          clientRequestId: crypto.randomUUID(),
          edits: changes,
        });
        // The server has them now; anything edited while it answered is still to send.
        if (sent.action_id && edits.current.get(sent.action_id) === changes) edits.current.delete(sent.action_id);
        setTurns((list) => list.map((turn) => (turn.id === answerId ? { id: answerId, role: "assistant", status: "done", response } : turn)));
        setContext(response.context);
        // Ticked or cleared while it answered: the recruiter's newer choice stands.
        if (selection.current.version !== ticks) applySelection(selection.current.ids);
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
    [applySelection, refreshHistory],
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

  /** Run a proposal with the recruiter's edits. The result replaces the proposal's card. */
  const confirm = useCallback(
    async (actionId: string, changes?: ConfirmEdits): Promise<AssistantResponse> => {
      try {
        const result = await confirmAction(actionId, changes);
        edits.current.delete(actionId);
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
      edits.current.delete(actionId);
      updateCards(actionId, { ...card, status: "cancelled" } as AssistantCard);
      setContext((current) => (current.action_id === actionId ? { ...current, action_id: null } : current));
    },
    [updateCards],
  );

  const clearFocus = useCallback(() => setContext((current) => ({ ...current, application_id: null })), []);

  /** The recruiter changed a proposal's card: sent with the next request while it's the one in context. */
  const reportEdits = useCallback((actionId: string, changes: ConfirmEdits) => {
    edits.current.set(actionId, changes);
  }, []);

  /** The recruiter's own ticks in a candidate list: what "these candidates" means next. */
  const setSelection = useCallback((ids: string[]) => {
    selection.current = { version: selection.current.version + 1, ids };
    applySelection(ids);
  }, [applySelection]);


  return { turns, context, pending, history, send, confirm, cancel, clearFocus, setSelection, reportEdits };
}

function withoutNulls(context: AssistantContext): Partial<AssistantContext> {
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== null)) as Partial<AssistantContext>;
}
