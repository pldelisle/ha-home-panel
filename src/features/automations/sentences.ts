// The words of a flow: one kind and one sentence for each trigger, condition and action of an automation's config, and the
// names, states, durations and templates they are made of.
// Pattern: pure functions from Home Assistant's config to catalog messages (Bernhardt, functional core), the rules of the
// legacy `auTrig()`, `auCond()`, `auAct()`, `auName()`, `auKind()`, `auState()`, `auTemplate()` and `auDur()`; the domains
// and services the panel names are the `automations.domain.*` and `automations.verb.*` keys (the legacy AU_DOMAIN, AU_VERB).
// Must not: read the clock or the DOM, or translate a name a person gave (names are values, through the resolver).
import {capitalWords} from '../../core/figures.ts';
import type {HassEntities} from '../../core/hass.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {Names} from '../../core/i18n/names.ts';
import {asList, triggerKind} from '../../providers/automations.ts';

export interface SentenceDeps {
  t: Translate;
  fmt: Formatters;
  states: HassEntities;
  names: Names;
}

/** A step's line: its small-caps kind (`kind` is the key it was worded from, null for a domain the panel has no word for) and its sentence. */
export interface Sentence {
  kind: MessageKey | null;
  k: string;
  t: string;
  /** `sub` for a script, drawn as a subroutine. */
  shape?: 'sub';
}

type Config = Record<string, unknown>;

/** The domains the panel has a word for, the legacy AU_DOMAIN. */
const DOMAINS = {
  climate: 'automations.domain.climate',
  light: 'automations.domain.light',
  switch: 'automations.domain.switch',
  scene: 'automations.domain.scene',
  script: 'automations.domain.script',
  input_boolean: 'automations.domain.inputBoolean',
  notify: 'automations.domain.notify',
  media_player: 'automations.domain.mediaPlayer',
  fan: 'automations.domain.fan',
  adaptive_lighting: 'automations.domain.adaptiveLighting',
  homeassistant: 'automations.domain.homeassistant',
  persistent_notification: 'automations.domain.persistentNotification',
  shell_command: 'automations.domain.shellCommand',
  wake_on_lan: 'automations.domain.wakeOnLan',
  icloud: 'automations.domain.icloud',
  lock: 'automations.domain.lock',
  cover: 'automations.domain.cover',
  number: 'automations.domain.number',
} as const satisfies Record<string, MessageKey>;

/** The services the panel has a phrase for, the legacy AU_VERB. */
const VERBS = {
  turn_on: 'automations.verb.turnOn',
  turn_off: 'automations.verb.turnOff',
  toggle: 'automations.verb.toggle',
  media_stop: 'automations.verb.mediaStop',
  media_pause: 'automations.verb.mediaPause',
  media_play: 'automations.verb.mediaPlay',
  send_magic_packet: 'automations.verb.sendMagicPacket',
  reload_config_entry: 'automations.verb.reloadConfigEntry',
  restart: 'automations.verb.restart',
  update: 'automations.verb.update',
  apply: 'automations.verb.apply',
  create: 'automations.verb.create',
  lock: 'automations.verb.lock',
  unlock: 'automations.verb.unlock',
} as const satisfies Record<string, MessageKey>;

/**
 * A config value as text, as `String()` writes it: Home Assistant's configs are untyped, and a value meant as text may be
 * a number; an object (a mistake in the config) is written as JSON rather than `[object Object]`.
 */
const str = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint' || v == null
      ? String(v)
      : JSON.stringify(v);

const own = <T extends object>(table: T, key: string): T[keyof T] | undefined =>
  Object.hasOwn(table, key) ? table[key as keyof T] : undefined;

/** An id or a word as a person reads it when the panel has no name for it: `front_door` is `Front door`. */
const idWords = (s: unknown): string => capitalWords(str(s || ''));

