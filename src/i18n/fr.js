// ---------- French: Québec French when the signed-in HA user's language is French ----------
// The panel is written in English. In French, every text node and label is translated as it is drawn:
// numbers, times and dates are lifted out first and come back in French form, so "Oct 27, 4:07 pm" needs no entry of its own,
// then the rest is looked up whole, by pattern, or piece by piece around " · ". Anything not found stays as it was.
// Names people gave in Home Assistant (areas, scenes, lights, sensors) are never translated.
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EN_MONL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const EN_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  EN_WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FR_MON = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const FR_MONL = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];
const FR_WD = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  FR_WDL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const frCap = x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
const frMo = m => (
  (m = frCap(m)),
  EN_MONL.includes(m) ? FR_MONL[EN_MONL.indexOf(m)] : FR_MON[EN_MON.indexOf(m.slice(0, 3))]
);
const frWd = w => ((w = frCap(w)), EN_WDL.includes(w) ? FR_WDL[EN_WDL.indexOf(w)] : FR_WD[EN_WD.indexOf(w)]);
const frH = (h, m, ap) => `${(+h % 12) + (/p/i.test(ap) ? 12 : 0)} h${m && m !== '00' ? ' ' + m : ''}`;
// 1,234.5 -> 1 234,5 and 12.5 -> 12,5; version numbers like 1.9.1 stay as they are
const frNum = v => {
  const g = v[0] === '-' ? '-' : '',
    b = g ? v.slice(1) : v;
  return (
    g +
    (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(b)
      ? b.replace(/,/g, '\u202f').replace('.', ',')
      : /^\d+\.\d+$/.test(b)
        ? b.replace('.', ',')
        : b)
  );
};
const MO =
  'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const MOS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec',
  WDL = 'Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday',
  WDS = 'Sun|Mon|Tue|Wed|Thu|Fri|Sat';
// order matters: whole dates before their parts, times before bare numbers
const FR_TOK = [
  [`\\b(${WDL}), (${MO}) (\\d{1,2})\\b`, (w, m, d) => `${frWd(w)} ${d} ${frMo(m)}`],
  [`\\b(${WDS}),? (${MO}) (\\d{1,2})\\b`, (w, m, d) => `${frWd(w)} ${d} ${frMo(m)}`],
  [`\\b(${MO}) (\\d{1,2}), (\\d{4})\\b`, (m, d, y) => `${d} ${frMo(m)} ${y}`],
  [`\\b(${MO}) ['’](\\d{2})\\b`, (m, y) => `${frMo(m)} 20${y}`],
  [`\\b(${MO}) (\\d{4})\\b`, (m, y) => `${frMo(m)} ${y}`],
  [`\\b(${MO}) (\\d{1,2})\\b(?![:.]\\d)`, (m, d) => `${d} ${frMo(m)}`],
  [`\\b(\\d{1,2}) (${MOS})\\b`, (d, m) => `${d} ${frMo(m)}`],
  [`\\b(${WDS}),? (\\d{1,2})(?::(\\d{2}))? ?([ap])\\.?m\\b\\.?`, (w, h, m, ap) => `${frWd(w)} ${frH(h, m, ap)}`],
  [`\\b(${WDS}) (\\d{1,2})\\b(?![:\\d])`, (w, d) => `${frWd(w)} ${d}`],
  [`\\b(\\d{1,2}):(\\d{2}) ?([ap])\\.?m\\b\\.?`, (h, m, ap) => frH(h, m, ap)],
  [`\\b(\\d{1,2}) ?([ap])\\.?m\\b\\.?`, (h, ap) => frH(h, '', ap)],
  ['[-−]?\\d+(?:[.,]\\d+)*', n => frNum(n.replace('−', '-'))],
].map(
  /**
   * @param {[string, (...g: string[]) => string]} rule
   * @returns {[RegExp, (...g: string[]) => string]}
   */
  ([rx, f]) => [new RegExp(rx, /\[ap\]/.test(rx) ? 'gi' : 'g'), f],
);
// English text -> lookup key with {n} for each number, time or date; their French forms go into vals, in reading order
const frKey = (s, vals) => {
  const got = [],
    mark = /[\uE100-\uE8FF]/;
  for (const [rx, f] of FR_TOK)
    s = s.replace(rx, (...a) => {
      const whole = a[0],
        g = a.slice(1, a.length - 2);
      // a later rule must not reach into a placeholder already made
      if (mark.test(whole) || got.length > 1700) return whole;
      got.push(f(...(g.length ? g : [whole])));
      return String.fromCharCode(0xe100 + got.length - 1);
    });
  return s.replace(/[\uE100-\uE8FF]/g, c => {
    vals.push(got[c.charCodeAt(0) - 0xe100]);
    return '{n}';
  });
};
const FR_UNITS =
  /^(?:\{n\}|[\s°%·–\-−+/,()×]|°C|kWh|MWh|kW|W|V|A|km\/h|km|kPa|ppm|µg\/m³|lx|lux|psi|¢\/kWh|¢|h|min|s|k|RH|AQI|UV|PM\{n\}|CO₂|CO|VOC)+$/;
// the names people gave in HA: areas, devices, the kinds of entity whose friendly name is theirs and the rooms the thermostats
// name, each as Home Assistant gives it and as the panel shows it (the store's display names: `Living room` is read `Salon`
// in French), so the layer leaves both alone
function houseNames(hass, name) {
  const S = new Set(),
    reg = hass.entities || {},
    keep = /^(scene|script|input_boolean|light|binary_sensor|camera|media_player|person|fan|switch|lock)\./;
  const add = (id, given) => {
    S.add(given);
    S.add(name(id));
  };
  Object.entries(hass.areas || {}).forEach(([id, a]) => a.name && add(id, a.name));
  Object.entries(hass.devices || {}).forEach(([id, d]) => d.name_by_user && add(id, d.name_by_user));
  // a name the house or the room dictionary changed is the house's, whoever made the thing it names (a device with only its
  // own name, an entity of any other kind); one they left as it was is not, and stays open to translation
  const changed = (id, given) => given && name(id) !== given && S.add(name(id));
  Object.entries(hass.devices || {}).forEach(([id, d]) => changed(id, d.name_by_user || d.name));
  for (const [id, s] of Object.entries(hass.states)) {
    const p = (reg[id] || {}).platform;
    // a thermostat is shown as a room, by its name without the `Thermostat` the integration puts in front
    changed(id, s.attributes.friendly_name);
    if (id.startsWith('climate.') && s.attributes.friendly_name) {
      const room = String(s.attributes.friendly_name).replace(/^Thermostat\s*/i, '');
      if (room) {
        S.add(room);
        S.add(name(room));
      }
    }
    if (
      keep.test(id) &&
      !['fordpass', 'wallbox', 'adaptive_lighting', 'hilo', 'unifiprotect'].includes(p) &&
      s.attributes.friendly_name
    )
      add(id, s.attributes.friendly_name);
  }
  return S;
}
function frLook(k) {
  let v = FR_MAP[k];
  if (v != null) return v;
  v = FR_LOW[k.toLowerCase()];
  if (v != null) return v;
  for (const [rx, f] of FR_RX) {
    const m = k.match(rx);
    if (m) {
      const r = f(...m.slice(1));
      if (r != null) return r;
    }
  }
  // "a · b · c": each part on its own; parts without an entry stay as they are
  if (k.includes(' · ')) {
    const p = k.split(' · '),
      t = p.map(x => frLook(x));
    if (t.some(x => x != null)) return t.map((x, i) => x ?? p[i]).join(' · ');
  }
  if (FR_UNITS.test(k)) return k;
  return null;
}
// a name, or its translation when it is one of ours
const frOr = x => frLook(x) ?? x;
// French typography: a narrow space before %, a non-breaking one before a colon, dollars after the amount, no doubled period after an abbreviation
const frPost = s =>
  s
    .replace(/(\d)%/g, '$1\u202f%')
    .replace(/ :/g, '\u00a0:')
    .replace(/\$\s?(-?\d[\d\u202f]*(?:,\d+)?)/g, '$1\u00a0$$')
    .replace(/([a-zé]\.)\./g, '$1');
