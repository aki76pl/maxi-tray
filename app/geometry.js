// Shared geometry helpers built on manifold-3d (watertight, printable meshes).
// Units: millimetres. Z is up, parts sit on Z=0.

// ---------- Grid layout (recursive split tree) ----------
// Node: { split: null | 'x' | 'y', sizes: number[] (fractions), children: Node[] }
// 'x' = children laid out along X (dividers parallel to Y), 'y' = along Y.

export function leaf() {
  return { split: null, sizes: [], children: [] };
}

// Returns compartments as rectangles [x0, y0, x1, y1] inside `rect`,
// with gaps of `wall` between neighbours.
export function layoutCells(node, rect, wall, out = [], path = []) {
  if (!node.split) {
    out.push({ rect, path });
    return out;
  }
  const axis = node.split === 'x' ? 0 : 1;
  const start = rect[axis];
  const end = rect[axis + 2];
  const n = node.children.length;
  const usable = end - start - wall * (n - 1);
  let cursor = start;
  node.children.forEach((child, i) => {
    const len = usable * node.sizes[i];
    const r = rect.slice();
    r[axis] = cursor;
    r[axis + 2] = i === n - 1 ? end : cursor + len;
    layoutCells(child, r, wall, out, path.concat(i));
    cursor += len + wall;
  });
  return out;
}

// Positions of dividers, used by the 2D editor for dragging.
export function layoutDividers(node, rect, wall, out = [], path = []) {
  if (!node.split) return out;
  const axis = node.split === 'x' ? 0 : 1;
  const start = rect[axis];
  const end = rect[axis + 2];
  const n = node.children.length;
  const usable = end - start - wall * (n - 1);
  let cursor = start;
  node.children.forEach((child, i) => {
    const len = usable * node.sizes[i];
    const r = rect.slice();
    r[axis] = cursor;
    r[axis + 2] = i === n - 1 ? end : cursor + len;
    layoutDividers(child, r, wall, out, path.concat(i));
    if (i < n - 1) {
      const d = rect.slice();
      d[axis] = cursor + len;
      d[axis + 2] = cursor + len + wall;
      out.push({ rect: d, path, index: i, axis, usable });
    }
    cursor += len + wall;
  });
  return out;
}

export function getNode(root, path) {
  return path.reduce((n, i) => n.children[i], root);
}

// Split a leaf (by path) into `count` equal parts along `split`.
// If the parent already splits along the same axis, the leaf is replaced
// by `count` siblings instead of nesting (keeps the tree flat).
export function splitCell(root, path, split, count = 2) {
  const parent = path.length ? getNode(root, path.slice(0, -1)) : null;
  const idx = path[path.length - 1];
  if (parent && parent.split === split) {
    const share = parent.sizes[idx] / count;
    parent.children.splice(idx, 1, ...Array.from({ length: count }, leaf));
    parent.sizes.splice(idx, 1, ...Array(count).fill(share));
    return;
  }
  const node = getNode(root, path);
  node.split = split;
  node.children = Array.from({ length: count }, leaf);
  node.sizes = Array(count).fill(1 / count);
}

// Remove a compartment by merging it into its neighbour.
export function mergeCell(root, path) {
  if (!path.length) return;
  const parent = getNode(root, path.slice(0, -1));
  const idx = path[path.length - 1];
  const neighbour = idx > 0 ? idx - 1 : 1;
  parent.sizes[neighbour] += parent.sizes[idx];
  parent.children.splice(idx, 1);
  parent.sizes.splice(idx, 1);
  if (parent.children.length === 1) {
    const only = parent.children[0];
    parent.split = only.split;
    parent.sizes = only.sizes;
    parent.children = only.children;
  }
}

