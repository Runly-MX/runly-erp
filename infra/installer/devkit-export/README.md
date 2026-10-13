# Runly ERP Dev Kit (RME3)

This folder is generated from Runly ERP and downloaded into `custom-modules/_runly-devkit/`. Existing `_atlas-devkit/` installations are reused in place.

## Start Here

1. Read `AGENTS.md`.
2. Read `docs/ai-context/rme3-modules.md`.
3. Read `docs/ai-context/rme3-runtime-capabilities.md`.
4. If generating code with AI, paste `prompt-starter.txt` first.
5. If the module uses a CUSTOM view, compare it against `golden-path-module/` before debugging.

## Important Files

- `capabilities.runtime.json` — machine-readable contract for imports, UI exports, and CUSTOM requirements.
- `troubleshooting.md` — common RME3 installer-mode failures and fixes.
- `golden-path-module/` — minimal working module with CRUD + CUSTOM dashboard.
- `docs/module-quality-standards.md` — shared UX and behavioral standards.

## Non-Negotiable Import Rules

- `toast` comes from `sonner`, not from `@runly/ui`.
- `@runly/ui` is for UI components only.
- Supported externals: @atlas/sdk, @atlas/ui, @atlas/validators, @runly/sdk, @runly/ui, @runly/validators, @tanstack/react-query, @zxing/browser, lucide-react, qrcode, react, react-dom, react-router-dom, react/jsx-dev-runtime, react/jsx-runtime, recharts, sonner, zustand

