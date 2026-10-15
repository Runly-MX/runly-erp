// Opt-in "open the record" gesture for RunlyTable rows / cards: double click or
// Enter on the focused row. Gestures that start on interactive children
// (links, buttons, checkboxes, inputs, menus) are ignored.
const INTERACTIVE = "a,button,input,textarea,select,label,[role='button'],[role='checkbox'],[role='menuitem'],[contenteditable='true']";

export function isInteractiveTarget(target) {
  return typeof Element !== "undefined" && target instanceof Element && Boolean(target.closest(INTERACTIVE));
}

// Props to spread on the row element; empty when onRowOpen is not set.
export function rowOpenProps(onRowOpen, row) {
  if (typeof onRowOpen !== "function") return {};
  return {
    tabIndex: 0,
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
