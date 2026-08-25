# Security Policy

## Supported Versions

The latest `main` branch is the only supported version. Security fixes are
applied there and released through the Firebase hosting pipeline.

## Reporting a Vulnerability

Please report security issues **privately** rather than opening a public issue.
Contact the maintainer via GitHub's private vulnerability reporting (Security
tab → Report a vulnerability), or email the project maintainer directly. Do not
disclose the issue publicly until a fix has been released.

## Hardening Checklist

These are operational safeguards for this repository:

1. **Branch protection on `main`** — enable in Settings → Branches:
   - Require a pull request before merging
   - Require status checks to pass (`ci` workflow)
   - Dismiss stale approvals on new commits
   - Restrict force pushes and branch deletion
2. **No secrets in the repository** — Firebase web config keys in
   `.env.example` are placeholders only; the real values live in the
   un-tracked `.env`, which is gitignored. Never commit service-account keys.
3. **Least privilege in security rules** — Firestore/Storage rules grant the
   minimum access per role; votes are never linked to a voter's identity in
   the audit log (ballot secrecy).
4. **Dependency updates** — Dependabot keeps `npm` and GitHub Actions
   dependencies patched automatically.
