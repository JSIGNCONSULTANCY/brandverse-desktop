const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../app/index.html', 'utf8').replace(/<link rel="stylesheet"[^>]*>/g, '');
let store = '', saved = [], exportsSaved = [], errors = [];
const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message)); vc.on('error', e => errors.push(String(e)));
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, url: 'file:///app/index.html',
  beforeParse(w) {
    w.bvDesktop = {
      isDesktop: true, loadSync: () => store, saveState: async t => { store = t; saved.push(t.length); return true; }, saveStateSync: t => { store = t; return true; },
      saveExport: async (n, b) => { exportsSaved.push([n, b.length]); return { ok: true, path: '/x/' + n, name: n }; },
      fetchJSON: async () => { throw new Error('offline'); },
      info: async () => ({ version: '1.0.0', dataDir: '/d', exportsDir: '/e', backupsDir: '/b', size: 10 }),
      listBackups: async () => [{ name: 'brandverse-backup-2026-10-08.json', size: 2048 }],
      openPath: async () => { }, changeFolder: async () => ({ ok: false, canceled: true }), backupNow: async () => ({ ok: true, name: 'x.json' }), readBackup: async () => store
    };
    w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() { }, removeListener() { }, addEventListener() { } }));
  }
});
const w = dom.window;
setTimeout(async () => {
  const out = {};
  out.rendered = w.document.body.textContent.length > 200;
  w.save(); await new Promise(r => setTimeout(r, 400));
  out.savedToBridge = saved.length > 0 && store.includes('"companies"');
  await w.saveFile(new Uint8Array([1, 2, 3]), 'Test.xlsx', 'x');
  out.exportSaved = exportsSaved.length === 1;
  w.go('settings', { tab: 'desktop' }); await new Promise(r => setTimeout(r, 100)); w.render();
  out.desktopTab = /Data folder/.test(w.document.body.textContent) && /Back up now/.test(w.document.body.textContent);
  out.errors = errors.slice(0, 5);
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.rendered && out.savedToBridge && out.exportSaved && out.desktopTab && !errors.length ? 0 : 1);
}, 1500);
