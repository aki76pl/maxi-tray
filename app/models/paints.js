import { clamp } from '../geometry.js';
import { section, num, choice } from './fields.js';

// Rack for paint bottles: a block with a hole per bottle, optionally stepped
// so every row stands higher than the one in front of it. Holes can be round,
// square or hexagonal and laid out in a grid or staggered (honeycomb).

// Approximate bottle sizes; picking one fills in shape, diameter, depth and
// height (heights are generous: too much headroom is harmless in a box).
// Bottles differ between batches, so the hint asks to check with calipers.
export const BOTTLES = [
  { v: 'custom', label: 'Własne wymiary' },
  { v: 'dropper17', label: 'Vallejo / AK / Ammo / Hataka 17 ml (zakraplacz)', set: { shape: 'round', dia: 25.5, holeDepth: 25, bottleHeight: 85 } },
  { v: 'armypainter18', label: 'Army Painter 18 ml (zakraplacz)', set: { shape: 'round', dia: 26, holeDepth: 25, bottleHeight: 88 } },
  { v: 'tamiya10', label: 'Tamiya 10 ml (słoiczek)', set: { shape: 'round', dia: 35, holeDepth: 15, bottleHeight: 44 } },
  { v: 'tamiya23', label: 'Tamiya 23 ml (słoiczek)', set: { shape: 'round', dia: 40, holeDepth: 18, bottleHeight: 50 } }
];

const CHAMFER = 0.8; // lead-in at the top of every hole
const SQ_R = 1.5; // corner radius of square holes

// Fields shared with the closed paint box.
export const bottleFields = (extra = []) => [
  section('Butelka'),
  { type: 'select', key: 'bottle', label: 'Producent', options: BOTTLES },
  choice('shape', 'Kształt', [{ v: 'round', label: 'Okrągła' }, { v: 'square', label: 'Kwadratowa' }, { v: 'hex', label: 'Sześciokątna' }]),
  num('dia', 'Średnica / szerokość butelki', 10, 80, 0.1),
  ...extra,
  num('clearance', 'Luz (na stronę)', 0, 3, 0.1),
  num('holeDepth', 'Głębokość otworu', 5, 100, 0.5),
  section('Układ'),
  num('cols', 'Kolumny', 1, 20, 1, { unit: '' }),
  num('rows', 'Rzędy', 1, 12, 1, { unit: '' }),
  choice('layout', 'Ułożenie', [{ v: 'grid', label: 'Siatka' }, { v: 'stagger', label: 'Plaster miodu' }]),
  num('spacing', 'Ścianka między otworami', 1, 10, 0.1)
];

// Hole pitch and the size of the hole field (without margins).
export function holeLayout(p) {
  const q = { ...p };
  q.cols = clamp(Math.round(q.cols), 1, 20);
  q.rows = clamp(Math.round(q.rows), 1, 12);
  q.hole = q.dia + 2 * q.clearance; // across flats for square and hex
  // Hex holes point along Y so staggered rows nest with even walls.
  q.ey = q.shape === 'hex' ? q.hole * 2 / Math.sqrt(3) : q.hole;
  q.px = q.hole + q.spacing;
  const stagger = q.layout === 'stagger' && q.rows > 1;
  q.py = stagger && q.shape !== 'square' ? q.px * Math.sqrt(3) / 2 : q.ey + q.spacing;
  q.shift = stagger ? q.px / 2 : 0;
  q.fieldW = (q.cols - 1) * q.px + q.hole + q.shift;
  q.fieldD = (q.rows - 1) * q.py + q.ey;
  return q;
}

