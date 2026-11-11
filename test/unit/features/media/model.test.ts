// mediaModel: the Media pane's, the phone tiles' and the summary's text from the test house, from literal players and from a
// held value. The lines of the test house are read from the pane's baselines (media-tablet-light-en and -fr, the phone's
// Media tiles), and the French ones are what the rewrite layer made of them: quirks included, as the pane showed them.
import {describe, expect, test} from 'vitest';
import {OverlayStore} from '../../../../src/ui/overlay-store.ts';
import {K} from '../../../../src/features/media/commands.ts';
import {readMedia, type MediaInputs, type SpeakerInputs} from '../../../../src/features/media/inputs.ts';
import {mediaBrief, mediaModel} from '../../../../src/features/media/model.ts';
import type {TvInputs} from '../../../../src/providers/tv-source.ts';
import {fakeHass} from '../../fake-hass.ts';
import {depsOf, fullHouse, readingOf, recorded, type Language} from './support.ts';

const unheld = <T>(_key: string, current: T): T => current;
const holding =
  (held: Record<string, unknown>) =>
  <T>(key: string, current: T): T =>
    (key in held ? held[key] : current) as T;

const modelOf = (
  inputs: MediaInputs,
  language: Language = 'en',
  overlay: <T>(key: string, current: T) => T = unheld,
) => {
  const {t, names} = depsOf(fullHouse, language);
  return mediaModel(inputs, {t, names, overlay});
};

const inputsOf = (house: typeof fullHouse) => {
  const {states, registries, names} = readingOf(house);
  return readMedia(states, registries, names);
};

// the features the test house's speaker says, and the bits the model reads
const PLAY = 16384;
const VOLUME_SET = 4;
const PAUSE = 1;

const tv = (over: Partial<TvInputs> = {}): TvInputs => ({
  id: 'media_player.tv',
  name: 'Samsung TV',
  defaultName: 'media.samsungTv',
  areaId: 'living_room',
  wakeButton: null,
  state: 'on',
  source: 'Netflix',
  summarySource: 'Netflix',
  muted: false,
  ...over,
});

const speaker = (over: Partial<SpeakerInputs> = {}): SpeakerInputs => ({
  id: 'media_player.kitchen',
  areaId: 'living_room',
  name: 'HomePod mini',
  state: 'playing',
  available: true,
  features: PLAY | PAUSE | VOLUME_SET,
  title: 'Test tone',
  artist: 'Nobody',
  album: null,
  picture: null,
  volume: 0.35,
  ...over,
});

const only = (over: Partial<SpeakerInputs>) => modelOf({tv: null, speakers: [speaker(over)]});
const tvOnly = (over: Partial<TvInputs>, language: Language = 'en', overlay = unheld) =>
  modelOf({tv: tv(over), speakers: []}, language, overlay);

