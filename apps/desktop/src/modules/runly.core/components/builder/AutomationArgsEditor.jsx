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
import { PeoplePicker } from "./PeoplePicker";
import { ARG_LABELS, argLabel } from "../../lib/argLabels";
import { pickerOptions } from "../../lib/flowModel";


// What an argument is for, in one line (only where the name is not obvious).
const ARG_HINTS = {
  userIds: "Las personas de la empresa que reciben el aviso.",
  channel: "El nombre exacto del canal de chat (o su id). El mensaje aparece como una integración.",
  attendeeIds: "Las personas invitadas al evento.",
  title: "El título corto que verá la persona.",
  body: "El texto del mensaje.",
  link: "La pantalla que se abre al tocar el aviso.",
  priority: "Qué tan urgente se muestra el aviso.",
  startAt: "Fecha y hora de inicio, por ejemplo 2026-11-03T09:00.",
  endAt: "Fecha y hora de fin.",
  reminderMinutes: "Cuántos minutos antes avisa; puedes poner varios separados por comas.",
  id: "El registro que se va a modificar.",
  contentBase64: "El contenido del archivo ya codificado.",
  dueDate: "Fecha límite, por ejemplo 2026-11-03.",
  to: "Opcional: una dirección fuera de la empresa. Puedes combinarla con los destinatarios.",
  fileId: "Opcional: un archivo de Archivos. Para adjuntar un reporte, elige el dato «Identificador» del paso que lo generó.",
  search: "Opcional: solo incluye los registros que coinciden con este texto.",
};

