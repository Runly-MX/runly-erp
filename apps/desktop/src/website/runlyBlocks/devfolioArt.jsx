// Inline SVG line art for the "Portafolio Dev" template: ink outlines, one orange accent, no image files.
// Scenes are drawn in a 2.6px round-cap stroke; limbs use a double stroke (ink under white) so they read as outlined shapes.
export const D = {
  ink: '#1A1A1A', orange: '#F26A1B', orangeText: '#C2410C', display: '#E85D0C', cream: '#FBF6EE', peach: '#FFEBDB', peachDeep: '#FFD9BC',
  white: '#FFFFFF', muted: '#5B5249', line: '#E8DDCE',
}
export const SANS = "Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"
export const MONO = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace"

const S = { stroke: D.ink, strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' }
const Limb = ({ d, w = 16, fill = D.white }) => (
  <>
    <path d={d} {...S} fill="none" strokeWidth={w + 5} />
    <path d={d} stroke={fill} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </>
)

// Underline stroke that draws itself when the title scrolls in (see dv-draw in the block CSS).
export const Stroke = ({ width = 84, color = D.orange, style, className }) => (
  <svg className={className} aria-hidden="true" viewBox="0 0 84 10" width={width} height={(width / 84) * 10} style={{ display: 'block', overflow: 'visible', ...style }}>
    <path className="dv-draw" pathLength="100" d="M3 6 C18 1.5 30 9 46 4.5 S70 3.5 81 5.5" stroke={color} strokeWidth="3.4" strokeLinecap="round" fill="none" />
  </svg>
)

// ---------------------------------------------------------------------------------------------------------------
export function BeanbagScene({ className = '' }) {
  return (
    <svg className={className} fill="none" role="img" aria-label="Ilustración: un desarrollador con laptop sentado en un puf naranja, bajo una lámpara y junto a un librero" viewBox="0 0 580 450" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <radialGradient id="dvLampGlow" cx="50%" cy="0%" r="100%">
          <stop offset="0" stopColor={D.orange} stopOpacity=".42" />
          <stop offset="1" stopColor={D.orange} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* lamp */}
      <path d="M205 0 V74" {...S} />
      <path className="dv-glow" d="M170 150 L240 150 L262 330 L148 330 Z" fill="url(#dvLampGlow)" stroke="none" />
      <path d="M168 102 C168 82 242 82 242 102 Z" fill={D.white} {...S} />
      <path d="M185 102 H225" {...S} />
      <circle className="dv-glow" cx="205" cy="113" r="6.5" fill={D.orange} stroke={D.ink} strokeWidth="2.2" />
      <path d="M186 126 L180 136 M205 130 V142 M224 126 L230 136" {...S} stroke={D.orange} strokeWidth="2.4" />
      {/* shelf with books and plant */}
      <path d="M418 82 H568" {...S} strokeWidth="3.2" />
      <path d="M436 82 V96 M550 82 V96" {...S} strokeWidth="2.4" />
      <rect x="432" y="30" width="15" height="52" rx="2" fill={D.white} {...S} />
      <rect x="449" y="22" width="14" height="60" rx="2" fill={D.orange} {...S} />
      <rect x="465" y="34" width="14" height="48" rx="2" fill={D.white} {...S} />
      <path d="M437 42 H442 M437 50 H442" {...S} strokeWidth="1.8" />
      <g className="dv-sway" style={{ transformOrigin: '521px 82px' }}>
        <path d="M501 82 L506 56 H536 L541 82 Z" fill={D.orange} {...S} />
        <path d="M521 56 C519 42 516 30 508 22 M521 56 C524 40 534 30 546 28 M521 56 C521 44 524 26 522 12" {...S} />
        <path d="M508 22 C498 24 494 32 498 40 C508 40 512 32 508 22 Z M546 28 C554 36 552 46 544 50 C536 44 538 34 546 28 Z M522 12 C512 14 512 26 522 30 C530 24 530 14 522 12 Z" fill={D.white} {...S} strokeWidth="2.2" />
      </g>
      {/* beanbag */}
      <path d="M232 404 C224 360 236 322 270 306 C300 294 330 304 352 292 C372 262 410 194 462 180 C512 168 540 232 548 300 C556 350 546 380 544 404 Z" fill={D.orange} {...S} strokeWidth="3" />
      <path d="M404 238 C426 284 430 340 420 400 M290 330 C284 356 286 380 290 400" {...S} strokeWidth="2" opacity=".5" />
      {/* back leg */}
      <Limb d="M424 330 L366 318 L388 384" w={24} fill={D.ink} />
      <path d="M368 386 C370 374 398 372 414 380 L420 394 L364 394 Z" fill={D.orange} {...S} />
      <rect x="362" y="391" width="62" height="8" rx="4" fill={D.white} {...S} strokeWidth="2.2" />
      {/* torso */}
      <path d="M396 236 C386 266 390 300 404 332 L458 336 C468 296 464 256 450 228 C438 220 410 222 396 236 Z" fill={D.white} {...S} />
      <path d="M414 232 C420 246 440 246 446 230" {...S} strokeWidth="2.2" />
      {/* front leg */}
      <Limb d="M414 330 L334 300 L316 380" w={28} fill={D.ink} />
      <path d="M290 384 C292 370 322 366 340 376 L348 394 L286 394 Z" fill={D.orange} {...S} />
      <path d="M312 372 L318 384 M322 372 L328 384" {...S} strokeWidth="2" />
      <rect x="282" y="391" width="68" height="8" rx="4" fill={D.white} {...S} strokeWidth="2.2" />
      {/* laptop (its back faces us) */}
      <g transform="rotate(-8 338 246)">
        <rect x="290" y="212" width="100" height="66" rx="6" fill={D.white} {...S} strokeWidth="3" />
        <circle className="dv-breathe" cx="340" cy="245" r="6.500" fill={D.orange} stroke={D.ink} strokeWidth="2" />
      </g>
      <path d="M296 284 H396 L402 294 H292 Z" fill={D.white} {...S} />
      {/* arm */}
      <Limb d="M436 244 L432 290 L378 284" w={14} fill={D.white} />
      {/* head */}
      <g transform="translate(8 50)">
        <path d="M386 150 C386 126 404 112 424 118 C444 124 446 152 430 164 C418 174 392 172 386 150 Z" fill={D.white} {...S} />
        <path d="M382 148 C374 118 400 98 428 106 C448 112 452 134 448 148 C440 132 420 124 398 130 C392 134 388 142 382 148 Z" fill={D.ink} {...S} />
        <circle cx="398" cy="150" r="8" {...S} strokeWidth="2.200" fill={D.white} fillOpacity=".5" />
        <circle cx="420" cy="152" r="8" {...S} strokeWidth="2.200" fill={D.white} fillOpacity=".5" />
        <path d="M406 150 H412" {...S} strokeWidth="2" />
        <path d="M398 150 H397 M420 152 H419" {...S} strokeWidth="3.200" />
        <path d="M398 164 C404 170 414 170 420 163" {...S} strokeWidth="2.200" />
        <path d="M440 150 C446 150 446 160 440 162" {...S} strokeWidth="2.200" />
      </g>
      {/* terminal chip with blinking cursor */}
      <g className="dv-float">
        <rect x="76" y="176" width="112" height="56" rx="10" fill={D.white} {...S} />
        <path d="M76 194 H188" {...S} strokeWidth="2" />
        <circle cx="90" cy="185" r="2.4" fill={D.orange} stroke="none" />
        <circle cx="100" cy="185" r="2.4" fill={D.ink} stroke="none" />
        <path d="M90 208 L98 214 L90 220" {...S} strokeWidth="2.4" stroke={D.orange} />
        <path d="M106 220 H132" {...S} strokeWidth="2.4" />
        <rect className="dv-blink" x="138" y="208" width="8" height="13" fill={D.ink} stroke="none" />
      </g>
      <path d="M12 404 H568" {...S} strokeWidth="3" />
    </svg>
  )
}

