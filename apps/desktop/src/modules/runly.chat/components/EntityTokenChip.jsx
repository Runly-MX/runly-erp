import { useNavigate } from "react-router-dom";
import { setEntityTokenRenderer } from "@runly/ui";
import { ENTITY_TYPE_BY_VALUE, entityTypeColor } from "../lib/entityReferenceTypes";
import { EntityPreviewPopover } from "./EntityPreviewPopover";
import { useEntityUrl } from "../hooks/useEntityUrl";

// Inline #[type:id:Name] link inside a message: looks like a hyperlink,
// previews on hover/tap, opens the record on click.
export function EntityTokenChip({ entityType, recordId, name }) {
  const navigate = useNavigate();
  const Icon = ENTITY_TYPE_BY_VALUE[entityType]?.Icon;
  const color = entityTypeColor(entityType);
  const getUrl = useEntityUrl(entityType, recordId);
  return (
    <EntityPreviewPopover entityType={entityType} recordId={recordId}>
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          const url = await getUrl();
          if (url) navigate(url);
        }}
        className="inline-flex max-w-full items-center gap-1 rounded px-1 align-baseline text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
        <span className="truncate">{name}</span>
      </button>
    </EntityPreviewPopover>
  );
}

// Registered once; message rendering (renderRichText) picks it up.
setEntityTokenRenderer(EntityTokenChip);
