import { useId } from "react";
import { cn } from "../lib/utils.js";
import "./MiraiAvatar.css";

// MirAI's identity mark: a brand-tinted orb (it follows --brand-primary, so
// every instance's MirAI wears that company's color) with a friendly glass
// visor face, an AI spark and an orbit ring — "an assistant that lives
// inside every module". Pure SVG: crisp at any size, light and dark themes.
// `size` is in px; `animated` adds a slow blink + spark twinkle (disabled
// under prefers-reduced-motion).
export function MiraiAvatar({ size = 40, animated = false, className, title = "MirAI", ...props }) {
  const uid = useId().replace(/:/g, "");
  const orb = `mirai-orb-${uid}`;
  const shine = `mirai-shine-${uid}`;
  const visor = `mirai-visor-${uid}`;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={cn("shrink-0", animated && "mirai-avatar-animated", className)}
      {...props}
    >
      <defs>
        <radialGradient id={orb} cx="35%" cy="28%" r="80%">
          <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--brand-primary, #7c3aed) 55%, white)" }} />
          <stop offset="55%" style={{ stopColor: "var(--brand-primary, #7c3aed)" }} />
          <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--brand-primary, #7c3aed) 70%, black)" }} />
        </radialGradient>
        <linearGradient id={shine} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={visor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.97" />
          <stop offset="100%" stopColor="#eef0f7" stopOpacity="0.92" />
        </linearGradient>
      </defs>

      {/* Orbit ring behind the orb */}
      <ellipse cx="60" cy="64" rx="56" ry="17" fill="none" stroke="var(--brand-primary, #7c3aed)" strokeOpacity="0.28" strokeWidth="3" transform="rotate(-16 60 64)" />

      {/* Orb */}
      <circle cx="60" cy="60" r="44" fill={`url(#${orb})`} />
      <ellipse cx="50" cy="34" rx="26" ry="13" fill={`url(#${shine})`} />

      {/* Front arc of the orbit, over the orb */}
      <path d="M8 79 A56 17 -16 0 0 112 49" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" transform="rotate(0)" />

      {/* Glass visor with the face */}
      <rect x="30" y="47" width="60" height="32" rx="16" fill={`url(#${visor})`} />
      <g className="mirai-eyes" fill="#1f2340">
        <rect x="45" y="56" width="7" height="12" rx="3.5" />
        <rect x="68" y="56" width="7" height="12" rx="3.5" />
      </g>
      <path d="M54 72 Q60 76.5 66 72" fill="none" stroke="#1f2340" strokeWidth="2.6" strokeLinecap="round" />

      {/* AI spark */}
      <path
        className="mirai-spark"
        d="M93 14 C94.4 21.6 97.4 24.6 105 26 C97.4 27.4 94.4 30.4 93 38 C91.6 30.4 88.6 27.4 81 26 C88.6 24.6 91.6 21.6 93 14 Z"
        fill="#fff"
        stroke="var(--brand-primary, #7c3aed)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="107" cy="42" r="3" fill="var(--brand-primary, #7c3aed)" fillOpacity="0.55" />
    </svg>
  );
}