export function WindowScene({ className = '' }) {
  return (
    <svg className={className} fill="none" role="img" aria-label="Ilustración: una persona con una taza junto a una ventana, con una pila de libros" viewBox="0 0 520 400" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {/* arched window with clouds */}
      <path d="M34 258 V112 C34 54 150 54 150 112 V258 Z" fill={D.white} {...S} strokeWidth="3" />
      <path d="M92 74 V258 M34 150 H150" {...S} strokeWidth="2" />
      <g className="dv-drift">
        <path d="M44 214 C40 196 62 188 70 200 C76 186 98 192 98 208 C110 208 114 224 102 228 H50 C40 226 38 218 44 214 Z" fill={D.peach} {...S} strokeWidth="2.2" />
        <path d="M100 138 C98 128 112 122 118 130 C124 122 140 128 138 140 H104 Z" fill={D.peach} {...S} strokeWidth="2.2" />
      </g>
      <path d="M26 262 H158" {...S} strokeWidth="3.2" />
      {/* person */}
      <path d="M182 356 C176 296 194 250 236 238 H296 C336 252 348 300 340 356 Z" fill={D.white} {...S} strokeWidth="2.8" />
      <path d="M244 238 C250 254 280 254 288 238" {...S} />
      <path d="M232 160 C232 134 250 120 272 124 C298 128 304 160 292 182 C282 200 244 200 232 176 Z" fill={D.white} {...S} strokeWidth="2.8" />
      <path d="M226 164 C216 130 242 106 274 112 C302 118 312 142 306 160 C298 140 276 132 250 138 C240 142 232 152 226 164 Z" fill={D.ink} {...S} />
      <path d="M246 108 C250 96 266 94 272 104 M270 106 C276 94 294 96 296 108" {...S} />
      <circle cx="286" cy="166" r="3" fill={D.ink} stroke="none" />
      <path d="M296 172 L304 178 L296 180" {...S} strokeWidth="2.2" />
      <path d="M282 188 C288 192 296 190 300 184" {...S} strokeWidth="2.2" />
      <path d="M236 166 C228 166 228 178 238 180" {...S} strokeWidth="2.2" />
      {/* arm and mug */}
      <Limb d="M318 262 L330 330 L376 296" w={15} fill={D.white} />
      <path d="M372 270 H414 V316 C414 326 406 332 396 332 H390 C380 332 372 326 372 316 Z" fill={D.orange} {...S} strokeWidth="2.8" />
      <path d="M414 282 C434 280 436 310 414 308" {...S} strokeWidth="2.8" />
      <path d="M372 276 H414" {...S} strokeWidth="2" />
      <path className="dv-steam" d="M386 258 C382 248 392 244 388 234 M400 258 C396 248 406 244 402 234" {...S} strokeWidth="2.2" />
      {/* books */}
      <rect x="388" y="344" width="110" height="20" rx="3" fill={D.white} {...S} />
      <rect x="396" y="324" width="98" height="20" rx="3" fill={D.orange} {...S} />
      <rect x="384" y="304" width="106" height="20" rx="3" fill={D.white} {...S} />
      <path d="M392 354 H430 M404 334 H436 M394 314 H424" {...S} strokeWidth="1.8" />
      <path d="M8 364 H512" {...S} strokeWidth="3" />
    </svg>
  )
}

