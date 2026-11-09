# CLAUDE.md

## Agent skills

### Issue tracker

Issues live in GitHub Issues for pldelisle/ha-home-panel. See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Conventions

Every module under `src/core`, `src/providers`, `src/ui`, `src/features` and `src/shell` opens with a header: what it is, the pattern it applies and its source, what it must not do. See `docs/architecture.md`.
