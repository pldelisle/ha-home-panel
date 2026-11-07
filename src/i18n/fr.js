// ---------- French: Québec French when the signed-in HA user's language is French ----------
// The panel is written in English. In French, every text node and label is translated as it is drawn:
// numbers, times and dates are lifted out first and come back in French form, so "Oct 27, 4:07 pm" needs no entry of its own,
// then the rest is looked up whole, by pattern, or piece by piece around " · ". Anything not found stays as it was.
// Names people gave in Home Assistant (areas, scenes, lights, sensors) are never translated.
let FR = false;
const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EN_MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], EN_WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FR_MON = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juill.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const FR_MONL = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const FR_WD = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], FR_WDL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const frCap = x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
const frMo = m => (m = frCap(m), EN_MONL.includes(m) ? FR_MONL[EN_MONL.indexOf(m)] : FR_MON[EN_MON.indexOf(m.slice(0, 3))]);
const frWd = w => (w = frCap(w), EN_WDL.includes(w) ? FR_WDL[EN_WDL.indexOf(w)] : FR_WD[EN_WD.indexOf(w)]);
const frH = (h, m, ap) => `${(+h % 12) + (/p/i.test(ap) ? 12 : 0)} h${m && m !== '00' ? ' ' + m : ''}`;
// 1,234.5 -> 1 234,5 and 12.5 -> 12,5; version numbers like 1.9.1 stay as they are
const frNum = v => { const g = v[0] === '-' ? '-' : '', b = g ? v.slice(1) : v; return g + (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(b) ? b.replace(/,/g, '\u202f').replace('.', ',') : /^\d+\.\d+$/.test(b) ? b.replace('.', ',') : b); };
const MO = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const MOS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec', WDL = 'Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday', WDS = 'Sun|Mon|Tue|Wed|Thu|Fri|Sat';
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
].map(([rx, f]) => [new RegExp(rx, /\[ap\]/.test(rx) ? 'gi' : 'g'), f]);
// English text -> lookup key with {n} for each number, time or date; their French forms go into vals, in reading order
const frKey = (s, vals) => {
  const got = [], mark = /[\uE100-\uE8FF]/;
  for (const [rx, f] of FR_TOK) s = s.replace(rx, (...a) => {
    const whole = a[0], g = a.slice(1, a.length - 2);
    // a later rule must not reach into a placeholder already made
    if (mark.test(whole) || got.length > 1700) return whole;
    got.push(f(...(g.length ? g : [whole]))); return String.fromCharCode(0xE100 + got.length - 1);
  });
  return s.replace(/[\uE100-\uE8FF]/g, c => { vals.push(got[c.charCodeAt(0) - 0xE100]); return '{n}'; });
};
const FR_UNITS = /^(?:\{n\}|[\s°%·–\-−+\/,()×]|°C|kWh|MWh|kW|W|V|A|km\/h|km|kPa|ppm|µg\/m³|lx|lux|psi|¢\/kWh|¢|h|min|s|k|RH|AQI|UV|PM\{n\}|CO₂|CO|VOC)+$/;
let FR_NAMES = new Set(), FR_NAMES_AT = 0;
function frNames() {
  if (Date.now() - FR_NAMES_AT < 60000 && FR_NAMES.size) return FR_NAMES;
  const S = new Set(), reg = hass.entities || {}, keep = /^(scene|script|input_boolean|light|binary_sensor|camera|media_player|person|fan|switch|lock)\./;
  Object.values(hass.areas || {}).forEach(a => a.name && S.add(a.name));
  Object.values(hass.devices || {}).forEach(d => d.name_by_user && S.add(d.name_by_user));
  for (const [id, s] of Object.entries(hass.states)) {
    const p = (reg[id] || {}).platform;
    if (keep.test(id) && !['fordpass', 'wallbox', 'adaptive_lighting', 'hilo', 'unifiprotect'].includes(p) && s.attributes.friendly_name) S.add(s.attributes.friendly_name);
  }
  FR_NAMES = S; FR_NAMES_AT = Date.now(); return S;
}
function frLook(k) {
  let v = FR_MAP[k]; if (v != null) return v;
  v = FR_LOW[k.toLowerCase()]; if (v != null) return v;
  for (const [rx, f] of FR_RX) { const m = k.match(rx); if (m) { const r = f(...m.slice(1)); if (r != null) return r; } }
  // "a · b · c": each part on its own; parts without an entry stay as they are
  if (k.includes(' · ')) { const p = k.split(' · '), t = p.map(x => frLook(x)); if (t.some(x => x != null)) return t.map((x, i) => x ?? p[i]).join(' · '); }
  if (FR_UNITS.test(k)) return k;
  return null;
}
// a name, or its translation when it is one of ours
const frOr = x => frLook(x) ?? x;
// French typography: a narrow space before %, a non-breaking one before a colon, dollars after the amount, no doubled period after an abbreviation
const frPost = s => s.replace(/(\d)%/g, '$1\u202f%').replace(/ :/g, '\u00a0:').replace(/\$\s?(-?\d[\d\u202f]*(?:,\d+)?)/g, '$1\u00a0$$').replace(/([a-zé]\.)\./g, '$1');
function frText(s) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2];
  if (!core || frNames().has(core)) return s;
  if (!/[A-Za-z]/.test(core)) return /\d/.test(core) ? m[1] + frPost(core.replace(/\d+(?:[.,]\d+)*/g, frNum)) + m[3] : s;
  const vals = [], k = frKey(core, vals);
  let out = frLook(k); if (out == null) return s;
  let i = 0; out = out.replace(/\{n\}/g, () => vals[i++] ?? '');
  if (/^[A-ZÀ-Ý]/.test(core) && /^[a-zà-ÿ]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  out = frPost(out);
  return m[1] + out + m[3];
}
const FR_ATTR = ['aria-label', 'title', 'placeholder', 'alt'];
const frSeen = new WeakMap();
function frNode(n) {
  if (n.nodeType === 3) {
    const p = n.parentNode; if (!p || p.nodeName === 'STYLE' || p.nodeName === 'SCRIPT' || frSeen.get(n) === n.data) return;
    // song titles and the like are marked translate="no"
    if (p.closest && p.closest('[translate="no"]')) return;
    const t = frText(n.data); if (t !== n.data) n.data = t; frSeen.set(n, n.data);
  } else if (n.nodeType === 1) {
    if (n.nodeName === 'STYLE' || n.nodeName === 'SCRIPT') return;
    const done = frSeen.get(n) || {};
    for (const a of FR_ATTR) { const v = n.getAttribute(a); if (!v || done[a] === v) continue; const t = frText(v); if (t !== v) n.setAttribute(a, t); done[a] = t; }
    frSeen.set(n, done);
  }
}
function frTree(root) {
  if (root.nodeType === 3) return frNode(root);
  if (root.nodeType === 1) frNode(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); let n;
  while ((n = w.nextNode())) frNode(n);
}
// apex draws its own dates: give it French month and day names and day-first formats
const APEX_FR = {name: 'fr', options: {months: FR_MONL, shortMonths: FR_MON, days: FR_WDL, shortDays: FR_WD, toolbar: {}}};
const frFmt = f => typeof f !== 'string' ? f : f.replace(/MMM d\b/, 'd MMM').replace(/h:mm tt|h tt/g, 'HH:mm').replace(/, (?=HH)/, ' ').replace(/MMM d, yyyy/, 'd MMM yyyy');
function frApex(o) {
  o.chart = {...o.chart, locales: [APEX_FR], defaultLocale: 'fr'};
  if (o.tooltip && o.tooltip.x && o.tooltip.x.format) o.tooltip.x = {...o.tooltip.x, format: frFmt(o.tooltip.x.format)};
  if (o.xaxis && o.xaxis.type === 'datetime') o.xaxis = {...o.xaxis, labels: {datetimeFormatter: {year: 'yyyy', month: 'MMM yyyy', day: 'd MMM', hour: 'HH:mm'}, ...o.xaxis.labels}};
  if (o.xaxis && o.xaxis.labels && o.xaxis.labels.format) o.xaxis.labels = {...o.xaxis.labels, format: frFmt(o.xaxis.labels.format)};
  return o;
}
