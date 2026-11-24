// Inert probe: an idle executor, to measure the resident cost of one job container.
export default async function idle({ input }) {
  await new Promise((resolve) => setTimeout(resolve, input.ms ?? 4000))
  return { idleMs: input.ms ?? 4000 }
}
