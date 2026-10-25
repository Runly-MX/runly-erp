// Pure scheduling helpers for the Gantt (no database): day arithmetic on task dates
// (stored at noon UTC) and the dependency graph rules. Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 1.
const DAY_MS = 86_400_000;
export const MAX_PUSHED_TASKS = 200;
const MAX_DEPTH = 500;

// Task dates are noon UTC: whole days apart are exactly DAY_MS apart.
export const dayDiff = (from, to) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
export const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS);

// Day text (YYYY-MM-DD or ISO) -> noon UTC; null when it is not a real date.
export function parseDay(value) {
  const part = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return null;
  const date = new Date(`${part}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Rejects impossible days like 2026-02-30, which JavaScript rolls over to March.
  // eslint-disable-next-line no-restricted-syntax -- noon UTC task dates
  return date.toISOString().slice(0, 10) === part ? date : null;
}

// edges: [{ blockerId, blockedId }]. Adding blocker -> blocked closes a loop when the
// blocked task already (transitively) blocks the blocker. Iterative, visited-set, depth-capped.
export function wouldCreateCycle(edges, blockerId, blockedId) {
  if (blockerId === blockedId) return true;
  const next = new Map();
  for (const edge of edges) {
    if (!next.has(edge.blockerId)) next.set(edge.blockerId, []);
    next.get(edge.blockerId).push(edge.blockedId);
  }
  const seen = new Set([blockedId]);
  let frontier = [blockedId];
  for (let depth = 0; frontier.length && depth < MAX_DEPTH; depth += 1) {
    const upcoming = [];
    for (const id of frontier) {
      for (const child of next.get(id) ?? []) {
        if (child === blockerId) return true;
        if (!seen.has(child)) { seen.add(child); upcoming.push(child); }
      }
    }
    frontier = upcoming;
  }
  return false;
}

// Tasks that depend (transitively) on `taskId`, nearest first, without repeats.
export function dependentsOf(edges, taskId) {
  const next = new Map();
  for (const edge of edges) {
    if (!next.has(edge.blockerId)) next.set(edge.blockerId, []);
    next.get(edge.blockerId).push(edge.blockedId);
  }
  const order = [];
  const seen = new Set([taskId]);
  let frontier = [taskId];
  while (frontier.length && order.length <= MAX_PUSHED_TASKS) {
    const upcoming = [];
    for (const id of frontier) {
      for (const child of next.get(id) ?? []) {
        if (!seen.has(child)) { seen.add(child); order.push(child); upcoming.push(child); }
      }
    }
    frontier = upcoming;
  }
  return order;
}

// New dates of the dependents when their blocker moved `days` later: each keeps its length.
// Tasks with no dates stay as they are. Returns [{ id, startDate, dueDate }] (at most MAX_PUSHED_TASKS).
export function pushedDates(tasksById, dependentIds, days) {
  if (!Number.isInteger(days) || days <= 0) return [];
  const moved = [];
  for (const id of dependentIds.slice(0, MAX_PUSHED_TASKS)) {
    const task = tasksById.get(id);
    if (!task || (!task.startDate && !task.dueDate)) continue;
    moved.push({ id, startDate: task.startDate ? addDays(task.startDate, days) : null, dueDate: task.dueDate ? addDays(task.dueDate, days) : null });
  }
  return moved;
}
