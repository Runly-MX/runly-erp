import { useEffect, useRef, useState } from "react";

// Signed URLs stay valid for an hour: keep them for 50 minutes so paging back,
// re-sorting or re-rendering never asks again, and share in-flight requests.
const URL_TTL_MS = 50 * 60 * 1000;
const urlCache = new Map();

export function cachedUrl(key, load) {
  const hit = urlCache.get(key);
  if (hit && Date.now() - hit.at < URL_TTL_MS) return hit.promise;
  const promise = load().then((url) => {
    if (!url) urlCache.delete(key);
    return url;
  });
  urlCache.set(key, { at: Date.now(), promise });
  return promise;
}

// True once the element is (about to be) on screen; stays true afterwards.
export function useInView(rootMargin = "200px") {
  const ref = useRef(null);
  const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (inView || !node) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setInView(true);
        observer.disconnect();
      }
    }, { rootMargin });
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView];
}
