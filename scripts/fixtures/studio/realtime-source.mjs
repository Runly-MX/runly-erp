import assert from 'node:assert/strict'
import { readFile,writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Source overlay into a disposable container only; no image tag is overwritten.
export async function useStudioRealtimeSource(stack) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const config=JSON.parse(await readFile(stack.composeFile,'utf8'))
  assert.equal(config.name,stack.name);assert.match(stack.name,/^runly-studio-e2e-[a-f0-9]+$/)
  config.services['runly-api'].volumes=['apps/api/src/routes/studio','apps/shared/studio'].map(file=>({type:'bind',source:resolve(file),target:`/app/${file}`,read_only:true}))
  await writeFile(stack.composeFile,JSON.stringify(config,null,2))
  if(!(await stack.pool.query("SELECT to_regclass('studio_interchange_job') value")).rows[0].value)await stack.pool.query(await readFile('prisma/migrations/20261209000000_studio_interchange/migration.sql','utf8'))
  if(!(await stack.pool.query("SELECT to_regprocedure('runly_studio.socket_allowed(text)') value")).rows[0].value)await stack.pool.query(await readFile('prisma/migrations/20261210000000_studio_realtime_ephemeral/migration.sql','utf8'))
}
