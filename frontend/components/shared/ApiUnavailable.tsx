import { ServerCrash } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { ReloadButton } from "@/components/shared/ReloadButton";

type ApiUnavailableProps = {
  message: string;
  title?: string;
  /** The API couldn't be reached or failed (isServerUnavailable), rather than refusing the request. */
  serverDown?: boolean;
};

/** Full-page notice when the workspace or portal can't load its data from the API. */
export function ApiUnavailable({ message, title = "The recruiting workspace can't load right now", serverDown = true }: ApiUnavailableProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={ServerCrash}
        title={title}
        description={message}
        className="w-full max-w-lg"
        action={
          <div className="flex flex-col items-center gap-4">
            {serverDown && (
              <p className="text-xs text-faint">
                Start the API with <code className="rounded bg-ink/[0.06] px-1.5 py-0.5 text-charcoal">uvicorn app.main:app --reload --port 8000</code> in
                backend/, then try again.
              </p>
            )}
            <ReloadButton />
          </div>
        }
      />
    </main>
  );
}
