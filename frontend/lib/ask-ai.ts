/**
 * Suggested questions for the candidate assistant, shown on the Ask AI page and as shortcuts into it.
 * A shortcut remembers its question for this tab and opens /candidate/ai, which asks it once. It's
 * kept out of the address, so going Back to the page or reloading it never asks it again, and only
 * these questions are ever asked automatically.
 */
export const ASK_AI_PROMPTS = [
  "What does the company do?",
  "What benefits are offered?",
  "What's the culture like?",
  "How does the interview process work?",
  "Where does my application stand?",
  "What should I prepare?",
] as const;

const PENDING_KEY = "tb.ask-ai.pending";

/** Called by a shortcut just before it opens Ask AI. */
export function rememberAskAIQuestion(question: string): void {
  try {
    sessionStorage.setItem(PENDING_KEY, question);
  } catch {
    // Storage is unavailable (private mode, blocked): Ask AI opens without asking.
  }
}

/** The shortcut's question, once: reading it clears it. Null unless it's one of the suggested prompts. */
export function takeAskAIQuestion(): string | null {
  try {
    const question = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return question && (ASK_AI_PROMPTS as readonly string[]).includes(question) ? question : null;
  } catch {
    return null;
  }
}
