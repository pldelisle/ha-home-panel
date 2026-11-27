// infraAlerts and securityDigest: the two sensors of the house's own monitoring, as the Status checks read them. The alerts sensor keeps
// the firing entries of Prometheus's list and drops what is not an alert; a sensor that reads no number is monitoring that does not answer;
// the digest's level is one of its three words or unknown. A house without either sensor has none.
import {describe, expect, test} from 'vitest';
import {entity} from '../fake-hass.ts';
import {houseOf, storeOf} from '../features/media/support.ts';
import {infraAlerts, securityDigest} from '../../../src/providers/infra-monitoring.ts';

const read = (...states: ReturnType<typeof entity>[]) => {
  const hass = houseOf([], states);
  const {config} = storeOf(hass);
  return {alerts: infraAlerts(hass.states, config), digest: securityDigest(hass.states, config)};
};

const alert = (over: Record<string, unknown> = {}, labels: Record<string, unknown> = {}) => ({
  labels: {alertname: 'BackupStale', severity: 'critical', vm: 'home', ...labels},
  annotations: {summary: 'The home VM has not been backed up for 36 hours'},
  state: 'firing',
  activeAt: '2026-11-27T12:00:00Z',
  ...over,
});

describe('the alerts sensor', () => {
  test('is found at its default id and gives each firing alert, critical or not, with its summary and start', () => {
    const {alerts} = read(
      entity('sensor.infra_alerts', '2', {
        alerts: [alert(), alert({state: 'pending'}), alert({}, {alertname: 'DiskFilling', severity: 'warning'})],
      }),
    );
    expect(alerts).toEqual({
      answering: true,
      firing: [
        {
          name: 'BackupStale',
          critical: true,
          summary: 'The home VM has not been backed up for 36 hours',
          since: Date.parse('2026-11-27T12:00:00Z'),
          identity: 'alertname=BackupStale,severity=critical,vm=home',
        },
        {
          name: 'DiskFilling',
          critical: false,
          summary: 'The home VM has not been backed up for 36 hours',
          since: Date.parse('2026-11-27T12:00:00Z'),
          identity: 'alertname=DiskFilling,severity=warning,vm=home',
        },
      ],
    });
  });

  test('drops an entry that is not an alert, and reads a missing summary or start as null', () => {
    const {alerts} = read(
      entity('sensor.infra_alerts', '1', {
        alerts: [null, 'x', {state: 'firing'}, alert({}, {alertname: ''}), alert({annotations: {}, activeAt: 'soon'})],
      }),
    );
    expect(alerts?.firing).toMatchObject([{name: 'BackupStale', summary: null, since: null}]);
  });

  test('that reads no number is monitoring that does not answer, whatever its attribute holds', () => {
    for (const state of ['unavailable', 'unknown'])
      expect(read(entity('sensor.infra_alerts', state, {alerts: [alert()]})).alerts).toEqual({
        answering: false,
        firing: [],
      });
  });

  test('with no list is no alert; a house without the sensor has none', () => {
    expect(read(entity('sensor.infra_alerts', '0')).alerts).toEqual({answering: true, firing: []});
    expect(read().alerts).toBeNull();
  });
});

describe('the security digest', () => {
  test('says its level and its sentence', () => {
    expect(read(entity('sensor.security_digest', 'act', {summary: ' Two logins from abroad. '})).digest).toEqual({
      level: 'act',
      summary: 'Two logins from abroad.',
    });
    expect(read(entity('sensor.security_digest', 'ok', {summary: ''})).digest).toEqual({level: 'ok', summary: null});
  });

  test('reads any other state as unknown; a house without the sensor has none', () => {
    for (const state of ['unknown', 'unavailable', 'urgent'])
      expect(read(entity('sensor.security_digest', state)).digest?.level).toBe('unknown');
    expect(read().digest).toBeNull();
  });
});

describe('the config', () => {
  test('can name other sensors', () => {
    const hass = houseOf([], [entity('sensor.alerts', '0'), entity('sensor.digest', 'watch')]);
    const {config} = storeOf(hass, {entities: {infra_alerts: 'sensor.alerts', security_digest: 'sensor.digest'}});
    expect(infraAlerts(hass.states, config)).toEqual({answering: true, firing: []});
    expect(securityDigest(hass.states, config)?.level).toBe('watch');
  });
});
