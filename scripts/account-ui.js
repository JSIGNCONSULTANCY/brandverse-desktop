/* ---- desktop edition: licence, verified emails, invitations, OTP password reset ---- */
const BVD = window.bvDesktop;
const LICENSED = !!(BVD && BVD.lic);
/* The prototype opens straight into the owner account. A real installation must sign in every time. */
authed = function () { return _authed11(); };

const ACC_ERR = {
  offline: 'Could not reach the licence server. Check your internet connection and try again.',
  rate_limited: 'Too many requests. Please wait a few minutes and try again.',
  invalid_code: 'That code is not correct, or it has expired.',
  locked: 'Too many wrong attempts. Request a new code.',
  mail_failed: 'The email could not be sent. Ask your provider to check the server email settings.',
  no_licence: 'The licence is not valid on this computer.',
  bad_email: 'Enter a valid email address.',
  bad_response: 'The server response could not be verified. Please try again.'
};
function accMsg(r) {
  if (r && r.error === 'seat_limit') return `Your licence allows ${r.max} users. Remove a user, or ask your provider for more seats.`;
  return (r && ACC_ERR[r.error]) || ('Request failed (' + ((r && r.error) || 'unknown') + ').');
}
const accEmailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const accNorm = e => String(e || '').trim().toLowerCase();
const accTaken = (e, exceptId) => S.users.some(u => u.id !== exceptId && accNorm(u.email) === e);
const accUserByEmail = e => S.users.find(u => accNorm(u.email) === accNorm(e));
const accCall = (route, body) => LICENSED ? BVD.lic.call(route, body) : Promise.resolve({ ok: false, error: 'no_licence' });
let accBusy = false;
async function accGuard(fn) { if (accBusy) return; accBusy = true; try { await fn(); } finally { accBusy = false; } }

/* ---------- keep the server's user list (seat count + OTP recipients) up to date ---------- */
let accSyncSig = '', accSyncT = null;
function accUsersPayload() {
  return S.users.filter(u => accEmailOk(accNorm(u.email))).map(u => ({ email: accNorm(u.email), name: u.name, role: (S.companies.map(c => (c.members.find(m => m.user === u.id) || {}).role).find(Boolean)) || u.defRole || '', status: u.status === 'ACTIVE' ? 'active' : u.status === 'INVITED' ? 'invited' : 'disabled' }));
}
async function accSyncNow(force) {
  if (!LICENSED) return; const users = accUsersPayload(); const sig = JSON.stringify(users);
  if (!force && sig === accSyncSig) return;
  const r = await BVD.lic.call('/users/sync', { users });
  if (r && r.ok) accSyncSig = sig;
  else if (r && r.error === 'seat_limit') toast(accMsg(r), { err: true });
}
const _save_acc = save;
save = function () { _save_acc.apply(this, arguments); clearTimeout(accSyncT); accSyncT = setTimeout(() => { accSyncNow(false); }, 1500); };

/* ---------- sign-in page ---------- */
const accPristine = () => S.users.length === 1 && !S.users[0].setup && !S.users[0].lastLogin && S.companies.length === 0;
const _loginPage_acc = loginPage;
loginPage = function () {
  if (accPristine()) return `<div class="login"><div class="login-card"><img src="${LOGO_FULL}" alt="BrandVerse by J Sign" class="login-logo">
    <h1>Welcome to BrandVerse Books</h1><p class="muted" style="margin:0 0 16px">Create the owner account for this installation. You will confirm your email address with a one-time code.</p>
    <button class="btn pri login-btn" data-act="ownerSetup">Create owner account</button></div><div class="login-foot">BrandVerse · by J Sign</div></div>`;
  let h = _loginPage_acc();
  h = h.replace(/<details class="more demo">[\s\S]*?<\/details>/, '');
  h = h.replace('<label for="lg-user">Username</label>', '<label for="lg-user">Username or email</label>');
  h = h.replace('data-act="forgotPw">Forgot password?</button>', 'data-act="forgotPw">Forgot password?</button><button type="button" class="btn ghost fp-link" data-act="acceptInvite">Accept invitation</button>');
  return h;
};

