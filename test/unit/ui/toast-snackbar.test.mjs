// The Material snackbar (#467) is CSS on the toast element: this keeps its three promises that no screenshot names. It reads the inverse roles the
// scheme writes (not the panel's `--fg`/`--bg`), it clears the phone's navigation bar through the `--nav-bar-h` token (declared on the Material
// phone frame, so Apple keeps its place), and the warn icon of a failure is hidden unless the design is Material (the Apple look is unchanged).
import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const read = path => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), 'utf8');
const toast = read('src/ui/toast.element.css').replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = read('src/ui/styles/tokens.css');

// the declarations of the first rule whose selector is exactly `selector`
const rule = (css, selector) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
};

test('the Material snackbar is drawn in the scheme inverse roles, the action in inverse-primary and a failure icon in inverse-error', () => {
  const bar = rule(toast, ":host([design='material']) .toast");
  expect(bar).toContain('background: var(--md-inverse-surface)');
  expect(bar).toContain('color: var(--md-inverse-on-surface)');
  expect(rule(toast, ":host([design='material']) .toast .tdis")).toContain('color: var(--md-inverse-primary)');
  expect(rule(toast, ":host([design='material']) .tic")).toContain('color: var(--md-inverse-error)');
});

test('it sits above the navigation bar by a token that only the Material phone frame sets', () => {
  expect(rule(toast, ":host([design='material']) .toast")).toMatch(/bottom: calc\(var\(--nav-bar-h, 0px\) \+/);
  expect(rule(tokens, ".app.cp[data-design='material']")).toMatch(/--nav-bar-h: \d+px/);
});

test('it rises on the toast motion role, which the Material design makes the spatial default spring', () => {
  expect(toast).toContain('animation: snackrise var(--motion-toast-ms) var(--motion-toast)');
  expect(toast).not.toContain('--motion-spatial');
  expect(tokens).toContain('--motion-toast: var(--motion-spatial-default);');
});

test('the warn icon of a failure is hidden by default, so the Apple look keeps its layout', () => {
  expect(rule(toast, '.toast .tic')).toContain('display: none');
});
