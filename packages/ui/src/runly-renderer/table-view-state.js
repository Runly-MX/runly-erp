// Remembers a list's page / search / filters / sort for the browser session, so
// coming back from a record (or switching module and returning) lands on the
// same page with the same filters instead of resetting to page 1.
const PREFIX = "runly.tableview.";

function storageKeyFor(scope) {
  return scope ? `${PREFIX}${scope}` : null;
}

export function loadTableViewState(scope) {
  const key = storageKeyFor(scope);
  if (!key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveTableViewState(scope, state) {
  const key = storageKeyFor(scope);
  if (!key) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode / quota): the list just won't be remembered.
  }
}
