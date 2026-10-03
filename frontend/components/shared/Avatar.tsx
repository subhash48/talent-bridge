import { cn } from "@/lib/utils";

type AvatarProps = {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Avatar({ name, src, size = 32, className }: AvatarProps) {
  const style = { width: size, height: size };

  if (src) {
    return (
      <img src={src} alt={name} style={style} className={cn("rounded-full object-cover", className)} />
    );
  }

  return (
    <span
      role="img"
      aria-label={name}
      style={style}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-muted text-xs font-medium text-charcoal",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
