/* ═══════════════════════════════════════════════
   SCOREPOP — auth.js  v4.2
   Supabase Auth tabanlı + localStorage fallback
   Sorun giderme: init timing, session cache
════════════════════════════════════════════════ */
'use strict';

const Auth = (() => {

  let _sb   = null;
  let _user = null;
  let _ready = false;
  let _onChangeCbs = [];

  /* ── BAŞLAT ─────────────────────────────────── */
  async function init(sb) {
    _sb = sb;

    /* Supabase şifre sıfırlama linki tıklandığında
       URL'de #access_token=...&type=recovery gelir — yakala */
    const hash = window.location.hash;
    if (hash.includes('type=recovery') && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.slice(1));
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token') || '';
      if (accessToken) {
        try {
          await _sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        } catch(e) { console.warn('[Auth] setSession hatası:', e); }
        /* Hash'i temizle */
        history.replaceState(null, '', window.location.pathname);
        /* Şifre değiştir modalını göster */
        setTimeout(() => _showPasswordChangeModal(), 300);
      }
    }

    try {
      /* Mevcut session'ı al — timeout 5s */
      const sessionResult = await Promise.race([
        _sb.auth.getSession(),
        new Promise(r => setTimeout(() => r({ data: { session: null } }), 5000))
      ]);
      _user = sessionResult?.data?.session?.user ?? null;
    } catch (e) {
      console.warn('[Auth] getSession hatası:', e.message);
      _user = null;
    }

    /* Oturum değişimlerini dinle */
    _sb.auth.onAuthStateChange((event, session) => {
      _user = session?.user ?? null;
      _ready = true;
      _onChangeCbs.forEach(fn => { try { fn(_user); } catch {} });
      _updateTopbarBtn();
    });

    _ready = true;
    _renderTopbarBtn();
    _updateTopbarBtn();
    console.log('[Auth] init tamamlandı — user:', _user?.email || 'yok');
  }

  /* ── HOOK ───────────────────────────────────── */
  function onChange(fn) { _onChangeCbs.push(fn); }

  /* ── DURUM ──────────────────────────────────── */
  function getUser()    { return _user; }
  function isLoggedIn() { return !!_user; }
  function getDisplayName() {
    try {
      const localNick = localStorage.getItem('sp_nick');
      if (localNick && localNick.trim().length > 0) return localNick.trim();
    } catch {}
    return _user?.user_metadata?.display_name
        || _user?.user_metadata?.full_name
        || _user?.email?.split('@')[0]
        || null;
  }

  /* ── TOPBAR BUTONU ──────────────────────────── */
  function _renderTopbarBtn() {
    if (document.getElementById('tb-auth-btn')) return;
    const right = document.querySelector('.tb-right');
    if (!right) return;
    const btn = document.createElement('button');
    btn.id        = 'tb-auth-btn';
    btn.className = 'tb-auth-btn';
    btn.addEventListener('click', () => {
      if (_user) _showProfileModal();
      else       showLoginModal();
    });
    right.prepend(btn);
  }

  function _updateTopbarBtn() {
    const btn = document.getElementById('tb-auth-btn');
    if (!btn) return;
    if (_user) {
      // İsim al — tüm kaynakları dene
      let raw = '';
      try { raw = localStorage.getItem('sp_nick') || ''; } catch {}
      if (!raw) raw = _user?.user_metadata?.display_name || '';
      if (!raw) raw = _user?.user_metadata?.full_name || '';
      if (!raw) raw = _user?.email?.split('@')[0] || '';
      if (!raw) raw = 'KU'; // son çare

      const initials = raw.trim().slice(0, 2).toUpperCase() || '?';
      btn.innerHTML = `<span class="tb-auth-avatar">${initials}</span>`;
      btn.title = raw.trim() || 'Profil';
      btn.classList.add('is-logged-in');
    } else {
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="5" r="3" stroke="currentColor" stroke-width="1.3"/>
          <path d="M1 13c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg><span>Giriş</span>`;
      btn.title = 'Giriş Yap / Kayıt Ol';
      btn.classList.remove('is-logged-in');
    }
  }

  /* ── GİRİŞ / KAYIT MODAL ───────────────────── */
  function showLoginModal(tab = 'login') {
    _closeModal();
    const ov = _makeOverlay('sp-auth-overlay');

    ov.innerHTML = `
      <div class="sp-modal">
        <div class="sp-modal-hdr">
          <div class="sp-modal-logo"><div class="sb-mark" style="width:26px;height:26px;font-size:11px">SP</div></div>
          <button class="sp-modal-close" onclick="document.getElementById('sp-auth-overlay')?.remove()">✕</button>
        </div>

        <div class="sp-auth-tabs">
          <button class="sp-auth-tab ${tab==='login'?'active':''}" data-tab="login">Giriş Yap</button>
          <button class="sp-auth-tab ${tab==='register'?'active':''}" data-tab="register">Kayıt Ol</button>
        </div>

        <!-- GİRİŞ -->
        <div class="sp-auth-panel ${tab==='login'?'active':''}" id="sp-panel-login">
          <div class="sp-field">
            <label class="sp-lbl">E-posta</label>
            <input type="email" id="sp-login-email" class="sp-input" placeholder="ornek@mail.com" autocomplete="email"/>
          </div>
          <div class="sp-field">
            <label class="sp-lbl">Şifre</label>
            <div class="sp-pw-wrap">
              <input type="password" id="sp-login-pw" class="sp-input" placeholder="••••••••" autocomplete="current-password"/>
              <button class="sp-pw-eye" onclick="togglePwVis('sp-login-pw',this)">👁</button>
            </div>
          </div>
          <div id="sp-login-err" class="sp-err hidden"></div>
          <button class="sp-submit-btn" id="sp-login-btn">Giriş Yap</button>
          <div class="sp-divider"><span>veya</span></div>
          <button class="sp-google-btn" id="sp-google-btn">
            <svg width="15" height="15" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 12 24 12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.4 35.4 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.1C9.5 35.5 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C41 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Google ile Devam Et
          </button>
          <p class="sp-forgot"><button onclick="Auth.showResetModal()">Şifremi unuttum</button></p>
        </div>

        <!-- KAYIT -->
        <div class="sp-auth-panel ${tab==='register'?'active':''}" id="sp-panel-register">
          <div class="sp-field">
            <label class="sp-lbl">Kullanıcı Adı <span class="sp-hint">(forumda görünür)</span></label>
            <input type="text" id="sp-reg-nick" class="sp-input" placeholder="Takma adın" maxlength="24" autocomplete="username"/>
          </div>
          <div class="sp-field">
            <label class="sp-lbl">E-posta</label>
            <input type="email" id="sp-reg-email" class="sp-input" placeholder="ornek@mail.com" autocomplete="email"/>
          </div>
          <div class="sp-field">
            <label class="sp-lbl">Şifre <span class="sp-hint">(min. 8 karakter)</span></label>
            <div class="sp-pw-wrap">
              <input type="password" id="sp-reg-pw" class="sp-input" placeholder="••••••••" maxlength="64" autocomplete="new-password"/>
              <button class="sp-pw-eye" onclick="togglePwVis('sp-reg-pw',this)">👁</button>
            </div>
          </div>
          <div id="sp-reg-err" class="sp-err hidden"></div>
          <div id="sp-reg-ok"  class="sp-ok  hidden"></div>
          <button class="sp-submit-btn" id="sp-reg-btn">Kayıt Ol</button>
        </div>
      </div>`;

    document.body.appendChild(ov);
    _bindAuthEvents(ov);
    setTimeout(() => ov.querySelector(`#sp-panel-${tab} .sp-input`)?.focus(), 120);
  }

  /* ── PROFİL MODAL ───────────────────────────── */
  function _showProfileModal() {
  _closeModal();
  const name     = getDisplayName() || 'Kullanıcı';
  const email    = _user?.email || '';
  const initials = name.slice(0,2).toUpperCase();
  const provider = _user?.app_metadata?.provider || 'email';
  const joinDate = _user?.created_at
    ? new Date(_user.created_at).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })
    : '—';
  const ov = _makeOverlay('sp-auth-overlay');

  ov.innerHTML = `
    <div class="sp-modal sp-profile-modal" style="max-width:420px;gap:0;padding:0;overflow:hidden;">

      <!-- Hero banner -->
      <div style="background:linear-gradient(135deg,#1a1f2e 0%,#0f1218 100%);padding:28px 24px 20px;position:relative;">
        <button class="sp-modal-close" onclick="document.getElementById('sp-auth-overlay')?.remove()"
          style="position:absolute;top:14px;right:14px;color:rgba(255,255,255,.45);">✕</button>

        <div style="display:flex;align-items:center;gap:16px;">
          <div style="
            width:58px;height:58px;border-radius:50%;
            background:var(--or);
            display:flex;align-items:center;justify-content:center;
            font-family:'Barlow Condensed',sans-serif;
            font-size:20px;font-weight:800;color:#fff;
            flex-shrink:0;
            border:3px solid rgba(242,100,25,.35);
            box-shadow:0 0 0 6px rgba(242,100,25,.08);
          ">${initials}</div>
          <div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:20px;font-weight:800;color:#fff;letter-spacing:.3px;">${_esc(name)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:3px;">${_esc(email)}</div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:8px;">
              <span style="
                display:inline-flex;align-items:center;gap:5px;
                font-family:'Barlow Condensed',sans-serif;
                font-size:10px;font-weight:700;letter-spacing:1px;
                color:var(--or);background:rgba(242,100,25,.12);
                border:1px solid rgba(242,100,25,.25);
                border-radius:20px;padding:3px 10px;
                text-transform:uppercase;
              ">
                <span style="width:5px;height:5px;border-radius:50%;background:var(--or);display:inline-block;"></span>
                Üye
              </span>
              <span style="
                font-family:'Barlow Condensed',sans-serif;
                font-size:10px;font-weight:700;letter-spacing:.5px;
                color:rgba(255,255,255,.3);text-transform:uppercase;
              ">${provider === 'google' ? '🔵 Google' : '✉️ E-posta'}</span>
            </div>
          </div>
        </div>

        <div style="
          display:grid;grid-template-columns:1fr 1fr 1fr;
          gap:1px;margin-top:20px;
          background:rgba(255,255,255,.06);border-radius:8px;overflow:hidden;
        ">
          <div style="background:rgba(255,255,255,.04);padding:10px 14px;">
            <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Katılım</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:rgba(255,255,255,.7);">${joinDate}</div>
          </div>
          <div style="background:rgba(255,255,255,.04);padding:10px 14px;">
            <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Hesap</div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:var(--green);">Aktif ✓</div>
          </div>
          <div style="background:rgba(255,255,255,.04);padding:10px 14px;">
            <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">💳 Bakiye</div>
            <div id="sp-profile-credit" style="font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:var(--or);">…</div>
          </div>
        </div>
      </div>

      <!-- Form alanı -->
      <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px;">
        <div class="sp-field">
          <label class="sp-lbl" style="display:flex;align-items:center;gap:5px;">
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="5" r="3" stroke="currentColor" stroke-width="1.3"/>
              <path d="M1 13c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            Kullanıcı Adı
          </label>
          <input type="text" id="sp-profile-nick" class="sp-input"
            value="${_esc(name)}" maxlength="24" placeholder="Kullanıcı adın"
            disabled style="opacity:0.5;cursor:not-allowed;"/>
          <span style="font-size:11px;color:var(--tx3);margin-top:4px;display:block;">
            🔒 Kullanıcı adı değiştirilemez.
          </span>
        </div>

        <div style="height:1px;background:var(--b1);"></div>

        <button class="sp-logout-btn" id="sp-logout-btn"
          style="display:flex;align-items:center;justify-content:center;gap:7px;">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M5 7h7M9 4.5l2.5 2.5L9 9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 2H2.5A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          Çıkış Yap
        </button>
      </div>
    </div>`;

  document.body.appendChild(ov);

  /* ── KREDİ BAKİYESİ ─────────────────────────── */
  (async () => {
    const el = document.getElementById('sp-profile-credit');
    if (!el) return;
    try {
      let sid = null;
      try { sid = sessionStorage.getItem('sp_session'); } catch {}
      if (typeof Payment !== 'undefined' && sid) {
        const bal = await Payment.getBalance(sid);
        el.textContent = bal + ' kredi';
      } else {
        el.textContent = '—';
      }
    } catch { el.textContent = '—'; }
  })();

  /* İsim değiştirme devre dışı — sp-profile-save butonu kaldırıldı */

  document.getElementById('sp-logout-btn').onclick = async () => {
    await _sb.auth.signOut();
    ov.remove();
  };
}

  /* ── ŞİFRE SIFIRLAMA ────────────────────────── */
  function showResetModal() {
    _closeModal();
    const ov = _makeOverlay('sp-auth-overlay');
    ov.innerHTML = `
      <div class="sp-modal">
        <div class="sp-modal-hdr">
          <div class="sp-modal-title">🔑 Şifre Sıfırla</div>
          <button class="sp-modal-close" onclick="document.getElementById('sp-auth-overlay')?.remove()">✕</button>
        </div>
        <p class="sp-modal-sub">Sıfırlama bağlantısı e-postana gönderilecek.</p>
        <div class="sp-field">
          <label class="sp-lbl">E-posta</label>
          <input type="email" id="sp-reset-email" class="sp-input" placeholder="ornek@mail.com"/>
        </div>
        <div id="sp-reset-err" class="sp-err hidden"></div>
        <div id="sp-reset-ok"  class="sp-ok  hidden"></div>
        <button class="sp-submit-btn" id="sp-reset-btn">Gönder</button>
      </div>`;
    document.body.appendChild(ov);
    document.getElementById('sp-reset-btn').onclick = async () => {
      const email = document.getElementById('sp-reset-email').value.trim();
      if (!_validEmail(email)) { _showErr('sp-reset-err','Geçerli e-posta girin.'); return; }
      const { error } = await _sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) { _showErr('sp-reset-err', _trErr(error.message)); return; }
      _showOk('sp-reset-ok','📩 E-posta gönderildi. Gelen kutunu kontrol et.');
    };
  }

  /* ── EVENT BINDING ──────────────────────────── */
  function _bindAuthEvents(ov) {
    /* Tab */
    ov.querySelectorAll('.sp-auth-tab').forEach(tab => {
      tab.onclick = () => {
        ov.querySelectorAll('.sp-auth-tab').forEach(t => t.classList.remove('active'));
        ov.querySelectorAll('.sp-auth-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        ov.querySelector(`#sp-panel-${tab.dataset.tab}`)?.classList.add('active');
      };
    });
    /* Enter */
    ov.querySelector('#sp-login-pw')?.addEventListener('keydown', e => { if (e.key==='Enter') _doLogin(); });
    ov.querySelector('#sp-reg-pw')?.addEventListener('keydown',   e => { if (e.key==='Enter') _doRegister(); });
    /* Butonlar */
    document.getElementById('sp-login-btn')?.addEventListener('click',  _doLogin);
    document.getElementById('sp-reg-btn')?.addEventListener('click',    _doRegister);
    document.getElementById('sp-google-btn')?.addEventListener('click', _doGoogle);
  }

  async function _doLogin() {
    const email = document.getElementById('sp-login-email')?.value.trim();
    const pw    = document.getElementById('sp-login-pw')?.value;
    if (!_validEmail(email)) { _showErr('sp-login-err','Geçerli e-posta girin.'); return; }
    if (!pw || pw.length < 6) { _showErr('sp-login-err','Şifre en az 6 karakter.'); return; }
    _setBtnLoad('sp-login-btn', true, 'Giriş Yap');
    const { error } = await _sb.auth.signInWithPassword({ email, password: pw });
    _setBtnLoad('sp-login-btn', false, 'Giriş Yap');
    if (error) { _showErr('sp-login-err', _trErr(error.message)); return; }
    document.getElementById('sp-auth-overlay')?.remove();
  }

  async function _doRegister() {
    const nick  = document.getElementById('sp-reg-nick')?.value.trim();
    const email = document.getElementById('sp-reg-email')?.value.trim();
    const pw    = document.getElementById('sp-reg-pw')?.value;
    if (!nick || nick.length < 2)  { _showErr('sp-reg-err','Kullanıcı adı en az 2 karakter.'); return; }
    if (!_validEmail(email))       { _showErr('sp-reg-err','Geçerli e-posta girin.'); return; }
    if (!pw || pw.length < 8)      { _showErr('sp-reg-err','Şifre en az 8 karakter.'); return; }

    /* Kullanıcı adı benzersizlik kontrolü */
    _setBtnLoad('sp-reg-btn', true, 'Kontrol ediliyor…');
    try {
      const { data: existing } = await _sb
        .from('profiles')
        .select('id')
        .ilike('display_name', nick)
        .limit(1);
      if (existing && existing.length > 0) {
        _setBtnLoad('sp-reg-btn', false, 'Kayıt Ol');
        _showErr('sp-reg-err', 'Bu kullanıcı adı zaten alınmış. Başka bir ad seç.');
        return;
      }
    } catch {}

    _setBtnLoad('sp-reg-btn', true, 'Kayıt Ol');
    const { data, error } = await _sb.auth.signUp({
      email, password: pw,
      options: { data: { display_name: nick } },
    });
    _setBtnLoad('sp-reg-btn', false, 'Kayıt Ol');
    if (error) { _showErr('sp-reg-err', _trErr(error.message)); return; }
    if (!data?.user?.identities || data.user.identities.length === 0) {
      _showErr('sp-reg-err', 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.');
      return;
    }
    try { localStorage.setItem('sp_nick', nick); } catch {}
    _showOk('sp-reg-ok','✅ Kayıt başarılı! E-postanı doğrulamayı unutma.');
  }

  async function _doGoogle() {
    await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
  }

  /* ── ŞİFRE DEĞİŞTİR MODAL (recovery sonrası) ── */
  function _showPasswordChangeModal() {
    _closeModal();
    const ov = _makeOverlay('sp-auth-overlay');
    ov.innerHTML = `
      <div class="sp-modal">
        <div class="sp-modal-hdr">
          <div class="sp-modal-title">🔑 Yeni Şifre Belirle</div>
        </div>
        <p class="sp-modal-sub">Lütfen yeni şifreni gir.</p>
        <div class="sp-field">
          <label class="sp-lbl">Yeni Şifre <span class="sp-hint">(min. 8 karakter)</span></label>
          <div class="sp-pw-wrap">
            <input type="password" id="sp-newpw" class="sp-input" placeholder="••••••••" maxlength="64"/>
            <button class="sp-pw-eye" onclick="togglePwVis('sp-newpw',this)">👁</button>
          </div>
        </div>
        <div class="sp-field">
          <label class="sp-lbl">Şifre Tekrar</label>
          <div class="sp-pw-wrap">
            <input type="password" id="sp-newpw2" class="sp-input" placeholder="••••••••" maxlength="64"/>
            <button class="sp-pw-eye" onclick="togglePwVis('sp-newpw2',this)">👁</button>
          </div>
        </div>
        <div id="sp-newpw-err" class="sp-err hidden"></div>
        <div id="sp-newpw-ok"  class="sp-ok  hidden"></div>
        <button class="sp-submit-btn" id="sp-newpw-btn">Şifremi Güncelle</button>
      </div>`;

    document.body.appendChild(ov);

    document.getElementById('sp-newpw-btn').onclick = async () => {
      const pw  = document.getElementById('sp-newpw').value;
      const pw2 = document.getElementById('sp-newpw2').value;
      if (!pw || pw.length < 8)  { _showErr('sp-newpw-err', 'Şifre en az 8 karakter olmalı.'); return; }
      if (pw !== pw2)            { _showErr('sp-newpw-err', 'Şifreler eşleşmiyor.'); return; }
      const btn = document.getElementById('sp-newpw-btn');
      btn.disabled = true; btn.textContent = 'Güncelleniyor…';
      const { error } = await _sb.auth.updateUser({ password: pw });
      if (error) {
        btn.disabled = false; btn.textContent = 'Şifremi Güncelle';
        _showErr('sp-newpw-err', _trErr(error.message));
        return;
      }
      _showOk('sp-newpw-ok', '✅ Şifren güncellendi! Giriş yapabilirsin.');
      setTimeout(() => ov.remove(), 2000);
    };
  }

  /* ── YARDIMCILAR ────────────────────────────── */
  function _makeOverlay(id) {
    document.getElementById(id)?.remove();
    const ov = document.createElement('div');
    ov.id = id;
    ov.className = 'sp-modal-overlay';
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    return ov;
  }

  function _closeModal() { document.getElementById('sp-auth-overlay')?.remove(); }

  function _validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e||''); }

  function _trErr(msg) {
    const m = msg?.toLowerCase() || '';
    if (m.includes('invalid login'))    return 'E-posta veya şifre yanlış.';
    if (m.includes('not confirmed'))    return 'E-postanı doğrula, sonra giriş yap.';
    if (m.includes('already registered')) return 'Bu e-posta zaten kayıtlı.';
    if (m.includes('password'))         return 'Şifre en az 8 karakter olmalı.';
    if (m.includes('rate limit'))       return 'Çok fazla deneme. Biraz bekle.';
    if (m.includes('user not found'))   return 'Bu e-posta kayıtlı değil.';
    return msg || 'Bir hata oluştu.';
  }

  function _showErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  function _showOk(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function _setBtnLoad(id, loading, label) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? 'Lütfen bekleyin…' : label;
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return {
    init, onChange,
    getUser, isLoggedIn, getDisplayName,
    showLoginModal, showResetModal,
  };

})();

/* Global helpers (HTML onclick için) */
function togglePwVis(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}
