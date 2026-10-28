import { uniformGrid, clamp } from '../geometry.js';
import { section, num, sizeFields } from './fields.js';

// Tool caddy: tray with dividers and a tall centre spine with a grip slot.
export default {
  id: 'carrying',
  name: 'Skrzynka z rączką',
  subtitle: 'Organizer do noszenia z uchwytem i przegródkami',
  tags: ['Rączka', 'Przegródki'],
  defaults: {
    width: 250, depth: 140, height: 50, wall: 2, fillet: 6,
    partitionHeight: 40, handleHeight: 50, spine: 4, gripLength: 110
  },
  fields: [
    ...sizeFields(),
    section('Konstrukcja'),
    num('wall', 'Grubość ścianek', 0.8, 6, 0.1),
    num('fillet', 'Promień narożników', 0, 30, 0.5),
    num('partitionHeight', 'Wysokość przegródek', 0, 200),
    section('Rączka'),
    num('handleHeight', 'Wysokość nad ściankami', 25, 120, 1),
    num('gripLength', 'Długość uchwytu', 60, 200, 1),
    num('spine', 'Grubość środkowej ścianki', 2, 8, 0.5)
  ],

  normalize(p) {
    const q = { ...p };
    q.wall = Math.max(1.2, q.wall);
    q.width = Math.max(80, q.width);
    q.depth = Math.max(40, q.depth);
    q.height = Math.max(15, q.height);
    q.fillet = clamp(q.fillet, 0, Math.min(q.width, q.depth) / 2 - 0.5);
    q.handleHeight = Math.max(25, q.handleHeight);
    q.gripLength = clamp(q.gripLength, 40, q.width - 2 * q.wall - 40);
    q.maxPartition = q.height - q.wall;
    q.partitionHeight = clamp(q.partitionHeight, 0, q.maxPartition);
    return q;
  },

  hint: (p) => `Całkowita wysokość z rączką: ${(p.height + p.handleHeight).toFixed(0)} mm.`,

  grid: {
    default: () => uniformGrid(3, 2),
    outline: (p) => ({ W: p.width, D: p.depth, r: p.fillet }),
    inner: (p) => ({ rect: [p.wall, p.wall, p.width - p.wall, p.depth - p.wall], wall: p.wall, r: Math.max(p.fillet - p.wall, 0.5) }),
    // The spine is fixed; the editor draws it on top of the grid.
    overlays: (p) => [[p.wall, p.depth / 2 - p.spine / 2, p.width - p.wall, p.depth / 2 + p.spine / 2]]
  },

  build(kit, p, grid) {
    const { width: W, depth: D, height: H, wall: t } = p;
    let body = kit.tray({ W, D, H, wall: t, radius: p.fillet, grid, dividerTop: t + p.partitionHeight });

    // Spine profile in the XZ plane: rounded top corners, stadium grip slot.
    const top = H + p.handleHeight;
    const r = Math.min(20, p.handleHeight * 0.6);
    let profile = kit.k(kit.CS.union(kit.rr(t - 0.5, 0, W - t + 0.5, top, r), kit.rr(t - 0.5, 0, W - t + 0.5, top - r, 0)));
    const slotH = Math.min(30, p.handleHeight - 14);
    const slotTop = top - 10;
    profile = kit.k(profile.subtract(kit.rr(W / 2 - p.gripLength / 2, slotTop - slotH, W / 2 + p.gripLength / 2, slotTop, slotH / 2)));
    // Extrude along Z, then turn so the profile's Y becomes height.
    let spine = kit.k(kit.M.extrude(profile, p.spine));
    spine = kit.rot(spine, 90, 0, 0);
    spine = kit.move(spine, 0, D / 2 + p.spine / 2, 0);
    body = kit.add(body, spine);
    return [{ name: 'Skrzynka', solid: body }];
  }
};
