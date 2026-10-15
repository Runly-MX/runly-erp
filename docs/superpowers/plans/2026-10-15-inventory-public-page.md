# Inventory public item page (Phase 3, public page only)

Spec: `docs/superpowers/specs/2026-10-15-inventory-labels-qr-design.md`, "Phase 3 - Public page and kiosk" (kiosk is a later task).

## Steps

1. Migration + Prisma model `InvPublicToken` (`inv_public_token`): per item, `nonce`, `tokenHash` (sha256), `revokedAt`. The token is `HMAC-SHA256(secret, nonce)` so the database alone never holds a usable token, yet the QR can be re-rendered. Partial unique index: one active token per item.
2. `inventory-public-service.js`: settings (InstanceConfig key per company), `ensureToken`, `ensureTokens`, `revoke`, `revokeAll`, `resolve` (filtered by settings, photo signed URL, company brand).
3. Wire the label service (`tokenService`) so QR URLs are `<base>/app/p/inv/<token>`; `f-<folio>` links resolve to nothing (neutral invalid page).
4. Routes: `GET /public/inventory/items/:token` (no auth, rate limited, identical 404); authenticated `GET /inventory/items/:id/public-link`, `DELETE` to revoke, `GET/PUT /inventory/public-page-settings`, `POST /inventory/public-links/revoke-all`.
5. SDK domain methods; desktop `PublicInventoryItemScreen` at `/app/p/inv/:token`; detail "Etiqueta / QR" shows the real link + "Revocar enlace"; settings dialog from the Etiquetas screen.
6. Focused tests, docs update, lint + build:web.
