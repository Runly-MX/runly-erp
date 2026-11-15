import { useEffect, useState } from "react";
import {
  Button,
  CheckboxField,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  TextField,
} from "@runly/ui";
import { AlertTriangle, Check, CheckCircle2, Copy, Info, Plug, RefreshCw } from "lucide-react";

import { getApiUrl } from "../../../lib/runtimeConfig.js";
import { getSupabaseClient } from "../../../lib/supabase.js";
import { describeVerification } from "../lib/verify-message.js";

// Mirrors injectRunlyConfig's payload shape (dist-serve-service.js) so a
// manually-connected external site gets the same config an ERP-published dist
// site would have auto-injected for it. Without apiUrl the embeddable script
// defaults to same-origin ('/'), which is wrong for any site that isn't served
// by this ERP instance itself.
//
// turnstileSiteKey is baked in the same conditional way injectRunlyConfig
// does it: renderForm() in runly-sdk.js only ever reads it from this static
// config, never from the live public config endpoint, so a property whose
// Turnstile keys were added *after* this snippet was first copied needs the
// snippet re-copied to pick them up.
function buildSnippet({ companySlug, propertyId, turnstileSiteKey, captureErrors = false }) {
  const apiUrl = getApiUrl();
  const supabase = getSupabaseClient();
  const supabaseUrl = supabase.supabaseUrl;
  const supabaseAnonKey = supabase.supabaseKey;
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const sdkUrl = `${apiUrl}/public/site/runly-sdk.js`;

  // One <script> tag with data-* attributes: no inline script, so sites with a strict CSP can allow it by origin alone.
  // analytics-mode is explicit because the SDK only starts analytics on its own when told to; the server still decides the real mode.
  const attrs = {
    "data-company": companySlug,
    "data-site-id": propertyId,
    "data-api-url": apiUrl,
    "data-supabase-url": supabaseUrl,
    "data-supabase-anon-key": supabaseAnonKey,
    "data-storage-key": storageKey,
    "data-analytics-mode": "standard",
    ...(turnstileSiteKey ? { "data-turnstile-site-key": turnstileSiteKey } : {}),
    ...(captureErrors ? { "data-capture-errors": "true" } : {}),
  };
  const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const lines = Object.entries(attrs).map(([name, value]) => `  ${name}="${escape(value)}"`);

  return ["<script", `  src="${escape(sdkUrl)}"`, ...lines, "  async></script>"].join("\n");
}

export function ConnectExternalSiteDialog({
  open,
  onOpenChange,
  companySlug,
  existingProperty = null,
  onCreate,
  onVerify,
  creating,
  verifying,
}) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [property, setProperty] = useState(existingProperty);
  const [copied, setCopied] = useState(false);
  const [captureErrors, setCaptureErrors] = useState(false);
  const [outcome, setOutcome] = useState(null);

  useEffect(() => {
    if (open) setProperty(existingProperty);
  }, [open, existingProperty]);

  function reset() {
    setName("");
    setDomain("");
    setProperty(existingProperty);
    setCopied(false);
    setCaptureErrors(false);
    setOutcome(null);
  }

  async function handleCreate() {
    const created = await onCreate({ name, domain: domain || undefined });
    if (created) setProperty(created);
  }

  async function handleVerify() {
    setOutcome(null);
    try {
      const result = await onVerify(property.id);
      if (result?.verified) setProperty(result.data);
      setOutcome(describeVerification(result));
    } catch (error) {
      setOutcome({ kind: "error", message: error?.message || "No se pudo verificar la conexion. Intenta de nuevo." });
    }
  }

  const snippet = property
    ? buildSnippet({
        companySlug,
        propertyId: property.id,
        turnstileSiteKey: property.turnstileSiteKey,
        captureErrors,
      })
    : "";

  function handleCopy() {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const verified = outcome?.kind === "success";
  const OutcomeIcon = verified ? CheckCircle2 : outcome?.kind === "error" ? AlertTriangle : Info;
  const outcomeTone = verified
    ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
    : outcome?.kind === "error"
      ? "bg-[hsl(var(--destructive))]/10 text-[hsl(var(--destructive))]"
      : "bg-amber-500/10 text-amber-800 dark:text-amber-300";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent size="xl">
        <DialogHeader icon={Plug}>
          <DialogTitle>
            {existingProperty ? "Codigo de instalacion" : "Conectar sitio externo"}
          </DialogTitle>
          <DialogDescription>
            {property
              ? "Instala la etiqueta en tu sitio para ver visitas, formularios y errores reales en Growth."
              : "Registra el sitio que quieres medir. No necesitas acceso a su servidor."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {!property ? (
            <>
              <TextField
                label="Nombre"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Sitio principal"
                autoFocus
              />
              <TextField
                label="Dominio"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="runly.mx"
                hint="El dominio exacto desde el que carga tu sitio. Con dominio, Runly tambien crea los monitores de disponibilidad y certificado SSL."
              />
            </>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">1. Elige que quieres recibir</h3>
                <CheckboxField
                  checked={captureErrors}
                  onChange={(event) => setCaptureErrors(event.target.checked)}
                  label="Avisar de errores reales de los visitantes (opcional)"
                  hint="Si el servidor de tu sitio falla al atender a un visitante, lo veras en Monitores. Solo se guarda la direccion sin datos personales, el estado y la hora. Tambien inicia la analitica del sitio, que respeta su configuracion de consentimiento y No rastrear."
                />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">2. Pega esta etiqueta en el {"<head>"} de tu sitio</h3>
                <div className="relative">
                  <pre className="max-h-64 overflow-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 pr-24 text-xs">
                    {snippet}
                  </pre>
                  <Button type="button" size="sm" variant="outline" className="absolute right-2 top-2" onClick={handleCopy}>
                    {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Es una sola etiqueta, sin codigo en linea. Si tu sitio tiene una politica de seguridad (CSP), permite este servidor en script-src y connect-src.
                </p>
                {!property.turnstileSiteKey && (
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    Este sitio no tiene Turnstile configurado: el formulario funciona sin CAPTCHA. Si mas tarde agregas las claves en "Editar", vuelve a copiar este codigo para que el widget se active.
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">3. Publica, abre tu sitio y verifica</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Despues de publicar el cambio, abre tu sitio en el navegador y pulsa Verificar conexion.
                </p>
                {outcome && (
                  <p role="status" className={`flex items-start gap-2 rounded-lg p-3 text-sm ${outcomeTone}`}>
                    <OutcomeIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>{outcome.message}</span>
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {verified ? "Cerrar" : "Cancelar"}
          </Button>
          {!property ? (
            <Button type="button" onClick={handleCreate} disabled={!name || creating}>
              {creating ? "Creando..." : "Crear sitio"}
            </Button>
          ) : (
            <Button type="button" onClick={handleVerify} disabled={verifying}>
              <RefreshCw className={`mr-2 h-4 w-4 ${verifying ? "animate-spin" : ""}`} aria-hidden />
              {verifying ? "Verificando..." : verified ? "Verificar de nuevo" : "Verificar conexion"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
