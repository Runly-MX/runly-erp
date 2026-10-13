import { verifySupabaseJwt } from "./jwt-verification.js";
import { createHash } from "node:crypto";

export function createAuthMiddleware({
  supabaseAdmin,
  cacheGet,
  cacheSet,
  userContextTtlSeconds,
  getJwtSecret = () => process.env.SUPABASE_JWT_SECRET,
  warn = (...args) => console.warn(...args),
}) {
  function cacheVerifiedIdentity(key, userId, expiresAt, maximumSeconds) {
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return;
    const seconds = Math.min(expiresAt - Math.floor(Date.now() / 1000) - 30, maximumSeconds);
    if (Number.isFinite(seconds) && seconds > 0) cacheSet(key, userId, seconds);
  }

  function remoteExpiry(token) {
    // Unverified decoding only SHORTENS caching after getUser has verified the
    // identity. It never supplies sub, permissions, or an authentication result.
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      return payload && typeof payload === "object" && Object.hasOwn(payload, "exp") ? payload.exp : null;
    } catch { return null; }
  }

  return async function authMiddleware(c, next) {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token)
      return c.json({ error: "No autorizado. Debes iniciar sesion." }, 401);

    const cacheKey = `auth:token:${createHash("sha256").update(token).digest("hex")}`;
    let userId = cacheGet(cacheKey);
    if (!userId) {
      const jwtSecret = getJwtSecret();
      const payload = jwtSecret ? verifySupabaseJwt(token, jwtSecret) : null;

      if (payload?.sub) {
        userId = payload.sub;
        cacheVerifiedIdentity(cacheKey, userId, payload.exp, 300);
      } else {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data.user) {
          warn(
            "[auth] token rejected:",
            error?.status ?? "",
            error?.message ?? "no user",
            jwtSecret ? "(local HS256 verify failed)" : "(SUPABASE_JWT_SECRET unset)",
          );
          return c.json({ error: "No autorizado. Token invalido o expirado." }, 401);
        }
        userId = data.user.id;
        cacheVerifiedIdentity(cacheKey, userId, remoteExpiry(token), userContextTtlSeconds);
      }
    }

    c.set("authUserId", userId);
    await next();
  };
}
