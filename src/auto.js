// ---------- Automations tab: what ran today, and each run drawn as a flow (v1.14) ----------
// Data comes from Home Assistant itself: the automation's own config (automation/config), and its traces
// (trace/list, trace/get), which record which trigger fired, each condition's result and each step's time.
// The graph is laid out by Mermaid (from npm, in lazy chunks imported only when the tab opens);
// the path a run took is lit green, the step it is waiting on amber, a failed check red, the rest dashed grey.
import {esc, cap, plural, tile} from './legacy/globals.js';
import {StaleReply} from './core/api.ts';
import {createMessages} from './core/i18n/messages.ts';
import {
  asList as auArr,
  automationsOf,
  minutesOfDay as auMins,
  sunNext,
  upcomingRuns,
} from './providers/automations.ts';
// the feature's pure files, which this file draws from until #273 deletes it (the second temporary allowance of
// .dependency-cruiser.cjs, `auto-reads-its-feature`)
import {
  actionText,
  conditionText,
  cut as auCut,
  durationText,
  shortAlias as auShortAlias,
  triggerText,
} from './features/automations/sentences.ts';
import {elapsedText, fingerprint, noiseOf, picks} from './features/automations/traces.ts';
import {isUp, timelineLayout} from './features/automations/timeline-layout.ts';

// English, as `fmtEn` is: the rewrite layer translates what this file draws (#273 draws in the panel's language)
const tEn = createMessages({language: 'en', tag: 'en'}).t;

// Mermaid is imported the first time a flow is drawn, so the bundle the other tabs load does not carry it; Vite emits
// it as chunks under chunks/, beside home-panel.js.
// module-level on purpose: a library loads once per page, not once per panel (spec 10, the one exception to "no module state")
let mermaidP;
const loadMermaid = () => (mermaidP ??= import('mermaid').then(m => m.default));

