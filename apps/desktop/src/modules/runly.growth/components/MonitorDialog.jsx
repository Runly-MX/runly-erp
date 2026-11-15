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
  { value: "keyword", label: "Texto en la pagina" },
  { value: "api", label: "API o login" },
  { value: "heartbeat", label: "Senal de un proceso (cron o worker)" },
  { value: "domain", label: "Vencimiento del dominio" },
  { value: "tcp", label: "Puerto o servicio (TCP)" },
  { value: "dns", label: "Registros DNS" },
];
const INTERVAL_OPTIONS = [
  { value: "60", label: "Cada minuto" },
  { value: "300", label: "Cada 5 minutos" },
  { value: "900", label: "Cada 15 minutos" },
  { value: "3600", label: "Cada hora" },
  { value: "21600", label: "Cada 6 horas" },
  { value: "86400", label: "Cada dia" },
];
const EMPTY = {
  propertyId: "", type: "http", name: "", url: "", host: "", intervalSeconds: "300",
  mustContain: "", mustNotContain: "", method: "GET", headerName: "", headerValue: "",
  assertPath: "", assertEquals: "", graceSeconds: "60",
  port: "", recordType: "A", expected: "",
};

function parseEquals(raw) {
  const text = raw.trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function MonitorDialog({ open, onOpenChange, monitor, properties, onSave, saving }) {
  const [form, setForm] = useState(EMPTY);
  const editing = Boolean(monitor);

  useEffect(() => {
    if (!open) return;
    if (!monitor) return setForm(EMPTY);
    const c = monitor.config ?? {};
    setForm({
      ...EMPTY,
      propertyId: monitor.propertyId,
      type: monitor.type,
      name: monitor.name,
      url: c.url ?? "",
      host: c.host ?? "",
      intervalSeconds: String(monitor.intervalSeconds),
      mustContain: c.mustContain ?? "",
      mustNotContain: c.mustNotContain ?? "",
      method: c.method ?? "GET",
      headerName: c.headers?.[0]?.name ?? "",
      assertPath: c.assert?.path ?? "",
      assertEquals: c.assert && "equals" in c.assert ? JSON.stringify(c.assert.equals) : "",
      graceSeconds: String(c.graceSeconds ?? 60),
      port: c.port ? String(c.port) : "",
      recordType: c.recordType ?? "A",
      expected: c.expected ?? "",
    });
  }, [open, monitor]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const hasHeaderStored = Boolean(monitor?.config?.headers?.length);

  function buildConfig() {
    const url = form.url.trim();
    if (form.type === "ssl" || form.type === "domain") return { host: form.host.trim() };
    if (form.type === "tcp") return { host: form.host.trim(), port: Number(form.port) };
    if (form.type === "dns") return { host: form.host.trim(), recordType: form.recordType, expected: form.expected.trim() || (editing ? null : undefined) };
    if (form.type === "heartbeat") return { graceSeconds: Number(form.graceSeconds) || 60 };
    if (form.type === "keyword") {
      return { url, mustContain: form.mustContain.trim() || undefined, mustNotContain: form.mustNotContain.trim() || undefined };
    }
    if (form.type === "api") {
      const config = { url, method: form.method };
      if (form.headerName.trim()) {
        config.headers = [form.headerValue ? { name: form.headerName.trim(), value: form.headerValue } : { name: form.headerName.trim(), keep: true }];
      }
      if (form.assertPath.trim()) config.assert = { path: form.assertPath.trim(), equals: parseEquals(form.assertEquals) };
      return config;
    }
    return { url };
  }

  const missingTarget =
    form.type === "tcp" ? !form.host.trim() || !Number(form.port)
    : ["ssl", "domain", "dns"].includes(form.type) ? !form.host.trim()
    : form.type === "heartbeat" ? false
    : !form.url.trim() || (form.type === "keyword" && !form.mustContain.trim() && !form.mustNotContain.trim());
  const needsHeaderValue = form.headerName.trim() && !form.headerValue && !hasHeaderStored;

  function handleSubmit(event) {
    event.preventDefault();
    const config = buildConfig();
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
              <SelectField label="Tipo de revision" value={form.type} options={TYPE_OPTIONS} onValueChange={(value) => setForm((f) => ({ ...f, type: value, intervalSeconds: value === "domain" ? "86400" : f.intervalSeconds === "86400" ? "300" : f.intervalSeconds }))} />
            </>
          ) : null}
          <TextField label="Nombre" value={form.name} onChange={(e) => set("name", e.target.value)} required autoFocus />

          {["ssl", "domain", "tcp", "dns"].includes(form.type) ? (
            <TextField label={form.type === "ssl" ? "Dominio del certificado" : form.type === "tcp" ? "Servidor" : "Dominio"} value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="mitienda.mx" required />
          ) : null}
          {form.type === "tcp" ? (
            <TextField label="Puerto" value={form.port} onChange={(e) => set("port", e.target.value.replace(/\D/g, ""))} placeholder="25" required />
          ) : null}
          {form.type === "dns" ? (
            <>
              <SelectField
                label="Tipo de registro"
                value={form.recordType}
                options={["A", "AAAA", "CNAME", "MX", "TXT"].map((v) => ({ value: v, label: v }))}
                onValueChange={(value) => set("recordType", value)}
              />
              <TextField label="Debe contener (opcional)" value={form.expected} onChange={(e) => set("expected", e.target.value)} placeholder="76.76.21.21" />
            </>
          ) : null}
          {["http", "keyword", "api"].includes(form.type) ? (
            <TextField label="URL a revisar" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://mitienda.mx/" required />
          ) : null}
          {form.type === "keyword" ? (
            <>
              <TextField label="Debe contener" value={form.mustContain} onChange={(e) => set("mustContain", e.target.value)} placeholder="Agregar al carrito" />
              <TextField label="No debe contener" value={form.mustNotContain} onChange={(e) => set("mustNotContain", e.target.value)} placeholder="Error de base de datos" />
            </>
          ) : null}
          {form.type === "api" ? (
            <>
              <SelectField
                label="Metodo"
                value={form.method}
                options={[{ value: "GET", label: "GET" }, { value: "HEAD", label: "HEAD" }]}
                onValueChange={(value) => set("method", value)}
              />
              <TextField label="Validar campo de la respuesta JSON (opcional)" value={form.assertPath} onChange={(e) => set("assertPath", e.target.value)} placeholder="data.ok" />
              {form.assertPath.trim() ? (
                <TextField label="Valor esperado (vacio = que exista)" value={form.assertEquals} onChange={(e) => set("assertEquals", e.target.value)} placeholder="true" />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Encabezado (opcional)" value={form.headerName} onChange={(e) => set("headerName", e.target.value)} placeholder="Authorization" />
                <TextField
                  label={hasHeaderStored ? "Valor (vacio = conservar)" : "Valor del encabezado"}
                  type="password"
                  value={form.headerValue}
                  onChange={(e) => set("headerValue", e.target.value)}
                />
              </div>
            </>
          ) : null}
          {form.type === "heartbeat" ? (
            <TextField
              label="Tolerancia extra en segundos"
              value={form.graceSeconds}
              onChange={(e) => set("graceSeconds", e.target.value.replace(/\D/g, ""))}
              placeholder="60"
            />
          ) : null}

          <SelectField
            label={form.type === "heartbeat" ? "Cada cuanto debe llegar la senal" : "Frecuencia"}
            value={form.intervalSeconds}
            options={INTERVAL_OPTIONS}
            onValueChange={(value) => set("intervalSeconds", value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim() || missingTarget || needsHeaderValue || (!editing && !form.propertyId)}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
