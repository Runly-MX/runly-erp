# Runly Canvas — DWG viewing via a one-time server conversion

## 1. Feature title

Canvas — insert AutoCAD `.dwg` plans (view only) through a stateless converter container.

## 2. Status

Complete — Verified: 2026-11-02 (see plan). Findings that changed the design: LibreDWG is not packaged for Debian bookworm, so the image compiles it from the GNU tarball; `dwg2dxf --as r2000` drops every entity of DWG 2004+, so the converter runs with the default output version. The Files service stores at most 10 MB, so a larger DWG is converted (limit 50 MB) but its original is not kept.

Approved (autonomous decision, 2026-11-02). Implementation tracked in `docs/superpowers/plans/2026-11-02-canvas-dwg-viewer.md`.

## 3. Context

Canvas already imports `.dxf` plans: the browser parses the file with `dxf-parser`, rasterizes it
(`apps/desktop/src/modules/runly.canvas/lib/dxf.js`) and inserts the PNG as a background image, calibrating the
page scale from `$INSUNITS`. DWG is the binary AutoCAD format and is explicitly a non-goal of
`2026-10-01-canvas-maps-dxf-design.md`. There is no maintained MIT/BSD DWG parser for the browser; WASM ports are
GPL, slow on large plans and heavy on the client.

## 4. Problem

Users hold their plans as DWG. Asking them to export DXF by hand is friction, but parsing DWG on every view would be
slow in the browser or expensive on the server.

## 5. Decision

Convert once, view forever. The DWG is converted to DXF a single time at insertion; from there the existing DXF
pipeline produces a PNG that is stored as a normal image asset. Opening the board never touches the converter again.

Converter: **LibreDWG** (`dwg2dxf`), run inside a new stateless container `runly-dwg`, in the same shape as
`runly-tts`. Reasons: open source (GPL, used only as an external process, never linked), packaged by Debian
(`libredwg-utils`), CLI without display server, redistributable inside the installer. ODA File Converter was
rejected because it is proprietary, needs per-customer license acceptance and a virtual display on Linux.

## 6. Goals

1. Insert a `.dwg` file from the same board toolbar button as images, PDF and DXF.
2. Original DWG is kept as a file (`sourceFileId`, like DXF); the PNG is the visible background.
3. Page auto-calibrates from the drawing units when the conversion yields `$INSUNITS`.
4. Optional infrastructure: without `DWG_CONVERTER_URL` the feature reports unavailable and the UI explains it.
5. Honest failure: unsupported or corrupt files produce a clear Spanish message; nothing is half-inserted.

## 7. Non-goals

1. Editing DWG, layers on/off, 3D, xrefs, plot styles, paper-space layouts.
2. A queue/worker job: conversion is a short synchronous request (seconds), like TTS.
3. Server-side rasterization or tiling (the DXF rasterizer already runs in the browser; revisit if real plans are too big).
4. Bundling ODA. An instance may point `DWG_CONVERTER_URL` at its own compatible service (same `POST /convert` contract).

## 8. Architecture

```
Browser --(POST /canvas/dwg/convert, raw DWG)--> Hono API --(POST /convert)--> runly-dwg (dwg2dxf)
Browser <-- DXF text -- API <-- DXF text ------
Browser: rasterizeDxf(text) -> PNG -> upload (same path as DXF)
```

- `apps/dwg/main.py`: stdlib HTTP server. `GET /health`, `POST /convert` (body = DWG bytes, response = DXF text).
  Validates the `AC10xx` magic, enforces `DWG_MAX_BYTES` (default 50 MB), runs `dwg2dxf` in a temp dir with a timeout
  (`DWG_TIMEOUT_SECONDS`, default 60), never keeps files. No auth: only the API reaches it on the internal network.
- `apps/api/src/routes/canvas/canvas-dwg.js`: `createDwgConverter({ env, fetchImpl })` with `isConfigured()` and
  `convert(buffer)`. Routes `GET /canvas/dwg/status` (`canvas.view`) and `POST /canvas/dwg/convert` (`canvas.edit`).
  The API re-checks magic and size before forwarding; maps converter failures to 422 (bad file) / 502 (service) / 503 (off).
- SDK: `canvas.dwg.status()` and `canvas.dwg.convert(file)` (returns DXF text).
- Desktop: `isDwg`, `insertDwg` in `useMediaInsert`, `.dwg` in the upload `accept`.
- Infra: `infra/docker/dwg.Dockerfile`, `pnpm docker:release:dwg`, compose service `runly-dwg` (profile `dwg`),
  env `DWG_CONVERTER_MODE=local|disabled`, `DWG_CONVERTER_URL` derived by the installers.

## 9. Permissions

No new permission: `canvas.edit` already gates inserting media into a board.

## 10. Error handling

| Case | API status | UI message |
|---|---|---|
| Converter not configured | 503 | "La conversión de DWG no está habilitada en esta instancia. Exporta el plano a DXF." |
| Not a DWG / unsupported version | 422 | "El archivo no es un DWG compatible. Exporta el plano a DXF." |
| Larger than limit | 413 | "El DWG supera el límite de 50 MB." |
| Converter down / timeout | 502 | "No se pudo convertir el DWG, intenta de nuevo." |
| DXF too large to rasterize | client | existing "El DXF es demasiado grande para importarlo." |

## 11. Testing

- API: node tests for `canvas-dwg.js` (unconfigured, bad magic, oversize, success, upstream error) with injected `fetchImpl`.
- Desktop: `isDwg` unit test.
- Converter: `apps/dwg` self-test against LibreDWG sample files when Docker is available (first plan task); recorded in the plan.
- Real-file compatibility with customer DWGs is unverified until a customer provides one; public LibreDWG samples are the baseline.

## 12. Risks

- LibreDWG is weaker on DWG 2018+ and dynamic blocks: failures surface as 422 with the DXF fallback message.
- GPL: the binary is invoked as a separate process in its own image; re-confirm before distributing the image publicly.
