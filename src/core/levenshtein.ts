// The edit distance between two words: insert, delete, substitute, or swap two neighbours, each one step.
// Pattern: optimal string alignment, the restricted form of Damerau-Levenshtein distance (Damerau, 1964), which is what
// `git` and `npm` use to suggest a command when one is mistyped.
// Must not: compare case or accents, or know what the words are for.
export function editDistance(a: string, b: string): number {
  let before: number[] = [];
  let row = Array.from({length: b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const above = row;
    row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(above[j] + 1, row[j - 1] + 1, above[j - 1] + cost);
      // two neighbours swapped: `climtae` is one step from `climate`
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    before = above;
  }
  return row[b.length];
}
