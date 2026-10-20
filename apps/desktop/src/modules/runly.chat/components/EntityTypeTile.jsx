import { useState } from "react";
import { useFileRefSignedUrl } from "../hooks/useFileRefSignedUrl";
import { useEntityBranding } from "../hooks/useEntityBranding";

const initialsOf = (name) => String(name ?? "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

// Square/round visual for a connector record: its photo or cover when it has
// one, initials for people, otherwise the module icon on a tinted tile. Same
// tile in the cards, the picker rows and the hover preview.
export function EntityTypeTile({ reference, size = 36, className = "" }) {
  const [failed, setFailed] = useState(false);
  const { Icon, color } = useEntityBranding()(reference.entityType);
  const isPerson = reference.entityType === "contact" || reference.entityType === "hr_employee";
  const fileId = reference.photoFileId ?? reference.avatarFileId ?? reference.coverImageFileId ?? null;
  const { data: url } = useFileRefSignedUrl(fileId, "card", Boolean(fileId));
  const radius = isPerson ? "rounded-full" : "rounded-lg";
  const box = { width: size, height: size };
  const initials = isPerson ? initialsOf(reference.title ?? reference.label) : "";

  if (url && !failed) {
    return <img src={url} alt="" style={box} className={`${radius} object-cover shrink-0 ${className}`} onError={() => setFailed(true)} />;
  }
  return (
    <span
      style={{ ...box, color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
      className={`${radius} flex items-center justify-center shrink-0 font-semibold select-none ${className}`}
      aria-hidden="true"
    >
      {initials
        ? <span style={{ fontSize: Math.round(size * 0.38) }}>{initials}</span>
        : <Icon style={{ width: size * 0.5, height: size * 0.5 }} />}
    </span>
  );
}
