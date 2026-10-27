// Explicit owner connection only. No .env loading, default host or credential logs.
import pg from 'pg'
import { readFile } from 'node:fs/promises'
const target=process.env.SUPABASE_ADMIN_DATABASE_URL
if(!target)throw Error('SUPABASE_ADMIN_DATABASE_URL_REQUIRED')
const pool=new pg.Pool({connectionString:target,max:1})
try{
  await pool.query('BEGIN')
  await pool.query(await readFile(new URL('../infra/installer/supabase/volumes/db/studio-realtime-role.sql',import.meta.url),'utf8'))
  const tenant=process.env.RUNLY_REALTIME_TENANT_ID
  if(tenant){
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(tenant))throw Error('TENANT_ID_INVALID')
    const events=Number(process.env.RUNLY_REALTIME_MAX_EVENTS_PER_SECOND??2000),bytes=Number(process.env.RUNLY_REALTIME_MAX_BYTES_PER_SECOND??2000000)
    if(!Number.isInteger(events)||events<100||events>100000||!Number.isInteger(bytes)||bytes<100000||bytes>100000000)throw Error('REALTIME_LIMITS_INVALID')
    const result=await pool.query('UPDATE _realtime.tenants SET max_events_per_second=$1,max_bytes_per_second=$2 WHERE external_id=$3 RETURNING external_id',[events,bytes,tenant])
    if(result.rowCount!==1)throw Error('REALTIME_TENANT_NOT_FOUND')
  }
  await pool.query('COMMIT')
  console.log('Studio socket role provisioned; application migration is still required.')
}catch{await pool.query('ROLLBACK').catch(()=>{});throw Error('STUDIO_SOCKET_OWNER_PROVISIONING_FAILED')}finally{await pool.end()}