/* ---------- owner set-up (first launch) ---------- */
ACT.ownerSetup = () => {
  UI.f = { step: 1, name: '', email: '', un: 'owner', p1: '', p2: '', code: '' };
  openModal({ title: 'Create the owner account', wide: true,
    body: () => { const f = UI.f; return f.step === 1
      ? `<p style="margin:0">This account has full control. Use a real email address: it is used to recover your password.</p>
         <div class="fg">${fIn('f.name', 'Full name')}${fIn('f.email', 'Email address')}${fIn('f.un', 'Username (for sign-in)')}<div></div>${pwIn('f.p1', 'Password')}${pwIn('f.p2', 'Repeat password')}</div><div class="hint">At least 8 characters with letters and a number.</div>`
      : `<p style="margin:0">We sent a 6-digit code to <b>${esc(f.email)}</b>. Enter it below. It expires in 10 minutes.</p><div class="fg">${fIn('f.code', 'Verification code', { ph: '123456' })}</div>`; },
    foot: () => UI.f.step === 1 ? `<button class="btn pri" data-act="modalOk">Send verification code</button>`
      : `<button class="btn" data-act="osBack">Back</button><button class="btn" data-act="osResend">Resend code</button><button class="btn pri" data-act="modalOk">Verify and create account</button>`,
    ok: () => accGuard(async () => {
      const f = UI.f;
      if (f.step === 1) {
        const un = f.un.trim().toLowerCase(), em = accNorm(f.email);
        if (!f.name.trim()) return toast('Enter your full name', { err: true });
        if (!accEmailOk(em)) return toast('Enter a valid email address', { err: true });
        if (!/^[a-z0-9._-]{3,30}$/.test(un)) return toast('Username: 3 to 30 letters, numbers, dots or dashes', { err: true });
        const e = pwPolicy(f.p1); if (e) return toast(e, { err: true }); if (f.p1 !== f.p2) return toast('The passwords do not match', { err: true });
        toast('Sending code…'); const r = await accCall('/otp/request', { email: em, purpose: 'verify' });
        if (!r.ok) return toast(accMsg(r), { err: true });
        f.email = em; f.step = 2; renderModal(); return;
      }
      const r = await accCall('/otp/verify', { email: f.email, otp: f.code, purpose: 'verify' });
      if (!r.ok) return toast(accMsg(r), { err: true });
      const u = S.users[0];
      Object.assign(u, { name: f.name.trim(), username: f.un.trim().toLowerCase(), email: f.email, pw: mkPw(f.p1), mustChange: false, emailOk: true, setup: true, status: 'ACTIVE', createdAt: nowStamp() });
      secLog('Owner account created', '', u.name); u.lastLogin = nowStamp(); S.user = u.id; setOut(false); sessSet(u.id); UI.login = null; UI.page = 'home'; UI.p = {};
      save(); accSyncNow(true); closeModal(); render(); toast('Welcome, ' + u.name);
      setTimeout(() => { if (!u.rec && !UI.modal) showRecoveryKey(u, true); }, 400);
    }) });
};
ACT.osBack = () => { UI.f.step = 1; renderModal(); };
ACT.osResend = () => accGuard(async () => { const r = await accCall('/otp/request', { email: UI.f.email, purpose: 'verify' }); toast(r.ok ? 'A new code was sent' : accMsg(r), { err: !r.ok }); });

