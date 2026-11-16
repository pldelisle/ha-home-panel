// The header's fourteen Status checks: one named pure rule each over `LiveInputs`, in the legacy `attention()`'s order, and the fold.
// Pattern: Chain of Responsibility in its collecting form (Gamma et al.): `CHECKS` is the chain and `runChecks` asks every link,
// keeping each item and each "all is well" phrase in chain order; a link that returns null does not apply to this house.
// Must not: import a feature, read the clock or the states (everything comes through `readLive`), or change a threshold.
import {HOUR_MS, MINUTE_MS} from '../../core/figures.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {roomName, type RoomNameDeps} from '../../core/i18n/room-name.ts';
import type {LiveInputs} from './inputs.ts';

export interface CheckItem {
  level: 'crit' | 'warn';
  title: string;
  line: string;
  /** Unique in the popup's list: the check's key, with the sensor's id for a check that names one sensor per item. */
  key: string;
}

/** What one link says: an item, several (one per sensor), and the phrase it says when all is well; any of them may be absent. */
export interface CheckResult {
  item?: CheckItem;
  items?: CheckItem[];
  clear?: string;
}

/** The catalog, the formats and, for the thermostats' names, the names and the language. */
export interface CheckDeps extends RoomNameDeps {
  fmt: Formatters;
}

export interface Check {
  key: string;
  /** Null: this check does not apply to this house (its integration is absent), so it shows no item and no phrase. */
  run(inputs: LiveInputs, deps: CheckDeps): CheckResult | null;
}

/** The Hydro-Québec balance is stale after this long without an update. */
export const HYDRO_QUEBEC_STALE_MS = 36 * HOUR_MS;
/** A door open for longer than this is a warning. */
export const DOOR_OPEN_MS = 10 * MINUTE_MS;
/** A sensor's battery under this percent is a warning. */
export const BATTERY_LOW_PERCENT = 15;

/** Tire-pressure states Ford sends when all is well: the sensor's and each tire's. */
const TIRES_NORMAL = 'NORMAL_OPERATION';
const TIRE_NORMAL = 'NORMAL';

export const hydroQuebecStale: Check = {
  key: 'hydroQuebecStale',
  run: ({hydroQuebec, now}, {t}) => {
    if (!hydroQuebec?.balancePresent) return null;
    const {balanceUpdated} = hydroQuebec;
    if (balanceUpdated === null || now - balanceUpdated > HYDRO_QUEBEC_STALE_MS)
      return {item: {level: 'warn', key: 'hydroQuebecStale', title: t('live.hqStale'), line: t('live.hqStaleLine')}};
    return {clear: t('live.hqUpdating')};
  },
};

export const heatPumpOffline: Check = {
  key: 'heatPumpOffline',
  run: ({heatPump}, {t}) => {
    if (!heatPump?.present) return null;
    if (heatPump.available) return {clear: t('live.heatPumpOnline')};
    const brand = heatPump.brand ?? t('live.heatPumpUnit');
    return {
      item: {
        level: 'crit',
        key: 'heatPumpOffline',
        title: t('live.heatPumpOffline'),
        line: t('live.heatPumpOfflineLine', {brand}),
      },
    };
  },
};

export const hiloGatewayOffline: Check = {
  key: 'hiloGatewayOffline',
  run: ({hilo: {gateway}}, {t}) => {
    if (!gateway) return null;
    if (gateway.on && !gateway.disconnected) return {clear: t('live.gatewayOnline')};
    return {
      item: {
        level: 'crit',
        key: 'hiloGatewayOffline',
        title: t('live.gatewayOffline'),
        line: t('live.gatewayOfflineLine'),
      },
    };
  },
};

export const thermostatsNotReporting: Check = {
  key: 'thermostatsNotReporting',
  run: ({power}, deps) => {
    const present = power.rooms.filter(room => room.present);
    if (!present.length) return null;
    const down = present.filter(room => !room.available).map(room => roomName(room, deps));
    if (!down.length) return {};
    return {
      item: {
        level: 'warn',
        key: 'thermostatsNotReporting',
        title: deps.t('live.thermostatsNotReporting', {n: down.length}),
        line: down.join(', '),
      },
    };
  },
};

export const criticalPeak: Check = {
  key: 'criticalPeak',
  run: ({hydroQuebec}, {t}) => {
    if (!hydroQuebec) return null;
    if (hydroQuebec.peakNow)
      return {
        item: {level: 'crit', key: 'criticalPeak', title: t('live.peakInProgress'), line: t('live.peakInProgressLine')},
      };
    if (hydroQuebec.peakUpcoming)
      return {item: {level: 'warn', key: 'criticalPeak', title: t('live.peakComing'), line: t('live.peakComingLine')}};
    return hydroQuebec.peakReporting ? {clear: t('live.noPeak')} : {};
  },
};

