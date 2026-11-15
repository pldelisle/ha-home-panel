// sankeyLayout: the Sankey of the house as geometry: the grid, the four uses it splits into, and the rooms that heat, with the ribbons between them.
// Pattern: pure geometry (a layout function returns numbers and texts, the element places them with `svg` templates; flow-layout.ts is the other),
// the legacy `renderSankey` copied number for number (deleted in #240): one scale `k` for the grid and the uses, another `kr` for the rooms.
// Must not: import Lit or the DOM, read the clock or the states, or hold a word a person reads (the model and the catalog say them).
import type {Translate} from '../../core/i18n/messages.ts';
import {sum} from '../../providers/power-history.ts';

/** The drawing's own coordinates, which the element's `viewBox` repeats: three columns 400 apart, nodes 20 wide, 12 between nodes. */
const WIDTH = 980;
const BODY = 300;
const TOP = 24;
const BOTTOM = 8;
const NODE_WIDTH = 20;
const GAP = 12;
const COLUMNS = [0, 400, 800] as const;
/** A room under this share of the heating is gathered with the others that small. */
const SMALL_ROOM_SHARE = 0.03;
/** The grid's node and the rooms' nodes: the legacy colours, as the kit's tokens. */
const GRID_COLOR = 'var(--c-rest)';
const ROOM_COLOR = 'var(--c-heat)';
const RIBBON_OPACITY = 0.45;

/** The four uses the grid splits into; the heating is the one the rooms split. */
export type GroupKey = 'heat' | 'wh' | 'ev' | 'rest';

/** One use: its name and colour token as the household reads them, and its energy or power. */
export interface SankeyGroup {
  key: GroupKey;
  name: string;
  color: string;
  value: number;
}

/** What the Sankey draws: what the grid supplied, and its four uses in the order they are stacked. */
export interface SankeyData {
  total: number;
  groups: readonly SankeyGroup[];
}

/** One room's own heating, by the room's name. */
export interface SankeyRoom {
  name: string;
  value: number;
}

export interface SankeyDeps {
  t: Translate;
  /** A figure as the drawing writes it: "12.3 kWh" for a day, "345 kWh" for 30 days. */
  format: (value: number) => string;
}

/** A band between two nodes, as the path the element draws. */
export interface SankeyRibbon {
  kind: 'ribbon';
  key: string;
  d: string;
  color: string;
  opacity: number;
}

/** A bar: a node's height is its share, and never under 2 so that a sliver shows. */
export interface SankeyNode {
  kind: 'node';
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

/** A node's name and figure, one under the other: `y` is the name's baseline and `valueY` the figure's. */
export interface SankeyLabel {
  kind: 'label';
  key: string;
  x: number;
  y: number;
  valueY: number;
  name: string;
  value: string;
}

export type SankeyItem = SankeyRibbon | SankeyNode | SankeyLabel;

export interface SankeyGeometry {
  width: number;
  height: number;
  /** The screen reader's sentence for the whole drawing. */
  label: string;
  /** In paint order: the grid, then each use with its ribbon, then each room with its ribbon, so a label is over the ribbons. */
  items: SankeyItem[];
}

/** The legacy figures were written with `toFixed(1)`: a tenth of a pixel is the resolution of every position. */
const tenth = (value: number): number => +value.toFixed(1);

/** The rooms that heat, biggest first; those under the small share of the heating are one "Other rooms" when there are two or more of them. */
function gather(rooms: readonly SankeyRoom[], heating: number, other: string): SankeyRoom[] {
  const sorted = rooms.filter(room => room.value > 0).sort((a, b) => b.value - a.value);
  const small = sorted.filter(room => room.value < SMALL_ROOM_SHARE * heating);
  return small.length > 1
    ? [...sorted.filter(room => !small.includes(room)), {name: other, value: sum(small.map(room => room.value))}]
    : sorted;
}

export function sankeyLayout(data: SankeyData, rooms: readonly SankeyRoom[], {t, format}: SankeyDeps): SankeyGeometry {
  const groups = data.groups.filter(group => group.value > 0);
  const total = Math.max(data.total, sum(groups.map(group => group.value)));
  const k = (BODY - GAP * (groups.length - 1)) / total;
  const heat = groups.find(group => group.key === 'heat');
  // a house with no heating drawn has no rooms to split it into
  const split = heat ? gather(rooms, heat.value, t('energy.sankey.otherRooms')) : [];
  const roomsTotal = sum(split.map(room => room.value));
  const kr = split.length ? Math.min(k, (BODY - GAP * (split.length - 1)) / Math.max(heat?.value ?? 0, roomsTotal)) : k;

  const ribbon = (
    key: string,
    x0: number,
    [a0, a1]: [number, number],
    x1: number,
    [b0, b1]: [number, number],
    color: string,
  ): SankeyRibbon => {
    const xm = (x0 + x1) / 2;
    const [p0, p1, q0, q1] = [a0, a1, b0, b1].map(value => value.toFixed(1));
    return {
      kind: 'ribbon',
      key,
      d: `M${x0},${p0} C${xm},${p0} ${xm},${q0} ${x1},${q0} L${x1},${q1} C${xm},${q1} ${xm},${p1} ${x0},${p1} Z`,
      color,
      opacity: RIBBON_OPACITY,
    };
  };
  const node = (key: string, x: number, y: number, height: number, color: string): SankeyNode => ({
    kind: 'node',
    key,
    x,
    y: tenth(y),
    width: NODE_WIDTH,
    height: tenth(Math.max(2, height)),
    color,
  });
  const label = (key: string, x: number, y: number, name: string, value: number): SankeyLabel => ({
    kind: 'label',
    key,
    x,
    y: tenth(y - 3),
    valueY: tenth(y + 13),
    name,
    value: format(value),
  });

  const items: SankeyItem[] = [];
  let gridY = TOP + (BODY - total * k) / 2;
  items.push(
    node('grid', COLUMNS[0], gridY, total * k, GRID_COLOR),
    label('grid', COLUMNS[0] + NODE_WIDTH + 8, TOP + 4, t('energy.sankey.grid'), data.total),
  );
  let groupY = TOP;
  let heatY = 0;
  for (const group of groups) {
    const height = group.value * k;
    items.push(
      ribbon(
        `ribbon:${group.key}`,
        COLUMNS[0] + NODE_WIDTH,
        [gridY, gridY + height],
        COLUMNS[1],
        [groupY, groupY + height],
        group.color,
      ),
      node(group.key, COLUMNS[1], groupY, height, group.color),
      label(group.key, COLUMNS[1] + NODE_WIDTH + 8, groupY + height / 2, group.name, group.value),
    );
    if (group === heat) heatY = groupY;
    gridY += height;
    groupY += height + GAP;
  }
  let roomY = TOP + (BODY - (roomsTotal * kr + GAP * (split.length - 1))) / 2;
  split.forEach((room, index) => {
    const height = room.value * kr;
    const share = room.value * k;
    const key = `room:${index}`;
    items.push(
      ribbon(
        `ribbon:${key}`,
        COLUMNS[1] + NODE_WIDTH,
        [heatY, heatY + share],
        COLUMNS[2],
        [roomY, roomY + height],
        ROOM_COLOR,
      ),
      node(key, COLUMNS[2], roomY, height, ROOM_COLOR),
      label(key, COLUMNS[2] + NODE_WIDTH + 8, roomY + height / 2, room.name, room.value),
    );
    heatY += share;
    roomY += height + GAP;
  });

  return {width: WIDTH, height: BODY + TOP + BOTTOM, label: t('energy.sankey.label'), items};
}
