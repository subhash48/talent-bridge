import { Button } from "@/components/ui/Button";

export function DetailError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] border border-red-400/20 bg-red-400/[0.06] px-3.5 py-3 text-sm text-red-100">
      <span>{message}</span>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
