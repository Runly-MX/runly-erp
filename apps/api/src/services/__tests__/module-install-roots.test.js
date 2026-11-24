import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createModuleLifecycleService } from '../module-lifecycle-service.js'

// Any write to the database during a refused install is a failure.
const prisma = {
  runlyModule: { findUnique: async () => null },
  $transaction: async () => { throw new Error('install must not reach the transaction') },
}

async function withModulesDir(setup, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runly-roots-'))
  const prev = process.env.RUNLY_MODULES_DIR
  process.env.RUNLY_MODULES_DIR = dir
  try {
    setup(dir)
    await run()
  } finally {
    if (prev === undefined) delete process.env.RUNLY_MODULES_DIR
    else process.env.RUNLY_MODULES_DIR = prev
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

const install = (key) => createModuleLifecycleService({ prisma }).installModule({ manifest: { key, name: key, version: '1.0.0' }, actorId: null })

test('a custom module with no folder in the authorized roots is refused, not installed without tables', async () => {
  await withModulesDir(() => {}, async () => {
    await assert.rejects(() => install('custom.ghost'), (e) => e.status === 409 && /carpeta del módulo/.test(e.message))
  })
})

test('a module folder that is a symlink leaving the authorized roots is refused', async () => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'runly-outside-'))
  fs.writeFileSync(path.join(outside, 'module.manifest.js'), 'export default {}')
  try {
    await withModulesDir((dir) => {
      try { fs.symlinkSync(outside, path.join(dir, 'custom.link'), 'junction') } catch { /* no link privilege: skip effect */ }
    }, async () => {
      await assert.rejects(() => install('custom.link'), (e) => e.status === 409)
    })
  } finally {
    fs.rmSync(outside, { recursive: true, force: true })
  }
})
