// ---------- smart stack: the rules that pick the idle clock's card ----------
// Pure functions (no DOM, no hass object), spliced into the bundle and run under Node by the tests.
// A card is {k, tone, filler}: tone 'red' pins it (doors left open, lights that stopped answering), 'amber' puts it first
// in the rotation, filler cards (energy today, who's home) only show when nothing else applies.
const STACK_TURN_MS = 20000;   // one card per clock tick
const TONE_RANK = {red: 0, amber: 1};
function pickStack(cards, now) {
  const all = (cards || []).filter(Boolean);
  const red = all.filter(c => c.tone === 'red');
  let pool = red.length ? red : all.filter(c => !c.filler);
  if (!pool.length) pool = all.filter(c => c.filler);
  if (!pool.length) return null;
  // stable order: amber first, then the order the cards were listed in
  pool = pool.map((c, i) => [c, i]).sort((a, b) => (TONE_RANK[a[0].tone] ?? 2) - (TONE_RANK[b[0].tone] ?? 2) || a[1] - b[1]).map(x => x[0]);
  const i = Math.floor(now / STACK_TURN_MS) % pool.length;
  return {card: pool[i], i, n: pool.length};
}
// hours as a decimal (20.5 = 8:30 pm); windows may cross midnight (21 → 7)
const inHours = (h, from, to) => from <= to ? h >= from && h < to : h >= from || h < to;
// "20:00" → 20
const hhmm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] + +m[2] / 60 : null; };
// a reminder shows for `lead` minutes before its time: returns the minutes left, or null outside that window
function reminderLeft(rem, h) {
  const at = hhmm(rem && rem.at); if (at == null) return null;
  const lead = Math.max(1, Math.min(240, +rem.lead || 30)) / 60;
  const left = ((at - h) % 24 + 24) % 24;
  return left > 0 && left <= lead ? Math.round(left * 60) : null;
}
