# People

Who's home ([spec 24](../../../docs/specs/24-home.md)): the configured people, each home or away, as the header's chips, the Home card and the smart stack show them. Who's home is no tab, so the folder has no descriptor: the shell composes its elements on the Home pane and in the header. This folder holds the model and the ids (#264); the elements `<hp-who-chips>` and `<hp-who-card>` come with #266. The reading is the provider's, because three places read it (ADR 0025).

## The folder

```
src/providers/
  people.ts                presence(states, registries, people): Person[]; presenceIds; frozenPresence(states, registries, now): FrozenTracker[]
  calendar.ts              todaysEvents(states, registries, now, fmt): CalendarEvent[] (the stack's agenda card, #265)
src/features/people/
  README.md
  index.ts                 the feature's exports: peopleIds, peopleModel
  ids.ts                   peopleIds(store): the configured people's person entities and their iPhones and watches
  model.ts                 peopleModel(people, {t}): PeopleViewModel (the chips' label and words, the Home card's hint)
```

## The provider

`presence` answers in **the config's order** (`people`, a list of first names). A `person.*` whose `friendly_name`'s first word folds (`src/core/fold.ts`: case and accents never decide) to a configured name **wins**, because it follows the trackers chosen in Home Assistant's People settings: home when its state is `home`, else away since its `last_changed`. Only when no person entity matches does the fallback run: each `device_tracker.*` named "Alex's iPhone" or "iPhone de Alex" (or "d'Alex"), visible, available, and an **iPhone or a watch** (an iPad or a laptop stays home and would keep its owner home). An owner is home when any of those is home, else away since the last of them that left. A person no tracker knows is not listed.

`frozenPresence` is the smart stack's "presence not updating" reading: the `source` of each person entity, when it is an available tracker of the `icloud` platform that last reported **three hours or more** ago, rounded to the minute as the legacy stack did (179.5 minutes is frozen).

`todaysEvents` reads each visible, available `calendar.*` (a calendar entity holds its next event only): kept when its `start_time` falls on today in the formatters' zone and its `end_time` (or its start when it has none) is after now; an all-day event of today is kept. Home Assistant writes the times without a zone, and they are read in the browser's, as the legacy panel read them. The list is by start.

## The model

`peopleModel(people, {t})` gives `label` ("Who's home", the chips' accessible name and the Home card's label), `chips` (each person's name as the config gives it, `home`, and the lower-case word "home" or "away") and `hint` ("No one is tracked yet." when no one is, else null). The French of each is the rewrite layer's (`test/unit/fixtures/moved/people.json`), except the hint, which the layer left in English: its French is a visible change that #268 records.

The legacy `presence()` and `whoHtml()` still draw the header and the Home card until #266 and #268 delete them.