// `isName(core)`: whether the text is a name the house gave in HA, which is never translated
function frText(s, isName) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s),
    core = m[2];
  if (!core || isName(core)) return s;
  if (!/[A-Za-z]/.test(core))
    return /\d/.test(core) ? m[1] + frPost(core.replace(/\d+(?:[.,]\d+)*/g, frNum)) + m[3] : s;
  const vals = [],
    k = frKey(core, vals);
  let out = frLook(k);
  if (out == null) return s;
  let i = 0;
  out = out.replace(/\{n\}/g, () => vals[i++] ?? '');
  if (/^[A-ZÀ-Ý]/.test(core) && /^[a-zà-ÿ]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  out = frPost(out);
  return m[1] + out + m[3];
}
export const FR_ATTR = ['aria-label', 'aria-description', 'title', 'placeholder', 'alt'];
function frNode(n, translate, seen) {
  if (n.nodeType === 3) {
    const p = n.parentNode;
    if (!p || p.nodeName === 'STYLE' || p.nodeName === 'SCRIPT' || seen.get(n) === n.data) return;
    // song titles and the like are marked translate="no"
    if (p.closest && p.closest('[translate="no"]')) return;
    const t = translate(n.data);
    if (t !== n.data) n.data = t;
    seen.set(n, n.data);
  } else if (n.nodeType === 1) {
    if (n.nodeName === 'STYLE' || n.nodeName === 'SCRIPT') return;
    // translate="no" covers the element's own labels too, not only the text under it
    if (n.closest && n.closest('[translate="no"]')) return;
    const done = seen.get(n) || {};
    for (const a of FR_ATTR) {
      const v = n.getAttribute(a);
      if (!v || done[a] === v) continue;
      const t = translate(v);
      if (t !== v) n.setAttribute(a, t);
      done[a] = t;
    }
    seen.set(n, done);
  }
}
function frTree(root, visit) {
  if (root.nodeType === 3) return visit(root);
  if (root.nodeType === 1) visit(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) visit(n);
}
// apex draws its own dates: give it French month and day names and day-first formats
const APEX_FR = {
  name: 'fr',
  options: {months: FR_MONL, shortMonths: FR_MON, days: FR_WDL, shortDays: FR_WD, toolbar: {}},
};
const frFmt = f =>
  typeof f !== 'string'
    ? f
    : f
        .replace(/MMM d\b/, 'd MMM')
        .replace(/h:mm tt|h tt/g, 'HH:mm')
        .replace(/, (?=HH)/, ' ')
        .replace(/MMM d, yyyy/, 'd MMM yyyy');
function frApex(o) {
  o.chart = {...o.chart, locales: [APEX_FR], defaultLocale: 'fr'};
  if (o.tooltip && o.tooltip.x && o.tooltip.x.format) o.tooltip.x = {...o.tooltip.x, format: frFmt(o.tooltip.x.format)};
  if (o.xaxis && o.xaxis.type === 'datetime')
    o.xaxis = {
      ...o.xaxis,
      labels: {datetimeFormatter: {year: 'yyyy', month: 'MMM yyyy', day: 'd MMM', hour: 'HH:mm'}, ...o.xaxis.labels},
    };
  if (o.xaxis && o.xaxis.labels && o.xaxis.labels.format)
    o.xaxis.labels = {...o.xaxis.labels, format: frFmt(o.xaxis.labels.format)};
  return o;
}
/**
 * The translator for one panel: text, node, tree and apex, reading the names the house gave from the store's hass and its
 * display names (with a cache of their own) and the language from the store, so two panels on a page do not share either.
 * Nothing is translated while the store's language is not French. The module keeps no state of its own.
 * @param {{hass: any, isFrench: boolean, names: {name: (key: string) => string}}} store
 */
