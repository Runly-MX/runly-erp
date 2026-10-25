// "Nueva automatización": pick how it starts (or a ready example), name it, and
// open it in the editor. Nothing is saved until the person saves in the editor.
import { useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField, WizardSteps } from "@runly/ui";
import { ArrowLeft, ArrowRight, CalendarClock, Radio, Sparkles, Webhook } from "lucide-react";
import { EXAMPLES, STARTERS, keyFromName } from "../../lib/automationStarters";

const ICONS = { event: Radio, schedule: CalendarClock, webhook: Webhook };
const STEPS = [{ key: "start", label: "Cómo empieza" }, { key: "name", label: "Nombre" }];

function Choice({ icon: Icon, title, text, active, onClick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors [@media(pointer:coarse)]:min-h-14 ${active ? "border-transparent bg-(--brand-primary)/15" : "border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]/60"}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-(--brand-primary)/10 text-(--brand-primary)" aria-hidden="true"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{text}</span>
      </span>
    </button>
  );
}

export function NewAutomationDialog({ open, onOpenChange, takenKeys, onCreate }) {
  const [step, setStep] = useState("start");
  const [choice, setChoice] = useState({ kind: "starter", id: "event" });
  const [name, setName] = useState("");

  const source = choice.kind === "starter" ? STARTERS.find((item) => item.id === choice.id) : EXAMPLES.find((item) => item.id === choice.id);
  const reset = () => { setStep("start"); setName(""); };
  const close = (next) => { if (!next) reset(); onOpenChange(next); };
  const pick = (kind, id, label) => {
    setChoice({ kind, id });
    if (!name.trim() || EXAMPLES.some((example) => example.label === name)) setName(label ?? "");
  };
  const create = () => {
    const label = name.trim();
    onCreate({ key: keyFromName(label, takenKeys), label, enabled: true, ...source.draft() });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent size="2xl" className="flex max-h-[92dvh] flex-col md:max-w-2xl">
        <DialogHeader icon={Sparkles}>
          <DialogTitle>Nueva automatización</DialogTitle>
          <DialogDescription>Elige cómo empieza. Después la armas en el lienzo, bloque por bloque.</DialogDescription>
        </DialogHeader>
        <WizardSteps steps={STEPS} current={step} onStepClick={setStep} className="mb-4" />
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 pb-1">
          {step === "start" ? (
            <div className="space-y-5">
              <section role="radiogroup" aria-label="Cómo empieza" className="space-y-2">
                <h3 className="text-sm font-semibold">Desde cero</h3>
                {STARTERS.map((starter) => (
                  <Choice key={starter.id} icon={ICONS[starter.id]} title={starter.title} text={starter.text}
                    active={choice.kind === "starter" && choice.id === starter.id} onClick={() => pick("starter", starter.id)} />
                ))}
              </section>
              <section role="radiogroup" aria-label="Ejemplos" className="space-y-2">
                <h3 className="text-sm font-semibold">O parte de un ejemplo</h3>
                {EXAMPLES.map((example) => (
                  <Choice key={example.id} icon={ICONS[example.draft().trigger.type]} title={example.title} text={example.text}
                    active={choice.kind === "example" && choice.id === example.id} onClick={() => pick("example", example.id, example.label)} />
                ))}
              </section>
            </div>
          ) : (
            <TextField id="new-automation-name" label="Nombre de la automatización" required value={name} maxLength={120} placeholder="Ej. Aviso de orden de compra aprobada" onChange={(e) => setName(e.target.value)}
              hint="Se usa en la lista y en el historial. Puedes cambiarlo cuando quieras." />
          )}
        </div>
        <DialogFooter className="shrink-0">
          {step === "start" ? (
            <Button variant="outline" onClick={() => close(false)}>Cancelar</Button>
          ) : (
            <Button variant="outline" onClick={() => setStep("start")}><ArrowLeft className="h-4 w-4" /> Atrás</Button>
          )}
          {step === "start" ? (
            <Button onClick={() => setStep("name")}>Siguiente <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button disabled={!name.trim()} onClick={create}>Abrir en el lienzo</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
