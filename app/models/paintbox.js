import { clamp } from '../geometry.js';
import { section, num, choice } from './fields.js';
import { bottleFields, holeLayout, holeCuts } from './paints.js';

// Closed box for paint bottles: the floor holds every bottle in its own hole,
// the walls reach above the caps and a lid closes it. The lid either sits on
// top with a lip inside the walls, or slides in grooves from the front.

const CLR = 0.25; // lid clearance
const LIP_T = 1.6; // lip wall thickness
const LIP_H = 6; // lip height
const GROOVE = 1.2; // slide-lid groove depth
const LIP = 1.2; // material above the groove

export default {
  id: 'paintbox',
  name: 'Pudełko na farby',
  subtitle: 'Zamykane, z otworami na butelki',
  tags: ['Bez podpór'],
  defaults: {
    bottle: 'dropper17', shape: 'round', dia: 25.5, bottleHeight: 85, clearance: 0.8, holeDepth: 25,
    cols: 5, rows: 3, spacing: 2, layout: 'grid',
    lid: 'cap', wall: 2, floor: 1.5, edge: 2, headroom: 2, lidThickness: 2, fillet: 3, pushHole: 0
  },
  fields: [
    ...bottleFields([num('bottleHeight', 'Wysokość butelki z zakrętką', 10, 200, 0.5)]),
    section('Pudełko'),
    choice('lid', 'Wieczko', [{ v: 'cap', label: 'Nakładane' }, { v: 'slide', label: 'Wsuwane' }]),
    num('wall', 'Grubość ścianek', 1.2, 6, 0.1),
    num('floor', 'Grubość dna', 0.8, 5, 0.1),
    num('edge', 'Odstęp od ścianek', 2, 15, 0.5),
    num('headroom', 'Zapas nad butelką', 0, 20, 0.5),
    num('lidThickness', 'Grubość wieczka', 1.2, 5, 0.1),
    num('fillet', 'Zaokrąglenie rogów', 0, 15, 0.5),
    choice('pushHole', 'Otwór w dnie', [{ v: 0, label: 'Nie' }, { v: 1, label: 'Tak' }])
  ],

  normalize(p) {
    const q = holeLayout(p);
    q.holeDepth = Math.min(q.holeDepth, q.bottleHeight - 2);
    q.side = q.lid === 'slide' ? Math.max(q.wall, GROOVE + 1.2) : q.wall; // left, right, back
    q.width = 2 * q.side + 2 * q.edge + q.fieldW;
    q.depth = q.wall + q.side + 2 * q.edge + q.fieldD;
    q.top = q.floor + q.bottleHeight + q.headroom; // free height above the bottles ends here
    q.height = q.lid === 'slide' ? q.top + q.lidThickness + 0.3 + LIP : q.top;
    q.fillet = clamp(q.fillet, 0, q.side);
    return q;
  },

  hint: (p) => `${p.cols * p.rows} butelek, otwór ${p.hole.toFixed(1)} mm. Pudełko ${p.width.toFixed(0)} × ${p.depth.toFixed(0)} × ` +
    `${(p.height + (p.lid === 'cap' ? p.lidThickness : 0)).toFixed(0)} mm z wieczkiem. Wymiary butelek są orientacyjne: zmierz swoją suwmiarką.`,

  grid: null,

  build(kit, p) {
    const { width: W, depth: D, height: H, wall: t, side: s, floor, holeDepth, lidThickness: L } = p;
    const zt = floor + holeDepth; // top of the hole block
    const inner = [s, t, W - s, D - s];

    let body = kit.prism(kit.rr(0, 0, W, D, p.fillet), 0, H);
    const cuts = [
      kit.prism(kit.rr(...inner, 0.5), zt, H + 1),
      ...holeCuts(kit, p, { x0: s + p.edge, y0: t + p.edge, top: () => zt, pushHole: p.pushHole })
    ];

    let lid;
    if (p.lid === 'slide') {
      const zg0 = p.top;
      const zg1 = zg0 + L + 0.3;
      cuts.push(
        kit.box(s - GROOVE, -1, zg0, W - s + GROOVE, D - s + GROOVE, zg1), // grooves
        kit.box(s - GROOVE, -1, zg0, W - s + GROOVE, t + 0.01, H + 1) // front opening
      );
      // Lid flat on the bed; the block on its front edge closes the opening.
      const lw = W - 2 * s + 2 * GROOVE - 2 * 0.2;
      const ld = D - s + GROOVE - 0.2;
      const hx = GROOVE - 0.2 + 0.2;
      lid = kit.union([
        kit.box(0, 0, 0, lw, ld, L),
        kit.box(hx, 0, 0, lw - hx, t, H - zg0 - 0.1)
      ]);
    } else {
      // Thumb notch in the front wall to lift the lid.
      cuts.push(kit.cyl(Math.min(8, (H - zt) / 2), [W / 2, -1, H], 'y', t + 2));
      // Lid flat on the bed with the lip pointing up.
      const ring = kit.sub(
        kit.prism(kit.rr(s + CLR, t + CLR, W - s - CLR, D - s - CLR, 0.5), L, L + LIP_H),
        kit.prism(kit.rr(s + CLR + LIP_T, t + CLR + LIP_T, W - s - CLR - LIP_T, D - s - CLR - LIP_T, 0.5), L - 1, L + LIP_H + 1)
      );
      lid = kit.union([kit.prism(kit.rr(0, 0, W, D, p.fillet), 0, L), ring]);
    }
    body = kit.sub(body, cuts);
    return [
      { name: 'Pudełko na farby', solid: body },
      { name: 'Wieczko', solid: lid }
    ];
  }
};