/** Runs of white space as one space, trimmed. */
const squash = (s: unknown): string =>
  str(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** At most `n` characters, the last one an ellipsis when it was longer. */
export const cut = (s: unknown, n = 64): string => {
  const text = squash(s);
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};

/** An alias without its `Group - ` prefix (`Heating - evening` is `evening`), when the prefix is short. */
export const shortAlias = (alias: unknown): string => {
  const a = str(alias || '');
  const i = a.indexOf(' - ');
  return i > 0 && i < 24 ? a.slice(i + 3) : a;
};

const isTemplate = (v: unknown): boolean => /\{\{|\{%/.test(str(v));

/** A list read with a word between each pair: `a or b or c`. */
const joined = (items: string[], key: MessageKey, t: Translate): string =>
  items.length ? items.reduce((a, b) => t(key, {a, b})) : '';

/** `00:15:00`, `{minutes: 5}` or `30` as `15 min`, `5 min`, `30 s`; a template as `a while`; nothing as ''. */
export function durationText(d: unknown, deps: Pick<SentenceDeps, 't' | 'fmt'>): string {
  if (d == null || d === '') return '';
  let s: number;
  if (typeof d === 'number') s = d;
  else if (typeof d === 'string') {
    if (/\{\{/.test(d)) return deps.t('automations.duration', {unit: 'template', n: ''});
    const p = d.split(':').map(Number);
    s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : Number(d);
  } else {
    const o = d as Record<string, number | undefined>;
    s = (o.days ?? 0) * 86400 + (o.hours ?? 0) * 3600 + (o.minutes ?? 0) * 60 + (o.seconds ?? 0);
  }
  if (!Number.isFinite(s)) return '';
  return s >= 3600
    ? deps.t('automations.duration', {unit: 'hours', n: deps.fmt.number(Number((s / 3600).toFixed(1)))})
    : s >= 60
      ? deps.t('automations.duration', {unit: 'minutes', n: deps.fmt.integer(Math.round(s / 60))})
      : deps.t('automations.duration', {unit: 'seconds', n: deps.fmt.number(s, 2)});
}

/**
 * A config's clock time (`18:00:00`) as hours and minutes, `18:00`: the 24-hour form `time24` writes in every language (the
 * format table asks for `16:07`), cut from Home Assistant's own text so no zone can move it.
 */
const clockText = (v: unknown): string => str(v).slice(0, 5);

/** `text` followed by its `for` duration, when it has one. */
const lasting = (text: string, d: unknown, deps: SentenceDeps): string =>
  d ? deps.t('automations.text.for', {text, duration: durationText(d, deps)}) : text;

/** What an entity is, as far as the words go: `door`, `motion`, or its domain. */
function kindOf(id: unknown, states: HassEntities): string {
  const entity = str(id || '');
  const dc = str(states[entity]?.attributes.device_class ?? '');
  if (/door|window|opening|garage_door/.test(dc) || /_door$/.test(entity)) return 'door';
  if (/motion|occupancy|presence/.test(dc) || /_(motion|occupancy)(_\d+)?$/.test(entity)) return 'motion';
  return entity.split('.')[0];
}

/** An entity as a person reads it: its name without a trailing `Door`, `Occupancy` or `Motion`, or a word for a template or `all`. */
export function nameOf(id: unknown, deps: SentenceDeps): string {
  if (!id) return '';
  const entity = str(id);
  if (isTemplate(entity)) {
    const v = /^\{\{\s*(\w+)\s*\}\}$/.exec(entity.trim());
    return v ? deps.t('automations.name.variable', {name: v[1]}) : deps.t('automations.name.chosen');
  }
  if (entity === 'all') return deps.t('automations.name.everyLight');
  if (entity === 'zone.home') return deps.t('automations.name.homeZone');
  if (deps.states[entity]?.attributes.friendly_name)
    return deps.names.name(entity).replace(/\s+(Door|Occupancy|Motion)$/i, '');
  return idWords(entity.split('.').pop());
}

/** One or more entities: `a or b`, and from three on `a, b +1`. */
function namesOf(ids: unknown, deps: SentenceDeps, word: 'or' | 'and' = 'or'): string {
  const names = asList(ids).map(i => nameOf(i, deps));
  if (names.length > 2)
    return deps.t('automations.names.more', {first: names[0], second: names[1], n: names.length - 2});
  return joined(names, word === 'or' ? 'automations.list.or' : 'automations.list.and', deps.t);
}

/** A state as words: a door is open or closed, a motion sensor sees motion or is clear; `opened` and `detects motion` for a change. */
function stateText(id: unknown, value: unknown, deps: SentenceDeps, change = false): string {
  const kind = kindOf(asList(id)[0], deps.states);
  const one = (raw: unknown): string => {
    const x = str(raw);
    if (kind === 'door' && x === 'on') return deps.t(change ? 'automations.state.opened' : 'automations.state.open');
    if (kind === 'door' && x === 'off') return deps.t('automations.state.closed');
    if (kind === 'motion' && x === 'on')
      return deps.t(change ? 'automations.state.detectsMotion' : 'automations.state.motion');
    if (kind === 'motion' && x === 'off') return deps.t('automations.state.clear');
    if (kind === 'climate' && x === 'fan_only') return deps.t('automations.state.fanOnly');
    // a door's or a motion sensor's other states are read as Home Assistant writes them, as the legacy panel did
    return kind === 'door' || kind === 'motion' ? x : x.replace(/_/g, ' ');
  };
  const values = asList(value).map(one);
  return joined(values, 'automations.list.or', deps.t);
}

/** A Jinja template read as a sentence, as far as its common shapes go; at most 70 characters. */
function templateText(template: unknown, deps: SentenceDeps): string {
  let s = str(template ?? '');
  if (/next_rising.*next_midnight|next_midnight.*next_rising/s.test(s))
    return deps.t('automations.template.solarNight');
  const is = (id: string, v: string) =>
    deps.t('automations.template.is', {name: nameOf(id, deps), state: stateText(id, v, deps)});
  s = s
    .replace(/\{%.*?%\}/gs, ' ')
    .replace(/\{\{|\}\}/g, '')
    .replace(/not is_state\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g, (_, id: string, v: string) =>
      deps.t('automations.template.isNot', {name: nameOf(id, deps), state: stateText(id, v, deps)}),
    )
    .replace(/is_state\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g, (_, id: string, v: string) => is(id, v))
    .replace(/not is_state\(\s*trigger\.entity_id\s*,\s*'on'\s*\)/g, deps.t('automations.template.doorCloses'))
    .replace(/is_state\(\s*trigger\.entity_id\s*,\s*'on'\s*\)/g, deps.t('automations.template.doorOpen'))
    .replace(
      /state_attr\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g,
      (_, id: string, a: string) => `${nameOf(id, deps)} ${a.replace(/_/g, ' ')}`,
    )
    .replace(/state_attr\(\s*(\w+)\s*,\s*'([^']+)'\s*\)/g, (_, v: string, a: string) => `${v} ${a.replace(/_/g, ' ')}`)
    .replace(/states\(\s*'([^']+)'\s*\)/g, (_, id: string) => nameOf(id, deps))
    .replace(/\|\s*(float|int|default|round|lower|string)(\([^)]*\))?/g, '')
    .replace(/>=/g, '≥')
    .replace(/<=/g, '≤')
    .replace(/==/g, '=')
    .replace(/!=/g, '≠')
    .replace(/not wait\.completed\b/g, deps.t('automations.template.waitTimedOut'))
    .replace(/\bwait\.completed\b/g, deps.t('automations.template.waitFinished'))
    .replace(/\brepeat\.index\b/g, deps.t('automations.template.try'))
    .replace(/'([^']*)'/g, (_, x: string) => x.replace(/_/g, ' '))
    .replace(/[()[\]]/g, ' ')
    .replace(/\b(and|or)\b/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
  return cut(s || deps.t('automations.template.fallback'), 70);
}

/** `name > 5`, `name attribute < 9`, `name > 5 and < 9`: a numeric check's words. */
function valueText(c: Config, attribute: string, deps: SentenceDeps): string {
  const range =
    c.above != null && c.below != null
      ? deps.t('automations.value.between', {above: str(c.above), below: str(c.below)})
      : c.above != null
        ? deps.t('automations.value.above', {n: str(c.above)})
        : c.below != null
          ? deps.t('automations.value.below', {n: str(c.below)})
          : '';
  const names = namesOf(c.entity_id, deps);
  return deps.t('automations.value.check', {name: attribute ? `${names} ${attribute}` : names, range});
}

/** The words for what Home Assistant counts at home: nobody, someone arriving, or a number of people. */
function presenceText(c: Config, deps: SentenceDeps): string {
  if (c.below != null && Number(c.below) <= 1) return deps.t('automations.presence.nobody');
  if (c.above != null && Number(c.above) === 0) return deps.t('automations.presence.someoneComes');
  return c.below != null
    ? deps.t('automations.presence.fewer', {n: str(c.below)})
    : deps.t('automations.presence.more', {n: str(c.above)});
}

const sentence = (kind: MessageKey, t: string, deps: SentenceDeps): Sentence => ({kind, k: deps.t(kind), t});

/** The kind of a step that acts on a domain: the panel's word for it, or the domain itself. */
function domainKind(domain: string, t: string, deps: SentenceDeps): Sentence {
  const key = own(DOMAINS, domain);
  return key ? sentence(key, t, deps) : {kind: null, k: idWords(domain), t};
}

/** The kind of a state check or trigger on an entity: a door, a motion sensor, or its domain. */
const entityKind = (kind: string, door: MessageKey, motion: MessageKey, t: string, deps: SentenceDeps): Sentence =>
  kind === 'door' ? sentence(door, t, deps) : kind === 'motion' ? sentence(motion, t, deps) : domainKind(kind, t, deps);

/** A trigger's line. */
export function triggerText(trigger: Config, deps: SentenceDeps): Sentence {
  const tr = trigger;
  if (tr.alias) return sentence('automations.kind.trigger', str(tr.alias), deps);
  const p = triggerKind(tr);
  const first = str(asList(tr.entity_id)[0] ?? '');
  if (p === 'state') {
    const names = namesOf(tr.entity_id, deps);
    if (tr.to != null) {
      const kind = kindOf(first, deps.states);
      const text =
        kind === 'door' || kind === 'motion'
          ? deps.t('automations.trigger.becomes', {name: names, state: stateText(tr.entity_id, tr.to, deps, true)})
          : deps.t('automations.trigger.changesTo', {name: names, state: stateText(tr.entity_id, tr.to, deps)});
      return entityKind(kind, 'automations.kind.door', 'automations.kind.motion', lasting(text, tr.for, deps), deps);
    }
    if (tr.attribute)
      return sentence(
        'automations.kind.state',
        deps.t('automations.trigger.attributeChanges', {
          name: names,
          attribute: str(tr.attribute).replace(/_/g, ' '),
        }),
        deps,
      );
    return /^event\./.test(first)
      ? sentence(
          'automations.kind.button',
          lasting(deps.t('automations.trigger.pressed', {name: names}), tr.for, deps),
          deps,
        )
      : sentence(
          'automations.kind.state',
          lasting(deps.t('automations.trigger.changes', {name: names}), tr.for, deps),
          deps,
        );
  }
  if (p === 'numeric_state') {
    if (tr.entity_id === 'zone.home')
      return sentence('automations.kind.presence', lasting(presenceText(tr, deps), tr.for, deps), deps);
    return sentence(
      'automations.kind.value',
      lasting(valueText(tr, tr.attribute ? str(tr.attribute) : '', deps), tr.for, deps),
      deps,
    );
  }
  if (p === 'time')
    return sentence(
      'automations.kind.time',
      asList(tr.at)
        .map(a => (/^\d/.test(str(a)) ? clockText(a) : nameOf(a, deps)))
        .join(', '),
      deps,
    );
  if (p === 'time_pattern') {
    const every = (unit: string, v: unknown) => deps.t('automations.duration', {unit, n: str(v).replace('/', '')});
    return sentence(
      'automations.kind.every',
      tr.minutes
        ? every('minutes', tr.minutes)
        : tr.hours
          ? every('hours', tr.hours)
          : tr.seconds
            ? every('seconds', tr.seconds)
            : deps.t('automations.trigger.pattern'),
      deps,
    );
  }
  if (p === 'sun') {
    const event = tr.event === 'sunrise' ? 'sunrise' : 'sunset';
    return sentence(
      'automations.kind.sun',
      tr.offset
        ? deps.t('automations.trigger.sunOffset', {event, offset: str(tr.offset)})
        : deps.t('automations.trigger.sun', {event}),
      deps,
    );
  }
  if (p === 'homeassistant')
    return sentence(
      'automations.kind.system',
      deps.t('automations.trigger.homeAssistant', {event: tr.event === 'shutdown' ? 'shutdown' : 'start'}),
      deps,
    );
  if (p === 'event')
    return sentence(
      'automations.kind.event',
      tr.event_type === 'automation_reloaded' ? deps.t('automations.trigger.reloaded') : idWords(tr.event_type),
      deps,
    );
  if (p === 'template')
    return sentence('automations.kind.when', lasting(templateText(tr.value_template, deps), tr.for, deps), deps);
  if (p === 'zone')
    return sentence(
      'automations.kind.zone',
      deps.t('automations.trigger.zone', {
        name: namesOf(tr.entity_id, deps),
        event: tr.event === 'leave' ? 'leave' : 'enter',
        zone: nameOf(tr.zone, deps),
      }),
      deps,
    );
  if (/turn_on$/.test(str(p ?? '')))
    return sentence(
      'automations.kind.request',
      deps.t('automations.trigger.askedToTurnOn', {name: namesOf(tr.entity_id, deps)}),
      deps,
    );
  return sentence('automations.kind.trigger', p ? idWords(p) : deps.t('automations.kind.trigger'), deps);
}

/** A condition's line; a bare string is a template. */
export function conditionText(condition: Config | string, deps: SentenceDeps): Sentence {
  if (typeof condition === 'string') return sentence('automations.kind.check', templateText(condition, deps), deps);
  const c = condition;
  if (c.alias) return sentence('automations.kind.check', str(c.alias), deps);
  const p = c.condition;
  if (p === 'state') {
    if (c.entity_id === 'zone.home')
      return sentence(
        'automations.kind.presence',
        lasting(
          str(c.state) === '0'
            ? deps.t('automations.presence.nobody')
            : deps.t('automations.presence.atHome', {n: str(c.state)}),
          c.for,
          deps,
        ),
        deps,
      );
    const ids = asList(c.entity_id);
    const text = deps.t('automations.condition.state', {
      name: namesOf(c.entity_id, deps, 'and'),
      many: ids.length > 1 ? 'yes' : 'no',
      state: stateText(c.entity_id, c.state, deps),
    });
    const withAttribute = c.attribute
      ? deps.t('automations.condition.attribute', {text, attribute: str(c.attribute)})
      : text;
    return entityKind(
      kindOf(ids[0], deps.states),
      'automations.kind.doors',
      'automations.kind.motion',
      lasting(withAttribute, c.for, deps),
      deps,
    );
  }
  if (p === 'numeric_state')
    return sentence(
      'automations.kind.value',
      valueText(c, c.attribute ? str(c.attribute).replace(/_/g, ' ') : '', deps),
      deps,
    );
  if (p === 'trigger')
    return sentence(
      'automations.kind.startedBy',
      deps.t('automations.condition.trigger', {
        ids: joined(
          // no id reads as an empty quote, as the legacy panel drew it
          (asList(c.id).length ? asList(c.id) : ['']).map(id => deps.t('automations.quoted', {text: str(id)})),
          'automations.list.or',
          deps.t,
        ),
      }),
      deps,
    );
  if (p === 'time' || p === 'sun') {
    // the sun's `after: sunset` is a word of Home Assistant's
    const at = (v: unknown) => (p === 'time' ? clockText(v) : str(v));
    const parts = [
      c.after ? deps.t('automations.condition.after', {time: at(c.after)}) : '',
      c.before ? deps.t('automations.condition.before', {time: at(c.before)}) : '',
      p === 'time' && c.weekday ? asList(c.weekday).map(str).join(', ') : '',
    ].filter(Boolean);
    return sentence(
      p === 'time' ? 'automations.kind.time' : 'automations.kind.sun',
      joined(parts, 'automations.list.and', deps.t),
      deps,
    );
  }
  if (p === 'template') return sentence('automations.kind.check', templateText(c.value_template, deps), deps);
  if (p === 'or' || p === 'and' || p === 'not') {
    const texts = asList(c.conditions).map(x => conditionText(x as Config | string, deps).t);
    return sentence(
      p === 'or' ? 'automations.kind.anyOf' : p === 'and' ? 'automations.kind.allOf' : 'automations.kind.noneOf',
      joined(texts, p === 'or' ? 'automations.list.any' : 'automations.list.all', deps.t),
      deps,
    );
  }
  return sentence('automations.kind.check', p ? idWords(p) : deps.t('automations.condition.unnamed'), deps);
}

/** A service call's line. */
function callText(action: Config, service: string, deps: SentenceDeps): Sentence {
  const [d, s] = service.split('.');
  const data = (action.data ?? {}) as Config;
  // `||`, as the legacy rule had it: an empty target falls through to the data's
  const target = (action.target as Config | undefined)?.entity_id || data.entity_id || action.entity_id;
  const names = namesOf(target, deps);
  const named = (key: MessageKey, values: Record<string, string> = {}) => deps.t(key, {name: names, ...values});
  if (d === 'script' && s !== 'turn_on')
    return {...sentence('automations.domain.script', shortAlias(nameOf(`script.${s}`, deps)), deps), shape: 'sub'};
  if (d === 'notify')
    return sentence(
      'automations.domain.notify',
      data.title
        ? deps.t('automations.action.notifyTitled', {title: str(data.title)})
        : deps.t('automations.action.notify'),
      deps,
    );
  if (d === 'persistent_notification')
    return sentence(
      'automations.domain.persistentNotification',
      data.title ? str(data.title) : deps.t('automations.action.inHomeAssistant'),
      deps,
    );
  if (d === 'scene' && s === 'create')
    return sentence(
      'automations.kind.snapshot',
      deps.t('automations.action.remember', {name: namesOf(data.snapshot_entities, deps)}),
      deps,
    );
  if (d === 'scene' && s === 'turn_on') return sentence('automations.domain.scene', names, deps);
  if (s === 'set_temperature')
    return sentence(
      'automations.domain.climate',
      isTemplate(data.temperature)
        ? named('automations.action.setTemperatureScheduled')
        : named('automations.action.setTemperature', {temperature: str(data.temperature)}),
      deps,
    );
  if (s === 'set_hvac_mode')
    return sentence(
      'automations.domain.climate',
      named('automations.action.mode', {mode: str(data.hvac_mode).replace(/_/g, ' ')}),
      deps,
    );
  if (s === 'set_fan_mode')
    return sentence('automations.domain.climate', named('automations.action.fan', {mode: str(data.fan_mode)}), deps);
  if (s === 'set_swing_mode')
    return sentence(
      'automations.domain.climate',
      named('automations.action.swing', {mode: str(data.swing_mode).replace(/_/g, ' ')}),
      deps,
    );
  if (d === 'adaptive_lighting' && s === 'set_manual_control')
    return sentence(
      'automations.domain.adaptiveLighting',
      deps.t('automations.action.manualControl', {
        manual: data.manual_control ? 'yes' : 'no',
        lights: isTemplate(data.lights) ? deps.t('automations.name.thatLight') : namesOf(data.lights, deps),
      }),
      deps,
    );
  if (d === 'light' && s === 'turn_on' && data.brightness_pct != null)
    return sentence(
      'automations.domain.light',
      isTemplate(data.brightness_pct)
        ? named('automations.action.brightnessStep')
        : named('automations.action.brightness', {pct: str(data.brightness_pct)}),
      deps,
    );
  if (d === 'input_boolean')
    return sentence(
      'automations.domain.inputBoolean',
      named('automations.action.helper', {state: s === 'turn_on' ? 'on' : s === 'turn_off' ? 'off' : 'toggle'}),
      deps,
    );
  if (d === 'shell_command') return sentence('automations.domain.shellCommand', idWords(s), deps);
  if (d === 'homeassistant' && s === 'reload_config_entry')
    return sentence('automations.kind.system', deps.t('automations.verb.reloadConfigEntry'), deps);
  const verbKey = own(VERBS, s);
  const verb = verbKey ? deps.t(verbKey) : idWords(s);
  return domainKind(d, target ? deps.t('automations.action.verbTarget', {verb, name: names}) : verb, deps);
}

/** An action's line: a service call, a wait, a check, a repeat or another step. */
export function actionText(action: Config, deps: SentenceDeps): Sentence {
  const a = action;
  if (a.alias) return sentence('automations.kind.step', str(a.alias), deps);
  // `||`, as the legacy panel: an empty `action` falls back to `service`
  const service = a.action || a.service;
  if (service) return callText(a, str(service), deps);
  const upTo = (text: string) =>
    a.timeout ? deps.t('automations.action.upTo', {text, duration: durationText(a.timeout, deps)}) : text;
  if (a.delay != null)
    return sentence(
      'automations.kind.delay',
      deps.t('automations.action.wait', {duration: durationText(a.delay, deps)}),
      deps,
    );
  if (a.wait_template != null)
    return sentence(
      'automations.kind.wait',
      upTo(deps.t('automations.action.until', {text: templateText(a.wait_template, deps)})),
      deps,
    );
  if (a.wait_for_trigger) {
    const texts = asList(a.wait_for_trigger).map(x => triggerText(x as Config, deps).t);
    return sentence('automations.kind.waitFor', upTo(joined(texts, 'automations.list.or', deps.t)), deps);
  }
  if (a.stop != null)
    return sentence('automations.kind.stop', a.stop ? str(a.stop) : deps.t('automations.action.stopHere'), deps);
  if (a.condition) return conditionText(a, deps);
  if (a.variables) return sentence('automations.kind.variables', Object.keys(a.variables).join(', '), deps);
  if (a.event) return sentence('automations.kind.event', str(a.event), deps);
  if (a.repeat) {
    const r = a.repeat as Config;
    const checks = (list: unknown) =>
      joined(
        asList(list).map(c => conditionText(c as Config | string, deps).t),
        'automations.list.and',
        deps.t,
      );
    return sentence(
      'automations.kind.repeat',
      r.until
        ? deps.t('automations.action.repeatUntil', {checks: checks(r.until)})
        : r.while
          ? deps.t('automations.action.repeatWhile', {checks: checks(r.while)})
          : r.count
            ? deps.t('automations.action.repeatCount', {count: str(r.count)})
            : deps.t('automations.action.repeatEach'),
      deps,
    );
  }
  if (a.parallel)
    return sentence(
      'automations.kind.parallel',
      deps.t('automations.action.branches', {n: asList(a.parallel).length}),
      deps,
    );
  const first = Object.keys(a)[0];
  return sentence('automations.kind.step', first ?? deps.t('automations.action.unnamed'), deps);
}
