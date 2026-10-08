// BrandVerse Books - Electron main process.
// Program files live where the installer put them; user data lives in the
// folders chosen on first run (Data / Exports / Backups), like Tally.
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs');
const lic = require('./license/license');

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'config.json');
const DATA_FILE = 'brandverse-data.json';
let cfg = null;          // { dataDir, exportsDir, backupsDir }
let mainWin = null;
let setupWin = null;
let setupResolve = null;

if (!app.requestSingleInstanceLock()) { app.quit(); }
else app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });

/* ---------- config ---------- */
function readConfig() {
  try { const c = JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')); if (c && c.dataDir) return c; } catch (e) { }
  return null;
}
function writeConfig() {
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
  atomicWrite(CONFIG_FILE(), JSON.stringify(cfg, null, 2));
}
function ensureDirs() { for (const k of ['dataDir', 'exportsDir', 'backupsDir']) fs.mkdirSync(cfg[k], { recursive: true }); }
function defaultRoot() { return path.join(app.getPath('documents'), 'BrandVerse Books'); }
function defaultsFor(root) { return { dataDir: path.join(root, 'Data'), exportsDir: path.join(root, 'Exports'), backupsDir: path.join(root, 'Backups') }; }

/* ---------- safe file IO ---------- */
function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
const dataPath = () => path.join(cfg.dataDir, DATA_FILE);

function loadState() {
  try { return fs.readFileSync(dataPath(), 'utf8'); } catch (e) { return ''; }
}
function saveState(text) {
  if (typeof text !== 'string' || !text.length) return false;
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  atomicWrite(dataPath(), text);
  dailyBackup(text);
  return true;
}
const stamp = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
function dailyBackup(text, force) {
  try {
    fs.mkdirSync(cfg.backupsDir, { recursive: true });
    const name = `brandverse-backup-${stamp()}.json`;
    const f = path.join(cfg.backupsDir, name);
    if (force || !fs.existsSync(f)) atomicWrite(f, text);
    else if (Date.now() - fs.statSync(f).mtimeMs > 30 * 60 * 1000) atomicWrite(f, text); // refresh today's copy every 30 min
    // keep the newest 30 backups
    const all = fs.readdirSync(cfg.backupsDir).filter(n => /^brandverse-backup-.*\.json$/.test(n)).sort();
    all.slice(0, Math.max(0, all.length - 30)).forEach(n => { try { fs.unlinkSync(path.join(cfg.backupsDir, n)); } catch (e) { } });
    return name;
  } catch (e) { return null; }
}
function safeName(n) { return String(n || 'file').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'file'; }
function uniquePath(dir, name) {
  let f = path.join(dir, name); if (!fs.existsSync(f)) return f;
  const ext = path.extname(name), base = path.basename(name, ext);
  for (let i = 2; i < 500; i++) { f = path.join(dir, `${base} (${i})${ext}`); if (!fs.existsSync(f)) return f; }
  return path.join(dir, `${base} ${Date.now()}${ext}`);
}

/* ---------- first-run setup window ---------- */
function runSetup() {
  return new Promise(resolve => {
    setupResolve = resolve;
    setupWin = new BrowserWindow({
      width: 640, height: 640, resizable: false, minimizable: false, maximizable: false,
      title: 'BrandVerse Books - Setup', autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { preload: path.join(__dirname, 'setup', 'setup-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    setupWin.setMenu(null);
    setupWin.loadFile(path.join(__dirname, 'setup', 'setup.html'));
    setupWin.on('closed', () => { setupWin = null; if (setupResolve) { setupResolve(null); setupResolve = null; } });
  });
}
ipcMain.handle('setup:defaults', () => defaultsFor(defaultRoot()));
ipcMain.handle('setup:browse', async (_e, current) => {
  const r = await dialog.showOpenDialog(setupWin, { title: 'Choose a folder', defaultPath: current || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('setup:finish', (_e, c) => {
  try {
    const next = { dataDir: path.resolve(c.dataDir), exportsDir: path.resolve(c.exportsDir), backupsDir: path.resolve(c.backupsDir) };
    for (const k in next) fs.mkdirSync(next[k], { recursive: true });
    fs.accessSync(next.dataDir, fs.constants.W_OK);
    cfg = next; writeConfig();
    if (setupResolve) { const r = setupResolve; setupResolve = null; r(cfg); }
    if (setupWin) setupWin.close();
    return { ok: true };
  } catch (e) { return { ok: false, error: 'Could not use that folder: ' + e.message }; }
});
ipcMain.handle('setup:cancel', () => { if (setupWin) setupWin.close(); });

/* ---------- main window ---------- */
function createMain() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640, show: false,
    title: 'BrandVerse Books', backgroundColor: '#ffffff', icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  mainWin.once('ready-to-show', () => { mainWin.maximize(); mainWin.show(); });
  mainWin.loadFile(path.join(__dirname, 'app', 'index.html'));
  mainWin.on('closed', () => { mainWin = null; });

  // Links and attachments: external http(s) -> browser; data: -> temp file; everything else blocked.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url); return { action: 'deny' };
  });
  mainWin.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); openExternalSafe(url); } });
}
function openExternalSafe(url) {
  try {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) return shell.openExternal(url);
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    if (m) {
      const mime = m[1] || 'application/octet-stream';
      const ext = ({ 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'text/plain': '.txt', 'text/html': '.html' })[mime] || '.bin';
      if (ext === '.html' || ext === '.bin') return; // never open executable-ish content
      const buf = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
      const f = path.join(app.getPath('temp'), 'brandverse-' + Date.now() + ext);
      fs.writeFileSync(f, buf); shell.openPath(f);
    }
  } catch (e) { }
}

function buildMenu() {
  const t = [
    { label: 'File', submenu: [
      { label: 'Backup now', click: () => { try { const n = dailyBackup(loadState(), true); dialog.showMessageBox(mainWin, { message: n ? 'Backup saved: ' + n : 'Backup failed' }); } catch (e) { } } },
      { label: 'Open data folder', click: () => shell.openPath(cfg.dataDir) },
      { label: 'Open exports folder', click: () => shell.openPath(cfg.exportsDir) },
      { label: 'Open backups folder', click: () => shell.openPath(cfg.backupsDir) },
      { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'toggleDevTools' }] },
    { label: 'Help', submenu: [{ label: 'About BrandVerse Books', click: () => dialog.showMessageBox(mainWin, { title: 'About', message: 'BrandVerse Books ' + app.getVersion(), detail: 'J Sign Consultancy\nData folder: ' + cfg.dataDir }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

/* ---------- IPC for the app ---------- */
ipcMain.on('bv:load-sync', e => { e.returnValue = cfg ? loadState() : ''; });
ipcMain.on('bv:save-sync', (e, text) => { try { e.returnValue = saveState(text); } catch (err) { e.returnValue = false; } });
ipcMain.handle('bv:save', (_e, text) => { try { return saveState(text); } catch (err) { return false; } });

ipcMain.handle('bv:save-export', (_e, name, bytes) => {
  try {
    fs.mkdirSync(cfg.exportsDir, { recursive: true });
    const f = uniquePath(cfg.exportsDir, safeName(name));
    fs.writeFileSync(f, Buffer.from(bytes));
    return { ok: true, path: f, name: path.basename(f) };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('bv:save-export-as', async (_e, name, bytes) => {
  const r = await dialog.showSaveDialog(mainWin, { defaultPath: path.join(cfg.exportsDir, safeName(name)) });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  fs.writeFileSync(r.filePath, Buffer.from(bytes));
  return { ok: true, path: r.filePath, name: path.basename(r.filePath) };
});
ipcMain.handle('bv:fetch-json', async (_e, url, ms) => {
  if (!/^https:\/\//i.test(url)) throw new Error('blocked');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 8000);
  try {
    const r = await net.fetch(url, { signal: ctl.signal, headers: { 'Cache-Control': 'no-store' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
});
ipcMain.handle('bv:info', () => {
  let size = 0; try { size = fs.statSync(dataPath()).size; } catch (e) { }
  return { version: app.getVersion(), ...cfg, dataFile: dataPath(), size };
});
ipcMain.handle('bv:open-path', (_e, which) => {
  const p = { data: cfg.dataDir, exports: cfg.exportsDir, backups: cfg.backupsDir }[which];
  if (p) { fs.mkdirSync(p, { recursive: true }); return shell.openPath(p); }
});
ipcMain.handle('bv:change-folder', async (_e, which) => {
  const key = { data: 'dataDir', exports: 'exportsDir', backups: 'backupsDir' }[which];
  if (!key) return { ok: false };
  const r = await dialog.showOpenDialog(mainWin, { title: 'Choose folder', defaultPath: cfg[key], properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled) return { ok: false, canceled: true };
  const dir = r.filePaths[0];
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (key === 'dataDir') {
      const cur = dataPath(), dest = path.join(dir, DATA_FILE);
      if (path.resolve(dir) !== path.resolve(cfg.dataDir)) {
        if (fs.existsSync(dest)) {
          const c = await dialog.showMessageBox(mainWin, { type: 'question', buttons: ['Use existing data in that folder', 'Replace it with current data', 'Cancel'], defaultId: 2, cancelId: 2, message: 'That folder already contains BrandVerse data.' });
          if (c.response === 2) return { ok: false, canceled: true };
          if (c.response === 1) { fs.copyFileSync(dest, path.join(cfg.backupsDir, 'before-replace-' + Date.now() + '.json')); fs.copyFileSync(cur, dest); }
        } else if (fs.existsSync(cur)) fs.copyFileSync(cur, dest);
      }
    }
    cfg[key] = dir; writeConfig();
    return { ok: true, reload: key === 'dataDir' };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('bv:backup-now', () => ({ ok: true, name: dailyBackup(loadState(), true) }));
ipcMain.handle('bv:list-backups', () => {
  try { return fs.readdirSync(cfg.backupsDir).filter(n => n.endsWith('.json')).sort().reverse().map(n => ({ name: n, size: fs.statSync(path.join(cfg.backupsDir, n)).size })); } catch (e) { return []; }
});
ipcMain.handle('bv:read-backup', (_e, name) => {
  const n = path.basename(String(name)); return fs.readFileSync(path.join(cfg.backupsDir, n), 'utf8');
});
ipcMain.handle('bv:open-external', (_e, url) => openExternalSafe(url));

/* ---------- licence ---------- */
let actWin = null, actResolve = null, actReason = '';
const LIC_CFG = () => path.join(__dirname, 'license.config.json');
function runActivation(reason) {
  return new Promise(resolve => {
    actReason = reason || ''; actResolve = resolve;
    actWin = new BrowserWindow({
      width: 560, height: 520, resizable: false, minimizable: false, maximizable: false,
      title: 'Activate BrandVerse Books', autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { preload: path.join(__dirname, 'license', 'activate-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    actWin.setMenu(null);
    actWin.loadFile(path.join(__dirname, 'license', 'activate.html'));
    actWin.on('closed', () => { actWin = null; if (actResolve) { const r = actResolve; actResolve = null; r(false); } });
  });
}
ipcMain.handle('lic:info', () => ({ reason: actReason, machine: lic.machineInfo().name, support: (lic.supportText || '') }));
ipcMain.handle('lic:activate', async (_e, key) => {
  const r = await lic.activate(key);
  if (r.ok && actResolve) { const res = actResolve; actResolve = null; setTimeout(() => { res(true); if (actWin) actWin.close(); }, 700); }
  return r.ok ? { ok: true } : { ok: false, error: r.error || 'failed', max: r.max };
});
ipcMain.handle('lic:quit', () => { if (actWin) actWin.close(); });

// Returns true when the app may start. Shows the activation window when needed.
async function ensureLicence() {
  if (!app.isPackaged && process.env.BV_SKIP_LICENCE === '1') return true;     // developer shortcut, ignored in installed builds
  if (!lic.init({ configPath: LIC_CFG(), storeDir: app.getPath('userData'), version: app.getVersion() })) {
    dialog.showErrorBox('BrandVerse Books', 'This build has no licence server configured.\nEdit license.config.json (serverUrl and publicKey) and rebuild the installer.');
    return false;
  }
  let c = lic.check();
  if (!c.ok && ['expired', 'offline_too_long', 'clock'].includes(c.reason)) { await lic.validate(); c = lic.check(); }
  while (!c.ok) {
    const done = await runActivation(c.reason);
    if (!done) return false;
    c = lic.check();
  }
  return true;
}
let licTimer = null;
function watchLicence() {
  clearInterval(licTimer);
  const tick = async () => {
    if (!mainWin) return;
    const r = await lic.validate();                     // 'offline' is fine: the grace period covers it
    const c = lic.check();
    if (!c.ok || (r && ['revoked', 'invalid'].includes(r.error))) enforceLicence(c.reason || r.error);
  };
  setTimeout(tick, 8000);
  licTimer = setInterval(tick, 4 * 3600e3);
}
let enforcing = false;
async function enforceLicence(reason) {
  if (enforcing) return; enforcing = true;
  try {
    const msg = { revoked: 'Your licence has been disabled by your provider.', invalid: 'Your licence is no longer valid.', expired: 'Your licence has expired.', offline_too_long: 'The licence could not be checked online for too long. Connect to the internet.', clock: 'The computer clock looks wrong.' }[reason] || 'Your licence could not be verified.';
    try { await dialog.showMessageBox(mainWin, { type: 'warning', title: 'Licence', message: msg, detail: 'Your data is safe in the Data folder. The application will ask you to activate again.' }); } catch (e) { }
    if (mainWin) { mainWin.destroy(); mainWin = null; }
    if (await ensureLicence()) { createMain(); watchLicence(); } else app.quit();
  } finally { enforcing = false; }
}

/* licence calls from the app (users sync, invitations, OTP, licence page) */
ipcMain.handle('bv:lic-summary', () => lic.summary());
ipcMain.handle('bv:lic-call', (_e, route, body) => lic.call(String(route), body || {}));
ipcMain.handle('bv:lic-validate', async () => { const r = await lic.validate(); if (!lic.check().ok) setTimeout(() => enforceLicence(lic.check().reason), 50); return r.ok ? { ok: true, summary: lic.summary() } : { ok: false, error: r.error }; });
ipcMain.handle('bv:lic-deactivate', async () => { const r = await lic.deactivate(); if (r.ok) setTimeout(() => enforceLicence('not_activated'), 50); return r; });

/* ---------- lifecycle ---------- */
app.whenReady().then(async () => {
  cfg = readConfig();
  if (cfg) { try { ensureDirs(); } catch (e) { cfg = null; } }
  if (!cfg) { cfg = await runSetup(); if (!cfg) { app.quit(); return; } }
  if (!(await ensureLicence())) { app.quit(); return; }
  buildMenu();
  createMain();
  watchLicence();
});
app.on('window-all-closed', () => app.quit());
