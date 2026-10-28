import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Module from 'manifold-3d';
import {
  toBinarySTL, to3MFModel, leaf, layoutCells, layoutDividers, getNode, splitCell, mergeCell, uniformGrid
} from './geometry.js';
import { MODELS, MODEL_BY_ID, buildModel } from './models/index.js';
import { ICONS } from './icons.js';
import { make3MF } from './zip.js';

const $ = (s) => document.querySelector(s);
const PLA_DENSITY = 1.24; // g/cm³

// ---------- State & history ----------
// Each model keeps its own parameters and grid, so switching back and forth
// doesn't lose work.

function freshState(modelId = MODELS[0].id) {
  return { model: modelId, params: {}, grids: {} };
}

let state = freshState();
const undoStack = [];
const redoStack = [];

const model = () => MODEL_BY_ID[state.model];
const rawParams = () => ({ ...model().defaults, ...state.params[state.model] });
const params = () => model().normalize(rawParams());
const gridEnabled = () => !!model().grid && (!model().grid.enabled || model().grid.enabled(params()));

function grid() {
  const m = model();
  if (!m.grid) return null;
  if (!state.grids[m.id]) state.grids[m.id] = m.grid.default();
  return state.grids[m.id];
}

function setParam(key, value) {
  state.params[state.model] = { ...state.params[state.model], [key]: value };
}

function snapshot() {
  return JSON.stringify(state);
}

// Call before mutating state; rapid edits of the same field (slider drags)
// are merged into one undo step.
let lastPushKey = null;
let lastPushTime = 0;
function pushHistory(key = null) {
  const now = performance.now();
  if (key && key === lastPushKey && now - lastPushTime < 800) {
    lastPushTime = now;
    return;
  }
  lastPushKey = key;
  lastPushTime = now;
  undoStack.push(snapshot());
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}

function restore(json) {
  const prevModel = state.model;
  state = JSON.parse(json);
  if (state.model !== prevModel) renderModel();
  syncInputs();
  refresh();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  lastPushKey = null;
  updateUndoButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  lastPushKey = null;
  updateUndoButtons();
}

function updateUndoButtons() {
  $('#undo').disabled = !undoStack.length;
  $('#redo').disabled = !redoStack.length;
}

// ---------- Sidebar (generated from the model's field schema) ----------

function renderModel() {
  const m = model();
  $('#modelIcon').innerHTML = ICONS[m.id] ?? '';
  $('#modelName').textContent = m.name;
  $('#modelSub').textContent = m.subtitle;

  const root = $('#fields');
  root.replaceChildren();
  let sectionEl = null;
  const newSection = (label, show) => {
    sectionEl = document.createElement('section');
    if (label) sectionEl.innerHTML = `<h2>${label}</h2>`;
    sectionEl._show = show;
    root.appendChild(sectionEl);
  };
  for (const f of m.fields) {
    if (f.type === 'section') {
      newSection(f.label, f.show);
      continue;
    }
    if (!sectionEl) newSection('');
    const el = f.type === 'choice' ? choiceField(f) : numberField(f);
    el._show = f.show;
    sectionEl.appendChild(el);
  }

  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t.dataset.tab === 'view3d');
  for (const v of document.querySelectorAll('.view')) v.classList.toggle('hidden', v.id !== 'view3d');
  framed = false;
}

function numberField(f) {
  const el = document.createElement('div');
  el.className = 'field';
  el.dataset.key = f.key;
  el.innerHTML = `<label>${f.label}</label><input type="range" min="${f.min}" max="${f.max}" step="${f.step}"><input type="number" step="${f.step}"><span class="unit">${f.unit}</span>${f.help ? `<small class="help">${f.help}</small>` : ''}`;
  const range = el.querySelector('input[type=range]');
  const num = el.querySelector('input[type=number]');
  const set = (v) => {
    v = parseFloat(String(v).replace(',', '.'));
    if (!Number.isFinite(v)) return;
    pushHistory(f.key);
    setParam(f.key, v);
    syncInputs();
    refresh();
  };
  range.addEventListener('input', () => set(range.value));
  num.addEventListener('change', () => set(num.value));
  num.addEventListener('keydown', (e) => { if (e.key === 'Enter') num.blur(); });
  return el;
}

