import assert from 'node:assert/strict'
import {createHash,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
const require=createRequire(new URL('../../../apps/api/package.json',import.meta.url))
const {Client}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href)
const {StreamableHTTPClientTransport}=await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')).href)

export async function commitStudioMcpUpdate(stack,{token,companyId,designId,name,document,revision,ops}) {
  const resource=stack.urls.api+'/mcp',redirectUri='http://127.0.0.1/studio-test-callback'
  const request=(path,data,bearer,form=false)=>fetch(stack.urls.api+path,{method:data?'POST':'GET',redirect:'manual',headers:{...(data?{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'}:{}),...(bearer?{Authorization:`Bearer ${bearer}`,'X-Runly-Company-Id':companyId}:{})},body:data?(form?new URLSearchParams(data):JSON.stringify(data)):undefined})
  const ok=async r=>{const b=await r.json();assert.ok(r.ok,`${r.status}: ${JSON.stringify(b)}`);return b}
  const registration=await ok(await request('/mcp/oauth/register',{client_name:'Studio operations isolated test',client_uri:'https://client.example',redirect_uris:[redirectUri],token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']}))
  const verifier=randomBytes(32).toString('base64url'),authorization=new URLSearchParams({client_id:registration.client_id,redirect_uri:redirectUri,response_type:'code',code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',resource,scope:'runly:read studio:read studio:write files:read files:write',state:'isolated-studio'})
  const redirection=await request('/mcp/oauth/authorize?'+authorization);assert.equal(redirection.status,302)
  const requestId=new URL(redirection.headers.get('location')).searchParams.get('request')
  const consent=await ok(await request('/mcp/oauth/consent',{requestId,companyIds:[companyId],approve:true},token))
  const code=new URL(consent.redirect).searchParams.get('code'),oauth=await ok(await request('/mcp/oauth/token',{grant_type:'authorization_code',client_id:registration.client_id,code,redirect_uri:redirectUri,code_verifier:verifier,resource},null,true))
  const client=new Client({name:'studio-operations-test',version:'1.0.0'})
  try{
    await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:`Bearer ${oauth.access_token}`}}}))
    const call=(mode,operation,input={})=>client.callTool({name:`runly_studio_${mode}`,arguments:{companyId,request:{operation,input}}})
    const value=reply=>{assert.equal(Boolean(reply.isError),false,JSON.stringify(reply));return reply.structuredContent.data}
    const guide=value(await call('query','studio_overview')).result;assert.equal(guide.schemaVersion,7)
    const proposal=value(await call('prepare',ops?'studio_apply_changes':'studio_update_design',ops?
      {designId,revision,ops,clientId:'multipage-mcp-client',batchId:1}:{designId,name,document,revision}))
    const commit=()=>client.callTool({name:'runly_studio_commit',arguments:{companyId,proposalId:proposal.proposalId}})
    assert.equal(Boolean((await commit()).isError),true)
    await ok(await request(`/mcp/proposals/${proposal.proposalId}`,{approve:true,acknowledgeSensitive:true},token))
    const result=value(await commit());assert.deepEqual(value(await commit()),result)
    return result.result
  }finally{await client.close()}
}
