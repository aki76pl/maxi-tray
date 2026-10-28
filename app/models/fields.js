// Field schema helpers shared by the model definitions. The sidebar is
// generated from these; `show(p)` hides a field when it doesn't apply.

export const section = (label, show) => ({ type: 'section', label, show });

export const num = (key, label, min, max, step = 0.5, extra = {}) => ({
  type: 'number', key, label, min, max, step, unit: 'mm', ...extra
});

export const choice = (key, label, options, extra = {}) => ({
  type: 'choice', key, label, options, ...extra
});

export const sizeFields = () => [
  section('Wymiary zewnętrzne'),
  num('width', 'Szerokość (X)', 20, 400, 1),
  num('depth', 'Głębokość (Y)', 20, 400, 1),
  num('height', 'Wysokość (Z)', 5, 200, 1)
];

export const wallFields = () => [
  num('wall', 'Grubość ścianek', 0.8, 6, 0.1),
  num('fillet', 'Zaokrąglenie rogów', 0, 30, 0.5)
];