export const weatherWarnings: Check = {
  key: 'weatherWarnings',
  run: ({weatherWarnings: n}, {t}) => {
    if (n === null) return null;
    if (n === 0) return {clear: t('live.noWeatherAlerts')};
    return {
      item: {
        level: 'warn',
        key: 'weatherWarnings',
        title: t('live.weatherWarning'),
        line: t('live.weatherWarningLine', {n}),
      },
    };
  },
};

export const tirePressureLow: Check = {
  key: 'tirePressureLow',
  run: ({car}, {t}) => {
    if (!car) return null;
    const {tireStatus, tires} = car;
    const low =
      tireStatus !== null &&
      (tireStatus !== TIRES_NORMAL ||
        Object.values(tires).some(tire => tire.state !== null && tire.state !== TIRE_NORMAL));
    if (!low) return {};
    return {
      item: {
        level: 'warn',
        key: 'tirePressureLow',
        title: t('live.tirePressureLow'),
        line: t('live.tirePressureLowLine'),
      },
    };
  },
};

export const carUnlocked: Check = {
  key: 'carUnlocked',
  run: ({car}, {t}) => {
    if (!car) return null;
    if (car.lockState === null) return {};
    if (car.lockState !== 'unlocked') return {clear: t('live.carLocked')};
    return {item: {level: 'warn', key: 'carUnlocked', title: t('live.carUnlocked'), line: t('live.carUnlockedLine')}};
  },
};

export const carNotReporting: Check = {
  key: 'carNotReporting',
  run: ({car}, {t}) => {
    if (!car) return null;
    if (car.soc !== null) return {};
    return {
      item: {
        level: 'warn',
        key: 'carNotReporting',
        title: t('live.carNotReporting'),
        line: t('live.carNotReportingLine'),
      },
    };
  },
};

export const doorOpenTenMinutes: Check = {
  key: 'doorOpenTenMinutes',
  run: ({sensors, now}, {t, fmt}) => {
    const doors = sensors.filter(sensor => sensor.kind === 'door');
    if (!doors.length) return null;
    return {
      items: doors
        .filter(door => door.on && now - door.since > DOOR_OPEN_MS)
        .map(door => ({
          level: 'warn',
          key: `door:${door.id}`,
          title: t('live.doorOpen', {name: door.name}),
          line: t('live.openFor', fmt.ago(door.since, now)),
        })),
    };
  },
};

export const sensorOffline: Check = {
  key: 'sensorOffline',
  run: ({sensors}, {t}) => {
    if (!sensors.length) return null;
    return {
      items: sensors
        .filter(sensor => !sensor.available)
        .map(sensor => ({
          level: 'warn',
          key: `offline:${sensor.id}`,
          title: t('live.sensorOffline', {name: sensor.name}),
          line: t('live.sensorOfflineLine'),
        })),
    };
  },
};

export const sensorBatteryLow: Check = {
  key: 'sensorBatteryLow',
  run: ({sensors}, {t}) => {
    if (!sensors.length) return null;
    return {
      items: sensors.flatMap(sensor =>
        sensor.battery !== null && sensor.battery < BATTERY_LOW_PERCENT
          ? [
              {
                level: 'warn' as const,
                key: `battery:${sensor.id}`,
                title: t('live.batteryLow', {name: sensor.name}),
                line: t('live.batteryLeft', {n: Math.round(sensor.battery)}),
              },
            ]
          : [],
      ),
    };
  },
};

export const doorsClosed: Check = {
  key: 'doorsClosed',
  run: ({sensors}, {t}) => {
    const doors = sensors.filter(sensor => sensor.kind === 'door');
    if (!doors.length) return null;
    return doors.some(door => door.on) ? {} : {clear: t('live.doorsClosed')};
  },
};

export const wallboxOffline: Check = {
  key: 'wallboxOffline',
  run: ({wallbox}, {t}) => {
    if (!wallbox.statusPresent) return null;
    if (wallbox.status !== null) return {};
    return {
      item: {level: 'warn', key: 'wallboxOffline', title: t('live.wallboxOffline'), line: t('live.wallboxOfflineLine')},
    };
  },
};

/** The chain, in the legacy `attention()`'s order, which is the popup's list order. */
export const CHECKS: readonly Check[] = [
  hydroQuebecStale,
  heatPumpOffline,
  hiloGatewayOffline,
  thermostatsNotReporting,
  criticalPeak,
  weatherWarnings,
  tirePressureLow,
  carUnlocked,
  carNotReporting,
  doorOpenTenMinutes,
  sensorOffline,
  sensorBatteryLow,
  doorsClosed,
  wallboxOffline,
];

/** Every link of the chain asked in order: the items and the phrases, each in chain order. */
export function runChecks(
  inputs: LiveInputs,
  deps: CheckDeps,
  chain: readonly Check[] = CHECKS,
): {items: CheckItem[]; clear: string[]} {
  const items: CheckItem[] = [];
  const clear: string[] = [];
  for (const check of chain) {
    const result = check.run(inputs, deps);
    if (!result) continue;
    if (result.item) items.push(result.item);
    if (result.items) items.push(...result.items);
    if (result.clear) clear.push(result.clear);
  }
  return {items, clear};
}