export function uniformGrid(cols, rows) {
  const row = () => {
    if (cols <= 1) return leaf();
    return { split: 'x', sizes: Array(cols).fill(1 / cols), children: Array.from({ length: cols }, leaf) };
  };
  if (rows <= 1) return row();
  return { split: 'y', sizes: Array(rows).fill(1 / rows), children: Array.from({ length: rows }, row) };
}

// ---------- Solid modelling kit ----------

// Wraps manifold-3d with small helpers. Every WASM object created through
// the kit is tracked; free(keep) releases everything except `keep`.
export class Kit {
  constructor(wasm, segments = 48) {
    this.M = wasm.Manifold;
    this.CS = wasm.CrossSection;
    this.seg = segments;
    this.objs = [];
  }

  k(o) {
    this.objs.push(o);
    return o;
  }

  free(keep = []) {
    const keepSet = new Set(keep);
    for (const o of this.objs) if (!keepSet.has(o)) o.delete();
    this.objs = [];
  }

  // 2D rounded rectangle. Degenerate input yields a tiny square so callers
  // never have to special-case empty shapes.
  rr(x0, y0, x1, y1, r = 0) {
    const w = Math.max(x1 - x0, 0.01);
    const h = Math.max(y1 - y0, 0.01);
    r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
    if (r <= 0.01) return this.k(this.CS.square([w, h]).translate([x0, y0]));
    const core = this.k(this.CS.square([w - 2 * r, h - 2 * r]).translate([x0 + r, y0 + r]));
    return this.k(core.offset(r, 'Round', 2, this.seg));
  }

  poly(points) {
    return this.k(this.CS.ofPolygons([points], 'NonZero'));
  }

  prism(cs, z0, z1) {
    return this.k(this.k(this.M.extrude(cs, Math.max(z1 - z0, 0.001))).translate([0, 0, z0]));
  }

  box(x0, y0, z0, x1, y1, z1) {
    return this.k(this.k(this.M.cube([Math.max(x1 - x0, 0.001), Math.max(y1 - y0, 0.001), Math.max(z1 - z0, 0.001)])).translate([x0, y0, z0]));
  }

  // Cylinder along an axis ('x' | 'y' | 'z') starting at `p` with length `len`.
  cyl(r, p, axis, len, r2 = r) {
    let c = this.k(this.M.cylinder(len, r, r2, this.seg));
    if (axis === 'x') c = this.k(c.rotate([0, 90, 0]));
    if (axis === 'y') c = this.k(c.rotate([-90, 0, 0]));
    return this.k(c.translate(p));
  }

  // Stack of rounded-rect layers: layers = [{ z, inset }], each pair is hulled,
  // giving exact 45° chamfers for convex outlines. `outline(inset)` → CrossSection.
  profile(outline, layers) {
    const slices = layers.map(({ z, inset }) => this.prism(outline(inset), z, z + 0.001));
    const pieces = [];
    for (let i = 0; i < slices.length - 1; i++) pieces.push(this.k(this.M.hull([slices[i], slices[i + 1]])));
    return this.union(pieces);
  }

  union(list) {
    const items = list.filter(Boolean);
    if (items.length === 1) return items[0];
    return this.k(this.M.union(items));
  }

  sub(a, ...bs) {
    const items = bs.flat().filter(Boolean);
    if (!items.length) return a;
    return this.k(a.subtract(this.union(items)));
  }

  add(a, ...bs) {
    return this.union([a, ...bs.flat()]);
  }

  inter(a, b) {
    return this.k(a.intersect(b));
  }

  move(m, x = 0, y = 0, z = 0) {
    return this.k(m.translate([x, y, z]));
  }

  rot(m, x = 0, y = 0, z = 0) {
    return this.k(m.rotate([x, y, z]));
  }

  // Move a solid so its bounding box starts at the origin (print bed).
  toBed(m) {
    const { min } = m.boundingBox();
    return this.move(m, -min[0], -min[1], -min[2]);
  }

