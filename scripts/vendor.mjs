// Copies the few runtime files the app needs from node_modules into app/vendor,
// so the packaged app doesn't ship whole dependency trees.
import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  'three/build/three.module.js': 'three/three.module.js',
  'three/build/three.core.js': 'three/three.core.js',
  'three/examples/jsm/controls/OrbitControls.js': 'three/addons/controls/OrbitControls.js',
  'three/LICENSE': 'three/LICENSE',
  'manifold-3d/manifold.js': 'manifold/manifold.js',
  'manifold-3d/manifold.wasm': 'manifold/manifold.wasm',
  'manifold-3d/LICENSE': 'manifold/LICENSE'
};
for (const [from, to] of Object.entries(files)) {
  const dest = path.join(root, 'app/vendor', to);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(path.join(root, 'node_modules', from), dest);
}
console.log('vendor: copied', Object.keys(files).length, 'files');
