// The registry of the panel's ten subjects, in rail order: the rail, the phone's bar and the panes are drawn from it.
// Pattern: registry (Fowler, Patterns of Enterprise Application Architecture, Registry) of plug-ins (Plugin): adding a
// subject is one folder and one line here, and a move replaces its legacyFeature(...) line with the feature's own.
// Must not: hold state, know the guest (a descriptor reads it through its env), or list a subject twice.
import type {FeatureDescriptor, FeatureKey} from './feature.ts';
import {legacyFeature} from './legacy-feature.ts';

export const FEATURES: readonly FeatureDescriptor[] = [
  legacyFeature('home', {
    icon: 'house',
    color: 'var(--c-grid)',
    phoneBar: true,
    header: {subId: 'hsub'},
    hosts: [
      '<div class="cfgerrh" id="cfgerr" hidden></div>',
      '<div class="card hwx" id="hwx"></div>',
      '<div class="hright"><div class="htiles" id="htiles"></div><div class="card hsec" id="hsec"></div></div>',
      '<div class="hscenes" id="hscenes" hidden></div>',
    ],
  }),
  legacyFeature('lights', {
    icon: 'bulb',
    color: 'var(--warn)',
    phoneBar: true,
    header: {
      subId: 'lsub',
      extra:
        '<div class="ledbar" id="ledbar" hidden><button type="button" class="more" id="lreset" hidden>Reset order</button><button type="button" class="more" id="ledit" aria-pressed="false">Arrange</button></div>',
    },
    hosts: [
      '<div class="card" id="albar" hidden></div>',
      '<div class="ltiles" id="ltiles"></div>',
      '<div id="lhost"></div>',
    ],
  }),
  legacyFeature('climate', {
    icon: 'therm',
    color: 'var(--c-wh)',
    phoneBar: true,
    header: {h2Id: 'ch2', subId: 'csub2', compact: true},
    hosts: ['<div class="ctiles2" id="ctiles2"></div>'],
  }),
  legacyFeature('weather', {
    icon: 'wx',
    color: 'var(--m-blue)',
    phoneBar: false,
    header: {h2Id: 'wh2', subId: 'wsub2', compact: true},
    hosts: ['<div id="wxhost"></div>', '<div class="wxtiles" id="wxtiles"></div>'],
  }),
  legacyFeature('car', {
    icon: 'car',
    color: 'var(--c-ev)',
    phoneBar: true,
    header: {h2Id: 'carh2', subId: 'carsub2', compact: true},
    hosts: ['<div id="carhost"></div>'],
  }),
  legacyFeature('energy', {
    icon: 'bolt',
    color: 'var(--c-grid)',
    phoneBar: false,
    header: {h2Id: 'eh2', subId: 'esub2', compact: true},
    hosts: ['<div id="ehost"></div>', '<div class="etiles" id="etiles"></div>', '<div class="eside" id="eside"></div>'],
  }),
  legacyFeature('air', {
    icon: 'aq',
    color: 'var(--ok)',
    phoneBar: false,
    header: {h2Id: 'ah2', subId: 'asub2', compact: true},
    hosts: ['<div id="airhost"></div>'],
  }),
  legacyFeature('media', {
    icon: 'tv',
    color: 'var(--c-home)',
    phoneBar: false,
    header: {subId: 'msub'},
    hosts: [
      '<div class="mtiles" id="mtiles"></div>',
      '<div class="card" id="mtv" hidden></div>',
      '<div class="card" id="media"></div>',
    ],
  }),
  legacyFeature('cams', {
    icon: 'shield',
    color: 'var(--m-purple)',
    phoneBar: false,
    header: {subId: 'cmsub'},
    hosts: ['<div id="camhost"></div>', '<div id="senhost"></div>'],
  }),
  legacyFeature('auto', {
    icon: 'flow',
    color: 'var(--c-heat)',
    phoneBar: false,
    shortTitle: 'auto.short',
    header: {subId: 'ausub'},
    hosts: ['<div id="auhost"></div>'],
  }),
];

export const isFeatureKey = (value: string): value is FeatureKey => FEATURES.some(f => f.key === value);

/**
 * The tab to show: the one asked for when it is a subject of the panel and this house shows it, else Home. A subject
 * the shell has no answer for counts as shown, as `availability` does.
 */
export function visibleTab(tab: string, shown: Readonly<Partial<Record<FeatureKey, boolean>>>): FeatureKey {
  return isFeatureKey(tab) && shown[tab] !== false ? tab : 'home';
}
