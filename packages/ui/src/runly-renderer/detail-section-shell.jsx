// packages/ui/src/runly-renderer/detail-section-shell.jsx
//
// Card + title header for one RunlyDetail section. When the section is
// `collapsible`, the header becomes a toggle; `defaultCollapsed: "mobile"`
// starts collapsed only on small screens (long lists like permission trees).
import { useState } from "react";
import * as LucideIcons from "lucide-react";
import { ChevronDown, Copy } from "lucide-react";
import { cn } from "../lib/utils.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useCopyValue } from "../hooks/useCopyValue.js";

// `copyText` (optional) adds a "Copiar" button that copies the whole card.
export function DetailSectionShell({ section, className, children, copyText }) {
  const copy = useCopyValue();
  const isMobile = useIsMobile(1024);
  const [collapsed, setCollapsed] = useState(() =>
    section.defaultCollapsed === "mobile" ? isMobile : section.defaultCollapsed === true,
  );
  const collapsible = section.collapsible === true;
  const isOpen = !collapsible || !collapsed;
  const SectionIcon = section.icon ? LucideIcons[section.icon] : null;

  const titleContent = (
    <>
      {SectionIcon ? (
        <SectionIcon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" />
      ) : null}
      <h4 className="text-sm font-semibold text-[hsl(var(--foreground))]">
        {section.title}
      </h4>
    </>
  );

  const copyButton = copyText ? (
    <button
      type="button"
      aria-label={`Copiar ${section.title ?? "sección"}`}
      title="Copiar todo"
      onClick={() => void copy(copyText)}
      className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] pointer-coarse:h-11 pointer-coarse:w-11"
    >
      <Copy className="h-3.5 w-3.5" />
    </button>
  ) : null;

  return (
    <div className={cn("glass-shell-flat min-w-0 [overflow-wrap:anywhere] rounded-xl px-5 py-4", isOpen && "space-y-4", className)}>
      {section.title ? (
        collapsible ? (
          <div className={cn("flex items-center gap-2", isOpen && "pb-3 border-b border-[hsl(var(--border))]")}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={isOpen}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              {titleContent}
              <ChevronDown
                className={cn(
                  "ml-auto h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-150",
                  isOpen && "rotate-180",
                )}
              />
            </button>
            {copyButton ? <span className="[&>button]:ml-0">{copyButton}</span> : null}
          </div>
        ) : (
          <div className="pb-3 border-b border-[hsl(var(--border))] flex items-center gap-2">
            {titleContent}
            {copyButton}
          </div>
        )
      ) : null}
      {isOpen ? children : null}
    </div>
  );
}
