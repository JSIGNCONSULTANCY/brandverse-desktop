# Selling BrandVerse Books: licences, users and email

## How it fits together

```
 YOU                                          YOUR CUSTOMER
 ┌──────────────────────┐   internet   ┌──────────────────────────┐
 │ Licence server        │◄────────────►│ BrandVerse Books (.exe)   │
 │  - licence keys       │  key check,  │  - activates with a key   │
 │  - seats / expiry     │  emails      │  - company data stays on  │
 │  - sends OTP + invite │              │    THEIR computer         │
 │  emails               │              └──────────────────────────┘
 └──────────────────────┘
```
Accounting data never leaves the customer's computer. The server only knows: licence key, computer name/ID, user emails and roles.

## One-time set-up (you)

1. **Deploy the licence server** (folder `brandverse-server`, see its README). You need HTTPS, a disk that persists, and an SMTP mail account.
2. Open `https://your-server/admin`, sign in with `ADMIN_PASSWORD`.
3. **Point the app at your server** (in this desktop project):
   ```
   node scripts/configure-licensing.js https://your-server "Support: help@yourdomain.com"
   ```
   This fetches your server's public signing key into `license.config.json`.
4. **Build the installer** again (GitHub Actions workflow, or `npm install && npm run dist`). Every installer built after step 3 only accepts licences signed by your server.
   Keep the installer file; this one `.exe` is what you give every customer.

## For each new customer

1. Admin panel → **New licence**: customer name, email, users allowed, computers allowed, expiry date, plan. Tick *Email the key*.
2. Send the customer the installer and the key (`BVB-XXXX-XXXX-XXXX-XXXX`).
3. Customer installs → app asks for the key → **Activate** (needs internet once).
4. First sign-in screen asks for an **owner account**: name, email, username, password. A 6-digit code is emailed to confirm the address.
5. The owner then adds people with **Settings → Users → Invite user**.

## Users, invitations and password reset

* Every user has a unique email address, verified by a one-time code.
* **Invite user**: the owner/admin enters name, email, role and companies. The person gets an email with an 8-character code.
  On the sign-in screen they click **Accept invitation**, enter email + code and choose a password.
  Invited people cannot sign in until they accept; codes expire after 7 days (use *Resend invite*).
* **Sign in** with username **or** email.
* **Forgot password?** → *Email me a code* → enter the 6-digit code and a new password. The code lasts 10 minutes, allows 5 tries, and is limited to 3 requests per 15 minutes. The screen reads the same whether or not the email exists.
  Offline fallbacks remain: recovery key, or an administrator resets it in Settings → Users.
* **Seat limit**: the licence caps active + invited users. Remove a user to free a seat, or raise the limit in the admin panel (then *Check licence now* in the app).

## Day-to-day

| Situation | What you do |
|---|---|
| Customer renews | Admin → Manage → **Extend 1 year**. App picks it up within hours, or customer clicks *Settings → Licence → Check licence now*. |
| Customer stops paying | **Revoke**. Blocks at the app's next online check (every 4 h while open) or when the offline grace ends. Their data stays on their PC. |
| Customer buys a new PC | Old PC: *Settings → Licence → Deactivate this computer* (or you click **Remove** on the computer in the admin panel). Then activate on the new PC and copy the Data folder. |
| More users / computers | Admin → Edit details → change limits. |
| Customer offline for weeks | Works for the *Offline grace* days you set (default 14), then asks to connect once. |

## Things to know (honest limits)

* **Multi-user** here means several people with their own logins and roles on the computer(s) that open the same Data folder (e.g. a shared office PC, or one PC at a time). It is not real-time multi-user over a network: two computers must not edit the same data file at the same time.
  If you need that later, the next step is a central database (a server edition).
* A desktop licence can be defeated by a determined cracker who edits the app code. It stops casual copying and gives you control (expiry, revoke, seats). Code-signing the installer and keeping the server-side checks (seats, OTP) are your real protection.
* Sign the Windows installer with a code-signing certificate to avoid SmartScreen warnings.
* Back up the server's `data` folder (licences + private key).
* Changing the signing key (or losing it) means rebuilding the installer and re-activating customers.
