import { defineBlock } from '@raulbellosom/atlas-web-builder'

const safeImg = (src) => (typeof src === 'string' && /^(https?:|\/|data:image\/)/i.test(src) ? src : '')
const STYLE = '.runly-logo{opacity:.55;filter:grayscale(1);transition:opacity 200ms ease,filter 200ms ease}.runly-logo:hover{opacity:1;filter:none}'

export const LogoCloudBlock = defineBlock({
  type: 'LogoCloudBlock',
  label: 'Logos de clientes',
  category: 'atlas',
  defaultProps: {
    title: 'Marcas que confían en mí',
    names: 'oceanic\npaperplane\nleaf & co.\nnorthern\nsundaze\nhive digital',
    logo1: '', logo2: '', logo3: '', logo4: '', logo5: '', logo6: '',
    background: 'white',
  },
  fields: {
    title: { type: 'text', label: 'Título (opcional)' },
    names: { type: 'textarea', label: 'Nombres de marca (uno por línea; se muestran si no hay logo)' },
    logo1: { type: 'image', label: 'Logo 1' }, logo2: { type: 'image', label: 'Logo 2' }, logo3: { type: 'image', label: 'Logo 3' },
    logo4: { type: 'image', label: 'Logo 4' }, logo5: { type: 'image', label: 'Logo 5' }, logo6: { type: 'image', label: 'Logo 6' },
    background: { type: 'select', label: 'Fondo', options: [{ value: 'white', label: 'Blanco' }, { value: 'muted', label: 'Suave' }] },
  },
  groups: [
    { label: 'Contenido', fields: ['title', 'names'] },
    { label: 'Logos', fields: ['logo1', 'logo2', 'logo3', 'logo4', 'logo5', 'logo6'] },
    { label: 'Estilo', fields: ['background'] },
  ],
  render(props) {
    const names = String(props.names ?? '').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 6)
    return (
      <section style={{ padding: '48px 24px', background: props.background === 'muted' ? 'color-mix(in srgb, var(--runly-color-primary, #2563eb) 6%, var(--runly-color-bg, #fff))' : 'var(--runly-color-bg, #fff)' }}>
        <style>{STYLE}</style>
        <div style={{ maxWidth: '1100px', marginInline: 'auto', textAlign: 'center' }}>
          {props.title && <p style={{ margin: '0 0 28px', color: 'var(--runly-color-muted, #64748b)', fontFamily: 'var(--runly-font-sans)', fontSize: '13px', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>{props.title}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '28px 56px' }}>
            {names.map((name, index) => {
              const logo = safeImg(props[`logo${index + 1}`])
              return logo
                ? <img key={index} className="runly-logo" src={logo} alt={name} loading="lazy" style={{ height: '32px', width: 'auto', maxWidth: '140px', objectFit: 'contain' }} />
                : <span key={index} className="runly-logo" style={{ fontFamily: 'var(--runly-font-sans)', fontSize: '22px', fontWeight: 800, letterSpacing: '-.02em', color: 'var(--runly-color-fg, #0f172a)' }}>{name}</span>
            })}
          </div>
        </div>
      </section>
    )
  },
})