  // Compartment pockets for a grid: one rounded pocket per cell, from z0 to z1.
  pockets(grid, rect, wall, radius, z0, z1) {
    return layoutCells(grid, rect, wall)
      .filter(({ rect: r }) => r[2] - r[0] > 0.2 && r[3] - r[1] > 0.2)
      .map(({ rect: r }) => this.prism(this.rr(r[0], r[1], r[2], r[3], radius), z0, z1));
  }

  // Open tray body: rounded outer shell with grid compartments whose dividers
  // are cut to `dividerTop`. Shared by most models.
  tray({ W, D, H, wall, floor = wall, radius, grid, dividerTop, z0 = 0 }) {
    const innerR = Math.max(radius - wall, 0.5);
    let body = this.prism(this.rr(0, 0, W, D, radius), z0, H);
    const pockets = this.pockets(grid, [wall, wall, W - wall, D - wall], wall, innerR, z0 + floor, H + 1);
    body = this.sub(body, pockets);
    if (dividerTop < H - 0.01) {
      body = this.sub(body, this.prism(this.rr(wall, wall, W - wall, D - wall, innerR), Math.max(dividerTop, z0 + floor), H + 1));
    }
    return body;
  }
}

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ---------- Export ----------

export function meshArrays(manifold) {
  const mesh = manifold.getMesh();
  const n = mesh.numProp;
  const vp = mesh.vertProperties;
  const count = vp.length / n;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = vp[i * n];
    positions[i * 3 + 1] = vp[i * n + 1];
    positions[i * 3 + 2] = vp[i * n + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

// meshes: [{ positions, indices, offset?: [x, y, z] }]
export function toBinarySTL(meshes, name = 'maxi-tray') {
  const triCount = meshes.reduce((s, m) => s + m.indices.length / 3, 0);
  const buf = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buf);
  const header = `Maxi Tray: ${name}`.slice(0, 80);
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i) & 0x7f);
  view.setUint32(80, triCount, true);
  let o = 84;
  for (const { positions: P, indices, offset = [0, 0, 0] } of meshes) {
    for (let f = 0; f < indices.length; f += 3) {
      const a = indices[f] * 3;
      const b = indices[f + 1] * 3;
      const c = indices[f + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      for (const v of [nx / len, ny / len, nz / len]) { view.setFloat32(o, v, true); o += 4; }
      for (const idx of [a, b, c]) {
        view.setFloat32(o, P[idx] + offset[0], true);
        view.setFloat32(o + 4, P[idx + 1] + offset[1], true);
        view.setFloat32(o + 8, P[idx + 2] + offset[2], true);
        o += 12;
      }
      view.setUint16(o, 0, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

const xmlEscape = (s) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

// 3MF model XML with one object per part (the app zips it with the package files).
export function to3MFModel(meshes) {
  const parts = ['<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="pl-PL" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n<resources>\n'];
  meshes.forEach(({ positions: P, indices, offset = [0, 0, 0], name = 'Part' }, i) => {
    parts.push(`<object id="${i + 1}" type="model" name="${xmlEscape(name)}">\n<mesh>\n<vertices>\n`);
    for (let v = 0; v < P.length; v += 3) {
      parts.push(`<vertex x="${+(P[v] + offset[0]).toFixed(4)}" y="${+(P[v + 1] + offset[1]).toFixed(4)}" z="${+(P[v + 2] + offset[2]).toFixed(4)}"/>\n`);
    }
    parts.push('</vertices>\n<triangles>\n');
    for (let t = 0; t < indices.length; t += 3) {
      parts.push(`<triangle v1="${indices[t]}" v2="${indices[t + 1]}" v3="${indices[t + 2]}"/>\n`);
    }
    parts.push('</triangles>\n</mesh>\n</object>\n');
  });
  parts.push('</resources>\n<build>\n');
  meshes.forEach((_, i) => parts.push(`<item objectid="${i + 1}"/>\n`));
  parts.push('</build>\n</model>\n');
  return parts.join('');
}
