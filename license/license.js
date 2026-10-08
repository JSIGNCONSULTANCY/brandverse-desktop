'use strict';
// Licence handling for the desktop app (runs in Electron's main process, no UI here).
// - The licence is a token signed by YOUR server (Ed25519). The matching public key is bundled
//   in license.config.json, so the token can be checked offline and cannot be forged.
// - The token is bound to this computer's ID, carries an expiry date, and must be refreshed
//   online at least once every `graceDays` days (set per customer in the admin panel).
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DAY = 864e5;
let CFG = null, FILE = null, VERSION = '0.0.0', cache = null, machine = null, fetchImpl = null;

function init({ configPath, storeDir, version, fetch }) {
  CFG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  FILE = path.join(storeDir, 'licence.json'); VERSION = version || VERSION;
  fetchImpl = fetch || globalThis.fetch;
  fs.mkdirSync(storeDir, { recursive: true });
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { cache = null; }
  return configured();
}
function configured() { return !!(CFG && CFG.serverUrl && CFG.publicKey && !/PASTE|example\.com/i.test(CFG.serverUrl + CFG.publicKey)); }
function serverUrl() { return CFG.serverUrl.replace(/\/+$/, ''); }

/* ---------- machine fingerprint ---------- */
function machineInfo() {
  if (machine) return machine;
  let raw = '';
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], { encoding: 'utf8', windowsHide: true, timeout: 4000 });
      const m = /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out); if (m) raw = m[1];
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 4000 });
      const m = /"IOPlatformUUID" = "([^"]+)"/.exec(out); if (m) raw = m[1];
    } else {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) { try { raw = fs.readFileSync(f, 'utf8').trim(); if (raw) break; } catch (e) { } }
    }
  } catch (e) { }
  if (!raw) {   // last resort: hostname + first real MAC address
    const mac = Object.values(os.networkInterfaces()).flat().find(i => i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00');
    raw = os.hostname() + '|' + (mac ? mac.mac : os.arch());
  }
  machine = { id: crypto.createHash('sha256').update('bvb|' + raw).digest('hex').slice(0, 32), name: os.hostname() };
  return machine;
}

/* ---------- token ---------- */
function verifyToken(tok) {
  try {
    const [p, s] = String(tok).split('.');
    const body = Buffer.from(p, 'base64url');
    if (!crypto.verify(null, body, crypto.createPublicKey(CFG.publicKey), Buffer.from(s, 'base64url'))) return null;
    return JSON.parse(body.toString());
  } catch (e) { return null; }
}
function persist() { try { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(cache)); fs.renameSync(t, FILE); } catch (e) { } }

/* Local check - works offline. Returns { ok, reason, info } */
function check() {
  if (!configured()) return { ok: false, reason: 'not_configured' };
  if (!cache || !cache.token) return { ok: false, reason: 'not_activated' };
  const p = verifyToken(cache.token);
  if (!p || p.type !== 'lic') return { ok: false, reason: 'tampered' };
  if (p.machineId !== machineInfo().id) return { ok: false, reason: 'other_machine' };
  const now = Date.now();
  if (cache.seen && now < cache.seen - DAY) return { ok: false, reason: 'clock', info: p };         // clock wound back
  if (p.expires && now > p.expires) return { ok: false, reason: 'expired', info: p };
  const graceEnd = p.issued + (p.graceDays || 14) * DAY;
  if (now > graceEnd) return { ok: false, reason: 'offline_too_long', info: p };
  cache.seen = Math.max(cache.seen || 0, now); persist();
  return { ok: true, info: p, graceLeftDays: Math.max(0, Math.ceil((graceEnd - now) / DAY)), daysToExpiry: p.expires ? Math.ceil((p.expires - now) / DAY) : null };
}

/* ---------- server calls ---------- */
async function post(route, body, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms || 12000);
  try {
    const r = await fetchImpl(serverUrl() + '/api' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
    let j = {}; try { j = await r.json(); } catch (e) { }
    if (!r.ok && !j.error) j.error = 'http_' + r.status;
    return j;
  } catch (e) { return { ok: false, error: 'offline' }; } finally { clearTimeout(t); }
}
const withId = (b) => Object.assign({ key: cache && cache.key, machineId: machineInfo().id, machineName: machineInfo().name, appVersion: VERSION }, b || {});

async function activate(key) {
  const res = await post('/activate', { key: String(key || '').trim(), machineId: machineInfo().id, machineName: machineInfo().name, appVersion: VERSION });
  if (!res.ok) return res;
  const p = verifyToken(res.token);
  if (!p || p.machineId !== machineInfo().id) return { ok: false, error: 'bad_response' };
  cache = { key: p.key, token: res.token, seen: p.issued }; persist();
  return { ok: true, status: check() };
}
// Online refresh. error 'offline' means we could not reach the server (fine, grace period applies).
async function validate() {
  if (!cache || !cache.key) return { ok: false, error: 'not_activated' };
  const res = await post('/validate', withId());
  if (res.ok) {
    const p = verifyToken(res.token);
    if (p && p.machineId === machineInfo().id) { cache.token = res.token; cache.seen = p.issued; persist(); }   // server time is the truth
    return { ok: true, status: check() };
  }
  if (['revoked', 'expired', 'invalid', 'not_activated'].includes(res.error)) { // server says no: drop local licence
    if (res.error !== 'expired') { cache = null; try { fs.unlinkSync(FILE); } catch (e) { } }
  }
  return res;
}
async function deactivate() {
  if (!cache || !cache.key) return { ok: true };
  const res = await post('/deactivate', withId());
  if (res.ok || res.error === 'not_activated' || res.error === 'invalid') { cache = null; try { fs.unlinkSync(FILE); } catch (e) { } return { ok: true }; }
  return res;
}
// Calls that need an activated licence: users sync, invitations, OTP.
async function call(route, body) {
  const allowed = ['/users/sync', '/invite/send', '/invite/accept', '/otp/request', '/otp/verify'];
  if (!allowed.includes(route)) return { ok: false, error: 'blocked' };
  const c = check(); if (!c.ok) return { ok: false, error: 'no_licence' };
  const res = await post(route, withId(body));
  // For verify calls, make sure the signed proof really came from our server for this machine.
  if (res.ok && (route === '/otp/verify' || route === '/invite/accept')) {
    const p = verifyToken(res.token);
    const want = route === '/otp/verify' ? 'otp' : 'invite';
    if (!p || p.type !== want || p.machineId !== machineInfo().id || p.exp < Date.now() || p.email !== String(body.email || '').trim().toLowerCase()) return { ok: false, error: 'bad_response' };
    delete res.token;
  }
  return res;
}
function summary() {
  const c = check(); const p = c.info || (cache && cache.token && verifyToken(cache.token)) || {};
  return { ok: c.ok, reason: c.reason || '', customer: p.customer || '', plan: p.plan || '', key: p.key || '', maxUsers: p.maxUsers || 0, maxDevices: p.maxDevices || 0,
    expires: p.expires || null, issued: p.issued || null, graceLeftDays: c.graceLeftDays, daysToExpiry: c.daysToExpiry, machineName: machineInfo().name, serverUrl: CFG ? CFG.serverUrl : '' };
}
module.exports = { get supportText() { return (CFG && CFG.supportText) || ''; }, init, configured, check, activate, validate, deactivate, call, summary, machineInfo, _verifyToken: verifyToken, _reset: () => { cache = null; } };
