(function bootstrapPwaManifest() {
  if (window.__RUNLY_NATIVE_HOST__) return;
  var match = window.location.pathname.match(/^\/app\/m\/([^/]+)/);
  var moduleKey = match ? match[1] : "";
  var isAttendancePhone = window.location.pathname.indexOf("/app/p/attendance/phone") === 0;
  var searchParams = new URLSearchParams(window.location.search || "");
  var link = document.createElement("link");

  window.__RUNLY_PWA_BOOTSTRAP__ = {
    moduleKey: moduleKey,
    installRequested: searchParams.get("pwa-install") === "1",
  };

  if (!link.dataset) link.dataset = {};
  link.rel = "manifest";
  link.href = isAttendancePhone
    ? "/attendance-phone.webmanifest"
    : moduleKey
      ? "/pwa/manifest/" + encodeURIComponent(moduleKey) + ".webmanifest"
      : "/site.webmanifest";
  link.dataset.moduleKey = moduleKey;
  document.head.appendChild(link);

  if (typeof document.querySelector === "function") {
    var touchIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (touchIcon) {
      touchIcon.href = isAttendancePhone
        ? "/apple-touch-icon.png"
        : moduleKey
        ? "/pwa/icon/" + encodeURIComponent(moduleKey) + "/192.png"
        : "/apple-touch-icon.png";
    }
  }
})();
