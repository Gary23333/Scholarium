# Contributing to Scholarium

Thanks for your interest in contributing! Scholarium is a multi-agent academic paper writing system built with TypeScript.

## Getting Started

1. Fork the repository and clone it locally.
2. Install dependencies: `npm ci && cd frontend && npm ci && cd ..`
3. Run the type check: `npm run typecheck`
4. Run tests: `npm run test:mock`

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
