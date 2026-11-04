import { defineBlock } from '@raulbellosom/atlas-web-builder'

const safeImg = (src) => (typeof src === 'string' && /^(https?:|\/|data:image\/)/i.test(src) ? src : '')
const STYLE = '.runly-project-card{transition:transform 220ms ease,box-shadow 220ms ease}.runly-project-card:hover{transform:translateY(-6px);box-shadow:0 20px 40px rgba(15,23,42,.16)}'
const TINT = 'color-mix(in srgb, var(--runly-color-primary, #2563eb) 6%, var(--runly-color-bg, #fff))'

// "Name | Category | /link" per project, projects separated by a --- line.
function parseProjects(raw) {
  if (typeof raw !== 'string') return []
  return raw.split('---').map((row) => row.trim()).filter(Boolean).map((row) => {
    const [name = '', category = '', href = ''] = row.split('|').map((part) => part.trim())
    return { name, category, href }
  }).filter((project) => project.name)
}

export const ProjectCardsBlock = defineBlock({
  type: 'ProjectCardsBlock',
  label: 'Tarjetas de proyectos',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Trabajo seleccionado', title: 'Algunos de mis favoritos', subtitle: '',
    projects: 'Bloom & Wild | Tienda en línea | /trabajo\n---\nNorthland Studio | Sitio de agencia creativa | /trabajo\n---\nPure Balance | Sitio de bienestar | /trabajo',
    image1: '', image2: '', image3: '', image4: '', image5: '', image6: '',
    columns: '3', background: 'white',
  },
  fields: {
    eyebrow: { type: 'text', label: 'Antetítulo' },
    title: { type: 'text', label: 'Título' },
    subtitle: { type: 'textarea', label: 'Descripción' },
    projects: { type: 'textarea', label: 'Proyectos (Nombre | Categoría | Enlace, separados por ---)' },
    image1: { type: 'image', label: 'Imagen 1' }, image2: { type: 'image', label: 'Imagen 2' }, image3: { type: 'image', label: 'Imagen 3' },
    image4: { type: 'image', label: 'Imagen 4' }, image5: { type: 'image', label: 'Imagen 5' }, image6: { type: 'image', label: 'Imagen 6' },
    columns: { type: 'select', label: 'Columnas', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] },
    background: { type: 'select', label: 'Fondo', options: [{ value: 'white', label: 'Blanco' }, { value: 'muted', label: 'Suave' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['eyebrow', 'title', 'subtitle', 'projects'] },
    { label: 'Imágenes', fields: ['image1', 'image2', 'image3', 'image4', 'image5', 'image6'] },
    { label: 'Estilo', fields: ['columns', 'background'] },
  ],
  render(props) {
    const { eyebrow, title, subtitle, projects, columns, background } = props
    const items = parseProjects(projects).slice(0, 6)
    const min = { 2: 420, 3: 300, 4: 230 }[columns] ?? 300
    return (
      <section style={{ padding: '80px 24px', background: background === 'muted' ? TINT : 'var(--runly-color-bg, #fff)' }}>
        <style>{STYLE}</style>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          {(eyebrow || title || subtitle) && (
            <div style={{ marginBottom: '40px', fontFamily: 'var(--runly-font-sans)' }}>
              {eyebrow && <p style={{ margin: '0 0 10px', color: 'var(--runly-color-accent, #d97706)', fontSize: '12px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{eyebrow}</p>}
              {title && <h2 style={{ margin: 0, color: 'var(--runly-color-fg, #0f172a)', fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 800, lineHeight: 1.15 }}>{title}</h2>}
              {subtitle && <p style={{ margin: '12px 0 0', color: 'var(--runly-color-muted, #64748b)', fontSize: '17px', lineHeight: 1.6, maxWidth: '560px' }}>{subtitle}</p>}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: '24px' }}>
            {items.map((item, index) => {
              const image = safeImg(props[`image${index + 1}`])
              const Tag = item.href ? 'a' : 'div'
              return (
                <Tag key={index} href={item.href || undefined} className="runly-project-card" style={{ display: 'block', textDecoration: 'none', background: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 4px 18px rgba(15,23,42,.08)' }}>
                  {image
                    ? <img src={image} alt={item.name} loading="lazy" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                    : <div aria-hidden="true" style={{ aspectRatio: '4 / 3', background: 'linear-gradient(135deg, color-mix(in srgb, var(--runly-color-primary, #2563eb) 22%, #fff), color-mix(in srgb, var(--runly-color-accent, #fbbf24) 35%, #fff))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--runly-font-sans)', fontSize: '56px', fontWeight: 800, color: 'rgba(15,23,42,.35)' }}>{item.name[0]}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 20px', fontFamily: 'var(--runly-font-sans)' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '16px', color: '#0f172a' }}>{item.name}</div>
                      {item.category && <div style={{ marginTop: '2px', fontSize: '13px', color: '#64748b' }}>{item.category}</div>}
                    </div>
                    <span aria-hidden="true" style={{ flex: 'none', width: '34px', height: '34px', borderRadius: '50%', background: 'var(--runly-color-accent, #fbbf24)', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>→</span>
                  </div>
                </Tag>
              )
            })}
          </div>
        </div>
      </section>
    )
  },
})
