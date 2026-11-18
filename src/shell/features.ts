// The registry of the panel's ten subjects, in rail order: the rail, the phone's bar and the panes are drawn from it.
// Pattern: registry (Fowler, Patterns of Enterprise Application Architecture, Registry) of plug-ins (Plugin): adding a
// subject is one folder and one line here; every subject is a feature's own descriptor since the Automations move (#273).
// `sidebarRows` orders them for the Liquid Glass sidebar (ADR 0038); the registry's own order is the rail's and the bar's.
// Must not: hold state, or list a subject twice.
import type {FeatureDescriptor, FeatureKey} from '../ui/feature.ts';
import {airFeature} from '../features/air/index.ts';
import {automationsFeature} from '../features/automations/index.ts';
import {carFeature} from '../features/car/index.ts';
import {climateFeature} from '../features/climate/index.ts';
import {energyFeature} from '../features/energy/index.ts';
import {lightsFeature} from '../features/lights/index.ts';
import {mediaFeature} from '../features/media/index.ts';
import {securityFeature} from '../features/security/index.ts';
import {weatherFeature} from '../features/weather/index.ts';
import {homeFeature} from './home-feature.ts';

export const FEATURES: readonly FeatureDescriptor[] = [
  homeFeature,
  lightsFeature,
  climateFeature,
  weatherFeature,
  carFeature,
  energyFeature,
  airFeature,
  mediaFeature,
  securityFeature,
  automationsFeature,
];

/** The sections the phone's bar does not hold, which its More sheet lists, in rail order. */
export const UNDER_MORE: readonly FeatureDescriptor[] = FEATURES.filter(f => !f.phoneBar);

export const isFeatureKey = (value: string): value is FeatureKey => FEATURES.some(f => f.key === value);

/**
 * The tab to show: the one asked for when it is a subject of the panel and this house shows it, else Home. A subject
 * the shell has no answer for counts as shown, as `availability` does.
 */
export function visibleTab(tab: string, shown: Readonly<Partial<Record<FeatureKey, boolean>>>): FeatureKey {
  return isFeatureKey(tab) && shown[tab] !== false ? tab : 'home';
}

/** The heading row of the Liquid Glass sidebar, between its first group and the categories. */
export const CATEGORIES = Symbol('categories');

/** The two sections the sidebar lists before its Categories heading, in order. */
const SIDEBAR_FIRST: readonly FeatureKey[] = ['home', 'auto'];

/**
 * The rows of the Liquid Glass sidebar (ADR 0038): Home and Automations, the Categories heading, then every other section in rail order.
 * The DOM follows this order, so the keyboard walks the rows as the eye does; Material's rail and the phone's bar keep `features` as it is.
 */
export function sidebarRows(
  features: readonly FeatureDescriptor[],
): readonly (FeatureDescriptor | typeof CATEGORIES)[] {
  const first = SIDEBAR_FIRST.flatMap(key => features.filter(f => f.key === key));
  return [...first, CATEGORIES, ...features.filter(f => !SIDEBAR_FIRST.includes(f.key))];
}