/* ---------- forced email verification (every user needs a verified email) ---------- */
function accOpenVerify() {
  const me = USER(); if (!me) return;
  UI.f = { step: 1, email: me.email || '', code: '' };
  openModal({ title: 'Verify your email address', wide: true,
    body: () => { const f = UI.f; return f.step === 1
      ? `<p style="margin:0">Every user needs a verified email address. It is used to recover your password with a one-time code.</p><div class="fg">${fIn('f.email', 'Your email address')}</div>`
      : `<p style="margin:0">We sent a 6-digit code to <b>${esc(f.email)}</b>. Enter it below.</p><div class="fg">${fIn('f.code', 'Verification code', { ph: '123456' })}</div>`; },
    foot: () => UI.f.step === 1 ? `<button class="btn" data-act="vfOut">Sign out</button><button class="btn pri" data-act="modalOk">Send code</button>`
      : `<button class="btn" data-act="vfBack">Back</button><button class="btn" data-act="vfResend">Resend code</button><button class="btn pri" data-act="modalOk">Verify</button>`,
    ok: () => accGuard(async () => {
      const f = UI.f;
      if (f.step === 1) {
        const em = accNorm(f.email); if (!accEmailOk(em)) return toast('Enter a valid email address', { err: true });
        if (accTaken(em, me.id)) return toast('That email is already used by another user', { err: true });
        toast('Sending code…'); const r = await accCall('/otp/request', { email: em, purpose: 'verify' });
        if (!r.ok) return toast(accMsg(r), { err: true });
        f.email = em; f.step = 2; renderModal(); return;
      }
      const r = await accCall('/otp/verify', { email: f.email, otp: f.code, purpose: 'verify' });
      if (!r.ok) return toast(accMsg(r), { err: true });
      me.email = f.email; me.emailOk = true; secLog('Verified email', f.email); save(); accSyncNow(true); closeModal(); render(); toast('Email verified');
      setTimeout(() => { if (!me.rec && isAdminUser(me) && !UI.modal) showRecoveryKey(me, true); }, 300);
    }) });
}
ACT.vfBack = () => { UI.f.step = 1; renderModal(); };
ACT.vfResend = () => accGuard(async () => { const r = await accCall('/otp/request', { email: UI.f.email, purpose: 'verify' }); toast(r.ok ? 'A new code was sent' : accMsg(r), { err: !r.ok }); });
ACT.vfOut = () => { setOut(true); sessSet(null); closeModal(); UI.d = null; UI.page = 'home'; UI.p = {}; render(); };
const _showRecoveryKey_acc = showRecoveryKey;
showRecoveryKey = function (u, isNew) { if (LICENSED && u && !u.emailOk) return; return _showRecoveryKey_acc(u, isNew); };

let accLicToast = false;
setInterval(() => {
  try {
    if (!LICENSED || !authed() || UI.modal) return;
    const me = USER(); if (!me) return;
    if (!me.emailOk) return accOpenVerify();
    if (!accLicToast && UI._lic && UI._lic.daysToExpiry != null && UI._lic.daysToExpiry <= 14) { accLicToast = true; toast(`Your licence expires in ${Math.max(0, UI._lic.daysToExpiry)} day(s). Contact your provider to renew.`); }
    if (!accLicToast && UI._lic && UI._lic.graceLeftDays != null && UI._lic.graceLeftDays <= 3) { accLicToast = true; toast(`Connect to the internet within ${UI._lic.graceLeftDays} day(s) so the licence can be checked.`); }
  } catch (e) { }
}, 1200);
setInterval(() => { try { if (LICENSED && !authed() && accPristine() && !UI.modal && !UI._osOpened) { UI._osOpened = true; ACT.ownerSetup(); } } catch (e) { } }, 700);
if (LICENSED) BVD.lic.summary().then(s => { UI._lic = s; }).catch(() => { });

/* the original demo password must not survive a real deployment */
document.addEventListener('submit', e => {
  if (e.target.id !== 'login-form') return;
  setTimeout(() => { try { if (!authed()) return; const u = USER(); const d = DEMO_LOGINS[u.id]; if (d && !u.setup && checkPw(u.pw, d[1]) && !UI.modal) { u.mustChange = true; changeOwnPassword(true); } } catch (err) { } }, 0);
});

