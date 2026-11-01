import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
  Button, Skeleton, ErrorState, SelectField, CheckboxField, TextField,
} from "@runly/ui";
import { BookText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useTranscriptionSettings, useUpdateTranscriptionSettings, useAddTranscriptionTerm, useRemoveTranscriptionTerm,
} from "../hooks/useTranscriptionVocabulary";

const SOURCE_LABELS = { MANUAL: "Agregado", LEARNED: "Aprendido de tus correcciones", AI: "Sugerido por MirAI" };

function EngineSection({ settings }) {
  const update = useUpdateTranscriptionSettings();
  const [engine, setEngine] = useState(settings.engine);
  const [acknowledged, setAcknowledged] = useState(false);
  const needsConsent = engine === "GROQ" && !settings.externalConsentAt;
  const options = [{ value: "LOCAL", label: "En este servidor (privado)" }];
  if (settings.externalAvailable || settings.engine === "GROQ") {
    options.push({ value: "GROQ", label: "Servicio externo (más preciso y rápido)" });
  }

  async function save() {
    try {
      await update.mutateAsync({ engine, acknowledgeExternal: acknowledged });
      toast.success("Motor de transcripción actualizado.");
    } catch (err) {
      toast.error(err?.message ?? "No se pudo guardar el motor de transcripción.");
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">Motor de transcripción</h3>
      <SelectField label="Motor" value={engine} onValueChange={setEngine} options={options} />
      {engine === "GROQ" && (
        <p className="rounded-md bg-[hsl(var(--muted)/0.5)] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          Con el servicio externo, el audio de las reuniones (sin video) se envía a Groq para transcribirlo.
          Si no responde, la transcripción se completa en este servidor.
        </p>
      )}
      {needsConsent && (
        <CheckboxField
          label="Entiendo que el audio de las reuniones de mi empresa se enviará a un servicio externo."
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
      )}
      {!settings.externalAvailable && settings.engine !== "GROQ" && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">El servicio externo no está configurado en esta instancia.</p>
      )}
      <Button
        size="sm"
        disabled={update.isPending || engine === settings.engine || (needsConsent && !acknowledged)}
        onClick={save}
      >
        Guardar motor
      </Button>
    </section>
  );
}

function GlossarySection({ terms }) {
  const add = useAddTranscriptionTerm();
  const remove = useRemoveTranscriptionTerm();
  const [term, setTerm] = useState("");
  const [heardAs, setHeardAs] = useState("");

  async function handleAdd(e) {
    e.preventDefault();
    try {
      await add.mutateAsync({ term: term.trim(), ...(heardAs.trim() ? { heardAs: heardAs.trim() } : {}) });
      setTerm("");
      setHeardAs("");
    } catch (err) {
      toast.error(err?.message ?? "No se pudo guardar el término.");
    }
  }

  async function handleRemove(id) {
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      toast.error(err?.message ?? "No se pudo eliminar el término.");
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Vocabulario de tu empresa</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Siglas, marcas, nombres y términos técnicos que se mencionan en tus reuniones. Se envían al motor de
          transcripción para que los reconozca mejor.
        </p>
      </div>
      <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <TextField label="Término" value={term} maxLength={80} placeholder="Ej. BACnet" onChange={(e) => setTerm(e.target.value)} />
        <TextField
          label="Se transcribe como (opcional)"
          value={heardAs}
          maxLength={80}
          placeholder="Ej. Baglet"
          hint="Si lo escribes, se corrige solo."
          onChange={(e) => setHeardAs(e.target.value)}
        />
        <Button type="submit" size="sm" disabled={add.isPending || !term.trim()}>Agregar</Button>
      </form>
      {terms.length === 0 ? (
        <p className="py-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
          Aún no hay términos. Se irán agregando cuando corrijas una transcripción.
        </p>
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
          {terms.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {item.term}
                  {item.heardAs && <span className="font-normal text-[hsl(var(--muted-foreground))]"> ← {item.heardAs}</span>}
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {SOURCE_LABELS[item.source] ?? item.source}{item.hits > 1 ? ` · ${item.hits} veces` : ""}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Eliminar ${item.term}`}
                title="Eliminar"
                disabled={remove.isPending}
                onClick={() => handleRemove(item.id)}
                className="rounded-md p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--destructive))]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TranscriptionSettingsDialog({ open, onOpenChange }) {
  const { data, isLoading, isError, refetch } = useTranscriptionSettings(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" scrollable>
        <DialogHeader icon={BookText}>
          <DialogTitle>Vocabulario y motor de transcripción</DialogTitle>
          <DialogDescription>
            Mejora cómo se transcriben las reuniones con términos técnicos o palabras en otro idioma.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
        {isError && <ErrorState title="No se pudo cargar la configuración" onRetry={refetch} />}
        {data && (
          <div className="space-y-6">
            <EngineSection key={`${data.engine}-${data.externalConsentAt ?? ""}`} settings={data} />
            <GlossarySection terms={data.terms ?? []} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
