# BrandVerse Books - Desktop edition

Your single-file prototype (`source.html`) wrapped as a Windows desktop app.

## How it behaves (Tally-style)
1. **Installer** (`BrandVerse Books Setup 1.0.0.exe`) asks which program folder to install into.
2. **First launch** shows a setup screen: choose the **Data**, **Exports** and **Backups** folders
   (default: `Documents\BrandVerse Books\...`). They are created for you.
3. All company data is saved to `Data\brandverse-data.json` (atomic writes). A daily backup goes to
   `Backups` (latest 30 kept). Every Excel/PDF/CSV export is saved to `Exports`.
4. Folders can be changed later in **Settings > Desktop data**; backups can be restored there.
5. Uninstalling never deletes your data folders.

## Build the installer
The installer must be built on **Windows** (or Linux with wine).
- Locally on Windows: install Node 20+, then `npm install` and `npm run dist`. Output: `dist\BrandVerse Books Setup 1.0.0.exe`.
- Without a Windows PC: push this folder to a GitHub repo, open Actions > "Build Windows installer" > Run workflow, download the artifact.

## Keep editing your prototype
Edit `source.html`, then `npm run start` to test (it regenerates `app/index.html` and fonts) or `npm run dist` to build.
`scripts/prepare-app.js` applies the desktop patches; it stops with an error if an anchor in your HTML changes.

## Before giving it to customers
- Sign the installer with a code-signing certificate, otherwise Windows SmartScreen warns.
- Add licensing / auto-update (`electron-updater`) when ready.
- Data is one file per installation (single user). Multi-user networks and SQLite are a later phase.
- Old data held in your browser is not migrated automatically: use Settings > Backup and restore (copy full backup) in the old version, then restore it here.

---
## Licensing, users and email (new)

See **LICENSING-GUIDE.md**. In short: deploy `brandverse-server`, run
`node scripts/configure-licensing.js https://your-server`, rebuild the installer, then issue keys from the admin panel.
For development you can skip the licence check with `BV_SKIP_LICENCE=1 npm start` (ignored in installed builds).
