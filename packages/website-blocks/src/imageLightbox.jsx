// Fullscreen image viewer for published sites. Native <dialog> gives Esc-to-close, focus trapping and the top layer.
import { useEffect, useRef } from 'react'

const control = { position: 'fixed', width: 44, height: 44, borderRadius: 999, border: 0, background: 'rgba(255,255,255,.92)', color: '#111', fontSize: 24, lineHeight: 1, cursor: 'pointer' }

// images: [{ src, alt }]; index: the open image or null when closed.
export function ImageLightbox({ images, index, onIndex, onClose }) {
  const ref = useRef(null)
  const open = index != null && Boolean(images[index])
  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  const many = images.length > 1
  const step = (n) => onIndex((index + n + images.length) % images.length)
  const image = open ? images[index] : null
  return (
    <dialog
      ref={ref}
      className="rs-lightbox"
      aria-label={image?.alt || 'Imagen'}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) ref.current.close() }}
      onKeyDown={(e) => { if (many && e.key === 'ArrowRight') step(1); if (many && e.key === 'ArrowLeft') step(-1) }}
      style={{ padding: 0, border: 0, background: 'transparent', maxWidth: '96vw', maxHeight: '96vh', overflow: 'visible' }}
    >
      <style>{'.rs-lightbox::backdrop{background:rgba(15,12,10,.85)}'}</style>
      {image && <img src={image.src} alt={image.alt || ''} style={{ display: 'block', maxWidth: '94vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />}
      <button type="button" aria-label="Cerrar" onClick={() => ref.current.close()} style={{ ...control, top: 16, right: 16 }}>×</button>
      {many && (
        <>
          <button type="button" aria-label="Imagen anterior" onClick={() => step(-1)} style={{ ...control, left: 16, top: '50%', transform: 'translateY(-50%)' }}>‹</button>
          <button type="button" aria-label="Imagen siguiente" onClick={() => step(1)} style={{ ...control, right: 16, top: '50%', transform: 'translateY(-50%)' }}>›</button>
        </>
      )}
    </dialog>
  )
}

// Button that fills its positioned parent and opens the lightbox on click.
export const zoomTrigger = { position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, border: 0, background: 'none', cursor: 'zoom-in' }
