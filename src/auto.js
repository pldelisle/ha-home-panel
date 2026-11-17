// ---------- Automations tab: what ran today, and each run drawn as a flow (v1.14) ----------
// Data comes from Home Assistant itself: the automation's own config (automation/config), and its traces
// (trace/list, trace/get), which record which trigger fired, each condition's result and each step's time.
// The graph is laid out by Mermaid (from npm, in lazy chunks imported only when the tab opens);
// the path a run took is lit green, the step it is waiting on amber, a failed check red, the rest dashed grey.
import {esc, plural, tile} from './legacy/globals.js';
import {StaleReply} from './core/api.ts';
import {createMessages} from './core/i18n/messages.ts';
import {automationsOf, minutesOfDay as auMins, sunNext, upcomingRuns} from './providers/automations.ts';
// the feature's pure files, which this file draws from until #273 deletes it (the second temporary allowance of
// .dependency-cruiser.cjs, `auto-reads-its-feature`)
import {automationGraph} from './features/automations/graph.ts';
import {mixHex, toMermaid} from './features/automations/mermaid-def.ts';
import {shortAlias as auShortAlias} from './features/automations/sentences.ts';
import {elapsedText, fingerprint, noiseOf, picks, todayRuns} from './features/automations/traces.ts';
import {isUp, timelineLayout} from './features/automations/timeline-layout.ts';

// English, as `fmtEn` is: the rewrite layer translates what this file draws (#273 draws in the panel's language)
const tEn = createMessages({language: 'en', tag: 'en'}).t;

// Mermaid is imported the first time a flow is drawn, so the bundle the other tabs load does not carry it; Vite emits
// it as chunks under chunks/, beside home-panel.js.
// module-level on purpose: a library loads once per page, not once per panel (spec 10, the one exception to "no module state")
let mermaidP;
const loadMermaid = () => (mermaidP ??= import('mermaid').then(m => m.default));

export const autoMethods = {
  // the words of a flow, in English (see tEn)
  auDeps() {
    return {t: tEn, fmt: this.fmtEn, states: this.hass.states, names: this.store.names};
  },
  // the theme's colours a flow is drawn in
  auTokens() {
    const c = n => this.css(n) || '#888';
    return {
      ok: c('--ok'),
      crit: c('--crit'),
      warn: c('--warn'),
      card: c('--card'),
      ring: c('--ring'),
      fg: c('--fg'),
      fg3: c('--fg3'),
      line: c('--line'),
    };
  },
  // ---------- data ----------
  auAutos() {
    return automationsOf(this.hass.states, this.store.names);
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
    if (this.tab !== 'auto' || !this.hass) return;
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
    const noise = noiseOf(cfgs),
      today = todayRuns(list, midnight, noise);
    const byItem = Object.fromEntries(A.filter(a => a.item).map(a => [a.item, a]));
    const runs = today.filter(
      sm => sm.script_execution !== 'failed_conditions' && sm.script_execution !== 'failed_single',
    );
    const running = list.filter(sm => sm.state === 'running' && !noise(sm));
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
      ...up.map(u => ({up: /** @type {const} */ (true), ...u})),
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
      const G = automationGraph(cfg, tr || null, sm || null, this.auDeps()),
        def = toMermaid(G, this.auTokens(), this.compact);
      const pill = !sm
        ? '<span class="pill">no run stored</span>'
        : sm.state === 'running'
          ? `<span class="pill run" data-since="${esc(sm.timestamp.start)}">running ${elapsedText(Date.parse(sm.timestamp.start), Date.now(), tEn)}</span>`
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
      p.textContent = 'running ' + elapsedText(Date.parse(p.dataset.since), Date.now(), tEn);
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
        fontFamily: this.css('--f-body') || 'Manrope, sans-serif',
        themeVariables: {
          fontFamily: this.css('--f-body') || 'Manrope, sans-serif',
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
      off: mixHex(this.css('--fg3'), this.css('--card'), 0.45),
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
