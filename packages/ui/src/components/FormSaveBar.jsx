import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button.jsx";
import { cn } from "../lib/utils.js";
import { saveBarFloating } from "../lib/form-save-dock.js";

// Universal save/cancel bar for forms (RunlyForm uses it; custom forms can
// too). Must render inside the <form> so the primary button submits it.
//
// - floating=false (inside a Dialog/Sheet): plain buttons, always visible.
// - floating=true (full page): a sticky glass bar on phones/tablets; on large
//   screens a pill floating at the bottom right that slides in only while
//   `dirty` (or `submitting`, or `forceVisible`, e.g. to show an error).
// - dock=true (long full-page forms): the bar always sits in its natural
//   place at the end of the form (buttons disabled while clean, so it never
//   moves the layout). While `dirty` and that place is off screen, a small
//   pill slides in at the bottom of the viewport; once the end of the form
//   scrolls into view (IntersectionObserver), the pill fades out and the
//   docked bar takes over. Respects prefers-reduced-motion.
export function FormSaveBar({
  floating = true,
  dock = false,
  dirty = false,
  submitting = false,
  forceVisible = false,
  submitLabel = "Guardar",
  cancelLabel = "Cancelar",
  onCancel,
  className,
}) {
  const buttons = (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" onClick={() => onCancel?.()} disabled={submitting}>
        {cancelLabel}
      </Button>
      <Button type="submit" loading={submitting} disabled={submitting}>
        {submitting ? "Guardando..." : submitLabel}
      </Button>
    </div>
  );

  if (dock) {
    return (
      <DockedSaveBar
        dirty={dirty} submitting={submitting} forceVisible={forceVisible}
        submitLabel={submitLabel} cancelLabel={cancelLabel} onCancel={onCancel} className={className}
      />
    );
  }

  if (!floating) {
    return (
      <div className={cn("sticky bottom-0 z-10 flex items-center justify-between gap-2 pt-3", className)}>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{submitting ? "Guardando..." : ""}</p>
        {buttons}
      </div>
    );
  }

  const shown = dirty || submitting || forceVisible;
  return (
    <div
      className={cn(
        "glass-strong sticky bottom-0 z-10 flex items-center justify-between gap-2 rounded-xl px-4 py-3",
        "lg:fixed lg:bottom-16 lg:right-8 lg:z-40 lg:justify-end lg:gap-3 lg:rounded-2xl lg:border lg:border-[hsl(var(--border))] lg:py-2.5 lg:pl-5 lg:pr-2.5 lg:shadow-2xl lg:transition-all lg:duration-300 lg:ease-out",
        shown
          ? "lg:visible lg:translate-y-0 lg:scale-100 lg:opacity-100"
          : "lg:invisible lg:pointer-events-none lg:translate-y-6 lg:scale-95 lg:opacity-0",
        className,
      )}
      aria-live="polite"
    >
      <p className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        {submitting ? (
          "Guardando..."
        ) : dirty ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--brand-primary) opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-(--brand-primary)" />
            </span>
            <span className="font-medium text-[hsl(var(--foreground))]">Cambios sin guardar</span>
          </>
        ) : null}
      </p>
      {buttons}
    </div>
  );
}

function DockedSaveBar({ dirty, submitting, forceVisible, submitLabel, cancelLabel, onCancel, className }) {
  const [anchor, setAnchor] = useState(null);
  const [endVisible, setEndVisible] = useState(false);
  useEffect(() => {
    if (!anchor || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setEndVisible(entry.isIntersecting));
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [anchor]);

  const floatingShown = saveBarFloating({ dirty, submitting, forceVisible, endVisible });
  const busy = submitting || !dirty;
  // The pill is portaled to <body> (a transformed ancestor would break
  // `fixed`), so its primary button submits the bar's own <form> explicitly.
  const submitForm = () => anchor?.closest("form")?.requestSubmit();
  const actions = (size, portaled = false) => (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size={size} onClick={() => onCancel?.()} disabled={busy}>
        {cancelLabel}
      </Button>
      <Button type={portaled ? "button" : "submit"} onClick={portaled ? submitForm : undefined} size={size} loading={submitting} disabled={busy}>
        {submitting ? "Guardando..." : submitLabel}
      </Button>
    </div>
  );

  return (
    <div ref={setAnchor} className={cn("flex items-center justify-end gap-2 border-t border-[hsl(var(--border))] pt-4", className)}>
      <p className="mr-auto text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
        {submitting ? "Guardando..." : dirty ? "Cambios sin guardar" : ""}
      </p>
      {actions("default")}
      {typeof document === "undefined" ? null : createPortal(
      <div
        inert={!floatingShown}
        className={cn(
          "glass-strong fixed inset-x-4 bottom-[max(1rem,var(--sab))] z-40 flex items-center justify-between gap-3 rounded-2xl border border-[hsl(var(--border))] py-2 pl-4 pr-2 shadow-2xl",
          "sm:inset-x-auto sm:right-8 lg:bottom-16",
          "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
          floatingShown ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none translate-y-6 scale-95 opacity-0",
        )}
      >
        <p className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--foreground))]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--brand-primary) opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-(--brand-primary)" />
          </span>
          {submitting ? "Guardando..." : "Cambios sin guardar"}
        </p>
        {actions("sm", true)}
      </div>,
      document.body,
      )}
    </div>
  );
}

export default FormSaveBar;