describe('the full test house, in English', () => {
  const vm = modelOf(inputsOf(fullHouse));

  test("the pane's sub-line and the speakers' line", () => {
    expect(vm.summary).toBe('TV on · Netflix · 1 speaker playing');
    expect(vm.speakersLine).toBe('1 speaker playing');
    expect(vm.labels).toEqual({
      speakers: 'Speakers',
      noDevices: 'No TV or speakers found.',
      noSpeakers: 'Media players that sit in an HA area show up here.',
    });
  });

  test("the television's box", () => {
    expect(vm.tv).toEqual({
      id: 'media_player.living_room_tv',
      wakeButton: null,
      name: 'Samsung TV',
      on: true,
      available: true,
      muted: false,
      sourceLabel: 'Netflix',
      status: 'On',
      statusLine: 'On · Netflix',
      screenLabel: 'Netflix',
      cardRight: 'Netflix',
      switchLabel: 'Samsung TV power',
      controlsLabel: 'Volume and playback',
      hint: "The TV doesn't report its volume, so there's no slider.",
      controls: {
        volumeDown: {label: 'Volume down', pane: {text: 'Vol −', label: 'Vol −, volume down'}},
        volumeUp: {label: 'Volume up', pane: {text: 'Vol +', label: 'Vol +, volume up'}},
        mute: {label: 'Mute', pane: {text: 'Mute', label: 'Mute'}},
        playPause: {label: 'Play or pause', pane: {text: null, label: 'Play or pause'}},
      },
    });
  });

  test("the speaker's pod", () => {
    expect(vm.speakers).toEqual([
      {
        id: 'media_player.living_room_speaker',
        room: 'Living room',
        name: 'speaker',
        playing: true,
        available: true,
        loaded: true,
        title: 'Test tone',
        artist: 'Nobody',
        subLine: 'Nobody',
        picture: null,
        volume: {
          percent: 35,
          text: '35%',
          caption: 'Volume',
          label: 'Living room volume',
          downLabel: 'Volume down',
          upLabel: 'Volume up',
          atMin: false,
          atMax: false,
          down: 0.3,
          up: 0.4,
        },
        playPause: {enabled: true, label: 'Pause', icon: 'pause'},
      },
    ]);
  });

  test("the phone's tiles", () => {
    expect(vm.tiles).toEqual([
      {
        key: 'tv',
        kind: 'tv',
        title: 'Samsung TV',
        sheetTitle: 'Samsung TV',
        description: 'Opens the controls',
        subLine: 'On · Netflix',
        on: true,
        picture: null,
        control: {kind: 'switch', checked: true, label: 'Samsung TV power', disabled: false},
      },
      {
        key: 'media_player.living_room_speaker',
        kind: 'speaker',
        title: 'Living room',
        sheetTitle: 'Speakers',
        description: 'Opens the controls',
        subLine: 'Test tone · Nobody',
        on: true,
        picture: null,
        control: {kind: 'play', playing: true, label: 'Pause', disabled: false},
      },
    ]);
  });
});

describe('the full test house, in French', () => {
  const vm = modelOf(inputsOf(fullHouse), 'fr');

  test("the pane's lines, as the French baseline reads them", () => {
    // the layer reads "1 speaker playing" after another part as "1 speaker : en lecture", with a no-break space before the colon
    expect(vm.summary).toBe('Télé allumée · Netflix · 1 speaker : en lecture');
    expect(vm.speakersLine).toBe('1 haut-parleur en lecture');
    expect(vm.labels.speakers).toBe('Haut-parleurs');
    expect(vm.tv).toMatchObject({
      name: 'Samsung TV',
      status: 'Activé',
      statusLine: 'Activé · Netflix',
      switchLabel: 'Samsung TV : alimentation',
      controlsLabel: 'Volume et lecture',
      // the layer has no entry for this line: the French pane reads it in English
      hint: "The TV doesn't report its volume, so there's no slider.",
    });
    expect(vm.tv?.controls.mute.pane.text).toBe('Sourdine');
    expect(vm.tv?.controls.volumeDown.pane.text).toBe('Vol −');
    expect(vm.speakers[0].volume).toMatchObject({text: '35 %', caption: 'Volume', label: 'Volume de Living room'});
    expect(vm.speakers[0].playPause.label).toBe('Pause');
  });

  test("the phone's tiles", () => {
    expect(vm.tiles.map(({subLine, description, control}) => [subLine, description, control.label])).toEqual([
      ['Activé · Netflix', 'Ouvre les commandes', 'Samsung TV : alimentation'],
      ['Test tone · Nobody', 'Ouvre les commandes', 'Pause'],
    ]);
  });
});

