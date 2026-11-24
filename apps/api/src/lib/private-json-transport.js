import { compress } from 'hono/compress'
import { etag } from 'hono/etag'

// Transport policy for large, per-user, bearer-authenticated JSON that carries no secrets and
// reflects no request input (/blueprints, /runtime/modules): gzip it, and let the browser
// revalidate with a weak ETag. `private, no-cache` means the entry is never shared and is
// checked on every use, so a revoked permission or module change is seen on the next request;
// a 304 only happens when the body for THIS user and company is byte-identical.
// Do not add routes that echo user input, return tokens or signed URLs, or rely on cookies
// (BREACH needs a secret and attacker-controlled text in one compressed body).
export const privateJsonTransport = () => [
  async (c, next) => {
    c.header('Cache-Control', 'private, no-cache')
    c.header('Vary', 'Authorization, X-Runly-Company-Id', { append: true })
    await next()
  },
  compress(),
  etag({ weak: true }),
]
