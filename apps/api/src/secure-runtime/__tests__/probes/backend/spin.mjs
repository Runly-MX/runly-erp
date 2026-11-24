// Inert resource probe: busy loop until the orchestrator's timeout kills it.
export default async function spin() {
  for (;;) { /* burn CPU inside the container only */ }
}
