type CandidateHeaderProps = {
  title: string;
  subtitle?: string;
};

export function CandidateHeader({ title, subtitle }: CandidateHeaderProps) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-4xl text-ink">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-stone">{subtitle}</p>}
    </header>
  );
}
