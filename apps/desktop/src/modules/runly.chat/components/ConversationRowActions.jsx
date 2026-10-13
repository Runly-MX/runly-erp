import { useEffect, useRef, useState } from "react";
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  SwipeableRow, ConfirmDialog, useIsMobile, useCoarsePointer,
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@runly/ui";
import { Archive, ArchiveRestore, MoreHorizontal } from "lucide-react";
import { buildConversationActions, fullSwipeAction } from "../lib/buildConversationActions.js";

// Wraps a single conversation row with per-platform affordances:
//   - touch  -> SwipeableRow (left = action tray, right = archive/unarchive)
//              + long-press bottom Sheet with the full action list
//   - pointer -> right-click ContextMenu with the full action list
// Both funnel through `onAction(action, conversation)` — one dispatcher owned
// by the list (ChatSidebar / FloatingChatHub) so all rows share one set of
// mutation hooks. Destructive actions (delete / leave) go through ConfirmDialog.
// `swipeOpenId` / `onSwipeOpen` keep only one row's tray open at a time.
//
// The two surfaces are mutually exclusive on purpose: Radix's ContextMenu has
// its own touch long-press handler, which would fight the SwipeableRow sheet on
// mobile — so on touch we render only the swipe layer.
export function ConversationRowActions({
  conversation,
  currentUserId,
  onAction,
  swipeOpenId = null,
  onSwipeOpen = null,
  children,
}) {
  // Touch surface = coarse pointer AND a narrow-ish viewport (a desktop with a
  // touchscreen keeps the right-click menu). Tablets land here.
  const coarse = useCoarsePointer();
  const narrow = useIsMobile(1024);
  const isTouch = coarse && narrow;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // pending destructive descriptor
  const confirmTimer = useRef(null);
  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  const actions = buildConversationActions(conversation, { currentUserId });
  const nonDestructive = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);

  function run(descriptor) {
    setSheetOpen(false);
    if (descriptor.destructive) {
      // Defer opening the ConfirmDialog until the ContextMenu / Sheet has
      // fully closed AND finished its exit animation. Mounting a second Radix
      // overlay while the first is still running its exit + focus-return +
      // scroll-lock cleanup leaves the app with a stuck `aria-hidden` /
      // `pointer-events: none` on <body> (right click stops working until a
      // reload).
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirm(descriptor), 220);
      return;
    }
    onAction?.(descriptor.action, conversation);
  }

  const confirmDialog = (
    <ConfirmDialog
      open={Boolean(confirm)}
      onOpenChange={(o) => !o && setConfirm(null)}
      title={confirm?.label ?? ""}
      description={
        confirm?.action === "leave"
          ? "Dejarás de recibir mensajes de esta conversación."
          : "Esta acción no se puede deshacer."
      }
      confirmLabel={confirm?.action === "leave" ? "Salir" : "Eliminar"}
      onConfirm={() => {
        const action = confirm?.action;
        setConfirm(null);
        if (action) onAction?.(action, conversation);
      }}
    />
  );

  // ---- Desktop: right-click context menu -------------------------------------
  if (!isTouch) {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div>{children}</div>
          </ContextMenuTrigger>
          <ContextMenuContent
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {nonDestructive.map((a) => {
              const Icon = a.icon;
              return (
                <ContextMenuItem key={a.key} onSelect={() => run(a)}>
                  {Icon && <Icon />}
                  {a.label}
                </ContextMenuItem>
              );
            })}
            {destructive.length > 0 && <ContextMenuSeparator />}
            {destructive.map((a) => {
              const Icon = a.icon;
              return (
                <ContextMenuItem
                  key={a.key}
                  onSelect={() => run(a)}
                  className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
                >
                  {Icon && <Icon />}
                  {a.label}
                </ContextMenuItem>
              );
            })}
          </ContextMenuContent>
        </ContextMenu>
        {confirmDialog}
      </>
    );
  }

  // ---- Touch: swipe + long-press sheet -------------------------------------
  const swipeActions = nonDestructive.slice(0, 2).map((a) => ({
    key: a.key,
    label: a.label,
    icon: a.icon,
    tone: a.tone,
    onSelect: () => run(a),
  }));
  swipeActions.push({
    key: "more",
    label: "Más",
    icon: MoreHorizontal,
    tone: "default",
    onSelect: () => setSheetOpen(true),
  });

  const swipingArchived = fullSwipeAction(conversation) === "unarchive";

  return (
    <>
      <SwipeableRow
        rightActions={swipeActions}
        onFullSwipeRight={() => onAction?.(fullSwipeAction(conversation), conversation)}
        fullSwipeLabel={swipingArchived ? "Desarchivar" : "Archivar"}
        fullSwipeIcon={swipingArchived ? ArchiveRestore : Archive}
        fullSwipeTone="primary"
        onLongPress={() => setSheetOpen(true)}
        open={swipeOpenId === conversation.id}
        onOpenChange={(o) => onSwipeOpen?.(o ? conversation.id : null)}
      >
        {children}
      </SwipeableRow>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="gap-1 p-2 pb-4">
          <SheetHeader className="px-3 pt-2 pb-1">
            <SheetTitle className="text-sm truncate">
              {conversation.title ?? "Conversación"}
            </SheetTitle>
          </SheetHeader>
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => run(a)}
                className={[
                  "flex items-center gap-3 w-full px-3 py-3 rounded-md text-sm text-left transition-colors touch-manipulation",
                  a.destructive
                    ? "text-red-600 dark:text-red-400 hover:bg-red-500/10"
                    : "hover:bg-[hsl(var(--muted))]",
                ].join(" ")}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                {a.label}
              </button>
            );
          })}
        </SheetContent>
      </Sheet>

      {confirmDialog}
    </>
  );
}
