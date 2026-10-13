import { verifySupabaseJwt } from "./jwt-verification.js";

export function createAuthMiddleware({
  supabaseAdmin,
  cacheGet,
  cacheSet,
  userContextTtlSeconds,
  getJwtSecret = () => process.env.SUPABASE_JWT_SECRET,
  warn = (...args) => console.warn(...args),
}) {
  return async function authMiddleware(c, next) {
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token)
      return c.json({ error: "No autorizado. Debes iniciar sesion." }, 401);

    const cacheKey = `auth:token:${token.slice(-32)}`;
    let userId = cacheGet(cacheKey);
    if (!userId) {
      const jwtSecret = getJwtSecret();
      const payload = jwtSecret ? verifySupabaseJwt(token, jwtSecret) : null;

      if (payload?.sub) {
        userId = payload.sub;
        const ttlSecs = payload.exp
          ? Math.min(payload.exp - Math.floor(Date.now() / 1000) - 30, 300)
          : userContextTtlSeconds;
        if (ttlSecs > 0) cacheSet(cacheKey, userId, ttlSecs);
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
        cacheSet(cacheKey, userId, userContextTtlSeconds);
      }
    }

    c.set("authUserId", userId);
    await next();
  };
}