export function createFrench(store) {
  let names = new Set(),
    namesAt = 0,
    resolver = null;
  // kept for a minute, and dropped when the store rebuilds its display names (the language or the config changed)
  const houseNamesNow = () => {
    if (resolver === store.names && Date.now() - namesAt < 60000 && names.size) return names;
    resolver = store.names;
    names = houseNames(store.hass, key => store.names.name(key));
    namesAt = Date.now();
    return names;
  };
  const seen = new WeakMap();
  const text = s => (store.isFrench ? frText(s, core => houseNamesNow().has(core)) : s);
  // an English panel marks nothing as seen, so a switch to French still translates what it already drew
  const node = n => {
    if (store.isFrench) frNode(n, text, seen);
  };
  return {
    text,
    node,
    tree: root => {
      if (store.isFrench) frTree(root, node);
    },
    apex: o => (store.isFrench ? frApex(o) : o),
  };
}
// English -> Québec French. Keys are the English text with {n} for each number, time or date (see frKey).
export const FR_MAP = {
  // ---- header, tabs, status ----
  Home: 'Maison',
  Rooms: 'Pièces',
  Phone: 'Téléphone',
  View: 'Vue',
  'Good morning': 'Bonjour',
  'Good afternoon': 'Bon après-midi',
  'Good evening': 'Bonsoir',
  'Good night': 'Bonne nuit',
  'Good morning,': 'Bonjour,',
  'Good afternoon,': 'Bon après-midi,',
  'Good evening,': 'Bonsoir,',
  'Good night,': 'Bonne nuit,',
  'Live · history {n}': 'En direct · historique {n}',
  'Live · loading history': "En direct · chargement de l'historique",
  'Open the sidebar': 'Ouvrir le menu latéral',
  Status: 'État',
  'Status checks': 'Vérifications',
  'All clear': 'Tout va bien',
  'Everything is reporting normally.': 'Tout fonctionne normalement.',
  '{n} thing needs attention': '{n} élément à vérifier',
  '{n} things need attention': '{n} éléments à vérifier',
  '{n} item needs attention': '{n} élément à vérifier',
  '{n} items need attention': '{n} éléments à vérifier',
  '{n} item need attention': '{n} élément à vérifier',
  'Critical peak now': 'Pointe critique en cours',
  'Critical peak in progress': 'Pointe critique en cours',
  'Critical peak coming': 'Pointe critique à venir',
  'No critical peak': 'Aucune pointe critique',
  'Hydro-Québec peak period: lower consumption now.':
    'Période de pointe Hydro-Québec : réduisez la consommation maintenant.',
  'Hydro-Québec announced an upcoming critical peak.': 'Hydro-Québec a annoncé une pointe critique à venir.',
  'Hydro-Québec not updating': 'Hydro-Québec ne se met pas à jour',
  'Hydro-Québec updating': 'Hydro-Québec à jour',
  'Billing and peak data are unavailable. Check the Hydro-Québec integration, it may need your password again.':
    "Les données de facturation et de pointe sont indisponibles. Vérifiez l'intégration Hydro-Québec : elle demande peut-être à nouveau votre mot de passe.",
  'Heat pump offline': 'Thermopompe hors ligne',
  'Heat pump online': 'Thermopompe en ligne',
  'The Fujitsu unit shows as unavailable in Home Assistant.':
    "L'appareil Fujitsu apparaît comme indisponible dans Home Assistant.",
  'Hilo gateway offline': 'Passerelle Hilo hors ligne',
  'Hilo gateway online': 'Passerelle Hilo en ligne',
  'Thermostats and the meter may stop reporting.': 'Les thermostats et le compteur pourraient cesser de transmettre.',
  '{n} thermostat not reporting': '{n} thermostat ne répond pas',
  '{n} thermostats not reporting': '{n} thermostats ne répondent pas',
  'Weather warning': 'Avertissement météo',
  'No weather alerts': 'Aucune alerte météo',
  'Environment Canada has {n} warning for your area.':
    'Environnement Canada a émis {n} avertissement pour votre secteur.',
  'Environment Canada has {n} warnings for your area.':
    'Environnement Canada a émis {n} avertissements pour votre secteur.',
  'Tire pressure low': 'Pression des pneus basse',
  'The car reports a tire below its normal pressure.': 'La voiture signale un pneu sous sa pression normale.',
  'Car unlocked': 'Voiture déverrouillée',
  'Car locked': 'Voiture verrouillée',
  'Lock it from the car view.': 'Verrouillez-la depuis la vue de la voiture.',
  'Car not reporting': 'La voiture ne répond pas',
  'The Ford integration has no battery data right now.':
    "L'intégration Ford n'a pas de données de batterie pour le moment.",
  'Open for {n} min.': 'Ouverte depuis {n} min.',
  'Open for {n} h.': 'Ouverte depuis {n} h.',
  'Open for just now.': "Ouverte à l'instant.",
  'The sensor is unavailable in Home Assistant.': 'Le capteur est indisponible dans Home Assistant.',
  '{n}% left.': '{n}% restant.',
  'Doors closed': 'Portes fermées',
  // the More sheet's line for Security ("Doors closed · motion now")
  'motion now': 'mouvement en cours',
  'Wallbox offline': 'Wallbox hors ligne',
  'The charger is unavailable in Home Assistant.': 'La borne est indisponible dans Home Assistant.',
  "History didn't load: {n}. Live values still update.":
    "L'historique n'a pas chargé : {n}. Les valeurs en direct se mettent quand même à jour.",
  "Didn't work:": 'Échec :',
  // ---- general words ----
  Close: 'Fermer',
  Yesterday: 'Hier',
  Tomorrow: 'Demain',
  Tonight: 'Ce soir',
  Day: 'Jour',
  Week: 'Semaine',
  Month: 'Mois',
  Year: 'Année',
  Now: 'Maintenant',
  Off: 'Éteint',
  Open: 'Ouverte',
  Closed: 'Fermée',
  Offline: 'Hors ligne',
  Unavailable: 'Indisponible',
  'Not found': 'Introuvable',
  'not reporting': 'ne répond pas',
  Running: 'En marche',
  Ready: 'Prête',
  Done: 'Fait',
  'No history yet': "Pas encore d'historique",
  'No data': 'Aucune donnée',
  'no data': 'aucune donnée',
  'No readings yet': 'Aucune mesure pour le moment',
  Average: 'Moyenne',
  Mean: 'Moyenne',
  'Low to high': 'Du plus bas au plus haut',
  Peak: 'Pointe',
  Date: 'Date',
  Time: 'Heure',
  Length: 'Durée',
  Energy: 'Énergie',
  'Est. cost': 'Coût estimé',
  Totals: 'Totaux',
  Software: 'Logiciel',
  Fan: 'Ventilateur',
  Normal: 'Normal',
  'Zoom in': 'Zoom avant',
  'Zoom out': 'Zoom arrière',
  'just now': "à l'instant",
  '{n} min ago': 'il y a {n} min',
  '{n} h ago': 'il y a {n} h',
  '· {n} min ago': '· il y a {n} min',
  '· {n} h ago': '· il y a {n} h',
  '· for {n} min': '· depuis {n} min',
  '· for {n} h': '· depuis {n} h',
  'since {n}': 'depuis le {n}',
  'until {n}': "jusqu'à {n}",
  'from {n}': 'à partir du {n}',
  '{n}, {n} to {n}, {n}': '{n}, {n} au {n}, {n}',
  '{n} · latest': '{n} · le plus récent',
  'Every day': 'Tous les jours',
  'every day': 'tous les jours',
  weekdays: 'en semaine',
  'no days': 'aucun jour',
  '{n} days': '{n} jours',
  '{n} day': '{n} jour',
  '{n} h': '{n} h',
  '{n} k': '{n} k',
  '{n}k': '{n} k',
  'Last {n} days': '{n} derniers jours',
  'last {n} days': '{n} derniers jours',
  'last {n} hours': 'dernières {n} heures',
  'last {n} months': '{n} derniers mois',
  'Last {n} days, day by day': '{n} derniers jours, jour par jour',
  'Last {n} days, hour by hour': '{n} derniers jours, heure par heure',
  'Today, hour by hour': "Aujourd'hui, heure par heure",
  'Month by month': 'Mois par mois',
  'Today so far': "Aujourd'hui jusqu'ici",
  // ---- greetings bar: who's home ----
  "Who's home": 'Qui est à la maison',
  home: 'à la maison',
  away: 'absent',
  Away: 'Absent',
  // ---- weather ----
  Weather: 'Météo',
  'same as the air': "comme l'air",
  'wind chill': 'refroidissement éolien',
  humidex: 'humidex',
  Wind: 'Vent',
  '· gusts {n}': '· rafales {n}',
  Humidity: 'Humidité',
  'dew point {n}°': 'point de rosée {n}°',
  UV: 'UV',
  Sun: 'Soleil',
  Sunrise: 'Lever du soleil',
  Sunset: 'Coucher du soleil',
  'visibility {n} km': 'visibilité {n} km',
  'High {n}° · Low {n}°': 'Max {n}° · Min {n}°',
  'High {n}° · Low {n}° · normal {n}° / {n}°': 'Max {n}° · Min {n}° · normale {n}° / {n}°',
  'high / low for the date': 'max / min pour la date',
  low: 'min',
  Low: 'Bas',
  High: 'Haut',
  Medium: 'Moyen',
  'chance today': "probabilité aujourd'hui",
  Rain: 'Pluie',
  Snow: 'Neige',
  Cool: 'Frais',
  Comfortable: 'Confortable',
  Warm: 'Chaud',
  Hot: 'Très chaud',
  'Average {n}°': 'Moyenne {n}°',
  'Outside {n}°': 'Dehors {n}°',
  'outside {n}°': 'dehors {n}°',
  '{n} over {n}°': '{n} j au-dessus de {n}°',
  Warning: 'Avertissement',
  Watch: 'Veille',
  Advisory: 'Avis',
  Statement: 'Bulletin',
  'in effect': 'en vigueur',
  'no alerts': 'aucune alerte',
  '{n} alert in effect': '{n} alerte en vigueur',
  '{n} alerts in effect': '{n} alertes en vigueur',
  '{n} warning in effect': '{n} avertissement en vigueur',
  '{n} watch in effect': '{n} veille en vigueur',
  '{n} watchs in effect': '{n} veilles en vigueur',
  '{n} advisory in effect': '{n} avis en vigueur',
  '{n} advisorys in effect': '{n} avis en vigueur',
  '{n} statement in effect': '{n} bulletin en vigueur',
  '{n} statements in effect': '{n} bulletins en vigueur',
  'observed {n}': 'observé à {n}',
  'observed {n} at {n}': 'observé à {n} à {n}',
  'pressure falling': 'pression en baisse',
  'pressure rising': 'pression en hausse',
  'pressure steady': 'pression stable',
  falling: 'en baisse',
  rising: 'en hausse',
  steady: 'stable',
  'A JavaScript library for interactive maps': 'Une bibliothèque JavaScript pour les cartes interactives',
  // ---- energy ----
  Idle: 'Au repos',
  Heating: 'Chauffe',
  'rate unknown': 'tarif inconnu',
  '{n} kWh today': "{n} kWh aujourd'hui",
  'Heating, {n} days': 'Chauffage, {n} jours',
  'at {n}¢/kWh': 'à {n} ¢/kWh',
  'Water heater': 'Chauffe-eau',
  'Heating · {n} kW': 'Chauffe · {n} kW',
  'low rate': 'tarif bas',
  'medium rate': 'tarif moyen',
  'Challenge:': 'Défi :',
  // ---- climate ----
  Climate: 'Climat',
  'inside ·': 'dedans ·',
  '{n} room heating': '{n} pièce chauffe',
  '{n} rooms heating': '{n} pièces chauffent',
  'All off': 'Tout éteindre',
  'heat pump off': 'thermopompe éteinte',
  'heat pump offline': 'thermopompe hors ligne',
  '{n}° outside': '{n}° dehors',
  // heat pump modes and settings
  Heat: 'Chauffage',
  Dry: 'Déshumidification',
  Auto: 'Auto',
  Eco: 'Éco',
  Boost: 'Boost',
  Diffuse: 'Diffus',
  Quiet: 'Silencieux',
  Sleep: 'Sommeil',
  Comfort: 'Confort',
  // ---- lights ----
  Arrange: 'Réorganiser',
  'Reset order': 'Ordre par défaut',
  'Drag the lights into the order you want': 'Glissez les lumières dans l’ordre voulu',
  'Light order saved': 'Ordre des lumières enregistré',
  'Light order reset': 'Ordre des lumières par défaut',
  "Couldn't save the light order: {n}": 'Impossible d’enregistrer l’ordre des lumières : {n}',
  'Switch, brightness and colour move both': 'L’interrupteur, l’intensité et la couleur suivent pour les deux',
  Lights: 'Lumières',
  'Other lights': 'Autres lumières',
  'On · {n}%': 'Allumé · {n}%',
  'On · {n} W': 'Allumée · {n} W',
  'Outlet on': 'Prise allumée',
  'Outlet off': 'Prise éteinte',
  '{n} of {n} on · {n}%': '{n} sur {n} allumées · {n}%',
  '{n} of {n} on': '{n} sur {n} allumées',
  '{n} lights on': '{n} lumières allumées',
  '{n} light on': '{n} lumière allumée',
  'lights on ·': 'lumières allumées ·',
  'light on ·': 'lumière allumée ·',
  'lights on': 'lumières allumées',
  'light on': 'lumière allumée',
  'lights on · Doors closed': 'lumières allumées · Portes fermées',
  'Adaptive Lighting: colour and brightness follow the time of day':
    "Éclairage adaptatif : la couleur et l'intensité suivent l'heure du jour",
  'Adaptive Lighting on': 'Éclairage adaptatif activé',
  Night: 'Nuit',
  'Night mode on': 'Mode nuit activé',
  'Night mode off': 'Mode nuit désactivé',
  'Night mode: very dim, warm light': 'Mode nuit : lumière très tamisée et chaude',
  // ---- play and pause (the Automations' media actions, the now-playing stack card) ----
  Pause: 'Pause',
  Playing: 'En lecture',
  Play: 'Lecture',
  // ---- room status chips (phone) ----
  Outlet: 'Prise',
  Outlets: 'Prises',
  '{n} on': '{n} allumées',
  'Air purifier': "Purificateur d'air",
  Motion: 'Mouvement',
  Detected: 'Détecté',
  'Not detected': 'Non détecté',
  'Carbon monoxide': 'Monoxyde de carbone',
  '{n} Lights': '{n} lumières',
  '{n} Light': '{n} lumière',
  Occupancy: 'Occupation',
  // ---- air ----
  'Open air quality details': "Ouvrir les détails de la qualité de l'air",
  Good: 'Bon',
  Moderate: 'Moyen',
  Poor: 'Mauvais',
  // the Home tile's line when CO₂ and VOC both run high ("Office: CO₂ 1 500, VOC 400"), still drawn by the legacy panel until #268
  'CO₂ {n}, VOC {n}': 'CO₂ {n}, COV {n}',
  // ---- doors and windows (the car's status, the More sheet) ----
  'A door is open': 'Une porte est ouverte',
  'A window is open': 'Une fenêtre est ouverte',
  '{n} door open': '{n} porte ouverte',
  '{n} doors open': '{n} portes ouvertes',
  Automations: 'Automatisations',
  Today: "Aujourd'hui",
  'Ran today': "Exécutées aujourd'hui",
  Next: 'Prochaine',
  Then: 'Ensuite',
  'Every automation': 'Toutes les automatisations',
  'Latest first. Tap one to draw its flow with its last run lit up.':
    'Les plus récentes d’abord. Touchez-en une pour voir son parcours, avec sa dernière exécution en couleur.',
  'One dot per run. Filled ran, ringed red checked and did nothing, green is running now, hollow is still to come. Tap one to draw it below.':
    'Un point par exécution. Plein : exécutée; cerclé de rouge : vérifiée, rien fait; vert : en cours; vide : à venir. Touchez-en un pour le voir plus bas.',
  'path taken': 'parcours suivi',
  'waiting here': 'en attente ici',
  stopped: 'arrêtée',
  'not taken': 'non suivi',
  'nothing running': 'rien en cours',
  'Running now': 'En cours',
  'Last decision': 'Dernière décision',
  'Last completed': 'Dernière terminée',
  Selected: 'Choisie',
  'no run stored': 'aucune exécution gardée',
  'every run passed its checks': 'toutes ont passé leurs vérifications',
  'nothing else scheduled today': "rien d'autre de prévu aujourd'hui",
  'Reading the automation runs from Home Assistant…': 'Lecture des exécutions dans Home Assistant…',
  'No automation has run since Home Assistant last started.':
    "Aucune automatisation n'a tourné depuis le dernier démarrage de Home Assistant.",
  'No run of this automation is stored since Home Assistant last started, so this is its shape only.':
    'Aucune exécution gardée depuis le dernier démarrage de Home Assistant : voici seulement sa forme.',
  '{n} run today': "{n} exécution aujourd'hui",
  '{n} runs today': "{n} exécutions aujourd'hui",
  '{n} running': '{n} en cours',
  '{n} enabled': '{n} activées',
  '{n} off': '{n} désactivées',
  '{n} more checked and did nothing': '{n} autres vérifiées, rien fait',
  'running {n}': 'en cours {n}',
  'stopped {n}': 'arrêtée {n}',
  'done {n}': 'terminée {n}',
  never: 'jamais',
  Temperatures: 'Températures',
  Outside: 'Extérieur',
  'Heat pump': 'Thermopompe',
  '{n}° inside on average': '{n}° en moyenne à l’intérieur',
  'Set {n}°': 'Consigne {n}°',
  'Heating {n}°': 'Chauffe {n}°',
  Security: 'Sécurité',
  '{n}° inside · {n} lights on · Doors closed': '{n}° dedans · {n} lumières allumées · Portes fermées',
  Charger: 'Borne',
  'Car not plugged in': 'Voiture non branchée',
  // ---- car ----
  Car: 'Voiture',
  'Open car details': 'Ouvrir les détails de la voiture',
  'Car status': 'État de la voiture',
  Battery: 'Batterie',
  Charging: 'Recharge',
  'Charge limit': 'Limite de charge',
  'Charge limit {n}%': 'Limite de charge {n}%',
  'Limit {n}%': 'Limite {n}%',
  'Charge limit, read only': 'Limite de charge, lecture seule',
  Full: 'Pleine',
  'Full range': 'Autonomie complète',
  'Battery {n} percent': 'Batterie {n} pour cent',
  'Battery {n} percent, charge limit {n} percent': 'Batterie {n} pour cent, limite de charge {n} pour cent',
  '{n} km range': "{n} km d'autonomie",
  locked: 'verrouillée',
  unlocked: 'déverrouillée',
  charging: 'en recharge',
  'plugged in': 'branchée',
  unplugged: 'débranchée',
  'Parked at home': 'Stationnée à la maison',
  'Parked at home · locked · the car last checked in at {n}':
    'Stationnée à la maison · verrouillée · dernier contact de la voiture à {n}',
  'the car last checked in at {n}': 'dernier contact de la voiture à {n}',
  Locked: 'Verrouillée',
  Unlocked: 'Déverrouillée',
  Lock: 'Verrouiller',
  Unlock: 'Déverrouiller',
  Unplugged: 'Débranchée',
  Plug: 'Prise',
  'In park': 'En position P',
  'Last charge': 'Dernière recharge',
  Odometer: 'Odomètre',
  Wallbox: 'Wallbox',
  'Daily EV energy, last {n} days: {n} charging days, {n} kWh.':
    'Énergie VÉ quotidienne, {n} derniers jours : {n} jours de recharge, {n} kWh.',
  'Daily EV energy, last {n} days: {n} charging day, {n} kWh.':
    'Énergie VÉ quotidienne, {n} derniers jours : {n} jour de recharge, {n} kWh.',
  'Blue Mustang Mach-E, side view': 'Mustang Mach-E bleue, vue de côté',
  'Car seen from above': 'Voiture vue de haut',
  'No FordPass car found.': 'Aucune voiture FordPass trouvée.',
  '{n} of {n} kWh usable · battery at {n}°': '{n} sur {n} kWh utilisables · batterie à {n}°',
  'The Ford integration has no battery data right now':
    "L'intégration Ford n'a pas de données de batterie pour le moment",
  'Home charger': 'Borne à la maison',
  'Wallbox Pulsar Plus · ready, car not plugged in': 'Wallbox Pulsar Plus · prête, voiture non branchée',
  'Power limit': 'Limite de puissance',
  'Charging current limit': 'Limite du courant de recharge',
  'Sets the Wallbox maximum current. kW assumes {n} V.':
    'Règle le courant maximal de la Wallbox. Les kW supposent {n} V.',
  'Set in the FordPass app. Home Assistant can read it but has no control for it.':
    "Se règle dans l'application FordPass. Home Assistant peut la lire mais ne peut pas la changer.",
  'On. Turn off to pause': 'En marche. Désactiver pour mettre en pause',
  'Paused. Turn on to resume': 'En pause. Activer pour reprendre',
  'Available while the car is plugged in': 'Disponible quand la voiture est branchée',
  'Lock charger': 'Verrouiller la borne',
  'Locked, needs the app or RFID card': "Verrouillée, demande l'application ou la carte RFID",
  'Unlocked, anyone can plug in': "Déverrouillée, n'importe qui peut se brancher",
  'Charger locked': 'Borne verrouillée',
  'Charger unlocked': 'Borne déverrouillée',
  'Wallbox limit set to {n} A': 'Limite de la Wallbox réglée à {n} A',
  'Charging on': 'Recharge activée',
  'Charging off': 'Recharge en pause',
  'Comfort and access': 'Confort et accès',
  'Remote start': 'Démarrage à distance',
  'Remote start warms or cools the cabin for about {n} minutes':
    "Le démarrage à distance réchauffe ou refroidit l'habitacle pendant environ {n} minutes",
  'Tap again to start': 'Toucher de nouveau pour démarrer',
  'Tap again to unlock': 'Toucher de nouveau pour déverrouiller',
  'Remote start sent to the car': 'Démarrage à distance envoyé à la voiture',
  'Remote start stopped': 'Démarrage à distance arrêté',
  'Lock sent to the car': 'Verrouillage envoyé à la voiture',
  'Unlock sent to the car': 'Déverrouillage envoyé à la voiture',
  'Honk & flash': 'Klaxon et phares',
  'Honk and flash sent': 'Klaxon et phares envoyés',
  Cabin: 'Habitacle',
  'Off · cabin HI': 'Arrêté · habitacle HI',
  'Off · cabin LO': 'Arrêté · habitacle LO',
  'Heated wheel': 'Volant chauffant',
  'Heated windshield': 'Pare-brise chauffant',
  'Rear defrost': 'Dégivrage arrière',
  'With remote start: on': 'Au démarrage à distance : activé',
  'With remote start: off': 'Au démarrage à distance : désactivé',
  'Front seats heat at level {n} with remote start.': 'Sièges avant chauffés au niveau {n} au démarrage à distance.',
  'Front seats cool at level {n} with remote start.': 'Sièges avant ventilés au niveau {n} au démarrage à distance.',
  'Departure times': 'Heures de départ',
  'Departure times off': 'Heures de départ désactivées',
  'Departure time': 'Heure de départ',
  'Departure days': 'Jours de départ',
  'Cabin temperature at departure': "Température de l'habitacle au départ",
  'Precondition for departure': 'Préconditionner pour le départ',
  'Save schedule': "Enregistrer l'horaire",
  'No departure times saved.': 'Aucune heure de départ enregistrée.',
  'Weekdays at {n} saved.': 'En semaine à {n}, enregistré.',
  'Off · weekdays at {n} saved': 'Désactivé · en semaine à {n} enregistré',
  'weekdays at {n}': 'en semaine à {n}',
  'every day at {n}': 'tous les jours à {n}',
  'Pick a cabin temperature first': "Choisissez d'abord une température d'habitacle",
  'Pick at least one day': 'Choisissez au moins un jour',
  "When the car is plugged in, it warms the cabin and the battery to be ready at this time. Ford doesn't report the cabin setting of a saved schedule, so pick one before saving.":
    "Quand la voiture est branchée, elle réchauffe l'habitacle et la batterie pour être prête à cette heure. Ford ne transmet pas le réglage d'habitacle d'un horaire enregistré, choisissez-en un avant d'enregistrer.",
  'Departure schedule saved:': 'Horaire de départ enregistré :',
  'Charging history': 'Historique de recharge',
  Sessions: 'Sessions',
  Delivered: 'Fournie',
  'per session': 'par session',
  'per the Wallbox': 'selon la Wallbox',
  'Range added': 'Autonomie ajoutée',
  '{n} charging sessions on the Wallbox since {n}. Cost is estimated at the {n}¢/kWh set in the Wallbox app.':
    "{n} sessions de recharge sur la Wallbox depuis le {n}. Le coût est estimé au tarif de {n} ¢/kWh réglé dans l'application Wallbox.",
  'No charging sessions in the last year.': 'Aucune session de recharge dans la dernière année.',
  'Show all {n} sessions': 'Afficher les {n} sessions',
  'Show the latest {n}': 'Afficher les {n} plus récentes',
  '{n} session': '{n} session',
  '{n} sessions': '{n} sessions',
  'stopped at the limit': 'arrêtée à la limite',
  'Last plug-in, per Ford': 'Dernier branchement, selon Ford',
  'From Ford': 'De Ford',
  'Messages and schedules from the FordPass app': "Messages et horaires de l'application FordPass",
  "Tire pressures from the car's sensors": 'Pression des pneus selon les capteurs de la voiture',
  'Front left': 'Avant gauche',
  'Front right': 'Avant droit',
  'Rear left': 'Arrière gauche',
  'Rear right': 'Arrière droit',
  Gear: 'Rapport',
  'The Tire Pressure Monitoring System has detected one or more tires are significantly under-inflated.':
    'Le système de surveillance de la pression des pneus a détecté un ou plusieurs pneus nettement sous-gonflés.',
  'Tire Pressure Monitor System Warning, {n}': 'Avertissement du système de surveillance de la pression des pneus, {n}',
  'All doors, windows, hood and tailgate closed': 'Portes, fenêtres, capot et hayon fermés',
  'All doors, hood and tailgate closed': 'Portes, capot et hayon fermés',
  'Hood and tailgate closed': 'Capot et hayon fermés',
  'Hood or tailgate open': 'Capot ou hayon ouvert',
  'Windows closed': 'Fenêtres fermées',
  'Open:': 'Ouvert :',
  'Alarm off': 'Alarme désactivée',
  'Alarm armed': 'Alarme activée',
  'Alarm triggered': 'Alarme déclenchée',
  'Lock status unknown': 'État du verrouillage inconnu',
  'Charged at home': 'Rechargée à la maison',
  'AC limit': 'Limite CA',
  'Auto updates': 'Mises à jour automatiques',
  monday: 'lundi',
  tuesday: 'mardi',
  wednesday: 'mercredi',
  thursday: 'jeudi',
  friday: 'vendredi',
  saturday: 'samedi',
  sunday: 'dimanche',
  'On · weekdays at {n}': 'Activé · en semaine à {n}',
  'On · every day at {n}': 'Activé · tous les jours à {n}',
  'Off · every day at {n} saved': 'Désactivé · tous les jours à {n} enregistré',
  Jan: 'janv.',
  Feb: 'févr.',
  Mar: 'mars',
  Apr: 'avr.',
  May: 'mai',
  Jun: 'juin',
  Jul: 'juill.',
  Aug: 'août',
  Sep: 'sept.',
  Oct: 'oct.',
  Nov: 'nov.',
  Dec: 'déc.',
  January: 'Janvier',
  February: 'Février',
  March: 'Mars',
  April: 'Avril',
  June: 'Juin',
  July: 'Juillet',
  August: 'Août',
  September: 'Septembre',
  October: 'Octobre',
  November: 'Novembre',
  December: 'Décembre',
  Monday: 'Lundi',
  Tuesday: 'Mardi',
  Wednesday: 'Mercredi',
  Thursday: 'Jeudi',
  Friday: 'Vendredi',
  Saturday: 'Samedi',
  Sunday: 'Dimanche',
  Mon: 'Lun.',
  Tue: 'Mar.',
  Wed: 'Mer.',
  Thu: 'Jeu.',
  Fri: 'Ven.',
  Sat: 'Sam.',
  '{n} V battery': 'Batterie {n} V',
  'at {n}%': 'à {n}%',
  // ---- phone shape of the Tabs view (iPhone) ----
  Brightness: 'Luminosité',
  Colour: 'Couleur',
  'Night mode': 'Mode nuit',
  'Dew point {n}°': 'Point de rosée {n}°',
  'gusts {n} km/h': 'rafales {n} km/h',
  'Very high': 'Très élevé',
  Rising: 'En hausse',
  Falling: 'En baisse',
  Steady: 'Stable',
  'No lights found.': 'Aucune lumière trouvée.',
  '{n} kW now': '{n} kW maintenant',
  '{n} W now': '{n} W maintenant',
  '{n}% · {n} km': '{n} % · {n} km',
  '{n}: details': '{n} : détails',
  // ---- v1.17.0: text size, system theme, sticky errors, merged timeline dots ----
  Settings: 'Réglages',
  'Opens the history': 'Ouvre l’historique',
  'Opens the live view': 'Ouvre la vue en direct',
  Clear: 'Transparent',
  None: 'Aucun',
  Rules: 'Règles',
  Dismiss: 'Fermer',
  Chart: 'Graphique',
  'One dot per run, a number when several ran close together. Filled ran, ringed red checked and did nothing, green is running now, hollow is still to come. Tap one to draw it below.':
    'Un point par exécution, un nombre quand plusieurs se suivent de près. Plein : exécutée; cerclé de rouge : vérifiée, rien fait; vert : en cours; vide : à venir. Touchez-en un pour le voir plus bas.',
  '{n} to {n}': 'De {n} à {n}',
  '{n} runs': '{n} exécutions',
  '{n} run': '{n} exécution',
  scheduled: 'prévue',
  'checked, did nothing': 'vérifiée, rien fait',
  running: 'en cours',
  error: 'erreur',
  ran: 'exécutée',
  // ---- Tabs view (wall tablet) ----
  Tabs: 'Onglets',
  Sections: 'Sections',
  Media: 'Médias',
  'At a glance': 'En un coup d’œil',
  'Coming up': 'À venir',
  'Nothing scheduled.': 'Rien de prévu.',
  'Sunset · theme turns dark': 'Coucher du soleil · le thème passe en sombre',
  'Sunrise · every light off, night modes off': 'Lever du soleil · toutes les lumières éteintes, modes nuit désactivés',
  'Hydro-Québec': 'Hydro-Québec',
  Hilo: 'Hilo',
  On: 'Activé',
  '{n} W from the grid': '{n} W du réseau',
  '{n} kW from the grid': '{n} kW du réseau',
  '{n}° inside': '{n}° à l’intérieur',
  'No car found': 'Aucune voiture trouvée',
  'No purifiers': 'Aucun purificateur',
  'Adaptive Lighting today': 'Éclairage adaptatif aujourd’hui',
  'Off everywhere': 'Éteint partout',
  'on everywhere': 'actif partout',
  'on in {n} of {n}': 'actif dans {n} sur {n}',
  'Now {n} K': 'Maintenant {n} K',
  'Sunrise {n}': 'Lever {n}',
  'Noon {n}': 'Midi {n}',
  'Sunset {n}': 'Coucher {n}',
  'Back to Auto': 'Retour en auto',
  Manual: 'Manuel',
  '{n} colour temperature': 'Température de couleur de {n}',
  'Adaptive Lighting off': 'Éclairage adaptatif désactivé',
  '{n} K, Adaptive Lighting off': '{n} K, éclairage adaptatif désactivé',
  'The Tabs view gives each subject its own page, for a tablet on the wall.':
    'La vue Onglets donne à chaque sujet sa propre page, pour une tablette au mur.',
  'Now {n}° · Outside {n}°': 'Maintenant {n}° · Extérieur {n}°',
  'Now {n}°': 'Maintenant {n}°',
  '{n}° average': '{n}° en moyenne',
  Door: 'Porte',
  'History is not available right now.': 'L’historique n’est pas disponible pour le moment.',
  History: 'Historique',
  'Over the period': 'Sur la période',
  'Loading history…': 'Chargement de l’historique…',
  Air: 'Air',
  // ---- footer ----
  // ---- idle clock smart stack (2.5.0) ----
  'Now playing': 'En lecture',
  'Tap for the player': 'Toucher pour le lecteur',
  'Lights unreachable': 'Lumières injoignables',
  'They are not answering Home Assistant': 'Elles ne répondent plus à Home Assistant',
  'Stays here until the door closes': 'Reste affiché jusqu’à ce que la porte se ferme',
  'Open since {n}': 'Ouverte depuis {n}',
  'Plug in before bed': 'Branchez-la avant d’aller dormir',
  'Presence not updating': 'Présence figée',
  "{n} iPhone stopped updating. Who's home and Away may be wrong.":
    '{n} iPhone ne se met plus à jour. Qui est là et le mode Absent pourraient être faux.',
  "{n} iPhones stopped updating. Who's home and Away may be wrong.":
    '{n} iPhone ne se mettent plus à jour. Qui est là et le mode Absent pourraient être faux.',
  'Sign in to iCloud again in Settings': 'Reconnectez iCloud dans les paramètres',
  'Lights off at sunrise': 'Lumières éteintes au lever du soleil',
  'in {n} min': 'dans {n} min',
  'Every light turns off then': 'Toutes les lumières s’éteignent alors',
  'Lights still on': 'Lumières encore allumées',
  'Every light is off': 'Toutes les lumières sont éteintes',
  'Lower consumption now': 'Réduisez la consommation maintenant',
  'Hydro-Québec announced a critical peak': 'Hydro-Québec a annoncé une pointe critique',
  'Using {n} right now': 'Consommation actuelle : {n}',
  'Arrived {n}': 'Arrivé·e à {n}',
  'Left {n}': 'Parti·e à {n}',
  '{n} event': '{n} événement',
  '{n} events': '{n} événements',
  'From your calendars': 'De vos calendriers',
  'and {n} more': 'et {n} de plus',
  'All day': 'Toute la journée',
  'All lights off': 'Toutes les lumières éteintes',
  'Ends when someone comes home': 'Prend fin quand quelqu’un rentre',
  'Open a door or a window a little': 'Entrouvrez une porte ou une fenêtre',
  'The purifier can run faster': 'Le purificateur peut aller plus vite',
  'Not charging right now': 'Ne charge pas en ce moment',
  'Charging to {n}%': 'Charge jusqu’à {n}%',
  'Energy today': "Énergie aujourd'hui",
  'In effect for your area': 'En vigueur pour votre secteur',
  '{n} warnings in effect': '{n} avertissements en vigueur',
  'Issued {n}': 'Émis {n}',
  'Tap for the details': 'Toucher pour les détails',
  'Env. Canada': 'Env. Canada',
  Reminder: 'Rappel',
  Departure: 'Départ',
  'Weekdays at {n}': 'En semaine à {n}',
  'Heating {n}%': 'Chauffage {n}%',
  'water {n}%': 'eau {n}%',
  'car {n}%': 'voiture {n}%',
  'Plugged in': 'Branchée',
};
// state words from integrations, matched without regard to case
const FR_LOW = Object.fromEntries(
  Object.entries({
    // Environment Canada conditions
    sunny: 'Ensoleillé',
    'mainly sunny': 'Généralement ensoleillé',
    clear: 'Dégagé',
    'mainly clear': 'Généralement dégagé',
    'partly cloudy': 'Partiellement nuageux',
    'mostly cloudy': 'Généralement nuageux',
    'mainly cloudy': 'Généralement nuageux',
    cloudy: 'Nuageux',
    overcast: 'Couvert',
    'a mix of sun and cloud': 'Alternance de soleil et de nuages',
    'cloudy periods': 'Passages nuageux',
    'a few clouds': 'Quelques nuages',
    'increasing cloudiness': 'Ennuagement',
    clearing: 'Dégagement',
    'light rain': 'Pluie légère',
    rain: 'Pluie',
    'heavy rain': 'Forte pluie',
    'light rainshower': 'Faible averse de pluie',
    'rain shower': 'Averse de pluie',
    'rain showers': 'Averses de pluie',
    'heavy rainshower': 'Forte averse de pluie',
    'chance of showers': "Possibilité d'averses",
    showers: 'Averses',
    'periods of rain': 'Pluie intermittente',
    'chance of rain': 'Possibilité de pluie',
    drizzle: 'Bruine',
    'light drizzle': 'Bruine légère',
    'freezing rain': 'Pluie verglaçante',
    'light freezing rain': 'Pluie verglaçante légère',
    'freezing drizzle': 'Bruine verglaçante',
    'light snow': 'Neige légère',
    snow: 'Neige',
    'heavy snow': 'Forte neige',
    flurries: 'Averses de neige',
    'chance of flurries': "Possibilité d'averses de neige",
    'light snowshower': 'Faible averse de neige',
    'snow showers': 'Averses de neige',
    'periods of snow': 'Neige intermittente',
    'blowing snow': 'Poudrerie',
    'drifting snow': 'Poudrerie basse',
    'snow grains': 'Neige en grains',
    'ice pellets': 'Grésil',
    'rain and snow': 'Pluie et neige',
    'light rain and snow': 'Pluie et neige légères',
    'wet snow': 'Neige mouillée',
    hail: 'Grêle',
    fog: 'Brouillard',
    'fog patches': 'Bancs de brouillard',
    mist: 'Brume',
    haze: 'Brume sèche',
    smoke: 'Fumée',
    'ice fog': 'Brouillard givrant',
    'freezing fog': 'Brouillard givrant',
    thunderstorm: 'Orage',
    thunderstorms: 'Orages',
    'thunderstorm with light rain': 'Orage avec pluie légère',
    'thunderstorms and rain': 'Orages et pluie',
    'chance of thunderstorms': "Risque d'orages",
    windy: 'Venteux',
    'windy and cloudy': 'Venteux et nuageux',
    'unusual weather': 'Temps inhabituel',
    'not observed': 'Non observé',
    'funnel cloud': 'Nuage en entonnoir',
    dust: 'Poussière',
    // Wallbox
    ready: 'Prête',
    charging: 'En recharge',
    'connected: waiting for car demand': 'Branchée : en attente de la voiture',
    'waiting for car demand': 'En attente de la voiture',
    'connected: waiting for next schedule': 'Branchée : en attente du prochain horaire',
    'waiting for next schedule': 'En attente du prochain horaire',
    'paused by user': "En pause par l'utilisateur",
    scheduled: 'Programmée',
    discharging: 'En décharge',
    error: 'Erreur',
    disconnected: 'Débranchée',
    'locked, car connected': 'Verrouillée, voiture branchée',
    updating: 'Mise à jour',
    waiting: 'En attente',
    'waiting in queue by power sharing': 'En file (partage de puissance)',
    'waiting in queue by power boost': 'En file (Power Boost)',
    'waiting in queue by eco-smart': 'En file (Eco-Smart)',
    'waiting for mid failed': 'Échec MID',
    unknown: 'Inconnu',
    unavailable: 'Indisponible',
    // HVAC and fan modes, presets
    off: 'Éteint',
    heat: 'Chauffage',
    cool: 'Climatisation',
    auto: 'Auto',
    dry: 'Déshumidification',
    fan: 'Ventilation',
    'fan only': 'Ventilation',
    'heat cool': 'Auto',
    low: 'Faible',
    medium: 'Moyen',
    high: 'Élevé',
    quiet: 'Silencieux',
    diffuse: 'Diffus',
    none: 'Normal',
    eco: 'Éco',
    boost: 'Boost',
    away: 'Absent',
    sleep: 'Sommeil',
    comfort: 'Confort',
    'swing up and down': 'balayage vertical',
    'swing side to side': 'balayage horizontal',
    'swing both ways': 'balayage dans les deux sens',
    fixed: 'fixe',
    // Hilo challenge phases
    appreciation: 'Appréciation',
    pre_heat: 'Préchauffage',
    'pre heat': 'Préchauffage',
    reduction: 'Réduction',
    recovery: 'Récupération',
    on: 'Allumé',
    // pollen levels and misc
    'none ': 'Aucun',
    'very low': 'Très faible',
    'very high': 'Très élevé',
    heating: 'chauffe',
    cooling: 'refroidit',
    idle: 'au repos',
  }).map(([k, v]) => [k.trim().toLowerCase(), v]),
);
const FR_DOOR = {
  closed: 'fermée',
  open: 'ouverte',
  offline: 'hors ligne',
  'motion now': ': mouvement en cours',
  'no motion': ': aucun mouvement',
  'motion {n} min ago': ': mouvement il y a {n} min',
  'motion {n} h ago': ': mouvement il y a {n} h',
  'motion just now': ": mouvement à l'instant",
};
const FR_LBL = {
  setpoint: 'consigne',
  brightness: 'luminosité',
  lights: 'lumières',
  mode: 'mode',
  power: 'alimentation',
  playing: 'en lecture',
  paused: 'en pause',
  'battery low': 'pile faible',
  offline: 'hors ligne',
  open: 'ouverte',
};
// patterns around names and other free parts; a part that is ours is translated, a name stays
const FR_RX = [
  [/^Tonight: (.+), low \{n\}°$/, a => `Ce soir : ${(frLook(a) ?? a).toLowerCase()}, minimum {n}°`],
  [/^(.+) not plugged in$/, a => `${a} non branchée`],
  [/^(.+) opened \{n\}$/, a => `${a} ouverte à {n}`],
  [/^(.+) air$/, a => `Air : ${a}`],
  [/^(.+) is high$/, a => `${a} élevé`],
  // a row that ends in a state ("Front door open", "Garage door offline") names one sensor; a " · " line
  // (the separator, with its spaces) is never one name, so it falls through to the piece-by-piece rule in frLook() (the same goes for the FR_DOOR rule below)
  [/^((?:(?! · ).)+) open$/, a => `${a} : ouverte`],
  [
    /^· (.+)$/,
    x => {
      const t = frLook(x);
      return t == null ? null : '· ' + t;
    },
  ],
  [
    /^(.+) ·$/,
    x => {
      const t = frLook(x);
      return t == null ? null : t + ' ·';
    },
  ],
  [
    /^((?:(?! · ).)+?) (closed|open|offline|motion now|no motion|motion \{n\} min ago|motion \{n\} h ago|motion just now)$/,
    (x, s) => `${x} ${FR_DOOR[s]}`,
  ],
  [/^(.+?) (setpoint|brightness|lights|mode|power|playing|paused|battery low)$/, (x, s) => `${frOr(x)} : ${FR_LBL[s]}`],
  [/^(.+): (pause|play)$/, (x, s) => `${x} : ${s === 'pause' ? 'pause' : 'lecture'}`],
  [/^(.+), (last \{n\} (?:hours|days|months))$/, (x, s) => `${frOr(x)}, ${frLook(s)}`],
  [/^(.+), \{n\} to \{n\} degrees$/, x => `${frOr(x)}, {n} à {n} degrés`],
  [/^(.+) set to \{n\}°$/, x => `${frOr(x)} : {n}°`],
  [/^(.+) (on|off)$/, (x, s) => `${frOr(x)} : ${s === 'on' ? 'activé' : 'désactivé'}`],
  [/^(.+) heating$/, x => `chauffage : ${x}`],
  [/^(.+) holding \{n\}°$/, x => `${x} à {n}°`],
  [/^\{n\} km\/h ([NSEW]{1,3})$/, d => `{n} km/h ${d.replace(/W/g, 'O')}`],
  [/^([NSEW]{2,3})$/, d => d.replace(/W/g, 'O')],
  [/^\{n\} km range · (.+)$/, x => `{n} km d'autonomie · ${x.split(' · ').map(frOr).join(' · ')}`],
  [
    /^((?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)(?:, (?:Sun|Mon|Tue|Wed|Thu|Fri|Sat))*) at \{n\}$/,
    d => `${d.split(', ').map(frWd).join(', ')} à {n}`,
  ],
  [
    /^(On|Off) · (.+?)( saved)?$/,
    (o, x, sv) => {
      const t = frLook(x);
      return t == null ? null : `${o === 'On' ? 'Activé' : 'Désactivé'} · ${t}${sv ? ' enregistré' : ''}`;
    },
  ],
  [/^observed \{n\} at (.+)$/, x => `observé à {n} à ${x}`],
  [
    /^\{n\}, (night|morning|afternoon|evening)$/,
    p => `{n}, ${{night: 'nuit', morning: 'matin', afternoon: 'après-midi', evening: 'soir'}[p]}`,
  ],
  [
    /^(.+): (.+)$/,
    (a, b) => {
      const x = frLook(a);
      let y = frLook(b);
      if (x == null && y == null) return null;
      if (y != null && /^[a-z]/.test(b)) y = y.charAt(0).toLowerCase() + y.slice(1);
      return `${x ?? a} : ${y ?? b}`;
    },
  ],
  [
    /^(.+), (.+)$/,
    (a, b) => {
      const x = frLook(a),
        y = frLook(b);
      return x == null || y == null ? null : `${x}, ${y}`;
    },
  ],
];
// live activities (2.5.0): the pill and its cards; durations read 52 min, 1 h 50 or 3 h
for (const [en, fr] of [
  ['{n} min', '{n} min'],
  ['{n} h {n}', '{n} h {n}'],
  ['{n} h', '{n} h'],
])
  Object.assign(FR_MAP, {
    [en]: fr,
    [`challenge in ${en}`]: `défi dans ${fr}`,
    [`ends in ${en}`]: `fin dans ${fr}`,
    [`in ${en}`]: `dans ${fr}`,
    [`~${en}`]: `~${fr}`,
    [`~${en} left`]: `reste ~${fr}`,
    [`usual cycle ${en}`]: `cycle habituel ${fr}`,
  });
