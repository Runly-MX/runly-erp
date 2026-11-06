import test from 'node:test'
import assert from 'node:assert/strict'
import { graphicField, nativeCodes, zplLabel } from './studio-zpl.js'
import { codeObject } from './studio-codes.js'

// Decoder for Zebra ASCII compression, to prove the encoder round-trips.
function decode(data, bytesPerRow) {
  const width = bytesPerRow * 2, rows = []
  let row = '', count = 0
  for (const char of data) {
    const low = 'GHIJKLMNOPQRSTUVWXY'.indexOf(char), high = 'ghijklmnopqrstuvwxyz'.indexOf(char)
    if (low >= 0) count += low + 1
    else if (high >= 0) count += (high + 1) * 20
    else if (char === ':') rows.push(rows.at(-1))
    else if (char === ',' || char === '!') { rows.push(row.padEnd(width, char === ',' ? '0' : 'F')); row = '' }
    else { row += char.repeat(count || 1); count = 0; if (row.length === width) { rows.push(row); row = '' } }
  }
  return rows
}

test('graphic field compresses and decodes back to the same bitmap', () => {
  const width = 37, height = 5, pixels = new Uint8Array(width * height * 4)
  const dark = (x, y) => y === 1 || (y === 3 && x < 30) || (y === 4 && x % 3 === 0)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, value = dark(x, y) ? 0 : 255
    pixels.set([value, value, value, 255], i)
  }
  pixels.set([0, 0, 0, 255], 4) // row 0: a single dark pixel at x=1
  const [, total, , perRow, ...rest] = graphicField(pixels, width, height).split(','), data = rest.join(',')
  assert.equal(Number(total), 5 * 5)
  const rows = decode(data, Number(perRow))
  const expected = Array.from({ length: height }, (_, y) => {
    let hex = ''
    for (let b = 0; b < 5; b++) { let v = 0; for (let bit = 0; bit < 8; bit++) { const x = b * 8 + bit; if (x < width && (dark(x, y) || (y === 0 && x === 1))) v |= 0x80 >> bit } hex += v.toString(16).toUpperCase().padStart(2, '0') }
    return hex
  })
  assert.deepEqual(rows, expected)
})

test('codes print natively when they fit whole dots', () => {
  const qr = { id: 'q', x: 10, y: 20, rotation: 0, ...codeObject('qr', 'https://example.com/a') }
  const bar = { id: 'b', x: 0, y: 300, rotation: 0, ...codeObject('code128', 'A>1'), width: 600, height: 80 }
  const turned = { ...qr, id: 't', rotation: 90 }
  const { commands, ids } = nativeCodes([qr, bar, turned], 1)
  assert.deepEqual([...ids], ['q', 'b'])
  assert.match(commands[0], /^\^FO\d+,\d+\^BQN,2,\d+\^FDMA,https:\/\/example\.com\/a\^FS$/)
  assert.match(commands[1], /\^BCN,80,N,N,N\^FD>:A><1\^FS$/)
  assert.match(zplLabel({ width: 400, height: 200, graphic: '^GFA,1,1,1,,', codes: commands }), /^\^XA\n\^CI28\n\^PW400\n\^LL200[\s\S]*\^XZ$/)
})
