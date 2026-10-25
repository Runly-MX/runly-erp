// Quiet hours: every day or chosen weekdays, between two times, email and push wait.
// In-app notices are kept. Spec docs/superpowers/specs/2026-10-26-status-and-dnd-design.md.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, SelectField, Switch } from "@runly/ui";
import { Moon } from "lucide-react";
import { useDnd } from "../../hooks/useStatusDnd";

const HOURS = Array.from({ length: 48 }, (_, i) => { const h = String(Math.floor(i / 2)).padStart(2, "0"); const m = i % 2 ? "30" : "00"; return { value: `${h}:${m}`, label: `${h}:${m}` }; });
const DAYS = [["1", "L", "Lunes"], ["2", "M", "Martes"], ["3", "X", "Miércoles"], ["4", "J", "Jueves"], ["5", "V", "Viernes"], ["6", "S", "Sábado"], ["0", "D", "Domingo"]];
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

export default function QuietHoursCard() {
  const { dnd, save } = useDnd();
  const [quiet, setQuiet] = useState(null);
  useEffect(() => { if (dnd) setQuiet(dnd.quiet); }, [dnd]);
  if (!quiet) return null;
  const update = (patch) => {
    const next = { ...quiet, ...patch, timezone: zone() };
    setQuiet(next);
    save.mutate({ until: dnd?.until ?? null, quiet: next });
  };
  const toggleDay = (day) => update({ days: quiet.days.includes(day) ? quiet.days.filter((d) => d !== day) : [...quiet.days, day] });
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Moon className="h-4 w-4" /> Horario silencioso</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">En este horario no te llegan correos ni avisos push; los avisos dentro de Runly se guardan. Los críticos siempre llegan.</p>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Activar horario silencioso</span>
          <Switch checked={quiet.enabled} onCheckedChange={(enabled) => update({ enabled })} aria-label="Activar horario silencioso" />
        </label>
        {quiet.enabled && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Desde" options={HOURS} value={quiet.from} onValueChange={(from) => update({ from })} />
              <SelectField label="Hasta" options={HOURS} value={quiet.to} onValueChange={(to) => update({ to })} />
            </div>
            <div role="group" aria-label="Días" className="flex gap-1.5">
              {DAYS.map(([value, short, full]) => {
                const on = quiet.days.includes(Number(value));
                return (
                  <button key={value} type="button" aria-pressed={on} title={full} aria-label={full} onClick={() => toggleDay(Number(value))}
                    className={["flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-xs font-medium transition-colors [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11", on ? "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"].join(" ")}>{short}</button>
                );
              })}
            </div>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Horario de tu zona ({zone()}). Una noche cuenta para el día en que empieza.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
