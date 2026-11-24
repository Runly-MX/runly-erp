// Fail-closed preflight of the container security profile. The isolated
// runtime must not run untrusted code in an environment that cannot enforce
// the profile (an old runtime, a daemon that ignores a flag, a missing cgroup
// controller). The supervisor runs this once per profile and refuses jobs
// when anything is not enforced: custom code stays disabled, declarative
// modules (which never use the supervisor) are unaffected.
import { docker, hardeningArgs } from './orchestrator.js'

// Runs inside a container started with the exact job flags (and no network).
const PROBE = `
st() { grep "^$1:" /proc/self/status | cut -f2; }
t() { if eval "$2" >/dev/null 2>&1; then echo "$1=1"; else echo "$1=0"; fi; }
echo "uid=$(id -u)"
echo "capeff=$(st CapEff)"
echo "capbnd=$(st CapBnd)"
echo "rootro=$(awk '$2=="/"{print $4}' /proc/mounts | tr , '\n' | grep -cx ro)"
echo "nnp=$(st NoNewPrivs)"
echo "seccomp=$(st Seccomp)"
echo "pids=$(cat /sys/fs/cgroup/pids.max 2>/dev/null)"
echo "mem=$(cat /sys/fs/cgroup/memory.max 2>/dev/null)"
echo "nics=$(ls /sys/class/net | tr '\n' ',')"
t rootWritable 'touch /probe-root'
t sockets 'test -e /var/run/docker.sock -o -e /run/docker.sock'
t unshare 'unshare -U true'
t mount 'mount -t tmpfs none /mnt'
t tmpExec 'cp /bin/true /tmp/x && /tmp/x'
echo "env=$(env | grep -ciE 'secret|token|_key|password|database_url')"
`

export async function verifyHardeningProfile({ image, pids = 64, memoryMb = 128, run = docker } = {}) {
  const failed = []
  if (!/@sha256:[0-9a-f]{64}$/.test(image ?? '')) failed.push('image-not-pinned-by-digest')
  const result = await run(['run', '--rm', '--network', 'none', ...hardeningArgs(pids), '--memory', `${memoryMb}m`, '--memory-swap', `${memoryMb}m`,
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', image, 'sh', '-c', PROBE], { timeoutMs: 60_000 })
  if (result.code !== 0) return { ok: false, failed: [...failed, 'probe-did-not-run'], checks: {} }
  const c = Object.fromEntries(result.stdout.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
  const expect = (name, ok) => { if (!ok) failed.push(name) }
  expect('non-root-user', c.uid === '65534')
  // CapBnd, not CapEff: a non-root user has no effective capabilities even when none were dropped.
  expect('capabilities-dropped', /^0+$/.test(c.capeff ?? 'x') && /^0+$/.test(c.capbnd ?? 'x'))
  expect('no-new-privileges', c.nnp === '1')
  expect('seccomp-filter', c.seccomp === '2')
  expect('pids-limit', c.pids === String(pids))
  expect('memory-limit', c.mem === String(memoryMb * 1024 * 1024))
  expect('no-network', (c.nics ?? '').replace(/,/g, '') === 'lo')
  expect('read-only-root', c.rootWritable === '0' && c.rootro === '1')
  expect('no-docker-socket', c.sockets === '0')
  expect('namespaces-blocked', c.unshare === '0')
  expect('mount-blocked', c.mount === '0')
  expect('tmp-noexec', c.tmpExec === '0')
  expect('clean-environment', c.env === '0')
  return { ok: failed.length === 0, failed, checks: c }
}
