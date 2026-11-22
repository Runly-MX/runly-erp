import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EFFECTS_BY_KIND } from './effect-catalog.js'
import { describeEffect, turnsOf } from './effect-glyph.js'

const signature = glyph => JSON.stringify({ layout: glyph.layout?.map(item => [item.x, item.ghost ?? false, item.opacity ?? 1]), accents: glyph.accents.map(a => a.type === 'move' ? [a.type, a.from.map(Math.round), a.to.map(Math.round)] : a.type === 'turn' ? [a.type, Math.round(a.a1 - a.a0)] : a.type === 'scale' ? [a.type, a.outward] : a.type === 'edge' ? [a.type, a.arrows.map(x => [...x.from, ...x.to].map(Math.round))] : [a.type]),
  curve: glyph.curve?.filter((_, i) => i % 8 === 0).map(v => Math.round(v * 10)), ghosts: glyph.ghosts.map(g => [Math.round(g.x), Math.round(g.y), Math.round(g.width), Math.round(g.rotation), g.faint]) })

test('every preset gets its own thumbnail and an accent or a curve', () => {
  for (const [kind, options] of Object.entries(EFFECTS_BY_KIND)) {
    const seen = new Map()
    for (const { value } of options) {
      const glyph = describeEffect(kind, value)
      assert.ok(glyph.accents.length || glyph.curve, `${kind}:${value} explains its motion`)
      const key = signature(glyph)
      assert.ok(!seen.has(key), `${kind}:${value} looks like ${seen.get(key)}`)
      seen.set(key, value)
    }
  }
})

test('key presets read as their motion', () => {
  const accent = (kind, value) => describeEffect(kind, value).accents.map(a => a.type)
  assert.deepEqual(accent('enter', 'wipe-up'), ['edge'])
  assert.equal(describeEffect('enter', 'wipe-up').accents[0].arrows[0].to[1] < describeEffect('enter', 'wipe-up').accents[0].arrows[0].from[1], true, 'wipe up points up')
  assert.equal(describeEffect('enter', 'reveal').accents[0].arrows.length, 4, 'reveal opens on every side')
  assert.deepEqual(accent('enter', 'zoom-in'), ['scale'])
  assert.equal(describeEffect('enter', 'zoom-out').accents[0].outward, false, 'from big shrinks into place')
  assert.ok(accent('enter', 'rotate').includes('turn'))
  assert.deepEqual(accent('emphasis', 'spin'), ['turn'])
  assert.ok(describeEffect('enter', 'pop').curve && describeEffect('enter', 'elastic').curve, 'bounce and elastic show their curve')
  assert.equal(turnsOf([0, 1, 0, 1]), 2)
})
