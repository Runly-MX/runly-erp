import { useState } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'
import { ImageLightbox, zoomTrigger } from './imageLightbox.jsx'

function safeImg(src) {
  return typeof src === 'string' && /^(https?:|\/|data:image\/)/i.test(src) ? src : ''
}

export const GalleryBlock = defineBlock({
  type: 'GalleryBlock',
  label: 'Galería de imágenes',
  category: 'atlas',
  defaultProps: {
    eyebrow: '',
    title: 'Nuestra galería',
    subtitle: '',
    columns: '3',
    gap: 'normal',
    image1: '', image2: '', image3: '',
    image4: '', image5: '', image6: '',
    caption1: '', caption2: '', caption3: '',
    caption4: '', caption5: '', caption6: '',
    aspectRatio: '4/3',
    zoom: true,
  },
  fields: {
    eyebrow:     { type: 'text',   label: 'Antetítulo' },
    title:       { type: 'text',   label: 'Título' },
    subtitle:    { type: 'textarea', label: 'Subtítulo' },
    columns:     { type: 'select', label: 'Columnas', options: [
      { value: '2', label: '2 columnas' },
      { value: '3', label: '3 columnas' },
      { value: '4', label: '4 columnas' },
    ]},
    gap:         { type: 'select', label: 'Espaciado', options: [
      { value: 'none',    label: 'Sin espacio' },
      { value: 'tight',   label: 'Compacto (4px)' },
      { value: 'normal',  label: 'Normal (16px)' },
      { value: 'relaxed', label: 'Amplio (24px)' },
    ]},
    aspectRatio: { type: 'select', label: 'Proporción de imagen', options: [
      { value: '1/1',  label: 'Cuadrado (1:1)' },
      { value: '4/3',  label: 'Paisaje (4:3)' },
      { value: '16/9', label: 'Panorámico (16:9)' },
      { value: '3/4',  label: 'Retrato (3:4)' },
    ]},
    zoom:        { type: 'toggle', label: 'Ampliar la imagen al hacer clic' },
    image1: { type: 'image', label: 'Imagen 1' }, caption1: { type: 'text', label: 'Pie de foto 1' },
    image2: { type: 'image', label: 'Imagen 2' }, caption2: { type: 'text', label: 'Pie de foto 2' },
    image3: { type: 'image', label: 'Imagen 3' }, caption3: { type: 'text', label: 'Pie de foto 3' },
    image4: { type: 'image', label: 'Imagen 4' }, caption4: { type: 'text', label: 'Pie de foto 4' },
    image5: { type: 'image', label: 'Imagen 5' }, caption5: { type: 'text', label: 'Pie de foto 5' },
    image6: { type: 'image', label: 'Imagen 6' }, caption6: { type: 'text', label: 'Pie de foto 6' },
  },
  groups: [
    { label: 'Encabezado', fields: ['eyebrow', 'title', 'subtitle'] },
    { label: 'Diseño',     fields: ['columns', 'gap', 'aspectRatio', 'zoom'] },
    { label: 'Imágenes',   fields: ['image1', 'caption1', 'image2', 'caption2', 'image3', 'caption3', 'image4', 'caption4', 'image5', 'caption5', 'image6', 'caption6'] },
  ],
  render({ eyebrow, title, subtitle, columns, gap, aspectRatio, zoom, image1, image2, image3, image4, image5, image6, caption1, caption2, caption3, caption4, caption5, caption6 }) {
    const cols = Number(columns) || 3
    const gapPx = gap === 'none' ? '0' : gap === 'tight' ? '4px' : gap === 'relaxed' ? '24px' : '16px'
    const borderRadius = gap === 'none' ? '0' : '12px'

    const images = [
      { src: safeImg(image1), caption: caption1 },
      { src: safeImg(image2), caption: caption2 },
      { src: safeImg(image3), caption: caption3 },
      { src: safeImg(image4), caption: caption4 },
      { src: safeImg(image5), caption: caption5 },
      { src: safeImg(image6), caption: caption6 },
    ].filter((img) => img.src)

    const hasHeader = eyebrow || title || subtitle

    return (
      <section style={{ padding: hasHeader ? '80px 24px' : '0', background: 'var(--runly-color-bg, #fff)' }}>
        {hasHeader && (
          <div style={{ maxWidth: '1200px', marginInline: 'auto', marginBottom: '48px', textAlign: 'center' }}>
            {eyebrow && (
              <p style={{ margin: '0 0 12px', color: 'var(--runly-color-primary, #6D28D9)', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 style={{ fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(24px, 3vw, 40px)', fontWeight: 800, color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 16px', lineHeight: 1.2 }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ color: 'var(--runly-color-muted, #64748b)', fontFamily: 'var(--runly-font-sans)', fontSize: '17px', lineHeight: 1.6, maxWidth: '600px', marginInline: 'auto', margin: 0 }}>
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div style={{ maxWidth: hasHeader ? '1200px' : '100%', marginInline: 'auto' }}>
          {images.length === 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: gapPx }}>
              {Array.from({ length: cols }).map((_, i) => (
                <div key={i} style={{ aspectRatio, background: '#E5E7EB', borderRadius, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              ))}
            </div>
          ) : (
            <GalleryGrid images={images} cols={cols} gapPx={gapPx} borderRadius={borderRadius} aspectRatio={aspectRatio} zoom={zoom !== false} />
          )}
        </div>
      </section>
    )
  },
})

function GalleryGrid({ images, cols, gapPx, borderRadius, aspectRatio, zoom }) {
  const [index, setIndex] = useState(null)
  const slides = images.map((img, i) => ({ src: img.src, alt: img.caption || `Imagen ${i + 1}` }))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(1200 / cols)}px), 1fr))`, gap: gapPx }}>
      {slides.map((img, i) => (
        <figure key={i} style={{ margin: 0, position: 'relative', overflow: 'hidden', borderRadius }}>
          <div style={{ position: 'relative', aspectRatio, overflow: 'hidden', borderRadius }}>
            <img
              src={img.src}
              alt={img.alt}
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 300ms ease' }}
            />
            {zoom && <button type="button" aria-label={`Ampliar: ${img.alt}`} onClick={() => setIndex(i)} style={zoomTrigger} />}
          </div>
          {images[i].caption && (
            <figcaption style={{ padding: '8px 4px 0', fontFamily: 'var(--runly-font-sans)', fontSize: '13px', color: 'var(--runly-color-muted, #64748b)', textAlign: 'center' }}>
              {images[i].caption}
            </figcaption>
          )}
        </figure>
      ))}
      {zoom && <ImageLightbox images={slides} index={index} onIndex={setIndex} onClose={() => setIndex(null)} />}
    </div>
  )
}
