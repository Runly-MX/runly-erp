import { X, Image, Video, Mic, FileText, Link2, CornerUpLeft } from "lucide-react";

const KIND_LABEL = {
  image: "Foto",
  video: "Video",
  audio: "Nota de voz",
  file: "Archivo",
  entity: "Referencia",
};
const KIND_ICON = { image: Image, video: Video, audio: Mic, file: FileText, entity: Link2 };

// `context` picks a palette so the quote reads as part of whatever surface it
// sits on, in both light and dark themes:
//   "onBrand"    – nested inside an own (brand-coloured) bubble
//   "onMuted"    – nested inside a received (muted) bubble
//   "standalone" – on the page background (compose bar, attachment-only reply)
//
// `--brand-primary-foreground` is a plain hex (white or near-black), so its
// translucent shades go through color-mix rather than the hsl(var/alpha)
// form used for the design-system tokens.
const STYLES = {
  onBrand: {
    className: "",
    // A shade of the bubble's OWN colour nudged toward its text colour — an
    // opaque same-hue inset that works whether the brand foreground is white
    // or near-black (a translucent white wash turned into a dark box on
    // light-brand themes).
    wrapStyle: { backgroundColor: "color-mix(in srgb, var(--brand-primary) 78%, var(--brand-primary-foreground))" },
    accentStyle: { backgroundColor: "color-mix(in srgb, var(--brand-primary-foreground) 55%, transparent)" },
    nameStyle: { color: "var(--brand-primary-foreground)" },
    textStyle: { color: "color-mix(in srgb, var(--brand-primary-foreground) 75%, transparent)" },
  },
  onMuted: {
    className: "",
    // Opaque, gently warm panel (mixed INTO the muted bubble, not a
    // translucent wash) so it reads as a soft inset rather than an
    // aggressive coloured box.
    wrapStyle: { backgroundColor: "color-mix(in srgb, var(--brand-primary) 9%, hsl(var(--muted)))" },
    accentStyle: { backgroundColor: "color-mix(in srgb, var(--brand-primary) 75%, transparent)" },
    nameStyle: { color: "var(--brand-primary)" },
    textClassName: "text-[hsl(var(--muted-foreground))]",
  },
  standalone: {
    className: "bg-[hsl(var(--muted))] border border-[hsl(var(--border))]",
    accentStyle: { backgroundColor: "var(--brand-primary)" },
    nameStyle: { color: "var(--brand-primary)" },
    textClassName: "text-[hsl(var(--muted-foreground))]",
  },
};

// The quoted-message chip. `variant="inline"` renders inside/above a bubble
// (tap jumps to the original). `variant="compose"` renders above the composer
// with a cancel button. `reply` is the API preview object:
// { id, senderUserId, senderName, bodyPreview, kind, isDeleted }.
export function MessageQuote({ reply, variant = "inline", context = "standalone", onJump, onCancel }) {
  if (!reply) return null;
  const s = STYLES[context] ?? STYLES.standalone;
  const Icon = KIND_ICON[reply.kind];
  const label = reply.isDeleted
    ? "Mensaje eliminado"
    : reply.bodyPreview || KIND_LABEL[reply.kind] || "Mensaje";

  const body = (
    <div
      className={[
        "relative flex flex-col gap-0.5 pl-2.5 pr-2 py-1 rounded-md min-w-0 text-left overflow-hidden",
        s.className ?? "",
      ].join(" ")}
      style={s.wrapStyle}
    >
      <span
        className={["absolute left-0 top-0 bottom-0 w-0.75", s.accentClassName ?? ""].join(" ")}
        style={s.accentStyle}
      />
      <span className={["text-[11px] font-semibold truncate", s.nameClassName ?? ""].join(" ")} style={s.nameStyle}>
        {reply.senderName}
      </span>
      <span
        className={[
          "text-xs flex items-start gap-1",
          s.textClassName ?? "",
          reply.isDeleted ? "italic" : "",
        ].join(" ")}
        style={s.textStyle}
      >
        {Icon && !reply.bodyPreview && !reply.isDeleted && <Icon className="h-3 w-3 shrink-0 mt-0.5" />}
        {/* Clamp long quoted bodies to two lines — a full multi-line quote
            balloons the bubble and buries the actual reply (flex + `truncate`
            together silently disabled the old single-line clamp). */}
        <span className="min-w-0 line-clamp-2 wrap-anywhere">{label}</span>
      </span>
    </div>
  );

  if (variant === "compose") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[hsl(var(--border))]">
        <CornerUpLeft className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
        <div className="min-w-0 flex-1">{body}</div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar respuesta"
          className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={reply.isDeleted ? undefined : () => onJump?.(reply.id)}
      // Keep the tap on the quote from being read as the start of a
      // swipe / long-press / double-tap by the surrounding message row.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className={[
        "w-full mb-1.5 block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/35",
        reply.isDeleted ? "cursor-default" : "cursor-pointer hover:opacity-90",
      ].join(" ")}
    >
      {body}
    </button>
  );
}
