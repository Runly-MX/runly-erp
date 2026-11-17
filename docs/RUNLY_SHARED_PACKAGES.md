# Shared packages: Runly-MX

The official source is **Runly-MX/runly-erp** and the consumer is
**Runly-MX/runly-developer-hub**. Eight private packages are distributed through
https://npm.pkg.github.com under **@runly-mx**: core, module-engine,
module-compiler, ui, sdk, preview-runtime, studio-interchange and website-blocks.
The effective inventory is `shared-packages.release.json` (and each published
manifest), not a number quoted in prose.

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
**shared-packages** environment (deployment branch policy: main only) and
**RUNLY_SHARED_PUBLISH_ENABLED=true**. As of 2026-11-16 the environment has NO
required reviewers: the human gate is who may dispatch the workflow. The publish job has contents:read and
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

Latest release: 0.1.0-source.ca778628b583480acfea3714083bc451c482f582 (run
44001841552, Studio .runlystudio v2). Its Hub adoption is on the Hub branch
`integration/studio-next-shared-ca778628` until that pull request is merged; the
Hub main still pins 0.1.0-source.afc28075ca8f6a0a941a7d801e1f3eff7e596fd6.
Future adoption requires all six versions, their approved manifest and clean
frozen installs/contracts/build without a source sibling or local shared TGZ.
DEV snapshots remain external dirty sandboxes, never release pins.

Consumer operations: Hub docs/RUNLY_SHARED_PACKAGES.md.
[GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry),
[package access](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility),
[npm aliases](https://docs.npmjs.com/cli/v11/using-npm/package-spec/).
Local preparation does not publish, push or deploy.

## Isolated local consumer verification

After preparing a clean revision, run
`pnpm verify:shared-consumer --manifest .artifacts/shared-release/<FULL_SHA>/manifest.json`.
This installs exact logical npm aliases through a localhost fixture registry in
two outside-repository directories, including a frozen reinstall. Node contracts,
installed-file checksums, browser JSX/CSS, original Atlas aliases and runtime
singletons are checked. Consumer runtime pins are explicit; no sibling source or
ERP node_modules is used by its build. Scripts and user registry credentials are
disabled. Public dependencies may be downloaded; local caches are allowed.

Logs/receipt/fixture lock remain under ignored .artifacts/shared-consumer/<SHA>.
The ephemeral-registry lock is test evidence, not a production Hub lockfile.
GitHub Packages retrieval/access and actual Hub adoption remain separate checks;
the command neither publishes nor changes the consumer. Local evidence and limits:
`docs/architecture/2026-10-12-shared-consumer-verification.md`.

## Studio-interchange and website-blocks

`@runly/studio-interchange` (pure Studio/Website-template inspection, the Hub
validator) and `@runly/website-blocks` are released with the other six. See
`docs/architecture/2026-11-09-erp-e1b-shared-validators.md`.
