/**
 * Changesets changelog functions: one bullet per changeset, in the voice of CHANGELOG.md.
 * The CLI still groups the bullets under "### Minor Changes" headings; scripts/sync-version.mjs (cleanChangelog)
 * removes those, so the shape of an entry is enforced in both places.
 */
module.exports = {
  getReleaseLine: async changeset => {
    const summary = changeset.summary.trim();
    if (!summary)
      throw new Error(`The changeset "${changeset.id}" has no text: write its changelog line as a sentence.`);
    const [first, ...rest] = summary.split('\n');
    return `- ${first}${rest.length ? '\n' + rest.map(line => (line ? '  ' + line : line)).join('\n') : ''}`;
  },
  getDependencyReleaseLine: async () => '',
};
