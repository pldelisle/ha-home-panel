// The legacy set of docs/specs/09-architecture-foundations.md: the files the strangler's new layers replace, one
// regular expression over the path from the repository root (src/main.js is the shell's entry, not legacy).
// .dependency-cruiser.cjs enforces the rules around it; scripts/arch-graph.mjs counts its modules and
// test/unit/architecture.test.mjs checks nothing else imports it. A module leaves the set when phase 3 moves it into a
// layer, and this expression shrinks with it.
const LEGACY =
  '^src/(home-panel\\.js|auto\\.js|styles\\.js|fonts\\.js|stack\\.js|types\\.d\\.ts|env\\.d\\.ts|i18n/|legacy/|css/)';
const LEGACY_RE = new RegExp(LEGACY);

module.exports = {LEGACY, isLegacy: path => LEGACY_RE.test(path)};
