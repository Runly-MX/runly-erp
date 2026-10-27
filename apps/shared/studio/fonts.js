// Licensed, unmodified Google Fonts assets. See public/studio-fonts/sources.json.
// Only declared real weights/styles are offered; files load on demand.
const weights = (file, variants) => Object.fromEntries(variants.map(variant => [variant, file]))

export const STUDIO_FONTS = Object.freeze([
  { family: "sans-serif", name: "Sistema", category: "Sans", file: null, variants: { regular: null } },
  { family: "Lato", name: "Lato", category: "Sans moderna", file: "lato.ttf", variants: { thin: "lato-thin.ttf", thinItalic: "lato-thin-italic.ttf", extralight: "lato-extralight.ttf", extralightItalic: "lato-extralight-italic.ttf", light: "lato-light.ttf", lightItalic: "lato-light-italic.ttf", regular: "lato.ttf", italic: "lato-italic.ttf", medium: "lato-medium.ttf", mediumItalic: "lato-medium-italic.ttf", semibold: "lato-semibold.ttf", semiboldItalic: "lato-semibold-italic.ttf", bold: "lato-bold.ttf", boldItalic: "lato-bold-italic.ttf", extrabold: "lato-extrabold.ttf", extraboldItalic: "lato-extrabold-italic.ttf", black: "lato-black.ttf", blackItalic: "lato-black-italic.ttf" } },
  { family: "Montserrat", name: "Montserrat", category: "Sans geométrica", file: "montserrat.ttf", variants: { ...weights("montserrat.ttf", ["thin", "extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("montserrat-italic.ttf", ["thinItalic", "extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Poppins", name: "Poppins", category: "Sans geométrica", file: "poppins.ttf", variants: { thin: "poppins-thin.ttf", thinItalic: "poppins-thin-italic.ttf", extralight: "poppins-extralight.ttf", extralightItalic: "poppins-extralight-italic.ttf", light: "poppins-light.ttf", lightItalic: "poppins-light-italic.ttf", regular: "poppins.ttf", italic: "poppins-italic.ttf", medium: "poppins-medium.ttf", mediumItalic: "poppins-medium-italic.ttf", semibold: "poppins-semibold.ttf", semiboldItalic: "poppins-semibold-italic.ttf", bold: "poppins-bold.ttf", boldItalic: "poppins-bold-italic.ttf", extrabold: "poppins-extrabold.ttf", extraboldItalic: "poppins-extrabold-italic.ttf", black: "poppins-black.ttf", blackItalic: "poppins-black-italic.ttf" } },
  { family: "Raleway", name: "Raleway", category: "Sans elegante", file: "raleway.ttf", variants: { ...weights("raleway.ttf", ["thin", "extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("raleway-italic.ttf", ["thinItalic", "extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Nunito", name: "Nunito", category: "Sans redondeada", file: "nunito.ttf", variants: { ...weights("nunito.ttf", ["extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("nunito-italic.ttf", ["extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Playfair Display", name: "Playfair Display", category: "Serif editorial", file: "playfairdisplay.ttf", variants: { ...weights("playfairdisplay.ttf", ["regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("playfairdisplay-italic.ttf", ["italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Lora", name: "Lora", category: "Serif de lectura", file: "lora.ttf", variants: { ...weights("lora.ttf", ["regular", "medium", "semibold", "bold"]), ...weights("lora-italic.ttf", ["italic", "mediumItalic", "semiboldItalic", "boldItalic"]) } },
  { family: "Bebas Neue", name: "Bebas Neue", category: "Display", file: "bebasneue.ttf", variants: { regular: "bebasneue.ttf" } },
  { family: "Oswald", name: "Oswald", category: "Condensada", file: "oswald.ttf", variants: { ...weights("oswald.ttf", ["extralight", "light", "regular", "medium", "semibold", "bold"]) } },
  { family: "Pacifico", name: "Pacifico", category: "Manuscrita", file: "pacifico.ttf", variants: { regular: "pacifico.ttf" } },
  { family: "Dancing Script", name: "Dancing Script", category: "Manuscrita", file: "dancingscript.ttf", variants: { ...weights("dancingscript.ttf", ["regular", "medium", "semibold", "bold"]) } },
  { family: "Space Mono", name: "Space Mono", category: "Monoespaciada", file: "spacemono.ttf", variants: { regular: "spacemono.ttf", italic: "spacemono-italic.ttf", bold: "spacemono-bold.ttf", boldItalic: "spacemono-bold-italic.ttf" } },
  { family: "Inter", name: "Inter", category: "Sans moderna", file: "inter.ttf", variants: { ...weights("inter.ttf", ["thin", "extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("inter-italic.ttf", ["thinItalic", "extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Roboto", name: "Roboto", category: "Sans versátil", file: "roboto.ttf", variants: { ...weights("roboto.ttf", ["thin", "extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("roboto-italic.ttf", ["thinItalic", "extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Open Sans", name: "Open Sans", category: "Sans humanista", file: "opensans.ttf", variants: { ...weights("opensans.ttf", ["light", "regular", "medium", "semibold", "bold", "extrabold"]), ...weights("opensans-italic.ttf", ["lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic"]) } },
  { family: "Source Sans 3", name: "Source Sans 3", category: "Sans humanista", file: "sourcesans3.ttf", variants: { ...weights("sourcesans3.ttf", ["extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("sourcesans3-italic.ttf", ["extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "DM Sans", name: "DM Sans", category: "Sans geométrica", file: "dmsans.ttf", variants: { ...weights("dmsans.ttf", ["thin", "extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("dmsans-italic.ttf", ["thinItalic", "extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Merriweather", name: "Merriweather", category: "Serif editorial", file: "merriweather.ttf", variants: { ...weights("merriweather.ttf", ["light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("merriweather-italic.ttf", ["lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Libre Baskerville", name: "Libre Baskerville", category: "Serif clásica", file: "librebaskerville.ttf", variants: { ...weights("librebaskerville.ttf", ["regular", "medium", "semibold", "bold"]), ...weights("librebaskerville-italic.ttf", ["italic", "mediumItalic", "semiboldItalic", "boldItalic"]) } },
  { family: "Cormorant Garamond", name: "Cormorant Garamond", category: "Serif elegante", file: "cormorantgaramond.ttf", variants: { ...weights("cormorantgaramond.ttf", ["light", "regular", "medium", "semibold", "bold"]), ...weights("cormorantgaramond-italic.ttf", ["lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic"]) } },
  { family: "Bitter", name: "Bitter", category: "Serif slab", file: "bitter.ttf", variants: { ...weights("bitter.ttf", ["thin", "extralight", "light", "regular", "medium", "semibold", "bold", "extrabold", "black"]), ...weights("bitter-italic.ttf", ["thinItalic", "extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic", "blackItalic"]) } },
  { family: "Caveat", name: "Caveat", category: "Manuscrita", file: "caveat.ttf", variants: { ...weights("caveat.ttf", ["regular", "medium", "semibold", "bold"]) } },
  { family: "Kalam", name: "Kalam", category: "Manuscrita", file: "kalam.ttf", variants: { light: "kalam-light.ttf", regular: "kalam.ttf", bold: "kalam-bold.ttf" } },
  { family: "Great Vibes", name: "Great Vibes", category: "Caligráfica", file: "greatvibes.ttf", variants: { regular: "greatvibes.ttf" } },
  { family: "Sacramento", name: "Sacramento", category: "Caligráfica", file: "sacramento.ttf", variants: { regular: "sacramento.ttf" } },
  { family: "Lobster", name: "Lobster", category: "Display", file: "lobster.ttf", variants: { regular: "lobster.ttf" } },
  { family: "JetBrains Mono", name: "JetBrains Mono", category: "Monoespaciada", file: "jetbrainsmono.ttf", variants: { ...weights("jetbrainsmono.ttf", ["thin", "extralight", "light", "regular", "medium", "semibold", "bold", "extrabold"]), ...weights("jetbrainsmono-italic.ttf", ["thinItalic", "extralightItalic", "lightItalic", "italic", "mediumItalic", "semiboldItalic", "boldItalic", "extraboldItalic"]) } },
  { family: "IBM Plex Mono", name: "IBM Plex Mono", category: "Monoespaciada", file: "ibmplexmono.ttf", variants: { thin: "ibmplexmono-thin.ttf", thinItalic: "ibmplexmono-thin-italic.ttf", extralight: "ibmplexmono-extralight.ttf", extralightItalic: "ibmplexmono-extralight-italic.ttf", light: "ibmplexmono-light.ttf", lightItalic: "ibmplexmono-light-italic.ttf", regular: "ibmplexmono.ttf", italic: "ibmplexmono-italic.ttf", medium: "ibmplexmono-medium.ttf", mediumItalic: "ibmplexmono-medium-italic.ttf", semibold: "ibmplexmono-semibold.ttf", semiboldItalic: "ibmplexmono-semibold-italic.ttf", bold: "ibmplexmono-bold.ttf", boldItalic: "ibmplexmono-bold-italic.ttf" } },
])
export const validStudioFont = family => STUDIO_FONTS.some(font => font.family === family)
export const STUDIO_FONT_VARIANTS = Object.freeze({
  thin: {weight:100,style:"normal"},
  extralight: {weight:200,style:"normal"},
  light: {weight:300,style:"normal"},
  regular: {weight:400,style:"normal"},
  medium: {weight:500,style:"normal"},
  semibold: {weight:600,style:"normal"},
  bold: {weight:700,style:"normal"},
  extrabold: {weight:800,style:"normal"},
  black: {weight:900,style:"normal"},
  thinItalic: {weight:100,style:"italic"},
  extralightItalic: {weight:200,style:"italic"},
  lightItalic: {weight:300,style:"italic"},
  italic: {weight:400,style:"italic"},
  mediumItalic: {weight:500,style:"italic"},
  semiboldItalic: {weight:600,style:"italic"},
  boldItalic: {weight:700,style:"italic"},
  extraboldItalic: {weight:800,style:"italic"},
  blackItalic: {weight:900,style:"italic"},
})
export const STUDIO_FONT_VARIANT_LABELS = Object.freeze({
  "thin": "Fina",
  "extralight": "Extraligera",
  "light": "Ligera",
  "regular": "Regular",
  "medium": "Media",
  "semibold": "Seminegrita",
  "bold": "Negrita",
  "extrabold": "Extranegrita",
  "black": "Negra",
  "thinItalic": "Fina cursiva",
  "extralightItalic": "Extraligera cursiva",
  "lightItalic": "Ligera cursiva",
  "italic": "Cursiva",
  "mediumItalic": "Media cursiva",
  "semiboldItalic": "Seminegrita cursiva",
  "boldItalic": "Negrita cursiva",
  "extraboldItalic": "Extranegrita cursiva",
  "blackItalic": "Negra cursiva"
})
export function studioFontStyle(family,variant='regular') {
  const font=STUDIO_FONTS.find(font=>font.family===family),style=STUDIO_FONT_VARIANTS[variant]
  if(!font||!style||!(variant in font.variants))return null
  return {...style,file:font.variants[variant]}
}
