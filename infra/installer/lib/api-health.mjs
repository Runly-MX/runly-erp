// The API exits at boot when it cannot serve (for example when the Notes
// Storage protections are missing). Compose then restarts it forever, so
// "containers started" is not evidence that the installation works.
// The API is published on RUNLY_PUBLIC_BIND_ADDR:RUNLY_API_HOST_PORT (compose defaults
// 0.0.0.0:4010); probe the address the installation actually uses.
export function resolveApiHealthUrl({ bindAddr, port } = {}) {
  const host = !bindAddr || bindAddr === "0.0.0.0" ? "127.0.0.1" : bindAddr;
  const number = Number(port);
  return `http://${host}:${Number.isInteger(number) && number > 0 ? number : 4010}/health`;
}

export async function waitForApiHealth({ url = "http://127.0.0.1:4010/health", timeoutMs = 180000, intervalMs = 3000, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = Date.now } = {}) {
  const deadline = now() + timeoutMs;
  let last = "no response";
  while (now() < deadline) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error?.cause?.code ?? error?.message ?? "no response";
    }
    await sleep(intervalMs);
  }
  throw new Error(`API_HEALTH_CHECK_FAILED: ${url} did not become healthy (${last}). The installation is NOT ready. Inspect the API container logs (docker compose logs --tail 60 <api service>); NOTES_STORAGE_OWNER_PREPARATION_REQUIRED means the Notes Storage protections must be prepared with the database owner (see docs/deployment/NOTES_PRIVATE_STORAGE_SECURITY_CLOSURE.md). Never make the Notes buckets public to work around it.`);
}
