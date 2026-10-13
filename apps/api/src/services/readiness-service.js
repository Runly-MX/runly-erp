const ROUTE_STATES = new Set(['LOADED', 'MISSING_API', 'UNLOADED']);

export function isModuleRuntimeReady(initialized, statuses) {
  return initialized === true && statuses != null && typeof statuses === 'object'
    && !Array.isArray(statuses) && Object.values(statuses).every(value => ROUTE_STATES.has(value?.status));
}

// The shared application pool is reused; at most one client is acquired by
// the readiness service. Aborting cannot remove a pending pool acquisition,
// so a late client is destroyed before any query is issued.
export function createPoolReadinessProbe(pool) {
  return async ({ signal }) => {
    if (signal.aborted) throw new Error('Probe aborted');
    let client, released = false;
    const release = destroy => {
      if (!client || released) return;
      released = true;
      client.release(destroy);
    };
    const onAbort = () => release(true);
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      client = await pool.connect();
      if (signal.aborted) throw new Error('Probe aborted');
      const result = await client.query('SELECT 1 AS ready');
      if (signal.aborted || result?.rows?.[0]?.ready !== 1) throw new Error('Probe unavailable');
      release(false);
      return true;
    } catch (error) {
      release(true);
      throw error;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };
}

export function createReadinessService({ probeDatabase, isRuntimeReady, timeoutMs = 1500,
  successCacheMs = 1000, failureCacheMs = 250, now = Date.now }) {
  if (typeof probeDatabase !== 'function' || typeof isRuntimeReady !== 'function') throw new TypeError('Readiness dependencies required');
  for (const [name, value] of Object.entries({ timeoutMs, successCacheMs, failureCacheMs })) {
    if (!Number.isSafeInteger(value) || value < (name === 'timeoutMs' ? 1 : 0)) throw new TypeError(`Invalid ${name}`);
  }
  let cached = null, inFlight = null;
  const runtimeReady = () => {
    try { return isRuntimeReady() === true; } catch { return false; }
  };
  const response = database => {
    const runtime = runtimeReady() ? 'ready' : 'unavailable';
    return { ok: database === 'ready' && runtime === 'ready', checks: { database, runtime } };
  };
  function startProbe() {
    const controller = new AbortController();
    let resolveResponse, settled = false;
    const flight = { response: new Promise(resolve => { resolveResponse = resolve; }) };
    inFlight = flight;
    const finish = database => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cached = { database, expiresAt: now() + (database === 'ready' ? successCacheMs : failureCacheMs) };
      resolveResponse(database);
    };
    const timer = setTimeout(() => { controller.abort(); finish('timeout'); }, timeoutMs);
    // Keep this flight even after its HTTP deadline until the underlying
    // operation settles. A hung pool/query must not accumulate new probes.
    Promise.resolve().then(() => probeDatabase({ signal: controller.signal }))
      .then(value => finish(value === true ? 'ready' : 'unavailable'), () => finish('unavailable'))
      .finally(() => { if (inFlight === flight) inFlight = null; });
    return flight.response;
  }
  async function check() {
    if (!runtimeReady()) return { ok: false, checks: { database: 'not_checked', runtime: 'unavailable' } };
    if (cached && now() < cached.expiresAt) return response(cached.database);
    const database = await (inFlight?.response ?? startProbe());
    return response(database);
  }
  return { check };
}
