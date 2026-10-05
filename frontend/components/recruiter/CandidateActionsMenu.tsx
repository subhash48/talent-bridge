"use client";

import { Archive, ArrowRightLeft, Copy, EllipsisVertical, MessageSquareText, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { useWorkspace } from "@/components/recruiter/WorkspaceProvider";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { useToast } from "@/components/ui/Toaster";
import { firstName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/services/api";
import { STAGE_LABELS } from "@/types/application";
import { PIPELINE_STAGES, type CandidateStage, type PipelineCandidate } from "@/types/workspace";

type CandidateActionsMenuProps = {
  candidate: PipelineCandidate;
  /** Focus the AI panel on this candidate. Omitted where the AI panel isn't on screen. */
  onAskAI?: () => void;
  className?: string;
};

/** Row and panel "⋮" menu: open, message, ask AI, move stage, copy email, archive (with undo). */
export function CandidateActionsMenu({ candidate, onAskAI, className }: CandidateActionsMenuProps) {
  const { moveCandidate, archiveCandidate, restoreCandidate } = useWorkspace();
  const toast = useToast();
  const first = firstName(candidate.name);
  // "Ask AI" moves focus to the prompt box, so the menu must not hand focus back to its trigger.
  const keepFocusAway = useRef(false);

  async function move(stage: CandidateStage) {
    if (stage === candidate.stage) return;
    try {
      await moveCandidate(candidate.id, stage);
      toast({ title: `${first} moved to ${STAGE_LABELS[stage]}`, tone: "success" });
    } catch (error) {
      toast({ title: "Couldn't update the stage", description: errorMessage(error), tone: "error" });
    }
  }

  async function copyEmail() {
    if (!candidate.email) return;
    try {
      await navigator.clipboard.writeText(candidate.email);
      toast({ title: "Email copied", description: candidate.email, tone: "success" });
    } catch {
      toast({ title: "Couldn't copy the email", tone: "error" });
    }
  }

  async function archive() {
    try {
      await archiveCandidate(candidate.id);
      toast({
        title: `${candidate.name} archived`,
        description: "Removed from the active pipeline.",
        action: {
          label: "Undo",
          onClick: () =>
            restoreCandidate(candidate.id).catch((error: unknown) =>
              toast({ title: "Couldn't restore this candidate", description: errorMessage(error), tone: "error" }),
            ),
        },
      });
    } catch (error) {
      toast({ title: "Couldn't archive this candidate", description: errorMessage(error), tone: "error" });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${candidate.name}`}
          className={cn("text-stone data-[state=open]:bg-ink/[0.08] data-[state=open]:text-ink", className)}
          onClick={(event) => event.stopPropagation()}
        >
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-52"
        onClick={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          if (keepFocusAway.current) event.preventDefault();
          keepFocusAway.current = false;
        }}
      >
        <DropdownMenuItem asChild>
          <Link href={`/recruiter/candidates/${candidate.id}`}>
            <UserRound /> View full profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/recruiter/messages?candidate=${candidate.id}`}>
            <MessageSquareText /> Message {first}
          </Link>
        </DropdownMenuItem>
        {onAskAI && (
          <DropdownMenuItem
            onSelect={() => {
              keepFocusAway.current = true;
              onAskAI();
            }}
          >
            <Sparkles className="text-ink!" /> Ask AI about {first}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowRightLeft /> Move to stage
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={candidate.stage} onValueChange={(value) => void move(value as CandidateStage)}>
              {PIPELINE_STAGES.map((stage) => (
                <DropdownMenuRadioItem key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={!candidate.email} onSelect={() => void copyEmail()}>
          <Copy /> Copy email
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void archive()}>
          <Archive /> Archive candidate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
