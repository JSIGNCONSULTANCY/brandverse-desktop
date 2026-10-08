// Turns the single-file prototype (source.html) into the desktop app page (app/index.html)
// and copies offline fonts. Re-run after every change to source.html:  npm run prepare-app
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let h = fs.readFileSync(path.join(root, 'source.html'), 'utf8');

function rep(label, from, to) {
  const i = h.indexOf(from);
  if (i < 0) throw new Error('Patch anchor not found: ' + label);
  h = h.slice(0, i) + to + h.slice(i + from.length);
}
function repRe(label, re, to) {
  if (!re.test(h)) throw new Error('Patch anchor not found: ' + label);
  h = h.replace(re, to);
}

/* 1. Fonts: remove Google Fonts, use bundled files */
repRe('fonts', /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">');

/* 2. Storage: local data file instead of browser localStorage */
repRe('save', /function save\(\) \{[^\n]*\n/, `function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { Promise.resolve(window.bvDesktop.saveState(serial())).then(ok => { if (ok === false) toast('Could not save to the data folder. Check Settings > Desktop data.', { err: true }); }); } catch (e) { }
  }, 250);
}
window.addEventListener('beforeunload', () => { try { if (saveT) { clearTimeout(saveT); window.bvDesktop.saveStateSync(serial()); } } catch (e) { } });
`);
repRe('load', /function load\(\) \{[^\n]*\n/, `function load() { try { const t = window.bvDesktop.loadSync(); if (t) { const o = JSON.parse(t); if (o && o.companies) return o; } } catch (e) { } return null; }
`);

/* 3. Exports: write into the Exports folder */
rep('saveFile', 'async function saveFile(bytes, name, mime) {', `async function saveFile(bytes, name, mime) {
  if (window.bvDesktop) {
    try {
      const u8 = bytes instanceof Uint8Array ? bytes : (typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes.buffer ? bytes.buffer : bytes));
      const r = await window.bvDesktop.saveExport(name, u8);
      if (r && r.ok) { UI._lastExport = r.path; toast('Saved to Exports: ' + r.name, { link: { act: 'dtOpenExports', id: 'x', label: 'Open folder' } }); }
      else toast('Could not save the file: ' + ((r && r.error) || 'unknown error'), { err: true });
    } catch (e) { toast('Could not save the file: ' + e.message, { err: true }); }
    return;
  }`);

/* 4. Live prices: fetch through the main process (no CORS limits) */
rep('getJSON', 'async function getJSON(url, ms) {', 'async function getJSON(url, ms) { if (window.bvDesktop) return window.bvDesktop.fetchJSON(url, ms || 8000);\n ');

/* 5. Backup tab wording */
rep('backup text', 'Data is saved in this browser automatically. It is not shared with other devices.', 'Data is saved automatically to your Data folder, with a daily backup. See Settings &gt; Desktop data.');

/* 6. Desktop data settings tab + handlers (inserted before boot) */
const desktopCode = fs.readFileSync(path.join(__dirname, 'desktop-ui.js'), 'utf8');
const accountCode = fs.readFileSync(path.join(__dirname, 'account-ui.js'), 'utf8');

/* 6b. Sign-in by username OR email; invited users cannot sign in until they accept */
rep('login by email', "const u = S.users.find(x => (x.username || '').toLowerCase() === un);", "const u = S.users.find(x => (x.username || '').toLowerCase() === un) || S.users.find(x => un.includes('@') && (x.email || '').trim().toLowerCase() === un);");
rep('invited login', "if (!u || !checkPw(u.pw, pw)) {", "if (u && u.status === 'INVITED') { L.err = 'This invitation has not been accepted yet. Click Accept invitation below and use the code from your email.'; return render(); }\n  if (!u || !checkPw(u.pw, pw)) {");
/* 6c. Users tab: invited state, resend, invite wording */
rep('user status', "const st = u.status === 'ACTIVE' ? '<span class=\"zst zgood\">Active</span>' : '<span class=\"zst zwarn\">Disabled</span>';", "const st = u.status === 'ACTIVE' ? '<span class=\"zst zgood\">Active</span>' : u.status === 'INVITED' ? '<span class=\"zst zwarn\">Invited</span>' : '<span class=\"zst zwarn\">Disabled</span>';");
rep('resend btn', '<button class="btn sm" data-act="userReset" data-id="${u.id}">Reset password</button>', '${u.status === \'INVITED\' ? `<button class="btn sm" data-act="userResend" data-id="${u.id}">Resend invite</button>` : `<button class="btn sm" data-act="userReset" data-id="${u.id}">Reset password</button>`}');
rep('invite label', 'data-act="userNew">+ New user</button>', 'data-act="userNew">+ Invite user</button>');
rep('boot', '/* ---- boot ---- */', desktopCode + '\n' + accountCode + '\n/* ---- boot ---- */');

fs.mkdirSync(path.join(root, 'app'), { recursive: true });
fs.writeFileSync(path.join(root, 'app', 'index.html'), h);

/* 7. Fonts */
const fdir = path.join(root, 'app', 'fonts');
fs.mkdirSync(fdir, { recursive: true });
const faces = [
  ['urbanist', 'Urbanist', 'latin', [500, 600, 700]],
  ['manrope', 'Manrope', 'latin', [400, 500, 600, 700]],
  ['ibm-plex-mono', 'IBM Plex Mono', 'latin', [400, 500]],
  ['noto-naskh-arabic', 'Noto Naskh Arabic', 'arabic', [400, 600, 700]],
  ['noto-naskh-arabic', 'Noto Naskh Arabic', 'latin', [400, 600, 700]]
];
const ranges = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  arabic: 'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC'
};
let css = '';
for (const [pkg, fam, subset, weights] of faces) {
  for (const w of weights) {
    const file = `${pkg}-${subset}-${w}-normal.woff2`;
    const src = path.join(root, 'node_modules', '@fontsource', pkg, 'files', file);
    if (!fs.existsSync(src)) throw new Error('Missing font file ' + file + ' (run npm install)');
    fs.copyFileSync(src, path.join(fdir, file));
    css += `@font-face{font-family:'${fam}';font-style:normal;font-display:swap;font-weight:${w};src:url('${file}') format('woff2');unicode-range:${ranges[subset]};}\n`;
  }
}
fs.writeFileSync(path.join(fdir, 'fonts.css'), css);
console.log('app/index.html written (' + Math.round(h.length / 1024) + ' KB), fonts copied.');
