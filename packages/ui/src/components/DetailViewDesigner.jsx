// Drag-and-drop editor for a company's custom detail view: cards in a main and
// a side column, fields moved between cards or to the "sin tarjeta" tray, module
// sections (attachments, activity...) moved or hidden. Produces the view schema
// that applyDetailView understands (docs/superpowers/specs/2026-11-05-custom-detail-views-design.md).
import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { LayoutDashboard, Plus, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./Dialog.jsx";
import { Button } from "./Button.jsx";
import { ConfirmDialog } from "./ConfirmDialog.jsx";
import { CardTile, ColumnZone, FieldChip, FieldZone } from "./DetailViewDesignerParts.jsx";
import { detailViewCatalog } from "../runly-renderer/detail-view-layout.js";
import { COLUMNS, TRAY, toState, toView } from "../runly-renderer/detail-view-designer-state.js";

export function DetailViewDesigner({ open, onOpenChange, blueprint, view = null, extraFields = [], onSave, onReset, saving = false, title = "Personalizar vista" }) {
  const catalog = useMemo(() => detailViewCatalog(blueprint, extraFields), [blueprint, extraFields]);
  const [state, setState] = useState(() => toState(blueprint, view, extraFields));
  const [activeId, setActiveId] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  // Every opening starts from the stored view.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setState(toState(blueprint, view, extraFields)); }, [open]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labelOf = (key) => catalog.fields.get(key)?.label ?? key;

  const zoneOfField = (key, s = state) => {
    if (s.tray.includes(key)) return TRAY;
    const cardId = Object.keys(s.fieldsOf).find((id) => s.fieldsOf[id].includes(key));
    return cardId ? `z:${cardId}` : null;
  };
  const listOf = (zone, s = state) => (zone === TRAY ? s.tray : s.fieldsOf[zone.slice(2)]);
  const columnOfCard = (cardId, s = state) => COLUMNS.find(({ id }) => s.columns[id].includes(cardId))?.id ?? null;

  // Where a dragged field would land, from whatever the pointer is over.
  function targetZone(overId, s) {
    if (!overId) return null;
    if (overId.startsWith("f:")) return zoneOfField(overId.slice(2), s);
    if (overId.startsWith("z:")) return overId;
    if (overId.startsWith("s:") && !s.cards[overId.slice(2)]?.block) return `z:${overId.slice(2)}`;
    return null;
  }
  function targetColumn(overId, s) {
    if (!overId) return null;
    if (overId.startsWith("col:")) return overId.slice(4);
    if (overId.startsWith("s:")) return columnOfCard(overId.slice(2), s);
    if (overId.startsWith("z:") && overId !== TRAY) return columnOfCard(overId.slice(2), s);
    if (overId.startsWith("f:")) {
      const zone = zoneOfField(overId.slice(2), s);
      return zone && zone !== TRAY ? columnOfCard(zone.slice(2), s) : null;
    }
    return null;
  }

  function withList(s, zone, list) {
    return zone === TRAY ? { ...s, tray: list } : { ...s, fieldsOf: { ...s.fieldsOf, [zone.slice(2)]: list } };
  }

  function handleDragOver({ active, over }) {
    const overId = over?.id ? String(over.id) : null;
    const id = String(active.id);
    setState((s) => {
      if (id.startsWith("f:")) {
        const key = id.slice(2);
        const from = zoneOfField(key, s);
        const to = targetZone(overId, s);
        if (!from || !to || from === to) return s;
        const target = listOf(to, s);
        const index = overId?.startsWith("f:") ? target.indexOf(overId.slice(2)) : target.length;
        const next = withList(s, from, listOf(from, s).filter((k) => k !== key));
        const list = [...target];
        list.splice(index < 0 ? list.length : index, 0, key);
        return withList(next, to, list);
      }
      const cardId = id.slice(2);
      const from = columnOfCard(cardId, s);
      const to = targetColumn(overId, s);
      if (!from || !to || from === to) return s;
      const target = [...s.columns[to]];
      const overCard = overId?.startsWith("s:") ? target.indexOf(overId.slice(2)) : -1;
      target.splice(overCard < 0 ? target.length : overCard, 0, cardId);
      return { ...s, columns: { ...s.columns, [from]: s.columns[from].filter((c) => c !== cardId), [to]: target } };
    });
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    const overId = over?.id ? String(over.id) : null;
    const id = String(active.id);
    if (!overId || overId === id) return;
    setState((s) => {
      if (id.startsWith("f:") && overId.startsWith("f:")) {
        const zone = zoneOfField(id.slice(2), s);
        if (zone !== zoneOfField(overId.slice(2), s)) return s;
        const list = listOf(zone, s);
        return withList(s, zone, arrayMove(list, list.indexOf(id.slice(2)), list.indexOf(overId.slice(2))));
      }
      if (id.startsWith("s:") && overId.startsWith("s:")) {
        const column = columnOfCard(id.slice(2), s);
        if (column !== columnOfCard(overId.slice(2), s)) return s;
        const list = s.columns[column];
        return { ...s, columns: { ...s.columns, [column]: arrayMove(list, list.indexOf(id.slice(2)), list.indexOf(overId.slice(2))) } };
      }
      return s;
    });
  }

  const updateCard = (cardId, patch) => setState((s) => ({ ...s, cards: { ...s.cards, [cardId]: { ...s.cards[cardId], ...patch } } }));
  const removeCard = (cardId) => setState((s) => {
    const { [cardId]: _card, ...cards } = s.cards;
    const { [cardId]: fields = [], ...fieldsOf } = s.fieldsOf;
    const column = columnOfCard(cardId, s);
    return { ...s, cards, fieldsOf, tray: [...s.tray, ...fields], columns: { ...s.columns, [column]: s.columns[column].filter((c) => c !== cardId) } };
  });
  const toggleBlock = (cardId) => setState((s) => ({
    ...s,
    hiddenBlocks: s.hiddenBlocks.includes(cardId) ? s.hiddenBlocks.filter((c) => c !== cardId) : [...s.hiddenBlocks, cardId],
  }));
  const addCard = () => setState((s) => {
    let n = 1;
    while (s.cards[`card_${n}`]) n += 1;
    const id = `card_${n}`;
    return { ...s, cards: { ...s.cards, [id]: { id, label: "Nueva tarjeta", icon: "LayoutList", columns: 2 } }, fieldsOf: { ...s.fieldsOf, [id]: [] }, columns: { ...s.columns, main: [id, ...s.columns.main] } };
  });

  const activeCard = activeId?.startsWith("s:") ? state.cards[activeId.slice(2)] : null;
  const renderCard = (cardId) => (
    <CardTile
      key={cardId}
      card={state.cards[cardId]}
      fields={state.fieldsOf[cardId] ?? []}
      labelOf={labelOf}
      hidden={state.hiddenBlocks.includes(cardId)}
      onChange={(patch) => updateCard(cardId, patch)}
      onRemove={() => removeCard(cardId)}
      onToggleHidden={() => toggleBlock(cardId)}
    />
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="2xl" submitOnEnter={false} className="flex flex-col md:h-[88dvh] md:max-w-6xl md:overflow-hidden md:p-0">
          <div className="shrink-0 border-b border-[hsl(var(--border))] px-5 pb-4 md:px-6 md:pt-5">
            <DialogHeader icon={LayoutDashboard}>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>Arrastra tarjetas entre columnas y campos entre tarjetas. La vista se aplica a toda la empresa.</DialogDescription>
            </DialogHeader>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={({ active }) => setActiveId(String(active.id))}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain px-5 py-4 md:grid-cols-[220px_minmax(0,1.4fr)_minmax(0,1fr)] md:px-6">
              <section className="min-w-0 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Campos sin tarjeta</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">No se muestran en el detalle.</p>
                <FieldZone id={TRAY} keys={state.tray} labelOf={labelOf} empty="Todos los campos están en una tarjeta" />
              </section>
              {COLUMNS.map((column) => (
                <ColumnZone key={column.id} id={`col:${column.id}`} title={column.title} cardIds={state.columns[column.id]}>
                  {column.id === "main" ? (
                    <Button type="button" variant="outline" size="sm" onClick={addCard} className="w-full">
                      <Plus className="h-4 w-4" /> Nueva tarjeta
                    </Button>
                  ) : null}
                  {state.columns[column.id].map(renderCard)}
                </ColumnZone>
              ))}
            </div>
            <DragOverlay>
              {activeId?.startsWith("f:") ? <FieldChip id={activeId} label={labelOf(activeId.slice(2))} overlay /> : null}
              {activeCard ? <CardTile card={activeCard} fields={[]} labelOf={labelOf} hidden={state.hiddenBlocks.includes(activeCard.id)} overlay /> : null}
            </DragOverlay>
          </DndContext>
          <DialogFooter className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-3 md:px-6">
            {view ? (
              <Button type="button" variant="ghost" onClick={() => setConfirmReset(true)} disabled={saving} className="sm:mr-auto">
                <RotateCcw className="h-4 w-4" /> Restablecer
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)} disabled={saving}>Cancelar</Button>
            <Button type="button" onClick={() => onSave?.(toView(state))} disabled={saving}>{saving ? "Guardando..." : "Guardar vista"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        icon={RotateCcw}
        title="Restablecer la vista"
        description="Se descarta la vista personalizada de la empresa y se vuelve al diseño original del módulo."
        confirmLabel="Restablecer"
        loading={saving}
        onConfirm={async () => { await onReset?.(); setConfirmReset(false); }}
      />
    </>
  );
}

