import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { StudioError } from '../../../../shared/studio/document.js'
import { documentPages } from '../../../../shared/studio/pages.js'
import { STUDIO_REALTIME, publicSessionId, publicKeyPattern, realtimeBytes } from '../../../../shared/studio/realtime.js'
import { signHs256Jwt, verifySupabaseJwt } from '../../services/jwt-verification.js'

export function createStudioRealtime({ prisma, access, env = process.env, now = () => Date.now() }) {
  let signingKey, secretValue
  const recent = new Map(), actors = new Map()
  function key(secret) {
    if(secretValue!==secret){
      const seed=createHash('sha256').update('runly.studio.attestation.v1\0').update(secret).digest()
      signingKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});secretValue=secret
    }
    return signingKey
  }
  async function context(companyId, actorId, id, input, authUserId, token) {
    if(!input||Object.keys(input).sort().join(',')!=='publicKey,sessionId,version'||input.version!==1||!publicSessionId(input.sessionId)||!publicKeyPattern.test(input.publicKey??''))throw new StudioError('Sesión de colaboración no compatible.',400,'STUDIO_REALTIME_PROTOCOL')
    const secret=env.SUPABASE_JWT_SECRET
    if(typeof secret!=='string'||secret.length<32)throw new StudioError('El transporte efímero requiere configuración local compatible.',503,'STUDIO_REALTIME_UNAVAILABLE')
    const claims=verifySupabaseJwt(token,secret), issuedAt=Math.floor(now()/1000)*1000
    if(!claims||claims.sub!==authUserId||claims.role!=='authenticated'||!claims.session_id||!Number.isFinite(claims.exp)||claims.exp*1000<=issuedAt)throw new StudioError('Renueva tu sesión para colaborar.',401)
    try {
      const raw=Buffer.from(input.publicKey,'base64url')
      if(raw.length!==65||raw[0]!==4)throw Error()
      createPublicKey({key:{kty:'EC',crv:'P-256',x:raw.subarray(1,33).toString('base64url'),y:raw.subarray(33).toString('base64url')},format:'jwk'})
    } catch {throw new StudioError('Clave de sesión inválida.')}
    const sessionId=createHash('sha256').update(`${actorId}:${input.publicKey}:${input.sessionId}`).digest('hex').slice(0,32)
    const actorKey=`${companyId}:${actorId}`,bucket=actors.get(actorKey)
    for(const [k,b]of actors)if(now()-b.start>=60000)actors.delete(k)
    if(bucket&&now()-bucket.start<60000&&bucket.count>=120)throw new StudioError('Se alcanzó el límite de renovaciones de colaboración.',429)
    if(actors.size>=4096&&!actors.has(actorKey))throw new StudioError('Hay demasiadas conexiones pendientes.',429)
    actors.set(actorKey,bucket&&now()-bucket.start<60000?{...bucket,count:bucket.count+1}:{start:now(),count:1})
    const rateKey=`${companyId}:${actorId}:${sessionId}`, previous=recent.get(rateKey)
    if(previous && now()-previous<1000)throw new StudioError('Espera antes de renovar la sesión.',429)
    for(const [k,t]of recent)if(now()-t>60000)recent.delete(k)
    if(recent.size>=4096&&!recent.has(rateKey))throw new StudioError('Hay demasiadas conexiones pendientes.',429)
    recent.set(rateKey,now())
    return prisma.$transaction(async db=>{
      const [scope]=await db.$queryRaw`SELECT revision::text,
        (to_regprocedure('runly_studio.socket_allowed(text)') IS NOT NULL AND CASE WHEN to_regrole('runly_studio_socket') IS NOT NULL
          THEN has_schema_privilege('runly_studio_socket','realtime','USAGE') ELSE false END) AS "socketReady"
        FROM realtime_authorization_revision WHERE id FOR SHARE`
      if(!scope?.socketReady)throw new StudioError('Actualiza la base y la provisión de colaboración antes de usar este cliente.',503,'STUDIO_REALTIME_UNAVAILABLE')
      const record=await access.get(companyId,actorId,id,db,false,'collaboration')
      const [profile]=await db.$queryRaw`SELECT u.display_name AS name FROM user_profile u JOIN auth.sessions s ON s.user_id=u.auth_user_id
        WHERE u.id=${actorId}::uuid AND u.auth_user_id=${authUserId}::uuid AND u.enabled AND s.id=${claims.session_id}::uuid AND (s.not_after IS NULL OR s.not_after>now())`
      if(!profile)throw new StudioError('La sesión ya no está disponible.',401)
      const expiresAt=Math.min(issuedAt+STUDIO_REALTIME.leaseMs,claims.exp*1000)
      if(expiresAt-issuedAt<5000)throw new StudioError('Renueva tu sesión para colaborar.',401)
      const certificate={v:1,designId:id,companyId,actorId,sessionId,publicKey:input.publicKey,name:String(profile.name??'Colaborador').slice(0,120),role:record.role,epoch:scope.revision,issuedAt,expiresAt}
      const privateKey=key(secret), verificationKey=createPublicKey(privateKey).export({format:'der',type:'spki'}).subarray(-32).toString('base64url')
      const certificateSignature=sign(null,realtimeBytes(certificate),privateKey).toString('base64url')
      // Deliberately NO sub: this is not a Supabase Auth identity or API credential.
      const socketToken=signHs256Jwt({role:'runly_studio_socket',studio_version:1,studio_auth_id:authUserId,studio_auth_session_id:claims.session_id,
        studio_profile_id:actorId,studio_company_id:companyId,studio_design_id:id,studio_epoch:scope.revision,studio_session_id:sessionId,iat:issuedAt/1000,exp:expiresAt/1000},secret,30)
      return {version:1,certificate,certificateSignature,verificationKey,socketToken,serverTime:now(),expiresAt,renewAfterMs:STUDIO_REALTIME.renewMs,
        topic:`studio:ephemeral:${id}@${scope.revision}`,documentTopic:`studio:design:${id}@${scope.revision}`,revision:record.revision,canEdit:record.canEdit,
        pages:record.pages??documentPages(record.document).map(s=>({id:s.page.id??'page-1',width:s.page.width,height:s.page.height}))}
    })
  }
  return {context}
}
