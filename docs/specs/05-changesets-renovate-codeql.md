# Spec 05: Changesets, Renovate, pinned Actions and CodeQL

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 0.
Depends on: [01 Playwright Test](01-playwright-test.md) (for CI shape). Independent of [04](04-vitest-and-checkjs.md).
Ships as: one pull request; the release it produces is the first one cut by the new process.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Every branch picks its own version number and writes its own changelog heading. When two threads ship in the same week they collide: 2.6.0 became 2.7.0 on 7 November, and 2.9.0 appears in a test comment but not in the changelog. The README's install snippet says `?v=2.7.0` while the package is at 2.11.1. The clone has no tags and no GitHub release, so the tag-driven release workflow has never run. Dependencies (one today, several after phase 1) and GitHub Actions are pinned to floating tags that nothing updates, and no code scanning runs.

## Solution

Each pull request declares its change (patch, minor, major) and its changelog line in a changeset file. A version pull request accumulates them; merging it bumps the version, rewrites the changelog in the current voice, syncs the version into the README and example snippets, and the release workflow builds and publishes the zip for that version. Renovate keeps npm packages and Actions current, Actions are pinned by commit, and CodeQL scans on every push.

## User Stories

1. As an agent thread, I want to say "this is a minor change, here is the changelog line" in my PR and nothing else about versions, so that two threads never choose the same number.
2. As a maintainer, I want the changelog to keep reading as plain sentences about what the household sees, so that it stays useful to the people who use the panel.
3. As a maintainer, I want one merge to produce the version bump, the changelog, the tag and the GitHub release, so that releasing is not a ritual.
4. As an admin, I want the README's install snippet to show the version I am about to download, so that the `?v=` I paste is right.
5. As a maintainer, I want Renovate to open small, grouped PRs for dependencies and Actions, so that updates are routine and reviewed by CI.
6. As a maintainer, I want Actions pinned to a commit with the version in a comment, so that a compromised tag cannot change what CI runs.
7. As a maintainer, I want CodeQL on the repository, so that a known vulnerability pattern is reported without anyone looking.

## Implementation Decisions

### Changesets

- `@changesets/cli` as a dev dependency. `.changeset/config.json` with `baseBranch: "main"`, `commit: false`, `access: "restricted"`, `privatePackages: {version: true, tag: true}` (the package is private; it is versioned and tagged but never published to npm).
- A changeset file is a Markdown file under `.changeset/` naming the package and the bump, with the changelog text as its body. The text MUST be written in the changelog's current voice: a sentence or short paragraph about what the household sees, no commit hashes, no PR numbers, no "feat:" prefixes.
- A custom changelog formatter (`.changeset/changelog.cjs`, implementing the two functions Changesets expects) MUST emit the current `CHANGELOG.md` shape: a `## x.y.z` heading followed by one `- ` bullet per changeset, with no "Major Changes" or "Minor Changes" sub-headings and no links. The existing changelog content is left untouched above the new entries.
- `npm run version-packages` MUST run `changeset version` and then a small script (`scripts/sync-version.mjs`) that rewrites `home-panel.js?v=<semver>` in `README.md` and `examples/configuration.yaml` to the new version, syncs the root version in `package-lock.json` and removes the sub-headings `changeset version` writes from `CHANGELOG.md`. The script is not called `version`, because npm also runs a script of that name after every `npm version`. `npm run changeset` MUST open the interactive prompt for a new changeset.
- The version pull request is created and kept up to date by the `changesets/action` workflow on every push to `main`. Its title is "Release" (action v2 takes a fixed `pr-title`) and its body is the pending changelog. Merging it is the release decision. The repository setting "Allow GitHub Actions to create and approve pull requests" MUST be on, and a pull request opened with `GITHUB_TOKEN` starts no `pull_request` workflows, so the Release PR gets no CI checks; they run on `main` after the merge.

### Release workflow

- Tags pushed by the default `GITHUB_TOKEN` do not trigger other workflows, so the release MUST NOT depend on a tag push event. The release workflow runs on `push` to `main`, reads `package.json`'s version, and exits early if the tag `v<version>` already exists. Otherwise it: installs, builds with that version, runs the unit tests, zips `dist/`, creates the tag and the GitHub release with the changelog section for that version as the release notes, and attaches `home-panel.zip`.
- The existing `release.yml` (on tag push) is replaced by this workflow. Manual tagging is no longer a supported path and the README's Develop section says so.
- The first run after this PR merges creates `v2.11.1` from the current state if the version PR has not been merged yet; that is intended, so the first tag matches the current changelog.

