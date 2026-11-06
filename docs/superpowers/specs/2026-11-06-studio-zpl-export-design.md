# Studio: ZPL export, Zebra printers and inventory print log

Phase 3 of the "etiquetas desde Studio" roadmap (after
`2026-11-06-studio-module-data-labels-design.md`). Plan: implemented directly in
`lib/studio-zpl.js`, `exportZpl` in `lib/studio-export.js`, `ZplOptions.jsx` and
`DesignEditor.jsx` (steps listed under Behavior).

## Behavior

- New export type **ZPL (Zebra)** for the active page, with or without bulk data
  (one `^XA..^XZ` label per row).
- Hybrid output: the label is rendered at the printer resolution
  (scale = dpi / page ppi) and thresholded to 1 bit into a `^GFA` graphic with
  Zebra ASCII compression; QR and Code 128 objects that are visible, unrotated and
  at least one dot per module are hidden from the raster and emitted as native
  `^BQN` (error correction M) and `^BCN` (forced subset B) at the same place.
- Target: a ZPL printer registered in Inventario (`GET /inventory/label-printers`,
  its dpi) or a download at 203 / 300 / 600 dpi. Bluetooth printers print from the
  Android app through the inventory label transports; any other case downloads
  the `.zpl`.
- Print log: when the rows come from the Inventario source, PDF and ZPL exports
  are registered with `POST /inventory/labels/prints` (one per item, with the
  printer only when sent to it), as the Etiquetas screen does. PNG/JPG are not
  logged. A logging failure is a warning; the file is already delivered.

## Limits

No dithering (photos print as hard black/white); colors print black; rotated
codes stay in the raster. Not verified on a physical printer.

## Verification

Unit: compression round-trip with a decoder, native code commands. Lint, web build.
