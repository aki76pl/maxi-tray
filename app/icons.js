// Small isometric line icons for the model picker and option buttons.
const svg = (body) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${body}</svg>`;

// Isometric tray outline shared by several icons.
const tray = 'M4 14l12-6 12 6-12 6z M4 14v5l12 6 12-6v-5 M16 20v5';

export const ICONS = {
  partition: svg(`<path d="${tray}"/><path d="M10 11l12 6 M16 8v0 M13 15.5l6-3"/>`),
  box: svg('<path d="M4 12l12-6 12 6-12 6z M4 12v9l12 6 12-6v-9 M16 18v9"/><path d="M4 15l12 6 12-6 M7 17v5 M10 18.5v5 M13 20v5 M19 20v5 M22 18.5v5 M25 17v5"/>'),
  walltray: svg('<path d="M8 6l10 5v18l-10-5z M18 11l8-4v18l-8 4"/><path d="M8 13l10 5 8-4 M12 4l2 1"/><circle cx="22" cy="10" r="1.2"/>'),
  carrying: svg(`<path d="${tray}"/><path d="M10 11l12 6 M12 12V6l8 4v6 M14 8.5l4 2"/>`),
  'box-nh': svg('<path d="M4 12l12-6 12 6-12 6z M4 12v9l12 6 12-6v-9 M16 18v9"/><path d="M4 15l12 6 12-6"/><path d="M14 9l4 2"/>'),
  gridfinity: svg('<path d="M4 14l12-6 12 6-12 6z M4 14v4l12 6 12-6v-4 M16 20v4"/><path d="M10 11l12 6 M10 17l12-6"/>'),
  slide: svg(`<path d="${tray}"/><path d="M6 11l12-6 10 5 M18 5v2"/><path d="M8 12l12-6"/>`),
  foldingbox: svg('<path d="M10 16l6-3 6 3-6 3z M10 16v4l6 3 6-3v-4 M16 19v4"/><path d="M4 13l6 3 M28 13l-6 3 M16 13l-4-6 8-4 4 6"/>'),
  foldingtray: svg('<path d="M10 16l6-3 6 3-6 3z M10 16v4l6 3 6-3v-4 M16 19v4"/><path d="M4 13l6 3 M28 13l-6 3 M10 13l6-3 6 3"/>'),
  single: svg('<path d="M6 16l10-5 10 5-10 5z M6 16v4l10 5 10-5v-4 M16 21v4"/>'),
  stack: svg('<path d="M6 12l10-5 10 5-10 5z M6 12v4l10 5 10-5v-4 M16 17v4"/><path d="M6 19v3l10 5 10-5v-3"/>')
};
