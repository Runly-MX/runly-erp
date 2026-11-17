import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  PasswordField,
  SelectField,
  TextField,
} from "@runly/ui";

const ANALYTICS_MODES = [
  { value: "standard", label: "Estandar: mide todas las visitas" },
  { value: "consent_required", label: "Con consentimiento: solo mide si el visitante acepta" },
  { value: "off", label: "Apagada: no mide visitas" },
];

const EMPTY = { name: "", domain: "", analyticsMode: "standard", turnstileSiteKey: "", turnstileSecretKey: "" };

export function EditPropertyDialog({ open, onOpenChange, property, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);
  const [secretChanged, setSecretChanged] = useState(false);

  useEffect(() => {
    if (!property) return;
    setForm({
      name: property.name ?? "",
      domain: property.domain ?? "",
      analyticsMode: property.analyticsMode ?? "standard",
      turnstileSiteKey: property.turnstileSiteKey ?? "",
      turnstileSecretKey: "",
    });
    setSecretChanged(false);
  }, [property]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const turnstileSecretSet = property?.turnstileSecretKeySet ?? false;

  function handleSubmit(event) {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      domain: form.domain.trim() || null,
      ...(property?.kind === "external_sdk" ? { analyticsMode: form.analyticsMode } : {}),
      turnstileSiteKey: form.turnstileSiteKey.trim() || null,
    };
    if (secretChanged) {
      payload.turnstileSecretKey = form.turnstileSecretKey.trim() || null;
    }
    onSave(payload);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar sitio conectado</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <TextField
            label="Nombre"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            required
            autoFocus
          />
          <TextField
            label="Dominio"
            value={form.domain}
            onChange={(e) => set("domain", e.target.value)}
            placeholder="runly.mx"
          />
          {property?.kind === "external_sdk" ? (
            <div className="space-y-1">
              <SelectField
                label="Modo de analitica"
                value={form.analyticsMode}
                options={ANALYTICS_MODES}
                onValueChange={(value) => set("analyticsMode", value)}
              />
              <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                Runly siempre respeta Do Not Track. El cambio aplica de inmediato, sin volver a copiar el codigo.
              </p>
            </div>
          ) : null}
          <div className="rounded-lg border border-[hsl(var(--border))] p-3 space-y-3">
            <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wide">
              Proteccion de formularios (Cloudflare Turnstile)
            </p>
            <TextField
              label="Turnstile Site Key"
              value={form.turnstileSiteKey}
              onChange={(e) => set("turnstileSiteKey", e.target.value)}
              placeholder="Clave publica"
            />
            <PasswordField
              label={
                turnstileSecretSet && !secretChanged
                  ? "Turnstile Secret Key (dejar en blanco para mantener)"
                  : "Turnstile Secret Key"
              }
              value={form.turnstileSecretKey}
              onChange={(e) => {
                set("turnstileSecretKey", e.target.value);
                setSecretChanged(true);
              }}
              placeholder={turnstileSecretSet ? "••••••••" : "Clave secreta"}
            />
            <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
              Deja ambos campos vacios para no usar CAPTCHA — el honeypot anti-spam
              sigue activo por defecto en cada formulario.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
