import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseStoredSpellcheck, resolveSpellcheck } from '../spellcheckPref.js'

describe('resolveSpellcheck', () => {
  it('uses the stored choice when defined', () => {
    assert.equal(resolveSpellcheck(true, true), true)
    assert.equal(resolveSpellcheck(false, false), false)
  })
  it('defaults on for desktop and off for touch', () => {
    assert.equal(resolveSpellcheck(undefined, false), true)
    assert.equal(resolveSpellcheck(undefined, true), false)
  })
})

describe('parseStoredSpellcheck', () => {
  it('parses only explicit values', () => {
    assert.equal(parseStoredSpellcheck('true'), true)
    assert.equal(parseStoredSpellcheck('false'), false)
    assert.equal(parseStoredSpellcheck(null), undefined)
    assert.equal(parseStoredSpellcheck('x'), undefined)
  })
})
