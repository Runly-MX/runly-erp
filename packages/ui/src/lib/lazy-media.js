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

export function forgetUrl(key) {
  urlCache.delete(key);
}

// One shared IntersectionObserver per margin (a grid can hold thousands of
// tiles; one observer each is costly). Unlike useInView this is NOT sticky:
// `near` flips back to false when the tile scrolls far away so the caller can
// drop the <img> and let the browser free the decoded bitmap.
const observers = new Map();
function sharedObserver(rootMargin) {
  let entry = observers.get(rootMargin);
  if (!entry) {
    const callbacks = new Map();
    const observer = new IntersectionObserver((records) => {
      for (const record of records) callbacks.get(record.target)?.(record.isIntersecting);
    }, { rootMargin });
    entry = { observer, callbacks };
    observers.set(rootMargin, entry);
  }
  return entry;
}

export function useNearViewport(rootMargin = "600px") {
  const ref = useRef(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const { observer, callbacks } = sharedObserver(rootMargin);
    callbacks.set(node, setNear);
    observer.observe(node);
    return () => {
      callbacks.delete(node);
      observer.unobserve(node);
    };
  }, [rootMargin]);
  return [ref, near];
}

// Coalesces single lookups into batched requests: every id asked for within
// `delay` ms goes out as one fetchMany(ids, variant) call (max `size` ids,
// the files API accepts 50). Returns (id, variant) => Promise<url | null>.
export function createUrlBatcher(fetchMany, { delay = 20, size = 50 } = {}) {
  const queues = new Map();
  const flush = (variant) => {
    const queue = queues.get(variant);
    queues.delete(variant);
    if (!queue) return;
    const ids = [...queue.keys()];
    for (let i = 0; i < ids.length; i += size) {
      const chunk = ids.slice(i, i + size);
      Promise.resolve(fetchMany(chunk, variant))
        .then((map) => chunk.forEach((id) => queue.get(id).forEach((waiter) => waiter.resolve(map?.[id] ?? null))))
        .catch(() => chunk.forEach((id) => queue.get(id).forEach((waiter) => waiter.resolve(null))));
    }
  };
  return (id, variant) => new Promise((resolve) => {
    let queue = queues.get(variant);
    if (!queue) {
      queue = new Map();
      queues.set(variant, queue);
      setTimeout(() => flush(variant), delay);
    }
    if (!queue.has(id)) queue.set(id, []);
    queue.get(id).push({ resolve });
  });
}
