---
'ha-home-panel': patch
---

The library that draws the automation flow charts was updated (Mermaid 11.4 to 11.17), which brings its security fixes. The flow charts may look very slightly different along the edges of the boxes and arrows; the four Automations screenshots were re-recorded. The new library is larger, so the first time the Automations tab draws a flow it loads about 200 KB more (35 KB more when compressed). An automation step whose name has text between double dollar signs (like $$this$$) now shows it as typed instead of turning it into a formula.
