# Security Policy

## Supported Versions

Security fixes are applied to the latest release line of `fireant-refactored`.
Older releases receive fixes only when explicitly flagged in the
[CHANGELOG](CHANGELOG.md).

| Version | Supported |
| --- | --- |
| latest | :white_check_mark: |
| older | on a case-by-case basis |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use [GitHub Private Vulnerability Reporting](https://github.com/arananet/fireant-refactored/security/advisories/new).
The repository owner must verify that this feature is enabled. This local setup
does not change GitHub settings, and no security email or PGP key is configured.
If reporting is unavailable, request a private reporting channel from
[arananet](https://github.com/arananet) without posting vulnerability details.

### Development dependencies

Use Node 22 or a newer supported LTS release with the locked dependencies.
Vitest is patched to 4.1.11 for GHSA-82fw-gwwq-j7x9. Tests use `vitest run`;
do not expose a development or test server to an untrusted network. Development
dependencies are not included in the browser bundle. Run `npm audit` regularly;
a clean dependency audit is not a security review of the game.

### What to include

- Affected version, commit, or branch
- Reproduction steps (minimal proof-of-concept preferred)
- Impact assessment (what an attacker can achieve)
- Any suggested remediation

### Our commitments

- **Acknowledge** the report within **2 business days**.
- **Triage** and provide a severity assessment within **5 business days**.
- **Fix** critical and high-severity issues within **30 days** of triage.
- **Disclose** via a GitHub Security Advisory and credit the reporter (unless
  they request anonymity).

## Scope

In scope:

- Code in this repository
- Public-facing workflows in `.github/workflows/`
- Configuration under `.openspec/` and `.claude/` that affects repo integrity

Out of scope:

- Vulnerabilities in dependencies — report those upstream. Dependabot and the
  `dependency-review` workflow are configured to catch vulnerable direct
  dependencies automatically.
- Findings that require physical access, social engineering, or non-default
  build configurations.
- Denial-of-service via resource exhaustion against a user's own machine.

## Security Practices in This Repository

This repository ships with several defensive defaults:

- **OpenSpec gate** — no code merges without an approved spec and tests.
- **CodeQL** — static analysis on every PR and weekly.
- **Gitleaks** — secret scanning on every PR.
- **Dependency Review** — blocks PRs that introduce known-vulnerable
  dependencies.
- **Dependabot** — weekly updates for GitHub Actions and (when enabled) the
  project's package ecosystems.
- **SBOM** — CycloneDX SBOMs generated on release.
- **Pinned Actions** — all third-party actions pinned to commit SHAs.
- **Least-privilege permissions** — every workflow starts from
  `permissions: read-all` and escalates only where required.

If you believe any of these controls is misconfigured, please report it as
described above.
