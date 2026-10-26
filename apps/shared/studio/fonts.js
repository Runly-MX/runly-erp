// Bundled licensed assets (OFL-1.1, provenance in apps/desktop/public/studio-fonts/sources.json),
// loaded on demand. Each family lists the variants it really has and the file
// that renders them; variable fonts reuse one file for several weights.
const weights = (file, list) => Object.fromEntries(list.map(variant => [variant, file]))

export const STUDIO_FONTS = Object.freeze([
  { family: 'sans-serif', name: 'Sistema', category: 'Sans', file: null, variants: { regular: null } },
  { family: 'Lato', name: 'Lato', category: 'Sans moderna', file: 'lato.ttf', variants: { light: 'lato-light.ttf', regular: 'lato.ttf', bold: 'lato-bold.ttf', italic: 'lato-italic.ttf' } },
  { family: 'Montserrat', name: 'Montserrat', category: 'Sans geométrica', file: 'montserrat.ttf', variants: { ...weights('montserrat.ttf', ['light', 'regular', 'medium', 'semibold', 'bold']), italic: 'montserrat-italic.ttf' } },
  { family: 'Poppins', name: 'Poppins', category: 'Sans geométrica', file: 'poppins.ttf', variants: { light: 'poppins-light.ttf', regular: 'poppins.ttf', medium: 'poppins-medium.ttf', semibold: 'poppins-semibold.ttf', bold: 'poppins-bold.ttf', italic: 'poppins-italic.ttf' } },
  { family: 'Raleway', name: 'Raleway', category: 'Sans elegante', file: 'raleway.ttf', variants: { ...weights('raleway.ttf', ['light', 'regular', 'medium', 'semibold', 'bold']), italic: 'raleway-italic.ttf' } },
  { family: 'Nunito', name: 'Nunito', category: 'Sans redondeada', file: 'nunito.ttf', variants: { ...weights('nunito.ttf', ['light', 'regular', 'medium', 'semibold', 'bold']), italic: 'nunito-italic.ttf' } },
  { family: 'Playfair Display', name: 'Playfair Display', category: 'Serif editorial', file: 'playfairdisplay.ttf', variants: { ...weights('playfairdisplay.ttf', ['regular', 'medium', 'semibold', 'bold']), italic: 'playfairdisplay-italic.ttf' } },
  { family: 'Lora', name: 'Lora', category: 'Serif de lectura', file: 'lora.ttf', variants: { ...weights('lora.ttf', ['regular', 'medium', 'semibold', 'bold']), italic: 'lora-italic.ttf' } },
  { family: 'Bebas Neue', name: 'Bebas Neue', category: 'Display', file: 'bebasneue.ttf', variants: { regular: 'bebasneue.ttf' } },
  { family: 'Oswald', name: 'Oswald', category: 'Condensada', file: 'oswald.ttf', variants: weights('oswald.ttf', ['light', 'regular', 'medium', 'semibold', 'bold']) },
  { family: 'Pacifico', name: 'Pacifico', category: 'Manuscrita', file: 'pacifico.ttf', variants: { regular: 'pacifico.ttf' } },
  { family: 'Dancing Script', name: 'Dancing Script', category: 'Manuscrita', file: 'dancingscript.ttf', variants: weights('dancingscript.ttf', ['regular', 'medium', 'semibold', 'bold']) },
  { family: 'Space Mono', name: 'Space Mono', category: 'Monoespaciada', file: 'spacemono.ttf', variants: { regular: 'spacemono.ttf' } },
])
export const validStudioFont = family => STUDIO_FONTS.some(font => font.family === family)
export const STUDIO_FONT_VARIANTS = Object.freeze({regular:{weight:400,style:'normal'},light:{weight:300,style:'normal'},medium:{weight:500,style:'normal'},semibold:{weight:600,style:'normal'},bold:{weight:700,style:'normal'},italic:{weight:400,style:'italic'}})
export function studioFontStyle(family,variant='regular') {
  const font=STUDIO_FONTS.find(font=>font.family===family),style=STUDIO_FONT_VARIANTS[variant]
  if(!font||!style||!(variant in font.variants))return null
  return {...style,file:font.variants[variant]}
}
