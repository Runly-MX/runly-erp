import { useRef } from "react";
import { useCopyValue } from "../hooks/useCopyValue.js";
import { cn } from "../lib/utils.js";

const INTERACTIVE = "a,button,input,textarea,select,[role='button'],[contenteditable='true']";

// Double click copies the displayed value (or `text`) and shows a toast.
// Links, buttons and inputs inside keep their normal behavior; blank values
// ("—") are ignored. The text stays selectable so users can drag-select and
// copy several values at once.
export function CopyOnDoubleClick({ text, className, children, as: Tag = "span" }) {
  const ref = useRef(null);
  const copy = useCopyValue();

  const onDoubleClick = (event) => {
    if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
    void copy(text ?? ref.current?.textContent);
  };

  return (
    <Tag ref={ref} title="Doble clic para copiar" onDoubleClick={onDoubleClick} className={cn("select-text", className)}>
      {children}
    </Tag>
  );
}
