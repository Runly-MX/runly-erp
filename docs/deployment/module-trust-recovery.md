# Module trust and quarantine: recovery

Since F1B, a custom module's code runs only if its exact files were installed through an authorized source (Module Builder, official Runly catalog, or a package the platform owner uploaded) or approved by the platform owner after review. Anything else is **quarantined**: its code does not run, its screens show that it is quarantined, and **its data, tables and per-company settings are untouched**.

## Find out what is quarantined

On the server, with the instance's database URL in the environment (never print it):

```
node scripts/security/module-trust.mjs inventory
```

Each module gets one verdict:

| Verdict | How to recover |
|---|---|
| `TRUSTED` | Nothing to do |
| `REPUBLISH_FROM_BUILDER` | A company admin opens it in Module Builder and publishes it again |
| `REINSTALL_FROM_OFFICIAL_CATALOG` | Update or reinstall it from the official catalog |
| `OWNER_CODE_REVIEW` | Someone reviews `custom-modules/<key>/` (server code in `api/`, `module.manifest.js`, `models/`, `views/`, `seed.js`, `teardown.js`, and `components/`), then approves it |
| `NO_CODE_ON_DISK` | The database lists a module whose files are missing; nothing runs |

## Approving reviewed code

- **With a platform owner:** they open **Modules > module detail > Código del módulo > Aprobar después de revisar**. The API records the exact files that are on disk now; any later change on disk quarantines the module again.
- **Without a platform owner** (or if the owner is unavailable), an operator with server access can approve the code:

  ```
  node scripts/security/module-trust.mjs approve custom.<key> --reviewed
  ```

  Then restart the API and the worker, or wait 30 seconds. Server access already means full control of the instance, so this does not create a new authority; the decision is written to `audit_log`.
- **Assigning a platform owner** is done by transferring ownership (**Ajustes > Plataforma**), or through the setup of a new instance. A company administrator is never promoted automatically.

## Putting a module back in quarantine

- In the app: **Poner en cuarentena** (platform owner).
- Or on the server: `node scripts/security/module-trust.mjs quarantine custom.<key> --reason "..."`.

## What is never done automatically

No module is uninstalled, purged or disabled per company because of quarantine, and no data is deleted. Uninstalling or purging stays a separate, explicit action.