// A desk scene for inner page heroes: monitor, lamp and a plant, same line language.
export function DeskScene({ className = '' }) {
  return (
    <svg className={className} fill="none" role="img" aria-label="Ilustración: un escritorio con monitor, lámpara y planta" viewBox="0 0 520 380" style={{ width: '100%', height: 'auto', display: 'block' }}>
      <path d="M12 330 H508" {...S} strokeWidth="3" />
      <path d="M60 330 V240 M450 330 V240 M44 240 H466" {...S} strokeWidth="3" />
      <g className="dv-float">
        <rect x="130" y="64" width="250" height="152" rx="10" fill={D.white} {...S} strokeWidth="3" />
        <rect x="142" y="76" width="226" height="128" rx="4" fill={D.peach} {...S} strokeWidth="2" />
        <path d="M154 94 H214 M154 108 H196 M154 122 H228" {...S} strokeWidth="2.2" />
        <path d="M168 150 L186 168 L168 186 M196 186 H226" {...S} stroke={D.orange} strokeWidth="3" />
        <rect className="dv-blink" x="236" y="176" width="8" height="14" fill={D.ink} stroke="none" />
        <rect x="262" y="90" width="92" height="100" rx="6" fill={D.white} {...S} strokeWidth="2" />
        <path d="M274 112 H342 M274 126 H330 M274 140 H338" {...S} strokeWidth="2" />
        <rect x="274" y="158" width="40" height="18" rx="4" fill={D.orange} {...S} strokeWidth="2" />
      </g>
      <path d="M240 216 L232 240 M272 216 L280 240 M212 240 H300" {...S} strokeWidth="3" />
      <path d="M92 240 V190 L128 150" {...S} strokeWidth="3" />
      <path d="M108 150 C112 130 150 130 154 150 Z" fill={D.white} {...S} />
      <circle className="dv-glow" cx="130" cy="158" r="5.5" fill={D.orange} stroke={D.ink} strokeWidth="2" />
      <g className="dv-sway" style={{ transformOrigin: '420px 240px' }}>
        <path d="M402 240 L407 206 H433 L438 240 Z" fill={D.orange} {...S} />
        <path d="M420 206 C418 188 410 176 400 168 M420 206 C424 188 436 176 450 174 M420 206 C420 190 424 170 420 154" {...S} />
        <path d="M400 168 C390 170 386 180 392 188 C402 186 406 176 400 168 Z M450 174 C458 182 456 192 446 196 C440 188 442 178 450 174 Z M420 154 C410 156 410 170 420 176 C430 170 430 156 420 154 Z" fill={D.white} {...S} strokeWidth="2.2" />
      </g>
      <rect x="300" y="228" width="52" height="12" rx="2" fill={D.white} {...S} />
      <rect x="308" y="216" width="40" height="12" rx="2" fill={D.orange} {...S} />
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// 24x24 line icons. Colour comes from `currentColor`.
const T = ({ children, x = 12, y = 15.6, size = 8.6 }) => <text x={x} y={y} textAnchor="middle" fontSize={size} fontWeight="700" fill="currentColor" stroke="none" fontFamily={SANS}>{children}</text>
const ICONS = {
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /></>,
  code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" /></>,
  book: <><path d="M2.5 5.5C5 4 8.5 4 12 6c3.5-2 7-2 9.5-.5v13c-2.500-1.500-6-1.500-9.500.5-3.500-2-7-2-9.500-.5Z" /><path d="M12 6v13" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.600 2.900-6 6.500-6s6.500 2.400 6.500 6" /><circle cx="17" cy="9" r="2.600" /><path d="M17 14c2.800 0 4.500 2 4.500 5" /></>,
  spark: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100" /><circle cx="12" cy="12" r="3.200" /></>,
  js: <><rect x="3" y="3" width="18" height="18" rx="3" /><T>JS</T></>,
  ts: <><rect x="3" y="3" width="18" height="18" rx="3" /><T>TS</T></>,
  react: <><ellipse cx="12" cy="12" rx="9.500" ry="3.800" /><ellipse cx="12" cy="12" rx="9.500" ry="3.800" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9.500" ry="3.800" transform="rotate(120 12 12)" /><circle cx="12" cy="12" r="1.500" fill="currentColor" /></>,
  next: <><circle cx="12" cy="12" r="9.500" /><path d="M9 8v8M9 8l7 9M15.500 8v4.500" /></>,
  node: <><path d="M12 2.500 20.500 7.500v9L12 21.500 3.500 16.500v-9Z" /><T size="7.600">JS</T></>,
  mongo: <><path d="M12 2.500C8 7 6.500 10.500 6.500 14a5.500 5.500 0 0 0 11 0c0-3.500-1.500-7-5.500-11.500Z" /><path d="M12 8v13.500" /></>,
  tailwind: <><path d="M3 10c1.200-3.600 3.600-5 6-4.200 2 .7 3 3 6.500 3.400M3 17.500c1.200-3.600 3.600-5 6-4.200 2 .7 3 3 6.500 3.400" transform="translate(2.500 -.5)" /></>,
  git: <><circle cx="12" cy="12" r="9.500" /><circle cx="8.800" cy="8" r="1.700" /><circle cx="8.800" cy="16.200" r="1.700" /><circle cx="15.600" cy="11" r="1.700" /><path d="M8.800 9.700v4.800M10.400 8.600c3 .2 4 1 4.600 1.800" /></>,
  dots: <><circle cx="5" cy="12" r="1.600" fill="currentColor" /><circle cx="12" cy="12" r="1.600" fill="currentColor" /><circle cx="19" cy="12" r="1.600" fill="currentColor" /></>,
  briefcase: <><rect x="3" y="7.500" width="18" height="12.500" rx="2.500" /><path d="M9 7.500V5.500A1.500 1.500 0 0 1 10.500 4h3A1.500 1.500 0 0 1 15 5.500v2M3 13h18M11 13h2" /></>,
  window: <><rect x="2.500" y="4" width="19" height="16" rx="2.500" /><path d="M2.500 8.500h19M9 12.500l-2 2 2 2M15 12.500l2 2-2 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.400 3.600-7 8-7s8 2.600 8 7" /></>,
  search: <><circle cx="10.500" cy="10.500" r="6.500" /><path d="m15.500 15.500 5 5" /></>,
  pencil: <><path d="M4 20l1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500Z" /><path d="m14.500 6 3.500 3.500" /></>,
  rocket: <><path d="M12 2.500c3.500 2 5 6 4.500 10.500l-2.500 2.500h-4L7.500 13C7 8.500 8.500 4.500 12 2.500Z" /><circle cx="12" cy="9.500" r="1.800" /><path d="M7.500 13 4.500 15.500 7 17M16.500 13l3 2.500L17 17M10 18.500l-.8 3M14 18.500l.8 3" /></>,
  chart: <><path d="M3 20h18M5.500 17v-5M10.500 17V8M15.500 17v-7M20 17V5" /><path d="m4 9 5-4 4 3 7-5" opacity=".0" /></>,
  mail: <><rect x="2.500" y="5" width="19" height="14" rx="2.500" /><path d="m3 7 9 6.500L21 7" /></>,
  phone: <><path d="M5 3.500h3.500l1.800 4.500-2.300 1.500a11 11 0 0 0 6 6l1.500-2.300 4.500 1.800V19a2 2 0 0 1-2 2A16 16 0 0 1 3 5.500a2 2 0 0 1 2-2Z" /></>,
  pin: <><path d="M12 21.500c4.500-4.500 7-8 7-11.500a7 7 0 0 0-14 0c0 3.500 2.500 7 7 11.500Z" /><circle cx="12" cy="10" r="2.600" /></>,
  link: <><path d="M14 4h6v6M20 4l-9 9M18 14v5a1.500 1.500 0 0 1-1.500 1.500h-11A1.500 1.500 0 0 1 4 19V8a1.500 1.500 0 0 1 1.500-1.500H10" /></>,
  arrow: <><path d="M4 12h15M13 6l6 6-6 6" /></>,
  download: <><path d="M12 3.500v12M7 11l5 5 5-5M4 20.500h16" /></>,
  github: <><path d="M12 2.500a9.500 9.500 0 0 0-3 18.500c.5.100.6-.2.600-.5v-1.800c-2.700.6-3.300-1.200-3.300-1.200-.4-1.100-1.100-1.400-1.100-1.400-.9-.6.100-.6.100-.6 1 .1 1.500 1 1.500 1 .9 1.500 2.300 1.100 2.800.8.1-.6.400-1.100.6-1.300-2.200-.3-4.400-1.100-4.400-4.800 0-1.100.4-1.900 1-2.600-.1-.3-.4-1.300.1-2.600 0 0 .8-.3 2.700 1a9 9 0 0 1 4.900 0c1.900-1.300 2.700-1 2.700-1 .5 1.300.2 2.300.1 2.600.6.700 1 1.500 1 2.600 0 3.700-2.300 4.500-4.400 4.800.4.300.7.900.7 1.800v2.700c0 .3.200.6.700.5A9.500 9.500 0 0 0 12 2.500Z" /></>,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10.500V16M8 7.600v.1M12 16v-5.500M12 13c0-1.600 1-2.600 2.300-2.600 1.400 0 2.200 1 2.200 2.600V16" /></>,
  x: <><path d="M4 4l16 16M20 4 4 20" /></>,
  check: <><path d="m4.500 12.500 5 5 10-11" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.500h.1M7 16.500h.1" /></>,
  heart: <><path d="M12 20.500C5 15.500 3 12 3 9a4.500 4.500 0 0 1 9-1.500A4.500 4.500 0 0 1 21 9c0 3-2 6.500-9 11.500Z" /></>,
  coffee: <><path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" /><path d="M17 11h1.500a2.500 2.500 0 0 1 0 5H17M8 3v3M12 3v3" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.500 2" /></>,
}
export const ICON_NAMES = Object.keys(ICONS)
export function Icon({ name, size = 24, stroke = 1.8, style }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none', ...style }}>
      {ICONS[name] ?? ICONS.dots}
    </svg>
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Device mockups with simple UI lines, drawn on a 280x180 canvas.
const Lines = ({ x, y, w, rows = 3, gap = 10 }) => <path d={Array.from({ length: rows }, (_, i) => `M${x} ${y + i * gap} h${i === rows - 1 ? w * 0.6 : w}`).join(' ')} {...S} strokeWidth="2" />
const Screen = ({ kind, x, y, w, h }) => {
  const k = kind % 4
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="3" fill={D.white} {...S} strokeWidth="2" />
      <path d={`M${x} ${y + 12} H${x + w}`} {...S} strokeWidth="1.800" />
      <circle cx={x + 7} cy={y + 6} r="1.800" fill={D.orange} stroke="none" />
      <circle cx={x + 14} cy={y + 6} r="1.800" fill={D.ink} stroke="none" />
      {k === 0 && <><rect x={x + 8} y={y + 20} width={w * 0.34} height={h - 30} rx="3" fill={D.peach} {...S} strokeWidth="1.800" /><Lines x={x + w * 0.42} y={y + 24} w={w * 0.46} rows={4} gap={11} /><rect x={x + w * 0.42} y={y + h - 22} width={w * 0.24} height="11" rx="3" fill={D.orange} {...S} strokeWidth="1.800" /></>}
      {k === 1 && <><path d={`M${x + 10} ${y + h - 14} L${x + w * 0.28} ${y + h * 0.52} L${x + w * 0.46} ${y + h * 0.66} L${x + w * 0.66} ${y + h * 0.34} L${x + w - 10} ${y + h * 0.46}`} {...S} stroke={D.orange} strokeWidth="3" /><path d={`M${x + 10} ${y + 22} h${w * 0.3}`} {...S} strokeWidth="2" /><path d={`M${x + 10} ${y + h - 8} H${x + w - 10}`} {...S} strokeWidth="1.600" opacity=".5" /></>}
      {k === 2 && <>{[0, 1, 2].map((i) => <g key={i}><circle cx={x + 14} cy={y + 28 + i * 20} r="5" fill={i === 1 ? D.orange : D.white} {...S} strokeWidth="1.800" /><Lines x={x + 26} y={y + 25 + i * 20} w={w * 0.5} rows={2} gap={7} /></g>)}<rect x={x + w - 34} y={y + 22} width="24" height="48" rx="4" fill={D.peach} {...S} strokeWidth="1.800" /></>}
      {k === 3 && <><rect x={x + 8} y={y + 20} width={w - 16} height="22" rx="3" fill={D.peach} {...S} strokeWidth="1.800" />{[0, 1, 2].map((i) => <rect key={i} x={x + 8 + i * ((w - 16) / 3 + 1)} y={y + 48} width={(w - 16) / 3 - 6} height={h - 58} rx="3" fill={i === 0 ? D.orange : D.white} {...S} strokeWidth="1.800" />)}</>}
    </g>
  )
}

export function Device({ type = 'monitor', kind = 0 }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 280 180" style={{ width: '100%', height: 'auto', display: 'block' }}>
      {type === 'monitor' && <><rect x="40" y="12" width="200" height="124" rx="8" fill={D.ink} {...S} strokeWidth="3" /><Screen kind={kind} x={48} y={20} w={184} h={108} /><path d="M126 136 L120 158 H160 L154 136 M104 160 H176" {...S} strokeWidth="3" /></>}
      {type === 'laptop' && <><rect x="52" y="16" width="176" height="112" rx="8" fill={D.white} {...S} strokeWidth="3" /><Screen kind={kind} x={60} y={24} w={160} h={96} /><path d="M24 132 H256 L246 148 H34 Z" fill={D.white} {...S} strokeWidth="3" /><path d="M120 140 H160" {...S} strokeWidth="2" /></>}
      {type === 'phone' && <g transform="rotate(8 140 90)"><rect x="98" y="6" width="84" height="168" rx="16" fill={D.white} {...S} strokeWidth="3" /><rect x="105" y="20" width="70" height="140" rx="4" fill={D.white} {...S} strokeWidth="1.800" /><path d="M128 12 H152" {...S} strokeWidth="2.400" /><Screen kind={kind} x={105} y={28} w={70} h={124} /></g>}
    </svg>
  )
}

// Shared CSS: motion is limited to transform/opacity and fully disabled under prefers-reduced-motion.
export const DEV_CSS = `
.dv,.dv *{box-sizing:border-box}
.dv a:focus-visible,.dv button:focus-visible,.dv summary:focus-visible,.dv input:focus-visible{outline:3px solid ${D.ink};outline-offset:3px;border-radius:4px}
.dv a.dv-btn:focus-visible{outline-color:${D.orangeText}}
@keyframes dv-glow{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes dv-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes dv-sway{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.8deg)}}
@keyframes dv-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes dv-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}
@keyframes dv-steam{0%{opacity:0;transform:translateY(6px)}40%{opacity:.9}100%{opacity:0;transform:translateY(-8px)}}
@keyframes dv-drift{0%,100%{transform:translateX(0)}50%{transform:translateX(7px)}}
@keyframes dv-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes dv-draw{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
@keyframes dv-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes dv-par{from{transform:translateY(0)}to{transform:translateY(-28px)}}
.dv-draw{stroke-dasharray:100;stroke-dashoffset:0}
.dv-grow{transform-origin:left center}
.dv svg .dv-glow,.dv svg .dv-blink,.dv svg .dv-breathe,.dv svg .dv-steam{transform-box:fill-box;transform-origin:center}
.dv svg .dv-sway{transform-box:view-box}
@media (prefers-reduced-motion:no-preference){
.dv svg .dv-glow{animation:dv-glow 4.5s ease-in-out infinite}
.dv svg .dv-blink{animation:dv-blink 1.1s steps(1) infinite}
.dv svg .dv-breathe{animation:dv-breathe 3.2s ease-in-out infinite}
.dv svg .dv-sway{animation:dv-sway 6s ease-in-out infinite}
.dv svg .dv-float{animation:dv-float 7s ease-in-out infinite}
.dv svg .dv-steam{animation:dv-steam 3.4s ease-out infinite}
.dv svg .dv-drift{animation:dv-drift 9s ease-in-out infinite}
.dv-in{animation:dv-rise .7s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*90ms)}
@supports (animation-timeline:view()){
 .dv-draw{animation:dv-draw linear both;animation-timeline:view();animation-range:entry 20% entry 90%}
 .dv-grow{animation:dv-grow linear both;animation-timeline:view();animation-range:entry 10% entry 80%}
 .dv-rv{animation:dv-rise linear both;animation-timeline:view();animation-range:entry calc(var(--i,0)*4%) entry calc(36% + var(--i,0)*4%)}
 .dv-par{animation:dv-par linear both;animation-timeline:scroll(root);animation-range:0 700px}
}
}
@media (prefers-reduced-motion:reduce){.dv *,.dv{animation:none!important;transition:none!important}}
.dv-btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:0 24px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none;border:2px solid ${D.ink};transition:transform .18s ease,box-shadow .18s ease,background .18s ease}
.dv-btn:hover{transform:translateY(-2px);box-shadow:0 6px 0 -1px ${D.ink}}
.dv-btn:active{transform:translateY(0);box-shadow:none}
`

export const lines = (raw) => String(raw ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
export const cells = (raw) => lines(raw).map((line) => line.split('|').map((part) => part.trim()))
export const WRAP = { maxWidth: '1160px', marginInline: 'auto', padding: '0 clamp(20px, 4vw, 40px)' }
export const safeHref = (value) => (/^(https?:|mailto:|tel:|\/|#)/i.test(value ?? '') ? value : '#')