function choiceField(f) {
  const el = document.createElement('div');
  el.className = 'choice';
  el.dataset.key = f.key;
  const withIcons = f.options.some((o) => o.icon);
  el.innerHTML = `<label>${f.label}</label><div class="segmented${withIcons ? ' icons' : ''}">${f.options.map((o) =>
    `<button data-v="${o.v}">${o.icon ? ICONS[o.icon] : ''}<span>${o.label}</span></button>`).join('')}</div>`;
  for (const b of el.querySelectorAll('button')) {
    b.addEventListener('click', () => {
      const opt = f.options.find((o) => String(o.v) === b.dataset.v);
      pushHistory();
      setParam(f.key, opt.v);
      syncInputs();
      refresh();
    });
  }
  return el;
}

function syncInputs() {
  const raw = rawParams();
  const p = params();
  for (const el of document.querySelectorAll('#fields .field')) {
    const key = el.dataset.key;
    const range = el.querySelector('input[type=range]');
    const num = el.querySelector('input[type=number]');
    range.value = raw[key];
    if (key === 'partitionHeight' && p.maxPartition !== undefined) range.max = Math.max(0, p.maxPartition);
    if (document.activeElement !== num) num.value = +(+raw[key]).toFixed(2);
    el.classList.toggle('hidden', el._show ? !el._show(p) : false);
  }
  for (const el of document.querySelectorAll('#fields .choice')) {
    for (const b of el.querySelectorAll('button')) b.classList.toggle('active', b.dataset.v === String(raw[el.dataset.key]));
    el.classList.toggle('hidden', el._show ? !el._show(p) : false);
  }
  for (const s of document.querySelectorAll('#fields section')) {
    s.classList.toggle('hidden', s._show ? !s._show(p) : false);
  }
  $('#modelHint').textContent = model().hint ? model().hint(p) : '';
  $('[data-tab=grid]').classList.toggle('hidden', !gridEnabled());
  if (!gridEnabled() && !$('#grid').classList.contains('hidden')) $('[data-tab=view3d]').click();
}

// ---------- Model picker ----------

function openPicker() {
  const gridEl = $('#pickerGrid');
  gridEl.innerHTML = MODELS.map((m) => `
    <button class="pick${m.id === state.model ? ' current' : ''}" data-id="${m.id}">
      <span class="pick-icon">${ICONS[m.id] ?? ''}</span>
      <strong>${m.name}</strong>
      <small>${m.subtitle}</small>
      <span class="tags">${(m.tags ?? []).map((t) => `<em>${t}</em>`).join('')}</span>
    </button>`).join('');
  for (const b of gridEl.querySelectorAll('.pick')) {
    b.addEventListener('click', () => {
      closePicker();
      if (b.dataset.id === state.model) return;
      pushHistory();
      state.model = b.dataset.id;
      renderModel();
      syncInputs();
      refresh();
    });
  }
  $('#picker').classList.remove('hidden');
}

function closePicker() {
  $('#picker').classList.add('hidden');
}

$('#modelButton').addEventListener('click', openPicker);
$('#pickerClose').addEventListener('click', closePicker);
$('#picker').addEventListener('click', (e) => { if (e.target.id === 'picker') closePicker(); });

// ---------- 3D view ----------

const canvas = $('#canvas3d');
// Without WebGL the editor and export still work; only the preview is off.
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
} catch (err) {
  console.error(err);
  $('#dims').insertAdjacentHTML('beforebegin',
    '<p class="hint center" style="padding-top:40vh">Podgląd 3D jest niedostępny (brak WebGL). Edytor przegródek i eksport działają normalnie.</p>');
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
camera.up.set(0, 0, 1);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(-1, -2, 3);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(2, 1, 1);
scene.add(fill);

const material = new THREE.MeshStandardMaterial({ color: $('#color').value, roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide });
const ghostMaterial = new THREE.MeshStandardMaterial({ color: $('#color').value, roughness: 0.55, transparent: true, opacity: 0.35, depthWrite: false });
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });
const partsGroup = new THREE.Group();
scene.add(partsGroup);
let floorGrid = null;

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return { view: cs.getPropertyValue('--view').trim(), line: cs.getPropertyValue('--line').trim() };
}

function rebuildFloor(size) {
  if (floorGrid) {
    scene.remove(floorGrid);
    floorGrid.geometry.dispose();
  }
  const { line } = themeColors();
  const extent = Math.ceil((size * 2.5) / 10) * 10;
  floorGrid = new THREE.GridHelper(extent, extent / 10, line, line);
  floorGrid.rotation.x = Math.PI / 2;
  floorGrid.position.z = -0.05;
  scene.add(floorGrid);
}

