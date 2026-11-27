---
'ha-home-panel': minor
---

The status checks show the house's own monitoring: each alert Prometheus fires (read from `sensor.infra_alerts`) is one item, red for a critical one and amber for the rest, an amber "Monitoring not answering" when that sensor reads nothing, and the nightly security digest (`sensor.security_digest`) when it says "watch" (amber) or "act" (red), with its summary.
