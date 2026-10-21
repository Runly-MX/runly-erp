// Route a call starts on when nothing else is connected: video calls are
// looked at (speaker), voice calls are held to the ear (earpiece).
export function defaultRouteId(routes, video) {
  const ids = routes.map((r) => r.id);
  if (ids.includes("bluetooth")) return "bluetooth";
  if (ids.includes("wired")) return "wired";
  if (video && ids.includes("speaker")) return "speaker";
  return ids.includes("earpiece") ? "earpiece" : ids[0] ?? null;
}

// Where the sound goes when the speaker is switched off.
export function nonSpeakerRouteId(routes) {
  const ids = routes.map((r) => r.id);
  return ["bluetooth", "wired", "earpiece"].find((id) => ids.includes(id)) ?? null;
}
