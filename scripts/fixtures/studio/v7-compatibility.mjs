import assert from 'node:assert/strict'
import {blankDocument} from '../../../apps/shared/studio/document.js'
export async function verifyV7Compatibility(stack,{users,companies}) {
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0]?.id,stack.name)
  const client=await stack.pool.connect(),checks=[]
  try{
    const row=(await client.query('INSERT INTO studio_design(company_id,owner_id,name,document) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[companies[0].id,users[0].id,'Synthetic writer compatibility',JSON.stringify(blankDocument())])).rows[0]
    await client.query('BEGIN');await client.query("SELECT set_config('runly.studio.protocol','2',true)")
    await assert.rejects(client.query('UPDATE studio_design SET name=$1 WHERE id=$2',['old writer',row.id]),/STUDIO_UPGRADE_REQUIRED/);await client.query('ROLLBACK')
    await client.query('BEGIN');await client.query("SELECT set_config('runly.studio.protocol','3',true)")
    await assert.rejects(client.query("UPDATE studio_design SET document=jsonb_set(document,'{schemaVersion}','6') WHERE id=$1",[row.id]),/STUDIO_DOCUMENT_DOWNGRADE_DENIED/);await client.query('ROLLBACK')
    const legacy={schemaVersion:6,unit:'px',page:{width:320,height:240,background:'#ffffff'},objects:[]}
    const old=(await client.query('INSERT INTO studio_design(company_id,owner_id,name,document) VALUES($1,$2,$3,$4::jsonb) RETURNING id',[companies[0].id,users[0].id,'Synthetic v6 compatibility',JSON.stringify(legacy)])).rows[0]
    await client.query('BEGIN');await client.query("SELECT set_config('runly.studio.protocol','2',true)");await client.query('UPDATE studio_design SET name=$1 WHERE id=$2',['v6 writer on v6',old.id]);await client.query('COMMIT')
    checks.push('SQL rejects protocol 2 on v7 and all schema downgrades, while protocol 2 on existing v6 remains valid')
    return {checks}
  }finally{await client.query('ROLLBACK').catch(()=>{});client.release()}
}
