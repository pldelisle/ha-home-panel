/// <reference types="vite/client" />
// The accessibility spec (test/e2e/a11y.spec.ts) scans every tab, sheet and popup; this test keeps its list whole. The registries are read as pure
// data (the features' descriptors, their `sheets.ts` ids) and the spec as text, since a spec cannot be imported outside Playwright and
// the shell's element cannot be mounted here (ADR 0005); the shell's own ids are in `src/shell/sheets.ts`. A tab or sheet added to the panel and not scanned fails here, in the unit run.
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import {FEATURES, UNDER_MORE} from '../../src/shell/features.ts';
import {MORE_SHEET, SETTINGS_POPUP, SHELL_POPUPS} from '../../src/shell/sheets.ts';
import {PHONE_TABS, TABLET_TABS} from '../e2e/houses.ts';

const spec = readFileSync(new URL('../e2e/a11y.spec.ts', import.meta.url), 'utf8');

// every `<owner>.<name>` a feature's sheets.ts exports, whether or not its descriptor lists it (Media's and the Status checks' are not
// listed); the files hold constants and readers only, so importing them runs no Lit code, and the readers are not strings
const featureModules = import.meta.glob<Record<string, unknown>>('../../src/features/*/sheets.ts', {eager: true});
const featureSheets = Object.values(featureModules).flatMap(m =>
  Object.values(m).filter((v): v is string => typeof v === 'string'),
);

const scanned = [...spec.matchAll(/scanDialog\(house, '([^']+)'/g)].map(m => m[1]);

describe('the accessibility spec covers the registry', () => {
  test('the registry has the ten tabs the spec scans, and the phone bar the spec opens', () => {
    expect(FEATURES.map(f => f.key)).toEqual(TABLET_TABS);
    expect(FEATURES.filter(f => f.phoneBar).map(f => f.key)).toEqual(PHONE_TABS);
    // the tabs under More are reached through the sheet, which the spec lists tile by tile
    expect(UNDER_MORE.map(f => f.key)).toEqual(TABLET_TABS.filter(k => !PHONE_TABS.includes(k)));
  });

  test('the spec scans every tab, in the full and the bare house, in English and French', () => {
    expect(spec).toContain('eachShownTab(house');
    expect(spec).toMatch(/for \(const lang of \['en', 'fr'\] as const\)/);
    expect(spec).toContain("test.describe('bare house'");
    expect(spec.match(/every shown tab has no serious or critical finding/g)).toHaveLength(2);
  });

  test('every sheet the descriptors name is one a feature exports', () => {
    const named = FEATURES.flatMap(f => [f.detailSheet, ...(f.overSheets ?? [])]).filter((id): id is string => !!id);
    expect(named.length).toBeGreaterThan(0);
    for (const id of named) expect(featureSheets, id).toContain(id);
  });

  test('the shell has the sheet and the popups the spec expects', () => {
    expect(MORE_SHEET).toBe('shell.more');
    expect(SHELL_POPUPS).toEqual([SETTINGS_POPUP]);
  });

  test('every sheet and popup is scanned, and the spec scans nothing the panel does not have', () => {
    const expected = [...new Set([...featureSheets, MORE_SHEET, ...SHELL_POPUPS])].sort();
    expect([...new Set(scanned)].sort()).toEqual(expected);
  });

  test('no rule is disabled', () => {
    expect(spec).toMatch(/const DISABLED_RULES: \{[^}]+\}\[\] = \[\];/);
  });
});
