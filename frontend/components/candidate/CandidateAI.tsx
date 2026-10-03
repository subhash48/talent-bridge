"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

// Candidate Assistant. Streaming through services/ai.ts comes later (ARCHITECTURE.md 6.2, 6.9).
export function CandidateAI() {
  const [message, setMessage] = useState("");

  return (
    <Card className="flex min-h-[60vh] flex-col">
      <p className="flex-1 text-sm text-stone">
        Ask about the company, the team, or how to prepare for your interview.
      </p>
      <form className="mt-6 flex gap-2" onSubmit={(event) => event.preventDefault()}>
        <Input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Tell me about the team…"
          aria-label="Message the assistant"
        />
        <Button type="submit" disabled>
          Send
        </Button>
      </form>
      <p className="mt-3 text-xs text-stone">
        Your recruiter sees the topics you ask about, not your messages.
      </p>
    </Card>
  );
}
