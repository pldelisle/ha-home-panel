// The legacy set of docs/specs/09-architecture-foundations.md: the files the strangler's new layers replaced, one
// regular expression over the path from the repository root. It is empty since the guest went (#277): the expression matches
// no path, the lint prints `legacy footprint: 0 modules`, and the gate (#188) deletes this file and that line.
const LEGACY = '^$';
const LEGACY_RE = new RegExp(LEGACY);

module.exports = {LEGACY, isLegacy: path => LEGACY_RE.test(path)};
