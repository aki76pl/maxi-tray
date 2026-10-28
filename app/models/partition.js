import { uniformGrid, clamp } from '../geometry.js';
import { section, num, choice, sizeFields, wallFields } from './fields.js';

// Open tray with dividers. "Stackable" adds a chamfered foot that nests in
// the opening of an identical tray below.
export default {
  id: 'partition',
  name: 'Przegródki',
  subtitle: 'Tacka z przegródkami, opcjonalnie sztaplowana',
  tags: ['Bez podpór'],
  defaults: {
    width: 100, depth: 100, height: 20, wall: 2, fillet: 2,
    partitionHeight: 16, stackable: 0, stackLip: 3, clearance: 0.3
  },
  fields: [
    ...sizeFields(),
    section('Konstrukcja'),
    ...wallFields(),
    num('partitionHeight', 'Wysokość przegródek', 0, 200),
    section('Sztaplowanie'),
    choice('stackable', 'Typ', [
      { v: 0, label: 'Niesztaplowana', icon: 'single' },
      { v: 1, label: 'Sztaplowana', icon: 'stack' }
    ]),
    num('stackLip', 'Wysokość stopki', 1, 10, 0.5, { show: (p) => p.stackable }),
    num('clearance', 'Luz pasowania', 0, 1, 0.05, { show: (p) => p.stackable })
  ],

  normalize(p) {
    const q = { ...p };
    q.wall = Math.max(0.4, q.wall);
    q.width = Math.max(q.wall * 2 + 4, q.width);
    q.depth = Math.max(q.wall * 2 + 4, q.depth);
    const base = q.stackable ? q.stackLip : 0;
    q.height = Math.max(base + q.wall + 1, q.height);
    q.fillet = clamp(q.fillet, 0, Math.min(q.width, q.depth) / 2 - 0.01);
    q.maxPartition = q.height - base - q.wall;
    q.partitionHeight = clamp(q.partitionHeight, 0, q.maxPartition);
    return q;
  },

  hint: (p) => `Pełna wysokość przegródek: ${p.maxPartition.toFixed(1)} mm (licząc od dna).`,

  grid: {
    default: () => uniformGrid(2, 2),
    outline: (p) => ({ W: p.width, D: p.depth, r: p.fillet }),
    inner: (p) => ({ rect: [p.wall, p.wall, p.width - p.wall, p.depth - p.wall], wall: p.wall, r: Math.max(p.fillet - p.wall, 0.5) })
  },

  // Z offset of the next tray in a stack (shown as a ghost in the preview).
  stackOffset: (p) => (p.stackable ? p.height - p.stackLip : null),

  build(kit, p, grid) {
    const { width: W, depth: D, height: H, wall: t } = p;
    const base = p.stackable ? p.stackLip : 0;
    let body = kit.tray({
      W, D, H, wall: t, radius: p.fillet, grid, z0: base,
      dividerTop: base + t + p.partitionHeight
    });
    if (p.stackable) {
      // The foot is inset by wall + clearance and chamfered at the bottom
      // so it finds its way into the tray below.
      const inset = t + p.clearance;
      const outline = (i) => kit.rr(inset + i, inset + i, W - inset - i, D - inset - i, Math.max(p.fillet - inset - i, 0.5));
      const ch = Math.min(0.8, base / 2);
      const foot = kit.profile(outline, [
        { z: 0, inset: ch },
        { z: ch, inset: 0 },
        { z: base + 0.01, inset: 0 }
      ]);
      body = kit.add(body, foot);
    }
    return [{ name: 'Tacka', solid: body }];
  }
};