$('#color').addEventListener('input', (e) => {
  material.color.set(e.target.value);
  ghostMaterial.color.set(e.target.value);
});

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h || !renderer) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

// The camera is framed when a model is opened, not on every edit, so it
// doesn't jump around while the user drags sliders.
let framed = false;
function frameCamera(size) {
  if (framed) return;
  framed = true;
  const r = Math.hypot(...size);
  controls.target.set(0, 0, size[2] / 3);
  camera.position.set(-r * 0.75, -r * 1.1, r * 0.95);
  camera.near = r / 50;
  camera.far = r * 50;
  camera.updateProjectionMatrix();
  controls.update();
}

(function loop() {
  if (!renderer) return;
  requestAnimationFrame(loop);
  controls.update();
  renderer.setClearColor(themeColors().view);
  renderer.render(scene, camera);
})();

let showStack = false;
$('#stackToggle').addEventListener('click', () => {
  showStack = !showStack;
  $('#stackToggle').classList.toggle('active', showStack);
  rebuild();
});

// ---------- Geometry pipeline ----------

let wasm = null;
let current = null; // { params, parts }

function rebuild() {
  if (!wasm) return;
  const m = model();
  try {
    current = buildModel(wasm, m, rawParams(), gridEnabled() ? grid() : leaf());
  } catch (err) {
    console.error(err);
    toast('Nie udało się zbudować modelu dla tych parametrów.');
    return;
  }

  for (const c of [...partsGroup.children]) {
    partsGroup.remove(c);
    c.geometry.dispose();
  }
  let maxX = 0;
  let maxY = 0;
  let maxZ = 0;
  for (const part of current.parts) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
    geo.setIndex(new THREE.BufferAttribute(part.indices, 1));
    const flat = geo.toNonIndexed();
    flat.computeVertexNormals();
    const edgesGeo = new THREE.EdgesGeometry(geo, 35);
    geo.dispose();
    const mesh = new THREE.Mesh(flat, material);
    const edges = new THREE.LineSegments(edgesGeo, edgeMaterial);
    mesh.position.set(...part.offset);
    edges.position.set(...part.offset);
    partsGroup.add(mesh, edges);
    maxX = Math.max(maxX, part.offset[0] + part.size[0]);
    maxY = Math.max(maxY, part.size[1]);
    maxZ = Math.max(maxZ, part.size[2]);
  }

  // Stack preview: a translucent copy of the first part sitting on top.
  const stackZ = m.stackOffset ? m.stackOffset(current.params) : null;
  $('#stackToggle').classList.toggle('hidden', stackZ === null);
  if (stackZ !== null && showStack) {
    const first = partsGroup.children[0];
    const ghost = new THREE.Mesh(first.geometry.clone(), ghostMaterial);
    ghost.position.set(first.position.x, first.position.y, first.position.z + stackZ);
    partsGroup.add(ghost);
    maxZ += stackZ;
  }

  partsGroup.position.set(-maxX / 2, -maxY / 2, 0);
  rebuildFloor(Math.max(maxX, maxY));
  frameCamera([maxX, maxY, maxZ]);
  const p = current.parts;
  $('#exportParts').classList.toggle('hidden', p.length < 2);
  $('#dims').textContent = p.length === 1
    ? `${fmt(p[0].size[0])} × ${fmt(p[0].size[1])} × ${fmt(p[0].size[2])} mm`
    : `${p.length} części · stół ${fmt(maxX)} × ${fmt(maxY)} mm`;
  updateStats();
}

function fmt(v) {
  return (+v.toFixed(1)).toLocaleString('pl-PL');
}

function updateStats() {
  if (!current) return;
  const volume = current.parts.reduce((s, p) => s + p.volume, 0) / 1000;
  const tris = current.parts.reduce((s, p) => s + p.indices.length / 3, 0);
  const rows = [];
  if (gridEnabled()) {
    const inner = model().grid.inner(current.params);
    rows.push(['Przegródki', layoutCells(grid(), inner.rect, inner.wall).length]);
  }
  rows.push(['Objętość materiału', `${fmt(volume)} cm³`]);
  rows.push(['Masa (PLA, 100% wypełn.)', `≈ ${fmt(volume * PLA_DENSITY)} g`]);
  rows.push(['Trójkąty', tris.toLocaleString('pl-PL')]);
  let html = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
  if (current.parts.length > 1) {
    html += `<span class="parts-title">Części do druku</span><span></span>`;
    html += groupParts(current.parts).map(([name, n, part]) =>
      `<span>${name}${n > 1 ? ` × ${n}` : ''}</span><span>${fmt(part.size[0])}×${fmt(part.size[1])}×${fmt(part.size[2])}</span>`).join('');
  }
  $('#stats').innerHTML = html;
}

