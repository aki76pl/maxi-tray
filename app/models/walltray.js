import { leaf, clamp } from '../geometry.js';
import { section, num, choice, sizeFields, wallFields } from './fields.js';

// Wall-mounted container. The back wall (y = depth) faces the wall.
// IKEA Skådis: separate J-clips (printed flat, no supports) press into
// pockets on the back. Magnets: blind holes in a thickened back wall.

const SKADIS_PITCH = 40; // horizontal hole pitch on the board
const CLIP_W = 4.5; // clip width (slot is 5 mm)

export default {
  id: 'walltray',
  name: 'Pojemnik ścienny',
  subtitle: 'Na tablicę IKEA Skådis albo na magnesy',
  tags: ['Montaż na ścianie'],
  defaults: {
    width: 100, depth: 60, height: 80, wall: 2, fillet: 6, angle: 0,
    partitionHeight: 78, mount: 'skadis', magnetDiameter: 8, magnetThickness: 3
  },
  fields: [
    ...sizeFields(),
    section('Montaż'),
    choice('mount', 'Sposób montażu', [
      { v: 'skadis', label: 'IKEA Skådis' },
      { v: 'magnet', label: 'Magnesy neodymowe' }
    ]),
    num('magnetDiameter', 'Średnica magnesu', 3, 20, 0.5, { show: (p) => p.mount === 'magnet' }),
    num('magnetThickness', 'Grubość magnesu', 1, 6, 0.5, { show: (p) => p.mount === 'magnet' }),
    section('Konstrukcja'),
    ...wallFields(),
    num('angle', 'Pochylenie krawędzi', 0, 45, 1, { unit: '°' }),
    num('partitionHeight', 'Wysokość przegródek', 0, 200)
  ],

  normalize(p) {
    const q = { ...p };
    q.wall = Math.max(1.2, q.wall);
    q.width = Math.max(30, q.width);
    q.depth = Math.max(15, q.depth);
    q.height = Math.max(25, q.height);
    q.fillet = clamp(q.fillet, 0, Math.min(q.width, q.depth) / 2 - 0.5);
    const maxDrop = q.height * 0.6;
    q.angle = clamp(q.angle, 0, Math.atan(maxDrop / q.depth) * 180 / Math.PI);
    q.frontHeight = q.height - q.depth * Math.tan(q.angle * Math.PI / 180);
    q.maxPartition = q.height - q.wall;
    q.partitionHeight = clamp(q.partitionHeight, 0, q.maxPartition);
    q.backWall = q.mount === 'magnet' ? Math.max(q.wall, q.magnetThickness + 1.4) : q.wall;
    return q;
  },

  hint: (p) => p.mount === 'skadis'
    ? `${skadisColumns(p).length * skadisRows(p).length} klipsów Skådis — wciśnij je (najlepiej z kroplą kleju) w gniazda z tyłu.`
    : `${magnetSpots(p).length} magnes(y) ${p.magnetDiameter}×${p.magnetThickness} mm, wciśnij od tyłu.`,

  grid: {
    default: () => leaf(),
    outline: (p) => ({ W: p.width, D: p.depth, r: p.fillet }),
    inner: (p) => ({ rect: [p.wall, p.wall, p.width - p.wall, p.depth - p.backWall], wall: p.wall, r: Math.max(p.fillet - p.wall, 0.5) })
  },

  build(kit, p, grid) {
    const { width: W, depth: D, height: H, wall: t } = p;
    const bw = p.backWall;
    const innerR = Math.max(p.fillet - t, 0.5);
    let body = kit.prism(kit.rr(0, 0, W, D, p.fillet), 0, H);
    body = kit.sub(body, kit.pockets(grid, [t, t, W - t, D - bw], t, innerR, t, H + 1));
    if (p.partitionHeight < H - t - 0.01) {
      body = kit.sub(body, kit.prism(kit.rr(t, t, W - t, D - bw, innerR), t + p.partitionHeight, H + 1));
    }

    const parts = [];
    if (p.mount === 'skadis') {
      // Each clip seats in a pocket inside a boss on the back wall.
      const bosses = [];
      const pockets = [];
      for (const x of skadisColumns(p)) {
        bosses.push(kit.box(x - 5, D - 4.5, t, x + 5, D - 0.5, H));
        for (const zt of skadisRows(p)) {
          pockets.push(kit.box(x - CLIP_W / 2 - 0.15, D - 2.2, zt - 10.15, x + CLIP_W / 2 + 0.15, D + 1, zt + 0.15));
        }
      }
      body = kit.sub(kit.add(body, kit.inter(kit.union(bosses), kit.prism(kit.rr(0, 0, W, D, p.fillet), 0, H))), pockets);
      const clip = skadisClip(kit);
      const count = skadisColumns(p).length * skadisRows(p).length;
      for (let i = 0; i < count; i++) parts.push({ name: `Klips Skådis ${i + 1}`, solid: i === 0 ? clip : kit.move(clip, 0, 0, 0) });
    } else {
      const holes = magnetSpots(p).map(([x, z]) =>
        kit.cyl(p.magnetDiameter / 2 + 0.15, [x, D - p.magnetThickness - 0.2, z], 'y', p.magnetThickness + 1.2));
      body = kit.sub(body, holes);
    }

    if (p.angle > 0.1) {
      const a = p.angle * Math.PI / 180;
      const n = [0, Math.sin(a), -Math.cos(a)];
      // Keep points on the low side of the sloped plane through (y=D, z=H).
      body = kit.k(body.trimByPlane(n, n[1] * D + n[2] * H));
    }
    return [{ name: 'Pojemnik', solid: body }, ...parts];
  }
};

function skadisColumns(p) {
  const n = Math.max(1, Math.floor((p.width - 20) / SKADIS_PITCH) + 1);
  const start = p.width / 2 - ((n - 1) * SKADIS_PITCH) / 2;
  return Array.from({ length: n }, (_, i) => start + i * SKADIS_PITCH);
}

// Top of each clip; a second row 40 mm lower when the tray is tall enough.
function skadisRows(p) {
  const top = p.height - 6;
  return top - 40 - 10 > p.wall + 2 ? [top, top - 40] : [top];
}

function magnetSpots(p) {
  const z = p.height * 0.6;
  if (p.width < 50) return [[p.width / 2, z]];
  return [[p.width * 0.25, z], [p.width * 0.75, z]];
}

// J-shaped clip, profile drawn in the YZ plane of the tray and extruded by
// the clip width so it prints lying flat.
function skadisClip(kit) {
  const profile = kit.poly([
    [-2, 0], [8.6, 0], [8.6, -13], [5.6, -13], [5.6, -5], [0, -5], [0, -10], [-2, -10]
  ]);
  return kit.toBed(kit.prism(profile, 0, CLIP_W));
}
