import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Spanish keyboard instructions for screen readers (space/Enter, arrows, Escape).
const SCREEN_READER = {
  draggable: 'Para tomar un elemento presiona espacio o Enter. Muévelo con las flechas y presiona espacio o Enter para soltarlo, o Escape para cancelar.',
}

function SortableItemWrapper({ id, item, index, disabled, renderItem }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style = {
    // Translate (not Transform): rows of different heights do not get stretched.
    transform: CSS.Translate.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  const dragHandleProps = disabled ? null : { ...attributes, ...listeners }

  return (
    <div ref={setNodeRef} style={style}>
      {renderItem(item, { dragHandleProps, isDragging, index })}
    </div>
  )
}

// Vertical drag-and-drop list (pointer and keyboard). `renderItem(item,
// { dragHandleProps, isDragging, index })` spreads `dragHandleProps` on its grip
// (null when `disabled`). `getId` names the item key when it is not `id`;
// `labelOf(item)` feeds the Spanish screen reader announcements.
export function SortableList({ items, onReorder, renderItem, getId = (item) => item.id, disabled = false, labelOf }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = items.map(getId)
  const nameOf = (id) => {
    const item = items[ids.indexOf(id)]
    const label = item && labelOf ? labelOf(item) : null
    return label ? `«${label}»` : `el elemento ${ids.indexOf(id) + 1}`
  }
  const announcements = {
    onDragStart: ({ active }) => `Tomaste ${nameOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} está en la posición ${ids.indexOf(over.id) + 1} de ${ids.length}.` : `${nameOf(active.id)} no está sobre la lista.`),
    onDragEnd: ({ active, over }) => (over ? `Soltaste ${nameOf(active.id)} en la posición ${ids.indexOf(over.id) + 1}.` : `Soltaste ${nameOf(active.id)}.`),
    onDragCancel: ({ active }) => `Se canceló el movimiento de ${nameOf(active.id)}.`,
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ids.indexOf(active.id)
    const newIndex = ids.indexOf(over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext
      sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        {items.map((item, index) => (
          <SortableItemWrapper
            key={ids[index]}
            id={ids[index]}
            item={item}
            index={index}
            disabled={disabled}
            renderItem={renderItem}
          />
        ))}
      </SortableContext>
    </DndContext>
  )
}
