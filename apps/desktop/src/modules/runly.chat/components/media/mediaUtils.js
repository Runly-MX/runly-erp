import { useEffect, useState } from "react";

// [{ key, label, items }] by calendar month, newest first (input is already
// sorted newest first). Labels read "Octubre 2026".
export function groupByMonth(items, getDate) {
  const groups = [];
  let current = null;
  for (const item of items) {
    const date = new Date(getDate(item));
    const key = Number.isNaN(date.getTime()) ? "unknown" : `${date.getFullYear()}-${date.getMonth()}`;
    if (!current || current.key !== key) {
      const raw = Number.isNaN(date.getTime())
        ? "Sin fecha"
        : date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
      current = { key, label: raw.charAt(0).toUpperCase() + raw.slice(1), items: [] };
      groups.push(current);
    }
    current.items.push(item);
  }
  return groups;
}

export function formatShortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;

// One entry per URL found in a message body (a message can carry several).
export function extractLinks(message) {
  const found = String(message?.body ?? "").match(URL_RE) ?? [];
  return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))].map((url, i) => {
    let host = url;
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep raw */ }
    return { key: `${message.id}:${i}`, url, host, message };
  });
}

// True once the element has come near the viewport (and stays true), so
// thumbnails/signed URLs are only requested for tiles the user can see.
export function useInView(rootMargin = "300px") {
  const [node, setNode] = useState(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!node || inView) return undefined;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setInView(true);
    }, { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, inView, rootMargin]);
  return [setNode, inView];
}

// Calls `onReach` when the sentinel nears the viewport — infinite scroll.
export function useLoadMoreSentinel({ hasMore, loading, onReach }) {
  const [node, setNode] = useState(null);
  useEffect(() => {
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loading) onReach();
    }, { rootMargin: "500px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, hasMore, loading, onReach]);
  return setNode;
}
