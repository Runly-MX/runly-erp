export function filesError(error, fallback = "No se pudo completar la operación.") {
  try {
    return JSON.parse(error.message).error || fallback;
  } catch {
    return fallback;
  }
}
