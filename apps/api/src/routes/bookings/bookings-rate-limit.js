// Token buckets of the public portal kept in PostgreSQL, so every API instance
// sees the same limits (an in-memory bucket per process multiplies them by the
// number of instances). One atomic statement per request; keys are hashed so no
// client IP is stored. The worker prunes idle buckets (pruneRateBuckets).
import crypto from 'node:crypto'

export function createSharedBucket({ prisma, capacity, refillPerSecond, now = () => Date.now(), namespace = 'bk' }) {
  const hashed = (key) => `${namespace}:${crypto.createHash('sha256').update(String(key)).digest('base64url').slice(0, 32)}`
  return {
    async consume(key) {
      const at = new Date(now())
      // Refill since the last hit (never negative if clocks differ), cap, then take one token.
      const rows = await prisma.$queryRaw`
        INSERT INTO booking_rate_bucket (key, tokens, updated_at)
        VALUES (${hashed(key)}, ${capacity - 1}::float8, ${at}::timestamptz)
        ON CONFLICT (key) DO UPDATE
           SET tokens = LEAST(${capacity}::float8, booking_rate_bucket.tokens + GREATEST(0, EXTRACT(EPOCH FROM (${at}::timestamptz - booking_rate_bucket.updated_at))) * ${refillPerSecond}::float8) - 1,
               updated_at = GREATEST(booking_rate_bucket.updated_at, ${at}::timestamptz)
         WHERE LEAST(${capacity}::float8, booking_rate_bucket.tokens + GREATEST(0, EXTRACT(EPOCH FROM (${at}::timestamptz - booking_rate_bucket.updated_at))) * ${refillPerSecond}::float8) >= 1
        RETURNING tokens`
      if (rows.length) return { allowed: true, retryAfter: 0 }
      const [row] = await prisma.$queryRaw`SELECT tokens FROM booking_rate_bucket WHERE key = ${hashed(key)}`
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((1 - Number(row?.tokens ?? 0)) / refillPerSecond)) }
    },
  }
}

export async function pruneRateBuckets(prisma, olderThanHours = 24) {
  return prisma.$executeRaw`DELETE FROM booking_rate_bucket WHERE updated_at < now() - make_interval(hours => ${olderThanHours}::int)`
}
