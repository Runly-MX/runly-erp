import { useEffect, useMemo, useState } from "react";
import { useBootLoaderStore } from "../stores/bootLoader";
import { AppLoader } from "./AppLoader";

// Mounted once at a fixed position in the tree (see AppEntry.jsx) so it
// survives every boot-phase transition instead of being unmounted and
// remounted alongside the gate that currently needs it.
export function BootLoaderOverlay() {
  const reasons = useBootLoaderStore((s) => s.reasons);
  const message = useMemo(() => {
    for (const value of reasons.values()) {
      if (typeof value === "string") return value;
    }
    return undefined;
  }, [reasons]);

  const active = reasons.size > 0;
  // Gates hand off with a one-render gap where no reason is active; hiding
  // immediately would unmount the loader and restart its animation.
  const [visible, setVisible] = useState(active);
  useEffect(() => {
    if (active) {
      setVisible(true);
      return undefined;
    }
    const t = setTimeout(() => setVisible(false), 250);
    return () => clearTimeout(t);
  }, [active]);

  if (!active && !visible) return null;
  return <AppLoader message={message} />;
}
