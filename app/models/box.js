import { uniformGrid, clamp } from '../geometry.js';
import { section, num, choice, sizeFields, wallFields } from './fields.js';

// Hinged box with a snap latch. Two variants:
//  - hardware: knuckles share a through hole for a pin (filament, wire, rod)
//  - printed:  lid knuckles carry short pins that snap into the base knuckles
// Coordinates are built assembled (base z∈[0,hb], lid z∈[hb,H]); the lid is
// flipped onto its top for printing.

const GAP = 0.4; // gap between knuckles along the hinge axis
const PIN = 1.6; // how far printed pins reach into the base knuckles

function makeBox({ id, name, subtitle, tags, hardware }) {
  return {
    id,
    name,
    subtitle,
    tags,
    defaults: {
      width: 100, depth: 100, height: 30, lidHeight: 10, wall: 2, fillet: 2,
      partitionHeight: 14, ribs: 1, pinDiameter: 1.75, clearance: 0.3
    },
    fields: [
      ...sizeFields(),
      num('lidHeight', 'Wysokość pokrywki', 4, 60),
      section('Konstrukcja'),
      ...wallFields(),
      num('partitionHeight', 'Wysokość przegródek', 0, 200),
      choice('ribs', 'Ścianki', [
        { v: 1, label: 'Żebrowane' },
        { v: 0, label: 'Gładkie' }
      ]),
      section('Zawias'),
      hardware
        ? num('pinDiameter', 'Średnica sworznia', 1, 5, 0.05, { help: '1,75 = odcinek filamentu, 3 = pręt lub śruba M3' })
        : num('pinDiameter', 'Średnica czopów', 1.5, 4, 0.1),
      num('clearance', 'Luz', 0.1, 0.8, 0.05)
    ],

    normalize(p) {
      const q = { ...p };
      q.wall = Math.max(1.2, q.wall);
      q.width = Math.max(40, q.width);
      q.depth = Math.max(30, q.depth);
      q.height = Math.max(14, q.height);
      q.lidHeight = clamp(q.lidHeight, q.wall + 2, q.height - q.wall - 6);
      q.fillet = clamp(q.fillet, 0, Math.min(q.width, q.depth) / 2 - 5);
      q.hb = q.height - q.lidHeight;
      q.maxPartition = Math.max(0, q.hb - q.wall - 2.4); // stay below the lid skirt
      q.partitionHeight = clamp(q.partitionHeight, 0, q.maxPartition);
      return q;
    },

    hint: (p) => hardware
      ? `Sworzeń: odcinek ${p.pinDiameter} mm o długości ok. ${Math.round(hingeSpan(p).len)} mm.`
      : 'Zawias drukowany: wciśnij czopy pokrywki w otwory podstawy.',

    grid: {
      default: () => uniformGrid(2, 1),
      outline: (p) => ({ W: p.width, D: p.depth, r: p.fillet }),
      inner: (p) => ({ rect: [p.wall, p.wall, p.width - p.wall, p.depth - p.wall], wall: p.wall, r: Math.max(p.fillet - p.wall, 0.5) })
    },

    build(kit, p, grid) {
      const { width: W, depth: D, height: H, wall: t, hb } = p;
      const clr = p.clearance;
      const innerR = Math.max(p.fillet - t, 0.5);

      // --- base ---
      let base = kit.tray({ W, D, H: hb, wall: t, radius: p.fillet, grid, dividerTop: t + p.partitionHeight });

      // --- lid (assembled position) ---
      let lid = kit.sub(
        kit.prism(kit.rr(0, 0, W, D, p.fillet), hb, H),
        kit.prism(kit.rr(t, t, W - t, D - t, innerR), hb - 1, H - t)
      );
      // Skirt that drops into the base opening and keeps the lid aligned.
      // A band inside the lid wall (z ≥ hb) carries it.
      const si = t + clr;
      const ring = (inset) => kit.rr(inset, inset, W - inset, D - inset, Math.max(p.fillet - inset, 0.5));
      const hole = kit.prism(ring(si + 1.2), hb - 3, hb + 3);
      const skirt = kit.sub(kit.union([
        kit.prism(ring(si), hb - 2, hb + 0.01),
        kit.prism(ring(t - 0.01), hb, hb + 1.5)
      ]), hole);
      lid = kit.add(lid, skirt);

      // --- hinge ---
      const span = hingeSpan(p);
      const rp = p.pinDiameter / 2;
      const rk = rp + (hardware ? 1.6 : 2.2);
      const ay = D + 0.4 + rk;
      const segLen = (span.len - (span.n - 1) * GAP) / span.n;
      const baseParts = [];
      const lidParts = [];
      for (let i = 0; i < span.n; i++) {
        const x0 = span.x0 + i * (segLen + GAP);
        const cylinder = kit.cyl(rk, [x0, ay, hb], 'x', segLen);
        if (i % 2 === 0) {
          const strip = kit.box(x0, D - t / 2, hb - 3 * rk, x0 + segLen, D, hb);
          let k = kit.k(kit.M.hull([cylinder, strip]));
          k = kit.sub(k, kit.box(x0 - 1, D - t - 1, hb, x0 + segLen + 1, D + 0.2, hb + rk + 1));
          baseParts.push(k);
        } else {
          const top = Math.min(hb + 3 * rk, H);
          const strip = kit.box(x0, D - t / 2, hb, x0 + segLen, D, top);
          let k = kit.k(kit.M.hull([cylinder, strip]));
          k = kit.sub(k, kit.box(x0 - 1, D - t - 1, hb - rk - 1, x0 + segLen + 1, D + 0.2, hb));
          lidParts.push(k);
          if (!hardware) {
            // Tapered pins reaching into both neighbouring base knuckles;
            // the taper lets them cam in with a slight flex of the knuckles.
            const len = GAP + PIN;
            lidParts.push(kit.cyl(rp * 0.55, [x0 - len, ay, hb], 'x', len + 0.01, rp));
            lidParts.push(kit.cyl(rp, [x0 + segLen - 0.01, ay, hb], 'x', len + 0.01, rp * 0.55));
          }
        }
      }
      base = kit.add(base, baseParts);
      lid = kit.add(lid, lidParts);
      if (hardware) {
        const hole = kit.cyl(rp + 0.15, [span.x0 - 1, ay, hb], 'x', span.len + 2);
        base = kit.sub(base, hole);
        lid = kit.sub(lid, hole);
      } else {
        const holes = [];
        const len = GAP + PIN + 0.3;
        for (let i = 1; i < span.n; i += 2) {
          const x0 = span.x0 + i * (segLen + GAP);
          holes.push(kit.cyl(rp * 0.55 + clr, [x0 - len, ay, hb], 'x', len, rp + clr));
          holes.push(kit.cyl(rp + clr, [x0 + segLen, ay, hb], 'x', len, rp * 0.55 + clr));
        }
        base = kit.sub(base, holes);
      }

      // --- latch: flexible tab on the lid, groove in the base front wall ---
      const cx = W / 2;
      const lw = Math.min(20, W / 3);
      const tabT = 1.6;
      const tab = kit.union([
        kit.box(cx - lw / 2, -0.3 - tabT, hb - 6, cx + lw / 2, -0.3, Math.min(hb + 4, H)),
        kit.box(cx - lw / 2, -0.3 - tabT, hb, cx + lw / 2, t / 2, Math.min(hb + 4, H)),
        kit.box(cx - lw / 2, -0.6, hb - 5.2, cx + lw / 2, 0.55, hb - 3.8) // bump, overlaps the tab
      ]);
      lid = kit.add(lid, tab);
      base = kit.sub(base, kit.box(cx - lw / 2 - 0.6, -1, hb - 5.6, cx + lw / 2 + 0.6, 0.9, hb - 3.4));

      // --- decorative ribs ---
      if (p.ribs) {
        const keepOut = [[cx - lw / 2 - 3, cx + lw / 2 + 3]];
        base = kit.add(base, ribs(kit, p, 1, hb - 1.5, keepOut));
        lid = kit.add(lid, ribs(kit, p, hb + 1.5, H - 1, keepOut));
      }

      const lidPrint = kit.toBed(kit.rot(lid, 180, 0, 0));
      return [
        { name: 'Podstawa', solid: base },
        { name: 'Pokrywka', solid: lidPrint }
      ];
    }
  };
}

