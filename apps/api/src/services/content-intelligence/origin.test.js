import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { createWebsiteOriginGuard } from '../website-origin-guard.js';
import { createContentIntelligenceRouter } from '../../routes/content-intelligence.js';
test('internal worker DNS reaches dedicated authentication without exposing administration',async()=>{
  const app=new Hono();
  app.use('*',createWebsiteOriginGuard({gateway:{authority:async()=> 'api'}}));
  app.route('/',createContentIntelligenceRouter({prisma:{},filesService:{},supabaseAdmin:{},
    authMiddleware:async(c,next)=>next(),requirePermission:()=>async(c,next)=>next(),env:{RUNLY_CONTENT_WORKER_TOKEN:'synthetic-secret-for-test-only-32-chars'}}));
  for(const route of ['/content/worker/claim','/content/worker/heartbeat']) {
    const response=await app.request(route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,401);
  }
  assert.equal((await app.request('/content/admin/company')).status,404);
  assert.equal((await app.request('/content/files/invalid')).status,404);
});
