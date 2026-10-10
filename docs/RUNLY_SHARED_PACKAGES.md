# Shared package releases

The six packages are @runly/core, module-engine, module-compiler, ui, sdk and
preview-runtime. Source versions remain 0.1.0; public APIs/exports remain intact.
They export JS/JSX/CSS source, have no declaration files, and use consumer
Vite/esbuild compilation. The release validates all exported paths and compiles
every shipped module without changing these API contracts.

`shared-packages.release.json` is the central release policy. A committed source
SHA deterministically maps every package to `<base>-source.<full-sha>`. The
generated manifest.json records source revision, exact versions, package SHA-256,
SHA-512 integrity, per-file inventory and preview contract. Hub adoption uses that
same manifest as its sole toolchain source pin. All six release together in this
implementation; unrelated runtime image pins remain separate deployment evidence.

Run `pnpm release:shared --repository runly/<source-repository>` from a clean main
checkout for a local package-content/build audit. It never publishes without
--publish. Packages are staged from git archive, not mutable working files.
Workspace dependencies become exact versions, preserving Atlas aliases through
`npm:@runly/<package>@<exact-version>`. Original manifests remain suitable for
monorepo development; private flags/devDependencies/scripts are removed only in
the publication staging copy. Tests/fixtures are not shipped. Existing types
targets, if introduced later, must resolve to shipped files.

`Shared packages controlled release` is workflow_dispatch only, with full SHA
input reachable from main and publish=false by default. It installs the frozen
source lockfile, tests core/engine and compiler archive/contracts/static-inspection,
builds and validates packed contents, then produces a downloadable manifest/TGZ
artifact. A publish requires the protected `shared-packages` environment, approved
review, RUNLY_SHARED_PUBLISH_ENABLED=true, a repository owned by **runly**, and
GITHUB_TOKEN packages:write. Only GitHub Packages is allowed; never npmjs.

**Ownership prerequisite:** @runly is GitHub's namespace for a personal account
or organization named runly. A repository under another owner cannot publish
those names by merely setting publishConfig.repository. Arrange authorized
publication under runly before enabling this workflow. No publication, GitHub
configuration, VPS operation or push is performed by the implementation task.

Each existing remote version must have identical SHA-512 or release fails before
the first publish. Only E404 permits a new publish; other lookup errors abort.
Partial publication can be retried for the same SHA; identical versions are
skipped. Never delete/re-publish or install latest as a production pin. The source
dist-tag is discovery-only. Verify all packages are Private in GitHub settings;
grant Hub Manage Actions access Read and technical users Read, without granting
write/delete. Do not rely on source repository visibility for package privacy.

For local consumers use scope-only repo .npmrc and user configuration outside the
checkout:

```ini
@runly:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Populate the variable privately; never put real values in docs, CLI args, git,
lockfiles or Docker. GitHub npm Packages outside Actions supports PAT classic
read:packages plus package Read and SSO authorization if required. CI should use
GITHUB_TOKEN with contents:read/packages:read and explicit package Actions access.
Publisher additionally needs packages:write. See [official npm registry docs](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
and [permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages).

After the first publication, use the Hub's `pnpm shared:adopt --manifest ...`:
it checks remote identities, generates all three real registry lockfiles and
proves frozen installs/build in an isolated archive without a Runly sibling or
shared TGZ. It writes the Hub only after all checks pass. No fictional resolution
or integrity may be committed in advance of publication. The Hub also provides
`shared:clean`, BuildKit secret Dockerfiles, registry-aware prod:release/prod:build,
an external root-owned 0600 read-only packages.npmrc design, rotation guidance,
and `shared:dev` external sandboxes for uncommitted cross-repo development. Its
docs/RUNLY_SHARED_PACKAGES.md is the operator runbook. Registry/network/auth
failure must abort before maintenance/migrations, never fall back to old TGZ.

Troubleshooting: scope-owner mismatch requires resolving ownership; 401/403/404
requires reviewing package Read/Actions/SSO; differing integrity requires stopping
and investigating source evidence, never overwriting an existing version.
Content errors fail release before publication. This migration does not alter
catalog publication, signing keys, S7B or the runtime image release process.
