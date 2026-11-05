// Custom detail views: a company's arrangement (cards, field order, hidden
// fields) applied on top of a DETAIL blueprint. Only keys and labels come from
// the stored view; field metadata always comes from the base blueprint.
// Spec: docs/superpowers/specs/2026-11-05-custom-detail-views-design.md.

export const OTHER_SECTION_ID = "otros_datos";

function slug(label, index) {
  const value = String(label ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return value || `section_${index + 1}`;
}

const isFieldSection = (section) => !section.type || section.type === "fields";

// Base sections with a stable id each (sections without one get it from their label).
function baseSections(blueprint) {
  return (blueprint?.schema?.sections ?? []).map((section, index) => ({ ...section, id: section.id ?? slug(section.label, index) }));
}

export function detailViewCatalog(blueprint, extraFields = []) {
  const fields = new Map();
  const origin = new Map();
  const blocks = new Map();
  for (const section of baseSections(blueprint)) {
    if (!isFieldSection(section)) { blocks.set(section.id, section); continue; }
    for (const field of section.fields ?? []) {
      if (!field?.field || fields.has(field.field)) continue;
      fields.set(field.field, field);
      origin.set(field.field, section.id);
    }
  }
  for (const field of extraFields) if (field?.field && !fields.has(field.field)) fields.set(field.field, field);
  return { fields, origin, blocks };
}

export function defaultDetailView(blueprint) {
  return {
    version: 1,
    sections: baseSections(blueprint).map((section) => (isFieldSection(section)
      ? { id: section.id, label: section.label ?? "", icon: section.icon, column: section.column ?? "main", columns: section.columns ?? 1, fields: (section.fields ?? []).map((field) => field.field).filter(Boolean) }
      : { id: section.id, block: true, column: section.column ?? "main" })),
    hidden: [],
  };
}

export function placedFieldKeys(view) {
  return new Set((view?.sections ?? []).flatMap((section) => (section.block ? [] : section.fields ?? [])));
}

// -> the blueprint with its sections rearranged by `view` (unchanged without one).
// Base fields and blocks the view does not mention (added by a later module
// version) stay visible unless hidden: in their original card, or "Otros datos".
export function applyDetailView(blueprint, view, extraFields = []) {
  if (!view || !Array.isArray(view.sections)) return blueprint;
  const { fields, origin, blocks } = detailViewCatalog(blueprint, extraFields);
  const base = new Map(baseSections(blueprint).map((section) => [section.id, section]));
  const hidden = new Set(view.hidden ?? []);
  const placed = placedFieldKeys(view);
  const usedBlocks = new Set();
  const sections = [];

  for (const entry of view.sections) {
    if (entry.block) {
      const block = blocks.get(entry.id);
      if (!block || hidden.has(entry.id) || usedBlocks.has(entry.id)) continue;
      usedBlocks.add(entry.id);
      sections.push({ ...block, column: entry.column });
      continue;
    }
    const original = base.get(entry.id);
    sections.push({
      ...(original && isFieldSection(original) ? original : {}),
      id: entry.id,
      label: entry.label ?? original?.label ?? "",
      icon: entry.icon ?? original?.icon,
      column: entry.column,
      columns: entry.columns ?? original?.columns ?? 1,
      fields: (entry.fields ?? []).filter((key) => fields.has(key) && !hidden.has(key)).map((key) => fields.get(key)),
    });
  }

  const byId = new Map(sections.map((section) => [section.id, section]));
  for (const [key, field] of fields) {
    if (placed.has(key) || hidden.has(key) || !origin.has(key)) continue;
    let target = byId.get(origin.get(key));
    if (!target || target.type) {
      target = byId.get(OTHER_SECTION_ID);
      if (!target) {
        target = { id: OTHER_SECTION_ID, label: "Otros datos", icon: "LayoutList", column: "main", columns: 2, fields: [] };
        sections.push(target);
        byId.set(OTHER_SECTION_ID, target);
      }
    }
    target.fields = [...target.fields, field];
  }
  for (const [id, block] of blocks) if (!usedBlocks.has(id) && !hidden.has(id)) sections.push(block);

  return { ...blueprint, schema: { ...blueprint.schema, sections } };
}
