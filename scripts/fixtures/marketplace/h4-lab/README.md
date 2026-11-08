# H4 lab resource feed (test data only)

Captured 2026-11-08 from the real Developer Hub H4 app running in a lab process (rolled-back fixture
transaction, real E1b writers, H3 validators, moderator approval, resource publisher and signer).

- `published/`: snapshot seq 2 with `studio.menu-del-dia@1.0.0` and `automation.aviso-de-pago@1.0.0`, plus both packages.
- `withdrawn-revoked/`: snapshot seq 4, the Studio release withdrawn and the automation release revoked
  (the Hub no longer serves their packages).

Signed with a disposable lab TEST key (public key in `signed.trust.keys`). It must never be pinned in
`apps/api/src/services/catalog/catalog-resource-public-key.js`. Used by `scripts/verify-marketplace-imports.mjs`.
