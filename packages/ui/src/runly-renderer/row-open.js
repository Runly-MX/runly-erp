// Opt-in "open the record" gesture for RunlyTable rows / cards: double click or
// Enter on the focused row. Gestures that start on interactive children
// (links, buttons, checkboxes, inputs, menus) are ignored.
const INTERACTIVE = "a,button,input,textarea,select,label,[role='button'],[role='checkbox'],[role='menuitem'],[contenteditable='true']";

export function isInteractiveTarget(target) {
  return typeof Element !== "undefined" && target instanceof Element && Boolean(target.closest(INTERACTIVE));
}

// Ctrl/Cmd + click or middle click: the browser convention for "open in a new tab".
export function isNewTabClick(event) {
  return event.ctrlKey || event.metaKey || event.button === 1;
}

export function openInNewTab(href) {
  if (typeof window !== "undefined" && href) window.open(href, "_blank", "noopener");
}

// Props to spread on the row element; empty when onRowOpen is not set. With
// `href` (the record's own URL) Ctrl/Cmd + click and middle click open it in a new tab.
export function rowOpenProps(onRowOpen, row, href = null) {
  if (typeof onRowOpen !== "function") return {};
  return {
    tabIndex: 0,
    ...(href ? {
      onClick: (event) => {
        if (!isNewTabClick(event) || isInteractiveTarget(event.target)) return;
        event.preventDefault();
        window.getSelection?.()?.removeAllRanges();
        openInNewTab(href);
      },
      onAuxClick: (event) => {
        if (event.button !== 1 || isInteractiveTarget(event.target)) return;
        event.preventDefault();
        openInNewTab(href);
      },
    } : {}),
    onDoubleClick: (event) => {
      if (isInteractiveTarget(event.target)) return;
      window.getSelection?.()?.removeAllRanges();
      onRowOpen(row);
    },
    onKeyDown: (event) => {
      if (event.key !== "Enter" || event.target !== event.currentTarget) return;
      event.preventDefault();
      onRowOpen(row);
    },
  };
}
