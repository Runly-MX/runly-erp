// State of DetailViewDesigner: the stored view <-> cards per column, fields per
// card, the "sin tarjeta" tray and hidden module sections.
import { applyDetailView, defaultDetailView, detailViewCatalog } from "./detail-view-layout.js";

export const TRAY = "z:__tray";
export const COLUMNS = [{ id: "main", title: "Columna principal" }, { id: "aside", title: "Columna lateral" }];

export function toState(blueprint, view, extraFields) {
  const catalog = detailViewCatalog(blueprint, extraFields);
  const hiddenIds = new Set(view?.hidden ?? []);
  const cards = {};
  const columns = { main: [], aside: [] };
  const fieldsOf = {};
  const addBlock = (id, column) => {
    if (cards[id] || !catalog.blocks.has(id)) return;
    const block = catalog.blocks.get(id);
    cards[id] = { id, block: true, label: block.label ?? id, icon: block.icon };
    columns[column === "aside" ? "aside" : "main"].push(id);
  };
  for (const section of defaultDetailView(applyDetailView(blueprint, view, extraFields)).sections) {
    if (section.block) { addBlock(section.id, section.column); continue; }
    cards[section.id] = { id: section.id, label: section.label, icon: section.icon, columns: section.columns };
    columns[section.column === "aside" ? "aside" : "main"].push(section.id);
    fieldsOf[section.id] = section.fields;
  }
  // Hidden module sections are not in the applied blueprint: keep them listed, greyed out.
  for (const section of view?.sections ?? []) if (section.block && hiddenIds.has(section.id)) addBlock(section.id, section.column);
  for (const id of hiddenIds) addBlock(id, catalog.blocks.get(id)?.column);
  const placed = new Set(Object.values(fieldsOf).flat());
  return {
    cards,
    columns,
    fieldsOf,
    tray: [...catalog.fields.keys()].filter((key) => !placed.has(key)),
    hiddenBlocks: [...hiddenIds].filter((id) => catalog.blocks.has(id)),
  };
}

export function toView(state) {
  const sections = COLUMNS.flatMap(({ id: column }) => state.columns[column].map((id) => {
    const card = state.cards[id];
    if (card.block) return { id, block: true, column };
    return { id, label: card.label.trim() || "Sin título", ...(card.icon ? { icon: card.icon } : {}), column, columns: card.columns > 1 ? 2 : 1, fields: state.fieldsOf[id] };
  }));
  return { version: 1, sections, hidden: [...state.tray, ...state.hiddenBlocks] };
}
