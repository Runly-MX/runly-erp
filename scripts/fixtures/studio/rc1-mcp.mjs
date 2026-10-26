import assert from 'node:assert/strict'
import {createHash,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url))
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href)
const {StreamableHTTPClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')).href)

// Real Docker MCP server + real Supabase bearer identity. No auth/provider mocks.
export async function verifyRcMcp(stack,{token:humanToken,companyId,actorId,designId}) {
  const checks=[],resource=stack.urls.api+'/mcp',redirectUri='http://127.0.0.1/rc-callback'
  const request=(path,body,token,form=false)=>fetch(stack.urls.api+path,{method:body?'POST':'GET',redirect:'manual',headers:{...(body?{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`,'X-Runly-Company-Id':companyId}:{})},body:body?(form?new URLSearchParams(body):JSON.stringify(body)):undefined})
  const ok=async response=>{const value=await response.json();assert.ok(response.ok,`${response.status}: ${JSON.stringify(value)}`);return value}
  const registration=await ok(await request('/mcp/oauth/register',{client_name:'Studio RC1 local validation',client_uri:'https://client.example',redirect_uris:[redirectUri],token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']}))
  const verifier=randomBytes(32).toString('base64url')
  const auth=new URLSearchParams({client_id:registration.client_id,redirect_uri:redirectUri,response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',resource,scope:'runly:read studio:read studio:write files:read files:write',state:'rc-local-only'})
  const authorization=await request('/mcp/oauth/authorize?'+auth);assert.equal(authorization.status,302)
  const requestId=new URL(authorization.headers.get('location')).searchParams.get('request')
  const consent=await ok(await request('/mcp/oauth/consent',{requestId,companyIds:[companyId],approve:true},humanToken))
  const code=new URL(consent.redirect).searchParams.get('code')
  const tokens=await ok(await request('/mcp/oauth/token',{grant_type:'authorization_code',client_id:registration.client_id,code,redirect_uri:redirectUri,code_verifier:verifier,resource},null,true))
  const client=new Client({name:'studio-rc1',version:'1.0.0'})
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:`Bearer ${tokens.access_token}`}}}))
  const call=(mode,operation,input={})=>client.callTool({name:`runly_studio_${mode}`,arguments:{companyId,request:{operation,input}}})
  const value=reply=>{assert.equal(Boolean(reply.isError),false,JSON.stringify(reply));return reply.structuredContent.data}
  const query=async(operation,input={})=>value(await call('query',operation,input)).result
  const prepare=async(operation,input)=>value(await call('prepare',operation,input))
  const commit=proposal=>client.callTool({name:'runly_studio_commit',arguments:{companyId,proposalId:proposal.proposalId}})
  const approve=async(proposal,acknowledgeSensitive=true)=>ok(await request(`/mcp/proposals/${proposal.proposalId}`,{approve:true,acknowledgeSensitive},humanToken))
  let disabledFile
  try {
    const overview=await query('studio_overview');assert.equal(overview.schemaVersion,5)
    const detail=await query('studio_design_detail',{designId});assert.equal(detail.document.schemaVersion,5)
    const scene=detail.document
    assert.ok(scene.objects.some(o=>o.fillPaint?.type==='image'));assert.ok(!JSON.stringify(scene).includes('signedUrl'))
    const lint=await query('studio_review_design',{designId});assert.ok(Array.isArray(lint.findings))
    checks.push('Real OAuth/PKCE consent uses Supabase JWT; overview/design detail/review expose v5 without private signed URLs')
    const creation=await prepare('studio_create_design',{name:'RC MCP v5',document:scene})
    assert.equal(Boolean((await commit(creation)).isError),true)
    await approve(creation);const created=value(await commit(creation));const made=created.result
    assert.deepEqual(value(await commit(creation)),created)
    const update=await prepare('studio_update_design',{designId:made.id,name:'RC MCP v5 updated',document:scene,revision:1});await approve(update);assert.equal(value(await commit(update)).result.revision,2)
    const stale=await prepare('studio_update_design',{designId:made.id,name:'RC stale write',document:scene,revision:2});await approve(stale)
    await ok(await request(`/studio/designs/${made.id}`,null,humanToken))
    const concurrent=await fetch(stack.urls.api+`/studio/designs/${made.id}`,{method:'PUT',headers:{Authorization:`Bearer ${humanToken}`,'X-Runly-Company-Id':companyId,'Content-Type':'application/json'},body:JSON.stringify({name:'RC HTTP concurrent',document:scene,revision:2})});assert.equal(concurrent.status,200)
    assert.equal(Boolean((await commit(stale)).isError),true)
    checks.push('Real MCP create/update: approval required, web-identity approval, idempotent commit and concurrent-revision conflict')
    const templateSave=await prepare('studio_template_save',{name:'RC MCP private template',document:scene});await approve(templateSave);const template=value(await commit(templateSave)).result
    assert.deepEqual((await query('studio_template_detail',{templateId:template.id})).document,scene)
    const publishing=await prepare('studio_template_publish',{templateId:template.id,revision:1})
    assert.equal((await request(`/mcp/proposals/${publishing.proposalId}`,{approve:true,acknowledgeSensitive:false},humanToken)).status,403)
    await approve(publishing);assert.equal(value(await commit(publishing)).result.scope,'company')
    checks.push('Real MCP private v5 template save/detail/publish requires separate sensitive acknowledgement')
    const revoked=await prepare('studio_template_save',{name:'RC revoked private resource',document:scene});await approve(revoked)
    disabledFile=scene.objects.find(o=>o.fillPaint?.type==='image').fillPaint.fileAssetId
    await stack.pool.query('UPDATE file_asset SET enabled=false WHERE id=$1',[disabledFile])
    assert.equal(Boolean((await commit(revoked)).isError),true)
    await stack.pool.query('UPDATE file_asset SET enabled=true WHERE id=$1',[disabledFile]);disabledFile=null
    await stack.pool.query('UPDATE membership SET enabled=false WHERE company_id=$1 AND user_id=$2',[companyId,actorId])
    assert.equal(Boolean((await call('query','studio_overview')).isError),true)
    await stack.pool.query('UPDATE membership SET enabled=true WHERE company_id=$1 AND user_id=$2',[companyId,actorId])
    assert.equal((await query('studio_overview')).schemaVersion,5)
    const audit=(await stack.pool.query("SELECT action,count(*)::int AS count FROM audit_log WHERE module_key='runly.studio' AND actor_id=$1 GROUP BY action",[actorId])).rows
    for(const action of ['studio.design.create','studio.design.update','studio.template.create','studio.template.publish'])assert.ok(audit.some(r=>r.action===action&&r.count>0))
    checks.push('Real MCP rejects asset and membership revocation after approval; server audit records successful actions')
    checks.forEach(check=>console.log('RC1 MCP: '+check))
    return {checks,audit,auth:'real Supabase JWT + actual OAuth server + official MCP SDK; approval via authenticated web HTTP'}
  } finally {
    if(disabledFile)await stack.pool.query('UPDATE file_asset SET enabled=true WHERE id=$1',[disabledFile])
    await stack.pool.query('UPDATE membership SET enabled=true WHERE company_id=$1 AND user_id=$2',[companyId,actorId])
    await client.close()
  }
}