/* ---------- invite users by email ---------- */
function accSeatsLeft() {
  const max = UI._lic && UI._lic.maxUsers; if (!max) return 99;
  return max - S.users.filter(u => u.status === 'ACTIVE' || u.status === 'INVITED').length;
}
function accInviteModal() {
  const c = CO();
  UI.f = { name: '', username: '', email: '', role: 'DATA_ENTRY', cos: [c.id] };
  openModal({ title: 'Invite user by email', wide: true, body: () => { const f = UI.f; return `
    <p style="margin:0">We email the person a one-time invitation code. They accept it on the sign-in screen and choose their own password.</p>
    <div class="fg">${fIn('f.name', 'Full name')}${fIn('f.email', 'Email address')}${fIn('f.username', 'Username (for sign-in)', { ph: 'auto from email' })}${fIn('f.role', `Role in ${c.name}`, { type: 'select', options: roleOpts(), rr: true })}</div>
    <div><div class="lab" style="margin-bottom:6px">Company access</div>${S.companies.map(x => `<label class="check"><input type="checkbox" data-act-change="userCo" data-co="${x.id}" ${f.cos.includes(x.id) ? 'checked' : ''}>${esc(x.name)}</label>`).join('')}</div>
    <div class="note">This role allows: ${(ROLES[f.role] || { perms: [] }).perms.map(p => esc((PERMS.flatMap(g => g[1]).find(x => x[0] === p) || [p, p])[1])).join(', ') || 'viewing only'}.${accSeatsLeft() < 99 ? ` Seats left on your licence: <b>${Math.max(0, accSeatsLeft())}</b>.` : ''}</div>`; },
    foot: () => `<button class="btn" data-act="closeModal">Cancel</button><button class="btn pri" data-act="modalOk">Send invitation</button>`,
    ok: () => accGuard(async () => {
      const f = UI.f; const em = accNorm(f.email);
      let un = (f.username || '').trim().toLowerCase();
      if (!f.name.trim()) return toast('Enter the full name', { err: true });
      if (!accEmailOk(em)) return toast('Enter a valid email address', { err: true });
      if (accTaken(em)) return toast('That email already belongs to a user', { err: true });
      if (!un) { un = em.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]+/g, '.').slice(0, 30); let n = 2, base = un; while (S.users.some(x => x.username === un)) un = base.slice(0, 26) + (n++); }
      if (!/^[a-z0-9._-]{3,30}$/.test(un)) return toast('Username: 3 to 30 letters, numbers, dots or dashes', { err: true });
      if (S.users.some(x => x.username === un)) return toast('That username is already taken', { err: true });
      if (!f.cos.length) return toast('Give access to at least one company', { err: true });
      if (f.role === 'OWNER' && ROLE() !== 'OWNER') return toast('Only an owner can create owners', { err: true });
      if (accSeatsLeft() < 1) return toast('Your licence has no free user seats. Ask your provider for more.', { err: true });
      toast('Sending invitation…');
      const r = await accCall('/invite/send', { email: em, name: f.name.trim(), role: f.role, roleLabel: (ROLES[f.role] || {}).label, inviter: USER().name, company: c.name });
      if (!r.ok) return toast(accMsg(r), { err: true });
      const user = { id: uid('u'), name: f.name.trim(), username: un, email: em, defRole: f.role, pw: null, mustChange: false, status: 'INVITED', emailOk: false, invitedAt: nowStamp(), createdAt: nowStamp(), createdBy: USER().name };
      S.users.push(user);
      S.companies.forEach(x => { if (f.cos.includes(x.id)) x.members.push({ user: user.id, role: f.role }); });
      secLog('Invited user', `${user.name} <${em}> as ${ROLES[f.role].label}`); c.audit.push({ ts: nowStamp(), user: USER().name, action: 'Invited user', detail: user.name });
      mutated(); closeModal(); render(); toast(`Invitation sent to ${em}`);
    }) });
}
const _userModal_acc = userModal;
userModal = function (id) {
  if (!id) return LICENSED ? accInviteModal() : _userModal_acc(id);
  _userModal_acc(id); if (!LICENSED || !UI.modal) return;
  const m = UI.modal, orig = m.ok, u = S.users.find(x => x.id === id), before = accNorm(u.email);
  m.ok = () => {
    const em = accNorm(UI.f.email);
    if (!accEmailOk(em)) return toast('Enter a valid email address', { err: true });
    if (accTaken(em, id)) return toast('That email is already used by another user', { err: true });
    orig(); if (accNorm(u.email) !== before) { u.emailOk = false; u.email = em; save(); }
  };
};
ACT.userResend = el => accGuard(async () => {
  const u = S.users.find(x => x.id === el.dataset.id); if (!u) return; const c = CO();
  const role = (c.members.find(m => m.user === u.id) || {}).role || u.defRole;
  toast('Sending invitation…');
  const r = await accCall('/invite/send', { email: accNorm(u.email), name: u.name, role, roleLabel: (ROLES[role] || {}).label, inviter: USER().name, company: c.name });
  if (!r.ok) return toast(accMsg(r), { err: true });
  u.invitedAt = nowStamp(); secLog('Resent invitation', u.email); save(); render(); toast('A new invitation was sent to ' + u.email);
});
const _userToggle_acc = ACT.userToggle;
ACT.userToggle = function (el) { const u = S.users.find(x => x.id === el.dataset.id); if (u && u.status === 'INVITED') return toast('This person has not accepted the invitation yet. Resend or remove the invitation instead.', { err: true }); return _userToggle_acc.apply(this, arguments); };

