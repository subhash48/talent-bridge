import { Button } from "@/components/ui/Button";

export function DetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-danger/20 bg-danger/[0.06] px-3.5 py-2.5 text-sm text-danger">
      <span>{message}</span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
