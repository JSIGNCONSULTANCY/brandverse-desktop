// Usage:  node scripts/configure-licensing.js https://licence.yourdomain.com ["Support: +971 ... / help@yourdomain.com"]
// Fetches the PUBLIC signing key from your licence server and writes license.config.json.
// Run it once, then build the installer (npm run dist, or the GitHub workflow).
const fs = require('fs'), path = require('path');
(async () => {
  const url = (process.argv[2] || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) { console.error('Usage: node scripts/configure-licensing.js https://your-licence-server [support text]'); process.exit(1); }
  if (/^http:\/\//.test(url) && !/localhost|127\.0\.0\.1/.test(url)) console.warn('WARNING: use https:// for a real server.');
  const r = await fetch(url + '/api/public-key'); if (!r.ok) throw new Error('Server answered HTTP ' + r.status);
  const publicKey = (await r.text()).trim();
  if (!/BEGIN PUBLIC KEY/.test(publicKey)) throw new Error('That server did not return a public key');
  const cfg = { serverUrl: url, publicKey, supportText: process.argv[3] || '' };
  fs.writeFileSync(path.join(__dirname, '..', 'license.config.json'), JSON.stringify(cfg, null, 2) + '\n');
  console.log('license.config.json written for', url);
})().catch(e => { console.error('Failed:', e.message); process.exit(1); });
