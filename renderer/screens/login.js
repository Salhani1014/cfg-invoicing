// Full-screen login. Hides the rest of the app until a Supabase session
// is established. Default flow is email + password; falls back to a
// 6-digit email OTP for users who don't have a password yet (e.g. Obada
// hasn't signed in via Supabase Auth before).
export async function loginScreen(container, { onSuccess } = {}) {
  container.innerHTML = `
    <!-- Drag region at the top so the window can be moved while the login
         overlay is shown. Electron's titleBarStyle:'hiddenInset' has no
         visible title bar, so without this the user is trapped — the
         inputs below capture all pointer events. -->
    <div style="-webkit-app-region:drag;height:36px;width:100%;position:fixed;top:0;left:0;z-index:0"></div>
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:40px;position:relative;z-index:1">
      <div class="card" style="max-width:420px;width:100%;-webkit-app-region:no-drag">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="font-size:22px;font-weight:700;color:var(--gold);margin-bottom:6px">Sign in</h1>
          <p style="color:var(--text-muted);font-size:13px">CFG Invoicing — admin access</p>
        </div>

        <div id="loginPasswordView">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="loginEmail" placeholder="you@checkmatefinancialgroup.com" autocomplete="username">
          </div>

          <div class="form-group">
            <label class="form-label">Password</label>
            <input type="password" class="form-input" id="loginPassword" placeholder="••••••••" autocomplete="current-password">
          </div>

          <div id="loginError" style="color:var(--red);font-size:13px;margin-bottom:12px;display:none"></div>

          <button class="btn btn-primary" id="loginBtn" style="width:100%">Sign in</button>

          <div style="text-align:center;margin-top:14px;font-size:12px;color:var(--text-muted)">
            Don't have a password / first time? <a href="#" id="useOtpLink" style="color:var(--gold);text-decoration:none">Email me a code</a>
          </div>
        </div>

        <div id="loginOtpView" style="display:none">
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-input" id="otpEmail" placeholder="you@checkmatefinancialgroup.com" autocomplete="username">
          </div>

          <button class="btn btn-ghost" id="sendOtpBtn" style="width:100%;margin-bottom:14px">Send 6-digit code</button>

          <div class="form-group" id="otpCodeGroup" style="display:none">
            <label class="form-label">Code from email</label>
            <input type="text" class="form-input" id="otpToken" placeholder="123456" inputmode="numeric" autocomplete="one-time-code">
          </div>

          <div id="otpError" style="color:var(--red);font-size:13px;margin-bottom:12px;display:none"></div>
          <div id="otpInfo"  style="color:var(--gold);font-size:13px;margin-bottom:12px;display:none"></div>

          <button class="btn btn-primary" id="verifyOtpBtn" style="width:100%;display:none">Verify &amp; sign in</button>

          <div style="text-align:center;margin-top:14px;font-size:12px;color:var(--text-muted)">
            <a href="#" id="usePasswordLink" style="color:var(--gold);text-decoration:none">Back to password sign-in</a>
          </div>
        </div>
      </div>
    </div>
  `;

  const $ = (id) => container.querySelector('#' + id);

  function showError(elId, msg) {
    const el = $(elId);
    el.textContent = msg;
    el.style.display = 'block';
  }
  function clearError(elId) {
    const el = $(elId);
    el.style.display = 'none';
    el.textContent = '';
  }

  $('useOtpLink').addEventListener('click', (e) => {
    e.preventDefault();
    $('loginPasswordView').style.display = 'none';
    $('loginOtpView').style.display = '';
    const seed = $('loginEmail').value.trim();
    if (seed) $('otpEmail').value = seed;
  });

  $('usePasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    $('loginOtpView').style.display = 'none';
    $('loginPasswordView').style.display = '';
  });

  async function doPasswordSignIn() {
    clearError('loginError');
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    if (!email || !password) {
      showError('loginError', 'Email and password are required.');
      return;
    }
    $('loginBtn').disabled = true;
    $('loginBtn').textContent = 'Signing in…';
    try {
      const res = await window.api.auth.signIn(email, password);
      if (!res?.ok) {
        showError('loginError', res?.error || 'Sign-in failed.');
        return;
      }
      if (onSuccess) await onSuccess();
    } finally {
      $('loginBtn').disabled = false;
      $('loginBtn').textContent = 'Sign in';
    }
  }

  $('loginBtn').addEventListener('click', doPasswordSignIn);
  $('loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doPasswordSignIn();
  });
  $('loginEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('loginPassword').focus();
  });

  $('sendOtpBtn').addEventListener('click', async () => {
    clearError('otpError');
    $('otpInfo').style.display = 'none';
    const email = $('otpEmail').value.trim();
    if (!email) {
      showError('otpError', 'Email is required.');
      return;
    }
    $('sendOtpBtn').disabled = true;
    $('sendOtpBtn').textContent = 'Sending…';
    try {
      const res = await window.api.auth.sendOtp(email);
      if (!res?.ok) {
        showError('otpError', res?.error || 'Failed to send code.');
        return;
      }
      $('otpInfo').textContent = 'Code sent. Check your inbox.';
      $('otpInfo').style.display = 'block';
      $('otpCodeGroup').style.display = '';
      $('verifyOtpBtn').style.display = '';
      $('otpToken').focus();
    } finally {
      $('sendOtpBtn').disabled = false;
      $('sendOtpBtn').textContent = 'Resend code';
    }
  });

  async function doVerifyOtp() {
    clearError('otpError');
    const email = $('otpEmail').value.trim();
    const token = $('otpToken').value.trim();
    if (!email || !token) {
      showError('otpError', 'Email and code are required.');
      return;
    }
    $('verifyOtpBtn').disabled = true;
    $('verifyOtpBtn').textContent = 'Verifying…';
    try {
      const res = await window.api.auth.verifyOtp(email, token);
      if (!res?.ok) {
        showError('otpError', res?.error || 'Invalid code.');
        return;
      }
      if (onSuccess) await onSuccess();
    } finally {
      $('verifyOtpBtn').disabled = false;
      $('verifyOtpBtn').textContent = 'Verify & sign in';
    }
  }

  $('verifyOtpBtn').addEventListener('click', doVerifyOtp);
  $('otpToken').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doVerifyOtp();
  });

  $('loginEmail').focus();
}
