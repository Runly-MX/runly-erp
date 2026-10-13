// apps/api/src/lib/__tests__/image-variants.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  IMAGE_VARIANTS,
  signedUrlWithVariant,
  signedUrlsWithVariant,
  publicUrlWithVariant,
  transformOptions,
} from '../image-variants.js'

function fakeSupabaseAdmin({ signedUrl = 'https://x/signed', signedUrls = null, publicUrl = 'https://x/public' } = {}) {
  const calls = { createSignedUrl: [], createSignedUrls: [], getPublicUrl: [] }
  return {
    calls,
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(objectKey, expiresIn, options) {
            calls.createSignedUrl.push({ bucket, objectKey, expiresIn, options })
            return { data: { signedUrl }, error: null }
          },
          async createSignedUrls(objectKeys, expiresIn, options) {
            calls.createSignedUrls.push({ bucket, objectKeys, expiresIn, options })
            return {
              data: signedUrls ?? objectKeys.map((path) => ({ path, signedUrl: `${signedUrl}/${path}` })),
              error: null,
            }
          },
          getPublicUrl(objectKey, options) {
            calls.getPublicUrl.push({ bucket, objectKey, options })
            return { data: { publicUrl: `${publicUrl}/${objectKey}` } }
          },
        }
      },
    },
  }
}

describe('IMAGE_VARIANTS', () => {
  it('defines thumb, card, banner, product with width/height/resize/quality, and full as null', () => {
    assert.deepEqual(IMAGE_VARIANTS.thumb, { width: 40, height: 40, resize: 'cover', quality: 70 })
    assert.deepEqual(IMAGE_VARIANTS.card, { width: 96, height: 96, resize: 'cover', quality: 75 })
    assert.deepEqual(IMAGE_VARIANTS.banner, { width: 1600, height: 400, resize: 'cover', quality: 80 })
    assert.deepEqual(IMAGE_VARIANTS.product, { width: 480, height: 480, resize: 'contain', quality: 80 })
    assert.equal(IMAGE_VARIANTS.full, null)
  })
})

describe('signedUrlWithVariant', () => {
  it('passes the transform option matching the requested variant', async () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    const url = await signedUrlWithVariant(supabaseAdmin, 'runly-files', 'a/b.png', 'thumb')
    assert.equal(url, 'https://x/signed')
    assert.deepEqual(supabaseAdmin.calls.createSignedUrl[0], {
      bucket: 'runly-files',
      objectKey: 'a/b.png',
      expiresIn: 3600,
      options: { transform: IMAGE_VARIANTS.thumb },
    })
  })

  it('omits the transform option for the full variant', async () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    await signedUrlWithVariant(supabaseAdmin, 'runly-files', 'a/b.png', 'full')
    assert.deepEqual(supabaseAdmin.calls.createSignedUrl[0].options, {})
  })

  it('omits the transform option for an unrecognized variant', async () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    await signedUrlWithVariant(supabaseAdmin, 'runly-files', 'a/b.png', 'nonsense')
    assert.deepEqual(supabaseAdmin.calls.createSignedUrl[0].options, {})
  })

  it('respects a custom expiresIn', async () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    await signedUrlWithVariant(supabaseAdmin, 'runly-files', 'a/b.png', 'card', 1800)
    assert.equal(supabaseAdmin.calls.createSignedUrl[0].expiresIn, 1800)
  })

  it('returns null when there is no bucket/objectKey', async () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    assert.equal(await signedUrlWithVariant(supabaseAdmin, null, null, 'thumb'), null)
  })
})

describe('signedUrlsWithVariant', () => {
  it('passes the transform option and returns signed URLs keyed by input order', async () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    const urls = await signedUrlsWithVariant(supabaseAdmin, 'runly-files', ['a.png', 'b.png'], 'card')
    assert.deepEqual(urls, ['https://x/signed/a.png', 'https://x/signed/b.png'])
    assert.deepEqual(supabaseAdmin.calls.createSignedUrls[0], {
      bucket: 'runly-files',
      objectKeys: ['a.png', 'b.png'],
      expiresIn: 3600,
      options: { transform: IMAGE_VARIANTS.card },
    })
  })

  it('returns an empty array for an empty input', async () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    assert.deepEqual(await signedUrlsWithVariant(supabaseAdmin, 'runly-files', [], 'card'), [])
    assert.equal(supabaseAdmin.calls.createSignedUrls.length, 0)
  })
})

describe('publicUrlWithVariant', () => {
  it('passes the transform option matching the requested variant', () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    const url = publicUrlWithVariant(supabaseAdmin, 'runly-website', 'a/b.png', 'product')
    assert.equal(url, 'https://x/public/a/b.png')
    assert.deepEqual(supabaseAdmin.calls.getPublicUrl[0], {
      bucket: 'runly-website',
      objectKey: 'a/b.png',
      options: { transform: IMAGE_VARIANTS.product },
    })
  })

  it('omits the transform option for the full variant', () => {
    const supabaseAdmin = fakeSupabaseAdmin()
    publicUrlWithVariant(supabaseAdmin, 'runly-website', 'a/b.png', 'full')
    assert.deepEqual(supabaseAdmin.calls.getPublicUrl[0].options, {})
  })
})

it('SUPABASE_IMAGE_TRANSFORMS=off signs the original instead of an imgproxy transform', () => {
  assert.deepEqual(transformOptions('thumb', { SUPABASE_IMAGE_TRANSFORMS: 'off' }), {})
  assert.deepEqual(transformOptions('thumb', { SUPABASE_IMAGE_TRANSFORMS: 'false' }), {})
  assert.ok(transformOptions('thumb', {}).transform)
  assert.ok(transformOptions('thumb', { SUPABASE_IMAGE_TRANSFORMS: 'on' }).transform)
})
