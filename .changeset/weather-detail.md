---
'ha-home-panel': patch
---

The weather details are redrawn with the same look; they are now an element of their own, with a chart element the later tabs will share. Two small differences you can see: in a house with only a weather entity (no Environment Canada sensors) the details now show the wind, humidity and pressure that entity knows, where they showed dashes, and the dot for the temperature now on the days appears once a forecast arrives; and the hover text of the charts and the hour labels of the next 24 hours write the time as the rest of the panel does ("4 pm", "16 h").
