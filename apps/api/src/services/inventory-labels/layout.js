// layout.js — label layout model. The pure model lives in @runly/core/labels
// (shared with the Etiquetas studio preview); this wrapper turns its validation
// errors into InventoryServiceError (400) for the API routes.
import * as core from '@runly/core/labels';
import { InventoryServiceError } from '../inventory-guards.js';

export * from '@runly/core/labels';

const wrap = (fn) => (...args) => {
  try {
    return fn(...args);
  } catch (err) {
    if (err instanceof core.LabelLayoutError) throw new InventoryServiceError(err.message, 400);
    throw err;
  }
};

// Local exports shadow the re-exported originals.
export const normalizeQrOptions = wrap(core.normalizeQrOptions);
export const normalizeTextOptions = wrap(core.normalizeTextOptions);
export const normalizeSheet = wrap(core.normalizeSheet);
export const normalizeLayout = wrap(core.normalizeLayout);
export const expandQueue = wrap(core.expandQueue);
