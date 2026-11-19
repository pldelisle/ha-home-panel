---
'ha-home-panel': patch
---

Home Assistant can now install a release of the panel itself: `examples/update-from-github.yaml` adds an "Update Home panel" script that downloads `home-panel.zip` from GitHub, checks its digest, swaps the build files in `www/home-panel/` (keeping your own files and a backup of the old build) and sets `?v=` on the panel's `module_url`.
