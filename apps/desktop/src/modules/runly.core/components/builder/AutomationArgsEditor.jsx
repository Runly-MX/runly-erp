// Module Builder — argument mapping of one automation block (spec
// docs/superpowers/specs/2026-10-04-builder-automations-design.md §4.1): for
// each argument the service contract declares, where its value comes from.
//
// Every argument is a small card: its name and what it is for, then where the
// value comes from (a fixed value, a data field, a text that mixes data...) next
// to the value itself. Side by side when the panel is wide, stacked when narrow
// (container query), so the inputs never collapse. Data available to the block
// is offered as chips under text values.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, SelectField, TextField } from "@runly/ui";
import { X } from "lucide-react";
import { AUTOMATIC_ARGS } from "@runly/module-compiler/browser";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";

const ARG_LABELS = {
  title: "Título", description: "Descripción", startAt: "Inicio", endAt: "Fin", allDay: "Todo el día", location: "Lugar",
  calendarId: "Calendario (id)", attendeeIds: "Invitados", reminderMinutes: "Recordatorios (minutos antes)",
  userIds: "Destinatarios", body: "Mensaje", link: "Enlace", priority: "Prioridad", name: "Nombre", type: "Tipo",
  email: "Correo", phone: "Teléfono", id: "Registro a cambiar (id)", status: "Estado", notes: "Notas", locationId: "Ubicación (id)",
  projectId: "Proyecto (id)", assigneeId: "Responsable (id)", dueDate: "Fecha límite", statusId: "Estado (id)",
  mimeType: "Tipo de archivo", contentBase64: "Contenido (base64)", shareWithCompany: "Compartir con la empresa",
  plate: "Matrícula", vehicleId: "Vehículo (id)", driver: "Chofer", color: "Color", brand: "Marca", model: "Modelo", year: "Año",
  insurer: "Aseguradora", policyNumber: "Número de póliza", coverageType: "Cobertura", startDate: "Inicio de vigencia",
  expiryDate: "Vencimiento", premium: "Prima", currency: "Moneda", policyId: "Póliza (id)",
  accountId: "Cuenta (id)", accountName: "Cuenta (nombre)", fecha: "Fecha", nombre: "Nombre", referencia: "Referencia",
  concepto: "Concepto", numero: "Número", deposito: "Depósito", retiro: "Retiro", categoryId: "Categoría (id)", transactionId: "Movimiento (id)",
  wallet: "Cartera (nombre o id)", direction: "Tipo de movimiento", amount: "Monto", occurredOn: "Fecha", category: "Categoría",
  merchant: "Comercio", note: "Nota", movementId: "Movimiento (id)",
};

// What an argument is for, in one line (only where the name is not obvious).
const ARG_HINTS = {
  userIds: "Las personas de la empresa que reciben el aviso.",
  attendeeIds: "Las personas invitadas al evento.",
  title: "El título corto que verá la persona.",
  body: "El texto del mensaje.",
  link: "Ruta dentro de Runly a la que lleva, por ejemplo /app/home.",
  priority: "Qué tan urgente se muestra el aviso.",
  startAt: "Fecha y hora de inicio, por ejemplo 2026-11-03T09:00.",
  endAt: "Fecha y hora de fin.",
  reminderMinutes: "Cuántos minutos antes avisa; puedes poner varios separados por comas.",
  id: "El registro que se va a modificar.",
  contentBase64: "El contenido del archivo ya codificado.",
  dueDate: "Fecha límite, por ejemplo 2026-11-03.",
};
const PEOPLE_ARGS = new Set(["userIds", "attendeeIds"]);

export const argLabel = (name) => ARG_LABELS[name] ?? name;

export function sourceOptions({ required, triggerType }) {
  return [
    ...(required ? [] : [{ value: "none", label: "No usar" }]),
    { value: "value", label: "Valor fijo" },
    { value: "field", label: "Un dato disponible" },
    { value: "template", label: "Texto con datos" },
    { value: "recordId", label: triggerType === "event" ? "Id del registro del sistema" : "Id del registro" },
    ...(triggerType === "record" ? [{ value: "actor", label: "Usuario que guarda" }] : []),
  ];
}

