# Contributing to Seamless Auth

Thanks for your interest in contributing to Seamless Auth.
Contributions of all kinds are welcome — bug reports, documentation improvements, tests, and code.

---

## Project Philosophy

Seamless Auth is built around a few core principles:

- **Security first** — explicit trust boundaries and auditable logic
- **Framework-agnostic core** — adapters should be thin
- **Minimal magic** — clear inputs and outputs
- **Predictable behavior** — changes should not surprise users

Please keep these principles in mind when contributing.

---

## Ways to Contribute

You can help by:

- Reporting bugs
- Improving documentation
- Adding tests
- Refactoring for clarity
- Building new adapters (Fastify, Next.js, etc.)

If you’re unsure where to start, open a discussion or issue.

---

## Development Setup

Clone the repository:

    git clone https://github.com/fells-code/seamless-auth-server.git
    cd seamless-auth-server

Install dependencies:

    npm install

Build packages:

    npm run build

Run tests:

    npm test

Some packages may require additional environment variables. Refer to their individual README files for details.

---

## Code Style

- TypeScript is used throughout
- ESM modules (`"type": "module"`)
- Prefer explicit types over `any`
- Avoid hidden side effects and implicit globals
- Keep adapters thin; put logic in `@seamless-auth/core`

Formatting and linting tools are provided — please run them before submitting a PR.

---

## Testing Requirements

All changes that affect behavior should include tests.

Guidelines:

- Core logic should be tested in `@seamless-auth/core`
- Adapters should use smoke or integration tests
- Tests should run against compiled output where applicable

Pull requests with failing tests will not be merged.

---

## Commit Guidelines

Please use clear, descriptive commit messages.

Examples:

- feat: add role-based authorization middleware
- fix: prevent refresh loop on expired cookie
- docs: clarify express adapter setup
- test: add coverage for ensureCookies refresh path

---

## Submitting a Pull Request

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add or update tests as needed
5. Ensure all checks pass
6. Open a pull request with a clear description

Large or breaking changes should be discussed before implementation.

---

## Security Issues

If you discover a security vulnerability, **do not** open a public issue.

Instead, see `SECURITY.md` for responsible disclosure instructions.

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (AGPL-3.0-only unless otherwise stated).

---

Thank you for helping improve Seamless Auth.

— Fells Code, LLC
https://seamlessauth.com
