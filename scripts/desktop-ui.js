/* ---- desktop edition: Settings > Desktop data ---- */
SET_TABS.push(['desktop', 'Desktop data']);
function dtLoad() { return window.bvDesktop.info().then(i => { UI._dt = i; return window.bvDesktop.listBackups(); }).then(b => { UI._dtb = b; render(); }); }
function desktopTab() {
  const tabs = `<div class="tabs">${SET_TABS.map(t => `<button class="${(UI.p.tab || '') === t[0] ? 'on' : ''}" data-act="setTab" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>`;
  if (!UI._dt) { dtLoad(); return tabs + '<div class="card"><div class="bd">Loading…</div></div>'; }
  const i = UI._dt, bk = UI._dtb || [];
  const row = (label, key, dir, note) => `<div class="card" style="margin-bottom:12px"><div class="hd"><h2>${label}</h2></div><div class="bd" style="display:flex;flex-direction:column;gap:8px"><code style="word-break:break-all">${esc(dir)}</code><div class="hint">${note}</div><div class="row"><button class="btn" data-act="dtOpen" data-which="${key}">Open folder</button><button class="btn" data-act="dtChange" data-which="${key}">Change folder…</button></div></div></div>`;
  const list = bk.length ? `<table class="tbl" style="width:100%"><tbody>${bk.slice(0, 15).map(b => `<tr><td>${esc(b.name)}</td><td style="text-align:right">${Math.round(b.size / 1024)} KB</td><td style="text-align:right"><button class="btn sm" data-act="dtRestore" data-name="${esc(b.name)}">Restore</button></td></tr>`).join('')}</tbody></table>` : '<div class="hint">No backups yet.</div>';
  return tabs + `<div class="grid g2"><div>
    ${row('Data folder', 'data', i.dataDir, 'Company data file: brandverse-data.json (' + Math.round(i.size / 1024) + ' KB). Changing the folder copies your data across.')}
    ${row('Exports folder', 'exports', i.exportsDir, 'Excel, PDF and CSV exports are saved here.')}
    ${row('Backups folder', 'backups', i.backupsDir, 'A daily backup is made automatically. The latest 30 are kept.')}
  </div><div class="card"><div class="hd"><h2>Backups</h2></div><div class="bd" style="display:flex;flex-direction:column;gap:10px">
    <div class="row"><button class="btn pri" data-act="dtBackup">Back up now</button></div>${list}
    <div class="hint">BrandVerse Books ${esc(i.version)}. Restoring replaces current data with the chosen backup (a copy of the current data is kept in Backups first).</div>
  </div></div></div>`;
}
(function () {
  const _sb = PAGES.settings.body;
  PAGES.settings.body = () => (UI.p && UI.p.tab === 'desktop') ? desktopTab() : _sb();
})();
ACT.dtOpenExports = () => window.bvDesktop.openPath('exports');
ACT.dtOpen = el => window.bvDesktop.openPath(el.dataset.which);
ACT.dtChange = async el => {
  const r = await window.bvDesktop.changeFolder(el.dataset.which);
  if (r && r.ok) { if (r.reload) { toast('Data folder changed. Reloading…'); setTimeout(() => location.reload(), 600); } else { UI._dt = null; render(); toast('Folder updated'); } }
  else if (r && !r.canceled) toast('Could not change folder: ' + (r.error || ''), { err: true });
};
ACT.dtBackup = async () => { try { await window.bvDesktop.saveStateSync(serial()); } catch (e) { } const r = await window.bvDesktop.backupNow(); UI._dt = null; render(); toast(r && r.name ? 'Backup saved: ' + r.name : 'Backup failed', { err: !(r && r.name) }); };
ACT.dtRestore = el => {
  const name = el.dataset.name;
  confirmBox('Restore backup', 'Replace all current data with <b>' + esc(name) + '</b>? A backup of the current data is made first.', 'Restore', async () => {
    try { await window.bvDesktop.saveStateSync(serial()); await window.bvDesktop.backupNow(); const t = await window.bvDesktop.readBackup(name); closeModal(); restoreFrom(t); UI._dt = null; }
    catch (e) { toast('Restore failed: ' + e.message, { err: true }); }
  });
};
window.addEventListener('beforeunload', () => { try { if (window.bvDesktop) window.bvDesktop.saveStateSync(serial()); } catch (e) { } });