// hex colour mix, for the node fills (Mermaid's classDef can't take color-mix: commas separate its properties)
const auMix = (a, b, t) => {
  const p = h => {
    h = String(h || '')
      .trim()
      .replace('#', '');
    if (h.length === 3)
      h = h
        .split('')
        .map(c => c + c)
        .join('');
    const n = parseInt(h, 16);
    return /^[0-9a-f]{6}$/i.test(h) ? [n >> 16, (n >> 8) & 255, n & 255] : null;
  };
  const x = p(a),
    y = p(b);
  if (!x || !y) return a;
  return (
    '#' +
    x
      .map((v, i) =>
        Math.round(v * t + y[i] * (1 - t))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
};
export const autoMethods = {
  // the words of a flow, in English (see tEn)
  auDeps() {
    return {t: tEn, fmt: this.fmtEn, states: this.hass.states, names: this.store.names};
  },
  // ---------- the graph: nodes, edges, and what the run lit up ----------
  // cfg = automation config; tr = full trace (or null): returns {def, sentence, failed, waiting}
  auGraph(cfg, tr, sum) {
    const T = (tr && tr.trace) || {},
      nodes = [],
      edges = [],
      N = {};
    const hasKey = p => Object.prototype.hasOwnProperty.call(T, p),
      last = p => {
        const a = T[p];
        return a && a.length ? a[a.length - 1] : null;
      };
    const running = sum && sum.state === 'running',
      lastStep = sum && (sum.last_step || (tr && tr.last_step));
    const nid = p => 'n' + p.replace(/[^a-z0-9]+/gi, '_');
    const add = (path, d, shape = 'round', extra = {}) => {
      const id = nid(path),
        e = last(path),
        r = e && e.result,
        vis = hasKey(path);
      let cls = vis ? 'hit' : 'off',
        sub = '';
      if (vis && e.timestamp) sub = this.fmtEn.time24s(new Date(e.timestamp));
      if (vis && r && r.result === false) {
        cls = 'no';
        sub = 'no';
      } else if (vis && r && r.result === true) sub = 'yes';
      if (vis && e.error) {
        cls = 'no';
        sub = auCut(e.error, 40);
      }
      if (vis && r && r.wait)
        sub = r.wait.completed === false || (r.wait.trigger === null && !r.wait.completed) ? 'timed out' : 'done';
      if (running && lastStep === path) {
        cls = 'run';
        sub = 'waiting here' + (e && e.timestamp ? ' since ' + this.fmtEn.time24(new Date(e.timestamp)) : '');
      }
      N[id] = {id, path, d, cls, vis, shape, sub, r, ...extra};
      nodes.push(N[id]);
      return id;
    };
    const link = (a, b, label, when) => edges.push({a, b, label, when});
    const chain = (prev, next) => {
      for (const x of prev) link(x.id, next, x.label, x.when);
    };
    // triggers
    const trigs = auArr(cfg.triggers || cfg.trigger);
    let fired = Object.keys(T)
      .map(k => k.match(/^trigger\/(\d+)$/))
      .filter(Boolean)
      .map(m => +m[1]);
    const tv = T.trigger && T.trigger[0] && T.trigger[0].changed_variables && T.trigger[0].changed_variables.trigger;
    if (!fired.length && tv && tv.idx != null) fired = [+tv.idx];
    trigs.forEach((t, i) => {
      const p = `trigger/${i}`;
      if (fired.includes(i) && !hasKey(p)) T[p] = [{timestamp: tr && tr.timestamp && tr.timestamp.start}];
      add(p, triggerText(t, this.auDeps()), 'stadium');
    });
    let exits;
    if (trigs.length > 1) {
      const g = add('gate', {k: '', t: 'ANY'}, 'circle');
      if (fired.length) {
        T.gate = [{}];
        N[g].cls = 'hit';
        N[g].vis = true;
      }
      trigs.forEach((t, i) => link(nid(`trigger/${i}`), g));
      exits = [{id: g}];
    } else exits = trigs.length ? [{id: nid('trigger/0')}] : [];
    // conditions: a chain, all must pass; "or" splits and joins again
    const condTree = (c, path, prev) => {
      if (
        c &&
        typeof c === 'object' &&
        (c.condition === 'or' || c.condition === 'and') &&
        !c.alias &&
        auArr(c.conditions).length > 1
      ) {
        if (c.condition === 'and') {
          let p = prev;
          auArr(c.conditions).forEach((x, j) => {
            p = condTree(x, `${path}/conditions/${j}`, p);
          });
          return p;
        }
        const g = add(path, {k: '', t: 'ANY OF'}, 'circle');
        chain(prev, g);
        const outs = [];
        auArr(c.conditions).forEach((x, j) => outs.push(...condTree(x, `${path}/conditions/${j}`, [{id: g}])));
        return outs;
      }
      const id = add(path, conditionText(c, this.auDeps()));
      chain(prev, id);
      return [{id}];
    };
    auArr(cfg.conditions || cfg.condition).forEach((c, i) => {
      exits = condTree(c, `condition/${i}`, exits);
    });
    // actions: a sequence; if / choose branch and join
    const seq = (list, path, prev) => {
      auArr(list).forEach((a, j) => {
        prev = step(a, `${path}/${j}`, prev);
      });
      return prev;
    };
    const step = (a, path, prev) => {
      if (a && a.if) {
        const d = {
            k: 'If',
            t:
              auArr(a.if)
                .map(c => conditionText(c, this.auDeps()).t)
                .join(' and ') + '?',
          },
          id = add(path, d, 'diamond');
        chain(prev, id);
        const ch = N[id].r && N[id].r.choice;
        const outs = seq(a.then, `${path}/then`, [{id, label: 'yes', when: [id, 'then']}]);
        const els = a.else
          ? seq(a.else, `${path}/else`, [{id, label: 'no', when: [id, 'else']}])
          : [{id, label: 'no', when: [id, 'else']}];
        if (N[id].vis && ch == null && !hasKey(`${path}/then/0`)) N[id].r = {...(N[id].r || {}), choice: 'else'};
        return [...outs, ...els];
      }
      if (a && a.choose) {
        const id = add(path, {k: 'Choose', t: 'Which case?'}, 'diamond');
        chain(prev, id);
        let outs = [];
        auArr(a.choose).forEach((o, k) => {
          const lbl = auCut(
            o.alias ||
              auArr(o.conditions)
                .map(c => conditionText(c, this.auDeps()).t)
                .join(' and '),
            34,
          );
          outs.push(...seq(o.sequence, `${path}/choose/${k}/sequence`, [{id, label: lbl, when: [id, k]}]));
        });
        outs.push(
          ...(a.default
            ? seq(a.default, `${path}/default`, [{id, label: 'otherwise', when: [id, 'default']}])
            : [{id, label: 'none', when: [id, 'default']}]),
        );
        return outs;
      }
      if (a && a.repeat) {
        const id = add(path, actionText(a, this.auDeps()), 'round');
        chain(prev, id);
        const body = seq(a.repeat.sequence, `${path}/repeat/sequence`, [{id}]);
        body.forEach(x => link(x.id, id, 'again', 'loop'));
        return [{id}];
      }
      if (a && a.sequence && !a.action) return seq(a.sequence, `${path}/sequence`, prev);
      const d = actionText(a, this.auDeps()),
        id = add(path, d, d.shape || 'round');
      chain(prev, id);
      return [{id}];
    };
    exits = seq(cfg.actions || cfg.action, 'action', exits);
    // a failed check ends the run: say so with a STOP node
    const tsOf = n => {
      const e = last(n.path);
      return e && e.timestamp ? Date.parse(e.timestamp) : 0;
    };
    const failed = nodes
      .filter(
        n =>
          n.cls === 'no' &&
          /^condition/.test(n.path) &&
          n.r &&
          n.r.result === false &&
          !nodes.some(m => m.path.startsWith(n.path + '/') && m.cls === 'no'),
      )
      .sort((x, y) => tsOf(y) - tsOf(x) || y.path.length - x.path.length)[0];
    if (failed && sum && sum.script_execution === 'failed_conditions') {
      const s = add('stop', {k: '', t: 'STOP'}, 'stop');
      N[s].cls = 'stopn';
      N[s].vis = true;
      link(failed.id, s, '', 'stop');
    }
    // edge states
    const choiceOk = w => {
      if (!w) return true;
      if (w === 'loop' || w === 'stop') return true;
      const [id, v] = w,
        c = N[id].r && N[id].r.choice;
      return v === 'default' || v === 'else'
        ? (c === v || c === 'default' || c === 'else' || c == null) &&
            N[id].vis &&
            !(typeof c === 'number' || c === 'then')
        : String(c) === String(v);
    };
    edges.forEach(e => {
      const A = N[e.a],
        B = N[e.b];
      e.cls =
        e.when === 'stop'
          ? 'stop'
          : B.cls === 'run' && A.vis
            ? 'run'
            : A.vis && B.vis && A.cls !== 'no' && choiceOk(e.when)
              ? 'on'
              : 'off';
    });
    // the decision in one sentence
    const firedNode = nodes.find(n => /^trigger\//.test(n.path) && n.vis),
      waitN = nodes.find(n => n.cls === 'run');
    const started = tr && tr.timestamp ? tr.timestamp.start : sum && sum.timestamp && sum.timestamp.start;
    const ranActs = nodes.filter(n => /^action\//.test(n.path) && n.vis && n.shape !== 'diamond').length;
    const exec = sum && sum.script_execution;
    const parts = [];
    if (tr || sum) {
      parts.push(
        firedNode && firedNode.d.kind === 'automations.kind.every'
          ? `Every ${firedNode.d.t}${started ? ', at ' + this.fmtEn.time24(new Date(started)) : ''}`
          : firedNode && firedNode.d.kind === 'automations.kind.time'
            ? `At ${firedNode.d.t}`
            : `${firedNode ? firedNode.d.t : cap((sum && sum.trigger) || 'Started')}${started ? ' at ' + this.fmtEn.time24(new Date(started)) : ''}`,
      );
      if (failed && exec === 'failed_conditions') parts.push(`stopped at “${auCut(failed.d.t, 60)}”`);
      else if (exec === 'failed_single' || exec === 'failed_max_runs') parts.push('skipped, it was already running');
      else if (nodes.some(n => /^condition\//.test(n.path))) parts.push('checks passed');
      if (waitN)
        parts.push(
          `now ${waitN.d.kind === 'automations.kind.delay' ? 'in a ' + waitN.d.t.toLowerCase() : 'waiting: ' + auCut(waitN.d.t, 60).toLowerCase()}`,
        );
      else if (exec === 'error') parts.push(`error${sum.error ? ': ' + auCut(sum.error, 60) : ''}`);
      else if (exec === 'finished' || exec === 'aborted' || exec === 'cancelled') {
        const fin = sum.timestamp && sum.timestamp.finish,
          d = fin && started ? (Date.parse(fin) - Date.parse(started)) / 1000 : null;
        parts.push(
          `${plural(ranActs, 'step')} ran${d == null ? '' : d < 1 ? ' at once' : ' in ' + (d < 60 ? Math.round(d) + ' s' : durationText(Math.round(d), this.auDeps()))}${exec !== 'finished' ? ' (' + exec + ')' : ''}`,
        );
      }
    }
    return {
      nodes,
      edges,
      sentence: parts.join(' → '),
      failed: !!failed && exec === 'failed_conditions',
      waiting: !!waitN,
    };
  },
  // Mermaid source for a graph, in the panel's colours
  auMermaid(G) {
    const c = n => this.css(n) || '#888',
      ok = c('--ok'),
      crit = c('--crit'),
      warn = c('--warn'),
      card = c('--card'),
      ring = c('--ring'),
      fg = c('--fg'),
      fg3 = c('--fg3'),
      line = c('--line');
    // Mermaid's entity pre-pass runs `text.replace(/style.*:\S*#.*;/g, s => s.slice(0, -1))` on each source line and so
    // drops the last `;` of one that has a `#` after `style…:` with no space between (a label's `100#37;`). Every node and
    // edge line therefore ends in a `;` of its own (a statement separator to Mermaid), and it must stay the last character
    // of the line: it is the one the pre-pass eats, so the label's is not. See "As built (#97)" in docs/specs/07.
    // Home Assistant text (aliases, names, trace errors) goes into quoted labels, and Mermaid reads `#nn;` entities in
    // them, `%%{init}%%` directives and `$$…$$` formulas (KaTeX), so each of those is written so it can only be drawn:
    // esc() leaves no `"` to close a label; a # that starts what could be an entity (`#36;`, `#lt;`) becomes `#35;`
    // first, so a typed `#36;` or `#37;` stays text instead of turning into the `$` or `%` it names (Mermaid reads only
    // `#`, word characters and `;` as an entity, so any other # is already plain text and is left alone); every % becomes
    // `#37;` (no `%%{init}%%` directive: theme, CSS, label settings); each $ gets its own <span>, so no two meet (an
    // entity would not do: Mermaid decodes it before it looks for `$$`). Known: Mermaid drops the last `;` of a source
    // line that has a `#` after a `style…:` with no space between, see the `;` ending every statement below
    const mermaidText = s =>
      esc(s)
        .replace(/#(?=\w*;)/g, '#35;')
        .replace(/%/g, '#37;')
        .replace(/\$/g, () => '<span>$</span>');
    const lbl = n => {
      if (n.shape === 'circle' || n.shape === 'stop')
        return `<span style='font-size:11px;font-weight:800;letter-spacing:.08em'>${mermaidText(n.d.t)}</span>`;
      const k = n.d.k
        ? `<span style='font-size:11px;font-weight:800;letter-spacing:.1em;opacity:.65'>${mermaidText(n.d.k.toUpperCase())}</span><br/>`
        : '';
      return `${k}<span style='font-size:12px;font-weight:700'>${mermaidText(auCut(n.d.t, 64))}</span>${n.sub ? `<br/><span style='font-size:11px;font-weight:500;opacity:.75'>${mermaidText(n.sub)}</span>` : ''}`;
    };
    const shape = n => {
      const L = `"${lbl(n)}"`;
      return n.shape === 'stadium'
        ? `([${L}])`
        : n.shape === 'circle'
          ? `((${L}))`
          : n.shape === 'diamond'
            ? `{{${L}}}`
            : n.shape === 'sub'
              ? `[[${L}]]`
              : n.shape === 'stop'
                ? `([${L}])`
                : `(${L})`;
    };
    const out = [this.compact ? 'flowchart TD' : 'flowchart LR']; // top to bottom on a phone, where the screen is tall
    for (const n of G.nodes) out.push(`  ${n.id}${shape(n)}:::${n.cls};`);
    G.edges.forEach(e =>
      out.push(
        `  ${e.a} ${e.cls === 'off' ? '-.->' : '-->'}${e.label ? `|"<span style='font-size:11px;font-weight:600'>${mermaidText(e.label)}</span>"|` : ''} ${e.b};`,
      ),
    );
    out.push(`  classDef hit fill:${auMix(ok, card, 0.16)},stroke:${ok},stroke-width:2px,color:${fg}`);
    out.push(`  classDef no fill:${auMix(crit, card, 0.14)},stroke:${crit},stroke-width:2px,color:${fg}`);
    out.push(`  classDef run fill:${auMix(warn, card, 0.16)},stroke:${warn},stroke-width:3px,color:${fg}`);
    out.push(`  classDef off fill:${card},stroke:${ring},stroke-width:2px,stroke-dasharray:5 4,color:${fg3}`);
    out.push(`  classDef stopn fill:${crit},stroke:${crit},color:${card}`);
    const idx = k => G.edges.map((e, i) => (e.cls === k ? i : -1)).filter(i => i >= 0);
    const ls = (k, style) => {
      const ix = idx(k);
      if (ix.length) out.push(`  linkStyle ${ix.join(',')} ${style}`);
    };
    ls('on', `stroke:${ok},stroke-width:3px`);
    ls('run', `stroke:${warn},stroke-width:3px`);
    ls('stop', `stroke:${crit},stroke-width:3px`);
    ls('off', `stroke:${line === card ? ring : auMix(fg3, card, 0.45)},stroke-width:2px`);
    return out.join('\n');
  },
  // ---------- data ----------
  auAutos() {
    return automationsOf(this.hass.states, this.store.names);
  },
  auNoise(sm) {
    return noiseOf(this.auCfg || {})(sm);
  },
  async auLoad(force) {
    if (this.auBusy || !this.hass) return;
    if (!force && Date.now() - (this.auAt || 0) < 20000) return;
    this.auBusy = true;
    this.auCfg = this.auCfg || {};
    this.auTr = this.auTr || {};
    try {
      let dropped = false;
      const list = await this.api.traceList('automation').catch(e => {
        // the config changed while the list was on its way: neither a list nor an error, so ask again later
        if (e instanceof StaleReply) dropped = true;
        else this.auErr = e && (e.message || e.code);
        return null;
      });
      if (dropped) return;
      if (list) {
        this.auList = list;
        this.auErr = null;
      }
      const A = this.auAutos(),
        stale = Date.now() - (this.auCfgAt || 0) > 600000;
      if (stale) {
        this.auCfgAt = Date.now();
      }
      await Promise.all(
        A.filter(a => a.item && (stale || !(a.item in this.auCfg))).map(a =>
          this.api
            .automationConfig(a.entity)
            .then(r => {
              this.auCfg[a.item] = r.config;
            })
            .catch(e => {
              if (e instanceof StaleReply) return; // not a failure: the next load asks again
              if (!(a.item in this.auCfg)) this.auCfg[a.item] = null;
            }),
        ),
      );
      const want = this.auPicks().filter(Boolean);
      await Promise.all(
        want.map(sm => {
          const k = sm.item_id + '/' + sm.run_id,
            have = this.auTr[k];
          if (have && have.state !== 'running' && sm.state !== 'running') return null;
          return this.api
            .traceGet('automation', sm.item_id, sm.run_id)
            .then(t => {
              this.auTr[k] = t;
            })
            .catch(() => {});
        }),
      );
      this.auAt = Date.now();
    } finally {
      this.auBusy = false;
    }
    this.cache.auhost = null;
    this.renderAuto();
  },
  // the runs the cards show: selected, running, last decision, last completed
  auPicks() {
    const p = picks(this.auList || [], this.auSel || null, noiseOf(this.auCfg || {}));
    return [p.selected, p.running, p.decision, p.completed];
  },
  // ---------- drawing ----------
  renderAuto() {
    if (this.view !== 'tabs' || this.tab !== 'auto' || !this.hass) return;
    const A = this.auAutos(),
      sig = fingerprint(A);
    if (sig !== this.auSig) {
      const first = !this.auSig;
      this.auSig = sig;
      if (!first) {
        clearTimeout(this.auSigT);
        this.auSigT = setTimeout(() => this.auLoad(true), 1500);
      }
    }
    if (!this.auList && !this.auErr) {
      this.auLoad(true);
      this.set('auhost', '<p class="loading">Reading the automation runs from Home Assistant…</p>');
      this.set('ausub', plural(A.length, 'automation'));
      return;
    }
    this.auLoad(false);
    const cfgs = this.auCfg || {},
      list = (this.auList || []).slice().sort((a, b) => Date.parse(a.timestamp.start) - Date.parse(b.timestamp.start));
    const midnight = Date.now() - auMins(Date.now(), this.fmtEn) * 60000 - new Date().getSeconds() * 1000;
    const today = list.filter(sm => Date.parse(sm.timestamp.start) >= midnight && !this.auNoise(sm));
    const byItem = Object.fromEntries(A.filter(a => a.item).map(a => [a.item, a]));
    const runs = today.filter(
      sm => sm.script_execution !== 'failed_conditions' && sm.script_execution !== 'failed_single',
    );
    const running = list.filter(sm => sm.state === 'running' && !this.auNoise(sm));
    const off = A.filter(a => !a.on).length;
    this.set(
      'ausub',
      [
        running.length ? `${running.length} running` : 'nothing running',
        `${plural(runs.length, 'run')} today`,
        `${A.length - off} enabled${off ? ` · ${off} off` : ''}`,
      ].join(' · '),
    );
    if (this.auErr && !this.auList) {
      this.set(
        'auhost',
        `<section class="card"><div class="top"><span class="lbl">Automations</span></div><p class="hint">Home Assistant didn't return the automation traces (${esc(this.auErr)}). The panel needs an administrator account to read them.</p></section>`,
      );
      return;
    }
    // Today timeline: runs closer together than a dot is wide share one dot, with the count on it; the labels under the
    // dots give the time only, on two rows
    const up = upcomingRuns(cfgs, A, Date.now(), sunNext(this.hass.states), this.fmtEn);
    const dots = [
      ...today.map(sm => ({
        summary: sm,
        mins: auMins(sm.timestamp.start, this.fmtEn),
        item: sm.item_id,
        name: (byItem[sm.item_id] || {}).name || sm.item_id,
      })),
      ...up.map(u => ({up: true, ...u})),
    ].sort((a, b) => a.mins - b.mins);
    const tlW = (this.$('auhost') || {}).clientWidth || this.$app.clientWidth || 800;
    const layout = timelineLayout(dots, tlW, Date.now(), {t: tEn, fmt: this.fmtEn});
    const dotsH = layout.groups
      .map(g => {
        const d = g.dots[0],
          n = g.dots.length,
          pct = g.x,
          cls = g.cls;
        const data = isUp(d)
          ? `data-au="${esc(d.item)}"`
          : `data-run="${esc(d.summary.run_id)}" data-item="${esc(d.item)}"`;
        return `<button type="button" class="aud ${cls}" style="left:${pct.toFixed(2)}%" ${data} aria-label="${esc(g.description)}" title="${esc(g.description)}">${n > 1 ? `<span class="n">${n}</span>` : ''}</button>${g.row >= 0 ? `<span class="aul r${g.row}${cls === 'now' ? ' now' : cls === 'skip' ? ' skip' : ''}" style="left:${pct.toFixed(2)}%"><b>${g.label}</b></span>` : ''}`;
      })
      .join('');
    const nextUp = up[0],
      nextUp2 = up[1];
    const skipped = today.filter(sm => sm.script_execution === 'failed_conditions').length;
    const todayCard = `<section class="card autoday"><div class="shead"><div><h3>Today</h3><p>One dot per run, a number when several ran close together. Filled ran, ringed red checked and did nothing, green is running now, hollow is still to come. Tap one to draw it below.</p></div><span class="pill">${esc(this.fmtEn.dateWeekday(new Date()))} · ${this.fmtEn.time24(Date.now())}</span></div>
      <div class="autl"><div class="axis"></div><div class="past" style="width:${layout.nowPct.toFixed(2)}%"></div><div class="nowl" style="left:${layout.nowPct.toFixed(2)}%"></div>${[0, 6, 12, 18].map(h => `<span class="hr" style="left:${(h / 24) * 100}%">${String(h).padStart(2, '0')}:00</span>`).join('')}${dotsH}</div>
      <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">${tile(['Ran today', runs.length, '', skipped ? `${skipped} more checked and did nothing` : 'every run passed its checks'])}${tile(['Next', nextUp ? this.fmtEn.time24(new Date(nextUp.t)) : '–', '', nextUp ? esc(auShortAlias(nextUp.name)) : 'nothing else scheduled today'])}${tile(['Then', nextUp2 ? this.fmtEn.time24(new Date(nextUp2.t)) : '–', '', nextUp2 ? esc(auShortAlias(nextUp2.name)) : '—'])}</div></section>`;
    // flow cards
    const [sel, runN, dec, done] = this.auPicks(),
      seen = new Set(),
      cards = [];
    const card = (sm, kind, item) => {
      const it = sm ? sm.item_id : item;
      if (!it) return;
      const key = sm ? sm.run_id : 'none:' + it;
      if (seen.has(key)) return;
      seen.add(key);
      const a = byItem[it] || {name: it},
        tr = sm && this.auTr[it + '/' + sm.run_id],
        cfg = cfgs[it] || (tr && tr.config) || null;
      if (!cfg) {
        cards.push(
          `<section class="card auc"><div class="shead"><div><h3>${esc(kind)} · ${esc(a.name)}</h3><p>Its configuration couldn't be read.</p></div></div></section>`,
        );
        return;
      }
      const G = this.auGraph(cfg, tr || null, sm || null),
        def = this.auMermaid(G);
      const pill = !sm
        ? '<span class="pill">no run stored</span>'
        : sm.state === 'running'
          ? `<span class="pill run" data-since="${esc(sm.timestamp.start)}">running ${elapsedText(Date.parse(sm.timestamp.start), Date.now())}</span>`
          : sm.script_execution === 'failed_conditions'
            ? `<span class="pill no">stopped ${this.fmtEn.time24(new Date(sm.timestamp.start))}</span>`
            : sm.script_execution === 'error'
              ? `<span class="pill no">error ${this.fmtEn.time24(new Date(sm.timestamp.start))}</span>`
              : `<span class="pill ok">done ${sm.timestamp.finish ? this.fmtEn.time24s(new Date(sm.timestamp.finish)) : this.fmtEn.time24(new Date(sm.timestamp.start))}</span>`;
      const runsOf =
        kind === 'Selected'
          ? (this.auList || [])
              .filter(x => x.item_id === it)
              .sort((x, y) => Date.parse(y.timestamp.start) - Date.parse(x.timestamp.start))
              .slice(0, 8)
          : [];
      const picker =
        runsOf.length > 1
          ? `<div class="aupick">${runsOf.map(x => `<button type="button" class="chip${sm && x.run_id === sm.run_id ? ' sel' : ''}" data-run="${esc(x.run_id)}" data-item="${esc(it)}"><span class="dot" style="background:var(--${x.state === 'running' ? 'warn' : x.script_execution === 'failed_conditions' || x.script_execution === 'error' ? 'crit' : 'ok'})"></span>${this.fmtEn.isoDay(Date.parse(x.timestamp.start)) === this.fmtEn.isoDay(Date.now()) ? '' : esc(this.fmtEn.date(new Date(x.timestamp.start))) + ' '}${this.fmtEn.time24(new Date(x.timestamp.start))}</button>`).join('')}</div>`
          : '';
      const sentence =
        G.sentence ||
        (sm ? '' : 'No run of this automation is stored since Home Assistant last started, so this is its shape only.');
      cards.push(`<section class="card auc${kind === 'Selected' ? ' ausel' : ''}"><div class="shead"><div><h3>${esc(kind)} · ${esc(a.name)}</h3><p>${esc(sentence)}</p></div><div class="auhr">${pill}${kind === 'Selected' ? '<button type="button" class="close" data-auclose aria-label="Close">×</button>' : ''}</div></div>${picker}
        <div class="aulegend"><span><i class="on"></i>path taken</span><span><i class="run"></i>waiting here</span><span><i class="no"></i>stopped</span><span><i class="off"></i>not taken</span></div>
        <div class="augraph" data-def="${esc(def)}"></div></section>`);
    };
    if (sel || this.auSel) card(sel, 'Selected', this.auSel && this.auSel.item);
    if (runN) card(runN, 'Running now');
    if (dec) card(dec, 'Last decision');
    if (done) card(done, 'Last completed');
    if (!cards.length)
      cards.push(
        '<section class="card"><p class="hint">No automation has run since Home Assistant last started.</p></section>',
      );
    // every automation
    const lastOf = a => (a.last ? Date.parse(a.last) : 0);
    const chips = A.slice()
      .sort((x, y) => lastOf(y) - lastOf(x))
      .map(
        a =>
          `<button type="button" class="chip auchip${a.on ? '' : ' offa'}${this.auSel && this.auSel.item === a.item ? ' sel' : ''}" data-au="${esc(a.item || '')}"${a.item ? '' : ' disabled'}>${esc(a.name)}<small>${!a.on ? 'off' : a.current ? 'running' : a.last ? (this.fmtEn.isoDay(lastOf(a)) === this.fmtEn.isoDay(Date.now()) ? this.fmtEn.time24(new Date(a.last)) : this.fmtEn.date(new Date(a.last))) : 'never'}</small></button>`,
      )
      .join('');
    const all = `<section class="card"><div class="shead"><div><h3>Every automation</h3><p>Latest first. Tap one to draw its flow with its last run lit up.</p></div></div><div class="auchips">${chips}</div></section>`;
    this.set('auhost', todayCard + cards.join('') + all);
    this.auDraw();
    // the running pill counts up without redrawing the graph
    this.root.querySelectorAll('#auhost .pill.run[data-since]').forEach(p => {
      p.textContent = 'running ' + elapsedText(Date.parse(p.dataset.since), Date.now());
    });
  },
  async auDraw() {
    const boxes = [...this.root.querySelectorAll('#auhost .augraph')].filter(b => b.dataset.drawn !== b.dataset.def);
    if (!boxes.length) return;
    let M;
    try {
      M = await loadMermaid();
    } catch {
      boxes.forEach(b => {
        b.innerHTML =
          '<p class="hint">The flow drawing library didn\'t load: the chunks folder is missing next to home-panel.js, or the connection dropped. Reload the page to try again.</p>';
        b.dataset.drawn = b.dataset.def;
      });
      return;
    }
    const theme = [this.css('--f-body'), this.css('--card'), this.css('--fg')].join();
    if (this.auTheme !== theme) {
      this.auTheme = theme;
      this.auSvg = {};
      M.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        // Mermaid 11.10+ draws node outlines with Rough.js, which with the default seed 0 picks a random one on each
        // render: the outline's curve points then differ by sub-pixel amounts from one draw to the next, and the
        // exact-match screenshots of the flows flake. Any fixed non-zero seed makes the drawing repeatable.
        handDrawnSeed: 1,
        theme: 'base',
        fontFamily: this.css('--f-body') || 'Montserrat, sans-serif',
        themeVariables: {
          fontFamily: this.css('--f-body') || 'Montserrat, sans-serif',
          fontSize: '13px',
          primaryColor: this.css('--card'),
          primaryBorderColor: this.css('--ring'),
          primaryTextColor: this.css('--fg'),
          lineColor: this.css('--fg3'),
          edgeLabelBackground: this.css('--card'),
          tertiaryColor: this.css('--card2'),
        },
        flowchart: {
          curve: 'basis',
          htmlLabels: true,
          nodeSpacing: 20,
          rankSpacing: 40,
          padding: 10,
          useMaxWidth: false,
          diagramPadding: 6,
        },
      });
    }
    this.auSvg = this.auSvg || {};
    for (const b of boxes) {
      const def = b.dataset.def;
      try {
        if (!this.auSvg[def]) {
          const id = 'hpau' + (this.auN = (this.auN || 0) + 1);
          const r = await M.render(id, def);
          this.auSvg[def] = r.svg;
        }
        if (!b.isConnected || b.dataset.def !== def) continue;
        b.innerHTML = this.auSvg[def];
        b.dataset.drawn = def;
        this.auDecorate(b);
      } catch (e) {
        console.error('home-panel automations graph', e);
        b.innerHTML = '<p class="hint">This flow couldn\'t be drawn.</p>';
        b.dataset.drawn = def;
      }
    }
  },
  // arrowheads in the edge's colour, and the moving dash on the step being waited for
  auDecorate(box) {
    const svg = box.querySelector('svg');
    if (!svg) return;
    const vb = svg.viewBox && svg.viewBox.baseVal,
      w = vb && vb.width,
      host = box.clientWidth || 1000;
    svg.removeAttribute('height');
    svg.style.maxWidth = 'none';
    if (w) {
      const fit = w <= host * 1.3,
        width = fit ? Math.min(w, host) : w * 0.88;
      svg.style.width = width + 'px';
      box.classList.toggle('wide', !fit);
      if (!fit) {
        // scroll to the step being waited on, or the check that stopped it
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
    const ns = 'http://www.w3.org/2000/svg',
      defs = svg.querySelector('defs') || svg.insertBefore(document.createElementNS(ns, 'defs'), svg.firstChild),
      sid = svg.id;
    const mk = (name, color) => {
      const m = document.createElementNS(ns, 'marker');
      m.setAttribute('id', `${sid}-${name}`);
      m.setAttribute('viewBox', '0 0 10 10');
      m.setAttribute('refX', '8');
      m.setAttribute('refY', '5');
      m.setAttribute('markerWidth', '7');
      m.setAttribute('markerHeight', '7');
      m.setAttribute('orient', 'auto-start-reverse');
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', 'M1,1 L9,5 L1,9 Z');
      p.setAttribute('fill', color);
      m.appendChild(p);
      defs.appendChild(m);
    };
    const col = {
      on: this.css('--ok'),
      run: this.css('--warn'),
      stop: this.css('--crit'),
      off: auMix(this.css('--fg3'), this.css('--card'), 0.45),
    };
    Object.entries(col).forEach(([k, c]) => mk(k, c));
    const paths = [...svg.querySelectorAll('.edgePaths path, path.flowchart-link')].filter(
      (p, i, a) => a.indexOf(p) === i,
    );
    const def = box.dataset.def,
      styles = {}; // recover each edge's class from its linkStyle line
    for (const m of def.matchAll(/linkStyle ([\d,]+) stroke:([^,]+)/g)) {
      const k =
        Object.keys(col).find(
          x =>
            (x === 'on' && m[2] === col.on) || (x === 'run' && m[2] === col.run) || (x === 'stop' && m[2] === col.stop),
        ) || 'off';
      m[1].split(',').forEach(i => {
        styles[+i] = k;
      });
    }
    paths.forEach((p, i) => {
      const k = styles[i] || 'off';
      p.setAttribute('marker-end', `url(#${sid}-${k})`);
      p.classList.add('au-' + k);
    });
  },
};
