# Release Management

This repo uses pnpm workspaces plus Changesets.

## Package Graph

- `@seamless-auth/core` is the framework-agnostic package.
- `@seamless-auth/express` depends on `@seamless-auth/core` through
  `workspace:^` during local development.
- When packages are packed or published, pnpm rewrites `workspace:^` to the
  released semver range, so adapters can be tested against local core changes
  before core exists on npm.

## Daily Development

1. Make the code change.
2. Run `pnpm changeset`.
3. Select the package or packages that have adopter-facing changes.
4. Choose the semver bump.
5. Write release notes for adopters, not implementation notes.

## Channels

- `alpha`: manual prerelease snapshots from the `Prerelease` workflow.
- `beta`: automatic snapshots from `dev`.
- `rc`: automatic snapshots from `release/**` branches.
- `latest`: stable releases from `main` through the `Release` workflow.

Prerelease snapshots publish to npm dist-tags without Git tags. Stable releases
publish to npm, create package Git tags, and create GitHub Releases from the
changeset summaries.

## Pre-1.0 Policy

The core and official JavaScript adapters are linked in `.changeset/config.json`
so they move as a known-good set while the API is still settling.

Recommended pre-1.0 behavior:

- core behavior changes: bump core and publish linked adapters.
- adapter-only fixes: bump the adapter; linked packages keep the release train
  visible.
- breaking API changes before v1: use a minor bump and clear release notes.

## After v1

Once `@seamless-auth/core` and `@seamless-auth/express` are stable:

- remove adapters from the linked Changesets group when independent versioning
  becomes valuable.
- keep adapters compatible with `@seamless-auth/core@^1` unless a core major
  requires a coordinated adapter major.
- add new adapters only after they pass the shared conformance suite for the
  current known-good core version.
