// "Probar entrega": sends a real test through email, the browser or the phone and says,
// in plain words, whether it arrived or why not. Administrators also see how deliveries
// have gone in the last days. Spec docs/superpowers/specs/2026-10-26-slack-parity-design.md, section 4.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@runly/ui";
import { CheckCircle2, Mail, MonitorSmartphone, Send, Smartphone, TriangleAlert } from "lucide-react";
import { runly } from "../../lib/runly";

const CHANNELS = [
  { key: "email", label: "Correo", Icon: Mail },
  { key: "web_push", label: "Navegador", Icon: MonitorSmartphone },
  { key: "fcm", label: "Teléfono", Icon: Smartphone },
];

function Result({ result }) {
  if (!result) return null;
  const Icon = result.ok ? CheckCircle2 : TriangleAlert;
  return (
    <p role="status" className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${result.ok ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300"}`}>
      <Icon size={16} aria-hidden className="mt-0.5 shrink-0" />
      <span>{result.detail}{result.via ? ` (${result.via})` : ""}</span>
    </p>
  );
}

function HealthPanel({ health }) {
  const configured = [["Correo", health.configured.email], ["Navegador", health.configured.webPush], ["Teléfono", health.configured.phone]];
  return (
    <div className="space-y-3 border-t border-[hsl(var(--border))] pt-4">
      <h3 className="text-sm font-medium">Estado de los avisos de la empresa (últimos {health.days} días)</h3>
      <ul className="flex flex-wrap gap-2 text-xs">
        {configured.map(([label, ok]) => (
          <li key={label} className={`rounded-md px-2 py-1 ${ok ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"}`}>{label}: {ok ? "configurado" : "sin configurar"}</li>
        ))}
      </ul>
      {health.channels.length === 0 ? <p className="text-sm text-[hsl(var(--muted-foreground))]">Aún no hay envíos por correo o push en este periodo.</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-[hsl(var(--muted-foreground))]"><th className="pb-1 font-medium">Canal</th><th className="pb-1 text-right font-medium">Enviados</th><th className="pb-1 text-right font-medium">Fallidos</th><th className="pb-1 text-right font-medium">En cola</th></tr></thead>
          <tbody>
            {health.channels.map((row) => (
              <tr key={row.channel} className="border-t border-[hsl(var(--border))] tabular-nums">
                <td className="py-1.5">{row.label}</td><td className="py-1.5 text-right">{row.sent}</td>
                <td className={`py-1.5 text-right ${row.failed ? "text-red-600 dark:text-red-400" : ""}`}>{row.failed}</td><td className="py-1.5 text-right">{row.queued}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {health.failures.length > 0 && (
        <ul className="space-y-2">
          {health.failures.slice(0, 8).map((failure, index) => (
            <li key={index} className="rounded-md border border-[hsl(var(--border))] p-2 text-sm">
              <p className="font-medium">{failure.label}{failure.title ? ` · ${failure.title}` : ""}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{failure.explanation}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DeliveryCheckCard({ token }) {
  const [busy, setBusy] = useState(null);
  const [results, setResults] = useState({});
  // Only administrators get an answer; everyone else gets 403 and the panel stays hidden.
  const { data: health } = useQuery({
    queryKey: ["notifications", "delivery-health"],
    queryFn: () => runly.notifications.deliveryHealth(token).then((res) => res?.data ?? null),
    enabled: Boolean(token),
    retry: false,
    staleTime: 60_000,
  });

  async function probe(channel) {
    setBusy(channel);
    try {
      const res = await runly.notifications.testDelivery(token, channel);
      setResults((previous) => ({ ...previous, [channel]: res?.data ?? { ok: false, detail: "No se obtuvo respuesta." } }));
    } catch (error) {
      setResults((previous) => ({ ...previous, [channel]: { ok: false, detail: error?.message ?? "No se pudo hacer la prueba." } }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Probar entrega de avisos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Envía un aviso de prueba por cada canal para confirmar que te llega. Si falla, te decimos por qué.</p>
        <div className="space-y-2">
          {CHANNELS.map(({ key, label, Icon }) => (
            <div key={key} className="space-y-2">
              <div className="flex items-center gap-3">
                <Icon size={16} aria-hidden className="shrink-0" />
                <span className="min-w-0 flex-1 text-sm">{label}</span>
                <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => probe(key)}>{busy === key ? "Enviando..." : "Probar"}</Button>
              </div>
              <Result result={results[key]} />
            </div>
          ))}
        </div>
        {health && <HealthPanel health={health} />}
      </CardContent>
    </Card>
  );
}
