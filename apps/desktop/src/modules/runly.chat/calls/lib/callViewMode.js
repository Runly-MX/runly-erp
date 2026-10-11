// Pure layout decisions for the call room — no React, no DOM.
//
// Views:
//  - "inperson"     in-person recorder (one device recording a room)
//  - "presentation" someone shares a screen: the screen is the stage
//  - "direct"       1:1 with video: one big tile + a draggable self PiP
//  - "audio"        1:1 (or solo) without video: big avatars
//  - "focus"        one big speaker + a filmstrip of everyone else
//  - "grid"         best-fit grid of everyone (paginated past a page size)

export const LAYOUT_PREFS = ["auto", "focus", "grid"];

export function resolveCallView({
  participantCount = 1,
  hasScreenShare = false,
  isVideoActive = false,
  layoutPref = "auto",
  pinnedIdentity = null,
  inPerson = false,
  isPhone = false,
}) {
  if (inPerson) return "inperson";
  const pref = LAYOUT_PREFS.includes(layoutPref) ? layoutPref : "auto";
  if (hasScreenShare && pref !== "grid") return "presentation";
  if (pref === "grid") return "grid";
  if (participantCount <= 2 && !isVideoActive) return "audio";
  if (pref === "focus") return participantCount === 2 ? "direct" : "focus";
  if (pinnedIdentity) return "focus";
  if (participantCount === 2) return "direct";
  // A phone can't fit more than four useful tiles: speaker + carousel instead.
  if (isPhone && participantCount > 4) return "focus";
  return "grid";
}

// Viewport class used by the room chrome. `width`/`height` are the window's.
export function resolveViewport({ width = 1440, height = 900, coarse = false }) {
  const landscape = width > height;
  const shortSide = Math.min(width, height);
  if (shortSide < 600 && (coarse || width < 1024)) return landscape ? "phone-landscape" : "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

// Whether the controls fade out until the stage is tapped. Only landscape
// phones, where the video needs every pixel; in portrait the controls stay
// (people reach for "Silenciar" without hunting for them).
export function shouldAutoHideChrome({ viewport, view }) {
  if (view === "inperson") return false;
  return viewport === "phone-landscape";
}
