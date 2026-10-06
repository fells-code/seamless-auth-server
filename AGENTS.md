# AGENTS.md

This file is for coding agents working in the `seamless-auth-server` repository.

## Purpose

`seamless-auth-server` is the pnpm workspace that publishes the server-side
building blocks of Seamless Auth: a small explicit core plus framework adapters.
It is the bridge adopters embed in their own backends to add passwordless,
session-based auth without opaque middleware chains.

Published packages:

- `@seamless-auth/core` (`packages/core`): framework-agnostic core.
- `@seamless-auth/express` (`packages/express`): the Express adapter.
- `@seamless-auth/fastify` (`packages/fastify`): the Fastify adapter.
- `@seamless-auth/nextjs` (`packages/nextjs`): the Next.js App Router adapter.

These are public, adopter-facing packages. Their public API is a contract, and
they bridge cookie sessions to the Bearer/JWKS contract of the
`seamless-auth-api`. Treat contract changes as coordinated, cross-repo work.

## Working Standards (fells-code baseline)

These rules apply to every repository in the fells-code org. Repo-specific
guidance may extend them but must not contradict them.

### Attribution

- Commit and open PRs solely under the repository owner's identity. Never
  commit under an agent or assistant identity.
- Never attribute work to an AI assistant: no `Co-Authored-By: Claude` (or any
  assistant) trailers, no "Generated with" / "Created with Claude" notes, and no
  assistant branding or emoji anywhere in commit messages, PR or issue titles
  and descriptions, changesets, code comments, or docs.

### Comments

- Comment only when the code genuinely needs explaining: a non-obvious reason, a
  gotcha, or an invariant. Never narrate what the code plainly does.

### TODOs

- Every `TODO`/`FIXME` must reference a ticket, e.g. `// TODO(#123): ...`.
  Do not leave a bare TODO. If no ticket exists, create one first.

### Commits & branches

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `test:`).
- Descriptive branch names (`feat/...`, `fix/...`); never a `claude/` or other
  tool-generated prefix.

### Public-facing text

- No em dashes in commit messages, code comments, PR or issue text, changesets,
  or docs. Use a comma, parentheses, or a separate sentence.

### Before declaring work done

- All code quality checks must pass before you open a PR or call the work done:
  tests, linting, type checks, and formatting. Run them and report the real
  output; do not open a PR while any check is failing.
- Typical commands: `pnpm build` and `pnpm test` at the workspace root (plus any
  per-package checks). Never claim a change works without running them.
- Match the surrounding code's style, naming, and comment density.

## Runtime Model

- pnpm workspace (`pnpm-workspace.yaml`) with packages under `packages/*`.
- TypeScript libraries built and published via Changesets.
- `@seamless-auth/express`, `@seamless-auth/fastify`, and
  `@seamless-auth/nextjs` depend on `@seamless-auth/core`; keep the core free of
  framework-specific code.

## Architecture Map

```text
packages/
  core/       framework-agnostic auth core and shared logic
  express/    Express adapter built on top of core
  fastify/    Fastify adapter built on top of core
  nextjs/     Next.js route handler adapter built on top of core
```

- Keep framework specifics in the adapter package, not in `core`.
- The Next.js adapter has no framework underneath, so it builds its own
  request context (`src/internal/context.ts`): cookie and JSON body parsing
  that mirror Express's `cookie-parser` and strict `json()`, and a router that
  matches case-insensitively in table order as Express does. Its parity tests
  reuse the Fastify scenarios against Express; when a scenario is added to
  `packages/fastify/tests/parity.test.js`, add it to the Next.js copy too.
- `getSeamlessSession` in the Next.js adapter must never refresh. A refresh from
  a server component rotates the refresh token in a response the browser never
  receives, and the browser's next refresh is then revoked as a replay.
- The Next.js handler keeps cookies that `ensureCookies` queued even when the
  route then fails, for the same reason. Do not build a fresh response on the
  error path.
- The adapters bridge to `seamless-auth-api`; when behavior looks off, check the
  API's route/token/JWKS contract before changing code here.

## Tooling

| Task    | Command        |
| ------- | -------------- |
| Install | `pnpm install` |
| Build   | `pnpm build`   |
| Test    | `pnpm test`    |

- Supported Node is `>=22`. CI tests 22, 24, and the latest release;
  `.nvmrc` pins Node 24 for development and releases. Run `nvm use` and
  `corepack enable` locally.
- Releases use Changesets; a user-facing change needs a changeset. Do not
  hand-edit versions or `CHANGELOG.md`.

## Safe Change Workflow

1. Run `nvm use`, `corepack enable`, and `pnpm install`.
2. Keep `core` framework-agnostic; put framework code in the adapter.
3. Run `pnpm build` and `pnpm test` before opening a PR.
4. For any public API or contract change, add a changeset and note the
   cross-repo impact on `seamless-auth-api` and the SDKs.
