# Changesets

Add a changeset for every user-facing package change:

```sh
pnpm changeset
```

Use the summary as adopter-facing release notes. The release workflow turns
merged changesets into package changelogs, npm publishes, Git tags, and GitHub
Releases.

The JavaScript packages are currently linked so `@seamless-auth/core` and
official adapters move together while the API is pre-1.0. After the v1 contract
is stable, remove packages from the linked group when they can safely version
independently.
