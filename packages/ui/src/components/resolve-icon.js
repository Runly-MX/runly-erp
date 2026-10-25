// Stored icon name -> component. Icons chosen in the icon library are lucide kebab-case
// names ("wallet-cards"); older values are catalog names ("Wallet") or lucide PascalCase
// ones ("FolderKanban"). The catalog wins; anything else the registry knows renders
// through IconGlyph, wrapped so callers can use it like a lucide component (size, className).
import { createElement } from "react";
import { IconGlyph } from "./IconGlyph.jsx";
import { resolveLucideIcon as fromCatalog } from "./icon-catalog.js";
import { isKnownIcon } from "../lib/icon-library/registry.js";

const toKebab = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])(\d)/g, "$1-$2").toLowerCase();
const wrappers = new Map();

function glyphComponent(name) {
  if (!wrappers.has(name)) {
    wrappers.set(name, function RegistryIcon({ size, className, strokeWidth, style }) {
      return createElement(IconGlyph, { name, className, strokeWidth, style: size ? { width: size, height: size, ...style } : style });
    });
  }
  return wrappers.get(name);
}

export function resolveLucideIcon(name) {
  const known = fromCatalog(name);
  if (known || !name || typeof name !== "string") return known;
  const kebab = toKebab(name);
  return isKnownIcon(kebab) ? glyphComponent(kebab) : null;
}
