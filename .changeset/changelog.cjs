/** Changesets changelog functions: one bullet per changeset, in the voice of CHANGELOG.md. */
module.exports = {
  getReleaseLine: async changeset => {
    const [first, ...rest] = changeset.summary.trim().split('\n');
    return `- ${first}${rest.length ? '\n' + rest.map(l => (l ? '  ' + l : l)).join('\n') : ''}`;
  },
  getDependencyReleaseLine: async () => '',
};
