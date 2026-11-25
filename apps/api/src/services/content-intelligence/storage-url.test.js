import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toInternalSupabaseUrl } from '../../lib/supabase-public-url.js';
test('server download reverses only the configured public Storage origin',()=>{
  const env={SUPABASE_URL:'http://supabase-kong:8000',RUNLY_SUPABASE_PUBLIC_URL:'https://storage.example.test'};
  assert.equal(toInternalSupabaseUrl('https://storage.example.test/storage/v1/object/sign/test?token=synthetic',env),
    'http://supabase-kong:8000/storage/v1/object/sign/test?token=synthetic');
  assert.equal(toInternalSupabaseUrl('https://unrelated.example.test/file',env),'https://unrelated.example.test/file');
});
