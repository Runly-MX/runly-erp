// Best-fit grid for N video tiles of a fixed aspect ratio inside a container:
// tries every column count and keeps the one that gives the biggest tiles
// (Meet/Teams-style "tiled" layout). Pure — the caller measures the box.

export const GRID_PAGE_SIZE = 16;

export function bestFitGrid({ count, width, height, aspect = 16 / 9, gap = 8, maxPerPage = GRID_PAGE_SIZE }) {
  const n = Math.max(1, Math.min(count, maxPerPage));
  if (!width || !height) return { cols: 1, rows: n, tileWidth: 0, tileHeight: 0, perPage: n };
  let best = { cols: 1, rows: n, tileWidth: 0, tileHeight: 0 };
  for (let cols = 1; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols);
    const cellW = (width - gap * (cols - 1)) / cols;
    const cellH = (height - gap * (rows - 1)) / rows;
    if (cellW <= 0 || cellH <= 0) continue;
    const tileWidth = Math.min(cellW, cellH * aspect);
    const tileHeight = tileWidth / aspect;
    if (tileWidth * tileHeight > best.tileWidth * best.tileHeight) {
      best = { cols, rows, tileWidth: Math.floor(tileWidth), tileHeight: Math.floor(tileHeight) };
    }
  }
  return { ...best, perPage: n };
}

export function pageCount(count, perPage = GRID_PAGE_SIZE) {
  return Math.max(1, Math.ceil(count / perPage));
}

export function pageSlice(items, page, perPage = GRID_PAGE_SIZE) {
  const last = pageCount(items.length, perPage) - 1;
  const safe = Math.min(Math.max(0, page), last);
  return items.slice(safe * perPage, safe * perPage + perPage);
}
