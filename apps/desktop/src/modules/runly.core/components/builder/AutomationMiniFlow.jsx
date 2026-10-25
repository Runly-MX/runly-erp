// A tiny preview of an automation's flow for the list: the trigger followed by its
// blocks as icons on a thread that turns dashed after a wait or an approval.
import { CalendarClock, Clock, GitBranch, Globe, MousePointerClick, Radio, ShieldCheck, Webhook, Zap } from "lucide-react";
import { isApprovalStep, isBranchStep, isDelayStep, isHttpStep, isPauseStep, stepsOf } from "@runly/module-compiler/browser";

const TRIGGER = { record: MousePointerClick, event: Radio, schedule: CalendarClock, webhook: Webhook };
const MAX_SHOWN = 8;
const iconOf = (step) => (isBranchStep(step) ? GitBranch : isDelayStep(step) ? Clock : isApprovalStep(step) ? ShieldCheck : isHttpStep(step) ? Globe : Zap);

export function AutomationMiniFlow({ automation }) {
  const steps = stepsOf(automation);
  const TriggerIcon = TRIGGER[automation.trigger?.type] ?? MousePointerClick;
  let background = false;
  return (
    <ol className="flex items-center" aria-label={`${steps.length} ${steps.length === 1 ? "bloque" : "bloques"} después del disparador`}>
      <li className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-(--brand-primary) text-(--brand-primary-foreground)"><TriggerIcon className="h-3.5 w-3.5" aria-hidden="true" /></li>
      {steps.slice(0, MAX_SHOWN).map((step, index) => {
        const Icon = iconOf(step);
        const pause = isPauseStep(step);
        const dashed = background;
        if (pause) background = true;
        return (
          <li key={index} className="flex items-center">
            <span aria-hidden="true" className={`h-0 w-4 border-t-2 ${dashed ? "border-dashed border-[hsl(var(--muted-foreground))]/50" : "border-solid border-(--brand-primary)/50"}`} />
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${pause ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300" : "border-[hsl(var(--border))] bg-[hsl(var(--muted))]"}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </li>
        );
      })}
      {steps.length > MAX_SHOWN && <li className="pl-1.5 text-xs text-[hsl(var(--muted-foreground))]">+{steps.length - MAX_SHOWN}</li>}
    </ol>
  );
}
