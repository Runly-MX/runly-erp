import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteAccentColor, NOTE_BACKGROUND_COLORS } from '../noteColors.js'

test('known colors map to light and dark accents', () => {
  assert.equal(noteAccentColor('#fefce8', false), '#a16207')
  assert.equal(noteAccentColor('#fefce8', true), '#facc15')
  assert.equal(noteAccentColor('#fdf4ff', false), '#a21caf')
  assert.equal(noteAccentColor('#f0f9ff', true), '#38bdf8')
})

test('null, empty and unknown values return null', () => {
  assert.equal(noteAccentColor(null, false), null)
  assert.equal(noteAccentColor(undefined, true), null)
  assert.equal(noteAccentColor('#123456', false), null)
})

test('every colored palette entry has an accent; default has none', () => {
  for (const c of NOTE_BACKGROUND_COLORS) {
    if (c.value) assert.match(noteAccentColor(c.value, false), /^#[0-9a-f]{6}$/)
    else assert.equal(noteAccentColor(c.value, true), null)
  }
})
