// Bundled licensed assets, loaded on demand. Real available weights/styles are resolved below.
export const STUDIO_FONTS = Object.freeze([
  { family: 'sans-serif', name: 'Sistema', category: 'Sans', file: null },
  { family: 'Lato', name: 'Lato', category: 'Sans moderna', file: 'lato.ttf' },
  { family: 'Playfair Display', name: 'Playfair Display', category: 'Serif editorial', file: 'playfairdisplay.ttf' },
  { family: 'Bebas Neue', name: 'Bebas Neue', category: 'Display', file: 'bebasneue.ttf' },
  { family: 'Pacifico', name: 'Pacifico', category: 'Manuscrita', file: 'pacifico.ttf' },
  { family: 'Oswald', name: 'Oswald', category: 'Condensada', file: 'oswald.ttf' },
  { family: 'Space Mono', name: 'Space Mono', category: 'Monoespaciada', file: 'spacemono.ttf' },
])
export const validStudioFont = family => STUDIO_FONTS.some(font => font.family === family)
export const STUDIO_FONT_VARIANTS = Object.freeze({regular:{weight:400,style:'normal'},light:{weight:300,style:'normal'},medium:{weight:500,style:'normal'},semibold:{weight:600,style:'normal'},bold:{weight:700,style:'normal'},italic:{weight:400,style:'italic'}})
export function studioFontStyle(family,variant='regular') {
  const font=STUDIO_FONTS.find(font=>font.family===family),style=STUDIO_FONT_VARIANTS[variant]
  if(!font||!style)return null
  if(family==='Lato'&&['bold','italic'].includes(variant))return {...style,file:`lato-${variant}.ttf`}
  const weights=family==='Oswald'?[300,400,500,600,700]:family==='Playfair Display'?[400,500,600,700]:[400]
  if(style.style!=='normal'||!weights.includes(style.weight))return null
  return {...style,file:font.file}
}
