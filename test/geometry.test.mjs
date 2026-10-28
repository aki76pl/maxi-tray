// Builds every model with defaults and a few variants, checks that each part
// is a valid closed manifold, and writes STL files for inspection.
import Module from '../app/vendor/manifold/manifold.js';
import { uniformGrid, toBinarySTL } from '../app/geometry.js';
import { MODELS, MODEL_BY_ID, buildModel } from '../app/models/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const wasm = await Module();
wasm.setup();
mkdirSync('test/out', { recursive: true });

const cases = [
  ...MODELS.map((m) => [m.id, {}]),
  ['partition', { stackable: 1, height: 25 }],
  ['partition', { fillet: 0, partitionHeight: 100 }],
  ['box', { ribs: 0, width: 60, depth: 40 }],
  ['walltray', { mount: 'magnet', angle: 20 }],
  ['gridfinity', { part: 'baseplate', unitsX: 3, unitsY: 2 }],
  ['gridfinity', { unitsX: 1, unitsY: 1, lip: 0, magnets: 1, heightUnits: 3 }],
  ['foldingtray', { cols: 3, rows: 3 }]
];

let failed = 0;
for (const [id, params] of cases) {
  const model = MODEL_BY_ID[id];
  const grid = model.grid ? model.grid.default() : null;
  const t0 = performance.now();
  let res;
  try {
    res = buildModel(wasm, model, params, grid);
  } catch (e) {
    console.log(`FAIL ${id} ${JSON.stringify(params)}: ${e.stack}`);
    failed++;
    continue;
  }
  const ms = (performance.now() - t0).toFixed(0);
  const bad = res.parts.filter((p) => !(p.volume > 0) || p.indices.length === 0 || p.shells !== 1);
  const desc = res.parts.map((p) => `${p.name}[${p.size.map((v) => v.toFixed(1)).join('×')} vol=${(p.volume / 1000).toFixed(1)}cm³ g=${p.genus}]`).join(' ');
  console.log(`${bad.length ? 'FAIL' : 'ok  '} ${id} ${JSON.stringify(params)} ${ms}ms ${desc}`);
  if (bad.length) failed++;
  const tag = Object.entries(params).map(([k, v]) => `${k}-${v}`).join('_');
  writeFileSync(`test/out/${id}${tag ? '_' + tag : ''}.stl`, toBinarySTL(res.parts));
}
if (failed) {
  console.log(`${failed} case(s) failed`);
  process.exit(1);
}
