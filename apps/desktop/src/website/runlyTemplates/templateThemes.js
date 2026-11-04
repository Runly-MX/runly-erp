// One theme per built-in template: palette, type, corner radius and button style chosen together so every page of a
// template shares the same look. Only groups the theme service accepts are set (color, font, radius, button, card).
const sans = "Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif"
const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"

export const TEMPLATE_THEMES = {
  'atlas-restaurante': {
    color: { primary: '#8C2F1B', primaryFg: '#FFFFFF', bg: '#FBF3E4', fg: '#2A1810', muted: '#6B5445', accent: '#E6B85C' },
    font: { sans: serif },
    radius: { md: '6px', lg: '10px' },
    button: { style: 'solid', radius: 'sm' },
    card: { radius: 'md', shadow: 'sm', padding: '6' },
  },
  'atlas-spa': {
    color: { primary: '#2F6B5F', primaryFg: '#FFFFFF', bg: '#F6F3EE', fg: '#1F3A35', muted: '#55706A', accent: '#8A5A3C' },
    font: { sans },
    radius: { md: '12px', lg: '24px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'sm', padding: '8' },
  },
  'atlas-tienda': {
    color: { primary: '#1F1A17', primaryFg: '#FAF7F2', bg: '#FAF7F2', fg: '#1F1A17', muted: '#6B5F55', accent: '#B4411F' },
    font: { sans },
    radius: { md: '12px', lg: '24px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'sm', padding: '6' },
  },
  'atlas-agencia': {
    color: { primary: '#C6FF3D', primaryFg: '#0B0B0F', bg: '#0B0B0F', fg: '#F4F4EF', muted: '#A8A8B3', accent: '#C6FF3D' },
    font: { sans },
    radius: { md: '4px', lg: '8px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'md', shadow: 'none', padding: '6' },
  },
  'atlas-negocio': {
    color: { primary: '#1E40AF', primaryFg: '#FFFFFF', bg: '#F8FAFC', fg: '#0F172A', muted: '#475569', accent: '#0369A1' },
    font: { sans },
    radius: { md: '8px', lg: '12px' },
    button: { style: 'solid', radius: 'md' },
    card: { radius: 'lg', shadow: 'sm', padding: '6' },
  },
  'atlas-habitia': {
    color: { primary: '#A4522E', primaryFg: '#FFFFFF', bg: '#FAF7F2', fg: '#2A1E17', muted: '#6B5A4C', accent: '#4D6B4A' },
    font: { sans: serif },
    radius: { md: '4px', lg: '8px' },
    button: { style: 'solid', radius: 'sm' },
    card: { radius: 'md', shadow: 'sm', padding: '6' },
  },
  'atlas-finora': {
    color: { primary: '#17835E', primaryFg: '#FFFFFF', bg: '#F6FBF8', fg: '#0B2E22', muted: '#5C7A6D', accent: '#0B3D2E' },
    font: { sans },
    radius: { md: '12px', lg: '20px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'sm', padding: '6' },
  },
  'atlas-maya': {
    color: { primary: '#2563EB', primaryFg: '#FFFFFF', bg: '#F5F9FF', fg: '#0F2347', muted: '#5B6B88', accent: '#FBBF24' },
    font: { sans },
    radius: { md: '12px', lg: '20px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'md', padding: '6' },
  },
  'atlas-aurora': {
    color: { primary: '#0E7490', primaryFg: '#FFFFFF', bg: '#FBF7F0', fg: '#0B1B2B', muted: '#52606D', accent: '#F97316' },
    font: { sans },
    radius: { md: '12px', lg: '22px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'md', padding: '6' },
  },
  'atlas-devfolio': {
    color: { primary: '#F26A1B', primaryFg: '#1A1A1A', bg: '#FBF6EE', fg: '#1A1A1A', muted: '#5B5249', accent: '#C2410C' },
    font: { sans },
    radius: { md: '8px', lg: '16px' },
    button: { style: 'solid', radius: 'md' },
    card: { radius: 'lg', shadow: 'sm', padding: '6' },
  },
  'atlas-impulsa': {
    color: { primary: '#1F7A33', primaryFg: '#FFFFFF', bg: '#FFFFFF', fg: '#0E1A12', muted: '#55635A', accent: '#3FAE4F' },
    font: { sans: "'DM Sans', Inter, 'Segoe UI', system-ui, -apple-system, Roboto, sans-serif" },
    radius: { md: '12px', lg: '24px' },
    button: { style: 'solid', radius: 'pill' },
    card: { radius: 'lg', shadow: 'sm', padding: '6' },
  },
}
