import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSafeAreaInsets, useCoarsePointer, useOfficeActions } from "@runly/ui";
import { Plus } from "lucide-react";
import { buildMessageActions, QUICK_REACTIONS } from "../lib/messageActions";
import { computeAnchoredMenuLayout, computeSpotlightLayout } from "../lib/messageActionLayout";
import { useAttachmentUrl, buildAttachmentActions } from "./MessageAttachments";

// Theme custom properties set on the `.chat-glass-theme` root; the lifted clone
// is portaled to <body> (outside it), so they are copied onto the clone host.
const THEME_VARS = [
  "--brand-primary", "--brand-primary-foreground", "--brand-primary-hover", "--brand-primary-on-dark",
  "--chat-radius-bubble", "--chat-radius-bubble-tail", "--chat-radius-panel", "--chat-radius-pill",
  "--chat-font-display", "--chat-font-mono", "--chat-zoom",
];

// Action menu for a message. Touch long-press (WhatsApp-style): the page is
// dimmed, a pixel copy of the pressed bubble is lifted with the reaction pill
// above it and the action card below; the group shifts vertically to fit the
// safe area, the card scrolls when it is still too tall, and only a very tall
// bubble is cropped (see computeSpotlightLayout). Mouse right-click: one
// combined popover (reactions + actions) at the cursor, highlighting the
// bubble in place. A short arm delay on touch keeps the finger-lift from
// activating an item. No Radix menu: a programmatically-opened Radix DropdownMenu under the
// cursor swallowed the first click.
export function MessageActionSheet({
  open,
  onOpenChange,
  anchorPoint,        // {x,y} — mouse right-click position
  anchorEl,           // the pressed bubble / attachment DOM element (measured live on open)
  anchorRect,         // fallback rect captured at pointerdown, used only if anchorEl is gone
  attachment,         // the attachment tile that was pressed, if any
  isOwn = false,      // hug the bubble's side on touch
  actionProps,        // args for buildMessageActions (minus onReact)
  onQuickReact,       // (emoji) => void
  onOpenFullPicker,   // () => void
}) {
  const coarse = useCoarsePointer();
  const actions = buildMessageActions({ ...actionProps, onReact: undefined });
  const primary = actions.filter((a) => a.group === "primary");
  const danger = actions.filter((a) => a.group === "danger");
  // Attachment actions (copy image / copy link / download / open) merged into
  // the same menu when an image/file tile was the press target. useAttachmentUrl
  // is safe to call with undefined — it just stays disabled.
  const { data: attUrl } = useAttachmentUrl(attachment ?? undefined);
  const office = useOfficeActions();
  const attachmentActions = attachment ? buildAttachmentActions({ att: attachment, url: attUrl, office }) : [];

  const menuRef = useRef(null);
  const pillRef = useRef(null);
  const cloneHostRef = useRef(null);
  const [pos, setPos] = useState(null);
  const [lifted, setLifted] = useState(false);

  // Quiet in-place highlight on the pressed bubble while the menu is open —
  // replaces the old lifted/dimmed spotlight copy.
  useEffect(() => {
    if (!open || coarse || !anchorEl || !anchorEl.isConnected) return undefined;
    anchorEl.setAttribute("data-menu-open", "");
    return () => anchorEl.removeAttribute("data-menu-open");
  }, [open, coarse, anchorEl]);

  useLayoutEffect(() => {
    const host = cloneHostRef.current;
    if (!open) { setPos(null); setLifted(false); host?.replaceChildren(); return; }
    const menu = menuRef.current;
    if (!menu) return;
    const { top: safeTop, bottom: safeBottom } = getSafeAreaInsets();
    // Measure the menu (touch: the action card) at its natural height.
    menu.style.maxHeight = "none";
    const mr = menu.getBoundingClientRect();
    menu.style.maxHeight = "";
    const pr = pillRef.current?.getBoundingClientRect() ?? null;
    const liveEl = anchorEl && anchorEl.isConnected ? anchorEl : null;
    const measured = liveEl ? liveEl.getBoundingClientRect() : (anchorRect ?? null);
    const rect = measured
      ? { top: measured.top, bottom: measured.bottom, left: measured.left, right: measured.right }
      : null;

    // Touch: clone the real bubble (pixel-identical, zero re-render) and keep
    // it pinned exactly over the original.
    let didLift = false;
    if (coarse && host && liveEl && rect) {
      host.replaceChildren();
      const cs = getComputedStyle(liveEl);
      const zoom = parseFloat(cs.getPropertyValue("--chat-zoom")) || 1;
      for (const v of THEME_VARS) {
        const val = cs.getPropertyValue(v);
        if (val) host.style.setProperty(v, val.trim());
      }
      const clone = liveEl.cloneNode(true);
      for (const a of ["data-msg-bubble", "data-attachment-id", "data-menu-open"]) clone.removeAttribute(a);
      clone.style.margin = "0";
      clone.style.maxWidth = "none";
      clone.style.width = "100%";
      for (const media of clone.querySelectorAll("video,audio")) {
        media.removeAttribute("autoplay");
        media.setAttribute("preload", "none");
        try { media.pause?.(); } catch { /* detached node */ }
      }
      for (const withId of clone.querySelectorAll("[id]")) withId.removeAttribute("id");
      host.style.zoom = zoom === 1 ? "" : String(zoom);
      host.style.width = `${(rect.right - rect.left) / zoom}px`;
      host.appendChild(clone);
      didLift = true;
    }
    setLifted(didLift);

    if (coarse && pr) {
      setPos(computeSpotlightLayout({
        vw: window.innerWidth,
        vh: window.innerHeight,
        rect,
        pillSize: { width: pr.width, height: pr.height },
        cardSize: { width: mr.width, height: mr.height },
        isOwn,
        safeTop,
        safeBottom,
      }));
      return;
    }

    setPos(computeAnchoredMenuLayout({
      vw: window.innerWidth,
      vh: window.innerHeight,
      rect: coarse || !anchorPoint ? rect : null,
      anchorPoint: !coarse ? anchorPoint : null,
      size: { width: mr.width, height: mr.height },
      isOwn,
      safeTop,
      safeBottom,
    }));
  }, [open, anchorEl, anchorRect, anchorPoint, isOwn, coarse, attachmentActions.length, primary.length, danger.length]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Touch only: the popover opens while the finger is still down from the
  // long-press, so ignore pointer input on it for a beat — otherwise the lift
  // that ends the long-press activates whatever item is under it. A mouse
  // right-click produces no such synthetic click, so it stays live immediately.
  const [armed, setArmed] = useState(!coarse);
  useEffect(() => {
    if (!coarse) { setArmed(true); return undefined; }
    if (!open) { setArmed(false); return undefined; }
    setArmed(false);
    const t = setTimeout(() => setArmed(true), 220);
    return () => clearTimeout(t);
  }, [open, coarse]);

  if (!open) return null;

  function runAction(a) {
    if (a.disabled) return;
    onOpenChange(false);
    a.onSelect?.();
  }
  const close = () => onOpenChange(false);

  const surface = "glass-strong text-[hsl(var(--popover-foreground,var(--foreground)))] shadow-lg";
  const gate = armed ? "" : "pointer-events-none";

  const menuItem = (a, extra = "") => (
    <button
      key={a.key}
      type="button"
      disabled={a.disabled}
      onClick={() => runAction(a)}
      className={[
        "w-full flex items-center px-4 py-2.5 text-[13px] text-left hover:bg-[hsl(var(--muted))] active:bg-[hsl(var(--muted))] disabled:opacity-40 disabled:hover:bg-transparent",
        extra,
      ].join(" ")}
    >
      <a.icon className={`h-4 w-4 mr-3 shrink-0 ${a.iconClassName ?? ""}`} />{a.label}
    </button>
  );

  const reactionButtons = (size, plusSize) => (
    <>
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => { close(); onQuickReact?.(emoji); }}
          className={`${size} flex items-center justify-center rounded-full hover:bg-[hsl(var(--muted))] active:scale-90 transition`}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        aria-label="Mas emojis"
        onClick={() => { close(); onOpenFullPicker?.(); }}
        className={`${size} flex items-center justify-center rounded-full hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]`}
      >
        <Plus className={plusSize} />
      </button>
    </>
  );

  return createPortal(
    <div
      data-msg-action-menu
      className="fixed inset-0 z-200"
      role="dialog"
      aria-label="Acciones del mensaje"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Dismiss layer. Touch: dims + blurs the page (real bubble included);
          the lifted copy below sits on top, un-dimmed. Mouse: invisible. */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={close}
        className={["absolute inset-0 cursor-default", coarse ? "bg-black/55 backdrop-blur-[3px] motion-safe:animate-in motion-safe:fade-in-0 duration-150" : ""].join(" ")}
      />

      {coarse && (
        <div
          role="button"
          aria-label="Cerrar"
          onClick={close}
          className={["fixed", pos?.cropped ? "overflow-hidden rounded-[var(--chat-radius-bubble,1rem)]" : ""].join(" ")}
          style={{
            left: pos?.cloneLeft ?? -9999,
            top: pos?.cloneTop ?? -9999,
            width: pos?.cloneWidth ?? 0,
            height: pos?.cropped ? pos.cloneHeight : undefined,
            visibility: lifted && pos ? "visible" : "hidden",
          }}
        >
          <div
            ref={cloneHostRef}
            className={[
              "pointer-events-none **:pointer-events-none drop-shadow-[0_10px_28px_rgb(0_0_0/0.3)]",
              lifted && pos ? "chat-spotlight-rise" : "",
            ].join(" ")}
          />
        </div>
      )}

      {/* Touch: the reaction pill floats above the lifted bubble. */}
      {coarse && (
        <div
          ref={pillRef}
          style={{
            position: "fixed",
            left: pos?.pillLeft ?? -9999,
            top: pos?.pillTop ?? -9999,
            transformOrigin: `${isOwn ? "right" : "left"} bottom`,
            visibility: pos ? "visible" : "hidden",
          }}
          className={["flex items-center gap-0.5 px-1.5 py-1 rounded-full", pos ? "chat-menu-in" : "", surface, gate].join(" ")}
        >
          {reactionButtons("h-9 w-9 text-2xl", "h-5 w-5")}
        </div>
      )}

      {/* Touch: the action card below the bubble (scrolls when the layout caps
          it). Mouse: one menu with the reaction row on top. Hidden until
          positioned, and the entrance only starts then, so it never flashes at
          a corner before jumping into place. */}
      <div
        ref={menuRef}
        style={{
          position: "fixed",
          left: (coarse ? pos?.cardLeft : pos?.left) ?? -9999,
          top: (coarse ? pos?.cardTop : pos?.top) ?? -9999,
          maxHeight: coarse ? pos?.cardMaxHeight : pos?.maxHeight,
          transformOrigin: `${isOwn ? "right" : "left"} ${coarse ? "top" : pos?.originY ?? "top"}`,
          visibility: pos ? "visible" : "hidden",
        }}
        className={[
          "w-60 max-w-[calc(100vw-16px)] overflow-y-auto overflow-x-hidden overscroll-contain rounded-xl",
          pos ? "chat-menu-in" : "",
          surface,
          gate,
        ].join(" ")}
      >
        {!coarse && (
          <div className="flex items-center justify-between gap-0.5 px-1.5 py-1.5 border-b border-[hsl(var(--border))]">
            {reactionButtons("h-8 w-8 text-lg", "h-4 w-4")}
          </div>
        )}
        <div className="py-1">
          {primary.map((a) => menuItem(a))}
          {attachmentActions.length > 0 && (
            <>
              <div className="h-px bg-[hsl(var(--border))] my-1" />
              {attachmentActions.map((a) => menuItem(a))}
            </>
          )}
          {primary.length + attachmentActions.length > 0 && danger.length > 0 && (
            <div className="h-px bg-[hsl(var(--border))] my-1" />
          )}
          {danger.map((a) => menuItem(a, a.danger ? "text-red-500" : ""))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
