import "server-only";

import { cache } from "react";
import { getCareerJob } from "@/services/careers";

// Metadata and the page share the same read for this request, without caching a closed role across requests.
export const getPublicJob = cache((id: string) => getCareerJob(id, "native"));
