// The document's background claims (src/shell/document-background.ts), over a fake document with two elements that remember their style.
import {describe, expect, test} from 'vitest';
import {claimDocument, type DocumentLike} from '../../../src/shell/document-background.ts';

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
const fakeDocument = () => {
  const html = element(),
    body = element();
  const doc: DocumentLike = {documentElement: html, body};
  return {doc, colours: () => [html.background(), body.background()]};
};
const panel = () => ({});

describe('claimDocument', () => {
  test('a panel that paints a colour writes it, important, on the root and the body', () => {
    const {doc, colours} = fakeDocument();
    claimDocument(doc, panel()).paint('#123456');
    expect(colours()).toEqual(['#123456|important', '#123456|important']);
  });

  test('painting nothing gives the document its own colour back', () => {
    const {doc, colours} = fakeDocument();
    const claim = claimDocument(doc, panel());
    claim.paint('#123456');
    claim.paint(null);
    expect(colours()).toEqual([null, null]);
  });

  test('claiming writes nothing until the panel paints', () => {
    const {doc, colours} = fakeDocument();
    claimDocument(doc, panel());
    expect(colours()).toEqual([null, null]);
  });

  test('the most recent panel owns the background: the first one painting again changes nothing', () => {
    const {doc, colours} = fakeDocument();
    const first = claimDocument(doc, panel());
    const second = claimDocument(doc, panel());
    second.paint('#222222');
    first.paint('#111111');
    expect(colours()).toEqual(['#222222|important', '#222222|important']);
  });

  test('when the owner leaves, the background goes to the previous panel in the colour it asked for', () => {
    const {doc, colours} = fakeDocument();
    const first = claimDocument(doc, panel());
    const second = claimDocument(doc, panel());
    first.paint('#111111');
    second.paint('#222222');
    second.release();
    expect(colours()).toEqual(['#111111|important', '#111111|important']);
  });

  test('when the owner leaves and the previous panel wanted none, its own colour is back', () => {
    const {doc, colours} = fakeDocument();
    claimDocument(doc, panel());
    const second = claimDocument(doc, panel());
    second.paint('#222222');
    second.release();
    expect(colours()).toEqual([null, null]);
  });

  test('when a panel that does not own the background leaves, the background stays as it is', () => {
    const {doc, colours} = fakeDocument();
    const first = claimDocument(doc, panel());
    const second = claimDocument(doc, panel());
    first.paint('#111111');
    second.paint('#222222');
    first.release();
    expect(colours()).toEqual(['#222222|important', '#222222|important']);
  });

  test('when the last panel leaves, both elements are clear', () => {
    const {doc, colours} = fakeDocument();
    const claim = claimDocument(doc, panel());
    claim.paint('#123456');
    claim.release();
    expect(colours()).toEqual([null, null]);
  });

  test('a panel that leaves twice does not disturb the panel that owns the background', () => {
    const {doc, colours} = fakeDocument();
    const first = claimDocument(doc, panel());
    const second = claimDocument(doc, panel());
    second.paint('#222222');
    first.release();
    first.release();
    expect(colours()).toEqual(['#222222|important', '#222222|important']);
  });

  test('a panel that claims again replaces its first claim and becomes the most recent', () => {
    const {doc, colours} = fakeDocument();
    const key = panel();
    const old = claimDocument(doc, key);
    claimDocument(doc, panel()).paint('#222222');
    const again = claimDocument(doc, key);
    again.paint('#111111');
    expect(colours()).toEqual(['#111111|important', '#111111|important']);
    old.release(); // the stale claim leaves nothing behind
    expect(colours()).toEqual(['#111111|important', '#111111|important']);
  });

  test('two documents keep their claims apart', () => {
    const one = fakeDocument(),
      other = fakeDocument();
    claimDocument(one.doc, panel()).paint('#111111');
    claimDocument(other.doc, panel()).paint('#222222');
    expect(one.colours()).toEqual(['#111111|important', '#111111|important']);
    expect(other.colours()).toEqual(['#222222|important', '#222222|important']);
  });
});
