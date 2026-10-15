import { useCallback } from "react";
import { toast } from "sonner";
import { copiedMessage, copyableText, copyText } from "../lib/copy-text.js";

// Returns copy(value): copies the text and shows a "Copiado: ..." toast.
// Blank values are ignored. Resolves true when something was copied.
export function useCopyValue() {
  return useCallback(async (value) => {
    const text = copyableText(value);
    if (!text) return false;
    const ok = await copyText(text);
    if (ok) toast.success(copiedMessage(text));
    else toast.error("No se pudo copiar al portapapeles");
    return ok;
  }, []);
}
