// Voluntary demographic questions, as the demo careers form and the candidate portal profile ask them.
// The values mirror backend/app/core/enums.py; every question is optional and has "Prefer not to say".
// Answers are reported only in aggregate and never shown on anyone's application or used in hiring.

export type DemographicField = "region" | "race_ethnicity" | "disability_status" | "sexual_orientation";

export type DemographicAnswers = Record<DemographicField, string | null>;

export const EMPTY_DEMOGRAPHICS: DemographicAnswers = {
  region: null,
  race_ethnicity: null,
  disability_status: null,
  sexual_orientation: null,
};

export const DEMOGRAPHICS_EXPLANATION =
  "These questions are optional and are used only in aggregate to understand and improve the candidate experience. " +
  "Your responses are not shown on your individual application and are not used in hiring decisions.";

const PREFER_NOT = { value: "prefer_not_to_say", label: "Prefer not to say" };

export const DEMOGRAPHIC_QUESTIONS: { field: DemographicField; label: string; options: { value: string; label: string }[] }[] = [
  {
    field: "region",
    label: "Region",
    options: [
      { value: "united_states", label: "United States" },
      { value: "india", label: "India" },
      { value: "united_kingdom", label: "United Kingdom" },
      { value: "canada", label: "Canada" },
      { value: "germany", label: "Germany" },
      { value: "other", label: "Other" },
      PREFER_NOT,
    ],
  },
  {
    field: "race_ethnicity",
    label: "Race / ethnicity",
    options: [
      { value: "asian", label: "Asian" },
      { value: "black", label: "Black / African descent" },
      { value: "hispanic_latino", label: "Hispanic / Latino" },
      { value: "middle_eastern_north_african", label: "Middle Eastern / North African" },
      { value: "white", label: "White" },
      { value: "multiracial", label: "Multiracial" },
      { value: "another_identity", label: "Another identity" },
      PREFER_NOT,
    ],
  },
  {
    field: "disability_status",
    label: "Disability status",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, PREFER_NOT],
  },
  {
    field: "sexual_orientation",
    label: "Sexual orientation",
    options: [
      { value: "straight", label: "Straight / heterosexual" },
      { value: "gay", label: "Gay" },
      { value: "lesbian", label: "Lesbian" },
      { value: "bisexual", label: "Bisexual" },
      { value: "asexual", label: "Asexual" },
      { value: "queer", label: "Queer" },
      { value: "another_identity", label: "Another identity" },
      PREFER_NOT,
    ],
  },
];

/** Only the questions answered, for the API (a blank one stays unanswered). */
export function answered(answers: DemographicAnswers): Partial<DemographicAnswers> {
  return Object.fromEntries(Object.entries(answers).filter(([, value]) => value)) as Partial<DemographicAnswers>;
}
