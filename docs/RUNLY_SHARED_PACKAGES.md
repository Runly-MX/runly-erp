# Shared packages: Runly-MX

Physical namespace: **@runly-mx**, registry https://npm.pkg.github.com; six packages
PRIVATE. Source remains raulbellosom/runly-erp; no repository transfer.

Logical @runly/* imports and Atlas aliases stay unchanged. Source workspace
package names/exports stay logical. Only release staging changes name to
@runly-mx/<name>; internal dependency keys retain @runly/* / @atlas/* with
exact npm:@runly-mx/<name>@0.1.0-source.<FULL_SHA> specs. Runtime external maps,
CUSTOM policy and compiler aliases stay logical. Physical scope is not a new
module import API. JS/JSX/CSS src exports retain Vite/esbuild compilation.

Source manifests are private with restricted GitHub publishConfig. Staging
removes private/scripts/devDependencies/tests and omits repository to avoid
automatic cross-owner linkage. rme3SourceRepository and manifest.repository
record original source. No invented declaration files.

From clean main run `pnpm release:shared` (no --publish). git archive pins
exact committed SHA. shared-packages.release.json pins scopes/source owner.
.artifacts/shared-release/<FULL_SHA>/manifest.json schema 3 records logical
package, physical registryPackage, exact versions, sourceRevision, SHA-256,
SHA-512, file inventory/contentDigest and preview contract provenance.
This is content provenance, not an npm/Sigstore attestation. All shipped
modules/exports and declared imports are validated with esbuild.

Workflow is manual only, publish=false default; full revision reachable from
main. Prepare tests core/engine, directed compiler archive/contracts/static
inspection and release policy, then packs six packages.
Normal publish: protected shared-packages environment, explicit enabled
variable, contents:read/packages:write, GITHUB_TOKEN. External source owner
also requires RUNLY_SHARED_GITHUB_TOKEN_ACCESS_VERIFIED=true; never assume
org publishing permission from an external repository.

Bootstrap is distinct: protected shared-packages-bootstrap, secret
RUNLY_SHARED_BOOTSTRAP_TOKEN (PAT classic write:packages of authorized org
member, short expiry/SSO if needed), RUNLY_SHARED_PUBLISH_ENABLED=true;
auth_mode=bootstrap. Job has contents:read only, PAT used only for publish.
No credential in repo/CLI/logs and no automatic normal-to-bootstrap fallback.
Check Private and Manage Actions access source Write / Hub Read if GitHub
permits selecting external-owner repos; verify effective permissions.
If not selectable, use a small publisher repo under Runly-MX checking out
original source at reviewed exact SHA: no source transfer. This alternative
repo is not created automatically. After normal GITHUB_TOKEN publishing
works, delete bootstrap secret/environment and revoke PAT.

Reviewed alternative workflow: [org publisher template](shared-packages-org-publisher.yml).

Probe all six versions before writing; only E404 means absent. Existing
SHA-512 must match; conflicts/auth/network abort. Partial release retries
same SHA, skipping identical versions. No deletion/re-publish or latest pins.
Tracked .npmrc maps @runly-mx only. Local auth uses external user npmrc /
NPM_CONFIG_USERCONFIG; PAT classic read:packages + package Read, no value in chat.
Hub adopts only after six versions exist and clean install/contracts/build
pass without source sibling/TGZ. Active legacy locks remain until then.
DEV snapshots are external dirty sandboxes, never release pins.

Operator steps: Hub docs/RUNLY_SHARED_PACKAGES.md.
[GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry),
[package access](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility),
[npm aliases](https://docs.npmjs.com/cli/v11/using-npm/package-spec/).
Preparation performs no push, publish, transfer, VPS, SSH, signing/S7B or deploy.
