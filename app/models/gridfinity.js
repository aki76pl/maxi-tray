import { leaf, clamp } from '../geometry.js';
import { section, num, choice } from './fields.js';

// Gridfinity (Zack Freedman's open standard): 42 mm grid, 7 mm height units.
// Bins have the standard stepped foot per cell, optional stacking lip and
// magnet holes; the baseplate is the open "lite" frame.

const U = 42;
const BIN_R = 3.75;
const PLATE_R = 4;
const FOOT_H = 4.75;
const LIP_H = 4.4;

const isBin = (p) => p.part === 'bin';

export default {
  id: 'gridfinity',
  name: 'Gridfinity',
  subtitle: 'Pojemniki i płyta bazowa w standardzie Gridfinity',
  tags: ['Bez podpór', 'Standard 42 mm'],
  defaults: {
    part: 'bin', unitsX: 2, unitsY: 1, heightUnits: 6, lip: 1, magnets: 0,
    wall: 1.2, partitionHeight: 100
  },
  fields: [
    section('Element'),
    choice('part', 'Co drukujesz', [
      { v: 'bin', label: 'Pojemnik' },
      { v: 'baseplate', label: 'Płyta bazowa' }
    ]),
    section('Rozmiar w jednostkach'),
    num('unitsX', 'Kolumny (× 42 mm)', 1, 10, 1, { unit: 'j.' }),
    num('unitsY', 'Rzędy (× 42 mm)', 1, 10, 1, { unit: 'j.' }),
    num('heightUnits', 'Wysokość (× 7 mm)', 2, 20, 1, { unit: 'j.', show: isBin }),
    section('Pojemnik', isBin),
    choice('lip', 'Rant do sztaplowania', [{ v: 1, label: 'Tak' }, { v: 0, label: 'Nie' }], { show: isBin }),
    choice('magnets', 'Otwory na magnesy 6×2', [{ v: 0, label: 'Nie' }, { v: 1, label: 'Tak' }], { show: isBin }),
    num('wall', 'Grubość ścianek', 0.8, 3, 0.05, { show: isBin }),
    num('partitionHeight', 'Wysokość przegródek', 0, 200, 0.5, { show: isBin })
  ],

  normalize(p) {
    const q = { ...p };
    q.unitsX = clamp(Math.round(q.unitsX), 1, 12);
    q.unitsY = clamp(Math.round(q.unitsY), 1, 12);
    q.heightUnits = clamp(Math.round(q.heightUnits), 2, 30);
    q.wall = clamp(q.wall, 0.8, 4);
    q.W = isBin(q) ? U * q.unitsX - 0.5 : U * q.unitsX;
    q.D = isBin(q) ? U * q.unitsY - 0.5 : U * q.unitsY;
    q.Hb = 7 * q.heightUnits;
    q.floor = FOOT_H + 1.2;
    q.maxPartition = Math.max(0, (q.lip ? q.Hb - 1.4 : q.Hb) - q.floor);
    q.partitionHeight = clamp(q.partitionHeight, 0, q.maxPartition);
    return q;
  },

  hint: (p) => isBin(p)
    ? `Pojemnik ${p.unitsX}×${p.unitsY}×${p.heightUnits}: ${p.W.toFixed(1)} × ${p.D.toFixed(1)} × ${(p.Hb + (p.lip ? LIP_H : 0)).toFixed(1)} mm.`
    : `Płyta ${p.unitsX}×${p.unitsY}: ${p.W} × ${p.D} mm.`,

  grid: {
    enabled: isBin,
    default: () => leaf(),
    outline: (p) => ({ W: p.W, D: p.D, r: BIN_R }),
    inner: (p) => ({ rect: [p.wall, p.wall, p.W - p.wall, p.D - p.wall], wall: p.wall, r: Math.max(BIN_R - p.wall, 0.5) })
  },

  build(kit, p, grid) {
    return isBin(p) ? [{ name: 'Pojemnik Gridfinity', solid: bin(kit, p, grid) }] : [{ name: 'Płyta bazowa', solid: baseplate(kit, p) }];
  }
};

function bin(kit, p, grid) {
  const { W, D, Hb, wall: w } = p;
  const top = Hb + (p.lip ? LIP_H : 0);
  const feet = [];
  for (let i = 0; i < p.unitsX; i++) {
    for (let j = 0; j < p.unitsY; j++) {
      const ox = i * U;
      const oy = j * U;
      const outline = (s) => kit.rr(ox + s, oy + s, ox + U - 0.5 - s, oy + U - 0.5 - s, Math.max(BIN_R - s, 0.3));
      feet.push(kit.profile(outline, [
        { z: 0, inset: 2.95 },
        { z: 0.8, inset: 2.15 },
        { z: 2.6, inset: 2.15 },
        { z: FOOT_H, inset: 0 }
      ]));
    }
  }
  let body = kit.union([...feet, kit.prism(kit.rr(0, 0, W, D, BIN_R), FOOT_H - 0.01, top)]);

  const innerR = Math.max(BIN_R - w, 0.5);
  const pocketTop = p.lip ? Hb - 1.4 + 0.01 : top + 1;
  body = kit.sub(body, kit.pockets(grid, [w, w, W - w, D - w], w, innerR, p.floor, pocketTop));
  const dividerTop = p.floor + p.partitionHeight;
  if (dividerTop < pocketTop - 0.02) {
    body = kit.sub(body, kit.prism(kit.rr(w, w, W - w, D - w, innerR), dividerTop, pocketTop));
  }

  if (p.lip) {
    // Lip cavity mirrors the foot so another bin seats on top.
    const outline = (s) => kit.rr(s, s, W - s, D - s, Math.max(BIN_R - s, 0.3));
    body = kit.sub(body, kit.profile(outline, [
      { z: Hb - 1.4, inset: w },
      { z: Hb, inset: Math.max(2.6, w) },
      { z: Hb + 0.7, inset: 1.9 },
      { z: Hb + 2.5, inset: 1.9 },
      { z: top, inset: 0.3 },
      { z: top + 1, inset: 0.3 }
    ]));
  }

  if (p.magnets) {
    const holes = [];
    for (let i = 0; i < p.unitsX; i++) {
      for (let j = 0; j < p.unitsY; j++) {
        const cx = i * U + (U - 0.5) / 2;
        const cy = j * U + (U - 0.5) / 2;
        for (const [dx, dy] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) {
          holes.push(kit.cyl(3.25, [cx + dx, cy + dy, -1], 'z', 3.4));
        }
      }
    }
    body = kit.sub(body, holes);
  }
  return body;
}

function baseplate(kit, p) {
  const { W, D } = p;
  const H = 4.65;
  let plate = kit.prism(kit.rr(0, 0, W, D, PLATE_R), 0, H);
  const pockets = [];
  for (let i = 0; i < p.unitsX; i++) {
    for (let j = 0; j < p.unitsY; j++) {
      const ox = i * U;
      const oy = j * U;
      const outline = (s) => kit.rr(ox + s, oy + s, ox + U - s, oy + U - s, Math.max(PLATE_R - s, 0.8));
      pockets.push(kit.profile(outline, [
        { z: -1, inset: 2.85 },
        { z: 0, inset: 2.85 },
        { z: 2.15, inset: 0.7 },
        { z: 3.95, inset: 0.7 },
        { z: H, inset: 0.05 },
        { z: H + 1, inset: 0.05 }
      ]));
    }
  }
  return kit.sub(plate, pockets);
}
