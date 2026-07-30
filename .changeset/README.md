# Changesets

Add a changeset for every user-facing package change:

```sh
pnpm changeset
```

Use the summary as adopter-facing release notes. The release workflow turns
merged changesets into package changelogs, npm publishes, Git tags, and GitHub
Releases.

`@seamless-auth/core` and `@seamless-auth/express` are linked, so they move
together. After the v1 contract is stable, remove them from the linked group when
they can safely version independently.

`@seamless-auth/fastify` is deliberately outside that group. It starts at `0.1.0`
and versions on its own, so a newer adapter does not inherit a version number
that claims the maturity of the ones that have been shipping. Add it to the
linked group once it has the same track record.
