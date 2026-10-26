// Bundled licensed assets, loaded on demand. Only regular/400 is supported initially.
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
