---
'ha-home-panel': patch
---

The release zip now carries a compressed copy of each script beside it. Home Assistant sends that copy to browsers that accept it, so the code behind the Automations flow charts arrives about four times smaller (about 200 KB instead of 770 KB), which shows on a slow connection. When installing by hand, replace the whole `home-panel` folder rather than one file.