Object.assign(FR_MAP, {
  'Charging paused': 'Recharge en pause',
  paused: 'en pause',
  'Hilo pre-heat': 'Préchauffage Hilo',
  'Hilo challenge': 'Défi Hilo',
  'Hilo recovery': 'Récupération Hilo',
  'Pre-heat': 'Préchauffage',
  Challenge: 'Défi',
  Recovery: 'Récupération',
  Reduction: 'Réduction',
  Water: 'Eau',
  'almost done': 'presque fini',
  'Almost done': 'Presque fini',
  '→ {n}% limit': '→ limite de {n} %',
  'Full at {n}': 'Pleine à {n}',
  'Plugged in at {n}': 'Branchée à {n}',
  about: 'environ',
  'so far': "jusqu'ici",
  'Pause charging': 'Suspendre la recharge',
  'Resume charging': 'Reprendre la recharge',
  'Open Car ›': 'Ouvrir Voiture ›',
  'Charging resumed': 'Recharge reprise',
  'Water heater heating': 'Chauffe-eau en chauffe',
  'Started {n}': 'Commencé à {n}',
  'this cycle': 'ce cycle',
  '{n} cycles in 24 h': '{n} cycles en 24 h',
  '{n} cycle in 24 h': '{n} cycle en 24 h',
  '↗ {n}° / {n} min': '↗ {n}° / {n} min',
  '↘ {n}° / {n} min': '↘ {n}° / {n} min',
  'until heating holds back': 'avant la baisse du chauffage',
  'until the challenge ends': 'avant la fin du défi',
  'until recovery ends': 'avant la fin de la récupération',
  'Heating is held back.': 'Le chauffage est réduit.',
  'Rooms are warming up before the challenge.': 'Les pièces se réchauffent avant le défi.',
  inside: "à l'intérieur",
  'house using': 'la maison consomme',
  'of {n} kWh allowed': 'sur {n} kWh permis',
  '{n} – {n}': '{n} – {n}',
  'Charged to {n}%': 'Rechargée à {n} %',
  'Challenge done': 'Défi terminé',
  // ---- lights sheet (2.10.0) ----
  'Brightness and colour follow the time of day': "L'intensité et la couleur suivent l'heure du jour",
  'Very dim red light for the night': 'Lumière rouge très tamisée pour la nuit',
  'Linked with': 'Lié avec',
  'Link with': 'Lier avec',
  'Moves together with another room': 'Bouge avec une autre pièce',
  'Only an admin can change this': 'Seul un administrateur peut changer ceci',
  'This room moves on its own': 'Cette pièce bouge seule',
  Bulbs: 'Ampoules',
  'Colour temperature': 'Température de couleur',
  'Warm white': 'Blanc chaud',
  'Neutral white': 'Blanc neutre',
  'Cool white': 'Blanc froid',
  'Red, very dim': 'Rouge, très tamisé',
  "Linked rooms switch, dim and change colour together. Picking a room copies this room's light onto it. A room links with one other room at a time.":
    "Les pièces liées s'allument, se tamisent et changent de couleur ensemble. Choisir une pièce y copie l'éclairage de celle-ci. Une pièce se lie à une seule autre à la fois.",
  'Auto on': 'Auto activé',
  'Auto off': 'Auto désactivé',
  'Night on': 'Nuit activée',
  'Night off': 'Nuit désactivée',
  'Set by hand, Auto off': 'Réglé à la main, Auto désactivé',
  'Rooms linked': 'Pièces liées',
  'Room unlinked': 'Pièce déliée',
  'now with': 'maintenant avec',
});
