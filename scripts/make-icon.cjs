// Renders build/icon.svg to the app icon and the web icons with Electron:
//   npx electron scripts/make-icon.cjs
// build/icon.png      1024px app icon (with margin, for electron-builder)
// app/favicon.svg     cropped to the rounded square, for browser tabs
// app/icon-512.png    cropped, for the web manifest
// app/apple-touch-icon.png  180px full-bleed square (iOS rounds the corners itself)
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const out = (p) => path.join(__dirname, '..', p);
const svg = fs.readFileSync(out('build/icon.svg'), 'utf8');
const cropped = svg.replace('viewBox="0 0 1024 1024" width="1024" height="1024"', 'viewBox="100 100 824 824"');
const fullBleed = cropped.replace('rx="185"', 'rx="0"');

async function render(win, source, size, file) {
  const sized = source.replace(/<svg ([^>]*?)(?: width="\d+" height="\d+")?>/, `<svg $1 width="${size}" height="${size}">`);
  await win.setContentSize(size, size);
  await win.loadURL('data:text/html,' + encodeURIComponent(`<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${sized}`));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
  fs.writeFileSync(out(file), img.resize({ width: size, height: size }).toPNG());
}

app.commandLine.appendSwitch('disable-gpu-sandbox');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, useContentSize: true, webPreferences: { offscreen: true, zoomFactor: 1 } });
  await render(win, svg, 1024, 'build/icon.png');
  await render(win, cropped, 512, 'app/icon-512.png');
  await render(win, fullBleed, 180, 'app/apple-touch-icon.png');
  fs.writeFileSync(out('app/favicon.svg'), cropped);
  app.quit();
});
