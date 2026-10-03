"use client";

import { cn } from "@/lib/utils";
import type { Role } from "@/types/candidate";

type RoleSwitcherProps = {
  enabled: boolean;
  current: Role | null;
  onSwitch?: (role: "recruiter" | "candidate") => void;
};

// Demo only: switches between real demo sessions when DEMO_MODE is on (ARCHITECTURE.md 10.4).
export function RoleSwitcher({ enabled, current, onSwitch }: RoleSwitcherProps) {
  if (!enabled) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-canvas/80 p-1 text-sm shadow-raised backdrop-blur">
      <span className="px-3 text-stone">View as</span>
      {(["recruiter", "candidate"] as const).map((role) => (
        <button
          key={role}
          type="button"
          onClick={() => onSwitch?.(role)}
          className={cn(
            "rounded-full px-3 py-1.5 capitalize text-stone",
            current === role && "bg-ink text-canvas",
          )}
        >
          {role}
        </button>
      ))}
    </div>
  );
}
