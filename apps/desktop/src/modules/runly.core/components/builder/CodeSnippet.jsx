// A short block of code or a URL with a copy button (the clipboard may be
// unavailable: the text stays selectable).
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeSnippet({ value, label, className = "" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked: the text can still be selected */ }
  };
  return (
    <div className={`relative rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 ${className}`}>
      <pre className="overflow-x-auto whitespace-pre-wrap break-all p-3 pr-12 font-mono text-xs leading-relaxed">{value}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={label ?? "Copiar"}
        title={copied ? "Copiado" : "Copiar"}
        className="absolute right-1.5 top-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--card))] hover:text-[hsl(var(--foreground))] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </button>
      <span className="sr-only" aria-live="polite">{copied ? "Copiado al portapapeles" : ""}</span>
    </div>
  );
}
