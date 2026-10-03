"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

// Recruiter Copilot. Streaming through services/ai.ts comes later (ARCHITECTURE.md 6.2, 6.9).
export function RecruiterAI() {
  const [message, setMessage] = useState("");

  return (
    <Card className="flex min-h-[60vh] flex-col">
      <p className="flex-1 text-sm text-stone">Ask about candidates, jobs or follow-ups.</p>
      <form className="mt-6 flex gap-2" onSubmit={(event) => event.preventDefault()}>
        <Input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="What's happening with…"
          aria-label="Message the Copilot"
        />
        <Button type="submit" disabled>
          Send
        </Button>
      </form>
    </Card>
  );
}
