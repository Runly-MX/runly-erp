import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudioDatabaseRunner, assertRecoverableStudioFailure, inspectStudioRealtimeFailure, STUDIO_REALTIME_MIGRATION } from '../lib/studio-realtime-db.mjs'

const expected={name:STUDIO_REALTIME_MIGRATION,checksum:'37275b48040e5b877b868136eeefd14d52139fa810e30fa87db8c974f73a850f',logs:'ERROR: STUDIO_SOCKET_SCHEMA_OWNER_REQUIRED: run owner-phase provisioning first'}
test('only the known failed transaction with no installed function/policies is recoverable',()=>{
  assert.doesNotThrow(()=>assertRecoverableStudioFailure({failed:[expected],clean:true}))
  assert.doesNotThrow(()=>assertRecoverableStudioFailure({failed:[{...expected,logs:null}],clean:true}))
  for(const state of [{failed:[],clean:true},{failed:[expected],clean:false},{failed:[{...expected,checksum:'unknown',logs:null}],clean:true},{failed:[{...expected,logs:'permission denied for another object'}],clean:true},{failed:[{...expected,name:'another_migration'}],clean:true},{failed:[expected,expected],clean:true}])assert.throws(()=>assertRecoverableStudioFailure(state),/REQUIRES_REVIEW/)
})
test('owner phase uses only the selected Compose DB, piped SQL and one atomic transaction',()=>{
  let captured
  const execute=createStudioDatabaseRunner({composeArgs:['--project-name','isolated-test','-f','compose.json'],cwd:'.',env:{},spawn:(command,args,options)=>{captured={command,args,options};return{status:0,stdout:'DO\n'}}})
  execute('SELECT 1;')
  assert.equal(captured.command,'docker');assert.ok(captured.args.includes('--single-transaction'));assert.ok(captured.args.includes('supabase_admin'));assert.equal(captured.options.input,'SELECT 1;');assert.equal(captured.options.shell,false)
  assert.equal(captured.args.includes('--network'),false)
})
test('a new database has no failed history to repair; SQL errors stop rather than continue',()=>{
  assert.deepEqual(inspectStudioRealtimeFailure(()=>({exists:false})),{failed:[],clean:true})
  const execute=createStudioDatabaseRunner({composeArgs:[],spawn:()=>({status:1,stderr:'sensitive connection details'})})
  assert.throws(()=>execute('SELECT 1'),error=>/COMMAND_FAILED/.test(error.message)&&!error.message.includes('sensitive'))
})
