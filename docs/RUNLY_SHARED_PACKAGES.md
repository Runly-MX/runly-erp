# Shared packages: Runly-MX

The official source is **Runly-MX/runly-erp** and the consumer is
**Runly-MX/runly-developer-hub**. Six private packages are distributed through
https://npm.pkg.github.com under **@runly-mx**: core, module-engine,
module-compiler, ui, sdk and preview-runtime.

Logical @runly/* imports and Atlas aliases stay unchanged. Source workspace
package names/exports stay logical. Release staging uses @runly-mx/<name>;
internal dependency keys retain @runly/* / @atlas/* with exact
npm:@runly-mx/<name>@0.1.0-source.<FULL_SHA> specs. Runtime external maps,
CUSTOM policy and compiler aliases stay logical. The physical scope is a
distribution identity, not a module import API. JS/JSX/CSS src exports retain
Vite/esbuild compilation.

Source manifests are private with restricted GitHub publishConfig. Staging
removes private/scripts/devDependencies/tests and preserves the existing
package format without a repository field. rme3SourceRepository and the
release manifest repository record Runly-MX/runly-erp. No invented declaration
files or changes to already published package contents.

## Immutable release

From clean main run `pnpm release:shared` (no --publish). git archive pins
the exact committed full SHA. shared-packages.release.json pins the official
source, scopes and six-package allowlist.
.artifacts/shared-release/<FULL_SHA>/manifest.json schema 3 records logical
package, physical registryPackage, exact versions, sourceRevision, SHA-256,
SHA-512, file inventory/contentDigest and preview contract provenance.
This is content provenance, not an npm/Sigstore attestation. All shipped
modules/exports and declared imports are validated with esbuild.

The workflow is manual, publish=false by default, and requires a full revision
reachable from main. Prepare tests core/engine, directed compiler
archive/contracts/static inspection and release policy, then packs six packages.
Publishing runs only in Runly-MX/runly-erp through the protected
**shared-packages** environment with required review/main restrictions and
**RUNLY_SHARED_PUBLISH_ENABLED=true**. The publish job has contents:read and
packages:write and passes **secrets.GITHUB_TOKEN** as NODE_AUTH_TOKEN.
No authentication selector or additional CI credential is required.

Probe all six versions before writing; only E404 means absent. Existing
SHA-512 must match; conflicts/auth/network errors abort. Partial release retries
use the same SHA, skipping identical versions. No deletion/republication or
latest pins. The release CLI accepts only --revision, --repository, --output
and --publish; publishing also requires Actions, explicit enablement, a token
and the official ERP repository.

## Access and consumers

Each package remains private. Manage Actions access grants
**Runly-MX/runly-erp Write** and **Runly-MX/runly-developer-hub Read**.
The Hub clean workflow uses its native GITHUB_TOKEN with packages:read.
Review package access separately from visibility and collaborator permissions.

Tracked .npmrc maps @runly-mx only and contains no credential. Local auth uses
an external user npmrc / NPM_CONFIG_USERCONFIG with a read-only credential
(PAT classic read:packages and package Read). Never put its value in the repo,
CLI or logs. The VPS independently uses an external read-only npmrc mounted
as a BuildKit secret; it does not receive an Actions GITHUB_TOKEN.

The Hub has adopted 0.1.0-source.4299bec165678ea27c24a3cb2dcf345bb9adc7b8.
Future adoption requires all six versions, their approved manifest and clean
frozen installs/contracts/build without a source sibling or local shared TGZ.
DEV snapshots remain external dirty sandboxes, never release pins.

Consumer operations: Hub docs/RUNLY_SHARED_PACKAGES.md.
[GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry),
[package access](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility),
[npm aliases](https://docs.npmjs.com/cli/v11/using-npm/package-spec/).
Local preparation does not publish, push or deploy.
