import { Card } from "@/components/ui/Card";
import type { PrepResource } from "@/types/interview";

export function InterviewPrep({ resources }: { resources: PrepResource[] }) {
  return (
    <Card>
      <h2 className="text-sm font-medium text-ink">Interview preparation</h2>
      {resources.length === 0 ? (
        <p className="mt-3 text-sm text-stone">Preparation resources will appear here.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {resources.map((resource) => (
            <li key={resource.id} className="flex items-center justify-between gap-4">
              <span className="text-charcoal">{resource.title}</span>
              {resource.viewed && <span className="text-xs text-sage">Viewed</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
