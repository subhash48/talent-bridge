import { Skeleton } from "@/components/ui/Skeleton";

// Mirrors the dashboard layout so nothing shifts when the page arrives.
export default function CandidatesLoading() {
  return (
    <div className="flex flex-col gap-7" aria-busy="true" aria-label="Loading candidates">
      <div className="flex flex-col gap-6 pt-1 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-16 w-44" />
          <Skeleton className="h-5 w-80 max-w-full" />
        </div>
        <div className="flex w-full gap-3 xl:w-auto">
          <Skeleton className="h-12 flex-1 rounded-[14px] xl:w-[440px]" />
          <Skeleton className="h-12 w-40 rounded-[12px]" />
        </div>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[104px] rounded-[18px]" />
            ))}
          </div>
          <Skeleton className="h-[640px] rounded-[22px]" />
        </div>
        <Skeleton className="hidden h-[760px] rounded-[22px] xl:block" />
      </div>
    </div>
  );
}