/* ---------- accept invitation (sign-in screen) ---------- */
ACT.acceptInvite = () => {
  UI.f = { email: '', code: '', p1: '', p2: '' };
  openModal({ title: 'Accept your invitation', wide: true, body: () => `<p style="margin:0">Enter the email address the invitation was sent to and the code from that email, then choose your password.</p>
    <div class="fg">${fIn('f.email', 'Email address')}${fIn('f.code', 'Invitation code', { ph: 'XXXX-XXXX' })}${pwIn('f.p1', 'Choose a password')}${pwIn('f.p2', 'Repeat password')}</div><div class="hint">At least 8 characters with letters and a number.</div>`,
    foot: () => `<button class="btn" data-act="closeModal">Cancel</button><button class="btn pri" data-act="modalOk">Accept and continue</button>`,
    ok: () => accGuard(async () => {
      const f = UI.f; const em = accNorm(f.email); const u = accUserByEmail(em);
      if (!u || u.status !== 'INVITED') return toast('No pending invitation for this email was found on this computer. Use the computer that holds the company data.', { err: true });
      const e = pwPolicy(f.p1); if (e) return toast(e, { err: true }); if (f.p1 !== f.p2) return toast('The passwords do not match', { err: true });
      const r = await accCall('/invite/accept', { email: em, code: f.code });
      if (!r.ok) return toast(accMsg(r), { err: true });
      Object.assign(u, { pw: mkPw(f.p1), status: 'ACTIVE', emailOk: true, mustChange: false, pwChangedAt: nowStamp(), acceptedAt: nowStamp(), failed: 0, lockUntil: 0 });
      secLog('Accepted invitation', '', u.name); save(); accSyncNow(true); closeModal(); UI.login = { u: u.username, p: '', err: '' }; render(); toast(`Welcome, ${u.name}. Sign in with ${u.username} or your email.`);
    }) });
};