// "Klips 1", "Klips 2" … → "Klips × 2" for the parts list.
function groupParts(parts) {
  const groups = new Map();
  for (const p of parts) {
    const base = p.name.replace(/\s+\d+$/, '');
    const g = groups.get(base);
    if (g) g[1]++;
    else groups.set(base, [base, 1, p]);
  }
  return [...groups.values()];
}

let pending = 0;
function refresh() {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    rebuild();
    if (!$('#grid').classList.contains('hidden')) drawGrid();
  });
}

// ---------- Tabs ----------

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => {
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === tab);
    for (const v of document.querySelectorAll('.view')) v.classList.toggle('hidden', v.id !== tab.dataset.tab);
    if (tab.dataset.tab === 'grid') drawGrid();
    else resize();
  });
}

// ---------- Grid editor ----------

const svg = $('#gridSvg');
const NS = 'http://www.w3.org/2000/svg';
let tool = 'x';
let drag = null;

function setTool(v) {
  tool = v;
  for (const b of document.querySelectorAll('#tool button')) b.classList.toggle('active', b.dataset.v === v);
  svg.classList.toggle('tool-merge', v === 'merge');
}
for (const b of document.querySelectorAll('#tool button')) b.addEventListener('click', () => setTool(b.dataset.v));
setTool('x');

function el(name, attrs, parent = svg) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

function editorGeometry() {
  const p = params();
  const g = model().grid;
  return { p, outline: g.outline(p), inner: g.inner(p), overlays: g.overlays ? g.overlays(p) : [] };
}

