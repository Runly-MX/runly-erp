// Inline SVG still life for the "Habitia" lookbook template: vases, lamp, plants and arches drawn from a few shapes,
// so there are no image files. Every object is drawn standing on y=0, centred on x=0, about 90 units tall.
export const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
export const SANS = "Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"
export const H = {
  terracotta: '#C0704A', clay: '#A4522E', cream: '#F3E9DC', paper: '#FFFDF8', sand: '#E4D3BD', sage: '#7F9373', moss: '#4D6B4A',
  umber: '#2A1E17', mustard: '#D9A441', blush: '#E6B8A2', ink: '#2A1E17', text: '#6B5A4C', accent: '#8F4424',
}

const At = ({ x = 0, y = 0, s = 1, r = 0, children }) => <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>{children}</g>

export const Vase = ({ body = H.cream, band = H.clay, ...place }) => (
  <At {...place}>
    <path d="M-20 0C-34-26-28-50-11-60L-8-84H8L11-60C28-50 34-26 20 0Z" fill={body} />
    <path d="M-20 0C-34-26-28-50-11-60L-8-84H-2L-5-60C-20-50-24-26-12 0Z" fill="#000" opacity=".1" />
    <ellipse cx="0" cy="-84" rx="8" ry="2.6" fill={H.umber} opacity=".55" />
    <path d="M-24-30C-10-23 10-23 24-30" stroke={band} strokeWidth="3" fill="none" />
  </At>
)

export const RoundVase = ({ body = H.terracotta, ...place }) => (
  <At {...place}>
    <circle cy="-28" r="28" fill={body} />
    <path d="M-9-54L-7-72H7L9-54Z" fill={body} />
    <path d="M-22-14A28 28 0 0 0 4 0 28 28 0 0 1-22-14Z" fill="#000" opacity=".12" />
    <ellipse cy="-72" rx="7" ry="2.2" fill={H.umber} opacity=".5" />
    <path d="M-16-36C-6-42 6-42 16-36" stroke={H.cream} strokeWidth="2.5" fill="none" opacity=".7" />
  </At>
)

export const Lamp = ({ id = 'lamp', glow = true, ...place }) => (
  <At {...place}>
    {glow && (
      <>
        <defs><radialGradient id={`${id}-g`}><stop offset="0" stopColor="#FFD58A" stopOpacity=".75" /><stop offset="1" stopColor="#FFD58A" stopOpacity="0" /></radialGradient></defs>
        <circle className="hb-glow" cy="-72" r="86" fill={`url(#${id}-g)`} />
      </>
    )}
    <path d="M-15 0C-24-16-20-34-6-42H6C20-34 24-16 15 0Z" fill={H.moss} />
    <rect x="-2" y="-52" width="4" height="12" fill={H.umber} />
    <path d="M-32-52L32-52L19-92H-19Z" fill="#F6E3C0" />
    <path d="M-32-52L-19-92H-8L-18-52Z" fill="#fff" opacity=".35" />
    <ellipse cy="-52" rx="32" ry="4" fill="#E2C896" />
  </At>
)

const LEAVES = [[-62, 56], [-38, 74], [-14, 88], [12, 80], [36, 70], [60, 52]]
export const Plant = ({ pot = H.clay, ...place }) => (
  <At {...place}>
    {LEAVES.map(([angle, length], index) => (
      <g key={angle} transform={`translate(0 -38) rotate(${angle})`}>
        <ellipse cy={-length / 2} rx="9" ry={length / 2} fill={index % 2 ? H.sage : H.moss} />
        <path d={`M0 0V${-length + 6}`} stroke="#fff" strokeOpacity=".28" strokeWidth="1.4" />
      </g>
    ))}
    <path d="M-18 0L-14-34H14L18 0Z" fill={pot} />
    <rect x="-17" y="-40" width="34" height="8" rx="2" fill={pot} />
    <rect x="-17" y="-40" width="34" height="3" rx="1.5" fill="#fff" opacity=".18" />
  </At>
)

export const Bowl = ({ body = H.sand, ...place }) => (
  <At {...place}>
    <path d="M-32-20H32C30-6 18 0 0 0S-30-6-32-20Z" fill={body} />
    <ellipse cy="-20" rx="32" ry="5" fill={H.umber} opacity=".35" />
    <path d="M-26-10C-10-5 10-5 26-10" stroke={H.clay} strokeWidth="2.5" fill="none" />
  </At>
)

export const Candle = ({ ...place }) => (
  <At {...place}>
    <rect x="-7" y="-34" width="14" height="34" rx="2" fill={H.cream} />
    <rect x="-7" y="-34" width="5" height="34" rx="2" fill="#000" opacity=".07" />
    <path d="M0-37C-6-45-3-52 0-58 3-52 6-45 0-37Z" fill={H.mustard} />
  </At>
)

export const Books = ({ ...place }) => (
  <At {...place}>
    <rect x="-30" y="-10" width="60" height="10" rx="1.5" fill={H.moss} />
    <rect x="-26" y="-21" width="52" height="11" rx="1.5" fill={H.terracotta} />
    <rect x="-32" y="-30" width="58" height="9" rx="1.5" fill={H.sand} />
  </At>
)

// A rounded-top arch frame: the recurring motif of the template.
export const archPath = (x, y, w, h) => `M${x} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${x + w} ${y + w / 2}V${y + h}Z`

