// apps/desktop/src/modules/runly.chat/components/ChatSettingsDialog.jsx
// Personal chat appearance: text size, accent color (presets or any hex),
// background tone, wallpaper pattern and bubble shape. Purely a rendering
// choice (see useChatPreferences.jsx) - nothing here is sent to the API
// besides the preference blob itself.
//
// Edits are staged in local draft state and only committed to the shared
// (server-persisted) preferences on "Aceptar" - the preview renders straight
// off the draft, so you see the effect before it applies anywhere else.
// Closing any other way discards the draft; "Restablecer" resets the draft
// to the defaults (still needs "Aceptar" to persist).
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Button,
  RadioGroupField, SwitchField, TextField,
} from "@runly/ui";
import { Check, Palette } from "lucide-react";
import {
  useChatPreferences, ACCENT_PRESETS, FONT_SCALE_OPTIONS, DEFAULT_PREFS, BACKGROUND_TONES, BUBBLE_SHAPES,
  WALLPAPER_STYLES, chatPreferencesStyle, wallpaperLayerProps, resolveAccentHex,
} from "../hooks/useChatPreferences";

const HEX_RE = /^#[0-9a-f]{6}$/i;

function ChatPreview({ draft }) {
  // Dialog content is portaled to document.body, outside ChatScreen's own
  // .chat-glass-theme wrapper, so the scope class and the draft's CSS
  // variables are re-established locally (outer div) around the elements the
  // scoped rules actually target (inner div).
  return (
    <div className="chat-glass-theme" style={chatPreferencesStyle(draft)}>
      <div className="chat-scale-target chat-wallpaper relative isolate rounded-xl border border-[hsl(var(--border))] overflow-hidden p-3 space-y-1.5">
        {draft.wallpaper && <div {...wallpaperLayerProps(draft)} />}
        <div className="flex justify-start">
          <div
            className="max-w-[75%] px-3 py-1.5 bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] text-sm"
            style={{ borderRadius: "var(--chat-radius-bubble)", borderBottomLeftRadius: "var(--chat-radius-bubble-tail)" }}
          >
            Hola! Asi se ve un mensaje recibido.
          </div>
        </div>
        <div className="flex justify-end">
          <div
            className="max-w-[75%] px-3 py-1.5 text-sm bg-(--brand-primary) text-(--brand-primary-foreground)"
            style={{ borderRadius: "var(--chat-radius-bubble)", borderBottomRightRadius: "var(--chat-radius-bubble-tail)" }}
          >
            Y asi se ve uno enviado por ti.
          </div>
        </div>
        <div className="flex justify-start">
          <span className="inline-flex items-center rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-xs">
            <span className="mr-2 h-2 w-2 rounded-full bg-(--brand-primary)" />Boton y detalles usan tu color
          </span>
        </div>
      </div>
    </div>
  );
}

function Swatch({ title, color, selected, onClick, foreground = "#ffffff" }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={selected}
      onClick={onClick}
      className={[
        "h-8 w-8 rounded-full flex items-center justify-center shrink-0 ring-2 ring-offset-2 ring-offset-[hsl(var(--card))] transition-all",
        selected ? "ring-[hsl(var(--foreground))]" : "ring-transparent",
      ].join(" ")}
      style={{ backgroundColor: color }}
    >
      {selected && <Check className="h-4 w-4" style={{ color: foreground }} />}
    </button>
  );
}

function Section({ title, hint, children }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {children}
      {hint ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p> : null}
    </div>
  );
}

