// The Mermaid definition of a flow: #97's four escapes on the inputs that broke it, in every shape and on an edge, the `;`
// that ends each node and edge line, the classes in the theme's colours and the link styles, and the hex mix.
// Pattern: example tests at the pure printer (ADR 0005; Meszaros, xUnit Test Patterns).
// Must not: load Mermaid, mount an element or read a theme (the colours are literal tokens).
import {describe, expect, test} from 'vitest';
import type {Graph, GraphNode} from '../../../../src/features/automations/graph.ts';
import {
  escapeLabel,
  mixHex,
  protectEntities,
  protectPercent,
  safeText,
  splitDollars,
  toMermaid,
  type FlowTokens,
} from '../../../../src/features/automations/mermaid-def.ts';

const TOKENS: FlowTokens = {
  ok: '#2e7d32',
  crit: '#c62828',
  warn: '#f9a825',
  card: '#ffffff',
  ring: '#dddddd',
  fg: '#222',
  fg3: '#888888',
  line: '#eeeeee',
};
// what broke the flow in #97: a typed entity, a percent, a directive, a formula, a quote and a tag
const EVIL = 'A "b" <c> #36; #lt; 100% %%{init}%% $$x$$ & d#e';
const SAFE =
  'A &quot;b&quot; &lt;c&gt; #35;36; #35;lt; 100#37; #37;#37;{init}#37;#37; <span>$</span><span>$</span>x<span>$</span><span>$</span> &amp; d#e';

const node = (id: string, shape: GraphNode['shape'], over: Partial<GraphNode> = {}): GraphNode => ({
  id,
  path: id,
  kind: null,
  k: 'Step',
  label: EVIL,
  sub: EVIL,
  shape,
  cls: 'hit',
  ...over,
});

describe('the escapes', () => {
  test('each one alone', () => {
    expect(escapeLabel('a "b" <c> & d')).toBe('a &quot;b&quot; &lt;c&gt; &amp; d');
    expect(protectEntities('#36; #lt; # #x y;')).toBe('#35;36; #35;lt; # #x y;');
    expect(protectPercent('100% %%')).toBe('100#37; #37;#37;');
    expect(splitDollars('$$x$')).toBe('<span>$</span><span>$</span>x<span>$</span>');
  });
  test('in #97’s order: an escaped `&` is not read as an entity, a typed `#37;` stays text', () => {
    expect(safeText(EVIL)).toBe(SAFE);
    expect(safeText('#37;')).toBe('#35;37;');
  });
});

describe('toMermaid', () => {
  const graph: Graph = {
    nodes: [
      node('t', 'stadium'),
      node('g', 'circle', {k: '', label: 'ANY', sub: ''}),
      node('c', 'round', {cls: 'no', k: ''}),
      node('d', 'diamond', {cls: 'run'}),
      node('s', 'sub', {cls: 'off', sub: '', label: 'x'.repeat(70)}),
      node('x', 'stop', {cls: 'stopn', k: '', label: 'STOP', sub: ''}),
    ],
    edges: [
      {from: 't', to: 'g', label: '', cls: 'on'},
      {from: 'g', to: 'c', label: EVIL, cls: 'off'},
      {from: 'c', to: 'd', label: 'yes', cls: 'run'},
      {from: 'd', to: 's', label: '', cls: 'on'},
      {from: 'c', to: 'x', label: '', cls: 'stop'},
    ],
    sentence: '',
    failed: true,
    waiting: true,
  };
  const lines = toMermaid(graph, TOKENS, false).split('\n');
  const word = (k: string) =>
    `<span style='font-size:11px;font-weight:800;letter-spacing:.1em;opacity:.65'>${k}</span><br/>`;
  const text = (t: string) => `<span style='font-size:12px;font-weight:700'>${t}</span>`;
  const sub = `<br/><span style='font-size:11px;font-weight:500;opacity:.75'>${SAFE}</span>`;
  const gate = (t: string) => `<span style='font-size:11px;font-weight:800;letter-spacing:.08em'>${t}</span>`;

  test('left to right, or top to bottom when compact', () => {
    expect(lines[0]).toBe('flowchart LR');
    expect(toMermaid(graph, TOKENS, true).split('\n')[0]).toBe('flowchart TD');
  });
  test('a line per node in its shape, its word, its sentence cut to 64 and its sub, all escaped', () => {
    expect(lines.slice(1, 7)).toEqual([
      `  t(["${word('STEP')}${text(SAFE)}${sub}"]):::hit;`,
      `  g(("${gate('ANY')}")):::hit;`,
      `  c("${text(SAFE)}${sub}"):::no;`,
      `  d{{"${word('STEP')}${text(SAFE)}${sub}"}}:::run;`,
      `  s[["${word('STEP')}${text(`${'x'.repeat(63)}…`)}"]]:::off;`,
      `  x(["${gate('STOP')}"]):::stopn;`,
    ]);
  });
  test('a line per edge, dotted when not taken, its label escaped', () => {
    expect(lines.slice(7, 12)).toEqual([
      '  t --> g;',
      `  g -.->|"<span style='font-size:11px;font-weight:600'>${SAFE}</span>"| c;`,
      `  c -->|"<span style='font-size:11px;font-weight:600'>yes</span>"| d;`,
      '  d --> s;',
      '  c --> x;',
    ]);
  });
  test('every node and edge line ends in its own `;`, the one Mermaid’s pre-pass may eat', () => {
    expect(lines.slice(1, 12).every(l => l.endsWith(';'))).toBe(true);
  });
  test('the classes in the theme’s colours, and a link style per class that has an edge', () => {
    expect(lines.slice(12)).toEqual([
      '  classDef hit fill:#deeade,stroke:#2e7d32,stroke-width:2px,color:#222',
      '  classDef no fill:#f7e1e1,stroke:#c62828,stroke-width:2px,color:#222',
      '  classDef run fill:#fef1dc,stroke:#f9a825,stroke-width:3px,color:#222',
      '  classDef off fill:#ffffff,stroke:#dddddd,stroke-width:2px,stroke-dasharray:5 4,color:#888888',
      '  classDef stopn fill:#c62828,stroke:#c62828,color:#ffffff',
      '  linkStyle 0,3 stroke:#2e7d32,stroke-width:3px',
      '  linkStyle 2 stroke:#f9a825,stroke-width:3px',
      '  linkStyle 4 stroke:#c62828,stroke-width:3px',
      '  linkStyle 1 stroke:#c9c9c9,stroke-width:2px',
    ]);
  });
  test('the not-taken edges take the ring when the line is the card’s colour', () => {
    const out = toMermaid(graph, {...TOKENS, line: TOKENS.card}, false);
    expect(out.split('\n').at(-1)).toBe('  linkStyle 1 stroke:#dddddd,stroke-width:2px');
    expect(toMermaid({...graph, edges: []}, TOKENS, false)).not.toContain('linkStyle');
  });
});

test('mixHex: 6 and 3 digits, with or without #; anything else is the first colour unmixed', () => {
  expect(mixHex('#000000', '#ffffff', 0.25)).toBe('#bfbfbf');
  expect(mixHex('f00', ' #00f ', 1)).toBe('#ff0000');
  expect(mixHex('rgb(0,0,0)', '#fff', 0.5)).toBe('rgb(0,0,0)');
  expect(mixHex('#000', 'white', 0.5)).toBe('#000');
});