// The cover composition. Layers overlap on purpose: sage disc over the arch, objects over the plinth, plant over everything.
export function HeroScene({ id = 'hs', badge = 'Lookbook · Otoño · 2026 ·', tag = 'Jarrón Duna · $1,290' }) {
  return (
    <svg role="img" aria-label="Composición de jarrones, lámpara y planta sobre un arco terracota" viewBox="0 0 560 620" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
      <path d={archPath(70, 40, 420, 520)} fill={H.terracotta} />
      <path d={archPath(100, 76, 360, 484)} fill="none" stroke={H.cream} strokeOpacity=".5" strokeWidth="2" />
      <circle cx="95" cy="470" r="56" fill={H.mustard} />
      <circle cx="432" cy="170" r="84" fill={H.sage} />
      <path id={`${id}-ring`} d="M432 170m-62 0a62 62 0 1 1 124 0a62 62 0 1 1-124 0" fill="none" />
      <g className="hb-spin"><text fontFamily={SANS} fontSize="12" fontWeight="700" fill={H.cream}><textPath href={`#${id}-ring`} startOffset="0" textLength="384" lengthAdjust="spacing">{badge.toUpperCase()}</textPath></text></g>
      <rect x="0" y="548" width="560" height="72" fill={H.sand} />
      <rect x="116" y="462" width="330" height="96" fill="#5B3C2B" />
      <rect x="116" y="462" width="330" height="8" fill="#000" opacity=".3" />
      <Lamp id={`${id}-l`} x={170} y={462} s={1.45} />
      <Vase x={262} y={462} s={1.7} body={H.cream} band={H.clay} />
      <RoundVase x={345} y={462} s={1.3} body={H.blush} />
      <Candle x={402} y={462} s={1.1} />
      <Bowl x={480} y={560} s={1.1} />
      <Plant x={500} y={548} s={1.9} pot={H.clay} />
      <g transform="translate(48 96) rotate(-7)">
        <rect width="196" height="62" rx="3" fill={H.paper} stroke={H.umber} strokeOpacity=".15" />
        <circle cx="16" cy="16" r="4" fill={H.clay} />
        <text x="30" y="21" fontFamily={SANS} fontSize="10" fontWeight="700" letterSpacing="2" fill={H.accent}>Nº 07</text>
        <text x="16" y="46" fontFamily={SERIF} fontSize="17" fontStyle="italic" fill={H.umber}>{tag}</text>
      </g>
    </svg>
  )
}

// Smaller still lifes for the page mastheads, stories, the quote spread and the closing.
export function StillLife({ scene = 'sala', id = 'sl' }) {
  const arch = (fill) => <path d={archPath(60, 30, 280, 330)} fill={fill} />
  return (
    <svg role="img" aria-label="Ilustración de objetos para el hogar" viewBox="0 0 400 400" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {scene === 'taller' && (
        <>
          {arch(H.sage)}
          <circle cx="320" cy="90" r="46" fill={H.mustard} />
          <rect x="30" y="340" width="340" height="14" fill={H.umber} />
          <Books x={90} y={340} s={1.4} /><Vase x={170} y={340} s={1.5} body={H.cream} /><Bowl x={250} y={340} s={1.1} /><Candle x={310} y={340} s={1.2} />
        </>
      )}
      {scene === 'mesa' && (
        <>
          {arch(H.blush)}
          <circle cx="90" cy="120" r="52" fill={H.terracotta} />
          <rect x="40" y="300" width="320" height="12" rx="3" fill={H.umber} />
          <rect x="70" y="312" width="10" height="60" fill={H.umber} /><rect x="320" y="312" width="10" height="60" fill={H.umber} />
          <Lamp id={`${id}-l`} x={110} y={300} s={1.3} /><RoundVase x={220} y={300} s={1.5} body={H.moss} /><Plant x={310} y={300} s={1.1} />
        </>
      )}
      {scene === 'sala' && (
        <>
          {arch(H.terracotta)}
          <circle cx="310" cy="100" r="50" fill={H.sage} />
          <rect x="20" y="344" width="360" height="12" fill={H.sand} />
          <Plant x={90} y={344} s={1.5} pot={H.clay} /><Vase x={190} y={344} s={1.6} body={H.cream} /><RoundVase x={262} y={344} s={1.2} body={H.blush} /><Candle x={320} y={344} s={1.1} />
        </>
      )}
    </svg>
  )
}

// A single object by keyword, used by the piece cards.
export function ObjectArt({ kind, id = 'ob' }) {
  const place = { x: 100, y: 150, s: 1.55 }
  return (
    <svg aria-hidden="true" viewBox="0 0 200 170" style={{ width: '100%', height: '100%', display: 'block' }}>
      {kind === 'lampara' && <Lamp id={id} {...place} s={1.4} />}
      {kind === 'planta' && <Plant {...place} s={1.2} />}
      {kind === 'cuenco' && <Bowl {...place} s={2.1} />}
      {kind === 'vela' && <Candle {...place} s={2.4} />}
      {kind === 'libros' && <Books {...place} s={2.2} />}
      {(kind === 'jarron' || !['lampara', 'planta', 'cuenco', 'vela', 'libros'].includes(kind)) && <Vase {...place} s={1.6} />}
    </svg>
  )
}
