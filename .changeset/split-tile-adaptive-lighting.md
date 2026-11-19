---
'ha-home-panel': patch
---

In an area listed in `split_light_areas`, each light tile now finds its own Adaptive Lighting instance: one listing the tile's lights, one named for the tile's key in `adaptive_lighting_areas`, or one whose name is in the tile's group name. Two groups of one room can then have separate Auto and Night. A tile with no instance of its own still shares the area's, as before.