describe('the bare house, which has no player', () => {
  const bare = modelOf({tv: null, speakers: []});

  test('says nothing in the sub-line and that none was found', () => {
    expect(bare).toMatchObject({summary: '', tv: null, speakers: [], speakersLine: 'None found', tiles: []});
  });

  test('says it in French', () => {
    expect(modelOf({tv: null, speakers: []}, 'fr')).toMatchObject({summary: '', speakersLine: 'Aucun trouvé'});
    expect(modelOf({tv: null, speakers: []}, 'fr').labels).toEqual({
      speakers: 'Haut-parleurs',
      noDevices: 'Aucune télé ni haut-parleur trouvé.',
      noSpeakers: 'Les lecteurs placés dans une pièce de Home Assistant apparaissent ici.',
    });
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the model is tested on the test house', () => {});
    return;
  }

  test('gives a model that agrees with what the house holds, computed from the house itself', () => {
    const inputs = inputsOf(fakeHass.fromFixture('main'));
    const vm = modelOf(inputs);
    expect(vm.tv === null).toBe(inputs.tv === null);
    expect(vm.speakers.map(s => s.id)).toEqual(inputs.speakers.map(s => s.id));
    expect(vm.tiles).toHaveLength((inputs.tv ? 1 : 0) + inputs.speakers.length);
    expect(vm.speakersLine).toBe(
      inputs.speakers.length === 0
        ? 'None found'
        : inputs.speakers.some(s => s.state === 'playing')
          ? `${inputs.speakers.filter(s => s.state === 'playing').length} ${inputs.speakers.filter(s => s.state === 'playing').length === 1 ? 'speaker' : 'speakers'} playing`
          : 'Nothing playing',
    );
  });
});

describe('the television', () => {
  test('is off: no source, a screen with no label, the switch unchecked', () => {
    const vm = tvOnly({state: 'off'});
    expect(vm.tv).toMatchObject({
      on: false,
      available: true,
      status: 'Off',
      statusLine: 'Off',
      sourceLabel: '',
      cardRight: '',
      screenLabel: null,
    });
    expect(vm.summary).toBe('TV off');
    expect(vm.tiles[0]).toMatchObject({subLine: 'Off', on: false, control: {checked: false}});
  });

  test('says its input in the sub-line with the dash cut and the full-width ampersand kept, where the box makes it plain', () => {
    const vm = tvOnly({source: 'Prime&Co', summarySource: 'Prime＆Co'});
    expect(vm.summary).toBe('TV on · Prime＆Co');
    expect(vm.tv).toMatchObject({sourceLabel: 'Prime&Co', statusLine: 'On · Prime&Co'});
  });

  test('is on with no input: the screen says On', () => {
    const vm = tvOnly({source: null, summarySource: null});
    expect(vm.tv).toMatchObject({status: 'On', statusLine: 'On', screenLabel: 'On', sourceLabel: ''});
    expect(vm.summary).toBe('TV on');
    expect(vm.tiles[0].subLine).toBe('On');
  });

  test('is unavailable without a wake button: not responding, the switch disabled', () => {
    const vm = tvOnly({state: 'unavailable', source: null, summarySource: null});
    expect(vm.tv).toMatchObject({available: false, on: false, status: 'Not responding', cardRight: 'Unavailable'});
    expect(vm.tiles[0]).toMatchObject({subLine: 'Not responding', control: {disabled: true}});
    expect(vm.summary).toBe('TV off');
  });

  test('is unavailable with a wake button: still available, so it can be woken', () => {
    const vm = tvOnly({state: 'unavailable', source: null, summarySource: null, wakeButton: 'button.wake_on_lan_tv'});
    expect(vm.tv).toMatchObject({available: true, on: false, status: 'Off'});
    expect(vm.tiles[0].control).toMatchObject({disabled: false});
  });

  test('is muted: the status says it, and so does the line over its input', () => {
    expect(tvOnly({muted: true, source: null, summarySource: null}).tv).toMatchObject({
      muted: true,
      status: 'On · muted',
      statusLine: 'On · muted',
    });
    expect(tvOnly({muted: true}).tv).toMatchObject({status: 'On · muted', statusLine: 'On · muted · Netflix'});
    expect(tvOnly({muted: true}).tv?.controls.mute.label).toBe('Unmute');
  });

  test('is muted, in French: the layer leaves "muted" in English over an input, and words it alone', () => {
    expect(tvOnly({muted: true, source: null, summarySource: null}, 'fr').tv?.statusLine).toBe('Allumé · en sourdine');
    expect(tvOnly({muted: true}, 'fr').tv?.statusLine).toBe('Activé · muted · Netflix');
  });

  test('takes the default name of its source when the household named it nothing', () => {
    expect(tvOnly({name: null, defaultName: 'media.samsungTv'}).tv?.name).toBe('Samsung TV');
    expect(tvOnly({name: null, defaultName: 'media.tv'}, 'fr').tv?.name).toBe('Télé');
  });

  test('an unavailable set is not counted as on in the sub-line, whatever the overlay holds', () => {
    expect(tvOnly({state: 'unavailable'}, 'en', holding({'media_player.tv:on': true})).summary).toBe('TV off');
  });
});

describe('a speaker', () => {
  test('that is not loaded says its name and why it plays nothing', () => {
    const lines = (over: Partial<SpeakerInputs>) => only(over).speakers[0];
    expect(lines({state: 'paused', title: null})).toMatchObject({
      loaded: false,
      title: null,
      subLine: 'HomePod mini · Paused',
    });
    expect(lines({state: 'idle', title: null}).subLine).toBe('HomePod mini · Not playing');
    expect(lines({state: 'standby', title: null}).subLine).toBe('HomePod mini · Off');
    expect(lines({state: 'off', title: null}).subLine).toBe('HomePod mini · Off');
    expect(lines({state: 'unavailable', available: false}).subLine).toBe('HomePod mini · Unavailable');
    expect(lines({state: 'playing', title: ''}).loaded).toBe(false);
  });

  test('says it in French as the layer worded it, "Not playing" after a name included', () => {
    const french = (over: Partial<SpeakerInputs>) =>
      modelOf({tv: null, speakers: [speaker(over)]}, 'fr').speakers[0].subLine;
    expect(french({state: 'paused', title: null})).toBe('HomePod mini · En pause');
    expect(french({state: 'idle', title: null})).toBe('HomePod mini · Not : en lecture');
    expect(french({state: 'off', title: null})).toBe('HomePod mini · Éteint');
    expect(french({state: 'unavailable', available: false})).toBe('HomePod mini · Indisponible');
  });

  test('that is loaded says its artist, else its album, else nothing, and shows its cover', () => {
    expect(only({artist: null, album: 'Sine waves'}).speakers[0]).toMatchObject({subLine: 'Sine waves'});
    expect(only({artist: null, album: null}).speakers[0]).toMatchObject({subLine: ''});
    const cover = only({picture: '/api/media_player_proxy/x'});
    expect(cover.speakers[0].picture).toBe('/api/media_player_proxy/x');
    expect(cover.tiles[0].picture).toBe('/api/media_player_proxy/x');
    expect(only({state: 'paused', title: null, picture: '/x'}).speakers[0].picture).toBeNull();
  });

  test('its tile says the title, and the artist when there is one', () => {
    expect(only({artist: null}).tiles[0].subLine).toBe('Test tone');
    expect(only({state: 'idle', title: null}).tiles[0].subLine).toBe('HomePod mini · Not playing');
  });

  test('takes the room from its area, else its own name', () => {
    expect(only({}).speakers[0]).toMatchObject({room: 'Living room', name: 'HomePod mini'});
    expect(only({areaId: 'nowhere'}).speakers[0].room).toBe('HomePod mini');
  });

  test('has a stepper only when it can set a volume and reports one', () => {
    expect(only({features: PLAY | PAUSE}).speakers[0].volume).toBeNull();
    expect(only({volume: null}).speakers[0].volume).toBeNull();
    expect(only({available: false, state: 'unavailable'}).speakers[0].volume).toBeNull();
  });

  test.each([
    [0, true, false],
    [0.004, false, false],
    [1, false, true],
    [0.994, false, false],
  ])('a volume of %s: at the bottom %s, at the top %s', (level, atMin, atMax) => {
    expect(only({volume: level}).speakers[0].volume).toMatchObject({atMin, atMax});
  });

  test('never shows a negative zero', () => {
    expect(only({volume: -0.001}).speakers[0].volume).toMatchObject({percent: 0, text: '0%'});
  });

  // the legacy mpVol: the held or reported level and five percent, kept in 0 to 1 at two decimals
  test.each([
    [0.35, 0.3, 0.4],
    [0.333, 0.28, 0.38],
    [0.98, 0.93, 1],
    [0.02, 0, 0.07],
    [1, 0.95, 1],
  ])('a volume of %s steps down to %s and up to %s', (level, down, up) => {
    expect(only({volume: level}).speakers[0].volume).toMatchObject({down, up});
  });

  test('plays and pauses only the way its features allow', () => {
    const pp = (over: Partial<SpeakerInputs>) => only(over).speakers[0].playPause;
    expect(pp({})).toEqual({enabled: true, label: 'Pause', icon: 'pause'});
    // Home Assistant's PAUSE is bit 1 and PLAY is bit 16384: a playing speaker needs PAUSE, a paused one needs PLAY
    expect(pp({features: PLAY | VOLUME_SET})).toMatchObject({enabled: false, icon: 'pause'});
    expect(pp({features: PAUSE})).toMatchObject({enabled: true, icon: 'pause'});
    expect(pp({state: 'paused', features: PLAY})).toMatchObject({enabled: true, icon: 'play'});
    expect(pp({state: 'paused'})).toEqual({enabled: true, label: 'Play', icon: 'play'});
    expect(pp({state: 'paused', features: PAUSE})).toMatchObject({enabled: false, icon: 'play'});
    expect(pp({state: 'idle', title: null})).toMatchObject({enabled: false, icon: 'play'});
    expect(pp({state: 'unavailable', available: false, features: PLAY | PAUSE})).toMatchObject({enabled: false});
  });

  test('its tile has a play control that follows', () => {
    expect(only({state: 'paused'}).tiles[0]).toMatchObject({
      on: false,
      control: {kind: 'play', playing: false, label: 'Play', disabled: false},
    });
    expect(only({state: 'idle', title: null}).tiles[0].control).toMatchObject({disabled: true});
  });
});

describe('the sub-line and the speakers line count what Home Assistant says, as the legacy panel did', () => {
  const house = (...states: string[]) =>
    ({tv: null, speakers: states.map((state, i) => speaker({id: `media_player.s${i}`, state}))}) satisfies MediaInputs;
  const summary = (inputs: MediaInputs, language: Language = 'en') => modelOf(inputs, language).summary;

  test.each([
    [['playing'], '1 speaker playing', '1 speaker playing'],
    [['playing', 'playing', 'idle'], '2 speakers playing', '2 speakers playing'],
    [['idle', 'paused', 'off'], '3 speakers · nothing playing', 'Nothing playing'],
    [['off'], '1 speaker · nothing playing', 'Nothing playing'],
  ])('speakers %j', (states, line, speakersLine) => {
    const vm = modelOf(house(...states));
    expect([vm.summary, vm.speakersLine]).toEqual([line, speakersLine]);
  });

  test('a speaker count follows the television part', () => {
    const inputs = {...house('playing', 'idle'), tv: tv()};
    expect(summary(inputs)).toBe('TV on · Netflix · 1 speaker playing');
    expect(summary({...inputs, tv: tv({state: 'off'})})).toBe('TV off · 1 speaker playing');
    expect(summary({...house('idle', 'idle'), tv: tv({state: 'off'})})).toBe('TV off · 2 speakers · nothing playing');
  });

  test("in French, a count alone is worded and after another part it is the layer's quirk", () => {
    expect(summary(house('playing', 'playing'), 'fr')).toBe('2 haut-parleurs en lecture');
    expect(summary({...house('playing', 'playing'), tv: tv({source: null, summarySource: null})}, 'fr')).toBe(
      'Télé allumée · 2 speakers : en lecture',
    );
    expect(summary(house('idle', 'idle', 'idle'), 'fr')).toBe('3 speakers · nothing : en lecture');
    expect(summary({...house('idle'), tv: tv({state: 'off'})}, 'fr')).toBe(
      'Télé éteinte · 1 speaker · nothing : en lecture',
    );
  });

  test('a speaker the overlay says is playing is not counted before Home Assistant says so', () => {
    const inputs = house('idle');
    const held = holding({'media_player.s0:st': 'playing'});
    expect(modelOf(inputs, 'en', held).summary).toBe('1 speaker · nothing playing');
    expect(modelOf(inputs, 'en', held).speakers[0]).toMatchObject({playing: true});
  });
});

// the More sheet's word under Media: what the legacy moreLines said, the input left out, "Nothing playing" when it says nothing else
describe('the brief line under More', () => {
  const house = (...states: string[]) =>
    ({tv: null, speakers: states.map((state, i) => speaker({id: `media_player.s${i}`, state}))}) satisfies MediaInputs;
  const brief = (inputs: MediaInputs, language: Language = 'en') => mediaBrief(inputs, depsOf(fullHouse, language).t);

  test('the full test house, as the More baselines read it', () => {
    expect(brief(inputsOf(fullHouse))).toBe('TV on · 1 speaker playing');
    expect(brief(inputsOf(fullHouse), 'fr')).toBe('Télé allumée · 1 speaker\u00a0: en lecture');
  });

  test.each([
    [{...house('playing', 'playing'), tv: null}, '2 speakers playing', '2 haut-parleurs en lecture'],
    [{...house('idle'), tv: tv({state: 'off'})}, 'TV off', 'Télé éteinte'],
    [{...house('idle'), tv: tv({state: 'unavailable'})}, 'TV off', 'Télé éteinte'],
    [house('idle', 'paused'), 'Nothing playing', 'Rien en lecture'],
    [{tv: null, speakers: []}, 'Nothing playing', 'Rien en lecture'],
  ])('%j', (inputs, english, french) => {
    expect([brief(inputs), brief(inputs, 'fr')]).toEqual([english, french]);
  });
});

describe('the model applies the held values the overlay gives', () => {
  test('a television held as off is off in the box, the tile, and the switch', () => {
    const vm = tvOnly({}, 'en', holding({'media_player.tv:on': false}));
    expect(vm.tv).toMatchObject({on: false, status: 'Off', screenLabel: null, sourceLabel: ''});
    expect(vm.tiles[0]).toMatchObject({on: false, subLine: 'Off', control: {checked: false}});
  });

  test('a television held as on is on, though the player says off', () => {
    const vm = tvOnly({state: 'off'}, 'en', holding({'media_player.tv:on': true}));
    expect(vm.tv).toMatchObject({on: true, status: 'On'});
  });

  test('a mute held is muted', () => {
    const vm = tvOnly({}, 'en', holding({'media_player.tv:mute': true}));
    expect(vm.tv).toMatchObject({muted: true, status: 'On · muted'});
  });

  test('a state held makes the pod play or pause', () => {
    const vm = modelOf({tv: null, speakers: [speaker()]}, 'en', holding({'media_player.kitchen:st': 'paused'}));
    expect(vm.speakers[0]).toMatchObject({playing: false, loaded: true, playPause: {label: 'Play', icon: 'play'}});
    expect(vm.tiles[0]).toMatchObject({on: false, control: {playing: false, label: 'Play'}});
  });

  test('a volume held is the one shown', () => {
    const vm = modelOf({tv: null, speakers: [speaker()]}, 'en', holding({'media_player.kitchen:vol': 0.5}));
    expect(vm.speakers[0].volume).toMatchObject({percent: 50, text: '50%'});
  });

  describe('through the real store', () => {
    const store = () => {
      let now = 0;
      return {overlay: new OverlayStore({now: () => now}), advance: (ms: number) => (now += ms)};
    };
    const volumeOf = (reported: number, overlay: OverlayStore) =>
      mediaModel(
        {tv: null, speakers: [speaker({volume: reported})]},
        {...depsOf(fullHouse, 'en'), overlay: (key, current) => overlay.read(key, current)},
      ).speakers[0].volume;

    test('a volume held and then reported is released, and one that differs stays held', () => {
      const {overlay} = store();
      overlay.hold(K.volume('media_player.kitchen'), 0.5);
      expect(volumeOf(0.35, overlay)?.percent).toBe(50);
      expect(overlay.size).toBe(1);
      expect(volumeOf(0.5, overlay)?.percent).toBe(50);
      expect(overlay.size).toBe(0);
    });

    test('compares as strings: 0.3 held and 0.30000001 reported differ, and the held one is shown', () => {
      const {overlay} = store();
      overlay.hold(K.volume('media_player.kitchen'), 0.3);
      expect(volumeOf(0.30000001, overlay)?.percent).toBe(30);
      expect(overlay.size).toBe(1);
    });

    test('a value held runs out after twenty seconds, and the reported one shows', () => {
      const {overlay, advance} = store();
      overlay.hold(K.volume('media_player.kitchen'), 0.5);
      advance(20_001);
      expect(volumeOf(0.35, overlay)?.percent).toBe(35);
    });
  });
});
