import { useEffect, useRef } from "react";
import { Button } from "@runly/ui";

// Infinite scroll for the list view: asks for the next page when this block
// nears the viewport; the button is the fallback if IntersectionObserver is missing.
export function FilesLoadMore({ onLoadMore, loading }) {
  const ref = useRef(null);
  const latest = useRef({ onLoadMore, loading });
  latest.current = { onLoadMore, loading };
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !latest.current.loading) latest.current.onLoadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);
  return (
    <div ref={ref} className="flex justify-center">
      <Button variant="outline" size="sm" onClick={onLoadMore} loading={loading}>
        Cargar más
      </Button>
    </div>
  );
}
