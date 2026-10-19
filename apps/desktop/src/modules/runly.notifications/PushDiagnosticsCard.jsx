import { useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from "@runly/ui";
import { ClipboardCopy, Stethoscope } from "lucide-react";
import { toast } from "sonner";
import { runly } from "../../lib/runly";
import { collectClientPushState, formatPushReport } from "../../lib/pushDiagnostics";

// Builds a plain-text report (device state + what the server knows) so a
// support person can read it from a paste, without running any command.
export default function PushDiagnosticsCard({ token }) {
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);

  async function generate() {
    if (!token) return;
    setBusy(true);
    try {
      const [client, server] = await Promise.all([
        collectClientPushState(),
        runly.notifications.pushDiagnostics(token).then((res) => res?.data ?? null).catch(() => null),
      ]);
      setReport(formatPushReport({ client, server }));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Informe copiado.");
    } catch {
      toast.error("No se pudo copiar. Selecciona el texto y cópialo manualmente.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4" />
          Diagnóstico de notificaciones push
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Si no te llegan avisos o llamadas en este dispositivo, genera el informe y compártelo con soporte.
          No incluye contraseñas ni tokens completos.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={generate} disabled={busy}>
            {busy ? "Generando..." : report ? "Volver a generar" : "Generar informe"}
          </Button>
          {report && (
            <Button onClick={copy}>
              <ClipboardCopy className="h-4 w-4" />
              Copiar informe
            </Button>
          )}
        </div>
        {report && (
          <Textarea
            readOnly
            value={report}
            rows={16}
            onFocus={(e) => e.target.select()}
            className="font-mono text-xs"
            aria-label="Informe de diagnóstico"
          />
        )}
      </CardContent>
    </Card>
  );
}
