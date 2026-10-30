import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  TextField,
  NumberField,
  DateField,
  SelectField,
  CheckboxField,
  ComboboxField,
  CreatableComboboxField,
} from "../components/FormFields.jsx";
import { MarkdownField } from "../components/MarkdownField.jsx";
import { buildApiHeaders } from "../lib/apiHeaders.js";
import { CustomFieldCreator } from "./CustomFieldCreator.jsx";
import { REMOVED_SUFFIX, extraDefinitionsFrom } from "./custom-fields-values.js";

export { buildCustomFieldsPayload, seedCustomFieldValues } from "./custom-fields-values.js";

function joinUrl(baseUrl, apiPath) {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  const path = String(apiPath ?? "").trim();
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

// Short text / number fields behave like a search: they suggest the values other
// records already hold for the field and let the user type a new one.
function SuggestingField({ definition, value, onChange, suggestions }) {
  const { label, required, fieldType } = definition;
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const current = value == null ? "" : String(value);

  function load(term) {
    setLoading(true);
    suggestions(definition.id, term)
      .then((values) => setOptions(values))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }
  function handleSearch(term) {
    setQuery(term);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(term), 250);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  const list = options.map((v) => ({ value: v, label: v }));
  if (current && !list.some((o) => o.value === current)) list.unshift({ value: current, label: current });

  return (
    <CreatableComboboxField
      label={label}
      required={Boolean(required)}
      options={list}
      value={current}
      loading={loading}
      clearable
      placeholder={fieldType === "number" ? "Número..." : "Buscar o escribir..."}
      searchPlaceholder="Buscar o escribir un valor nuevo..."
      filter={false}
      onOpenChange={(open) => { if (open) load(query); }}
      onSearchChange={handleSearch}
      onValueChange={(v) => onChange(v ?? "")}
      onCreate={(text) => onChange(fieldType === "number" ? String(text).replace(",", ".") : text)}
      createLabel={undefined}
    />
  );
}

function DynamicFieldControl({ definition, value, onChange, suggestions }) {
  const { label, fieldType, options = [], required } = definition;
  const commonProps = { label, required: Boolean(required) };
  const suggest = suggestions && (fieldType === "text" || fieldType === "number" || !fieldType);

  if (suggest) return <SuggestingField definition={definition} value={value} onChange={onChange} suggestions={suggestions} />;

  switch (fieldType) {
    case "number":
      return (
        <NumberField {...commonProps} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
    case "date":
      // DateField emits a synthetic { target: { name, value } } event (not the
      // raw value directly) so its onChange can be wired straight into RHF's
      // Controller.onChange in other screens — extract .target.value here.
      return (
        <DateField {...commonProps} value={value ?? ""} onChange={(e) => onChange(e?.target?.value ?? "")} />
      );
    case "textarea":
      return (
        <MarkdownField {...commonProps} value={value ?? ""} onChange={(e) => onChange(e?.target?.value ?? "")} />
      );
    case "select": {
      const selectOptions = options.map((opt) =>
        typeof opt === "string" ? { label: opt, value: opt } : opt,
      );
      return (
        <SelectField {...commonProps} options={selectOptions} value={value ?? ""} onValueChange={onChange} />
      );
    }
    case "boolean":
      return (
        <CheckboxField
          {...commonProps}
          checked={value === true || value === "true"}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "url":
      return (
        <TextField {...commonProps} type="url" placeholder="https://" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
    case "email":
      return (
        <TextField {...commonProps} type="email" placeholder="correo@ejemplo.com" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
    case "text":
    default:
      return (
        <TextField {...commonProps} type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      );
  }
}

async function fetchDefinitions({ apiBaseUrl, apiPath, categoryId, headers }) {
  const url = new URL(joinUrl(apiBaseUrl, apiPath));
  if (categoryId) url.searchParams.set("categoryId", String(categoryId));
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
}

// Custom fields of a record, all opt-in: a field is shown only when the record
// already holds a value for it (or it is on-demand), or the user added it from
// the "Agregar campo" search / the inline creator. Empty fields never appear on
// their own — the record's type only ranks them first in the search. Each shown
// field can be removed. Values are written into formValues under
// `${valuePrefix}.${fieldKey}`; RunlyForm turns them into `customValues` +
// `removedCustomFieldIds`. `config.createPath` (POST) enables creating
// definitions inline.
export function DynamicFieldsSection({
  config,
  formValues,
  onFieldChange,
  onDefinitionsChange,
  initialEntries = null,
  apiBaseUrl,
  token,
  companyId,
  headers = null,
}) {
  // `headers` overrides the Bearer/company headers (the supplier portal authenticates with `Guest <token>`).
  const requestHeaders = headers ?? buildApiHeaders(token, companyId);
  const [library, setLibrary] = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [addedExtras, setAddedExtras] = useState([]);
  const [creator, setCreator] = useState({ open: false, label: "" });
  const categoryValue = config?.categoryField ? formValues[config.categoryField] : null;
  const prefix = config?.valuePrefix ?? "customValues";
  const removedKey = `${prefix}.${REMOVED_SUFFIX}`;
  const removedIds = useMemo(() => (Array.isArray(formValues[removedKey]) ? formValues[removedKey] : []), [formValues, removedKey]);

  const extraDefs = useMemo(() => {
    const seen = new Set();
    return [...extraDefinitionsFrom(initialEntries, []), ...addedExtras].filter((def) => {
      if (!def?.id || removedIds.includes(def.id) || seen.has(def.id)) return false;
      seen.add(def.id);
      return true;
    });
  }, [initialEntries, addedExtras, removedIds]);

  useEffect(() => {
    onDefinitionsChange?.(extraDefs.map((def) => ({ ...def, _extra: true })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraDefs]);

  const shownIds = new Set(extraDefs.map((def) => def.id));
  const sameType = (def) => Boolean(categoryValue) && String(def.categoryId ?? "") === String(categoryValue);
  const libraryOptions = (library ?? [])
    .filter((def) => !shownIds.has(def.id))
    .sort((a, b) => Number(sameType(b)) - Number(sameType(a)))
    .map((def) => ({ value: def.id, label: def.label, description: def.onDemand ? "A demanda" : sameType(def) ? "De este tipo" : def.categoryId ? "De otro tipo" : "Todos los tipos" }));

  const suggestions = config?.apiPath
    ? async (fieldId, search) => {
        const url = new URL(joinUrl(apiBaseUrl, `${config.apiPath}/${fieldId}/values`));
        if (search) url.searchParams.set("search", search);
        const res = await fetch(url.toString(), { headers: requestHeaders });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return Array.isArray(json.data) ? json.data : [];
      }
    : null;

  function loadLibrary(open) {
    if (!open || library || libraryLoading || !config?.apiPath) return;
    setLibraryLoading(true);
    fetchDefinitions({ apiBaseUrl, apiPath: config.apiPath, categoryId: "all", headers: requestHeaders })
      .then(setLibrary)
      .catch(() => setLibrary([]))
      .finally(() => setLibraryLoading(false));
  }

  function addExtra(def) {
    if (!def?.id) return;
    setAddedExtras((prev) => (prev.some((d) => d.id === def.id) ? prev : [...prev, def]));
    if (removedIds.includes(def.id)) onFieldChange(removedKey, removedIds.filter((id) => id !== def.id));
  }

  function removeExtra(def) {
    setAddedExtras((prev) => prev.filter((d) => d.id !== def.id));
    onFieldChange(removedKey, [...new Set([...removedIds, def.id])]);
    onFieldChange(`${prefix}.${def.fieldKey}`, "");
  }

  function handleCreated(def, scope) {
    if (!def?.id) return;
    setLibrary((prev) => (prev ? [...prev, def] : prev));
    addExtra(def);
  }

  const renderControl = (def, removable) => {
    const key = `${prefix}.${def.fieldKey}`;
    return (
      <div key={def.id} className={def.fieldType === "textarea" ? "relative min-w-0 col-span-full" : "relative min-w-0"}>
        <DynamicFieldControl definition={def} value={formValues[key]} onChange={(val) => onFieldChange(key, val)} suggestions={suggestions} />
        {removable ? (
          <button
            type="button"
            onClick={() => removeExtra(def)}
            aria-label={`Quitar ${def.label}`}
            title="Quitar de este registro"
            className="absolute right-0 top-0 rounded-md p-0.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--destructive))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {extraDefs.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">{extraDefs.map((def) => renderControl(def, true))}</div>
      ) : (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Sin campos personalizados. Busca y agrega solo los que necesites.</p>
      )}

      {config?.apiPath ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <ComboboxField
              label="Agregar campo a este registro"
              placeholder="Buscar campo..."
              searchPlaceholder="Buscar o crear campo..."
              options={libraryOptions}
              value=""
              loading={libraryLoading}
              onOpenChange={loadLibrary}
              onValueChange={(id) => addExtra((library ?? []).find((def) => def.id === id))}
              emptyText="No hay más campos en la biblioteca"
              onCreate={config?.createPath ? (text) => setCreator({ open: true, label: String(text ?? "") }) : undefined}
            />
          </div>
        </div>
      ) : null}

      {config?.createPath ? (
        <CustomFieldCreator
          open={creator.open}
          initialLabel={creator.label}
          onClose={() => setCreator({ open: false, label: "" })}
          createPath={config.createPath}
          categoryValue={categoryValue}
          existingKeys={[...(library ?? []), ...extraDefs].map((def) => def.fieldKey)}
          apiBaseUrl={apiBaseUrl}
          token={token}
          companyId={companyId}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
}
