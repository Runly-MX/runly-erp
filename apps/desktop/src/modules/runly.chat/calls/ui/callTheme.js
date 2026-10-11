// Shared look for the call room: avatar colors, roles and small helpers.

// Brand-friendly avatar tints (bg / text), picked deterministically from an id.
const AVATAR_TINTS = [
  ["rgba(253, 96, 22, 0.22)", "#ffb38a"],
  ["rgba(56, 189, 248, 0.20)", "#a5e4ff"],
  ["rgba(52, 211, 153, 0.20)", "#a7f3d0"],
  ["rgba(251, 191, 36, 0.20)", "#fde68a"],
  ["rgba(244, 114, 182, 0.20)", "#fbcfe8"],
  ["rgba(129, 140, 248, 0.22)", "#c7d2fe"],
  ["rgba(45, 212, 191, 0.20)", "#99f6e4"],
  ["rgba(232, 121, 249, 0.20)", "#f5d0fe"],
];

export function avatarTint(seed = "") {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const [bg, fg] = AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
  return { backgroundColor: bg, color: fg };
}

export function initialsOf(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
}

export function isGuestIdentity(identity) {
  return typeof identity === "string" && identity.startsWith("guest_");
}

export function isScreenIdentity(identity) {
  return typeof identity === "string" && identity.startsWith("screen:");
}

export function formatClock(totalSeconds = 0) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
