// The page's background claims (src/shell/page-background.ts), over a fake page with two elements that remember their style.
import {describe, expect, test} from 'vitest';
import {claimPage, type PageLike} from '../../../src/shell/page-background.ts';

const element = () => {
  const style = new Map<string, string>();
  return {
    style: {
      setProperty: (name: string, value: string, priority?: string) =>
        void style.set(name, `${value}|${priority ?? ''}`),
      removeProperty: (name: string) => (style.delete(name) ? 'removed' : ''),
    },
    background: () => style.get('background-color') ?? null,
  };
};
const fakePage = () => {
  const html = element(),
    body = element();
  const page: PageLike = {documentElement: html, body};
  return {page, colours: () => [html.background(), body.background()]};
};
const panel = () => ({});

describe('claimPage', () => {
  test('a panel that paints a colour writes it, important, on the root and the body', () => {
    const {page, colours} = fakePage();
    claimPage(page, panel()).paint('#123456');
    expect(colours()).toEqual(['#123456|important', '#123456|important']);
  });

  test('painting nothing gives the page its own colour back', () => {
    const {page, colours} = fakePage();
    const claim = claimPage(page, panel());
    claim.paint('#123456');
    claim.paint(null);
    expect(colours()).toEqual([null, null]);
  });

  test('claiming writes nothing until the panel paints', () => {
    const {page, colours} = fakePage();
    claimPage(page, panel());
    expect(colours()).toEqual([null, null]);
  });

  test('the most recent panel owns the page: the first one painting again changes nothing', () => {
    const {page, colours} = fakePage();
    const first = claimPage(page, panel());
    const second = claimPage(page, panel());
    second.paint('#222222');
    first.paint('#111111');
    expect(colours()).toEqual(['#222222|important', '#222222|important']);
  });

  test('when the owner leaves, the page goes to the previous panel in the colour it asked for', () => {
    const {page, colours} = fakePage();
    const first = claimPage(page, panel());
    const second = claimPage(page, panel());
    first.paint('#111111');
    second.paint('#222222');
    second.release();
    expect(colours()).toEqual(['#111111|important', '#111111|important']);
  });

  test('when the owner leaves and the previous panel wanted none, the page is its own again', () => {
    const {page, colours} = fakePage();
    claimPage(page, panel());
    const second = claimPage(page, panel());
    second.paint('#222222');
    second.release();
    expect(colours()).toEqual([null, null]);
  });

  test('when a panel that does not own the page leaves, the page stays as it is', () => {
    const {page, colours} = fakePage();
    const first = claimPage(page, panel());
    const second = claimPage(page, panel());
    first.paint('#111111');
    second.paint('#222222');
    first.release();
    expect(colours()).toEqual(['#222222|important', '#222222|important']);
  });

  test('when the last panel leaves, both elements are clear', () => {
    const {page, colours} = fakePage();
    const claim = claimPage(page, panel());
    claim.paint('#123456');
    claim.release();
    expect(colours()).toEqual([null, null]);
  });

  test('a panel that leaves twice does not disturb the panel that owns the page', () => {
    const {page, colours} = fakePage();
    const first = claimPage(page, panel());
    const second = claimPage(page, panel());
    second.paint('#222222');
    first.release();
    first.release();
    expect(colours()).toEqual(['#222222|important', '#222222|important']);
  });

  test('a panel that claims again replaces its first claim and becomes the most recent', () => {
    const {page, colours} = fakePage();
    const key = panel();
    const old = claimPage(page, key);
    claimPage(page, panel()).paint('#222222');
    const again = claimPage(page, key);
    again.paint('#111111');
    expect(colours()).toEqual(['#111111|important', '#111111|important']);
    old.release(); // the stale claim leaves nothing behind
    expect(colours()).toEqual(['#111111|important', '#111111|important']);
  });

  test('two pages keep their claims apart', () => {
    const one = fakePage(),
      other = fakePage();
    claimPage(one.page, panel()).paint('#111111');
    claimPage(other.page, panel()).paint('#222222');
    expect(one.colours()).toEqual(['#111111|important', '#111111|important']);
    expect(other.colours()).toEqual(['#222222|important', '#222222|important']);
  });
});
