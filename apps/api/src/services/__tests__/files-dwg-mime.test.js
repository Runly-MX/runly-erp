import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAllowedMimeType } from '../files-service.js'

describe('AutoCAD DWG uploads', () => {
  it('accepts the MIME types browsers report for .dwg, or none at all', () => {
    for (const type of ['image/vnd.dwg', 'application/acad', 'application/x-dwg', 'application/octet-stream', '']) {
      assert.equal(isAllowedMimeType(type, 'planta.dwg'), true, type || 'empty type')
    }
  })
  it('does not widen octet-stream to other extensions', () => {
    assert.equal(isAllowedMimeType('application/octet-stream', 'planta.exe'), false)
  })
})
