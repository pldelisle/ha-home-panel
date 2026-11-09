# Recorded houses

Fixtures written by `scripts/record-fixture.mjs` (see the testing section of `docs/architecture.md`). A model test starts from one with `fakeHass.fromFixture(name)`. One line per fixture: when it was recorded and what it is for, nothing more.

- `sample.json`: a slice of the full test house (the sun, the weather sensors, a light and a room, with one statistic), written by the recorder from a fake connection on 2026-11-09; it exists so `fakeHass.fromFixture` is tested before the real fixture is recorded.
