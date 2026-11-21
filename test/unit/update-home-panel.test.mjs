// The updater's swap (scripts/ha/update_home_panel.py), run through the Python that is on the machine: the old build goes to the backup, whatever name its panel
// file had (dist/main-[hash].js, ADR 0041, changes at every release), and what is the owner's stays. Skipped where there is no python3: the script runs inside Home Assistant.
import {test, expect} from 'vitest';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPTS = fileURLToPath(new URL('../../scripts/ha/', import.meta.url));
const python = spawnSync('python3', ['--version']).status === 0;

/** Runs `Python` with the updater importable as `u`, in `cwd`. */
const run = (cwd, code) =>
  execFileSync(
    'python3',
    ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(SCRIPTS)}); import update_home_panel as u\n${code}`],
    {
      cwd,
      encoding: 'utf8',
    },
  );

const touch = (root, files) =>
  files.forEach(f => {
    mkdirSync(join(root, f, '..'), {recursive: true});
    writeFileSync(join(root, f), f);
  });

test.skipIf(!python)(
  'the swap moves the old panel file, with its map and compressed copies, to the backup and leaves the owner’s files',
  () => {
    const root = mkdtempSync(join(tmpdir(), 'hp-updater-'));
    try {
      const panel = join(root, 'www/home-panel');
      const build = join(root, 'staging/build');
      const staging = join(root, 'staging');
      const old = [
        'home-panel.js',
        'home-panel.js.gz',
        'main-OLDhash1.js',
        'main-OLDhash1.js.map',
        'main-OLDhash1.js.br',
        'main-OLDhash1.js.gz',
        'chunks/a.js',
        'LICENSES.md',
      ];
      touch(panel, [...old, 'my-house.webp', 'mainland.png']);
      touch(build, ['home-panel.js', 'home-panel.js.br', 'main-NEWhash2.js', 'main-NEWhash2.js.map', 'chunks/b.js']);
      run(
        root,
        `u.swap(${JSON.stringify(build)}, ${JSON.stringify(panel)}, ${JSON.stringify(staging)}, ${JSON.stringify(join(root, 'backup'))})`,
      );

      expect(readdirSync(panel).sort()).toEqual([
        'chunks',
        'home-panel.js',
        'home-panel.js.br',
        'main-NEWhash2.js',
        'main-NEWhash2.js.map',
        'mainland.png',
        'my-house.webp',
      ]);
      for (const f of old.filter(f => f.startsWith('main-') || f === 'LICENSES.md'))
        expect(existsSync(join(root, 'backup', f)), `${f} in the backup`).toBe(true);
      expect(existsSync(join(panel, 'main-OLDhash1.js.map'))).toBe(false);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  },
);
