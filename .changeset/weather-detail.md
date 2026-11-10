---
'ha-home-panel': patch
---

The weather details are redrawn with the same look; they are now an element of their own, with a chart element the later tabs will share. Three small differences you can see: in a house with only a weather entity (no Environment Canada sensors) the details now show the wind, humidity and pressure that entity knows, where they showed dashes, and the dot for the temperature now on the days appears once a forecast arrives; the hover text of the charts and the hour labels of the next 24 hours write the time as the rest of the panel does ("4 pm", "16 h"); and on a phone, tapping the weather card on Home opens the details over the Weather tab and closing them brings you back to Home.
