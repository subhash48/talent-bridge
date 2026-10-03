import { MapPin, Phone, Video } from "lucide-react";

import type { InterviewFormat as Format } from "@/types/workspace";

const FORMATS = {
  video: { icon: Video, label: "Video call" },
  onsite: { icon: MapPin, label: "On-site, London office" },
  phone: { icon: Phone, label: "Phone call" },
} as const;

export function InterviewFormat({ format }: { format: Format }) {
  const { icon: Icon, label } = FORMATS[format];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  );
}
