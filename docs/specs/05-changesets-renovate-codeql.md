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

- A CI job `changeset` (`.github/workflows/changeset.yml`) runs on pull requests (opened, synchronize, reopened, labeled, unlabeled). It first diffs against `origin/<base>` (with `--no-renames`, so a file moved out of a shipping path still counts) and only when the PR changes a shipping path does it install and run `changeset status --since=origin/<base>`, which fails when there is no changeset. The shipping paths are listed once, in the workflow's `SHIPPING` variable: what `build.mjs` builds (the Vite build since #33) into `dist/` and the release zip, plus `examples/` (it carries the `?v=` install snippet) and `package.json` (it carries the version). A devDependency-only change needs the `no-changeset` label (Renovate's PRs will hit this under #32); a change to a runtime `dependencies` entry (`apexcharts` since #36, bundled into a chunk of `dist/`) ships and needs a changeset. `package-lock.json` is a shipping path since #37: it pins the libraries the build puts into `dist/chunks/` (DOMPurify, d3 and the rest inside Mermaid's chunks), so a lock-file change can change what ships. A PR that touches only documentation, tests, scripts or CI passes without a changeset or a label.
- The job is skipped (reported as skipped, which satisfies a required check) when the PR carries the label `no-changeset` (a shipping path changed without a release note: a devDependency bump, a refactor) or comes from the branch `changeset-release/main` of this repository (the version PR; recognised by branch, not by title). The version PR is opened with `GITHUB_TOKEN`, so no `pull_request` workflow runs for it at all: if `changeset` is made a required check, that check never reports on the Release PR and the merge needs an admin bypass, unless `version-pr.yml` is changed to open the PR with a GitHub App token or a PAT (it then gets checks, and the branch skip applies). Renovate's own PRs are not special-cased: `renovate.json` labels the ones that touch a shipping path (devDependency, Action and image-tag bumps) `no-changeset`. The repository owner adds `changeset` to the required checks in branch protection.

### Renovate

- `renovate.json` at the root extending `config:recommended`, with: `schedule` weekly (early Monday, America/Toronto), `rangeStrategy: "pin"`, grouped minor and patch updates for npm in one PR, `helpers:pinGitHubActionDigests` so Actions stay pinned by SHA with the version comment, `lockFileMaintenance` enabled monthly, and `automerge: false`.
- A rule disabling major updates for `apexcharts` is added here so that spec 07 inherits it: `{"matchPackageNames": ["apexcharts"], "matchUpdateTypes": ["major"], "enabled": false, "description": "ApexCharts stays on 3.x: majors are skipped; see docs/specs/production-grade-refactor.md"}`. Spec 07 (#36) adds a second rule that freezes it at 3.45.2 (`allowedVersions`), because the exact pin does not stop the weekly minor and patch group.
- A Playwright or Chromium bump re-records every screenshot baseline (about 20 MB, spec 02), so Renovate MUST open it as its own pull request on a slower schedule than the weekly group, with the Docker image tags in `package.json` and `ci.yml` bumped together.
- As built (#32), beyond the list above:
  - The Playwright image tag is read in `package.json` by a regex custom manager (`mcr.microsoft.com/playwright`, docker datasource, a `-noble`-only regex versioning) and in `ci.yml` by Renovate's built-in github-actions manager (its `container:` lines). One rule groups `@playwright/test` and the image as "Playwright", on a monthly schedule. `ignorePresets: ["group:playwrightMonorepo"]` is needed: the monorepo preset in `config:recommended` otherwise wins over a `packageRules` group and splits `@playwright/test` into its own pull request. Renovate does not re-record baselines; a person pushes the re-recorded screenshots (container update script) to the Renovate Playwright branch.
  - `minimumReleaseAge` is not used on that rule: Docker tags carry no release timestamp, so Renovate would hold the image bump back indefinitely.
  - Major bumps are disabled for `typescript` (until typescript-eslint supports TypeScript 7) and `@types/node` (CI runs Node 22). The `node` entry of `setup-node` (which `:pinAllExceptPeerDependencies` would pin to a patch release) and the `ubuntu` runner image are disabled, so both stay hand-chosen. Major bumps of `vitest` and `@vitest/*` form one pull request. Amended in #83: the Node floor is 24, so the `@types/node` rule now holds it at `<25` (the Playwright image's Node 24) instead of disabling majors, and the licence checker's major is no longer held back.
  - The label `no-changeset` is added to npm devDependency, GitHub Actions and image-tag pull requests (a runtime dependency, `apexcharts` since #36, ships and is not labelled). Lock-file maintenance changes `package-lock.json`, a shipping path since #37, and is not labelled: a person adds a changeset when it moved a library inside a chunk, or the label when nothing that ships changed.
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
