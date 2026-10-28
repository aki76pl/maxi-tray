import { Kit, meshArrays } from '../geometry.js';
import partition from './partition.js';
import { boxHardware, boxPrinted } from './box.js';
import walltray from './walltray.js';
import carrying from './carrying.js';
import gridfinity from './gridfinity.js';
import slide from './slide.js';
import { foldingBox, foldingTray } from './folding.js';

// Order matches the model picker.
export const MODELS = [partition, boxHardware, walltray, carrying, boxPrinted, gridfinity, slide, foldingBox, foldingTray];

export const MODEL_BY_ID = Object.fromEntries(MODELS.map((m) => [m.id, m]));

// Builds a model and returns parts as plain mesh data laid out side by side
// on the print bed. All WASM memory is released before returning.
export function buildModel(wasm, model, params, grid) {
  const p = model.normalize({ ...model.defaults, ...params });
  const kit = new Kit(wasm);
  try {
    const parts = model.build(kit, p, grid);
    let cursor = 0;
    const GAP = 10;
    const out = parts.map(({ name, solid }) => {
      const bb = solid.boundingBox();
      const mesh = meshArrays(solid);
      const volume = solid.volume();
      const genus = solid.genus();
      const pieces = solid.decompose();
      const shells = pieces.length;
      for (const piece of pieces) piece.delete();
      const offset = [cursor - bb.min[0], -bb.min[1], -bb.min[2]];
      cursor += bb.max[0] - bb.min[0] + GAP;
      return { name, ...mesh, offset, volume, genus, shells, size: [0, 1, 2].map((i) => bb.max[i] - bb.min[i]) };
    });
    return { params: p, parts: out };
  } finally {
    kit.free();
  }
}
