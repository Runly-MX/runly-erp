import { useEffect, useState } from "react";

function useIsDark() {
  const [dark, setDark] = useState(
    () => document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark"))
    );
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => obs.disconnect();
  }, []);
  return dark;
}

// Fetched once per theme variant and cached for the life of the tab — the
// source files are ~1.4MB of hand-tuned inline SVG, not worth re-fetching
// every time the loader mounts (route guards mount/unmount it often).
const LOADER_CACHE = new Map();

function loadLoaderMarkup(src) {
  if (!LOADER_CACHE.has(src)) {
    LOADER_CACHE.set(
      src,
      fetch(src)
        .then((res) => res.text())
        .then((text) => {
          const doc = new DOMParser().parseFromString(text, "text/html");
          return {
            style: doc.querySelector("style")?.textContent ?? "",
            markup: doc.querySelector("body > div")?.outerHTML ?? "",
          };
        })
    );
  }
  return LOADER_CACHE.get(src);
}

/**
 * Full-screen boot/route-transition loader. Injects the official Runly
 * loader animation (hand-built HTML/CSS/SVG, apps/desktop/public/runly/)
 * straight into this page's DOM rather than framing it — porting its
 * multi-layer SVG draw/flood/glow animation into JSX by hand would balloon
 * this file and duplicate ~1.4MB of markup in the JS bundle for no benefit.
 * The source file's own <script> (re-syncs all rl3-* animations to one
 * cycle) isn't executed via innerHTML, so that behavior is reimplemented
 * below instead of injected.
 */
export function AppLoader({ message = "Iniciando Runly ERP..." }) {
  const dark = useIsDark();
  const src = dark ? "/runly/runly-loader-dark.html" : "/runly/runly-loader.html";
  const [content, setContent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setContent(null);
    loadLoaderMarkup(src).then((data) => {
      if (!cancelled) setContent(data);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    if (!content) return undefined;

    function sync() {
      const t = document.timeline.currentTime;
      document.getAnimations().forEach((a) => {
        if (typeof a.animationName === "string" && a.animationName.indexOf("rl3-") === 0) {
          try {
            a.startTime = t;
          } catch {
            // animation already finished/removed — nothing to sync
          }
        }
      });
    }
    if (document.fonts?.ready) document.fonts.ready.then(sync);
    const timer = setTimeout(sync, 60);
    return () => clearTimeout(timer);
  }, [content]);

  // Separate from the sync effect: a message change must not restart the animation.
  useEffect(() => {
    const msgEl = document.getElementById("rl3-msg");
    if (msgEl) msgEl.textContent = message;
  }, [content, message]);

  return (
    <div className="fixed inset-0 z-200">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />
      {content && <style>{content.style}</style>}
      {content && (
        <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: content.markup }} />
      )}
    </div>
  );
}
