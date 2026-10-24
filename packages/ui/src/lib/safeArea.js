// Custom properties retain CSS math (max/calc), even in getComputedStyle.
// Resolve them on a length property before passing insets to JS layout code.
export function getSafeAreaInsets() {
  if (typeof document === "undefined" || !document.body) {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;" +
    "padding-top:var(--sat, 0px);padding-bottom:var(--sab, 0px);" +
    "padding-left:var(--sal, 0px);padding-right:var(--sar, 0px);";
  probe.setAttribute("aria-hidden", "true");
  document.body.appendChild(probe);
  try {
    const style = getComputedStyle(probe);
    return {
      top: parseFloat(style.paddingTop) || 0,
      bottom: parseFloat(style.paddingBottom) || 0,
      left: parseFloat(style.paddingLeft) || 0,
      right: parseFloat(style.paddingRight) || 0,
    };
  } finally {
    probe.remove();
  }
}