// Friendly names for the fixed choices of some arguments.
const ENUM_LABELS = {
  source: { contacts: "Contactos", items: "Inventario", vehicles: "Vehículos de la flota" },
  format: { csv: "CSV (texto)", xlsx: "Excel (.xlsx)" },
  priority: { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" },
};
const PEOPLE_ARGS = new Set(["userIds", "attendeeIds"]);

export { argLabel };

// Only the origins that make sense for the kind of value: a person or a list of ids
// cannot come from a sentence, a number cannot be built from text.
export function sourceOptions({ required, triggerType, type = "string", name = "" }) {
  const isText = !(/(\[\]|^uuid)$/.test(type) || ["number", "integer", "boolean"].includes(type));
  const isPeople = PEOPLE_ARGS.has(name) && type.endsWith("[]");
  return [
    ...(required ? [] : [{ value: "none", label: "No usar" }]),
    { value: "value", label: isPeople ? "Elegir personas" : "Valor fijo" },
    ...(isPeople ? [] : [{ value: "field", label: "Un dato disponible" }]),
    ...(isText ? [{ value: "template", label: "Texto con datos" }] : []),
    ...(isPeople || type.endsWith("[]") || !(isText || type === "uuid") ? [] : [{ value: "recordId", label: triggerType === "event" ? "Id del registro del sistema" : "Id del registro" }]),
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
const selectOptions = (fieldOptions) => pickerOptions(fieldOptions).map((option) => ({ ...option, label: option.group && !option.group.startsWith("Del disparador") ? `${option.label} · ${option.group.replace(/^Del /, "")}` : option.label }));

// People of the company to pick recipients from (never typed as ids).
function PeopleValueInput({ label, value, readOnly, onChange }) {
  return <PeoplePicker label={label} value={Array.isArray(value) ? value : []} readOnly={readOnly} onChange={onChange} />;
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
          title={[option.group, option.value].filter(Boolean).join(" · ") || undefined}
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
      : spec.values.map((value) => ({ value, label: ENUM_LABELS[name]?.[value] ?? value }));
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

// What kind of control an argument needs, from its contract type.
function kindOf(name, spec) {
  if (spec.type === "enum" || spec.type === "boolean") return "choice";
  if (PEOPLE_ARGS.has(name) && spec.type.endsWith("[]")) return "people";
  return ["string", "text", "date", "datetime"].includes(spec.type) ? "text" : "typed";
}

// "Usar un dato": the data the block can read, plus the record that started the
// automation (and who saved it) for the arguments that take an id.
function dataChoices({ spec, triggerType, fieldOptions }) {
  const takesId = spec.type === "uuid" || spec.type === "string";
  return [
    ...(takesId ? [{ value: "@recordId", label: triggerType === "event" ? "El registro que activó la automatización" : "Este registro" }] : []),
    ...(takesId && triggerType === "record" ? [{ value: "@actor", label: "La persona que guarda" }] : []),
    ...selectOptions(fieldOptions),
  ];
}
const choiceOf = (source) => (source?.from === "recordId" ? "@recordId" : source?.from === "actor" ? "@actor" : source?.field ?? "");
const sourceOfChoice = (choice) => (choice === "@recordId" ? { from: "recordId" } : choice === "@actor" ? { from: "actor" } : { from: "field", field: choice });

// Where a notification leads: a screen, never a loose value (a name or a bare id
// is not a route). The record of the trigger is offered as its real screen
// (`recordLink`, from the event catalog) and links returned by earlier blocks as-is.
const isRoute = (text) => /^(\/|https?:\/\/)/i.test(text);
function LinkControl({ label, source, recordLink, fieldOptions, readOnly, onSource }) {
  const stepLinks = fieldOptions.filter((option) => /(^|_)link$/.test(option.value));
  const mode = !source ? "none"
    : recordLink && source.from === "template" && source.template === recordLink ? "record"
    : source.from === "field" && stepLinks.some((option) => option.value === source.field) ? `field:${source.field}`
    : source.from === "value" || source.from === "template" ? "custom"
    : "invalid";
  const options = [
    { value: "none", label: "Sin enlace" },
    ...(recordLink ? [{ value: "record", label: "Abrir el registro que activó la automatización" }] : []),
    ...stepLinks.map((option) => ({ value: `field:${option.value}`, label: `Abrir lo que creó ${/^Del paso (\d+)/.exec(option.group ?? "") ? `el paso ${/^Del paso (\d+)/.exec(option.group)[1]}` : "un paso anterior"}` })),
    { value: "custom", label: "Otra pantalla de Runly" },
  ];
  const choose = (next) => {
    if (next === "none") onSource(null);
    else if (next === "record") onSource({ from: "template", template: recordLink });
    else if (next.startsWith("field:")) onSource({ from: "field", field: next.slice(6) });
    else onSource({ from: "value", value: "/app/home" });
  };
  const text = source?.from === "template" ? source.template ?? "" : fromLiteral(source?.value);
  return (
    <div className="min-w-0 space-y-2">
      <SelectField aria-label={label} options={options} value={mode === "invalid" ? "" : mode} disabled={readOnly} placeholder="Elige a dónde lleva" onValueChange={choose} />
      {mode === "invalid" && <p className="text-xs text-amber-700 dark:text-amber-300">Este enlace usa un dato que no es una pantalla. Elige de nuevo a dónde lleva.</p>}
      {mode === "custom" && (
        <>
          <TextField aria-label={`${label}: ruta`} value={text} disabled={readOnly} placeholder="/app/m/runly.inventory/inventory"
            onChange={(e) => onSource(e.target.value.includes("{{") ? { from: "template", template: e.target.value } : { from: "value", value: e.target.value })} />
          {text && !isRoute(text) && <p className="text-xs text-amber-700 dark:text-amber-300">Debe empezar con /app/ (una pantalla de Runly) o con https://.</p>}
        </>
      )}
    </div>
  );
}

// One control per argument, chosen by what it needs (a list of choices, people, text
// that can mix in data, or a typed value). Taking its value from data is a small
// secondary action, never a menu of "origins" the person has to understand first.
function ArgControl({ name, spec, source, triggerType, recordLink, fieldOptions, readOnly, onSource }) {
  const label = argLabel(name);
  if (name === "link") return <LinkControl label={label} source={source} recordLink={recordLink} fieldOptions={fieldOptions} readOnly={readOnly} onSource={onSource} />;
  const kind = kindOf(name, spec);
  const clear = () => onSource(null);
  if (kind === "choice") {
    const options = spec.type === "boolean"
      ? [{ value: "true", label: "Sí" }, { value: "false", label: "No" }]
      : spec.values.map((value) => ({ value, label: ENUM_LABELS[name]?.[value] ?? value }));
    return (
      <SelectField aria-label={label} options={[...(spec.required ? [] : [{ value: "__none", label: "Sin especificar" }]), ...options]} value={source?.value === undefined ? (spec.required ? "" : "__none") : String(source.value)}
        disabled={readOnly} placeholder="Elige una opción"
        onValueChange={(value) => (value === "__none" ? clear() : onSource({ from: "value", value: spec.type === "boolean" ? value === "true" : value }))} />
    );
  }
  if (kind === "people") {
    return <PeopleValueInput label={label} value={source?.value} readOnly={readOnly} onChange={(value) => (value.length ? onSource({ from: "value", value }) : clear())} />;
  }
  const fromData = ["field", "recordId", "actor"].includes(source?.from);
  const choices = dataChoices({ spec, triggerType, fieldOptions });
  if (fromData) {
    return (
      <div className="min-w-0 space-y-1">
        <SelectField aria-label={label} options={choices} value={choiceOf(source)} disabled={readOnly} placeholder="Elige un dato"
          onValueChange={(choice) => onSource(sourceOfChoice(choice))} />
        {!readOnly && <button type="button" onClick={clear} className="cursor-pointer text-xs text-(--brand-primary) hover:underline [@media(pointer:coarse)]:min-h-9">Mejor escribirlo yo</button>}
      </div>
    );
  }
  const canUseData = !readOnly && choices.length > 0 && kind !== "text";
  if (kind === "text") {
    const text = source?.from === "template" ? source.template ?? "" : fromLiteral(source?.value);
    const set = (next) => (next === "" ? clear() : onSource(next.includes("{{") ? { from: "template", template: next } : { from: "value", value: next }));
    return (
      <div className="min-w-0 space-y-2">
        <TextField aria-label={label} value={text} disabled={readOnly} onChange={(e) => set(e.target.value)}
          placeholder={spec.type === "datetime" ? "2026-10-06T10:00:00" : spec.type === "date" ? "AAAA-MM-DD" : "Escribe el texto"} />
        {!readOnly && <DataChips fieldOptions={fieldOptions} onInsert={(key) => set(`${text}{{${key}}}`)} />}
      </div>
    );
  }
  const numeric = spec.type === "number" || spec.type === "integer";
  return (
    <div className="min-w-0 space-y-1">
      <TextField aria-label={label} type={numeric ? "number" : "text"} value={fromLiteral(source?.value)} disabled={readOnly}
        placeholder={spec.type.endsWith("[]") ? "Separa con comas" : spec.type === "uuid" ? "Identificador" : ""}
        onChange={(e) => { const value = toLiteral(spec, e.target.value); if (value === undefined) clear(); else onSource({ from: "value", value }); }} />
      {canUseData && <button type="button" onClick={() => onSource(sourceOfChoice(choices[0].value))} className="cursor-pointer text-xs text-(--brand-primary) hover:underline [@media(pointer:coarse)]:min-h-9">Usar un dato en vez de escribirlo</button>}
    </div>
  );
}

export function AutomationArgsEditor({ contract, args, triggerType, recordLink = null, fieldOptions, readOnly, onChange }) {
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
        return (
          <div key={name} className="space-y-2 rounded-lg border border-[hsl(var(--border))] p-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {argLabel(name)}
                {spec.required ? <Badge variant="outline">Obligatorio</Badge> : <span className="text-xs font-normal text-[hsl(var(--muted-foreground))]">Opcional</span>}
              </p>
              {ARG_HINTS[name] && <p className="text-xs text-[hsl(var(--muted-foreground))]">{ARG_HINTS[name]}</p>}
            </div>
            <ArgControl name={name} spec={spec} source={args[name]} triggerType={triggerType} recordLink={recordLink} fieldOptions={fieldOptions} readOnly={readOnly} onSource={(source) => setSource(name, source)} />
          </div>
        );
      })}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        El registro de origen y la protección contra duplicados se agregan solos.
      </p>
    </div>
  );
}
