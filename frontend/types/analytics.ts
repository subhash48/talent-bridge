// Mirrors backend/app/schemas/analytics.py and schemas/demographics.py: Candidate Portal analytics for
// recruiters. Aggregates only: nothing here names, counts or describes a single candidate.

export const RANGE_PRESETS = ["today", "last_7_days", "last_30_days", "last_90_days", "this_year", "custom"] as const;
export const GRANULARITIES = ["day", "week", "month", "year"] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];
export type Granularity = (typeof GRANULARITIES)[number];

export type AnalyticsRange = { preset: RangePreset; start?: string; end?: string };

export type AnalyticsPeriod = {
  preset: RangePreset;
  label: string;
  start: string;
  end: string;
  previous_start: string;
  previous_end: string;
  utc_offset_minutes: number;
};

export type KpiKey = "active_candidates" | "weekly_engaged" | "avg_engagement_time" | "repeat_visit_rate";

export type Kpi = {
  key: KpiKey;
  label: string;
  value: number | null;
  display: string;
  change: number | null;
  change_unit: "percent" | "points";
  comparison: string;
  description: string;
};

export type EngagementPoint = { start: string; label: string; visits: number; unique_candidates: number };

export type EngagementSeries = { granularity: Granularity; points: EngagementPoint[]; total_visits: number };

export type PortalTopic =
  | "interview_preparation"
  | "company_information"
  | "application_status"
  | "compensation"
  | "benefits"
  | "culture_team";

export type TopicShare = { topic: PortalTopic; label: string; count: number; share: number };

export type PeakActivity = { day: string; window: string; part_of_day: string; visits: number; share: number };

export type ActivityHeatmap = { rows: string[]; columns: string[]; values: number[][]; max: number; peak: PeakActivity | null };

export type PortalAnalytics = {
  period: AnalyticsPeriod;
  kpis: Kpi[];
  engagement: EngagementSeries;
  topics: { total: number; items: TopicShare[] };
  heatmap: ActivityHeatmap;
  generated_at: string;
  note: string;
};

export type AnalyticsInsight = { title: string; detail: string };

export type AnalyticsInsights = { period: AnalyticsPeriod; insights: AnalyticsInsight[]; model_name: string };

export type DemographicBucket = { key: string; label: string; share: number };

export type DemographicDimension = {
  dimension: "region" | "race_ethnicity" | "disability_status" | "sexual_orientation";
  label: string;
  respondents_approx: number;
  suppressed: boolean;
  buckets: DemographicBucket[];
};

export type DemographicsSummary = { min_group_size: number; dimensions: DemographicDimension[]; note: string };