export function ChatSettingsDialog({ open, onOpenChange }) {
  const { prefs, update } = useChatPreferences();
  const [draft, setDraft] = useState(prefs);
  const [hexText, setHexText] = useState(prefs.accentCustom);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Re-sync the draft to what is persisted every time the dialog opens -
  // discards unsaved edits left over from a previous open/close.
  useEffect(() => {
    if (open) {
      setDraft(prefs);
      setHexText(prefs.accentCustom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on the open transition
  }, [open]);

  function handleAccept() {
    update(draft);
    onOpenChange(false);
  }

  function handleReset() {
    setDraft(DEFAULT_PREFS);
    setHexText(DEFAULT_PREFS.accentCustom);
  }

  function handleHex(value) {
    const text = value.startsWith("#") ? value : `#${value}`;
    setHexText(text);
    if (HEX_RE.test(text)) set({ accentColorKey: "custom", accentCustom: text.toLowerCase() });
  }

  const customSelected = draft.accentColorKey === "custom";
  const customHex = resolveAccentHex({ ...draft, accentColorKey: "custom" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg">
        <DialogHeader icon={Palette}>
          <DialogTitle>Configuracion del chat</DialogTitle>
          <DialogDescription>Personaliza como se ve el chat. Solo cambia tu vista.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain py-1 pr-1">
          <Section title="Vista previa">
            <ChatPreview draft={draft} />
          </Section>

          <Section
            title="Color de acento"
            hint={'"Marca de la empresa" usa el color configurado para toda la organizacion. El acento tambien colorea botones, vistas previas y complementos dentro del chat.'}
          >
            <div className="flex flex-wrap gap-2.5">
              {ACCENT_PRESETS.map((preset) => (
                <Swatch
                  key={preset.key}
                  title={preset.label}
                  color={preset.primary ?? "hsl(var(--brand-primary))"}
                  foreground={preset.foreground ?? "hsl(var(--brand-primary-foreground))"}
                  selected={draft.accentColorKey === preset.key}
                  onClick={() => set({ accentColorKey: preset.key })}
                />
              ))}
              <Swatch
                title="Color personalizado"
                color={customHex ?? "#7c5cff"}
                selected={customSelected}
                onClick={() => set({ accentColorKey: "custom" })}
              />
            </div>
            {customSelected ? (
              <TextField
                label="Color personalizado (hex)"
                value={hexText}
                onChange={(e) => handleHex(e.target.value)}
                placeholder="#7c5cff"
                maxLength={7}
                error={HEX_RE.test(hexText) ? undefined : "Usa el formato #RRGGBB"}
              />
            ) : null}
          </Section>

          <Section title="Fondo" hint="Mezcla un tono suave con el fondo del tema, claro u oscuro.">
            <div className="flex flex-wrap gap-2">
              {BACKGROUND_TONES.map((tone) => (
                <Button
                  key={tone.key}
                  type="button"
                  size="sm"
                  variant={draft.background === tone.key ? "default" : "outline"}
                  onClick={() => set({ background: tone.key })}
                >
                  {tone.tone && tone.tone !== "accent" ? (
                    <span className="mr-1.5 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.tone }} />
                  ) : null}
                  {tone.label}
                </Button>
              ))}
            </div>
          </Section>

          <SwitchField
            label="Patron decorativo"
            description="Dibuja un patron suave detras de los mensajes."
            checked={draft.wallpaper}
            onChange={(checked) => set({ wallpaper: checked })}
          />
          {draft.wallpaper ? (
            <RadioGroupField
              label="Estilo del patron"
              name="chat-wallpaper-style"
              value={draft.wallpaperStyle}
              onChange={(key) => set({ wallpaperStyle: key })}
              options={WALLPAPER_STYLES.map((o) => ({ value: o.key, label: o.label }))}
            />
          ) : null}

          <RadioGroupField
            label="Forma de las burbujas"
            name="chat-bubble-shape"
            value={draft.bubbleShape}
            onChange={(key) => set({ bubbleShape: key })}
            options={BUBBLE_SHAPES.map((o) => ({ value: o.key, label: o.label }))}
          />

          <RadioGroupField
            label="Tamano del texto"
            name="chat-font-scale"
            value={FONT_SCALE_OPTIONS.find((o) => o.value === draft.fontScale)?.key ?? "md"}
            onChange={(key) => {
              const opt = FONT_SCALE_OPTIONS.find((o) => o.key === key);
              if (opt) set({ fontScale: opt.value });
            }}
            options={FONT_SCALE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          />
        </div>

        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={handleReset}>
            Restablecer
          </Button>
          <Button type="button" onClick={handleAccept}>
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
