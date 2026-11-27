import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('the root redirect to /app/ is relative so a published port or TLS proxy is not lost', () => {
  const conf = readFileSync(new URL('../spa.conf', import.meta.url), 'utf8')
  const block = conf.match(/location @admin_root_to_app \{([\s\S]*?)\n    \}/)?.[1] ?? ''
  assert.match(block, /absolute_redirect off;/)
  assert.match(block, /return 302 \/app\/;/)
})
