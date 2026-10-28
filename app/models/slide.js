import { uniformGrid, clamp } from '../geometry.js';
import { section, num, sizeFields } from './fields.js';

// Box with a lid that slides in grooves along the side walls. The lid enters
// from the front; a block on its front edge closes the opening and acts as
// the pull handle.

const GROOVE = 1.2; // groove depth into the side and back walls
const LIP = 1.2; // material above the groove
const CLR = 0.2;

export default {
  id: 'slide',
  name: 'Pudełko z wsuwanym wiekiem',
  subtitle: 'Wieczko wsuwane w rowki, bez zawiasów',
  tags: ['Bez podpór'],
  defaults: { width: 100, depth: 70, height: 30, wall: 2, fillet: 2, lidThickness: 2, partitionHeight: 22 },
  fields: [
    ...sizeFields(),
    section('Konstrukcja'),
    num('wall', 'Grubość ścianek', 1.2, 6, 0.1),
    num('fillet', 'Zaokrąglenie rogów', 0, 10, 0.5),
    num('lidThickness', 'Grubość wieczka', 1.2, 5, 0.1),
    num('partitionHeight', 'Wysokość przegródek', 0, 200)
  ],

  normalize(p) {
    const q = { ...p };
    q.wall = Math.max(1.2, q.wall);
    q.side = Math.max(q.wall, GROOVE + 1.2);
    q.width = Math.max(30, q.width);
    q.depth = Math.max(30, q.depth);
    q.height = Math.max(12, q.height);
    q.fillet = clamp(q.fillet, 0, q.side);
    q.zg0 = q.height - LIP - q.lidThickness - 0.3;
    q.maxPartition = Math.max(0, q.zg0 - q.wall - 0.4);
    q.partitionHeight = clamp(q.partitionHeight, 0, q.maxPartition);
    return q;
  },

  hint: (p) => `Wieczko wsuwa się od przodu. Przegródki do ${p.maxPartition.toFixed(1)} mm.`,

  grid: {
    default: () => uniformGrid(3, 1),
    outline: (p) => ({ W: p.width, D: p.depth, r: p.fillet }),
    inner: (p) => ({ rect: [p.side, p.wall, p.width - p.side, p.depth - p.side], wall: p.wall, r: 0.5 })
  },

  build(kit, p, grid) {
    const { width: W, depth: D, height: H, wall: t, side: s, zg0, lidThickness: L } = p;
    const zg1 = zg0 + L + 0.3;
    let body = kit.prism(kit.rr(0, 0, W, D, p.fillet), 0, H);
    body = kit.sub(body, kit.pockets(grid, [s, t, W - s, D - s], t, 0.5, t, H + 1));
    body = kit.sub(body, [
      kit.prism(kit.rr(s, t, W - s, D - s, 0.5), t + p.partitionHeight, H + 1),
      kit.box(s - GROOVE, -1, zg0, W - s + GROOVE, D - s + GROOVE, zg1), // grooves
      kit.box(s - GROOVE, -1, zg0, W - s + GROOVE, t + 0.01, H + 1) // front opening
    ]);

    // Lid in print orientation (flat on the bed).
    const lw = W - 2 * s + 2 * GROOVE - 2 * CLR;
    const ld = D - s + GROOVE - CLR;
    const handleX0 = GROOVE - CLR + 0.2; // block fits between the side lips
    const handleH = H - zg0 - 0.1;
    const lid = kit.union([
      kit.box(0, 0, 0, lw, ld, L),
      kit.box(handleX0, 0, 0, lw - handleX0, t, handleH)
    ]);
    return [
      { name: 'Pudełko', solid: body },
      { name: 'Wieczko', solid: lid }
    ];
  }
};
