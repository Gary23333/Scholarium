# Security Policy

## Supported versions

The current 2.1.x release line receives security fixes. Older versions should be upgraded.

## Reporting a vulnerability

Do not post credentials, private papers, or exploit details in a public issue.
If the repository's **Security** tab offers **Report a vulnerability**, use that private channel.
If private reporting is unavailable, open an issue requesting a private contact method without including vulnerability details. No public email address is currently designated.

## Local-only trust model

- Both HTTP servers bind to `127.0.0.1`. Host, Origin, Fetch Metadata, and forwarded-client checks reject unexpected hostnames, cross-origin access, and requests carrying forwarded-client headers. A proxy that hides its remote clients can bypass the local-process trust boundary, so it must not be used to expose this service. Wildcard CORS is not supported.
- The web app creates an ephemeral local session before loading API data. Its cookie is HttpOnly and SameSite=Strict, scoped to `/api`, and expires when the server restarts. Reload an open app after restarting the server.
- API reads and writes require that session, except the minimal liveness endpoint. Local scripts can request a session with `POST /api/session` and `X-Scholarium-Client: local-ui`, then retain the returned cookie.
- This boundary protects against untrusted websites, not malicious local processes, browser extensions, or other users of the same OS account. It is not multi-user authentication. Do not expose it through a reverse proxy, SSH tunnel, or public network. Remote deployment requires a separately designed authentication model.

## Provider credentials

- Keep credentials in environment variables or the ignored `scholarium.local.json`. UI saves use that private override file and never overwrite the tracked template. The file contains plaintext credentials and is created with owner-only permissions on POSIX systems. Protect backups as well.
- Changing a provider URL requires explicitly replacing or clearing its API key. Masked or omitted keys cannot silently move to a different endpoint.
- Provider requests require public HTTPS URLs without embedded credentials, query strings, or fragments. DNS answers are checked at connection time and passed directly to the TLS socket. Private, loopback, link-local, multicast, and common special-use addresses and redirects are rejected. For a trusted local model server only, set `SCHOLARIUM_ALLOW_LOCAL_PROVIDERS=1` before startup. This opts in to HTTP/HTTPS endpoints on exactly `localhost`, `127.0.0.1`, or `[::1]`; DNS must still resolve exclusively to loopback. Arbitrary private-network hosts, redirects, and invalid TLS certificates remain blocked.
- Provider response bodies are not included in error messages, because upstream errors can echo credentials. Never paste secrets into issue reports or logs.
- If an older installation saved keys in tracked files or logs, review its history/backups and rotate exposed keys with the provider. This change does not rewrite history or rotate credentials automatically.

## Other considerations

Review generated research and citations before use. Keep dependencies updated and run the offline, integration, and browser regression suites before shipping changes. No live provider credentials are needed for those tests.