/* ---------- forgot password: emailed one-time code ---------- */
ACT.forgotPw = () => {
  UI.f = { mode: LICENSED ? 'otp' : 'key', step: 1, email: '', code: '', un: (UI.login && UI.login.u) || '', key: '', n1: '', n2: '' };
  openModal({ title: 'Forgot your password?', wide: true, body: () => { const f = UI.f; return `
    <div class="seg" role="tablist">${[['otp', 'Email me a code'], ['key', 'I have a recovery key'], ['admin', 'Ask an administrator']].map(x => `<button class="${f.mode === x[0] ? 'on' : ''}" data-act="fpMode" data-m="${x[0]}">${x[1]}</button>`).join('')}</div>
    ${f.mode === 'otp' ? (f.step === 1
      ? `<p style="margin:0">Enter the email address on your account. We will send a 6-digit code to it.</p><div class="fg">${fIn('f.email', 'Email address')}</div>`
      : `<p style="margin:0">If <b>${esc(f.email)}</b> belongs to an account, a code is on its way. It expires in 10 minutes.</p><div class="fg">${fIn('f.code', '6-digit code', { ph: '123456' })}${pwIn('f.n1', 'New password')}${pwIn('f.n2', 'Repeat new password')}</div><div class="hint">At least 8 characters with letters and a number.</div>`)
    : f.mode === 'key' ? `<p style="margin:0">Owners and administrators get a recovery key when they first sign in. Enter it to set a new password.</p>
      <div class="fg">${fIn('f.un', 'Username')}${fIn('f.key', 'Recovery key', { ph: 'XXXX-XXXX-XXXX-XXXX' })}${pwIn('f.n1', 'New password')}${pwIn('f.n2', 'Repeat new password')}</div>`
    : `<p style="margin:0">Any owner or administrator can set a temporary password for you:</p>
      <ol class="fp-steps"><li>They sign in and open <b>Settings → Users</b>.</li><li>They click <b>Reset password</b> on your row and give you the temporary password.</li><li>You sign in with it and choose a new one straight away.</li></ol>`}`; },
    foot: () => { const f = UI.f; if (f.mode === 'admin') return `<button class="btn" data-act="closeModal">Close</button>`;
      if (f.mode === 'otp') return f.step === 1 ? `<button class="btn" data-act="closeModal">Cancel</button><button class="btn pri" data-act="modalOk">Send code</button>`
        : `<button class="btn" data-act="fpBack">Back</button><button class="btn" data-act="fpResend">Resend code</button><button class="btn pri" data-act="modalOk">Set new password</button>`;
      return `<button class="btn" data-act="closeModal">Cancel</button><button class="btn pri" data-act="modalOk">Set new password</button>`; },
    ok: () => accGuard(async () => {
      const f = UI.f;
      if (f.mode === 'otp') {
        const em = accNorm(f.email);
        if (f.step === 1) {
          if (!accEmailOk(em)) return toast('Enter a valid email address', { err: true });
          const u = accUserByEmail(em);
          if (u && u.status === 'ACTIVE') { toast('Sending code…'); const r = await accCall('/otp/request', { email: em, purpose: 'reset' }); if (!r.ok) return toast(accMsg(r), { err: true }); }
          f.email = em; f.step = 2; renderModal(); return;      // same message whether or not the email exists
        }
        const u = accUserByEmail(em);
        if (u && u.recLock) { /* not used */ }
        const e = pwPolicy(f.n1); if (e) return toast(e, { err: true }); if (f.n1 !== f.n2) return toast('The new passwords do not match', { err: true });
        if (!u || u.status !== 'ACTIVE') return toast(ACC_ERR.invalid_code, { err: true });
        const r = await accCall('/otp/verify', { email: em, otp: f.code, purpose: 'reset' });
        if (!r.ok) return toast(accMsg(r), { err: true });
        u.pw = mkPw(f.n1); u.mustChange = false; u.failed = 0; u.lockUntil = 0; u.pwChangedAt = nowStamp(); u.emailOk = true;
        secLog('Reset password by email code', '', u.name); save(); closeModal(); UI.login = { u: u.username, p: '', err: '' }; render();
        toast('Password changed. Sign in with your new password.'); return;
      }
      if (f.mode === 'key') {
        const u = S.users.find(x => (x.username || '').toLowerCase() === f.un.trim().toLowerCase());
        if (u && u.recLock && Date.now() < u.recLock) return toast(`Too many attempts. Try again in ${Math.ceil((u.recLock - Date.now()) / 1000)} seconds.`, { err: true });
        if (!u || !u.rec || !checkPw(u.rec, normKey(f.key))) { if (u) { u.recFail = (u.recFail || 0) + 1; if (u.recFail >= 5) { u.recLock = Date.now() + 300000; u.recFail = 0; } } secLog('Failed password recovery', f.un, f.un); save(); return toast('That username and recovery key do not match.', { err: true }); }
        const e = pwPolicy(f.n1); if (e) return toast(e, { err: true }); if (f.n1 !== f.n2) return toast('The new passwords do not match', { err: true });
        u.pw = mkPw(f.n1); u.mustChange = false; u.failed = 0; u.lockUntil = 0; u.recFail = 0; u.rec = null; u.pwChangedAt = nowStamp();
        secLog('Reset password with recovery key', '', u.name); save(); closeModal(); UI.login = { u: u.username, p: '', err: '' }; render();
        toast('Password changed. Sign in with your new password.');
      }
    }) });
};
ACT.fpBack = () => { UI.f.step = 1; renderModal(); };
ACT.fpResend = () => accGuard(async () => { const u = accUserByEmail(UI.f.email); if (u && u.status === 'ACTIVE') { const r = await accCall('/otp/request', { email: accNorm(UI.f.email), purpose: 'reset' }); if (!r.ok) return toast(accMsg(r), { err: true }); } toast('If the email is registered, a new code was sent'); });

