import { Link2 } from "lucide-react";
import { ENTITY_TOKEN_SOURCE } from "./entityTokenParse.js";

export { ENTITY_TOKEN_SOURCE, parseEntityTokens, stripEntityTokens } from "./entityTokenParse.js";

const CHIP_CLASS =
  "inline-flex items-center gap-1 align-baseline rounded px-1 text-sm font-medium text-(--brand-primary) bg-(--brand-primary)/10";

// Non-interactive fallback (conversation previews, forward dialogs...).
export function PlainEntityChip({ name }) {
  return (
    <span className={CHIP_CLASS}>
      <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      {name}
    </span>
  );
}

// The app registers an interactive chip (hover/tap preview, navigation) so
// this package stays free of API calls.
let entityTokenRenderer = null;

export function setEntityTokenRenderer(renderer) {
  entityTokenRenderer = renderer;
}

export function renderEntityToken({ entityType, recordId, name }, key) {
  const Custom = entityTokenRenderer;
  return Custom
    ? <Custom key={key} entityType={entityType} recordId={recordId} name={name} />
    : <PlainEntityChip key={key} name={name} />;
}
