import { useEffect, useState } from "react";
import {
  Button,
  CheckboxField,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  TextField,
} from "@runly/ui";

const TYPE_LABEL = { http: "Disponibilidad", ssl: "Certificado SSL", api: "API", keyword: "Texto", heartbeat: "Senal" };

// Paste a URL, let Runly detect the platform and propose checks, then create the chosen ones.
export function MonitorDetectDialog({ open, onOpenChange, properties, onDetect, onCreate }) {
  const [propertyId, setPropertyId] = useState("");
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState({});
  const [heartbeat, setHeartbeat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPropertyId("");
    setUrl("");
    setResult(null);
    setSelected({});
    setHeartbeat(false);
    setError("");
  }, [open]);

  function pickProperty(id) {
    setPropertyId(id);
    const domain = properties.find((p) => p.id === id)?.domain;
    if (domain && !url) setUrl(domain);
  }

  async function detect() {
    setBusy(true);
    setError("");
    try {
      const { data } = await onDetect(url.trim());
      if (!data.ok) {
        setResult(null);
        setError(data.error || "No pudimos revisar ese sitio.");
        return;
      }
      setResult(data);
      setSelected(Object.fromEntries(data.suggestions.map((_, i) => [i, true])));
    } catch (err) {
      setError(err?.message || "No pudimos revisar ese sitio.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const chosen = result.suggestions.filter((_, i) => selected[i]);
      await onCreate(propertyId, chosen, heartbeat);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || "No se pudieron crear los monitores.");
    } finally {
      setBusy(false);
    }
  }

  const count = result ? Object.values(selected).filter(Boolean).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Detectar y crear monitores</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] space-y-4 overflow-y-auto py-2">
          <SelectField
            label="Sitio"
            value={propertyId}
            placeholder="Seleccionar"
            options={properties.map((p) => ({ value: p.id, label: p.name }))}
            onValueChange={pickProperty}
          />
          <TextField label="Direccion del sitio" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="mitienda.mx" />
          <Button type="button" variant="outline" disabled={busy || !url.trim() || !propertyId} onClick={detect}>
            {busy && !result ? "Revisando el sitio..." : "Detectar"}
          </Button>
          {error ? <p className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}

          {result ? (
            <div className="space-y-3">
              <p className="text-sm">
                Tipo de sitio detectado: <strong>{result.platformLabel}</strong>. Elige que quieres vigilar:
              </p>
              {result.suggestions.map((suggestion, index) => (
                <CheckboxField
                  key={`${suggestion.type}-${suggestion.config.url ?? suggestion.config.host}`}
                  checked={Boolean(selected[index])}
                  onChange={(e) => setSelected((s) => ({ ...s, [index]: e.target.checked }))}
                  label={`${TYPE_LABEL[suggestion.type] ?? suggestion.type}: ${suggestion.name}`}
                  hint={suggestion.reason}
                />
              ))}
              <CheckboxField
                checked={heartbeat}
                onChange={(e) => setHeartbeat(e.target.checked)}
                label="Tambien vigilar un proceso interno (cron o worker)"
                hint="Crea una senal que tu proceso debe enviar; te damos el codigo para conectarla."
              />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={busy || !result || (!count && !heartbeat)} onClick={create}>
            {busy && result ? "Creando..." : `Crear ${count + (heartbeat ? 1 : 0)} monitores`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
