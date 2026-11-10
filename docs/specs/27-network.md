# Spec 27: Network. The eleventh tab: the internet, the Wi-Fi, the devices, the equipment and the home server, from the UniFi integration and a Prometheus bridge package; two providers, one model

Parent: none; a new subject that follows the refactor programme's moves without being one of them ([production-grade-refactor.md](production-grade-refactor.md) has no row for it). Issue: #278.
Recipe: [15 Weather](15-weather.md) and "Anatomy of a feature" in [architecture.md](../architecture.md), steps 1 to 5 and 7 (step 6, the deletion, has nothing to delete).
Depends on: `<hp-ring>` in the kit (#256), for the tickets that draw a ring.
Blocks: [28 Home health in the header](28-home-health.md).
Ships as: the pull requests of "The moves", one per ticket; the visible ones are minor releases, the pure ones patch releases in which nothing visible changes.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

**The household.** When the internet slows down or drops, nobody at home can tell from the wall tablet whether the fault is the internet, the Wi-Fi or one device, whether the house has switched to its backup line, or whether the problem is real at all. The answers exist, but they are in an app on the admin's phone and in a Grafana dashboard behind a login, written in an operator's vocabulary (probe success, airtime ratio, SERVFAIL).

**The owner.** The house has two sources:

- **The UniFi Network integration in Home Assistant.** It reports the gateway, the switch, the access points (one of them meshed), the Wi-Fi networks with their client counts, CPU, memory, uptime, temperatures, firmware updates and about sixty tracked devices. Several of its most useful entities are disabled by default: the line latency to three targets on each WAN, every port's link speed, the gateway's temperatures, the per-AP client counts and the wired clients' link speeds. The integration's account exposes no switches, buttons or QR images, which suggests it is not an admin.
- **A monitoring stack on the NAS.** It runs UnPoller, blackbox probes (ICMP, HTTP and DNS over IPv4 and IPv6), Pi-hole exporters, the NAS over SNMP and cAdvisor, all scraped by Prometheus. Above them sits a set of **health rules**: `home:scope_state` per area (Internet, DNS, Pi-hole, UniFi, Synology, Containers) and `home:attention_age_seconds` per issue. Each issue has a stable `issue` id, a `scope`, a `component`, a `phase` (Checking, Warning, Unknown, Problem, Recovering, Maintenance) and confirmation delays. Grafana draws them.

The panel must never call Prometheus. ADR 0014 makes the API client the only module that talks to the outside, and it talks to Home Assistant only. A browser that queried Prometheus would also need its address and would bypass Home Assistant's authentication. So none of the stack's data reaches the panel today.

**The maintainer.** The registry lists ten subjects, and nothing in the panel describes a network. If the panel derived its own thresholds ("latency above 100 ms is bad"), they would drift from the rules, which already handle confirmation, recovery, maintenance and "monitoring is down, so don't claim an outage".

## Solution

A **Network** tab, eleventh on the tablet's rail (after Cameras, before Automations) and under More on the phone. It is hidden in a house that has neither the UniFi integration nor the bridge.

**Two sources, two providers, one model.**

1. **`unifiNetwork`** reads the entities whose registry platform is `unifi`: devices, Wi-Fi networks, line latency, ports, wired link speeds, firmware and trackers.
2. **`homeHealth`** reads the sensors of a Home Assistant **package** that the repository ships as an example. The package is a set of `rest` sensors that query Prometheus's HTTP API for the health rules and about twenty UnPoller, blackbox and Pi-hole series. It is the adapter on Home Assistant's side; the provider is the one on the panel's side. The panel reads Home Assistant sensors only.

**The pane, top to bottom.** Each block is drawn only when its inputs exist.

- **The pane header's line**: "Online · 47 devices · 12 ms", "On the backup line", "Internet down for 4 min", or "Can't check the internet right now".
- **The health row**: five chips (Internet, DNS, Network (the UniFi scope), Ad blocking (Pi-hole) and Home server (Synology and Containers merged, the worse one winning)). Each chip shows its state in one word and one colour and the top issue's line in plain words. Under the chips, a **24-hour strip** per chip shows when each area was unwell.
- **The Internet card**: the headline state, the line in use (primary or backup), the response time now with a 24-hour sparkline, the download and upload speed now, the last speed test against the plan's speed, and the drops this month. Tapping it opens the Internet detail.
- **The DNS card**: the share of lookups blocked today and the DNS response time.
- **Wi-Fi**: a tile per Wi-Fi network with its device count (tapping opens the count's history), and a tile per access point with its state, device count and an airtime ring (tapping opens the AP sheet).
- **Devices**: the connected count, the weak-signal count, the VPN users and a DHCP pool's use (shown only at 80 percent or more). It also lists the **watched devices** named in the config, each with its online state and link speed.
- **Equipment**: one card per gateway and switch (state, uptime, CPU and memory rings, temperature), a firmware chip ("2 updates") and the **network map** (gateway, then switch, then access points, then the meshed one). Tapping a switch opens its **front panel** of ports, coloured by link speed.
- **The Home server card**: storage used, the pool's health, the hottest drive and missing containers.

With the UniFi integration alone, the pane shows Wi-Fi, Equipment, Devices and, if the latency sensors are enabled, the Internet card's response time. The bridge adds the health row, the strip, the DNS card, the Home server card and the rest of the Internet card.

The tab is **read-only**. It offers no control: no blocking a device, pausing a network, power-cycling a port, installing firmware or running a speed test.

The house's Status checks, the live-activity pill and the smart stack are unchanged by this spec. Spec 28 wires them.

## User Stories

The household:

1. As a household member, I want to see at a glance whether the internet works, so that I know whether to restart something or wait.
2. As a household member, I want "Internet down for 4 min" when real websites cannot be reached, so that a line whose link is up but which carries nothing still counts as down.
3. As a household member, I want to see when the house runs on the backup line, so that I understand why streaming is slower and know the house is still online.
4. As a household member, I want "Can't check the internet right now" when the monitoring itself is down, so that the tablet never claims an outage it cannot see.
5. As a household member, I want the internet's response time now and over the day, so that I can tell a slow evening from a broken line.
6. As a household member, I want the download and upload speed right now, so that I can tell when the line is busy.
7. As a household member, I want the last speed test next to the plan's speed, so that I know whether we get what we pay for.
8. As a household member, I want the number of internet drops this month, so that I have facts when I call the provider.
9. As a household member, I want a tile per Wi-Fi network with how many devices are on it, so that I can see when the guest network is in use.
10. As a household member, I want a tile per access point showing whether it is online and how busy its airtime is, so that I can tell which floor's Wi-Fi is struggling.
11. As a household member, I want the number of connected devices, so that I notice when it is unusual.
12. As a household member, I want the number of devices with a weak Wi-Fi signal, so that I know when moving a device or an access point would help.
13. As a household member, I want a short list of the devices the house depends on (the Home Assistant host, the NAS, the energy gateway, the TV, the cameras) with whether each is online, so that I can check that the thing I need is reachable.
14. As a household member, I want the share of DNS lookups blocked today, so that I can see the ad blocker works.
15. As a household member, I want the home server's storage, pool health and hottest drive, so that I know the recordings and backups are safe.
16. As a household member, I want each area's health in one word and one colour, with the reason in plain words, so that I don't have to read a dashboard.
17. As a household member, I want a 24-hour strip per area, so that I can tell whether something was down last night.
18. As a household member, I want the Internet detail to show response time, speed and speed tests over a day, a week, a month and a year, so that I can see a trend.
19. As a household member, I want an access point's sheet to show its devices, airtime, retries, uptime, CPU, memory and firmware, so that I can see why one floor is slow.
20. As a household member, I want a switch's sheet to draw its ports as on its front panel, coloured by link speed, so that I can find the cable that negotiated at 100 Mb/s.
21. As a household member, I want a map of how the equipment connects, so that I understand which access point hangs off which.
22. As a household member, I want to see that firmware updates are waiting, so that I know to tell the admin.
23. As a French-speaking user, I want every string in French from the first paint, with numbers and times through the formatters ("12 ms", "940 Mb/s", "16 h 07"), so that the tab is as good as the others.
24. As a phone user, I want Network under More, with its brief line ("Online · 12 ms"), so that I can see the state without opening it.
25. As a wall-tablet user with large text or reduced transparency, I want the pane to stay readable and the rail to fit eleven tabs without scrolling, so that the new tab costs me nothing.
26. As a screen-reader user, I want every ring, chip, strip and port to have a text alternative ("Port 3, 1 Gb/s, office desk"), so that the tab is usable without sight.

The owner and admin:

27. As the owner, I want a ready Home Assistant package that bridges Prometheus to sensors, with a placeholder for the host, so that I install it once under `packages/`.
28. As the owner, I want the panel to show what my health rules decide, including their confirmation, recovery and maintenance phases, so that thresholds live in one place.
29. As the owner, I want each rule's condition shown in the panel's language, from the rule's stable `issue` id, so that I can keep my rules in English.
30. As the owner, I want an `issue` id the panel does not know to appear as its component with "needs a look", so that a new rule shows up before the panel learns it.
31. As the owner, I want the tab to work with the UniFi integration alone, so that the bridge is optional.
32. As an admin, I want a hint when the switch has no port sensors or the gateway has no latency sensors, naming what to enable in Home Assistant, so that I can turn the missing blocks on.
33. As the owner, I want to name the watched devices in the panel's config and rename them through the `names:` block, so that the list reads in the household's words.
34. As the owner, I want the bridge's sensors to keep long-term statistics only for numbers and to keep their attribute-heavy sensors out of the recorder, so that the database does not grow with every poll.

The adopter:

35. As an adopter without UniFi or the bridge, I want no Network tab, so that the panel fits my house.
36. As an adopter with UniFi but no Prometheus, I want the integration's blocks and no empty cards, so that the tab is useful without a monitoring stack.
37. As an adopter whose rule set has fewer areas, I want the areas I lack to be absent rather than Unknown, so that the health row describes my house.
38. As an adopter, I want to point the panel at bridge sensors with other ids through the config's `entities:` map, so that my own package works.

The maintainer and learner:

39. As a maintainer, I want two providers that turn both sources into generic inputs, so that the model never matches an integration's naming.
40. As a maintainer, I want the bridge's contract (entity ids, states, units, attributes) in one place, checked by a test that parses the example package, so that the package and the provider cannot drift.
41. As a maintainer, I want each rule of the model (the internet state, the chips, the weak signal, the DHCP pressure, the firmware count, the watchlist) as a named pure function tested at a known instant, so that adding a rule is one function and one test.
42. As a maintainer, I want each card to subscribe to its own entity ids, so that a port's flap redraws the front panel and nothing else.
43. As a maintainer, I want the panel never to call Prometheus, Grafana or any host other than Home Assistant, so that ADR 0014 holds and no address or credential reaches a browser.
44. As a learner, I want the bridge explained as an anti-corruption layer outside the panel and the provider as the one inside it, so that the two adapters of one seam are a worked example.

## Implementation Decisions

### The folder

```
src/providers/
  unifi-network.ts       unifiNetwork(states, registries, names): UnifiInputs | null
  home-health.ts         homeHealth(states, config): HealthInputs | null; HEALTH_IDS (the contract's default ids); parseVector;
                         internetState, activeLine (spec 28's header and stack read them too)
src/features/network/
  README.md              the files, the two sources, the bridge, the rule order
  index.ts               networkFeature: FeatureDescriptor
  ids.ts                 networkIds(store) and one ids function per card (internetIds, wifiIds, deviceIds, equipmentIds, serverIds, healthIds)
  inputs.ts              readNetwork(states, registries, config, names): NetworkInputs {unifi, health, watch}
  rules.ts               healthChips, weakSignal, dhcpPressure, firmwareCount, watchList, adminHints
  model.ts               networkModel(inputs, deps): NetworkViewModel; networkBrief(inputs, deps)
  ports.ts               portLayout(device): PortPanelGeometry
  map.ts                 mapLayout(devices): MapGeometry
  history.ts             internetSeries(rows, range), healthStrip(points, now), tileHistory(rows)
  loader.ts              NetworkHistory: the sheets' windows and the strip's day through the statistics cache
  sheets.ts              the sheet ids: INTERNET_SHEET 'network.internet', AP_SHEET 'network.ap', SWITCH_SHEET 'network.switch', TILE_SHEET 'network.tile'
  network-pane.ts        <hp-network-pane>
  health-row.ts          <hp-health-row> (the chips and the strip)
  internet-card.ts       <hp-internet-card>
  dns-card.ts            <hp-dns-card>
  wifi-tiles.ts          <hp-wifi-tiles>
  devices-card.ts        <hp-devices-card>
  equipment-card.ts      <hp-equipment-card> (with <hp-network-map>)
  network-map.ts         <hp-network-map>
  port-panel.ts          <hp-port-panel>
  server-card.ts         <hp-server-card>
  internet-detail.ts     <hp-internet-detail> (the detail sheet: inline on a tablet, over the screen on a phone)
  ap-sheet.ts            <hp-ap-sheet>
  switch-sheet.ts        <hp-switch-sheet>
  tile-history.ts        <hp-network-tile-history>
  styles.css, <element>.element.css beside each element
examples/packages/home-health.yaml
docs/adr/<next>-prometheus-reaches-the-panel-as-sensors.md
test/unit/providers/unifi-network.test.ts, home-health.test.ts, home-health-package.test.ts
test/unit/features/network/{rules,model,ports,map,history}.test.ts
test/unit/fixtures/houses/network.json (recorded by the owner)
test/e2e/network.spec.ts, test/e2e/network-sheets.spec.ts, the network-* baselines
```

The changes beside the folder:

- `src/ui/feature.ts`: `FeatureKey` gains `'network'`, and its comment says eleven subjects.
- `src/shell/features.ts`: `networkFeature` goes between the `cams` and `auto` lines.
- `src/core/hass.ts`: `EntityRegistryEntry` gains `translation_key?: string | null`. `DeviceRegistryEntry` gains `model?: string | null`, `via_device_id?: string | null` and `connections?: [string, string][]`. All are fields of Home Assistant's `hass.entities` and `hass.devices`, and the type's rule ("no property the panel does not read") holds because the provider now reads them.
- `src/core/config.ts`: the schema gains `network: optional(object({watch: optional(oneOrList(string()))}))`, and the resolved config gains `network: {watch: string[]}`. An id in `watch` that is not in `states` becomes a config problem (the config card shows it), following ADR 0015.
- `src/ui/icons.ts` gains `wifi`, `router`, `switch`, `ap`, `server` and `globe`.
- The catalogs gain the `network.*` keys in `en` and `fr`. Formatters gain `fmt.bitRate(bps)` ("940 Mb/s"). `fmt.durationShort` comes from spec 22 if it has landed, or this spec adds it and spec 22 reuses it.
- `CONTEXT.md`: Pane says "one of the eleven subjects". New glossary entries: **Health rules**, **Health scope**, **Bridge package**, **Watched devices**.

The descriptor:

```ts
export const networkFeature: FeatureDescriptor = {
  key: 'network',
  title: 'network.title',
  icon: 'wifi',
  color: 'var(--m-teal)', // the one --m-* token no rail neighbour uses
  phoneBar: false,
  available: ({store}) => hasNetwork(store), // unifiNetwork(...) !== null || homeHealth(...) !== null
  summary: ({store}) => networkBrief(readNetwork(...), store) || null,
  detailSheet: INTERNET_SHEET,
  overSheets: [AP_SHEET, SWITCH_SHEET, TILE_SHEET],
  pane: env => html`<hp-network-pane ...></hp-network-pane>`,
};
```

### The UniFi provider

```ts
export interface UnifiInputs {
  devices: UnifiDevice[]; // gateways, switches, access points; uplink order (gateway first)
  wlans: {id: string; name: string; clients: number | null}[];
  latency: {line: 'primary' | 'backup'; target: 'cloudflare' | 'google' | 'microsoft'; id: string; ms: number | null}[]; // [] when disabled
  clients: {connected: number; total: number}; // the unifi device_trackers: 'home' over all
  wired: {id: string; name: string; mbps: number | null}[]; // wired_client_link_speed, by tracker name
  updates: {id: string; device: string; available: boolean; installing: boolean}[];
}
export interface UnifiDevice {
  id: string; // the device registry id
  kind: 'gateway' | 'switch' | 'ap';
  name: string; // through the display-name resolver
  mac: string | null; // from connections, for the join with the bridge
  model: string | null;
  state: 'online' | 'offline' | 'upgrading' | 'unknown';
  upSince: number | null; // the uptime sensor is a timestamp
  cpu: number | null; memory: number | null; temperature: number | null;
  clients: number | null; // device_clients, disabled by default
  uplink: string | null; // the mac of the device it hangs off (device_uplink_mac)
  ports: {key: string; label: string; mbps: number | null; id: string}[]; // port_link_speed, 0 is down
}
```

- **Classification by `translation_key`**, never by entity id: `device_state`, `device_cpu_utilization`, `device_memory_utilization`, `device_uplink_mac`, `device_clients`, `device_sub_temperature`, `wlan_clients`, `wan_latency`, `port_link_speed` and `wired_client_link_speed`. Uptime and the switch's temperature have no translation key, so they are classified by the state's `device_class` (`timestamp`, `temperature`). Updates come from domain `update` and trackers from domain `device_tracker`, both with platform `unifi`.
- **The device's kind** comes from a model table, then a structural fallback. The table: `UDMB` is an access point (the BeaconHD, even though its code starts with `UDM`). `UDM*`, `UCG*`, `UXG*` and `UGW*` are gateways. `US*` and `USW*` are switches. `U6*`, `U7*` and `UAP*` are access points. The fallback: a device with `wan_latency` sensors is a gateway, one with `port_link_speed` and no WLAN role is a switch, and anything else is an access point.
- **The latency's line and target** are parsed from the state's `friendly_name` (`/(cloudflare|google|microsoft) (wan2?) latency/i`). `wan2` is the backup line.
- **States**: `device_state` values `connected` and `disconnected`, the upgrade states and `unavailable` map to the four states above. Numbers are read with `numberOf` from `src/core/states.ts`.
- **Absence**: the provider returns `null` when no entity in the registry has platform `unifi`. It returns empty lists for disabled families. `hass.entities` lists only enabled entities, so the panel cannot tell "disabled" from "absent", and the admin hints are worded for both.

### The bridge package and its contract

`examples/packages/home-health.yaml` is a Home Assistant package of `rest:` resources. Each resource is a GET to `http://prometheus.local:9090/api/v1/query` (the owner replaces the host) with `params: {query: <PromQL>}`, `scan_interval: 30` and `timeout: 10`, and one or more `sensor:` entries with a `unique_id`, a `value_template` and, for vectors, `json_attributes_path: "$.data"` with `json_attributes: [result]`. Each sensor's English `name` fixes its default entity id. The panel never shows those names: its words come from the catalog.

Every query ends with a freshness guard: `and on() (time() - home:rules_heartbeat < 30)` for the rules, and the exporter's `up == 1` for a metric. Stale data gives an empty vector, the `value_template` returns `none`, and the sensor's state is `unknown`. The provider reads `unknown` or `unavailable` as `null`, and the model reads `null` as "can't check", never as "down".

| Default entity id                                                                      | State                                  | Attributes                                                                                    | Query (in the package)                                                                                                                      |
| -------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `sensor.home_health_internet`, `_dns`, `_pihole`, `_unifi`, `_synology`, `_containers` | the scope's number, 0 to 4             |                                                                                               | one resource, `home:scope_state` with the guard; six sensors, each selecting its `scope`                                                    |
| `sensor.home_health_issues`                                                            | the count of issues not in Maintenance | `result`: the vector, labels `issue`, `scope`, `component`, `phase`, value the age in seconds | `home:attention_age_seconds` with the guard                                                                                                 |
| `sensor.network_web_v4`, `_web_v6`                                                     | 1 or 0                                 |                                                                                               | `min(probe_success{job="blackbox-external-http"})` and the `-v6` job                                                                        |
| `sensor.network_rtt_cloudflare`, `_rtt_google`                                         | ms, `measurement`                      |                                                                                               | `1000 * probe_icmp_duration_seconds{job="blackbox-internet", phase="rtt", instance=...}` and success                                        |
| `sensor.network_download`, `_upload`                                                   | bit/s, `measurement`                   |                                                                                               | `8 * sum(rate(unifipoller_device_wan_receive_bytes_total[5m]))` and transmit                                                                |
| `sensor.network_lines`                                                                 | the count of lines up                  | `result`: `unifipoller_wan_interface_state` by `wan_networkgroup`                             | with `unifipoller_wan_failover_priority` joined                                                                                             |
| `sensor.network_speedtest_download`, `_upload`, `_ping`, `_at`                         | Mb/s, Mb/s, ms, timestamp              |                                                                                               | `unifipoller_speedtest_download_mbps`, `_upload_mbps`, `_latency_ms`, `_timestamp_seconds`                                                  |
| `sensor.network_plan_download`, `_upload`                                              | Mb/s                                   |                                                                                               | `unifipoller_wan_provider_download_kbps / 1000` and upload                                                                                  |
| `sensor.network_drops_month`                                                           | count                                  |                                                                                               | `increase(unifipoller_site_intenet_drops_total[30d])` (the metric's misspelling is UnPoller's)                                              |
| `sensor.network_dns_response`                                                          | ms, `measurement`                      |                                                                                               | `1000 * probe_duration_seconds{job="blackbox-dns"}` and success                                                                             |
| `sensor.network_dns_blocked`                                                           | %, `measurement`                       |                                                                                               | `pihole_summary_queries_percent_blocked`                                                                                                    |
| `sensor.network_ap_airtime`, `_ap_retries`                                             | the busiest AP's value                 | `result`: by `name` and `mac`                                                                 | `100 * max by(name, mac)(unifipoller_device_radio_channel_utilization_total_ratio)`; retries per 100 packets as the dashboard computes them |
| `sensor.network_weak_signal`                                                           | count                                  |                                                                                               | `count(unifipoller_client_radio_signal_db < -75) or vector(0)`                                                                              |
| `sensor.network_vpn_users`                                                             | count                                  |                                                                                               | `sum(unifipoller_site_remote_user_active)`                                                                                                  |
| `sensor.network_dhcp`                                                                  | the fullest pool's %                   | `result`: by network                                                                          | `unifipoller_dhcp_utilization_percent`                                                                                                      |
| `sensor.home_server_storage`, `_drive_temperature`, `_containers_missing`              | %, °C, count                           |                                                                                               | the dashboard's storage and drive expressions; `count(home:attention{issue="container_missing"}) or vector(0)`                              |

- The package's `recorder: exclude` lists the sensors that carry a `result` attribute (`home_health_issues`, `network_lines`, `network_ap_airtime`, `network_ap_retries`, `network_dhcp`). The numeric sensors carry `state_class: measurement`, so the Internet detail's week, month and year come from long-term statistics.
- **The phases.** Numbers 0 to 4 are Healthy, Checking, Warning, Unknown and Problem (the rules' `order`). Recovering and Maintenance are read from the issues' `phase` label, never from the number. The ticket confirms the rules' numbers for those two phases against the live rules before writing the table into the README.
- **The issues.** The panel translates an issue's `issue` id through `network.issue.<id>`. The families take a parameter: `disk{n}_health`, `disk{n}_warm` and `disk{n}_hot` take `{n}`; `app_*` and `coverage_*` take `{component}`. An id the catalog lacks falls back to `network.issue.other` ("{component} needs a look"). The rules' English `detail`, `next` and `badge` labels are never shown, because they cannot be translated. The `component` label is a name (data) and may be shown.
- **The join with the integration.** An access point's bridge values join the integration's device by MAC (`connections`). When the bridge's vector has no `mac` label, they join by the controller's device name (the device registry's `name`, never `name_by_user`). The ticket checks which labels the live series carry (`count by(name, mac)(unifipoller_device_radio_channel_utilization_total_ratio)`).
- **Overrides.** Every default id in `HEALTH_IDS` can be replaced through the config's `entities:` map, under the same key without the `sensor.` prefix (`entities: {home_health_issues: sensor.my_issues}`).

```ts
export type ScopeKey = 'internet' | 'dns' | 'pihole' | 'unifi' | 'synology' | 'containers';
export type HealthState = 'healthy' | 'checking' | 'warning' | 'unknown' | 'problem' | 'recovering' | 'maintenance';
export interface HealthIssue {issue: string; scope: ScopeKey | null; component: string; phase: HealthState; ageS: number}
export interface HealthInputs {
  scopes: Partial<Record<ScopeKey, {state: HealthState; since: number | null}>>; // absent: this house's rules lack the scope; since: last_changed
  issues: HealthIssue[]; // Problem, Unknown, Warning, Recovering, Checking, Maintenance, then the oldest first
  internet: {
    web: {v4: boolean | null; v6: boolean | null};
    rtt: {target: 'cloudflare' | 'google'; ms: number | null}[];
    bps: {down: number | null; up: number | null};
    lines: {group: string; up: boolean; priority: number | null}[];
    speedtest: {downMbps: number; upMbps: number; pingMs: number; at: number} | null;
    plan: {downMbps: number; upMbps: number} | null;
    dropsMonth: number | null;
  };
  dns: {responseMs: number | null; blockedPct: number | null} | null;
  wifi: {aps: {mac: string | null; name: string; airtimePct: number | null; retriesPer100: number | null}[]; weakSignal: number | null} | null;
  vpnUsers: number | null;
  dhcp: {network: string; pct: number}[];
  server: {storagePct: number | null; hottestDriveC: number | null; containersMissing: number | null} | null;
}
```

`parseVector(attr)` turns Prometheus's `{metric, value: [ts, "4"]}` rows into typed rows with superstruct (parse, don't validate: ADR 0015's rule, applied at this boundary). It drops a row that does not parse and reads `NaN` and `±Inf` as `null`.

### The rules and the model

`rules.ts` holds the feature's named pure functions, each with its own test. The first two live in the provider instead (`src/providers/home-health.ts`, from #289): spec 28's header and stack read them too and may not import the feature, so the second user, already named, places them where both can read them (the two-adapters rule):

- `internetState(inputs, now)` returns `{state: 'online' | 'degraded' | 'backup' | 'down' | 'unknown'; since: number | null}`, deciding in this order:
  1. No bridge and no latency, or the Internet scope is Unknown: `unknown`.
  2. Both web checks false, or the scope is Problem with `internet_both` or `wan_down`: `down`.
  3. The primary line is down and a backup line is up: `backup`.
  4. The scope is Warning: `degraded`.
  5. Otherwise `online`. Without the bridge, `online` if any latency reads a number, else `unknown`.
- `activeLine(lines)`: the line with the lowest failover priority that is up.
- `healthChips(health)`: five chips. Synology and Containers merge into Home server, the worse one winning in the order Problem, Unknown, Warning, Recovering, Checking, Maintenance, Healthy. Each chip carries the line of its top issue.
- `weakSignal(health)`: the count, or null.
- `dhcpPressure(health)`: the pools at 80 percent or more.
- `firmwareCount(unifi)`: the number of updates available.
- `watchList(config.network.watch, states, names)`: each watched id with its display name, online state and link speed (joined from `wired` by tracker name).
- `adminHints(unifi, user)`: for an admin only, `ports` when a switch has no port sensors and `latency` when the gateway has none.

`networkModel(inputs, deps)` returns a `NetworkViewModel`. Each block is `null` when its inputs are absent, so hiding a block happens by construction rather than by an `if` in a template:

```ts
export interface NetworkViewModel {
  line: string; // the pane header's line, also the brief
  chips: ChipView[] | null;
  internet: InternetView | null;
  dns: DnsView | null;
  wifi: {networks: TileView[]; aps: ApTileView[]} | null;
  devices: DevicesView | null;
  equipment: {devices: EquipmentView[]; firmware: number; map: MapGeometry | null} | null;
  server: ServerView | null;
  hints: HintView[];
}
```

### Geometry

- `portLayout(device)` puts odd ports on the top row and even ports on the bottom, then the SFP ports to the right, for any port count (24 + 2, 16 + 2, 8, 9 + 1). Colour comes from the link speed: down is an outline in `--fg3`, 10 and 100 Mb/s are `--warn`, 1 Gb/s is `--ok`, and 2.5 Gb/s or more is `--m-blue`. Each port is a `<button>` with an `aria-label` ("Port 3, 1 Gb/s, office desk"). The label is the port's name as the controller gives it.
- `mapLayout(devices)` draws a layered tree by uplink MAC (Reingold and Tilford's tidy tree, simplified to layers): the depth is the hops from the gateway and the x position is each node's order among its siblings. It is drawn as inline SVG by `<hp-network-map>`. It does not use Mermaid: Mermaid's chunk is about 700 kB, and the map has at most about ten nodes.

### The elements

All of them are humble objects, following the recipe.

- `<hp-network-pane>` takes `active` and renders the cards. Each card owns a `StoreController` over its own ids function, so a tracker's change redraws the devices card and a port's change redraws the front panel. The pane runs no model itself. Each card calls the model's function for its block.
- Sheets are opened by `SheetRequestEvent`. The Internet detail is the descriptor's `detailSheet`: inline in the pane on a tablet, over the screen on a phone, as Weather's detail is. The AP, switch and tile-history sheets are `overSheets` and exist only while open (ADR 0021).
- Charts use `<hp-chart>` and `<hp-range-tabs>` from the kit with `RANGES`. Windows go through `createStatisticsCache`, with ten minutes' TTL like Weather's tile history. The 24-hour strip reads `history` for the six scope sensors (minimal response) once per pane activation and again when a scope sensor's state changes.
- `<hp-ring>` from the kit draws the CPU, memory and airtime rings.

### Strings

About 90 `network.*` keys: the title, the line's forms, the states and chips, the block labels, the hints and about 35 issue keys after the families. The French catalog is complete, and the catalog test fails on a missing translation. Names (Wi-Fi networks, devices, ports, components) are data and go through the display-name resolver.

### Performance, by construction

- Each card subscribes to its own ids. About sixty trackers and up to thirty port sensors change often, and each one redraws one card.
- History loads only when a sheet opens, or once for the strip when the pane activates.
- Home Assistant polls Prometheus every 30 seconds once for the whole house, so five tablets cost one set of queries, not five.

### ADR

The next free ADR number records **"Prometheus reaches the panel only as Home Assistant sensors"**.

- **Context**: ADR 0014; the browser must never learn the monitoring stack's address; Home Assistant's auth.
- **Decision**: an example package of `rest` sensors is the adapter, and `homeHealth` is the anti-corruption layer that parses its vectors.
- **Consequences**: up to 30 seconds of latency; recorder load, handled by the package's excludes; a contract test keeps the package and the provider in step; the package is an example the owner installs, not something the panel runs.

### The moves

Each ticket is a sub-issue of #278 with its blockers as native edges; #296 is the owner's (`ready-for-human`).

| Ticket | What it delivers                                                                                                                                              | Blocked by       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| #280   | The specs in the repository: docs/specs/27-network.md and 28-home-health.md from #278 and #279, with the ticket tables as their moves                         | None             |
| #281   | The pure half of the UniFi side: the registry fields in the hass types and the unifiNetwork provider, tested on literal states                                | None             |
| #282   | The tracer: the Network tab on the rail with a tile per Wi-Fi network and per access point; the full house gains UniFi; the rail's baselines re-recorded once | #281             |
| #283   | The Equipment card: each gateway and switch with its state, uptime, CPU and memory rings and temperature, and a firmware chip                                 | #282, #256       |
| #284   | The network map: gateway, switch, access points and the meshed one as a layered tree drawn in inline SVG                                                      | #282             |
| #285   | The switch sheet: the ports drawn as on the front panel, coloured by link speed, and the admin's hint when a switch has no port sensors                       | #283             |
| #286   | The Devices card and the watched devices: the connected count, and the config's network.watch list with each device's state and link speed                    | #282             |
| #287   | The bridge's pure half: the example package with the scope and issue sensors, its contract test, the homeHealth provider and the ADR                          | None             |
| #288   | The tracer of the bridge: the health row's five chips with the issues' lines in the panel's language; the full house gains its bridge sensors, all healthy    | #282, #287       |
| #289   | The internet's pure half: the package's internet resources, the provider's internet block, and internetState and activeLine in the provider                   | #281, #287       |
| #290   | The Internet card: the headline, the line in use, response time, speed now, the last speed test against the plan and the drops this month                     | #282, #289       |
| #291   | The DNS card and the Home server card: from the package's rows to the two cards                                                                               | #288             |
| #292   | Wi-Fi health from the bridge: airtime rings on the access points, retries, weak-signal devices, VPN users and DHCP pressure                                   | #286, #288, #256 |
| #293   | The 24-hour health strip under the chips, from the scope sensors' history through the statistics cache                                                        | #288             |
| #294   | The Internet detail: response time, speed and speed tests over a day, a week, a month and a year, and the card's sparkline                                    | #290             |
| #295   | The access point sheet and a Wi-Fi network's history: the AP's devices, airtime, retries and health; a network's device count over time                       | #283, #292       |
| #296   | The live house (owner): install the bridge package, enable the UniFi entities, correct the Containers rule, answer two questions and record the fixture       | #289, #291, #292 |
| #297   | The model against the recorded house: the providers and networkModel from fixtures/houses/network.json in English and French                                  | #290, #296       |

### Implementation notes

1. **The owner's steps outside the repository**:
   - Copy the package into Home Assistant's `packages/` with the real Prometheus host, and reload the REST entities (no restart).
   - Enable the UniFi entities they want shown (line latency, port link speeds, gateway temperatures, AP client counts, wired link speeds).
   - Record the fixture with `npm run record:fixture` (the recorder needs a long-lived token in the environment).
2. **Pitfall: the BeaconHD's model code is `UDMB`**, which a `UDM*` prefix rule would read as a gateway. The model table lists it first.
3. **Pitfall: an attribute-heavy sensor in the recorder** writes a row for every attribute change, which is every 30 seconds. Keep the five `result` sensors in the package's `recorder: exclude`.
4. **Pitfall: REST sensors cannot template attributes.** The `result` attribute is Prometheus's raw vector, so the provider, not the package, shapes it.
5. **Pitfall: privacy.** Keep real hosts, network names, device names and the house's entity ids out of the repository. The package uses `prometheus.local`, the test houses use made-up names, and `npm test`'s personal-data scan checks them.
6. **Pitfall: HA's `hass.entities` omits disabled entities.** Never write "disabled" in a hint. Write "turn on … in Home Assistant if you want …".

## Testing Decisions

- **What a good test is here**: it states what a household member or Home Assistant would observe, through the two seams of ADR 0005 and nowhere in between. Providers and rules are called with literal states and registries, and the model with the full test house (`fakeHass.fromHouse`) and the recorded fixture (`fakeHass.fromFixture('network')`). No Lit internals, no private fields, no mocked socket, and the panel exposes no test-only method.
- **`unifi-network.test.ts`**: classification by translation key and device class; the model table, including `UDMB`; the MAC from `connections`; the latency parse; the four device states; `null` without the platform; empty lists for absent families; names through the resolver.
- **`home-health.test.ts`**: `parseVector` with good rows, a bad row, `NaN` and `+Inf`; `unknown` and `unavailable` read as null; the scope numbers; Recovering and Maintenance from the phase label; the issue sort; absent scopes; overrides through `entities:`.
- **`home-health-package.test.ts`, the contract**: it parses `examples/packages/home-health.yaml` with the `yaml` dev dependency and asserts:
  - every id in `HEALTH_IDS` is defined, with the unit, `state_class` and `result` attribute the provider expects;
  - every resource has `params.query` and the freshness guard;
  - every `result` sensor is in `recorder: exclude`;
  - the only host is the placeholder.
- **The feature's tests**:
  - `rules.test.ts`: each rule at a known instant, including `internetState`'s five-step order and the "no bridge" branch.
  - `model.test.ts`: the full house and the fixture, in `en` and `fr`, with the lines as literals.
  - `ports.test.ts`: the 24 + 2, 16 + 2, 8 and 9 + 1 shapes, the colours and the labels.
  - `map.test.ts`: a gateway with a switch, two access points and a meshed one; a missing uplink; an orphan.
  - `history.test.ts`: the strip's spans, gaps as unknown, the series by range.
- **End to end**: `network.spec.ts` checks:
  - the tab is absent in the bare house;
  - the tablet rail fits eleven tabs at large text;
  - the phone's More line;
  - the internet card's down, backup and unknown states (set through `window.house`);
  - the admin hint for an admin only;
  - axe finds no violation.

  `network-sheets.spec.ts` checks the three sheets, Escape, focus return and the statistics requests.

- **Prior art**: `test/unit/providers/environment-canada.test.ts` and `weather-source.test.ts` (providers); `test/unit/features/weather/*` (model, history, tiles); `test/unit/from-fixture.test.ts`; `test/e2e/weather.spec.ts`, `weather-detail.spec.ts` and `weather-history.spec.ts` (pane, detail, over-sheet).
- **Mutation check**: as recipe step 7, an unrelated change to a rule flips exactly that rule's test.

## Out of Scope

- **Any control**: blocking a device, pausing a Wi-Fi network, power-cycling a port, installing firmware, running a speed test, pausing Pi-hole. The integration's account has no admin entities and UnPoller is read-only. A later spec can add controls if the account becomes an admin or HA's Pi-hole integration is added.
- **The Status checks, the live-activity pill and the smart stack**: spec 28.
- **Threat detections (IDS/IPS), alarms and events**: UnPoller exports them to Loki or InfluxDB, not to Prometheus.
- **Traffic by app (DPI)**: UnPoller's `SAVE_DPI` is off.
- **PoE**: the switch is the non-PoE model and Prometheus has no PoE series.
- **"A new device joined"**: `hass.entities` has no creation time. It would need an entity-registry read through the API client.
- **A per-device sheet with traffic and signal**: about sixty clients would mean hundreds of HA entities. A later top-five vector sensor could serve it.
- **Left in Grafana**: the IPv4 and IPv6 split beyond the Internet detail's two web-access lines, DNS by site, container CPU and memory, service start markers and the monitoring-coverage table.
- **Reading the NAS through HA's Synology DSM integration** (a third provider, for houses without the bridge).
- **Links to or embeds of Grafana.**

## Further Notes

- **The rules today report a Problem in the Containers scope.** It says a `home-assistant` container is missing and its web check fails, so the monitoring stack expects Home Assistant to run on the NAS. If it runs elsewhere, the Home server chip would show red permanently. The fix belongs in the rules, not in the panel, which shows what the rules decide.
- **Patterns**:
  - the bridge and the provider: Adapter and Anti-Corruption Layer (Gamma et al.; Evans);
  - the rules: named pure functions (Bernhardt, Functional Core, Imperative Shell);
  - the descriptor: Plugin (Fowler, PoEAA);
  - the per-card controllers: Observer, scoped to each card's ids;
  - the map: Reingold and Tilford, _Tidier Drawings of Trees_;
  - the contract test: Consumer-Driven Contracts (Robinson).
- **Reading**:
  - ADRs 0004, 0005, 0014, 0015, 0017, 0019, 0020, 0021 and 0022;
  - spec 15;
  - Prometheus's HTTP API (`/api/v1/query`, the vector result type);
  - Home Assistant's RESTful integration (`rest:` with `params`, `json_attributes_path`) and packages;
  - UnPoller's Prometheus metric names.
