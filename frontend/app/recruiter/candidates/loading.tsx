import { Skeleton } from "@/components/ui/Skeleton";

// Mirrors the dashboard layout so nothing shifts when the page arrives.
export default function CandidatesLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading candidates">
      <div className="flex flex-col gap-5 pt-1 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex w-full gap-3 xl:w-auto">
          <Skeleton className="h-10 flex-1 rounded-[10px] xl:w-[324px] 2xl:w-[400px]" />
          <Skeleton className="h-10 w-36 rounded-[8px]" />
        </div>
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[84px] rounded-[14px]" />
            ))}
          </div>
          <Skeleton className="h-[576px] rounded-[16px]" />
        </div>
        <Skeleton className="hidden h-[680px] rounded-[16px] xl:block" />
      </div>
    </div>
  );
}
