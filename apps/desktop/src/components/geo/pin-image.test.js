import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iconKey, pinColor, pinSvg } from './pin-image.js'

test('pinSvg draws the icon in the type color and rejects unsafe values', () => {
  const svg = pinSvg({ color: '#7c3aed', iconNode: [['rect', { x: '2', y: '3', width: '20', height: '14', key: 'k1' }], ['path', { d: 'M8 21h8' }]] })
  assert.match(svg, /fill="#7c3aed"/)
  assert.match(svg, /<rect x="2" y="3" width="20" height="14"\/>/)
  assert.doesNotMatch(svg, /key=/)
  assert.equal(pinColor('red"/><script>'), '#475569')
  assert.doesNotMatch(pinSvg({ color: '#000', iconNode: [['path', { d: '"/><script>alert(1)</script>' }]] }), /<script>/)
  assert.equal(iconKey('HardDrive'), 'hard-drive')
  assert.equal(iconKey('hard-drive'), 'hard-drive')
})
