# Contributing to Scholarium

Thanks for your interest in contributing! Scholarium is a multi-agent academic paper writing system built with TypeScript.

## Getting Started

1. Fork the repository and clone it locally.
2. Use Node.js 22.18+ and install dependencies: `npm ci && cd frontend && npm ci && cd ..`
3. Run the type check: `npm run typecheck`
4. Run offline tests: `npm test && npm run test:mock`
5. Build both entry points: `npm run build && npm start -- --help && npm run build:frontend`
6. Install browser dependencies once: `npx playwright install --with-deps chromium`, then run `npm run test:e2e-ui`. The browser suite uses isolated temporary data and blank provider credentials.

## Development Workflow

- **Code Style**: We use ESLint 9+ (typescript-eslint) and Prettier.
  - Run `npm run lint` to check for issues.
  - Run `npm run format` to auto-format.
  - CI will reject PRs with lint errors or formatting issues.
- **TypeScript**: Strict mode is enabled. Run `npm run typecheck` before committing.
- **Testing**: Add tests for new features. Run `npm run test` (vitest) and `npm run test:mock` (mock tests).

## Project Structure

```
src/
├── agents/         # 23 AI Agents
├── anti-ai/        # AI detection and rewriting
├── audit/          # Quality audit
├── bible/          # Paper fact Bible
├── embedding/      # Embedding engine
├── librarian/      # Citation management
├── llm/            # LLM Client + Router
├── pipeline/       # Agent orchestration
├── review/         # Peer review
├── server/         # Modular HTTP server
├── types/          # Shared type system
├── utils/          # Utilities
└── __tests__/      # Test suites
```

## Pull Request Process

1. Create a feature branch from `main`.
2. Make your changes, add tests, and ensure all checks pass.
3. Update documentation if needed.
4. Submit a PR against `main` with a clear description.

## Reporting Issues

- Use the GitHub Issues tab.
- Include steps to reproduce, expected behavior, and actual behavior.
- For feature requests, describe the use case and expected outcome.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Test and configuration notes

- `npm run test:e2e` is an alias for the existing Playwright suite. Obsolete scripts referencing removed test files have been removed.
- Browser tests are headless by default. Use `PW_HEADED=1` for an interactive run, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` for an installed Chromium.
- Use the Vite same-origin proxy in development. Custom local clients must first establish a cookie session through `POST /api/session` with `X-Scholarium-Client: local-ui`.
- Do not commit `scholarium.local.json`, `.env` files, generated output, or real credentials. Tests must create their own temporary config directories.

## Dependency maintenance

The test runner uses Vitest 5 with Vite 6.4, and supports Node 22.18, 24, or newer supported LTS releases. `minimatch` is overridden to its patched 11.x line while the lint toolchain still requests older affected majors. Re-run lint, typecheck, and the full test suite when changing or removing that override. Production dependencies intentionally contain only packages imported by runtime code. Lockfiles use the official npm registry.
