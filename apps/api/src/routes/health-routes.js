import { Hono } from 'hono';

export function createHealthRoutes({ readiness, formatLogTimestamp, getConfiguredTimeZone, now = () => new Date() }) {
  const app = new Hono();
  app.get('/health', c => {
    const time = now();
    c.header('Cache-Control', 'no-store');
    return c.json({ ok: true, name: 'Runly API', time: time.toISOString(),
      localTime: formatLogTimestamp(time), timeZone: getConfiguredTimeZone() });
  });
  app.get('/ready', async c => {
    const result = await readiness.check();
    c.header('Cache-Control', 'no-store');
    return c.json(result, result.ok ? 200 : 503);
  });
  return app;
}
