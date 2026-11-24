// React host for an isolated custom component (experimental, F1B Stage 3).
// Mounts the sandboxed frame through mountIsolatedComponent and revokes it
// (closes the channel, removes the frame) on unmount and whenever the company
// or the session changes, so a component never keeps talking to the host on
// behalf of a previous company or a signed-out user.
import { useEffect, useRef } from "react";
import { mountIsolatedComponent } from "./isolated-frame-host.js";

export function IsolatedComponent({ src, title, companyId, sessionKey, allowedOperations, call, className = "h-64 w-full" }) {
  const containerRef = useRef(null);
  const callRef = useRef(call);
  callRef.current = call;
  const operationsKey = (allowedOperations ?? []).join(",");

  useEffect(() => {
    if (!containerRef.current || !src || !companyId || !sessionKey) return undefined;
    const mounted = mountIsolatedComponent({
      container: containerRef.current,
      src,
      title,
      allowedOperations: operationsKey ? operationsKey.split(",") : [],
      capabilities: { call: (op, args) => callRef.current(op, args) },
    });
    return () => mounted.revoke();
  }, [src, title, companyId, sessionKey, operationsKey]);

  return <div ref={containerRef} className={className} data-isolated-component={title} />;
}