/* ---------- Settings > Licence ---------- */
SET_TABS.push(['licence', 'Licence']);
function accLicenceTab() {
  const tabs = `<div class="tabs">${SET_TABS.map(t => `<button class="${(UI.p.tab || '') === t[0] ? 'on' : ''}" data-act="setTab" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>`;
  if (!LICENSED) return tabs + '<div class="card"><div class="bd">Licensing is only available in the desktop edition.</div></div>';
  if (!UI._licFresh) { UI._licFresh = true; BVD.lic.summary().then(s => { UI._lic = s; render(); }); }
  const l = UI._lic; if (!l) return tabs + '<div class="card"><div class="bd">Loading…</div></div>';
  const d = ms => ms ? new Date(ms).toISOString().slice(0, 10).split('-').reverse().join('/') : '—';
  const used = S.users.filter(u => u.status === 'ACTIVE' || u.status === 'INVITED').length;
  const row = (a, b) => `<tr><td class="muted" style="width:210px">${a}</td><td>${b}</td></tr>`;
  const canMng = CAN('users');
  return tabs + `<div class="grid g2"><div class="card"><div class="hd"><h2>Licence</h2><span class="spacer"></span><span class="chip ${l.ok ? 'gold' : ''}">${l.ok ? 'Active' : 'Not valid'}</span></div><div class="bd flush"><table class="t"><tbody>
    ${row('Licensed to', esc(l.customer))}${row('Plan', esc(l.plan))}${row('Licence key', `<span class="mono">${esc(l.key)}</span>`)}
    ${row('Valid until', l.expires ? d(l.expires) + (l.daysToExpiry != null ? ` <span class="faint small">(${l.daysToExpiry} days left)</span>` : '') : 'No expiry')}
    ${row('Users', `${used} of ${l.maxUsers}`)}${row('Computers allowed', l.maxDevices)}${row('This computer', esc(l.machineName))}
    ${row('Last checked online', d(l.issued))}${row('Works offline for', l.graceLeftDays != null ? l.graceLeftDays + ' more day(s)' : '—')}</tbody></table></div></div>
    <div class="card"><div class="hd"><h2>Manage</h2></div><div class="bd" style="display:flex;flex-direction:column;gap:10px">
    <p style="margin:0">The licence is checked online automatically. If you renewed or changed your plan, check now to apply it.</p>
    <div class="row"><button class="btn pri" data-act="licCheck">Check licence now</button></div>
    ${canMng ? `<hr style="border:0;border-top:1px solid var(--line,#eee);width:100%"><p style="margin:0">Moving to another computer? Deactivate this one first so the licence can be used there. Your data stays in the Data folder.</p><div class="row"><button class="btn danger" data-act="licDeactivate">Deactivate this computer</button></div>` : ''}
    </div></div></div>`;
}
(function () { const _b = PAGES.settings.body; PAGES.settings.body = () => (UI.p && UI.p.tab === 'licence') ? accLicenceTab() : _b(); })();
ACT.licCheck = () => accGuard(async () => { toast('Checking…'); const r = await BVD.lic.validate(); if (r.ok) { UI._lic = r.summary; toast('Licence is valid'); render(); } else toast(r.error === 'offline' ? ACC_ERR.offline : 'Licence check failed: ' + r.error, { err: true }); });
ACT.licDeactivate = () => confirmBox('Deactivate this computer', 'The application will close the session and ask for a licence key again. Your company data is not deleted.', 'Deactivate', async () => { closeModal(); const r = await BVD.lic.deactivate(); if (!r.ok) toast(r.error === 'offline' ? ACC_ERR.offline : 'Could not deactivate: ' + r.error, { err: true }); });