### Changeset enforcement

- A CI job `changeset` (`.github/workflows/changeset.yml`) runs on pull requests (opened, synchronize, reopened, labeled, unlabeled). It first diffs against `origin/<base>` and only when the PR changes a path that ships does it install and run `changeset status --since=origin/<base>`, which fails when there is no changeset. Shipping paths are those that end up in `dist/` and the release zip: `src/`, `build.mjs`, `vendor/*.js` and `vendor/*.css`, `examples/` and `package.json` (a dependency change can change the build). `package-lock.json` is not on the list, so lockfile maintenance needs no changeset. A PR that touches only documentation, tests, scripts or CI passes without one. The job is skipped (reported as skipped, which satisfies a required check) when the PR carries the label `no-changeset` (docs, tests or CI only, or a devDependency bump) or its title starts with "Release" (the version PR). Renovate's own PRs are not special-cased yet; #32 decides. The repository owner adds `changeset` to the required checks in branch protection.

### Renovate

- `renovate.json` at the root extending `config:recommended`, with: `schedule` weekly (early Monday, America/Toronto), `rangeStrategy: "pin"`, grouped minor and patch updates for npm in one PR, `helpers:pinGitHubActionDigests` so Actions stay pinned by SHA with the version comment, `lockFileMaintenance` enabled monthly, and `automerge: false`.
- A rule disabling major updates for `apexcharts` is added here so that spec 07 inherits it: `{"matchPackageNames": ["apexcharts"], "matchUpdateTypes": ["major"], "enabled": false, "description": "3.x is the last plain-MIT line; see docs/specs/production-grade-refactor.md"}`.
- A Playwright or Chromium bump re-records every screenshot baseline (about 20 MB, spec 02), so Renovate MUST open it as its own pull request on a slower schedule than the weekly group, with the Docker image tags in `package.json` and `ci.yml` bumped together.
- Renovate is a GitHub App that the repository owner installs once; the PR description MUST say so with the link, since that step cannot be done from the repository.

### Pinned Actions

- Every `uses:` in `.github/workflows/` MUST reference a full commit SHA followed by a comment with the tag, for example `actions/checkout@<sha> # v4.2.2`. This applies to the CI, release, changeset and CodeQL workflows.
- Every workflow MUST declare the least `permissions:` it needs at the top level; the release workflow needs `contents: write`, the others `contents: read` (plus `security-events: write` for CodeQL, and `contents: write` with `pull-requests: write` for the changesets action, which pushes its version branch and opens the pull request).

### CodeQL

- `.github/workflows/codeql.yml` running the `github/codeql-action` on `javascript-typescript` for pushes to `main`, pull requests and a weekly schedule. Python is added when and if the HACS integration is ever built.

## Acceptance Criteria

1. A PR without a changeset that touches `src/` fails the `changeset` job; the same PR with a changeset passes.
2. Merging a version PR produces, with no human step: a bumped `package.json`, a `CHANGELOG.md` entry in the current shape, `?v=` updated in the README and the example, a tag `v<version>`, and a GitHub release with `home-panel.zip` attached whose notes are that changelog section.
3. `grep -rn "uses:" .github/workflows | grep -v "@[0-9a-f]\{40\}"` returns nothing.
4. The CodeQL workflow has run green at least once on `main`.
5. `renovate.json` validates with `npx --yes --package renovate -- renovate-config-validator`.
6. The README's Develop section explains the changeset step in three sentences and no longer describes manual tagging.

## Testing Decisions

Release machinery is verified by exercising it once end to end on a throwaway branch and version (the PR description links the resulting draft release, deleted afterwards), and thereafter by the first real release. The changelog formatter MAY have a Vitest test that feeds it two changesets and compares the output against the expected shape.

## Out of Scope

- Publishing to npm or to HACS.
- Signing releases.
- Automerge of Renovate PRs.
- Dependabot (Renovate is chosen; do not run both).

## Notes

- The version PR replaces the "bump version and changelog" commit each thread used to make. Threads MUST NOT edit `package.json`'s version or `CHANGELOG.md` directly after this PR; the `changeset` job does not enforce that, review does.
- `privatePackages.tag: true` makes `changeset tag` create `v<version>`; the release workflow MAY use it or create the tag with `gh`, but there MUST be exactly one place that creates tags.

<!-- throwaway t31 docs check -->
