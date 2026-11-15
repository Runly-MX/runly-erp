import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectField,
  TextField,
} from "@runly/ui";

const TYPE_OPTIONS = [
  { value: "http", label: "Disponibilidad (HTTP)" },
  { value: "ssl", label: "Certificado SSL" },
];
const INTERVAL_OPTIONS = [
  { value: "60", label: "Cada minuto" },
  { value: "300", label: "Cada 5 minutos" },
  { value: "900", label: "Cada 15 minutos" },
  { value: "3600", label: "Cada hora" },
];
const EMPTY = { propertyId: "", type: "http", name: "", url: "", host: "", intervalSeconds: "300" };

export function MonitorDialog({ open, onOpenChange, monitor, properties, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);
  const editing = Boolean(monitor);

  useEffect(() => {
    if (!open) return;
    setForm(
      monitor
        ? {
            propertyId: monitor.propertyId,
            type: monitor.type,
            name: monitor.name,
            url: monitor.config?.url ?? "",
            host: monitor.config?.host ?? "",
            intervalSeconds: String(monitor.intervalSeconds),
          }
        : EMPTY,
    );
  }, [open, monitor]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const target = form.type === "http" ? form.url.trim() : form.host.trim();

  function handleSubmit(event) {
    event.preventDefault();
    const config = form.type === "http" ? { url: form.url.trim() } : { host: form.host.trim() };
    const intervalSeconds = Number(form.intervalSeconds);
    onSave(
      editing
        ? { name: form.name.trim(), config, intervalSeconds }
        : { propertyId: form.propertyId, type: form.type, name: form.name.trim(), config, intervalSeconds },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar monitor" : "Nuevo monitor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!editing ? (
            <>
              <SelectField
                label="Sitio"
                value={form.propertyId}
                placeholder="Seleccionar"
                options={properties.map((p) => ({ value: p.id, label: p.name }))}
                onValueChange={(value) => set("propertyId", value)}
              />
              <SelectField label="Tipo de revision" value={form.type} options={TYPE_OPTIONS} onValueChange={(value) => set("type", value)} />
            </>
          ) : null}
          <TextField label="Nombre" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus />
          {form.type === "http" ? (
            <TextField label="URL a revisar" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://mitienda.mx/" required />
          ) : (
            <TextField label="Dominio del certificado" value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="mitienda.mx" required />
          )}
          <SelectField label="Frecuencia" value={form.intervalSeconds} options={INTERVAL_OPTIONS} onValueChange={(value) => set("intervalSeconds", value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim() || !target || (!editing && !form.propertyId)}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
