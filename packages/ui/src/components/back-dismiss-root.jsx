import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { overlayHistoryEnabled, registerOverlay } from "../lib/overlayHistory.js";

// Radix dialog root that also closes on the system back gesture (touch/phone).
// Shared by Dialog and Sheet so every modal in the platform behaves the same.
export function BackDismissRoot({ open: openProp, defaultOpen = false, onOpenChange, ...props }) {
  const controlled = openProp !== undefined;
  const [inner, setInner] = useState(defaultOpen);
  const open = controlled ? openProp : inner;

  const handleOpenChange = useCallback(
    (value) => {
      if (!controlled) setInner(value);
      onOpenChange?.(value);
    },
    [controlled, onOpenChange],
  );
  const handleRef = useRef(handleOpenChange);
  handleRef.current = handleOpenChange;

  useEffect(() => {
    if (!open || !overlayHistoryEnabled()) return undefined;
    return registerOverlay(() => handleRef.current(false));
  }, [open]);

  return <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} {...props} />;
}