// Literal values are edited as text and converted to the contract type.
function toLiteral(spec, text) {
  if (text === "") return undefined;
  if (spec.type === "number" || spec.type === "integer") return Number(text);
  if (spec.type.endsWith("[]")) {
    const items = text.split(",").map((item) => item.trim()).filter(Boolean);
    return spec.type === "integer[]" ? items.map(Number) : items;
  }
  return text;
}
const fromLiteral = (value) => (Array.isArray(value) ? value.join(", ") : value === undefined || value === null ? "" : String(value));

// Options of a select: data from earlier blocks say where they come from.
const selectOptions = (fieldOptions) => fieldOptions.map((option) => ({ value: option.value, label: option.group && !option.group.startsWith("Del disparador") ? `${option.label} · ${option.group.replace(/^Del /, "")}` : option.label }));

// People of the company to pick recipients from (never typed as ids).
function PeopleValueInput({ label, value, readOnly, onChange }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const people = useQuery({
    queryKey: ["builder-people"],
    queryFn: async () => (await runly.modules.builderPeople(token))?.data ?? [],
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
  const chosen = Array.isArray(value) ? value : [];
  const list = people.data ?? [];
  const nameOf = (id) => list.find((person) => person.id === id)?.name ?? "Persona";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {chosen.length === 0 && <span className="text-xs text-[hsl(var(--muted-foreground))]">Aún no eliges a nadie.</span>}
        {chosen.map((id) => (
          <Badge key={id} variant="secondary" className="gap-1 py-1">
            {nameOf(id)}
            {!readOnly && (
              <button type="button" aria-label={`Quitar a ${nameOf(id)}`} className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm hover:bg-[hsl(var(--card))] [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-8" onClick={() => onChange(chosen.filter((item) => item !== id))}>
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {!readOnly && (
        <SelectField aria-label={label} options={list.filter((person) => !chosen.includes(person.id)).map((person) => ({ value: person.id, label: person.name }))}
          value="" placeholder="Agregar persona..." onValueChange={(id) => id && onChange([...chosen, id])} />
      )}
    </div>
  );
}

// Data of the trigger and of earlier blocks, one tap to put it in a text.
function DataChips({ fieldOptions, onInsert }) {
  const [all, setAll] = useState(false);
  if (!fieldOptions.length) return null;
  const shown = all ? fieldOptions : fieldOptions.slice(0, 8);
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Datos que puedes insertar">
      <span className="text-xs text-[hsl(var(--muted-foreground))]">Insertar:</span>
      {shown.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.group ?? undefined}
          onClick={() => onInsert(option.value)}
          className="cursor-pointer rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 px-2 py-0.5 text-xs hover:bg-(--brand-primary)/15 [@media(pointer:coarse)]:min-h-9 [@media(pointer:coarse)]:px-2.5"
        >
          {/^Del paso (\d+)/.exec(option.group ?? "") ? `Paso ${/^Del paso (\d+)/.exec(option.group)[1]} · ${option.label}` : option.label}
        </button>
      ))}
      {fieldOptions.length > 8 && (
        <button type="button" onClick={() => setAll((value) => !value)} className="cursor-pointer rounded-md px-2 py-0.5 text-xs text-(--brand-primary) hover:underline [@media(pointer:coarse)]:min-h-9">
          {all ? "Ver menos" : `Ver ${fieldOptions.length - 8} más`}
        </button>
      )}
    </div>
  );
}

export function ValueInput({ name, spec, source, fieldOptions, readOnly, onSource }) {
  const label = `Valor de ${argLabel(name).toLowerCase()}`;
  if (source.from === "field") {
    return <SelectField aria-label={label} options={selectOptions(fieldOptions)} value={source.field ?? ""} disabled={readOnly} placeholder="Elige un dato"
      onValueChange={(field) => onSource({ from: "field", field })} />;
  }
  if (source.from === "template") {
    return (
      <div className="min-w-0 space-y-2">
        <TextField aria-label={label} value={source.template ?? ""} disabled={readOnly} placeholder="Ej. Visita {{folio}} de {{cliente}}"
          onChange={(e) => onSource({ from: "template", template: e.target.value })} />
        {!readOnly && <DataChips fieldOptions={fieldOptions} onInsert={(key) => onSource({ from: "template", template: `${source.template ?? ""}{{${key}}}` })} />}
      </div>
    );
  }
  if (source.from !== "value") return <p className="py-2 text-xs text-[hsl(var(--muted-foreground))]">Se llena automáticamente.</p>;
  if (PEOPLE_ARGS.has(name) && spec.type.endsWith("[]")) {
    return <PeopleValueInput label={label} value={source.value} readOnly={readOnly} onChange={(value) => onSource({ from: "value", value })} />;
  }
  if (spec.type === "enum" || spec.type === "boolean") {
    const options = spec.type === "boolean"
      ? [{ value: "true", label: "Sí" }, { value: "false", label: "No" }]
      : spec.values.map((value) => ({ value, label: value }));
    return <SelectField aria-label={label} options={options} value={source.value === undefined ? "" : String(source.value)} disabled={readOnly}
      onValueChange={(value) => onSource({ from: "value", value: spec.type === "boolean" ? value === "true" : value })} />;
  }
  const numeric = spec.type === "number" || spec.type === "integer";
  return (
    <TextField aria-label={label} type={numeric ? "number" : "text"} value={fromLiteral(source.value)} disabled={readOnly}
      placeholder={spec.type.endsWith("[]") ? "Separa con comas" : spec.type === "datetime" ? "2026-10-06T10:00:00" : spec.type === "date" ? "AAAA-MM-DD" : ""}
      onChange={(e) => onSource({ from: "value", value: toLiteral(spec, e.target.value) })} />
  );
}

export function AutomationArgsEditor({ contract, args, triggerType, fieldOptions, readOnly, onChange }) {
  if (!contract) return null;
  const names = Object.keys(contract.args).filter((name) => !AUTOMATIC_ARGS.includes(name));
  const setSource = (name, source) => {
    const next = { ...args };
    if (!source) delete next[name]; else next[name] = source;
    onChange(next);
  };
  if (!names.length) return <p className="text-xs text-[hsl(var(--muted-foreground))]">Esta acción no necesita datos.</p>;
  return (
    <div className="@container space-y-3">
      {names.map((name) => {
        const spec = contract.args[name];
        const source = args[name];
        return (
          <div key={name} className="space-y-2.5 rounded-lg border border-[hsl(var(--border))] p-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {argLabel(name)}
                {spec.required ? <Badge variant="outline">Obligatorio</Badge> : <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">Opcional</span>}
              </p>
              {ARG_HINTS[name] && <p className="text-xs text-[hsl(var(--muted-foreground))]">{ARG_HINTS[name]}</p>}
            </div>
            <div className="grid gap-2 @md:grid-cols-[11rem_minmax(0,1fr)]">
              <SelectField aria-label={`Origen de ${argLabel(name).toLowerCase()}`} options={sourceOptions({ required: spec.required, triggerType })}
                value={source?.from ?? (spec.required ? "" : "none")} disabled={readOnly} placeholder="¿De dónde sale?"
                onValueChange={(from) => setSource(name, from === "none" ? null : { from })} />
              {source ? (
                <ValueInput name={name} spec={spec} source={source} fieldOptions={fieldOptions} readOnly={readOnly} onSource={(next) => setSource(name, next)} />
              ) : <span className="hidden @md:block" />}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        El registro de origen y la protección contra duplicados se agregan solos.
      </p>
    </div>
  );
}
