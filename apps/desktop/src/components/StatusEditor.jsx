// Status editor shown as a popover next to the user menu: a few quick choices, or an emoji,
// a short text and how long it lasts. Kept short on purpose (one screenful, no labels that
// repeat the field). Spec docs/superpowers/specs/2026-10-26-status-and-dnd-design.md.
import { useEffect, useState } from "react";
import { Button, SelectField, TextField } from "@runly/ui";
import { durationFor, STATUS_DURATIONS, STATUS_EMOJIS, STATUS_PRESETS } from "../lib/statusDnd";

export function StatusEditor({ status, onSave, onClear, onClose }) {
  const [emoji, setEmoji] = useState("😀");
  const [text, setText] = useState("");
  const [duration, setDuration] = useState("1h");
  useEffect(() => { setEmoji(status?.emoji || "😀"); setText(status?.text ?? ""); }, [status]);
  const apply = (next) => { onSave({ emoji: next.emoji, text: next.text, expiresAt: durationFor(next.duration, STATUS_DURATIONS) }); onClose(); };
  return (
    <div className="w-72 space-y-2.5 p-3">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Estados rápidos">
        {STATUS_PRESETS.map((preset) => (
          <button key={preset.text} type="button" title={preset.text} onClick={() => apply(preset)} className="cursor-pointer rounded-md border border-[hsl(var(--border))] px-1.5 py-0.5 text-xs transition-colors hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:min-h-10">
            <span aria-hidden>{preset.emoji}</span> {preset.text.replace("Trabajando desde casa", "Desde casa")}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex shrink-0 gap-0.5" role="group" aria-label="Emoji del estado">
          {STATUS_EMOJIS.slice(0, 6).map((item) => (
            <button key={item} type="button" aria-pressed={emoji === item} onClick={() => setEmoji(item)} className={["flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-base transition-colors [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10", emoji === item ? "bg-[var(--brand-primary)]/15" : "hover:bg-[hsl(var(--muted))]"].join(" ")}>{item}</button>
          ))}
        </div>
      </div>
      <TextField aria-label="Texto del estado" value={text} maxLength={80} placeholder="¿Qué estás haciendo?" onChange={(e) => setText(e.target.value)} />
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><SelectField aria-label="Borrar después de" options={STATUS_DURATIONS.map(({ value, label }) => ({ value, label: value === "none" ? "No borrar" : `Borrar: ${label.toLowerCase()}` }))} value={duration} onValueChange={setDuration} /></div>
        <Button size="sm" disabled={!text.trim()} onClick={() => apply({ emoji, text: text.trim(), duration })}>Guardar</Button>
      </div>
      {status && <button type="button" onClick={() => { onClear(); onClose(); }} className="cursor-pointer text-xs text-[hsl(var(--muted-foreground))] hover:underline">Quitar mi estado</button>}
    </div>
  );
}
