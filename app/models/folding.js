import { clamp } from '../geometry.js';
import { section, num } from './fields.js';

// Flat-printed folding box / tray with living hinges (V-grooves that leave a
// thin hinge layer on the bed side). Layout of the flat sheet (top view):
//
//            [ lid flap ]            (box only)
//            [   lid    ]            (box only)
//            [   back   ]
//  [in][out] [  bottom  ] [out][in]  side walls fold up, inner panels fold
//            [  front   ]            back down inside and lock into slots
//
// Front and back walls carry corner flaps that end up between the side wall
// layers. All folds close towards the top surface.

const TAB = 4; // locking tab length on the inner side panels

function makeFolding({ id, name, subtitle, lid }) {
  return {
    id,
    name,
    subtitle,
    tags: ['Druk na płasko', '⅓ czasu druku'],
    flat: true,
    defaults: lid
      ? { width: 90, depth: 55, height: 20, sheet: 1.2, hinge: 0.4 }
      : { width: 60, depth: 100, height: 20, sheet: 1.2, hinge: 0.4, cols: 1, rows: 2 },
    fields: [
      section('Wymiary po złożeniu'),
      num('width', 'Szerokość (X)', 20, 250, 1),
      num('depth', 'Głębokość (Y)', 20, 250, 1),
      num('height', 'Wysokość (Z)', 8, 80, 1),
      section('Arkusz'),
      num('sheet', 'Grubość arkusza', 0.8, 2.4, 0.1),
      num('hinge', 'Grubość zawiasu', 0.2, 0.8, 0.05, { help: '2 warstwy przy 0,2 mm' }),
      ...(lid ? [] : [
        section('Przegródki (wkładane)'),
        num('cols', 'Komory w poziomie (X)', 1, 8, 1, { unit: 'szt.' }),
        num('rows', 'Komory w pionie (Y)', 1, 8, 1, { unit: 'szt.' })
      ])
    ],

    normalize(p) {
      const q = { ...p };
      q.sheet = clamp(q.sheet, 0.6, 3);
      q.hinge = clamp(q.hinge, 0.15, q.sheet - 0.3);
      q.width = Math.max(20, q.width);
      q.depth = Math.max(20, q.depth);
      q.height = clamp(q.height, 8, Math.min(q.width, q.depth));
      q.cols = clamp(Math.round(q.cols || 1), 1, 10);
      q.rows = clamp(Math.round(q.rows || 1), 1, 10);
      const T = q.sheet;
      q.inner = q.height - 2 * T; // inner side panel height
      q.flatW = q.width + 2 * (q.height + 3 * T + q.inner + TAB);
      q.lidFlap = Math.min(q.height * 0.6, 15);
      q.flatD = q.depth + 2 * q.height + (lid ? q.depth + 2 * T + q.lidFlap : 0);
      return q;
    },

    hint: (p) => `Po złożeniu: ${fmt(p.width)} × ${fmt(p.depth)} × ${fmt(p.height)} mm. Arkusz: ${fmt(p.flatW)} × ${fmt(p.flatD)} mm.`,

    grid: null,

    build(kit, p) {
      const parts = [{ name: lid ? 'Arkusz pudełka' : 'Arkusz tacki', solid: sheet(kit, p, lid) }];
      if (!lid) parts.push(...dividers(kit, p));
      return parts;
    }
  };
}

const fmt = (v) => (+v.toFixed(1)).toLocaleString('pl-PL');

