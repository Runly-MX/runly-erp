// Document kind "general.manual" (Documento general): not tied to any module
// record. The caller provides the values (generate({ kind, data })) and the
// template may use any {{tag}}: free tags, mapped by their own name.
export const GENERAL_MANUAL_KIND = "general.manual";

export function createGeneralManualDocumentKind() {
  return {
    key: GENERAL_MANUAL_KIND,
    label: "Documento general",
    permissionKey: "documents.templates.read",
    // Always available; it does not belong to an installable module.
    moduleKey: null,
    alwaysVisible: true,
    freeTags: true,
    formats: ["docx", "xlsx", "pptx", "pdf"],
    schema: [],
    // Nothing to load: the values come from the caller.
    async load() {
      return {};
    },
  };
}