// Cutters for every hole. The field starts at (x0, y0); top(r) is the top
// of row r. Holes get a lead-in chamfer; optional finger notches and push
// holes through the floor.
export function holeCuts(kit, p, { x0, y0, top, notch = false, pushHole = false }) {
  const { hole, ey, px, py, holeDepth } = p;
  const outline = (x, y, grow) => {
    const s = hole / 2 + grow;
    if (p.shape === 'square') return kit.rr(x - s, y - s, x + s, y + s, SQ_R + grow);
    if (p.shape === 'hex') {
      const rc = s * 2 / Math.sqrt(3);
      return kit.poly([0, 1, 2, 3, 4, 5].map((i) => {
        const a = Math.PI / 2 + i * Math.PI / 3;
        return [x + rc * Math.cos(a), y + rc * Math.sin(a)];
      }));
    }
    return kit.k(kit.CS.circle(s, kit.seg).translate([x, y]));
  };

  const cuts = [];
  for (let r = 0; r < p.rows; r++) {
    const zt = top(r);
    const zb = zt - holeDepth;
    const y = y0 + ey / 2 + r * py;
    for (let c = 0; c < p.cols; c++) {
      const x = x0 + hole / 2 + (r % 2 ? p.shift : 0) + c * px;
      cuts.push(kit.profile((inset) => outline(x, y, -inset), [
        { z: zb, inset: 0 },
        { z: zt - CHAMFER, inset: 0 },
        { z: zt + 1, inset: -(CHAMFER + 1) }
      ]));
      if (notch) {
        // Slot through the wall in front of the hole so short jars can be gripped.
        const w = hole * 0.35;
        const nd = Math.min(holeDepth * 0.6, holeDepth - 1);
        const yf = r === 0 ? -1 : y - ey / 2 - p.spacing - 0.5;
        cuts.push(kit.box(x - w / 2, yf, zt - nd, x + w / 2, y, zt + 1));
      }
      if (pushHole) cuts.push(kit.cyl(Math.min(hole * 0.3, 8), [x, y, -1], 'z', zb + 1.01));
    }
  }
  return cuts;
}

export default {
  id: 'paints',
  name: 'Stojak na farby',
  subtitle: 'Otwory na butelki z farbą, także schodkowo',
  tags: ['Bez podpór'],
  defaults: {
    bottle: 'dropper17', shape: 'round', dia: 25.5, clearance: 0.8, holeDepth: 25,
    cols: 6, rows: 3, spacing: 2, edge: 3, floor: 1.5, fillet: 3,
    layout: 'grid', stepped: 1, stepHeight: 15, notch: 0, pushHole: 0
  },
  fields: [
    ...bottleFields(),
    choice('stepped', 'Profil', [{ v: 0, label: 'Płaski' }, { v: 1, label: 'Schodkowy' }]),
    num('stepHeight', 'Wysokość stopnia', 2, 60, 0.5, { show: (p) => p.stepped && p.rows > 1 }),
    section('Wykończenie'),
    num('edge', 'Margines', 1, 15, 0.5),
    num('floor', 'Grubość dna', 0.8, 5, 0.1),
    num('fillet', 'Zaokrąglenie rogów', 0, 15, 0.5),
    choice('notch', 'Wycięcie na palec', [{ v: 0, label: 'Nie' }, { v: 1, label: 'Tak' }]),
    choice('pushHole', 'Otwór w dnie', [{ v: 0, label: 'Nie' }, { v: 1, label: 'Tak' }])
  ],

  normalize(p) {
    const q = holeLayout(p);
    q.width = 2 * q.edge + q.fieldW;
    q.depth = 2 * q.edge + q.fieldD;
    q.step = q.stepped && q.rows > 1 ? q.stepHeight : 0;
    q.height = q.floor + q.holeDepth + (q.rows - 1) * q.step;
    q.fillet = clamp(q.fillet, 0, q.edge + q.hole / 2);
    return q;
  },

  hint: (p) => `${p.cols * p.rows} butelek, otwór ${p.hole.toFixed(1)} mm. Wymiary butelek są orientacyjne: zmierz swoją suwmiarką i dobierz luz. ` +
    `Stojak ${p.width.toFixed(0)} × ${p.depth.toFixed(0)} × ${p.height.toFixed(0)} mm.`,

  grid: null,

  build(kit, p) {
    const { width: W, depth: D, ey, py, edge, floor, holeDepth, step } = p;
    const top = (r) => floor + holeDepth + r * step;

    // Body: one slab per row, each reaching to the back, so rows step up.
    const slabs = [];
    for (let r = 0; r < p.rows; r++) {
      const y0 = r === 0 || !step ? 0 : edge + ey / 2 + r * py - py / 2;
      slabs.push(kit.prism(kit.rr(0, y0, W, D, p.fillet), 0, top(r)));
      if (!step) break;
    }
    const cuts = holeCuts(kit, p, { x0: edge, y0: edge, top, notch: p.notch, pushHole: p.pushHole });
    return [{ name: 'Stojak na farby', solid: kit.sub(kit.union(slabs), cuts) }];
  }
};
