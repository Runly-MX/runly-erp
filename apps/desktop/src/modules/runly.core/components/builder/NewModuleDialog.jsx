// Module Builder — "Crear módulo" (spec 2026-10-03-rme3-module-platform-v2
// §5 goal 9, plan Task 5.1/5.2): start from a template, from a description
// turned into a draft by MirAI ("Con IA"), or blank. A short wizard: how to
// start -> content (template / description; skipped when blank) -> module data.
// Header, progress and footer stay fixed; only the middle scrolls.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField, TextareaField, WizardSteps,
} from "@runly/ui";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Hammer, LayoutTemplate, Sparkles, SquarePlus } from "lucide-react";
import { runly } from "../../../../lib/runly";
import { resolveLucideIcon } from "../../lib/builderHelpers";

const MODES = [
  { key: "template", label: "Desde plantilla", description: "Un módulo listo para usar que puedes ajustar.", icon: LayoutTemplate },
  { key: "ai", label: "Con IA", description: "Describe lo que necesitas y MirAI arma el borrador.", icon: Sparkles },
  { key: "blank", label: "En blanco", description: "Empiezas sin entidades.", icon: SquarePlus },
];

const suggestKey = (name) => {
  const slug = String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/^[0-9]+/, "").slice(0, 24);
  return slug ? `custom.${slug}` : "";
};

function IconTile({ icon: Icon }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--brand-primary)/10 text-(--brand-primary)">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function SectionTitle({ children, hint }) {
  return (
    <div className="mb-2">
      <h3 className="text-sm font-semibold">{children}</h3>
      {hint && <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>}
    </div>
  );
}