function sheet(kit, p, lid) {
  const { width: W, depth: D, height: H, sheet: T, hinge: h, inner: Hi } = p;
  const allowance = 3 * T; // 180° fold around the sandwiched corner flap
  const panels = [];
  const grooves = [];
  const slots = [];
  const rect = (x0, y0, x1, y1) => kit.box(x0, y0, 0, x1, y1, T);

  // Bottom, front, back.
  panels.push(rect(0, 0, W, D), rect(0, -H, W, 0), rect(0, D, W, D + H));
  grooves.push(vGroove(kit, 'x', 0, 0, W, T, h), vGroove(kit, 'x', D, 0, W, T, h));

  // Corner flaps on front and back walls (gap of 1 mm to the side walls).
  const fw = Math.min(H - 1, D / 2 - 2);
  for (const [y0, y1] of [[-H + 0.5, -1], [D + 1, D + H - 0.5]]) {
    for (const side of [-1, 1]) {
      const xe = side < 0 ? 0 : W;
      const xo = xe + side * fw;
      const c = Math.min(2, (y1 - y0) / 3); // chamfer on the free outer corner
      const near = y0 < 0 ? y1 : y0; // edge next to the bottom panel
      const far = y0 < 0 ? y0 : y1;
      const dir = Math.sign(far - near);
      panels.push(kit.prism(kit.poly([
        [xe, near], [xo, near], [xo, far - dir * c], [xo - side * c, far], [xe, far]
      ]), 0, T));
      grooves.push(vGroove(kit, 'y', xe, y0, y1, T, h));
    }
  }

  // Side walls: outer panel, 180° fold allowance, inner panel, locking tabs.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 0 : W; // hinge line with the bottom
    const a = (d) => x0 + side * d; // distance outward from the hinge line
    const span = (u, v) => [Math.min(a(u), a(v)), Math.max(a(u), a(v))];
    let [l, r] = span(0, H + allowance + Hi);
    panels.push(rect(l, 0, r, D));
    grooves.push(vGroove(kit, 'y', x0, 0, D, T, h));
    // Flat channel leaves only the hinge layer across the 180° fold.
    [l, r] = span(H, H + allowance);
    grooves.push(kit.box(l, -1, h, r, D + 1, T + 1));
    // Tabs on the free edge of the inner panel, and matching slots in the bottom.
    for (const cy of [D * 0.25, D * 0.75]) {
      const tw = Math.min(D / 4, 20);
      [l, r] = span(H + allowance + Hi - 0.01, H + allowance + Hi + TAB);
      panels.push(rect(l, cy - tw / 2, r, cy + tw / 2));
      // After folding, the inner panel stands T..2T inside the side wall.
      [l, r] = span(-T - 0.3, -2 * T - 0.4);
      slots.push(kit.box(l, cy - tw / 2 - 0.4, -1, r, cy + tw / 2 + 0.4, T + 1));
    }
  }

  if (lid) {
    const y0 = D + H;
    const y1 = y0 + D + 2 * T;
    panels.push(rect(0, y0, W, y1), rect(0, y1, W, y1 + p.lidFlap));
    grooves.push(vGroove(kit, 'x', y0, 0, W, T, h), vGroove(kit, 'x', y1, 0, W, T, h));
  }

  const flat = kit.sub(kit.union(panels.filter(Boolean)), [...grooves, ...slots]);
  return kit.toBed(flat);
}

// V-groove from the top surface down to the hinge layer, along a line.
// axis 'x': line y = c from u0 to u1; axis 'y': line x = c.
function vGroove(kit, axis, c, u0, u1, T, h) {
  const d = T - h;
  const tri = kit.poly([[-d - 0.01, T + 0.01], [d + 0.01, T + 0.01], [0, h]]);
  let g = kit.k(kit.M.extrude(tri, u1 - u0));
  if (axis === 'x') {
    g = kit.rot(kit.rot(g, 90, 0, 0), 0, 0, 90); // (u,v,w) → (w,u,v)
    return kit.move(g, u0, c, 0);
  }
  g = kit.rot(g, 90, 0, 0); // (u,v,w) → (u,-w,v)
  return kit.move(g, c, u1, 0);
}

// Egg-crate dividers printed flat: strips along Y get slots from the top,
// strips along X from the bottom.
function dividers(kit, p) {
  const { width: W, depth: D, height: H, sheet: T, cols, rows } = p;
  const dt = 1.2;
  const hd = H - T - 2;
  const wi = W - 4 * T - 0.6;
  const di = D - 0.6;
  const xs = Array.from({ length: cols - 1 }, (_, i) => (wi * (i + 1)) / cols);
  const ys = Array.from({ length: rows - 1 }, (_, i) => (di * (i + 1)) / rows);
  const strip = (len, cuts, fromTop) => {
    let s = kit.box(0, 0, 0, len, hd, dt);
    const slots = cuts.map((u) => fromTop
      ? kit.box(u - dt / 2 - 0.15, hd / 2 - 0.1, -1, u + dt / 2 + 0.15, hd + 1, dt + 1)
      : kit.box(u - dt / 2 - 0.15, -1, -1, u + dt / 2 + 0.15, hd / 2 + 0.1, dt + 1));
    return kit.sub(s, slots);
  };
  const parts = [];
  xs.forEach((_, i) => parts.push({ name: `Przegroda Y${i + 1}`, solid: strip(di, ys, true) }));
  ys.forEach((_, i) => parts.push({ name: `Przegroda X${i + 1}`, solid: strip(wi, xs, false) }));
  return parts;
}

export const foldingBox = makeFolding({
  id: 'foldingbox',
  name: 'Pudełko składane',
  subtitle: 'Drukowane na płasko, z wieczkiem na zawiasie',
  lid: true
});

export const foldingTray = makeFolding({
  id: 'foldingtray',
  name: 'Tacka składana',
  subtitle: 'Drukowana na płasko, z wkładanymi przegródkami',
  lid: false
});
