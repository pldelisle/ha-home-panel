// mountFlow: an automation's flow drawn into a box: Mermaid loaded once per document, initialized for the box's theme, the definition
// rendered once per theme through a cache of the last theme's drawings, the drawing sized to the box and decorated (arrowheads in each edge's colour, the dash on
// the step waited for). Pattern: a mount module for a third-party library (spec 17's shape), the legacy `auDraw()` and `auDecorate()`.
// Mermaid's configuration is global, so every render is queued and initializes again when its theme is not the last one's (two panels).
// Must not: word anything (the failure lines are the caller's), read Home Assistant, or keep a box after `destroy()`.
import {mixHex} from './mermaid-def.ts';

type Mermaid = (typeof import('mermaid/dist/mermaid.core.mjs'))['default'];

/** The two lines a box shows when it cannot draw, in the panel's language. */
export interface FlowMountDeps {
  /** Mermaid's chunks did not load. */
  noLibrary: string;
  /** Mermaid could not draw this definition. */
  failed: string;
}

export interface FlowMount {
  destroy(): void;
}

// Mermaid is imported the first time a flow is drawn, so the bundle the other tabs load does not carry it; Vite emits it as
// chunks under chunks/, beside home-panel.js. Module-level on purpose: a library loads once per document, not once per panel
// (spec 10, the one exception to "no module state"); so are the queue, the last theme and the render ids, which are shared by every panel too.
let mermaidP: Promise<Mermaid> | undefined;
const loadMermaid = (): Promise<Mermaid> => (mermaidP ??= import('mermaid/dist/mermaid.core.mjs').then(m => m.default));
let queue: Promise<unknown> = Promise.resolve();
let initialized = '';
// a render id is an element id in the document while Mermaid measures: two panels drawing the same automation need two
let renderCount = 0;
const svgs = new Map<string, string>();

const SVG = 'http://www.w3.org/2000/svg';

/** The theme's tokens a flow is initialized with, read from the box (they inherit from the frame into a shadow root). */
function themeOf(box: Element) {
  const style = getComputedStyle(box);
  const css = (name: string) => style.getPropertyValue(name).trim();
  const font = css('--f-body') || 'Manrope, sans-serif';
  return {
    startOnLoad: false,
    securityLevel: 'strict' as const,
    // Mermaid 11.10+ draws node outlines with Rough.js, which with the default seed 0 picks a random one on each render: the
    // outline's curve points then differ by sub-pixel amounts from one draw to the next, and the exact-match screenshots of the
    // flows flake. Any fixed non-zero seed makes the drawing repeatable.
    handDrawnSeed: 1,
    theme: 'base' as const,
    fontFamily: font,
    themeVariables: {
      fontFamily: font,
      fontSize: '13px',
      primaryColor: css('--card'),
      primaryBorderColor: css('--ring'),
      primaryTextColor: css('--fg'),
      lineColor: css('--fg3'),
      edgeLabelBackground: css('--card'),
      tertiaryColor: css('--card2'),
    },
    flowchart: {
      curve: 'basis' as const,
      htmlLabels: true,
      nodeSpacing: 20,
      rankSpacing: 40,
      padding: 10,
      useMaxWidth: false,
      diagramPadding: 6,
    },
  };
}

/** The SVG of `def` in the theme `config`, from the cache or drawn now, in turn with every other panel's renders. */
function render(mermaid: Mermaid, def: string, config: ReturnType<typeof themeOf>): Promise<string> {
  const theme = JSON.stringify(config);
  const key = `${theme}\n${def}`;
  const cached = svgs.get(key);
  if (cached) return Promise.resolve(cached);
  const job = queue.then(async () => {
    const again = svgs.get(key);
    if (again) return again;
    if (initialized !== theme) {
      // a new theme: the drawings of the last one are dropped, as the legacy panel did, so a theme toggled all day keeps one set
      svgs.clear();
      mermaid.initialize(config);
      initialized = theme;
    }
    const {svg} = await mermaid.render(`hpau${++renderCount}`, def);
    svgs.set(key, svg);
    return svg;
  });
  queue = job.catch(() => undefined);
  return job;
}

