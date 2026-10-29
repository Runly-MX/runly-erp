import { useLayoutEffect, useRef, useState } from "react";

// Measures the floating chrome ChatWindow lays over the message list (header
// stack on top, composer at the bottom) and exposes the heights as CSS
// variables, so the list pads its content by exactly that much and messages
// can scroll underneath the glass without ever ending up hidden behind it.
export function useOverlayInsets(mounted = true) {
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const top = Math.round(topRef.current?.offsetHeight ?? 0);
      const bottom = Math.round(bottomRef.current?.offsetHeight ?? 0);
      setInsets((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (topRef.current) observer.observe(topRef.current);
    if (bottomRef.current) observer.observe(bottomRef.current);
    return () => observer.disconnect();
    // The overlay wrappers stay mounted while `mounted` holds, so observing
    // once per mount is enough.
  }, [mounted]);

  const style = {
    "--chat-inset-top": `${insets.top}px`,
    "--chat-inset-bottom": `${insets.bottom}px`,
  };
  return { topRef, bottomRef, style };
}