function TemplateGrid({ templates, value, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Plantilla">
      {templates.filter((template) => template.key !== "blank").map((template) => {
        const active = value === template.key;
        return (
          <button
            key={template.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(template.key)}
            className={`relative flex cursor-pointer flex-col gap-2 rounded-xl border p-4 text-left transition-colors ${active ? "border-(--brand-primary) bg-(--brand-primary)/5" : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50"}`}
          >
            <IconTile icon={resolveLucideIcon(template.icon)} />
            <span className="block text-sm font-semibold">{template.label}</span>
            <span className="block text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{template.description}</span>
            {active && <Check className="absolute right-3 top-3 h-4 w-4 text-(--brand-primary)" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

function DraftPreview({ draft }) {
  const { definition, errors } = draft;
  return (
    <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-3">
      <p className="text-sm font-medium">Borrador de MirAI</p>
      {(definition.entities ?? []).map((entity) => (
        <div key={entity.key} className="space-y-1">
          <p className="text-sm">{entity.label} <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{entity.key}</span></p>
          <div className="flex flex-wrap gap-1">
            {(entity.fields ?? []).map((field) => (
              <Badge key={field.key} variant="outline">{field.label}{field.required ? " *" : ""}</Badge>
            ))}
          </div>
        </div>
      ))}
      {errors?.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Quedan {errors.length} detalle(s) por corregir; podrás revisarlos en el editor antes de publicar.
        </p>
      )}
    </div>
  );
}

function ModePicker({ mode, onChange, aiAvailable }) {
  return (
    <section>
      <SectionTitle hint="Siempre podrás cambiar todo después en el Constructor.">¿Cómo quieres empezar?</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Cómo empezar">
        {MODES.map((item) => {
          const disabled = item.key === "ai" && !aiAvailable;
          const active = mode === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(item.key)}
              className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-(--brand-primary) bg-(--brand-primary)/5" : "cursor-pointer border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/50"}`}
            >
              <IconTile icon={item.icon} />
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="block text-xs text-[hsl(var(--muted-foreground))]">{disabled ? "La IA no está configurada en esta instancia." : item.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function NewModuleDialog({ open, onOpenChange, token, onCreate, creating }) {
  const [mode, setMode] = useState("template");
  const [step, setStep] = useState("mode");
  const [template, setTemplate] = useState("visitas");
  const [form, setForm] = useState({ name: "", moduleKey: "", description: "" });
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState(null);

  const capabilitiesQuery = useQuery({
    queryKey: ["module-builder-capabilities", token],
    queryFn: () => runly.builder.getCapabilities(token),
    enabled: open && Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
  const capabilities = capabilitiesQuery.data?.data;
  const templates = useMemo(() => (Array.isArray(capabilities?.templates) ? capabilities.templates.filter((item) => typeof item === "object") : []), [capabilities]);
  const aiAvailable = Boolean(capabilities?.aiDraft);

  const draftMutation = useMutation({
    mutationFn: async () => {
      const result = await runly.builder.aiDraft(prompt, token);
      return result.data;
    },
    onSuccess: (data) => {
      setDraft(data);
      setForm((current) => ({ ...current, name: current.name || data.definition.name, description: current.description || data.definition.description || "" }));
    },
  });

  const suggestedKey = suggestKey(form.name);
  const steps = mode === "blank"
    ? [{ key: "mode", label: "Cómo empezar" }, { key: "data", label: "Datos del módulo" }]
    : [{ key: "mode", label: "Cómo empezar" }, { key: "content", label: mode === "ai" ? "Tu descripción" : "Plantilla" }, { key: "data", label: "Datos del módulo" }];
  const stepIndex = Math.max(steps.findIndex((item) => item.key === step), 0);
  const isLast = stepIndex === steps.length - 1;
  const canAdvance = step === "content" ? (mode !== "ai" || Boolean(draft)) : step === "data" ? Boolean(form.name.trim()) : true;
  const selectedTemplate = templates.find((item) => item.key === template);

  function submit() {
    const base = { name: form.name.trim(), moduleKey: form.moduleKey || undefined, description: form.description };
    if (mode === "ai") onCreate({ ...base, definition: { ...draft.definition, name: form.name.trim(), description: form.description || draft.definition.description } });
    else onCreate({ ...base, template: mode === "blank" ? "blank" : template });
  }
  function handleOpenChange(next) {
    if (!next) setStep("mode");
    onOpenChange(next);
  }
  function goNext() {
    if (isLast) submit();
    else setStep(steps[stepIndex + 1].key);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="2xl" className="flex max-h-[92dvh] flex-col md:max-w-3xl">
        <DialogHeader icon={Hammer}>
          <DialogTitle>Crear módulo</DialogTitle>
          <DialogDescription>Elige cómo empezar y ponle nombre. Podrás editarlo todo después en el Constructor.</DialogDescription>
        </DialogHeader>
        <WizardSteps steps={steps} current={step} onStepClick={setStep} className="mb-4" />
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 pb-1">
          {step === "mode" && <ModePicker mode={mode} onChange={setMode} aiAvailable={aiAvailable} />}

          {step === "content" && mode === "template" && (
            <section>
              <SectionTitle hint="Un módulo funcional con sus pantallas; lo ajustas después.">Elige una plantilla</SectionTitle>
              <TemplateGrid templates={templates} value={template} onChange={setTemplate} />
            </section>
          )}

          {step === "content" && mode === "ai" && (
            <section className="space-y-2">
              <SectionTitle hint="MirAI arma el borrador con entidades y campos; lo revisas antes de crear.">Cuéntanos qué necesitas</SectionTitle>
              <TextareaField
                id="ai-module-description"
                label="¿Qué necesitas registrar?"
                rows={5}
                value={prompt}
                placeholder="Ej. Quiero llevar el control de las visitas de mis técnicos a clientes: cliente, técnico, fecha, motivo, estado y lo que se hizo."
                onChange={(e) => { setPrompt(e.target.value); setDraft(null); }}
              />
              <div className="flex justify-end">
                <Button variant="outline" disabled={prompt.trim().length < 10 || draftMutation.isPending} onClick={() => draftMutation.mutate()}>
                  <Sparkles className="h-4 w-4" />
                  {draftMutation.isPending ? "Generando..." : draft ? "Generar otra vez" : "Generar borrador"}
                </Button>
              </div>
              {draftMutation.isError && <p className="text-sm text-red-600">{draftMutation.error?.message ?? "La IA no respondió."}</p>}
              {draft && <DraftPreview draft={draft} />}
            </section>
          )}

          {step === "data" && (
            <section className="space-y-4">
              <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 text-sm">
                {mode === "blank" && "Módulo en blanco: agregarás tablas, campos y pantallas en el Constructor."}
                {mode === "ai" && `Borrador de MirAI con ${(draft?.definition?.entities ?? []).length} entidad(es).`}
                {mode === "template" && <>Plantilla: <span className="font-medium">{selectedTemplate?.label ?? template}</span></>}
              </div>
              <SectionTitle>Datos del módulo</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField id="new-module-name" label="Nombre" required value={form.name} placeholder="Control de visitas" onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                <TextField
                  id="new-module-key"
                  label="Clave del módulo"
                  value={form.moduleKey}
                  placeholder={suggestedKey || "custom.mi-modulo"}
                  hint="Se sugiere a partir del nombre. No podrá cambiarse después."
                  onChange={(e) => setForm((f) => ({ ...f, moduleKey: e.target.value }))}
                />
              </div>
              <TextareaField label="Descripción" rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </section>
          )}
        </div>
        <DialogFooter className="shrink-0">
          {stepIndex === 0 ? (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          ) : (
            <Button variant="outline" onClick={() => setStep(steps[stepIndex - 1].key)}><ArrowLeft className="h-4 w-4" /> Atrás</Button>
          )}
          <Button disabled={!canAdvance || creating} onClick={goNext}>
            {isLast ? (creating ? "Creando..." : "Crear módulo") : <>Siguiente <ArrowRight className="h-4 w-4" /></>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
