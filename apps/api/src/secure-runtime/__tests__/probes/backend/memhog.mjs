// Inert resource probe: allocates memory until the container limit stops it.
export default async function memhog() {
  const keep = []
  for (let i = 0; i < 4096; i++) keep.push(Buffer.alloc(1024 * 1024, 1))
  return { allocatedMb: keep.length }
}