function drawGrid() {
  if (!gridEnabled()) return;
  const { outline, inner, overlays } = editorGeometry();
  const { W, D } = outline;
  const pad = Math.max(W, D) * 0.04;
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${W + pad * 2} ${D + pad * 2}`);
  svg.replaceChildren();
  const sy = (y) => D - y; // model Y up → SVG Y down (front edge at the bottom)
  const fontSize = Math.max(W, D) / 32;

  el('rect', { class: 'outer', x: 0, y: 0, width: W, height: D, rx: outline.r, ry: outline.r });

  for (const { rect, path } of layoutCells(grid(), inner.rect, inner.wall)) {
    const [x0, y0, x1, y1] = rect;
    const w = x1 - x0;
    const h = y1 - y0;
    const r = Math.max(0, Math.min(inner.r, w / 2, h / 2));
    const cell = el('rect', { class: 'cell', x: x0, y: sy(y1), width: Math.max(w, 0), height: Math.max(h, 0), rx: r, ry: r });
    cell.addEventListener('click', () => onCellClick(path));
    cell.addEventListener('mousemove', () => showPreview(rect));
    cell.addEventListener('mouseleave', hidePreview);
    if (w > fontSize * 3 && h > fontSize * 1.5) {
      const label = el('text', { class: 'label', x: x0 + w / 2, y: sy(y0 + h / 2) });
      label.style.fontSize = `${fontSize}px`;
      label.textContent = `${fmt(w)} × ${fmt(h)}`;
    }
  }

  for (const d of layoutDividers(grid(), inner.rect, inner.wall)) {
    const [x0, y0, x1, y1] = d.rect;
    const grab = Math.max(inner.wall, Math.max(W, D) / 80); // easier to grab than the wall itself
    const isX = d.axis === 0;
    const r = el('rect', {
      class: `divider ${isX ? 'x' : 'y'}`,
      x: isX ? (x0 + x1) / 2 - grab / 2 : x0,
      y: isX ? sy(y1) : sy((y0 + y1) / 2) - grab / 2,
      width: isX ? grab : x1 - x0,
      height: isX ? y1 - y0 : grab
    });
    r.addEventListener('pointerdown', (e) => startDrag(e, d, r));
  }

  for (const [x0, y0, x1, y1] of overlays) {
    el('rect', { class: 'overlay', x: x0, y: sy(y1), width: x1 - x0, height: y1 - y0 });
  }

  el('line', { class: 'preview', id: 'previewLine', x1: 0, y1: 0, x2: 0, y2: 0, visibility: 'hidden' });
}

function svgPoint(e) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const r = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: r.x, y: editorGeometry().outline.D - r.y };
}

function showPreview(rect) {
  const line = $('#previewLine');
  if (!line || tool === 'merge' || drag) return hidePreview();
  const n = +$('#splitCount').value;
  const [x0, y0, x1, y1] = rect;
  const D = editorGeometry().outline.D;
  // Preview the first new wall only; with n>2 a dashed set would be noisy.
  if (tool === 'x') {
    const x = x0 + (x1 - x0) / n;
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    line.setAttribute('y1', D - y0); line.setAttribute('y2', D - y1);
  } else {
    const y = y0 + (y1 - y0) / n;
    line.setAttribute('x1', x0); line.setAttribute('x2', x1);
    line.setAttribute('y1', D - y); line.setAttribute('y2', D - y);
  }
  line.setAttribute('visibility', 'visible');
}

function hidePreview() {
  $('#previewLine')?.setAttribute('visibility', 'hidden');
}

function onCellClick(path) {
  if (tool === 'merge' && !path.length) return toast('Brak ścianek do usunięcia.');
  pushHistory();
  if (tool === 'merge') mergeCell(grid(), path);
  else splitCell(grid(), path, tool, +$('#splitCount').value);
  refresh();
}

function startDrag(e, d, node) {
  e.preventDefault();
  e.stopPropagation();
  node.classList.add('drag');
  hidePreview();
  pushHistory();
  const parent = getNode(grid(), d.path);
  const start = svgPoint(e);
  drag = {
    parent, index: d.index, axis: d.axis, usable: d.usable,
    a: parent.sizes[d.index], b: parent.sizes[d.index + 1],
    origin: d.axis === 0 ? start.x : start.y
  };
  const move = (ev) => {
    const pt = svgPoint(ev);
    const delta = ((drag.axis === 0 ? pt.x : pt.y) - drag.origin) / drag.usable;
    const min = Math.min(2 / drag.usable, (drag.a + drag.b) / 2);
    const a = Math.min(Math.max(drag.a + delta, min), drag.a + drag.b - min);
    drag.parent.sizes[drag.index] = a;
    drag.parent.sizes[drag.index + 1] = drag.a + drag.b - a;
    refreshGridOnly();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    drag = null;
    refresh();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

// During a drag the divider element must survive, so cells and dividers are
// moved in place instead of redrawing the SVG.
let dragFrame = 0;
function refreshGridOnly() {
  cancelAnimationFrame(dragFrame);
  dragFrame = requestAnimationFrame(() => {
    const { outline, inner } = editorGeometry();
    const D = outline.D;
    const cellEls = svg.querySelectorAll('.cell');
    layoutCells(grid(), inner.rect, inner.wall).forEach(({ rect }, i) => {
      const c = cellEls[i];
      if (!c) return;
      c.setAttribute('x', rect[0]);
      c.setAttribute('y', D - rect[3]);
      c.setAttribute('width', Math.max(rect[2] - rect[0], 0));
      c.setAttribute('height', Math.max(rect[3] - rect[1], 0));
    });
    const divEls = svg.querySelectorAll('.divider');
    layoutDividers(grid(), inner.rect, inner.wall).forEach((d, i) => {
      const r = divEls[i];
      if (!r) return;
      const w = +r.getAttribute(d.axis === 0 ? 'width' : 'height');
      if (d.axis === 0) {
        r.setAttribute('x', (d.rect[0] + d.rect[2]) / 2 - w / 2);
        r.setAttribute('y', D - d.rect[3]);
        r.setAttribute('height', d.rect[3] - d.rect[1]);
      } else {
        r.setAttribute('y', D - (d.rect[1] + d.rect[3]) / 2 - w / 2);
        r.setAttribute('x', d.rect[0]);
        r.setAttribute('width', d.rect[2] - d.rect[0]);
      }
    });
    for (const l of svg.querySelectorAll('.label')) l.remove();
    rebuild();
  });
}

$('#applyGrid').addEventListener('click', () => {
  const c = Math.max(1, Math.min(20, +$('#cols').value || 1));
  const r = Math.max(1, Math.min(20, +$('#rows').value || 1));
  pushHistory();
  state.grids[state.model] = uniformGrid(c, r);
  refresh();
});

$('#equalize').addEventListener('click', () => {
  pushHistory();
  (function eq(n) {
    if (!n.split) return;
    n.sizes = n.sizes.map(() => 1 / n.sizes.length);
    n.children.forEach(eq);
  })(grid());
  refresh();
});

$('#resetGrid').addEventListener('click', () => {
  pushHistory();
  state.grids[state.model] = leaf();
  refresh();
});

// ---------- Files ----------

const bridge = window.maxi;

async function saveBytes(defaultName, filters, data) {
  if (bridge) return bridge.saveFile({ defaultName, filters, data });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data]));
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(a.href);
  return defaultName;
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
  .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const fmtFile = (v) => String(+(+v).toFixed(1)).replace('.', '_');

function baseName() {
  const p = current?.params ?? params();
  const dims = p.width !== undefined
    ? `${fmtFile(p.width)}x${fmtFile(p.depth)}x${fmtFile(p.height)}`
    : `${p.unitsX}x${p.unitsY}${p.part === 'bin' ? `x${p.heightUnits}` : ''}`;
  return `maxi-${state.model}-${dims}`;
}

$('#exportStl').addEventListener('click', async () => {
  if (!current) return;
  const path = await saveBytes(`${baseName()}.stl`, [{ name: 'STL', extensions: ['stl'] }], toBinarySTL(current.parts, baseName()));
  if (path) toast(`Zapisano: ${path}`);
});

$('#export3mf').addEventListener('click', async () => {
  if (!current) return;
  const data = make3MF(to3MFModel(current.parts));
  const path = await saveBytes(`${baseName()}.3mf`, [{ name: '3MF', extensions: ['3mf'] }], data);
  if (path) toast(`Zapisano: ${path}`);
});

$('#exportParts').addEventListener('click', async () => {
  if (!current) return;
  const files = current.parts.map((part, i) => ({
    name: `${baseName()}-${String(i + 1).padStart(2, '0')}-${slug(part.name)}.stl`,
    data: toBinarySTL([{ ...part, offset: [0, 0, 0] }], part.name)
  }));
  if (bridge) {
    const dir = await bridge.saveFiles({ files });
    if (dir) toast(`Zapisano ${files.length} plików w: ${dir}`);
  } else {
    for (const f of files) await saveBytes(f.name, [], f.data);
  }
});

$('#saveProject').addEventListener('click', async () => {
  const data = new TextEncoder().encode(JSON.stringify({ app: 'maxi-tray', version: 2, ...state }, null, 2));
  const path = await saveBytes(`${baseName()}.maxi.json`, [{ name: 'Projekt Maxi Tray', extensions: ['json'] }], data);
  if (path) toast(`Zapisano projekt: ${path}`);
});

$('#openProject').addEventListener('click', async () => {
  let text;
  if (bridge) {
    const res = await bridge.openFile({ filters: [{ name: 'Projekt Maxi Tray', extensions: ['json'] }] });
    if (!res) return;
    text = res.text;
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    text = await new Promise((ok) => {
      input.onchange = () => input.files[0]?.text().then(ok);
      input.click();
    });
    if (!text) return;
  }
  try {
    const data = JSON.parse(text);
    let next;
    if (data.version >= 2 && MODEL_BY_ID[data.model]) {
      next = { model: data.model, params: data.params ?? {}, grids: data.grids ?? {} };
    } else if (data.params && data.grid) {
      // Version 1 files only had the partition tray.
      next = { model: 'partition', params: { partition: { ...data.params, stackable: data.params.stackable ? 1 : 0 } }, grids: { partition: data.grid } };
    } else {
      throw new Error('format');
    }
    pushHistory();
    state = next;
    renderModel();
    syncInputs();
    refresh();
    toast('Wczytano projekt.');
  } catch {
    toast('To nie jest plik projektu Maxi Tray.');
  }
});

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

// ---------- Keyboard ----------

$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePicker();
  if (e.target.tagName === 'INPUT' && e.target.type === 'number') return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// ---------- Boot ----------

renderModel();
syncInputs();
updateUndoButtons();
Module().then((m) => {
  m.setup();
  wasm = m;
  resize();
  refresh();
}).catch((err) => {
  console.error(err);
  toast('Nie udało się załadować silnika geometrii.');
});
