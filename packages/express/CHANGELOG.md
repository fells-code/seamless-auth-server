# @seamless-auth/express

## 0.5.4

### Patch Changes

- b4a1491: fix: updates core implementation to supply the authorization value during polling for magic links
- f3206ea: Fixes for deleting users as an admin, and internal auth events summary route token handling
- Updated dependencies [b4a1491]
- Updated dependencies [f3206ea]
  - @seamless-auth/core@0.5.4

## 0.5.3

### Patch Changes

- 3d979b1: Fixes for deleting users as an admin, and internal auth events summary route token handling
- Updated dependencies [3d979b1]
  - @seamless-auth/core@0.5.3

## 0.5.2

### Patch Changes

- ac96299: Operational tidy work and extension of the logout functions for future use
- Updated dependencies [ac96299]
  - @seamless-auth/core@0.5.2

## 0.5.1

### Patch Changes

- e39adc8: Move package development and release management to a pnpm workspace backed by
  Changesets. The Express adapter now resolves core through a local workspace link
  in development while publishing a normal semver dependency for adopters.
- Updated dependencies [e39adc8]
  - @seamless-auth/core@0.5.1
