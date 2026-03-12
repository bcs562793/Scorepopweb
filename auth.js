/* ═══════════════════════════════════════════════
   SCOREPOP — auth.js  v2
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
      const name = getDisplayName() || '?';
      btn.innerHTML = `<span class="tb-auth-avatar">${name.slice(0,2).toUpperCase()}</span>`;
      btn.title = name;
    } else {
      btn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="5" r="3" stroke="currentColor" stroke-width="1.3"/>
          <path d="M1 13c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg><span>Giriş</span>`;
      btn.title = 'Giriş Yap / Kayıt Ol';
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
    const ov       = _makeOverlay('sp-auth-overlay');

    ov.innerHTML = `
      <div class="sp-modal sp-profile-modal">
        <div class="sp-modal-hdr">
          <div class="sp-modal-title">👤 Profilim</div>
          <button class="sp-modal-close" onclick="document.getElementById('sp-auth-overlay')?.remove()">✕</button>
        </div>
        <div class="sp-profile-card">
          <div class="sp-profile-avatar">${initials}</div>
          <div>
            <div class="sp-profile-name">${_esc(name)}</div>
            <div class="sp-profile-email">${_esc(email)}</div>
          </div>
        </div>
        <div class="sp-field">
          <label class="sp-lbl">Görünen Ad</label>
          <input type="text" id="sp-profile-nick" class="sp-input" value="${_esc(name)}" maxlength="24"/>
        </div>
        <div id="sp-profile-err" class="sp-err hidden"></div>
        <div id="sp-profile-ok"  class="sp-ok  hidden"></div>
        <button class="sp-submit-btn" id="sp-profile-save">Kaydet</button>
        <div class="sp-divider"></div>
        <button class="sp-logout-btn" id="sp-logout-btn">🚪 Çıkış Yap</button>
      </div>`;

    document.body.appendChild(ov);

    document.getElementById('sp-profile-save').onclick = async () => {
      const n = document.getElementById('sp-profile-nick').value.trim();
      if (n.length < 2) { _showErr('sp-profile-err','En az 2 karakter girin.'); return; }
      const { error } = await _sb.auth.updateUser({ data: { display_name: n } });
      if (error) { _showErr('sp-profile-err', _trErr(error.message)); return; }
      if (_user) _user.user_metadata.display_name = n;
      _updateTopbarBtn();
      /* Forum nickname güncelle */
      try { localStorage.setItem('sp_nick', n); } catch {}
      _showOk('sp-profile-ok','✅ Kaydedildi!');
    };

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
    _setBtnLoad('sp-reg-btn', true, 'Kayıt Ol');
    const { error } = await _sb.auth.signUp({
      email, password: pw,
      options: { data: { display_name: nick } },
    });
    _setBtnLoad('sp-reg-btn', false, 'Kayıt Ol');
    if (error) { _showErr('sp-reg-err', _trErr(error.message)); return; }
    /* Nickname'i localStorage'a da kaydet */
    try { localStorage.setItem('sp_nick', nick); } catch {}
    _showOk('sp-reg-ok','✅ Kayıt başarılı! E-postanı doğrulamayı unutma.');
  }

  async function _doGoogle() {
    await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
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
