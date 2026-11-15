import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from "@runly/ui";
import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { getConfiguredApiUrl } from "../../../lib/runtimeConfig.js";

function pingUrl(token) {
  const base = getConfiguredApiUrl() || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/+$/, "")}/public/monitor/ping/${token}`;
}

function buildPrompt(url, name) {
  return [
    `Necesito que mi proyecto avise a un monitor externo cada vez que el proceso "${name}" termine bien.`,
    "Agrega una llamada HTTP GET con timeout de 10 segundos a esta URL al final de cada ejecucion exitosa:",
    url,
    "Si el proceso falla, no debe llamarla. No guardes la URL en el codigo: leela de una variable de entorno llamada RUNLY_PING_URL.",
    "Tambien agrega una ruta GET /health que responda 200 con { \"ok\": true } solo si la base de datos responde.",
  ].join("\n");
}

function CopyBlock({ label, text }) {
  const copy = () =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Copiado"))
      .catch(() => toast.error("Selecciona el texto y copialo manualmente"));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          Copiar
        </Button>
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 text-xs">{text}</pre>
    </div>
  );
}

export function MonitorConnectionDialog({ open, onOpenChange, monitor, pingToken, onRegenerate, regenerating }) {
  const url = pingToken ? pingUrl(pingToken) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conexion de {monitor?.name ?? "monitor"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto py-2">
          {url ? (
            <>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Haz que tu proceso llame a esta direccion cuando termine bien. Si deja de llegar la senal, te avisaremos. Guarda la direccion ahora: por seguridad no se vuelve a mostrar.
              </p>
              <CopyBlock label="Direccion de la senal" text={url} />
              <CopyBlock label="Desde la terminal o un cron (cada 5 minutos)" text={`*/5 * * * * curl -fsS -m 10 "${url}" > /dev/null`} />
              <CopyBlock label="Desde Node.js" text={`await fetch(process.env.RUNLY_PING_URL, { signal: AbortSignal.timeout(10000) })`} />
              <CopyBlock label="Prompt para tu asistente de IA" text={buildPrompt(url, monitor?.name ?? "mi proceso")} />
            </>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              La direccion de la senal solo se muestra al crearla. Si la perdiste, genera una nueva; la anterior dejara de funcionar.
            </p>
          )}
          {onRegenerate ? (
            <Button type="button" variant="outline" disabled={regenerating} onClick={onRegenerate}>
              <KeyRound className="mr-1.5 h-4 w-4" />
              {regenerating ? "Generando..." : "Generar nueva direccion"}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
