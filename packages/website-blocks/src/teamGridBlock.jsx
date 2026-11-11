import { defineBlock } from '@raulbellosom/atlas-web-builder'

function parseTeam(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return []
  return raw
    .split('---')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const lines = b.split('\n').map((l) => l.trim()).filter(Boolean)
      const meta  = lines[0] || ''
      const parts = meta.split('|').map((p) => p.trim())
      return {
        name: parts[0] || '',
        role: parts[1] || '',
        bio:  lines.slice(1).join(' ').trim(),
      }
    })
    .filter((m) => m.name)
}

function safeImg(src) {
  return typeof src === 'string' && /^(https?:|\/|data:image\/)/i.test(src) ? src : ''
}

const AVATAR_COLORS = ['#6D28D9', '#0369A1', '#047857', '#B45309', '#BE185D', '#1D4ED8', '#7C3AED', '#059669']

function Avatar({ name, photo, size = 80 }) {
  const safe = safeImg(photo)
  if (safe) {
    return (
      <img
        src={safe}
        alt={name}
        loading="lazy"
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }}
      />
    )
  }
  const words    = (name || '').split(' ').filter(Boolean)
  const initials = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] || '?')[0]
  const color    = AVATAR_COLORS[(name || '').charCodeAt(0) % AVATAR_COLORS.length]
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: Math.floor(size * 0.32), color: '#fff', flexShrink: 0 }}>
      {initials.toUpperCase()}
    </div>
  )
}

export const TeamGridBlock = defineBlock({
  type: 'TeamGridBlock',
  label: 'Equipo de trabajo',
  category: 'atlas',
  defaultProps: {
    eyebrow: 'Conoce al equipo',
    title: 'Las personas detrás del proyecto',
    subtitle: 'Un equipo apasionado comprometido con tu éxito.',
    columns: '3',
    layout: 'card',
    team:
      'Ana García|Directora General\nEspecialista en estrategia empresarial con más de 15 años liderando equipos hacia el éxito.\n---\nCarlos Mendoza|Director de Tecnología\nExperto en desarrollo de software y arquitectura de sistemas modernos y escalables.\n---\nSofía Ramírez|Directora de Marketing\nApasionada del marketing digital, con amplia experiencia en marcas líderes de la industria.',
    photo1: '', photo2: '', photo3: '',
    photo4: '', photo5: '', photo6: '',
  },
  fields: {
    eyebrow:  { type: 'text',     label: 'Antetítulo' },
    title:    { type: 'text',     label: 'Título' },
    subtitle: { type: 'textarea', label: 'Subtítulo' },
    columns:  { type: 'select',   label: 'Columnas', options: [
      { value: '2', label: '2 columnas' },
      { value: '3', label: '3 columnas' },
      { value: '4', label: '4 columnas' },
    ]},
    layout: { type: 'select', label: 'Estilo de tarjeta', options: [
      { value: 'card',      label: 'Tarjeta con sombra' },
      { value: 'minimal',   label: 'Minimalista' },
      { value: 'centered',  label: 'Centrado' },
    ]},
    team:   { type: 'textarea', label: 'Equipo (Nombre|Cargo, luego bio, separados por ---)' },
    photo1: { type: 'image', label: 'Foto miembro 1' },
    photo2: { type: 'image', label: 'Foto miembro 2' },
    photo3: { type: 'image', label: 'Foto miembro 3' },
    photo4: { type: 'image', label: 'Foto miembro 4' },
    photo5: { type: 'image', label: 'Foto miembro 5' },
    photo6: { type: 'image', label: 'Foto miembro 6' },
  },
  groups: [
    { label: 'Encabezado', fields: ['eyebrow', 'title', 'subtitle'] },
    { label: 'Equipo',     fields: ['team', 'columns', 'layout'] },
    { label: 'Fotos',      fields: ['photo1', 'photo2', 'photo3', 'photo4', 'photo5', 'photo6'] },
  ],
  render({ eyebrow, title, subtitle, columns, layout, team, photo1, photo2, photo3, photo4, photo5, photo6 }) {
    const cols    = Math.max(2, Math.min(4, Number(columns) || 3))
    const members = parseTeam(team)
    const photos  = [photo1, photo2, photo3, photo4, photo5, photo6]
    const isCentered = layout === 'centered'
    const isCard     = layout === 'card' || !layout

    return (
      <section style={{ padding: '80px 24px', background: 'var(--runly-color-bg, #fff)' }}>
        <div style={{ maxWidth: '1200px', marginInline: 'auto' }}>
          {eyebrow && (
            <p style={{ textAlign: 'center', margin: '0 0 12px', color: 'var(--runly-color-primary, #6D28D9)', fontFamily: 'var(--runly-font-sans)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {eyebrow}
            </p>
          )}
          {title && (
            <h2 style={{ textAlign: 'center', fontFamily: 'var(--runly-font-sans)', fontSize: 'clamp(24px, 3vw, 42px)', fontWeight: 800, color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 16px', lineHeight: 1.2 }}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p style={{ textAlign: 'center', color: 'var(--runly-color-muted, #64748b)', fontFamily: 'var(--runly-font-sans)', fontSize: '17px', lineHeight: 1.7, maxWidth: '600px', marginInline: 'auto', marginBottom: '56px' }}>
              {subtitle}
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(1100 / cols)}px), 1fr))`, gap: '28px' }}>
            {members.map((member, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: isCentered ? 'column' : 'row',
                alignItems: isCentered ? 'center' : 'flex-start',
                gap: isCentered ? '16px' : '20px',
                padding: isCard ? '28px' : '16px 0',
                background: isCard ? '#fff' : 'transparent',
                borderRadius: isCard ? '20px' : '0',
                border: isCard ? '1px solid rgba(0,0,0,0.06)' : 'none',
                boxShadow: isCard ? '0 2px 20px rgba(0,0,0,0.06)' : 'none',
                textAlign: isCentered ? 'center' : 'left',
              }}>
                <Avatar name={member.name} photo={photos[i]} size={isCentered ? 88 : 72} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--runly-font-sans)', fontWeight: 700, fontSize: '17px', color: 'var(--runly-color-fg, #0f172a)', margin: '0 0 4px' }}>
                    {member.name}
                  </p>
                  {member.role && (
                    <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '13px', fontWeight: 600, color: 'var(--runly-color-primary, #6D28D9)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {member.role}
                    </p>
                  )}
                  {member.bio && (
                    <p style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '14px', color: 'var(--runly-color-muted, #64748b)', margin: 0, lineHeight: 1.65 }}>
                      {member.bio}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  },
})
