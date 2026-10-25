// Registry of document template kinds. A kind is the contract a module
// registers to use the documents engine: key, field schema (tags with labels
// and types), permission and data loader.
import { DocumentProviderError } from "../document-errors.js";

export const KIND_FIELD_TYPES = ["text", "number", "date", "image", "list"];

const invalid = (message) =>
  new DocumentProviderError(message, 500, "invalid_kind");

function assertText(value, message) {
  if (typeof value !== "string" || !value.trim()) throw invalid(message);
}

function assertKind(kind) {
  if (!kind || typeof kind !== "object") {
    throw invalid("El tipo de documento no cumple el contrato requerido.");
  }
  assertText(kind.key, "El tipo de documento necesita una clave (key).");
  assertText(kind.permissionKey, `El tipo de documento ${kind.key} necesita un permiso (permissionKey).`);
  if (typeof kind.load !== "function") {
    throw invalid(`El tipo de documento ${kind.key} necesita una función para cargar datos (load).`);
  }
  if (!Array.isArray(kind.schema)) {
    throw invalid(`El tipo de documento ${kind.key} necesita un esquema de campos (schema).`);
  }
  for (const entry of kind.schema) {
    assertText(entry?.tag, `Un campo del tipo ${kind.key} no tiene etiqueta (tag).`);
    assertText(entry?.label, `El campo ${entry.tag} del tipo ${kind.key} no tiene nombre (label).`);
    if (!KIND_FIELD_TYPES.includes(entry.type)) {
      throw invalid(`El campo ${entry.tag} del tipo ${kind.key} tiene un tipo inválido (usa ${KIND_FIELD_TYPES.join(", ")}).`);
    }
  }
}

export function createKindRegistry() {
  const kinds = new Map();

  function register(input) {
    const kind = input;
    assertKind(kind);
    const key = kind.key.trim();
    if (kinds.has(key)) {
      throw new DocumentProviderError(`El tipo de documento ${key} ya está registrado.`, 409, "kind_already_registered");
    }
    kinds.set(key, { ...kind, key });
    return kinds.get(key);
  }

  const unregister = (key) => kinds.delete(key);
  const getKind = (key) => kinds.get(key) ?? null;
  const listKinds = () => [...kinds.values()];

  function resolve(key) {
    const kind = getKind(key);
    if (!kind) throw new DocumentProviderError("Tipo de documento no encontrado.", 404, "kind_not_found");
    return kind;
  }

  function assertPermission(kind, { permissionKeys = [], isAdmin = false }) {
    if (isAdmin || new Set(permissionKeys).has(kind.permissionKey)) return;
    throw new DocumentProviderError(
      "No tienes permiso para consultar el origen del documento.",
      403,
      "source_permission_denied",
    );
  }

  async function load({ sourceType, companyId, sourceId, actorId, permissionKeys, isAdmin }) {
    const kind = resolve(sourceType);
    assertPermission(kind, { permissionKeys, isAdmin });
    return kind.load({ companyId, sourceId, actorId });
  }

  return { register, unregister, getKind, listKinds, resolve, assertPermission, load };
}