/** Draws `def` into `box`, which says `data-drawn` once it holds the drawing or a failure line. */
export function mountFlow(box: HTMLElement, def: string, deps: FlowMountDeps): FlowMount {
  let live = true;
  box.removeAttribute('data-drawn');
  const say = (line: string) => {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = line;
    box.replaceChildren(p);
    box.dataset.drawn = '';
  };
  loadMermaid().then(
    mermaid =>
      render(mermaid, def, themeOf(box)).then(
        svg => {
          if (!live) return;
          // parsed in an inert document, so nothing in it runs, then moved into the box
          const parsed = new DOMParser().parseFromString(`<body>${svg}`, 'text/html');
          box.replaceChildren(...parsed.body.childNodes);
          box.dataset.drawn = '';
          decorate(box, def);
        },
        (error: unknown) => {
          if (!live) return;
          console.error('home-panel automations graph', error);
          say(deps.failed);
        },
      ),
    () => {
      if (live) say(deps.noLibrary);
    },
  );
  return {
    destroy() {
      live = false;
      box.onscroll = null;
      box.replaceChildren();
      box.classList.remove('wide', 'end');
      box.removeAttribute('data-drawn');
    },
  };
}

// the drawing fits the box when it is at most 1.3 times as wide, else it scrolls at 88 percent to the step being waited on or
// the check that stopped it; then arrowheads in the edge's colour, and the classes that dash a waited or untaken edge
function decorate(box: HTMLElement, def: string): void {
  const svg = box.querySelector<SVGSVGElement>('svg');
  if (!svg) return;
  const style = getComputedStyle(box);
  const css = (name: string) => style.getPropertyValue(name).trim();
  const w = (svg.viewBox.baseVal as SVGRect | null)?.width;
  const host = box.clientWidth || 1000;
  svg.removeAttribute('height');
  svg.style.maxWidth = 'none';
  if (w) {
    const fit = w <= host * 1.3;
    svg.style.width = `${fit ? Math.min(w, host) : w * 0.88}px`;
    box.classList.toggle('wide', !fit);
    if (!fit) {
      const focus = svg.querySelector('g.node.run, g.node.no, g.node.stopn');
      box.onscroll = () => box.classList.toggle('end', box.scrollLeft + box.clientWidth >= box.scrollWidth - 4);
      requestAnimationFrame(() => {
        if (!focus) return;
        const fb = focus.getBoundingClientRect(),
          bb = box.getBoundingClientRect();
        box.scrollLeft = Math.max(0, box.scrollLeft + fb.left - bb.left - bb.width * 0.55);
      });
    }
  }
  const defs = svg.querySelector('defs') ?? svg.insertBefore(document.createElementNS(SVG, 'defs'), svg.firstChild);
  const sid = svg.id;
  const colours = {
    on: css('--ok'),
    run: css('--warn'),
    stop: css('--crit'),
    off: mixHex(css('--fg3'), css('--card'), 0.45),
  };
  for (const [name, colour] of Object.entries(colours)) {
    const marker = document.createElementNS(SVG, 'marker');
    for (const [k, v] of Object.entries({
      id: `${sid}-${name}`,
      viewBox: '0 0 10 10',
      refX: '8',
      refY: '5',
      markerWidth: '7',
      markerHeight: '7',
      orient: 'auto-start-reverse',
    }))
      marker.setAttribute(k, v);
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M1,1 L9,5 L1,9 Z');
    path.setAttribute('fill', colour);
    marker.appendChild(path);
    defs.appendChild(marker);
  }
  // each edge's class from its linkStyle line: the colour says which
  const classOf: Record<number, string> = {};
  for (const m of def.matchAll(/linkStyle ([\d,]+) stroke:([^,]+)/g)) {
    const k = m[2] === colours.on ? 'on' : m[2] === colours.run ? 'run' : m[2] === colours.stop ? 'stop' : 'off';
    for (const i of m[1].split(',')) classOf[+i] = k;
  }
  const paths = [...new Set(svg.querySelectorAll('.edgePaths path, path.flowchart-link'))];
  paths.forEach((p, i) => {
    const k = classOf[i] ?? 'off';
    p.setAttribute('marker-end', `url(#${sid}-${k})`);
    p.classList.add(`au-${k}`);
  });
}
