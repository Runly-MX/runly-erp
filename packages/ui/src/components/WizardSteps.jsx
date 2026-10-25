import { Check } from "lucide-react";
import { cn } from "../lib/utils.js";

// Progress header for multi-step dialogs. `steps` is [{ key, label }]; `current`
// is the active step key. Completed steps show a check and can be clicked to go
// back (`onStepClick`). On phones only the active step's label is shown.
export function WizardSteps({ steps, current, onStepClick, className }) {
  const index = Math.max(steps.findIndex((step) => step.key === current), 0);
  return (
    <nav aria-label="Pasos" className={cn("shrink-0", className)}>
      <p className="mb-2 text-xs text-[hsl(var(--muted-foreground))] sm:hidden">
        Paso {index + 1} de {steps.length}: <span className="font-medium text-[hsl(var(--foreground))]">{steps[index]?.label}</span>
      </p>
      <ol className="flex items-center gap-2">
        {steps.map((step, i) => {
          const done = i < index;
          const active = i === index;
          const clickable = done && typeof onStepClick === "function";
          return (
            <li key={step.key} className={cn("flex items-center gap-2", i < steps.length - 1 && "flex-1")}>
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick(step.key)}
                aria-current={active ? "step" : undefined}
                className={cn("flex items-center gap-2 rounded-md text-left disabled:cursor-default", clickable && "cursor-pointer")}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    active && "border-(--brand-primary) bg-(--brand-primary) text-(--brand-primary-foreground)",
                    done && "border-(--brand-primary)/40 bg-(--brand-primary)/10 text-(--brand-primary)",
                    !active && !done && "border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                </span>
                <span className={cn("hidden text-sm sm:inline", active ? "font-semibold" : "text-[hsl(var(--muted-foreground))]")}>{step.label}</span>
              </button>
              {i < steps.length - 1 && <span aria-hidden="true" className={cn("h-px flex-1", done ? "bg-(--brand-primary)/40" : "bg-[hsl(var(--border))]")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
