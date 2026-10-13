import crypto from "node:crypto";

// Small clock-skew tolerance for JWT expiry checks. Without this, a background
// PWA module window whose access token expires by only a few seconds (e.g. after
// system sleep, where setTimeout-based refresh timers are unreliable) gets an
// immediate 401 instead of a chance to refresh. Kept small (seconds, not minutes)
// so it does not meaningfully weaken the real expiration guarantee.
export const JWT_CLOCK_SKEW_LEEWAY_SECS = 10;

// Signs a local HS256 JWT with the same secret Supabase uses for its own
// access tokens (SUPABASE_JWT_SECRET). Used to mint short-lived tokens for
// principals that never go through real Supabase Auth (e.g. storefront chat
// guests) — the Realtime server verifies the signature the same way it does
// for a real Supabase-issued token, so `role`/other claims in `payload` are
// honored by Realtime Authorization RLS policies exactly as they would be
// for any other authenticated connection. Never embed anything in `payload`
// that a real authenticated-role policy elsewhere in the schema could act on
// unintentionally — see chat_conv_receive's guest_session_id claim for the
// pattern this is meant for.
export function signHs256Jwt(payload, secret, expiresInSecs) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { iat: now, exp: now + expiresInSecs, ...payload };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  return `${headerB64}.${payloadB64}.${signature}`;
}

// Verify a Supabase HS256 JWT locally without a network call.
// Returns the payload if valid, null otherwise.
export function verifySupabaseJwt(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    if (!header || typeof header !== "object" || Array.isArray(header) || header.alg !== "HS256") return null;
    // This local verifier implements ordinary encoded HS256 JWTs only.
    if (Object.hasOwn(header, "crit") || (Object.hasOwn(header, "b64") && header.b64 !== true)) return null;

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest("base64url");

    const expectedBuf = Buffer.from(expectedSig);
    const receivedBuf = Buffer.from(signatureB64);
    // timingSafeEqual requires identical lengths; mismatch means invalid signature
    if (expectedBuf.length !== receivedBuf.length) return null;
    if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp + JWT_CLOCK_SKEW_LEEWAY_SECS <= now) return null;
    if (Object.hasOwn(payload, "nbf") &&
        (typeof payload.nbf !== "number" || !Number.isFinite(payload.nbf) || payload.nbf > now + JWT_CLOCK_SKEW_LEEWAY_SECS)) return null;
    return payload;
  } catch {
    return null;
  }
}
