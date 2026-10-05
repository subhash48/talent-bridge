import { ShieldCheck } from "lucide-react";
import { useId } from "react";

import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { DEMOGRAPHIC_QUESTIONS, DEMOGRAPHICS_EXPLANATION, type DemographicAnswers, type DemographicField } from "@/lib/demographics";
import { cn } from "@/lib/utils";

type DemographicFieldsProps = {
  value: DemographicAnswers;
  onChange: (field: DemographicField, value: string | null) => void;
  disabled?: boolean;
  /** Field classes, e.g. 16px text on phones so iOS doesn't zoom. */
  fieldClassName?: string;
};

/**
 * The four optional questions, each a native select that starts blank. Used by the demo careers
 * application form and the candidate portal profile, so both ask exactly the same way.
 */
export function DemographicFields({ value, onChange, disabled, fieldClassName }: DemographicFieldsProps) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-4" aria-describedby={`${id}-why`}>
      <legend className="sr-only">Voluntary demographic information</legend>
      <p id={`${id}-why`} className="flex items-start gap-2 text-xs leading-relaxed text-stone">
        <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0 text-faint" />
        {DEMOGRAPHICS_EXPLANATION}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {DEMOGRAPHIC_QUESTIONS.map((question) => (
          <Field key={question.field} label={`${question.label} (optional)`} htmlFor={`${id}-${question.field}`}>
            <Select
              id={`${id}-${question.field}`}
              value={value[question.field] ?? ""}
              disabled={disabled}
              onChange={(event) => onChange(question.field, event.target.value || null)}
              className={cn(!value[question.field] && "text-faint", fieldClassName)}
            >
              <option value="">Not answered</option>
              {question.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
    </fieldset>
  );
}
