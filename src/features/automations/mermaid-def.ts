// An automation's flow graph as a Mermaid flowchart definition: one line per node and edge, the classes that colour what
// the run did, and the link styles; Home Assistant's text written so Mermaid can only draw it, never read it as markup.
// Pattern: a pure printer from the graph to Mermaid's flowchart syntax (Bernhardt, functional core), the legacy `auMermaid()`
// and `auMix()`; the escaping is #97's (docs/specs/07, "As built (#97)").
// Must not: read the theme or the DOM (the colours are passed in as tokens), load Mermaid, or word anything: it only
// capitalises the graph's words and cuts a long sentence, as the legacy panel drew them.
import {cut} from './sentences.ts';
import type {Graph, GraphNode} from './graph.ts';

/** The theme's colours the flow is drawn in, as hex or any CSS colour (a non-hex one is used unmixed). */
export interface FlowTokens {
  ok: string;
  crit: string;
  warn: string;
  card: string;
  ring: string;
  fg: string;
  fg3: string;
  line: string;
}

/**
 * `a` mixed into `b` by `share` (0 to 1), as hex: Mermaid's `classDef` cannot take `color-mix()`, its commas separate the
 * properties. `a` itself when either is not a 3- or 6-digit hex colour.
 */
export function mixHex(a: string, b: string, share: number): string {
  const rgb = (hex: string): number[] | null => {
    let h = hex.trim().replace('#', '');
    if (h.length === 3)
      h = h
        .split('')
        .map(c => c + c)
        .join('');
    const n = parseInt(h, 16);
    return /^[0-9a-f]{6}$/i.test(h) ? [n >> 16, (n >> 8) & 255, n & 255] : null;
  };
  const x = rgb(a),
    y = rgb(b);
  if (!x || !y) return a;
  return `#${x
    .map((v, i) =>
      Math.round(v * share + y[i] * (1 - share))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** No `"` is left to close a quoted label, and no `<` opens a tag. */
export const escapeLabel = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c] ?? c);

/**
 * A `#` that starts what Mermaid would read as an entity (`#36;`, `#lt;`) is written `#35;`, so a typed `#36;` stays text
 * instead of the `$` it names; Mermaid reads only `#`, word characters and `;` as an entity, so any other `#` is left.
 */
export const protectEntities = (s: string): string => s.replace(/#(?=\w*;)/g, '#35;');

/** Every `%` as `#37;`: no `%%{init}%%` directive can reach the theme, the CSS or the label settings. */
export const protectPercent = (s: string): string => s.replace(/%/g, '#37;');

/** Each `$` in a span of its own, so no two meet as a `$$…$$` formula (an entity would not do: Mermaid decodes it first). */
export const splitDollars = (s: string): string => s.replace(/\$/g, () => '<span>$</span>');

/** Home Assistant's text (aliases, names, trace errors) as a quoted Mermaid label can only draw it, in #97's order. */
export const safeText = (s: string): string => splitDollars(protectPercent(protectEntities(escapeLabel(s))));

const label = (n: GraphNode): string => {
  if (n.shape === 'circle' || n.shape === 'stop')
    return `<span style='font-size:11px;font-weight:800;letter-spacing:.08em'>${safeText(n.label)}</span>`;
  const k = n.k
    ? `<span style='font-size:11px;font-weight:800;letter-spacing:.1em;opacity:.65'>${safeText(n.k.toUpperCase())}</span><br/>`
    : '';
  const sub = n.sub ? `<br/><span style='font-size:11px;font-weight:500;opacity:.75'>${safeText(n.sub)}</span>` : '';
  return `${k}<span style='font-size:12px;font-weight:700'>${safeText(cut(n.label, 64))}</span>${sub}`;
};

const OPEN: Record<GraphNode['shape'], [string, string]> = {
  stadium: ['([', '])'],
  circle: ['((', '))'],
  diamond: ['{{', '}}'],
  sub: ['[[', ']]'],
  stop: ['([', '])'],
  round: ['(', ')'],
};

/**
 * The flowchart of `graph` in `tokens`' colours, left to right, or top to bottom when `compact` (a phone, where the screen
 * is tall). Every node and edge line ends in a `;` of its own, its last character: Mermaid's entity pre-pass drops the last
 * `;` of a line with a `#` after `style…:`, and it must eat that one rather than a label's `#37;`.
 */
export function toMermaid(graph: Graph, tokens: FlowTokens, compact: boolean): string {
  const {ok, crit, warn, card, ring, fg, fg3, line} = tokens;
  const out = [compact ? 'flowchart TD' : 'flowchart LR'];
  for (const n of graph.nodes) {
    const [open, close] = OPEN[n.shape];
    out.push(`  ${n.id}${open}"${label(n)}"${close}:::${n.cls};`);
  }
  for (const e of graph.edges) {
    const text = e.label ? `|"<span style='font-size:11px;font-weight:600'>${safeText(e.label)}</span>"|` : '';
    out.push(`  ${e.from} ${e.cls === 'off' ? '-.->' : '-->'}${text} ${e.to};`);
  }
  out.push(`  classDef hit fill:${mixHex(ok, card, 0.16)},stroke:${ok},stroke-width:2px,color:${fg}`);
  out.push(`  classDef no fill:${mixHex(crit, card, 0.14)},stroke:${crit},stroke-width:2px,color:${fg}`);
  out.push(`  classDef run fill:${mixHex(warn, card, 0.16)},stroke:${warn},stroke-width:3px,color:${fg}`);
  out.push(`  classDef off fill:${card},stroke:${ring},stroke-width:2px,stroke-dasharray:5 4,color:${fg3}`);
  out.push(`  classDef stopn fill:${crit},stroke:${crit},color:${card}`);
  const style = (cls: string, css: string) => {
    const ix = graph.edges.map((e, i) => (e.cls === cls ? i : -1)).filter(i => i >= 0);
    if (ix.length) out.push(`  linkStyle ${ix.join(',')} ${css}`);
  };
  style('on', `stroke:${ok},stroke-width:3px`);
  style('run', `stroke:${warn},stroke-width:3px`);
  style('stop', `stroke:${crit},stroke-width:3px`);
  style('off', `stroke:${line === card ? ring : mixHex(fg3, card, 0.45)},stroke-width:2px`);
  return out.join('\n');
}
