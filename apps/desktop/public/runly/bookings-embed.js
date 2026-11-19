/* Runly Reservaciones: resizes <iframe data-runly-booking> to its content on any website.
   It only listens: messages are accepted from the portal's own origin (where this script
   is served) and from an iframe of this page. Nothing is read from or sent to the page. */
(function () {
  var script = document.currentScript;
  if (!script || window.__runlyBookingEmbed) return;
  window.__runlyBookingEmbed = true;
  var origin;
  try { origin = new URL(script.src).origin; } catch (e) { return; }
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data || event.data.type !== "runly-booking:height") return;
    var height = Math.max(360, Math.min(4000, Math.ceil(Number(event.data.height) || 0)));
    var frames = document.querySelectorAll("iframe[data-runly-booking]");
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) frames[i].style.height = height + "px";
    }
  });
})();
