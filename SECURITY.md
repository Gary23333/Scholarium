# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Scholarium, please **do not** open a public issue.

Send a report to the repository maintainers via GitHub's private vulnerability reporting or email. Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

We aim to respond within 48 hours and provide a fix timeline.

## Security Considerations for Users

- **API Keys**: Scholarium uses LLM API keys (DeepSeek, OpenAI, etc.). Never commit these to version control. Use environment variables.
- **Network**: The server binds to `localhost` by default. Do not expose it directly to the public internet without a reverse proxy and authentication.
- **Input Sanitization**: Scholarium includes input governance, but always review generated content before publication — LLM outputs can contain hallucinations.
- **Dependencies**: Keep dependencies updated. Run `npm audit` regularly.

## Supply Chain

- We pin dependency versions in `package-lock.json`.
- All dependencies are fetched from the npm registry.
- CI runs on every push and PR to catch regressions.
