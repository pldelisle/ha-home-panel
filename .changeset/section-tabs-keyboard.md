---
'ha-home-panel': patch
---

The section tabs follow the WAI-ARIA tabs keyboard pattern, in the Liquid Glass sidebar, Material's rail and the phone's bar: the list is one tab stop (the selected tab's), the arrow keys (Up and Down, and Left and Right on the phone), Home and End move focus and wrap, passing over tabs the house does not show, and Enter or Space selects. Each tab names its pane with `aria-controls`, and each pane is a `tabpanel` labelled by its tab.
