// ---------- Automations tab: what ran today, and each run drawn as a flow (v1.14) ----------
// Data comes from Home Assistant itself: the automation's own config (automation/config), and its traces
// (trace/list, trace/get), which record which trigger fired, each condition's result and each step's time.
// The graph is laid out by Mermaid (from npm, in lazy chunks imported only when the tab opens);
// the path a run took is lit green, the step it is waiting on amber, a failed check red, the rest dashed grey.
import {getHass, getTZ, st, ok, attr, esc, cap, plural, localDay, fmtDate, tile} from './legacy/globals.js';

// Mermaid is imported the first time a flow is drawn, so the bundle the other tabs load does not carry it; Vite emits
// it as chunks under chunks/, beside home-panel.js. One import for every panel on the page.
let mermaidP;
const loadMermaid = () => (mermaidP ??= import('mermaid').then(m => m.default));

const AU_DOMAIN = {
  climate: 'Climate',
  light: 'Light',
  switch: 'Switch',
  scene: 'Scene',
  script: 'Script',
  input_boolean: 'Helper',
  notify: 'Notify',
  media_player: 'Media',
  fan: 'Fan',
  adaptive_lighting: 'Adaptive Lighting',
  homeassistant: 'Home Assistant',
  persistent_notification: 'Notification',
  shell_command: 'Command',
  wake_on_lan: 'Wake-on-LAN',
  icloud: 'iCloud',
  lock: 'Lock',
  cover: 'Cover',
  number: 'Number',
};
const AU_VERB = {
  turn_on: 'Turn on',
  turn_off: 'Turn off',
  toggle: 'Toggle',
  media_stop: 'Stop',
  media_pause: 'Pause',
  media_play: 'Play',
  send_magic_packet: 'Send magic packet',
  reload_config_entry: 'Reload the integration',
  restart: 'Restart Home Assistant',
  update: 'Refresh locations',
  apply: 'Apply for the time of day',
  create: 'Notification',
  lock: 'Lock',
  unlock: 'Unlock',
};
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
const auArr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const auTxt = s =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const auCut = (s, n = 64) => ((s = auTxt(s)).length > n ? s.slice(0, n - 1) + '…' : s);
// "00:15:00", {minutes: 5}, 30 → "15 min", "5 min", "30 s"
const auDur = d => {
  if (d == null || d === '') return '';
  let s = 0;
  if (typeof d === 'number') s = d;
  else if (typeof d === 'string') {
    if (/\{\{/.test(d)) return 'a while';
    const p = d.split(':').map(Number);
    s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : +d;
  } else s = (d.days || 0) * 86400 + (d.hours || 0) * 3600 + (d.minutes || 0) * 60 + (d.seconds || 0);
  if (!Number.isFinite(s)) return '';
  return s >= 3600
    ? `${+(s / 3600).toFixed(1).replace(/\.0$/, '')} h`
    : s >= 60
      ? `${Math.round(s / 60)} min`
      : `${s} s`;
};
const auClock = t =>
  new Date(t).toLocaleTimeString('en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: getTZ(),
  });
const auHM = t =>
  new Date(t)
    .toLocaleTimeString('en-CA', {hour: '2-digit', minute: '2-digit', hour12: false, timeZone: getTZ()})
    .replace(/^24/, '00');
const auMins = t => {
  const [h, m] = auHM(t).split(':').map(Number);
  return h * 60 + m;
};
const auShortAlias = a => {
  a = String(a || '');
  const i = a.indexOf(' - ');
  return i > 0 && i < 24 ? a.slice(i + 3) : a;
};

export const autoMethods = {
  // ---------- names in plain words ----------
  auName(id) {
    if (!id) return '';
    if (/\{\{|\{%/.test(id)) {
      const v = /^\{\{\s*(\w+)\s*\}\}$/.exec(String(id).trim());
      return v ? 'the ' + v[1] : 'the chosen one';
    }
    if (id === 'all') return 'every light';
    if (id === 'zone.home') return 'Home zone';
    const s = st(id);
    if (s && s.attributes.friendly_name)
      return String(s.attributes.friendly_name).replace(/\s+(Door|Occupancy|Motion)$/i, '');
    return cap(String(id).split('.').pop());
  },
  auNames(ids) {
    const a = auArr(ids).map(i => this.auName(i));
    return a.length > 2 ? `${a.slice(0, 2).join(', ')} +${a.length - 2}` : a.join(' or ');
  },
  auKind(id) {
    const s = st(id),
      dc = s && s.attributes.device_class;
    const d = String(id || '').split('.')[0];
    if (/door|window|opening|garage_door/.test(dc || '') || /_door$/.test(id)) return 'door';
    if (/motion|occupancy|presence/.test(dc || '') || /_(motion|occupancy)(_\d+)?$/.test(id)) return 'motion';
    return d;
  },
  auState(id, v, verb) {
    const k = this.auKind(auArr(id)[0]),
      vs = auArr(v);
    const one = x => {
      x = String(x);
      if (k === 'door') return x === 'on' ? (verb ? 'opened' : 'open') : x === 'off' ? (verb ? 'closed' : 'closed') : x;
      if (k === 'motion')
        return x === 'on' ? (verb ? 'detects motion' : 'motion') : x === 'off' ? (verb ? 'clear' : 'clear') : x;
      if (k === 'climate' && x === 'fan_only') return 'fan only';
      return x.replace(/_/g, ' ');
    };
    return vs.map(one).join(' or ');
  },
  auTemplate(t) {
    let s = String(t ?? '');
    if (/next_rising.*next_midnight|next_midnight.*next_rising/s.test(s)) return 'Between solar midnight and sunrise';
    s = s
      .replace(/\{%.*?%\}/gs, ' ')
      .replace(/\{\{|\}\}/g, '')
      .replace(
        /not is_state\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g,
        (m, id, v) => `${this.auName(id)} not ${this.auState(id, v)}`,
      )
      .replace(
        /is_state\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g,
        (m, id, v) => `${this.auName(id)} ${this.auState(id, v)}`,
      )
      .replace(/not is_state\(\s*trigger\.entity_id\s*,\s*'on'\s*\)/g, 'the door closes')
      .replace(/is_state\(\s*trigger\.entity_id\s*,\s*'on'\s*\)/g, 'the door is open')
      .replace(
        /state_attr\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g,
        (m, id, a) => `${this.auName(id)} ${a.replace(/_/g, ' ')}`,
      )
      .replace(/state_attr\(\s*(\w+)\s*,\s*'([^']+)'\s*\)/g, (m, v, a) => `${v} ${a.replace(/_/g, ' ')}`)
      .replace(/states\(\s*'([^']+)'\s*\)/g, (m, id) => this.auName(id))
      .replace(/\|\s*(float|int|default|round|lower|string)(\([^)]*\))?/g, '')
      .replace(/>=/g, '≥')
      .replace(/<=/g, '≤')
      .replace(/==/g, '=')
      .replace(/!=/g, '≠')
      .replace(/not wait\.completed\b/g, 'the wait timed out')
      .replace(/\bwait\.completed\b/g, 'the wait finished')
      .replace(/\brepeat\.index\b/g, 'try')
      .replace(/'([^']*)'/g, (m, x) => x.replace(/_/g, ' '))
      .replace(/[()[\]]/g, ' ')
      .replace(/\b(and|or)\b/g, ' $1 ')
      .replace(/\s+/g, ' ')
      .trim();
    return auCut(s || 'Template', 70);
  },
  // ---------- one line per trigger, condition, action: {k: small caps kind, t: the sentence} ----------
  auTrig(t) {
    if (t.alias) return {k: 'Trigger', t: t.alias};
    const p = t.trigger || t.platform,
      f = t.for ? ` for ${auDur(t.for)}` : '';
    if (p === 'state') {
      const n = this.auNames(t.entity_id);
      if (t.to != null) {
        const k = this.auKind(auArr(t.entity_id)[0]);
        return {
          k: k === 'door' ? 'Door' : k === 'motion' ? 'Motion' : AU_DOMAIN[k] || cap(k),
          t: `${n} ${k === 'door' || k === 'motion' ? this.auState(t.entity_id, t.to, true) : '→ ' + this.auState(t.entity_id, t.to)}${f}`,
        };
      }
      if (t.attribute) return {k: 'State', t: `${n} ${t.attribute.replace(/_/g, ' ')} changes`};
      return {
        k: /^event\./.test(auArr(t.entity_id)[0]) ? 'Button' : 'State',
        t: `${n} ${/^event\./.test(auArr(t.entity_id)[0]) ? 'pressed' : 'changes'}${f}`,
      };
    }
    if (p === 'numeric_state') {
      if (t.entity_id === 'zone.home')
        return {
          k: 'Presence',
          t:
            (t.below != null && +t.below <= 1
              ? 'Nobody home'
              : t.above != null && +t.above === 0
                ? 'Someone comes home'
                : `People home ${t.below != null ? '< ' + t.below : '> ' + t.above}`) + f,
        };
      return {
        k: 'Value',
        t: `${this.auNames(t.entity_id)}${t.attribute ? ' ' + t.attribute : ''} ${t.above != null ? '> ' + t.above : ''}${t.above != null && t.below != null ? ' and ' : ''}${t.below != null ? '< ' + t.below : ''}${f}`,
      };
    }
    if (p === 'time')
      return {
        k: 'Time',
        t: auArr(t.at)
          .map(a => (/^\d/.test(a) ? String(a).slice(0, 5) : this.auName(a)))
          .join(', '),
      };
    if (p === 'time_pattern')
      return {
        k: 'Every',
        t: t.minutes
          ? `${String(t.minutes).replace('/', '')} min`
          : t.hours
            ? `${String(t.hours).replace('/', '')} h`
            : t.seconds
              ? `${String(t.seconds).replace('/', '')} s`
              : 'pattern',
      };
    if (p === 'sun')
      return {k: 'Sun', t: `${t.event === 'sunrise' ? 'Sunrise' : 'Sunset'}${t.offset ? ' ' + t.offset : ''}`};
    if (p === 'homeassistant')
      return {k: 'System', t: t.event === 'shutdown' ? 'Home Assistant stops' : 'Home Assistant starts'};
    if (p === 'event')
      return {k: 'Event', t: t.event_type === 'automation_reloaded' ? 'Automations reloaded' : cap(t.event_type)};
    if (p === 'template') return {k: 'When', t: this.auTemplate(t.value_template) + f};
    if (p === 'zone')
      return {
        k: 'Zone',
        t: `${this.auNames(t.entity_id)} ${t.event === 'leave' ? 'leaves' : 'enters'} ${this.auName(t.zone)}`,
      };
    if (/turn_on$/.test(p || '')) return {k: 'Request', t: `${this.auNames(t.entity_id)} asked to turn on`};
    return {k: 'Trigger', t: cap(p || 'trigger')};
  },
  auCond(c) {
    if (typeof c === 'string') return {k: 'Check', t: this.auTemplate(c)};
    if (c.alias) return {k: 'Check', t: c.alias};
    const p = c.condition,
      f = c.for ? ` for ${auDur(c.for)}` : '';
    if (p === 'state') {
      if (c.entity_id === 'zone.home')
        return {k: 'Presence', t: String(c.state) === '0' ? `Nobody home${f}` : `${c.state} at home${f}`};
      const k = this.auKind(auArr(c.entity_id)[0]);
      return {
        k: k === 'door' ? 'Doors' : k === 'motion' ? 'Motion' : AU_DOMAIN[k] || cap(k),
        t: `${this.auNames(c.entity_id).replace(' or ', ' and ')} ${auArr(c.entity_id).length > 1 ? 'are' : 'is'} ${this.auState(c.entity_id, c.state)}${c.attribute ? ' (' + c.attribute + ')' : ''}${f}`,
      };
    }
    if (p === 'numeric_state')
      return {
        k: 'Value',
        t: `${this.auNames(c.entity_id)}${c.attribute ? ' ' + c.attribute.replace(/_/g, ' ') : ''} ${c.above != null ? '> ' + c.above : ''}${c.above != null && c.below != null ? ' and ' : ''}${c.below != null ? '< ' + c.below : ''}`,
      };
    if (p === 'trigger') return {k: 'Started by', t: `the “${auArr(c.id).join('” or “')}” trigger`};
    if (p === 'time')
      return {
        k: 'Time',
        t: [
          c.after ? `after ${String(c.after).slice(0, 5)}` : '',
          c.before ? `before ${String(c.before).slice(0, 5)}` : '',
          c.weekday ? auArr(c.weekday).join(', ') : '',
        ]
          .filter(Boolean)
          .join(' and '),
      };
    if (p === 'template') return {k: 'Check', t: this.auTemplate(c.value_template)};
    if (p === 'sun')
      return {
        k: 'Sun',
        t: [c.after ? `after ${c.after}` : '', c.before ? `before ${c.before}` : ''].filter(Boolean).join(' and '),
      };
    if (p === 'or' || p === 'and' || p === 'not')
      return {
        k: p === 'or' ? 'Any of' : p === 'and' ? 'All of' : 'None of',
        t: auArr(c.conditions)
          .map(x => this.auCond(x).t)
          .join(p === 'or' ? ' / ' : ' + '),
      };
    return {k: 'Check', t: cap(p || 'condition')};
  },
  auAct(a) {
    if (a.alias) return {k: 'Step', t: a.alias};
    const svc = a.action || a.service;
    if (svc) {
      const [d, s] = svc.split('.'),
        data = a.data || {},
        tg = (a.target && a.target.entity_id) || data.entity_id || a.entity_id,
        n = this.auNames(tg),
        tmpl = v => /\{\{|\{%/.test(String(v));
      if (d === 'script' && s !== 'turn_on')
        return {k: 'Script', t: auShortAlias(this.auName('script.' + s)), shape: 'sub'};
      if (d === 'notify') return {k: 'Notify', t: data.title ? `“${data.title}” to the phone` : 'Message to the phone'};
      if (d === 'persistent_notification') return {k: 'Notification', t: data.title || 'In Home Assistant'};
      if (d === 'scene' && s === 'create')
        return {k: 'Snapshot', t: `Remember ${this.auNames(data.snapshot_entities)}`};
      if (d === 'scene' && s === 'turn_on') return {k: 'Scene', t: n};
      if (s === 'set_temperature')
        return {k: 'Climate', t: `${n} → ${tmpl(data.temperature) ? 'by the schedule' : data.temperature + '°'}`};
      if (s === 'set_hvac_mode') return {k: 'Climate', t: `${n} mode ${String(data.hvac_mode).replace(/_/g, ' ')}`};
      if (s === 'set_fan_mode') return {k: 'Climate', t: `${n} fan ${data.fan_mode}`};
      if (s === 'set_swing_mode') return {k: 'Climate', t: `${n} swing ${String(data.swing_mode).replace(/_/g, ' ')}`};
      if (d === 'adaptive_lighting' && s === 'set_manual_control')
        return {
          k: 'Adaptive Lighting',
          t: `${data.manual_control ? 'Manual' : 'Back to Auto'} · ${tmpl(data.lights) ? 'that light' : this.auNames(data.lights)}`,
        };
      if (d === 'light' && s === 'turn_on' && data.brightness_pct != null)
        return {
          k: 'Light',
          t: `${n} brightness ${tmpl(data.brightness_pct) ? '± 5% per notch' : data.brightness_pct + '%'}`,
        };
      if (d === 'input_boolean')
        return {k: 'Helper', t: `${n} → ${s === 'turn_on' ? 'on' : s === 'turn_off' ? 'off' : 'toggle'}`};
      if (d === 'shell_command') return {k: 'Command', t: cap(s)};
      if (d === 'homeassistant' && s === 'reload_config_entry') return {k: 'System', t: 'Reload the integration'};
      return {k: AU_DOMAIN[d] || cap(d), t: `${AU_VERB[s] || cap(s)}${tg ? ' ' + n : ''}`};
    }
    if (a.delay != null) return {k: 'Delay', t: `Wait ${auDur(a.delay)}`};
    if (a.wait_template != null)
      return {
        k: 'Wait',
        t: `Until ${this.auTemplate(a.wait_template)}${a.timeout ? `, up to ${auDur(a.timeout)}` : ''}`,
      };
    if (a.wait_for_trigger)
      return {
        k: 'Wait for',
        t: `${auArr(a.wait_for_trigger)
          .map(x => this.auTrig(x).t)
          .join(' or ')}${a.timeout ? `, up to ${auDur(a.timeout)}` : ''}`,
      };
    if (a.stop != null) return {k: 'Stop', t: a.stop || 'Stop here'};
    if (a.condition) return this.auCond(a);
    if (a.variables) return {k: 'Variables', t: Object.keys(a.variables).join(', ')};
    if (a.event) return {k: 'Event', t: a.event};
    if (a.repeat)
      return {
        k: 'Repeat',
        t: a.repeat.until
          ? `until ${auArr(a.repeat.until)
              .map(c => this.auCond(c).t)
              .join(' and ')}`
          : a.repeat.while
            ? `while ${auArr(a.repeat.while)
                .map(c => this.auCond(c).t)
                .join(' and ')}`
            : a.repeat.count
              ? `${a.repeat.count} times`
              : 'for each',
      };
    if (a.parallel) return {k: 'In parallel', t: `${auArr(a.parallel).length} branches`};
    return {k: 'Step', t: Object.keys(a)[0] || 'step'};
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
      if (vis && e.timestamp) sub = auClock(e.timestamp);
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
        sub = 'waiting here' + (e && e.timestamp ? ' since ' + auHM(e.timestamp) : '');
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
      add(p, this.auTrig(t), 'stadium');
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
      const id = add(path, this.auCond(c));
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
                .map(c => this.auCond(c).t)
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
                .map(c => this.auCond(c).t)
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
        const id = add(path, this.auAct(a), 'round');
        chain(prev, id);
        const body = seq(a.repeat.sequence, `${path}/repeat/sequence`, [{id}]);
        body.forEach(x => link(x.id, id, 'again', 'loop'));
        return [{id}];
      }
      if (a && a.sequence && !a.action) return seq(a.sequence, `${path}/sequence`, prev);
      const d = this.auAct(a),
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
        firedNode && firedNode.d.k === 'Every'
          ? `Every ${firedNode.d.t}${started ? ', at ' + auHM(started) : ''}`
          : firedNode && firedNode.d.k === 'Time'
            ? `At ${firedNode.d.t}`
            : `${firedNode ? firedNode.d.t : cap((sum && sum.trigger) || 'Started')}${started ? ' at ' + auHM(started) : ''}`,
      );
      if (failed && exec === 'failed_conditions') parts.push(`stopped at “${auCut(failed.d.t, 60)}”`);
      else if (exec === 'failed_single' || exec === 'failed_max_runs') parts.push('skipped, it was already running');
      else if (nodes.some(n => /^condition\//.test(n.path))) parts.push('checks passed');
      if (waitN)
        parts.push(
          `now ${waitN.d.k === 'Delay' ? 'in a ' + waitN.d.t.toLowerCase() : 'waiting: ' + auCut(waitN.d.t, 60).toLowerCase()}`,
        );
      else if (exec === 'error') parts.push(`error${sum.error ? ': ' + auCut(sum.error, 60) : ''}`);
      else if (exec === 'finished' || exec === 'aborted' || exec === 'cancelled') {
        const fin = sum.timestamp && sum.timestamp.finish,
          d = fin && started ? (Date.parse(fin) - Date.parse(started)) / 1000 : null;
        parts.push(
          `${plural(ranActs, 'step')} ran${d == null ? '' : d < 1 ? ' at once' : ' in ' + (d < 60 ? Math.round(d) + ' s' : auDur(Math.round(d)))}${exec !== 'finished' ? ' (' + exec + ')' : ''}`,
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
    return Object.values(getHass().states)
      .filter(s => s.entity_id.startsWith('automation.'))
      .map(s => ({
        entity: s.entity_id,
        item: s.attributes.id,
        name: s.attributes.friendly_name || s.entity_id,
        on: s.state === 'on',
        last: s.attributes.last_triggered,
        current: +s.attributes.current || 0,
      }));
  },
  auNoise(sm) {
    // routine checks: the 5-minute iCloud refresh, and time-pattern re-checks that found nothing to do
    const cfg = this.auCfg[sm.item_id],
      trigs = cfg ? auArr(cfg.triggers || cfg.trigger) : [];
    if (trigs.length && trigs.every(t => (t.trigger || t.platform) === 'time_pattern')) return true;
    return /^time pattern/i.test(sm.trigger || '') && sm.script_execution === 'failed_conditions';
  },
  async auLoad(force) {
    if (this.auBusy || !getHass()) return;
    if (!force && Date.now() - (this.auAt || 0) < 20000) return;
    this.auBusy = true;
    this.auCfg = this.auCfg || {};
    this.auTr = this.auTr || {};
    try {
      const list = await getHass()
        .callWS({type: 'trace/list', domain: 'automation'})
        .catch(e => {
          this.auErr = e && (e.message || e.code);
          return null;
        });
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
          getHass()
            .callWS({type: 'automation/config', entity_id: a.entity})
            .then(r => {
              this.auCfg[a.item] = (r && r.config) || r || null;
            })
            .catch(() => {
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
          return getHass()
            .callWS({type: 'trace/get', domain: 'automation', item_id: sm.item_id, run_id: sm.run_id})
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
    const L = (this.auList || [])
      .filter(sm => !this.auNoise(sm))
      .sort((a, b) => Date.parse(b.timestamp.start) - Date.parse(a.timestamp.start));
    const sel = this.auSel
      ? this.auSel.run
        ? L.concat(this.auList || []).find(x => x.run_id === this.auSel.run && x.item_id === this.auSel.item)
        : L.concat(this.auList || [])
            .filter(x => x.item_id === this.auSel.item)
            .sort((a, b) => Date.parse(b.timestamp.start) - Date.parse(a.timestamp.start))[0]
      : null;
    const runN = L.find(x => x.state === 'running'),
      dec = L.find(x => x.script_execution === 'failed_conditions'),
      done = L.find(x => x.state !== 'running' && x.script_execution !== 'failed_conditions');
    return [sel, runN, dec, done];
  },
  // upcoming scheduled runs today, from time and sun triggers
  auUpcoming(cfgs, A) {
    const now = Date.now(),
      today = localDay(now),
      out = [],
      nowM = auMins(now);
    for (const a of A) {
      const cfg = cfgs[a.item];
      if (!cfg || !a.on) continue;
      for (const t of auArr(cfg.triggers || cfg.trigger)) {
        const p = t.trigger || t.platform;
        if (p === 'time')
          for (const at of auArr(t.at)) {
            const m = /^(\d{1,2}):(\d{2})/.exec(String(at));
            if (!m) continue;
            const mins = +m[1] * 60 + +m[2];
            if (mins > nowM) out.push({item: a.item, name: a.name, t: now + (mins - nowM) * 60000, mins});
          }
        if (p === 'sun') {
          const s = attr('sun.sun', t.event === 'sunrise' ? 'next_rising' : 'next_setting'),
            id = t.event === 'sunrise' ? 'sensor.sun_next_rising' : 'sensor.sun_next_setting',
            v = s || (ok(st(id)) ? st(id).state : null);
          if (v && localDay(Date.parse(v)) === today && Date.parse(v) > now)
            out.push({item: a.item, name: a.name, t: Date.parse(v), mins: auMins(v)});
        }
      }
    }
    return out.sort((x, y) => x.t - y.t);
  },
  // ---------- drawing ----------
  renderAuto() {
    if (this.view !== 'tabs' || this.tab !== 'auto' || !getHass()) return;
    const A = this.auAutos(),
      sig = A.map(a => a.entity + a.last + a.current + a.on).join('|');
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
    const midnight = Date.now() - auMins(Date.now()) * 60000 - new Date().getSeconds() * 1000;
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
    // Today timeline
    const up = this.auUpcoming(cfgs, A),
      nowM = auMins(Date.now());
    const dots = [
      ...today.map(sm => ({
        sm,
        mins: auMins(sm.timestamp.start),
        item: sm.item_id,
        name: (byItem[sm.item_id] || {}).name || sm.item_id,
      })),
      ...up.map(u => ({up: true, ...u})),
    ].sort((a, b) => a.mins - b.mins);
    // runs closer together than a dot is wide share one dot, with the count on it; the labels under the dots give the time only, on two rows
    const tlW = (this.$('auhost') || {}).clientWidth || this.$app.clientWidth || 800,
      gapPct = Math.max(2.2, 3000 / Math.max(tlW, 240));
    const groups = [];
    dots.forEach(d => {
      const g = groups[groups.length - 1],
        pct = (d.mins / 1440) * 100;
      if (g && pct - g.last < gapPct * 0.55) {
        g.items.push(d);
        g.last = pct;
      } else groups.push({pct, last: pct, items: [d]});
    });
    groups.forEach(g => {
      g.x = g.items.length > 1 ? (g.pct + g.last) / 2 : g.pct;
    });
    for (let i = 1; i < groups.length; i++) groups[i].x = Math.max(groups[i].x, groups[i - 1].x + gapPct);
    for (let i = groups.length - 1, r = 100 + gapPct; i >= 0; i--) {
      groups[i].x = Math.min(groups[i].x, r - gapPct);
      r = groups[i].x;
    }
    const clsOf = x =>
      x.up
        ? 'up'
        : x.sm.state === 'running'
          ? 'now'
          : x.sm.script_execution === 'failed_conditions'
            ? 'skip'
            : x.sm.script_execution === 'error'
              ? 'err'
              : '';
    const whatOf = c =>
      c === 'up'
        ? 'scheduled'
        : c === 'skip'
          ? 'checked, did nothing'
          : c === 'now'
            ? 'running'
            : c === 'err'
              ? 'error'
              : 'ran';
    const timeOf = x => (x.up ? auHM(x.t) : auHM(x.sm.timestamp.start));
    const rowEnd = [-99, -99];
    const dotsH = groups
      .map(g => {
        const items = g.items,
          d = items[0],
          n = items.length,
          pct = g.x;
        const all = items.map(clsOf),
          cls = all.includes('now')
            ? 'now'
            : all.includes('err')
              ? 'err'
              : all.every(c => c === 'skip')
                ? 'skip'
                : all.every(c => c === 'up')
                  ? 'up'
                  : '';
        const time = timeOf(d),
          time2 = timeOf(items[n - 1]),
          need = n > 1 ? 7.5 : 4.5;
        let row = rowEnd[0] < pct - need ? 0 : rowEnd[1] < pct - need ? 1 : -1;
        if (row >= 0) rowEnd[row] = pct;
        const desc =
          n > 1
            ? `${time} to ${time2} · ${plural(n, 'run')} · ${items.map(x => `${auShortAlias(x.name)}, ${whatOf(clsOf(x))}`).join(' · ')}`
            : `${time} ${d.name}, ${whatOf(cls)}`;
        const data = d.up ? `data-au="${esc(d.item)}"` : `data-run="${esc(d.sm.run_id)}" data-item="${esc(d.item)}"`;
        return `<button type="button" class="aud ${cls}" style="left:${pct.toFixed(2)}%" ${data} aria-label="${esc(desc)}" title="${esc(desc)}">${n > 1 ? `<span class="n">${n}</span>` : ''}</button>${row >= 0 ? `<span class="aul r${row}${cls === 'now' ? ' now' : cls === 'skip' ? ' skip' : ''}" style="left:${pct.toFixed(2)}%"><b>${n > 1 ? `${time}–${time2}` : time}</b></span>` : ''}`;
      })
      .join('');
    const nextUp = up[0],
      nextUp2 = up[1];
    const skipped = today.filter(sm => sm.script_execution === 'failed_conditions').length;
    const todayCard = `<section class="card autoday"><div class="shead"><div><h3>Today</h3><p>One dot per run, a number when several ran close together. Filled ran, ringed red checked and did nothing, green is running now, hollow is still to come. Tap one to draw it below.</p></div><span class="pill">${esc(new Date().toLocaleDateString('en-CA', {weekday: 'short', month: 'short', day: 'numeric', timeZone: getTZ()}))} · ${auHM(Date.now())}</span></div>
      <div class="autl"><div class="axis"></div><div class="past" style="width:${((nowM / 1440) * 100).toFixed(2)}%"></div><div class="nowl" style="left:${((nowM / 1440) * 100).toFixed(2)}%"></div>${[0, 6, 12, 18].map(h => `<span class="hr" style="left:${(h / 24) * 100}%">${String(h).padStart(2, '0')}:00</span>`).join('')}${dotsH}</div>
      <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))">${tile(['Ran today', runs.length, '', skipped ? `${skipped} more checked and did nothing` : 'every run passed its checks'])}${tile(['Next', nextUp ? auHM(nextUp.t) : '–', '', nextUp ? esc(auShortAlias(nextUp.name)) : 'nothing else scheduled today'])}${tile(['Then', nextUp2 ? auHM(nextUp2.t) : '–', '', nextUp2 ? esc(auShortAlias(nextUp2.name)) : '—'])}</div></section>`;
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
          ? `<span class="pill run" data-since="${esc(sm.timestamp.start)}">running ${this.auElapsed(sm.timestamp.start)}</span>`
          : sm.script_execution === 'failed_conditions'
            ? `<span class="pill no">stopped ${auHM(sm.timestamp.start)}</span>`
            : sm.script_execution === 'error'
              ? `<span class="pill no">error ${auHM(sm.timestamp.start)}</span>`
              : `<span class="pill ok">done ${sm.timestamp.finish ? auClock(sm.timestamp.finish) : auHM(sm.timestamp.start)}</span>`;
      const runsOf =
        kind === 'Selected'
          ? (this.auList || [])
              .filter(x => x.item_id === it)
              .sort((x, y) => Date.parse(y.timestamp.start) - Date.parse(x.timestamp.start))
              .slice(0, 8)
          : [];
      const picker =
        runsOf.length > 1
          ? `<div class="aupick">${runsOf.map(x => `<button type="button" class="chip${sm && x.run_id === sm.run_id ? ' sel' : ''}" data-run="${esc(x.run_id)}" data-item="${esc(it)}"><span class="dot" style="background:var(--${x.state === 'running' ? 'warn' : x.script_execution === 'failed_conditions' || x.script_execution === 'error' ? 'crit' : 'ok'})"></span>${localDay(Date.parse(x.timestamp.start)) === localDay(Date.now()) ? '' : esc(fmtDate(x.timestamp.start)) + ' '}${auHM(x.timestamp.start)}</button>`).join('')}</div>`
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
          `<button type="button" class="chip auchip${a.on ? '' : ' offa'}${this.auSel && this.auSel.item === a.item ? ' sel' : ''}" data-au="${esc(a.item || '')}"${a.item ? '' : ' disabled'}>${esc(a.name)}<small>${!a.on ? 'off' : a.current ? 'running' : a.last ? (localDay(lastOf(a)) === localDay(Date.now()) ? auHM(a.last) : fmtDate(a.last)) : 'never'}</small></button>`,
      )
      .join('');
    const all = `<section class="card"><div class="shead"><div><h3>Every automation</h3><p>Latest first. Tap one to draw its flow with its last run lit up.</p></div></div><div class="auchips">${chips}</div></section>`;
    this.set('auhost', todayCard + cards.join('') + all);
    this.auDraw();
    // the running pill counts up without redrawing the graph
    this.shadowRoot.querySelectorAll('#auhost .pill.run[data-since]').forEach(p => {
      p.textContent = 'running ' + this.auElapsed(p.dataset.since);
    });
  },
  auElapsed(t) {
    const s = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 1000));
    return s >= 3600
      ? `${Math.floor(s / 3600)} h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}`
      : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  async auDraw() {
    const boxes = [...this.shadowRoot.querySelectorAll('#auhost .augraph')].filter(
      b => b.dataset.drawn !== b.dataset.def,
    );
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