function hingeSpan(p) {
  const avail = p.width - 2 * (p.fillet + 4);
  const len = clamp(p.width * 0.6, Math.min(30, avail), avail);
  const n = len >= 50 ? 5 : 3;
  return { len, n, x0: (p.width - len) / 2 };
}

// Vertical ribs, 0.8 mm proud of the wall, along the straight parts of the
// outline. The back wall stays smooth where the hinge is.
function ribs(kit, p, z0, z1, frontKeepOut) {
  const { width: W, depth: D } = p;
  const pitch = 5;
  const w = 1.2;
  const out = 0.8;
  const margin = p.fillet + 1;
  const list = [];
  const along = (len) => {
    const n = Math.floor((len - 2 * margin) / pitch);
    const start = (len - n * pitch) / 2;
    return Array.from({ length: n + 1 }, (_, i) => start + i * pitch);
  };
  const span = hingeSpan(p);
  for (const x of along(W)) {
    if (!frontKeepOut.some(([a, b]) => x > a && x < b)) list.push(kit.box(x - w / 2, -out, z0, x + w / 2, 0.5, z1));
    if (x < span.x0 - 2 || x > span.x0 + span.len + 2) list.push(kit.box(x - w / 2, D - 0.5, z0, x + w / 2, D + out, z1));
  }
  for (const y of along(D)) {
    list.push(kit.box(-out, y - w / 2, z0, 0.5, y + w / 2, z1));
    list.push(kit.box(p.width - 0.5, y - w / 2, z0, W + out, y + w / 2, z1));
  }
  return list;
}

export const boxHardware = makeBox({
  id: 'box',
  name: 'Pudełko z zawiasem',
  subtitle: 'Pokrywka na zawiasie ze sworzniem i zatrzask',
  tags: ['Wymaga sworznia'],
  hardware: true
});

export const boxPrinted = makeBox({
  id: 'box-nh',
  name: 'Pudełko (bez okuć)',
  subtitle: 'Zawias z drukowanymi czopami, bez dodatkowych części',
  tags: ['Bez okuć'],
  hardware: false
});
