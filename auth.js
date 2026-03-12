/* ═══════════════════════════════════════════════
   SCOREPOP — auth.js
   Supabase Auth tabanlı üyelik sistemi
   • E-posta + şifre kayıt / giriş
   • Google OAuth (opsiyonel)
   • Oturum yönetimi + profil
   • Forum ile entegrasyon (nickname = display_name)
════════════════════════════════════════════════ */
'use strict';

const Auth = (() => {

  let _sb   = null;
  let _user = null;               // mevcut kullanıcı
  let _onChangeCallbacks = [];

  /* ── BAŞLAT ────────────────────────────────── */
  async function init(sb) {
    _sb = sb;

    /* Mevcut oturumu al */
    const { data: { session } } = await _sb.auth.getSession();
    _user = session?.user ?? null;

    /* Oturum değişikliklerini dinle */
    _sb.auth.onAuthStateChange((_event, session) => {
      _user = session?.user ?? null;
      _onChangeCallbacks.forEach(fn => fn(_user));
      _updateUI();
    });

    _renderAuthBtn();
    _updateUI();
  }

  /* ── OTURUM DEĞİŞİKLİĞİ HOOK ─────────────── */
  function onChange(fn) {
    _onChangeCallbacks.push(fn);
  }

  /* ── MEVCUT KULLANICI ─────────────────────── */
  function getUser()     { return _user; }
  function isLoggedIn()  { return !!_user; }
  function getDisplayName() {
    return _user?.user_metadata?.display_name
        || _user?.user_metadata?.full_name
        || _user?.email?.split('@')[0]
        || null;
  }

  /* ── TOPBAR AUTH BUTONU ───────────────────── */
  function _renderAuthBtn() {
    const right = document.querySelector('.tb-right');
    if (!right) return;

    /* Daha önce eklendiyse tekrar ekleme */
    if (document.getElementById('tb-auth-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'tb-auth-btn';
    btn.className = 'tb-auth-btn';
    btn.addEventListener('click', () => {
      if (_user) _showProfileModal();
      else       showLoginModal();
    });
    right.prepend(btn);
  }

  function _updateUI() {
    const btn = document.getElementById('tb-auth-btn');
    if (!btn) return;

    if (_user) {
      const name = getDisplayName();
      const initials = name ? name.slice(0,2).toUpperCase() : '?';
      btn.innerHTML = `<span class="tb-auth-avatar">${initials}</span>`;
      btn.title = name || _user.email;
    } else {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="5" r="3" stroke="currentColor" stroke-width="1.3"/>
          <path d="M1 13c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        <span>Giriş</span>`;
      btn.title = 'Giriş Yap / Kayıt Ol';
    }
  }

  /* ── GİRİŞ / KAYIT MODAL ─────────────────── */
  function showLoginModal(defaultTab = 'login') {
    document.getElementById('sp-auth-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sp-auth-overlay';
    overlay.className = 'sp-modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
      <div class="sp-modal" role="dialog" aria-modal="true" aria-label="Giriş / Kayıt">
        <div class="sp-modal-hdr">
          <div class="sp-modal-logo"><div class="sb-mark" style="width:28px;height:28px;font-size:12px">SP</div></div>
          <button class="sp-modal-close" onclick="document.getElementById('sp-auth-overlay').remove()">✕</button>
        </div>

        <div class="sp-auth-tabs">
          <button class="sp-auth-tab ${defaultTab==='login'?'active':''}"  data-tab="login">Giriş Yap</button>
          <button class="sp-auth-tab ${defaultTab==='register'?'active':''}" data-tab="register">Kayıt Ol</button>
        </div>

        <!-- GİRİŞ FORMU -->
        <div class="sp-auth-panel ${defaultTab==='login'?'active':''}" id="sp-panel-login">
          <div class="sp-field">
            <label class="sp-lbl">E-posta</label>
            <input type="email" id="sp-login-email" class="sp-input" placeholder="ornek@mail.com" autocomplete="email"/>
          </div>
          <div class="sp-field">
            <label class="sp-lbl">Şifre</label>
            <div class="sp-pw-wrap">
              <input type="password" id="sp-login-pw" class="sp-input" placeholder="••••••••" autocomplete="current-password"/>
              <button class="sp-pw-eye" onclick="togglePw('sp-login-pw',this)">👁</button>
            </div>
          </div>
          <div id="sp-login-err" class="sp-err hidden"></div>
          <button class="sp-submit-btn" id="sp-login-btn">Giriş Yap</button>
          <div class="sp-divider"><span>veya</span></div>
          <button class="sp-google-btn" id="sp-google-login">
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 12 24 12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.4 35.4 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.1C9.5 35.5 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C41 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Google ile Devam Et
          </button>
          <p class="sp-forgot"><button onclick="Auth.showResetModal()">Şifremi unuttum</button></p>
        </div>

        <!-- KAYIT FORMU -->
        <div class="sp-auth-panel ${defaultTab==='register'?'active':''}" id="sp-panel-register">
          <div class="sp-field">
            <label class="sp-lbl">Kullanıcı Adı</label>
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
              <button class="sp-pw-eye" onclick="togglePw('sp-reg-pw',this)">👁</button>
            </div>
          </div>
          <div id="sp-reg-err"  class="sp-err hidden"></div>
          <div id="sp-reg-ok"   class="sp-ok  hidden"></div>
          <button class="sp-submit-btn" id="sp-reg-btn">Kayıt Ol</button>
          <div class="sp-divider"><span>veya</span></div>
          <button class="sp-google-btn" id="sp-google-reg">
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 12 24 12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.4 35.4 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8H6.1C9.5 35.5 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.2C41 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
            Google ile Devam Et
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    _bindAuthEvents(overlay);

    /* İlk input'a odaklan */
    setTimeout(() => {
      const first = overlay.querySelector(`#sp-panel-${defaultTab} .sp-input`);
      first?.focus();
    }, 120);
  }

  /* ── PROFİL MODAL ─────────────────────────── */
  function _showProfileModal() {
    document.getElementById('sp-auth-overlay')?.remove();

    const name  = getDisplayName();
    const email = _user?.email || '';
    const initials = name ? name.slice(0,2).toUpperCase() : '?';

    const overlay = document.createElement('div');
    overlay.id = 'sp-auth-overlay';
    overlay.className = 'sp-modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
      <div class="sp-modal sp-profile-modal" role="dialog" aria-modal="true">
        <div class="sp-modal-hdr">
          <div class="sp-modal-title">👤 Profilim</div>
          <button class="sp-modal-close" onclick="document.getElementById('sp-auth-overlay').remove()">✕</button>
        </div>
        <div class="sp-profile-card">
          <div class="sp-profile-avatar">${initials}</div>
          <div>
            <div class="sp-profile-name">${_escHtml(name || 'Kullanıcı')}</div>
            <div class="sp-profile-email">${_escHtml(email)}</div>
          </div>
        </div>
        <div class="sp-field">
          <label class="sp-lbl">Görünen Ad</label>
          <input type="text" id="sp-profile-nick" class="sp-input" value="${_escHtml(name||'')}" maxlength="24"/>
        </div>
        <div id="sp-profile-err" class="sp-err hidden"></div>
        <div id="sp-profile-ok"  class="sp-ok  hidden"></div>
        <button class="sp-submit-btn" id="sp-profile-save">Kaydet</button>
        <div class="sp-divider"></div>
        <button class="sp-logout-btn" id="sp-logout-btn">🚪 Çıkış Yap</button>
      </div>`;

    document.body.appendChild(overlay);

    document.getElementById('sp-profile-save').addEventListener('click', async () => {
      const newName = document.getElementById('sp-profile-nick').value.trim();
      if (!newName || newName.length < 2) {
        _showModalErr('sp-profile-err', 'En az 2 karakter girin.');
        return;
      }
      const { error } = await _sb.auth.updateUser({
        data: { display_name: newName }
      });
      if (error) { _showModalErr('sp-profile-err', error.message); return; }
      _user.user_metadata.display_name = newName;
      _updateUI();
      _showModalOk('sp-profile-ok', 'Kaydedildi!');
    });

    document.getElementById('sp-logout-btn').addEventListener('click', async () => {
      await _sb.auth.signOut();
      overlay.remove();
    });
  }

  /* ── ŞİFRE SIFIRLAMA ─────────────────────── */
  function showResetModal() {
    document.getElementById('sp-auth-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sp-auth-overlay';
    overlay.className = 'sp-modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
      <div class="sp-modal" role="dialog" aria-modal="true">
        <div class="sp-modal-hdr">
          <div class="sp-modal-title">🔑 Şifre Sıfırla</div>
          <button class="sp-modal-close" onclick="document.getElementById('sp-auth-overlay').remove()">✕</button>
        </div>
        <p class="sp-modal-sub">E-posta adresine sıfırlama bağlantısı göndereceğiz.</p>
        <div class="sp-field">
          <label class="sp-lbl">E-posta</label>
          <input type="email" id="sp-reset-email" class="sp-input" placeholder="ornek@mail.com"/>
        </div>
        <div id="sp-reset-err" class="sp-err hidden"></div>
        <div id="sp-reset-ok"  class="sp-ok  hidden"></div>
        <button class="sp-submit-btn" id="sp-reset-btn">Gönder</button>
      </div>`;

    document.body.appendChild(overlay);

    document.getElementById('sp-reset-btn').addEventListener('click', async () => {
      const email = document.getElementById('sp-reset-email').value.trim();
      if (!_validEmail(email)) { _showModalErr('sp-reset-err', 'Geçerli e-posta girin.'); return; }
      const { error } = await _sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + window.location.pathname,
      });
      if (error) { _showModalErr('sp-reset-err', error.message); return; }
      _showModalOk('sp-reset-ok', 'Sıfırlama bağlantısı gönderildi. E-postanı kontrol et.');
    });
  }

  /* ── AUTH EVENT BINDING ───────────────────── */
  function _bindAuthEvents(overlay) {
    /* Tab geçişi */
    overlay.querySelectorAll('.sp-auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        overlay.querySelectorAll('.sp-auth-tab').forEach(t => t.classList.remove('active'));
        overlay.querySelectorAll('.sp-auth-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        overlay.querySelector(`#sp-panel-${tab.dataset.tab}`)?.classList.add('active');
      });
    });

    /* Enter tuşu */
    overlay.querySelector('#sp-login-pw')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') _doLogin();
    });
    overlay.querySelector('#sp-reg-pw')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') _doRegister();
    });

    /* Butonlar */
    document.getElementById('sp-login-btn')?.addEventListener('click', _doLogin);
    document.getElementById('sp-reg-btn')?.addEventListener('click', _doRegister);
    document.getElementById('sp-google-login')?.addEventListener('click', _doGoogle);
    document.getElementById('sp-google-reg')?.addEventListener('click', _doGoogle);
  }

  /* ── GİRİŞ ────────────────────────────────── */
  async function _doLogin() {
    const email = document.getElementById('sp-login-email')?.value.trim();
    const pw    = document.getElementById('sp-login-pw')?.value;
    const errId = 'sp-login-err';

    if (!_validEmail(email)) { _showModalErr(errId, 'Geçerli e-posta girin.'); return; }
    if (!pw || pw.length < 6) { _showModalErr(errId, 'Şifre en az 6 karakter.'); return; }

    _setBtnLoading('sp-login-btn', true);
    const { error } = await _sb.auth.signInWithPassword({ email, password: pw });
    _setBtnLoading('sp-login-btn', false);

    if (error) { _showModalErr(errId, _trError(error.message)); return; }
    document.getElementById('sp-auth-overlay')?.remove();
  }

  /* ── KAYIT ────────────────────────────────── */
  async function _doRegister() {
    const nick  = document.getElementById('sp-reg-nick')?.value.trim();
    const email = document.getElementById('sp-reg-email')?.value.trim();
    const pw    = document.getElementById('sp-reg-pw')?.value;
    const errId = 'sp-reg-err';

    if (!nick || nick.length < 2)  { _showModalErr(errId, 'Kullanıcı adı en az 2 karakter.'); return; }
    if (nick.length > 24)          { _showModalErr(errId, 'Kullanıcı adı en fazla 24 karakter.'); return; }
    if (!_validEmail(email))       { _showModalErr(errId, 'Geçerli e-posta girin.'); return; }
    if (!pw || pw.length < 8)      { _showModalErr(errId, 'Şifre en az 8 karakter.'); return; }

    _setBtnLoading('sp-reg-btn', true);
    const { error } = await _sb.auth.signUp({
      email,
      password: pw,
      options: { data: { display_name: nick } },
    });
    _setBtnLoading('sp-reg-btn', false);

    if (error) { _showModalErr(errId, _trError(error.message)); return; }
    _showModalOk('sp-reg-ok', '✅ Kayıt başarılı! E-postanı doğrulamayı unutma.');
  }

  /* ── GOOGLE ────────────────────────────────── */
  async function _doGoogle() {
    await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
  }

  /* ── YARDIMCILAR ──────────────────────────── */
  function _validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
  }

  function _trError(msg) {
    const map = {
      'Invalid login credentials':    'E-posta veya şifre yanlış.',
      'Email not confirmed':           'E-postanı doğrula, sonra giriş yap.',
      'User already registered':       'Bu e-posta zaten kayıtlı.',
      'Password should be at least':   'Şifre en az 8 karakter olmalı.',
      'rate limit':                    'Çok fazla deneme. Lütfen bekle.',
    };
    for (const [k, v] of Object.entries(map)) {
      if (msg?.toLowerCase().includes(k.toLowerCase())) return v;
    }
    return msg || 'Bir hata oluştu.';
  }

  function _showModalErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  function _showModalOk(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function _setBtnLoading(id, loading) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled   = loading;
    btn.textContent = loading ? 'Lütfen bekleyin…' : (id.includes('login') ? 'Giriş Yap' : 'Kayıt Ol');
  }

  function _escHtml(s) {
    return String(s || '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── PUBLIC ────────────────────────────────── */
  return {
    init, onChange,
    getUser, isLoggedIn, getDisplayName,
    showLoginModal, showResetModal,
  };

})();

/* Global yardımcılar (HTML onclick için) */
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}
