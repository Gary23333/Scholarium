# Changelog

All notable changes to Scholarium will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-06-01

### Added
- CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md for open source governance
- CHANGELOG.md, ROADMAP.md for project transparency
- GitHub issue templates (bug report, feature request, documentation)
- Pull request template with structured sections
- README badges (CI status) and community governance links

### Changed
- Re-enabled @typescript-eslint/no-explicit-any as warn (0 warnings)
- Fixed catch(e: any) → catch(e: unknown) with getErrorMessage() across 21 files
- Typed reviewerConfig as ReviewerConfig in all 5 reviewer agents
- Typed generateRevision parameter as FixInstructions in writer
- Added eslint-disable annotations for legitimate any usage (DB, routes, LLM parsers)

### Fixed
- All ESLint errors and warnings resolved (0 errors, 0 warnings)
- Prettier formatting across entire codebase
- Unused imports and variables cleaned up across 30+ files

## [2.0.1] - 2026-05-30

### Fixed
- MIT LICENSE file restored and verified
- Version numbers synchronized across package.json and README
- CI pipeline now includes frontend build step
- All ESLint errors resolved (0 errors, 0 warnings)
- Prettier formatting enforced across entire codebase
- Unused imports and variables cleaned up across 30+ source files

### Security
- Security hardening applied after 3 rounds of automated code review
- Input validation strengthened across API routes
- Dependency audit completed

### Changed
- ESLint config excludes frontend build artifacts
- `no-explicit-any` rule disabled for database layer (requires dynamic typing)

## [2.0.0] - 2026-05-28

### Added
- Modular server architecture: server.ts refactored from 2,276 to 327 lines
- 15 route modules with unified error handling (AppError hierarchy)
- Health check endpoints
- ESLint 9+ with flat config and Prettier integration
- 88 Vitest test cases (unit + integration)
- GitHub Actions CI/CD pipeline
- Strict TypeScript mode (`strict: true`)
- Anti-AI detection and rewriting pipeline (6 dimensions)
- 18-dimension quality audit system
- 7-agent peer review orchestrator
- Socratic 5-layer dialogue system
- 3-round mind map divergence
- Embedding engine (TF-IDF / OpenAI / DeepSeek)
- Radar journal matching with 10 top venue profiles
- LaTeX compilation supporting IEEE, ACM, Springer, Elsevier, Nature templates
- React 18 + Vite frontend with Tailwind CSS and Zustand
- CLI tool (`scholarium` command)

### Changed
- Complete project restructuring from monolithic to modular architecture
- Database layer migrated to JSON file persistence with typed schemas
- Agent system reorganized into 4 layers: guidance, divergence, writing, review

## [1.5.0] - 2026-05-20

### Added
- Initial Scholarium release
- Multi-Agent academic paper writing system
- Basic pipeline: research question to LaTeX paper
- Core agent framework with LLM routing

[2.1.0]: https://github.com/Gary23333/Scholarium/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/Gary23333/Scholarium/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/Gary23333/Scholarium/compare/v1.5.0...v2.0.0
[1.5.0]: https://github.com/Gary23333/Scholarium/releases/tag/v1.5.0
