import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

export const STUDIO_REALTIME_MIGRATION = '20261210000000_studio_realtime_ephemeral'
// Immutable original SQL, with LF or CRLF. Both include BEGIN/COMMIT and only
// create this role/function/policies. Never accept a different migration body.
export const STUDIO_REALTIME_CHECKSUMS = new Set([
  '37275b48040e5b877b868136eeefd14d52139fa810e30fa87db8c974f73a850f',
  '3d7e94500a5a690b1fc2f819ca8a753de2e2dcb5ee193136dd9eb41a20952dfb',
])

// No npm dependencies: the Installer runs standalone. Use the schema owner
// already inside this installation's DB container, never application credentials.
export function createStudioDatabaseRunner({ composeArgs, cwd, env=process.env, spawn=spawnSync }) {
  return (sql,{json=false}={})=>{
    const args=['compose',...composeArgs,'exec','-T','supabase-db','psql','-X','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','postgres',
      ...(json?['-A','-t']:['--single-transaction']),'-f','-']
    const result=spawn('docker',args,{cwd,env,input:sql,encoding:'utf8',shell:false,stdio:['pipe','pipe','pipe']})
    if(result.error||result.status!==0)throw Error('STUDIO_OWNER_DATABASE_COMMAND_FAILED: no se pudo preparar o inspeccionar Realtime; no se ejecutaron las migraciones.')
    return json?JSON.parse(result.stdout.trim()):result.stdout
  }
}

export async function prepareStudioRealtimeOwner({ execute, sqlFile }) {
  const sql=await readFile(sqlFile,'utf8')
  execute(sql)
}

export function inspectStudioRealtimeFailure(execute) {
  const history=execute("SELECT json_build_object('exists',to_regclass('public._prisma_migrations') IS NOT NULL);",{json:true})
  if(!history.exists)return {failed:[],clean:true}
  return execute(`SELECT json_build_object(
    'failed',COALESCE((SELECT json_agg(json_build_object('name',migration_name,'logs',logs,'checksum',checksum)) FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL),'[]'::json),
    'clean',to_regprocedure('runly_studio.socket_allowed(text)') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND policyname IN ('studio_socket_read','studio_socket_write'))
  );`,{json:true})
}

export function assertRecoverableStudioFailure(state) {
  if(state.failed.length!==1||state.failed[0].name!==STUDIO_REALTIME_MIGRATION||!state.clean||
    !STUDIO_REALTIME_CHECKSUMS.has(state.failed[0].checksum)||
    (state.failed[0].logs?.trim()&&!state.failed[0].logs.includes('STUDIO_SOCKET_SCHEMA_OWNER_REQUIRED: run owner-phase provisioning first'))) {
    throw Error('STUDIO_FAILURE_REQUIRES_REVIEW: la causa o el estado no corresponden al fallo transaccional conocido; no se modifica el historial.')
  }
}
