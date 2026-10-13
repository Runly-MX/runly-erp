import { useState } from "react";
import { cn } from "@runly/ui";
import { avatarTint, initialsOf } from "./callTheme";

const SIZES = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-10 w-10 text-sm",
  md: "h-16 w-16 text-xl",
  lg: "h-24 w-24 text-3xl",
  xl: "h-32 w-32 text-4xl",
};

// Round avatar for the call room: photo when there is one, tinted initials
// otherwise; a soft pulse while the person is speaking.
export function CallAvatar({ name, seed, url = null, size = "md", speaking = false, className = "" }) {
  // Keyed by URL: a failed signed URL must not hide a later, valid one.
  const [brokenUrl, setBrokenUrl] = useState(null);
  const showImage = url && brokenUrl !== url;
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold ring-1 ring-white/10",
        SIZES[size] ?? SIZES.md,
        speaking && "call-avatar-speaking ring-2 ring-(--call-speaking)",
        className,
      )}
      style={showImage ? undefined : avatarTint(seed ?? name ?? "")}
      aria-hidden
    >
      {showImage ? (
        <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBrokenUrl(url)} draggable={false} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}
