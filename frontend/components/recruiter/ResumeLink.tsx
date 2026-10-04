"use client";

import { FileText, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";
import { apiDownload, errorMessage } from "@/services/api";

const WORD_EXTENSIONS: Record<string, string> = {
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

type ResumeLinkProps = {
  url: string;
  /** Names the file when it's saved rather than opened. */
  candidateName: string;
  className?: string;
};

/**
 * The candidate's résumé. An http(s) link opens in a new tab. A file the API serves (/api/v1/..., such
 * as one uploaded on the demo careers site) is private, so it's fetched with the recruiter's token
 * first: a PDF then opens in a new tab, and anything else, like a Word file, is saved.
 */
export function ResumeLink({ url, candidateName, className }: ResumeLinkProps) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);

  if (/^https?:\/\//i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
        <FileText aria-hidden className="size-4 text-stone" /> Résumé
      </a>
    );
  }
  if (!url.startsWith("/api/v1/")) return null;

  async function open() {
    setOpening(true);
    try {
      const file = await apiDownload(url);
      const objectUrl = URL.createObjectURL(file);
      // The new tab or the download reads the file from this URL, so it stays valid for a while.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      if (file.type !== "application/pdf") {
        save(objectUrl, `${candidateName} résumé${WORD_EXTENSIONS[file.type] ?? ""}`);
      } else if (!window.open(objectUrl, "_blank")) {
        // A tab opened once the download finishes may count as a popup; a click on the toast won't.
        toast({
          title: "Your browser blocked the new tab",
          description: "The résumé is ready to open.",
          action: { label: "Open", onClick: () => window.open(objectUrl, "_blank") },
        });
      }
    } catch (error) {
      toast({ title: "Couldn't open the résumé", description: errorMessage(error), tone: "error" });
    } finally {
      setOpening(false);
    }
  }

  return (
    <button type="button" onClick={() => void open()} disabled={opening} className={cn("disabled:opacity-50", className)}>
      {opening ? <LoaderCircle aria-hidden className="size-4 animate-spin text-stone" /> : <FileText aria-hidden className="size-4 text-stone" />}
      Résumé
    </button>
  );
}

function save(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
}
