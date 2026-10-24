import { NodeViewWrapper } from '@tiptap/react'
import { useContext, useEffect, useRef, useState } from 'react'
import { Trash2, PencilRuler } from 'lucide-react'
import { ConfirmDialog, ImageEditorDialog } from '@runly/ui'
import { toast } from 'sonner'
import { getImageNaturalSize, uploadNoteImage } from '../lib/noteImageUpload.js'
import { withImageVariant } from '../../../lib/imageVariants.js'
import { useBlockDragReorder } from '../hooks/useBlockDragReorder.js'
import { isInsideTableCell } from '../lib/tableContext.js'
import { cropToViewBox, effectiveNaturalSize, normalizeRotation } from '../lib/imageCrop.js'
import { clampImageWidthPct, computeCornerResize } from '../lib/imageSize.js'
import { useRotatedFillSize } from '../hooks/useRotatedFillSize.js'
import { renderAnnotation } from './ImageAnnotationShapes.jsx'
import { NoteImagePreviewButton } from './NoteImagePreviewButton.jsx'
import { NoteInteractionContext } from './NoteInteractionContext.js'
import { NoteBlockDragHandle } from './NoteBlockDragHandle.jsx'

function parseCrop(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function ImageAnnotationOverlay({ node, updateAttributes, editor, getPos, deleteNode }) {
  const { viewing, noteId, token } = useContext(NoteInteractionContext)
  const boxRef = useRef(null) // the sized img+svg container — resize math + click-outside
  const frameRef = useRef(null) // the image frame only (no control chrome) — measured/cloned for drag reorder
  const rotWrapRef = useRef(null) // sized/positioned per crop; useRotatedFillSize measures this
  const resizeRef = useRef(null) // { pointerId, startX, startY, startWidthPx, startHeightPx, containerWidthPx }

  const [natural, setNatural] = useState(null) // { w, h }
  const [selected, setSelected] = useState(false) // click-to-select for resize (Word/PPT style)
  const [liveWidthPct, setLiveWidthPct] = useState(null) // resize drag preview
  const [liveAspectRatio, setLiveAspectRatio] = useState(null) // resize drag preview
  const [fullLoaded, setFullLoaded] = useState(false) // full-resolution <img> onLoad fired
  const [editorOpen, setEditorOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  // Instances without Supabase image transformation (imgproxy) answer
  // /render/image/public/ with 404 — fall back to the original object URL,
  // same as NoteCoverBanner. Keyed by src so a replaced image retries.
  const [transformFailedSrc, setTransformFailedSrc] = useState(null)

  const annotations = JSON.parse(node.attrs.annotations || '[]')
  const crop = parseCrop(node.attrs.crop)
  const rotation = normalizeRotation(node.attrs.rotation)
  // Context already combines permission and view mode. editor.isEditable
  // updates in an effect and can still hold the previous mode during render.
  const editable = !viewing
  const inTableCell = typeof getPos === 'function' && isInsideTableCell(editor.state, getPos())
  // null = full width, for images inserted before this attribute existed.
  const widthPct = node.attrs.width == null ? 100 : clampImageWidthPct(node.attrs.width)
  // Identity crop when unset — cropToViewBox/elementFracToImageSpace treat
  // {0,0,1,1} exactly like null, so every downstream calculation (drawing,
  // rendering) can use one shape unconditionally.
  const effectiveCrop = crop ?? { x: 0, y: 0, w: 1, h: 1 }
  const effNat = effectiveNaturalSize(natural, rotation)
  const fillSize = useRotatedFillSize(rotWrapRef, rotation, effNat?.w, effNat?.h)
  const drag = useBlockDragReorder({
    editor, getPos, editable: editable && !inTableCell, isEditing: false,
    getBoxEl: () => boxRef.current,
    getFrameEl: () => frameRef.current,
  })
  const {
    onPointerDown: onDragPointerDown,
    onPointerMove: onDragPointerMove,
    onPointerUp: onDragPointerUp,
    onPointerCancel: onDragPointerCancel,
    wasDragRef,
  } = drag

  // Deselect when clicking outside the image (Word/PPT-style click-away).
  useEffect(() => {
    if (!selected) return
    function onDocPointerDown(e) {
      if (!boxRef.current?.contains(e.target)) setSelected(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    return () => document.removeEventListener('pointerdown', onDocPointerDown, true)
  }, [selected])

  // A tap/click anywhere in this node view's own DOM (the image itself, its
  // pill/handle controls) must never let ProseMirror run its default
  // mousedown handling — that's what creates a NodeSelection AND focuses the
  // surrounding contentEditable, which mobile browsers always answer by
  // opening the on-screen keyboard even though nothing here is meant to be
  // typed into (and once open, dismissing it leaves the image "selected"
  // with no clean way back — the reported loop). ProseMirror's own view.dom
  // mousedown listener bails out whenever event.defaultPrevented is already
  // true (prosemirror-view's eventBelongsToView checks this before its own
  // handlers run), so preventing default here — a descendant, which fires
  // first during the bubble phase — is enough. Real form controls (buttons,
  // the Texto annotation's <input>) are left alone so their native
  // focus/caret behavior keeps working; `click` still fires normally either
  // way since only `mousedown`'s default is touched, not `pointerdown`.
  function onBoxMouseDown(e) {
    const target = e.target
    const isFormControl =
      target instanceof HTMLElement &&
      (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable)
    if (!isFormControl) e.preventDefault()
  }

  // ── click-to-resize (Word/PowerPoint-style corner handle) ────────────────
  function onImageClick() {
    if (wasDragRef.current) {
      wasDragRef.current = false
      return
    }
    if (!editable) return
    setSelected(true)
  }

  function onResizePointerDown(e) {
    if (!editable) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = boxRef.current.getBoundingClientRect()
    const containerWidthPx = rect.width / (widthPct / 100)
    resizeRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startWidthPx: rect.width,
      startHeightPx: rect.height,
      containerWidthPx,
    }
    setLiveWidthPct(widthPct)
    setLiveAspectRatio(node.attrs.aspectRatio ?? (effNat ? effNat.w / effNat.h : rect.width / rect.height))
  }

  function onResizePointerMove(e) {
    const r = resizeRef.current
    if (!r || r.pointerId !== e.pointerId) return
    const { widthPct: newWidthPct, aspectRatio } = computeCornerResize({
      startWidthPx: r.startWidthPx,
      startHeightPx: r.startHeightPx,
      containerWidthPx: r.containerWidthPx,
      deltaX: e.clientX - r.startX,
      deltaY: e.clientY - r.startY,
    })
    setLiveWidthPct(newWidthPct)
    setLiveAspectRatio(aspectRatio)
  }

  function onResizePointerUp(e) {
    const r = resizeRef.current
    if (!r || r.pointerId !== e.pointerId) return
    resizeRef.current = null
    const finalWidthPct = liveWidthPct
    const finalAspectRatio = liveAspectRatio
    setLiveWidthPct(null)
    setLiveAspectRatio(null)
    if (finalWidthPct != null) {
      updateAttributes({ width: finalWidthPct, aspectRatio: finalAspectRatio })
    }
  }

  const transformFailed = transformFailedSrc === node.attrs.src
  const src = transformFailed ? node.attrs.src : withImageVariant(node.attrs.src, 'content')
  const lqipSrc = transformFailed ? null : withImageVariant(node.attrs.src, 'lqip')
  const onVariantError = () => {
    if (src !== node.attrs.src) setTransformFailedSrc(node.attrs.src)
  }
  const displayWidthPct = liveWidthPct ?? widthPct
  // Outer box: controls the resizable width, carries the selection ring and
  // the pill/handle controls — never clipped, so they're never cut off.
  // WebkitTouchCallout suppresses iOS Safari's own native long-press menu
  // on the <img> ("Save Image"/"Copy"/etc, inherited by descendants) while
  // editable — without it, that native menu races the press-and-hold drag
  // timer below (useBlockDragReorder, LONG_PRESS_MS) and usually wins,
  // which is what made long-press-to-reorder feel like it "let go" instead
  // of arming a drag. Read-only/public views keep the native menu (a
  // reasonable way to save a shared image), since nothing there needs the
  // press-and-hold gesture.
  const wrapperStyle = {
    userSelect: 'none',
    width: `${displayWidthPct}%`,
    ...(editable ? { WebkitTouchCallout: 'none' } : null),
  }
  // Frame: clips to the crop window (overflow-hidden always — harmless when
  // effectiveCrop is the identity {0,0,1,1}, no crop set), so a cropped
  // image can't hide controls that sit just outside its edges. Sized via
  // the ROTATED effective natural aspect; falls back to the crop rect's own
  // aspect before the image has loaded (self-corrects once it has).
  const displayAspectRatio = liveAspectRatio ?? node.attrs.aspectRatio ?? null
  const frameStyle = {
    aspectRatio: displayAspectRatio
      ? String(displayAspectRatio)
      : effNat
      ? String((effectiveCrop.w * effNat.w) / (effectiveCrop.h * effNat.h))
      : String(effectiveCrop.w / effectiveCrop.h),
  }
  // Rotation wrapper: positioned/sized per the crop window exactly like the
  // old crop-only <img> was, but now holding a raw, unrotated <img> that
  // useRotatedFillSize sizes (in px, measured) to exactly fill this wrapper
  // once rotated — CSS percentages alone can't express "width = my parent's
  // height", which a 90/270 rotation needs.
  const rotWrapStyle = {
    position: 'absolute',
    width: `${100 / effectiveCrop.w}%`,
    left: `${(-effectiveCrop.x / effectiveCrop.w) * 100}%`,
    top: `${(-effectiveCrop.y / effectiveCrop.h) * 100}%`,
    aspectRatio: effNat ? String(effNat.w / effNat.h) : undefined,
  }
  const imgStyle = fillSize
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `${fillSize.width}px`,
        height: `${fillSize.height}px`,
        maxWidth: 'none',
        transform: rotation ? `translate(-50%, -50%) rotate(${rotation}deg)` : 'translate(-50%, -50%)',
      }
    : { position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0 }

  const canEditImage = editable && Boolean(noteId && token && node.attrs.src)

  // Uploads the edited file to the notes bucket; the node then points at it.
  // Rethrows so the editor stays open for a retry (the failure is reported here).
  async function replaceWithEdited(file) {
    try {
      const [url, natural] = await Promise.all([uploadNoteImage(file, { noteId, token }), getImageNaturalSize(file)])
      const aspectRatio = natural.naturalWidth && natural.naturalHeight ? natural.naturalWidth / natural.naturalHeight : null
      // The edit is baked into the new image, so the note-level crop, rotation and
      // annotations of the previous one (older notes) no longer apply.
      updateAttributes({ src: url, crop: null, rotation: 0, annotations: '[]', erasedAnnotations: '[]', aspectRatio })
      toast.success('Imagen actualizada')
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo guardar la imagen.')
      throw err
    }
  }

  return (
    <NodeViewWrapper className="group/img note-block relative my-2 block w-full">
      {editable && !inTableCell && (
        <NoteBlockDragHandle label="Mover imagen" drag={drag} placement="gutter" />
      )}
      <div
        ref={boxRef}
        onClick={onImageClick}
        onDoubleClick={canEditImage ? () => setEditorOpen(true) : undefined}
        onMouseDown={onBoxMouseDown}
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerCancel}
        // Android/Chrome's long-press-on-image context menu ("Download
        // image", "Open image in new tab"...) is a real, preventable
        // contextmenu event — the WebkitTouchCallout style above only
        // covers iOS Safari's equivalent. Both compete with and otherwise
        // usually win over the press-and-hold reorder gesture below.
        onContextMenu={editable ? (e) => e.preventDefault() : undefined}
        className={[
          'relative',
          selected ? 'ring-2 ring-amber-500 ring-offset-1 rounded-b' : '',
        ].join(' ')}
        style={wrapperStyle}
      >
        <div ref={frameRef} className="relative rounded-b overflow-hidden" style={frameStyle}>
          <div ref={rotWrapRef} style={rotWrapStyle}>
            {/* Tiny blurred placeholder — loads almost instantly (a few
                hundred bytes) and shares the full image's aspect ratio, so
                it corrects the frame size for legacy images that have no
                stored aspectRatio, well before the full image arrives. */}
            {lqipSrc && (
              <img
                src={lqipSrc}
                alt=""
                aria-hidden="true"
                draggable={false}
                onLoad={(e) => setNatural((prev) => prev ?? { w: e.target.naturalWidth, h: e.target.naturalHeight })}
                onError={onVariantError}
                style={{
                  ...imgStyle,
                  filter: 'blur(16px)',
                  transform: imgStyle.transform ? `${imgStyle.transform} scale(1.15)` : undefined,
                }}
              />
            )}
            <img
              key={src}
              src={src}
              alt={node.attrs.alt ?? ''}
              draggable={false}
              onLoad={(e) => { setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight }); setFullLoaded(true) }}
              onError={onVariantError}
              style={{
                ...imgStyle,
                opacity: fillSize && fullLoaded ? 1 : 0,
                transition: 'opacity 200ms ease',
              }}
            />
          </div>
          <svg
            viewBox={cropToViewBox(crop)}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            {annotations.map(renderAnnotation)}
          </svg>
        </div>

        {(
          <div
            // Top-right: keeps the primary "Editar imagen" affordance in view
            // above the fold on a tall image, clear of the corner resize
            // handles. The separate grip and press-and-hold on the image
            // both support reordering.
            className="absolute top-2 right-2 flex items-center gap-1.5"
          >
            <NoteImagePreviewButton
              src={node.attrs.src}
              alt={node.attrs.alt}
              editable={canEditImage}
              onReplaceImage={replaceWithEdited}
            />
            {canEditImage && (
              <button
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={() => setEditorOpen(true)}
                aria-label="Editar imagen"
                title="Editar imagen"
                className="flex items-center justify-center w-8 h-8 bg-[hsl(var(--background)/0.9)] backdrop-blur-sm border border-[hsl(var(--border))] rounded-lg shadow-sm hover:bg-[hsl(var(--muted))] transition-colors"
              >
                <PencilRuler className="w-3.5 h-3.5" />
              </button>
            )}
            {editable && typeof deleteNode === 'function' && (
              <button
                onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={() => setConfirmDeleteOpen(true)}
                aria-label="Eliminar imagen"
                title="Eliminar imagen"
                className="flex items-center justify-center w-8 h-8 bg-[hsl(var(--background)/0.9)] backdrop-blur-sm border border-[hsl(var(--border))] rounded-lg shadow-sm hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {editable && selected && (
          // Free 4-corner resize — all 4 anchor at the fixed top-left corner
          // (the node lives in document flow, not a free canvas), so every
          // handle shares the same onResizePointer* math; the cursor style
          // is just a visual hint matching each corner's diagonal.
          <>
            {[
              { pos: 'top-left', posClass: 'left-0 top-0', cursor: 'cursor-nwse-resize' },
              { pos: 'top-right', posClass: 'right-0 top-0', cursor: 'cursor-nesw-resize' },
              { pos: 'bottom-left', posClass: 'left-0 bottom-0', cursor: 'cursor-nesw-resize' },
              { pos: 'bottom-right', posClass: 'right-0 bottom-0', cursor: 'cursor-nwse-resize' },
            ].map(({ pos, posClass, cursor }) => (
              <button
                key={pos}
                aria-label="Cambiar tamaño de la imagen"
                title="Arrastra para cambiar el tamaño"
                onPointerDown={onResizePointerDown}
                onPointerMove={onResizePointerMove}
                onPointerUp={onResizePointerUp}
                onPointerCancel={onResizePointerUp}
                // 44px hit area (Apple/Android minimum touch target), same
                // trick as ImageCropModal's corner handles — visually just
                // the dot.
                className={`absolute ${posClass} w-11 h-11 -m-5 flex items-center justify-center ${cursor}`}
                style={{ touchAction: 'none' }}
              >
                <span className="w-3.5 h-3.5 rounded-full bg-amber-500 border-2 border-white dark:border-[hsl(var(--background))] shadow" />
              </button>
            ))}
          </>
        )}
      </div>

      {editorOpen && (
        <ImageEditorDialog
          open
          onOpenChange={setEditorOpen}
          src={node.attrs.src}
          fileName={node.attrs.alt || 'imagen'}
          mimeType={/\.png(\?|$)/i.test(node.attrs.src) ? 'image/png' : /\.webp(\?|$)/i.test(node.attrs.src) ? 'image/webp' : 'image/jpeg'}
          title="Editar imagen"
          onReplace={async (file) => {
            try {
              await replaceWithEdited(file)
              setEditorOpen(false)
            } catch { /* reported above; keep the editor open */ }
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Eliminar imagen"
        description="Se eliminara esta imagen y sus anotaciones de la nota. Esta accion se puede deshacer con Ctrl+Z."
        confirmLabel="Eliminar"
        onConfirm={() => { setConfirmDeleteOpen(false); deleteNode?.() }}
      />
    </NodeViewWrapper>
  )
}
