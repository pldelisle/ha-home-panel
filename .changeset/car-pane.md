---
'ha-home-panel': patch
---

The Car tab is redrawn with the same look and loads its history when you open it. A few words and figures change: the card no longer starts its line with a dot when the car reports no range, counts "1 charging day" in the singular, and describes its bars and its drawn car in French for screen readers; the card's own description ("Open car details") is French in French; the charger's status on the card comes from the translated catalog; and the card's daily line groups its thousands as the language does ("1,107 kWh" in English, "1 107 kWh" in French), which moves the number in the four phone Car baselines. A history that does not load is said on the Car card, not at the top of the screen; a failure of the history the Home stack and tile, the live pill and the header share is now only logged (Energy and Car show their own lines, other tabs log it).
