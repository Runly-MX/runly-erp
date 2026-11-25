import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';

export function createContentPressure({ clock = () => performance.now(), utilization = previous => performance.eventLoopUtilization(previous),
  rss = () => process.memoryUsage().rss, readLimit = () => readFile('/sys/fs/cgroup/memory.max','utf8') } = {}) {
  let previous = utilization(), observedAt = -Infinity, paused = false;
  let observation = { paused: false, apiLoopUtilization: null, apiRss: null, apiMemoryLimit: null, hostTelemetry: false };
  async function observe() {
    const now = clock();
    if (now-observedAt<2000) return observation;
    const delta = utilization(previous);
    previous = utilization();
    const memory = rss();
    const rawLimit = await readLimit().catch(() => null);
    const limit = rawLimit && /^\d+$/.test(rawLimit.trim()) ? Number(rawLimit) : null;
    const busy = delta.utilization;
    const first = observedAt===-Infinity;
    paused = !first && (busy>(paused?0.5:0.8) || (limit && memory>limit*(paused?0.65:0.8)));
    observation = { paused: Boolean(paused), apiLoopUtilization: busy, apiRss: memory, apiMemoryLimit: limit, hostTelemetry: false };
    observedAt = now;
    return observation;
  }
  return { observe };
}
