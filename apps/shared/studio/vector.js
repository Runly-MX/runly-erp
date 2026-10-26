// Safe path data only. No XML, CSS, references, external URLs or executable content.
const arity = { M:2, L:2, H:1, V:1, C:6, S:4, Q:4, T:2, A:7, Z:0 }
const number = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/
const invalid = () => { throw new Error('Geometría vectorial no admitida.') }
export function validatePath(value) {
  if (typeof value !== 'string' || value.length > 16384 || !/^[\s]*[mM]/.test(value)) invalid()
  const tokens = []; let rest = value
  while (rest.length) {
    const separator = rest.match(/^[\s,]+/)
    if (separator) { rest = rest.slice(separator[0].length); continue }
    if (/^[mMlLhHvVcCsSqQtTaAzZ]/.test(rest)) { tokens.push(rest[0]); rest = rest.slice(1); continue }
    const match = rest.match(number)
    if (!match || !Number.isFinite(Number(match[0])) || Math.abs(Number(match[0])) > 4096) invalid()
    tokens.push(Number(match[0])); rest = rest.slice(match[0].length)
    if (tokens.length > 2048) invalid()
  }
  let position = 0, command
  while (position < tokens.length) {
    if (typeof tokens[position] === 'string') command = tokens[position++].toUpperCase()
    else if (!command || command === 'Z') invalid()
    const count = arity[command]
    if (count === undefined) invalid()
    if (!count) { command = undefined; continue }
    const values = tokens.slice(position, position + count)
    if (values.length !== count || values.some(v => typeof v !== 'number')) invalid()
    if (command === 'A' && (values[0] < 0 || values[1] < 0 || ![0,1].includes(values[3]) || ![0,1].includes(values[4]))) invalid()
    position += count
  }
  return value.trim()
}
export function validateGeometry(input) {
  if (!input || ![input.width,input.height].every(n => Number.isFinite(n) && n >= 1 && n <= 1024) ||
    !Array.isArray(input.paths) || !input.paths.length || input.paths.length > 64) invalid()
  const paths = input.paths.map(path => {
    if (!['color','none'].includes(path.fill) || !['color','none'].includes(path.stroke) ||
      !Number.isFinite(path.strokeWidth) || path.strokeWidth < 0 || path.strokeWidth > 64 ||
      !['butt','round','square'].includes(path.cap) || !['miter','round','bevel'].includes(path.join)) invalid()
    return { d:validatePath(path.d), fill:path.fill, stroke:path.stroke, strokeWidth:path.strokeWidth, cap:path.cap, join:path.join }
  })
  if (paths.reduce((sum,path) => sum + path.d.length,0) > 32768) invalid()
  return { width:input.width, height:input.height, paths }
}
