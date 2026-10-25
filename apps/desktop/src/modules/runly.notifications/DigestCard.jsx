// Summary email: once a day or once a week, what the person has not seen and was not
// emailed already, plus their pending tasks. Spec
// docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 3.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, SelectField } from "@runly/ui";
import { MailOpen } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../lib/runly";

const MODES = [
  { value: "off", label: "No enviar resumen" },
  { value: "daily", label: "Cada día" },
  { value: "weekly", label: "Cada semana" },
];
const HOURS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, "0")}:00` }));
const WEEKDAYS = [
  { value: "1", label: "Lunes" }, { value: "2", label: "Martes" }, { value: "3", label: "Miércoles" }, { value: "4", label: "Jueves" },
  { value: "5", label: "Viernes" }, { value: "6", label: "Sábado" }, { value: "0", label: "Domingo" },
];
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

export default function DigestCard({ token }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications", "digest"],
    queryFn: () => runly.notifications.getDigest(token).then((res) => res?.data ?? null),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
  const [draft, setDraft] = useState(null);
  useEffect(() => { if (data) setDraft(data); }, [data]);
  if (!draft) return null;

  async function save(patch) {
    const next = { ...draft, ...patch, timezone: browserZone() };
    setDraft(next);
    try {
      const res = await runly.notifications.setDigest(token, next);
      queryClient.setQueryData(["notifications", "digest"], res?.data ?? next);
      toast.success("Preferencia guardada");
    } catch (error) {
      toast.error("No se pudo guardar", { description: error?.message });
      setDraft(data);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MailOpen className="h-4 w-4" /> Resumen por correo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Un solo correo con lo que no has visto y no te llegó por correo al momento, más tus tareas pendientes. Si no hay nada nuevo, no se envía.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField label="Frecuencia" options={MODES} value={draft.mode} onValueChange={(mode) => save({ mode })} />
          {draft.mode === "weekly" && <SelectField label="Día" options={WEEKDAYS} value={String(draft.weekday)} onValueChange={(value) => save({ weekday: Number(value) })} />}
          {draft.mode !== "off" && <SelectField label="Hora" options={HOURS} value={String(draft.hour)} onValueChange={(value) => save({ hour: Number(value) })} />}
        </div>
        {draft.mode !== "off" && <p className="text-xs text-[hsl(var(--muted-foreground))]">Se envía a la hora de tu zona horaria ({browserZone()}).</p>}
      </CardContent>
    </Card>
  );
}
