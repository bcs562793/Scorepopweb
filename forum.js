/* ═══════════════════════════════════════════════
   SCOREPOP — forum.js  (v1)
   Gerçek zamanlı maç forumu + Öne Çıkan Mesaj (Super Chat)

   MİMARİ:
   ┌─ forum_messages (Supabase tablo)
   │    id, fixture_id, session_id, nickname, message,
   │    is_featured, feature_tier, feature_amount,
   │    payment_status, created_at, expires_at
   │
   ├─ Normal mesaj → expires_at = now + 24h
   └─ Öne çıkan   → expires_at = NULL (kalıcı)

   GÜVENLİK KATMANLARI:
   1. Rate limiting   — 5 saniye/mesaj (client)
   2. Giriş doğrulama — uzunluk + boş kontrol (client + RLS)
   3. XSS önleme      — tüm kullanıcı içeriği textContent ile render
   4. Session yalıtma — anonim UUID, sessionStorage
   5. RLS politikaları — schema.sql'de tanımlı
   6. Ödeme doğrulama — production'da Edge Function gerektirir
════════════════════════════════════════════════ */
'use strict';

const Forum = (() => {

  /* ── SABİTLER ─────────────────────────────── */
  const RATE_LIMIT_MS    = 5000;   // 2 mesaj arası min süre
  const MAX_MSG_LEN      = 280;    // normal mesaj karakter sınırı
  const MAX_FEATURED_LEN = 500;    // öne çıkan mesaj karakter sınırı
  const MAX_NICK_LEN     = 24;
  const PAGE_SIZE        = 60;     // ilk yükleme mesaj sayısı
  const RECENT_LIMIT     = 100;    // realtime tampon üst sınırı

  const TIERS = {
    bronze:  { label: 'Bronz',   emoji: '🥉', amount: 10,  color: '#cd7f32', bg: 'rgba(205,127,50,.12)', border: 'rgba(205,127,50,.35)', pin: false },
    silver:  { label: 'Gümüş',   emoji: '🥈', amount: 25,  color: '#9aa4b2', bg: 'rgba(154,164,178,.10)', border: 'rgba(154,164,178,.4)',  pin: false },
    gold:    { label: 'Altın',   emoji: '🥇', amount: 50,  color: '#f5c518', bg: 'rgba(245,197,24,.10)', border: 'rgba(245,197,24,.45)',  pin: false },
    diamond: { label: 'Elmas',   emoji: '💎', amount: 100, color: '#00d4ff', bg: 'rgba(0,212,255,.10)',  border: 'rgba(0,212,255,.5)',   pin: true  },
  };

  /* ── STATE ────────────────────────────────── */
  let _sb          = null;
  let _fixtureId   = null;
  let _channel     = null;
  let _messages    = [];        // render listesi
  let _lastSent    = 0;         // rate limit
  let _sessionId   = null;
  let _nickname    = null;
  let _isLoading   = false;
  let _pendingPaymentMsg  = null; // ödeme beklenen geçici mesaj

  /* ── INIT ─────────────────────────────────── */
  function init(sb) {
    _sb = sb;
    _sessionId = _getOrCreateSession();
    _nickname  = _getStoredNickname();

    /* Auth giriş/çıkışında nickname'i güncelle */
    if (typeof Auth !== 'undefined') {
      Auth.onChange(user => {
        if (user) {
          const name = Auth.getDisplayName();
          if (name) {
            _nickname = name;
            try { localStorage.setItem('sp_nick', name); } catch {}
            /* Forum paneli açıksa nick bar'ı güncelle */
            const nickEl = document.querySelector('.fr-nick-lbl strong');
            if (nickEl) nickEl.textContent = name;
          }
        }
      });
    }
  }

  /* ── OPEN / CLOSE ─────────────────────────── */
  function open(fixtureId) {
    _fixtureId = fixtureId;
    _messages  = [];
    _renderPanel();
    _loadMessages();
    _subscribe();
  }

  function close() {
    if (_channel) {
      _sb.removeChannel(_channel).catch(() => {});
      _channel = null;
    }
    _fixtureId = null;
    _messages  = [];
  }

  function scrollToBottom() {
    const list = document.getElementById('fr-msg-list');
    if (list) list.scrollTop = list.scrollHeight;
  }

  /* ── SESSION (anonim kimlik) ──────────────── */
  function _getOrCreateSession() {
    try {
      let id = sessionStorage.getItem('sp_session');
      if (!id) {
        id = _uuid();
        sessionStorage.setItem('sp_session', id);
      }
      return id;
    } catch { return _uuid(); }
  }

  function _getStoredNickname() {
    /* Auth giriş yapılmışsa oradan al */
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      const authName = Auth.getDisplayName();
      if (authName) return authName;
    }
    /* localStorage fallback */
    try { return localStorage.getItem('sp_nick') || null; } catch { return null; }
  }

  function _saveNickname(nick) {
    _nickname = nick;
    try { localStorage.setItem('sp_nick', nick); } catch {}
  }

  /* ── MESAJ YÜKLEME ────────────────────────── */
  async function _loadMessages() {
    if (!_fixtureId || !_sb) return;
    _isLoading = true;
    _renderPanel();
    try {
      // Öne çıkan mesajları (kalıcı) ayrı çek
      const { data: featured } = await _sb
        .from('forum_messages')
        .select('*')
        .eq('fixture_id', _fixtureId)
        .eq('is_featured', true)
        .eq('payment_status', 'verified')
        .order('created_at', { ascending: false })
        .limit(20);

      // Normal mesajlar (son 24 saat)
      const { data: regular } = await _sb
        .from('forum_messages')
        .select('*')
        .eq('fixture_id', _fixtureId)
        .eq('is_featured', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(PAGE_SIZE);

      _messages = [
        ...(featured || []).reverse(),  // öne çıkanlar kronolojik
        ...(regular  || []),
      ];
    } catch (e) {
      console.error('[Forum] Yükleme hatası:', e);
    }
    _isLoading = false;
    _renderPanel();
    scrollToBottom();
  }

  /* ── REALTIME ABONELIK ────────────────────── */
  function _subscribe() {
    if (!_fixtureId || !_sb) return;
    if (_channel) { _sb.removeChannel(_channel).catch(() => {}); }

    _channel = _sb
      .channel(`forum:${_fixtureId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'forum_messages',
          filter: `fixture_id=eq.${_fixtureId}`,
        },
        (payload) => _onNewMessage(payload.new)
      )
      .subscribe();
  }

  function _onNewMessage(msg) {
    if (!msg) return;
    // Zaten listede varsa (kendi gönderdiğimiz optimistic render) güncelle
    const idx = _messages.findIndex(m => m.id === msg.id);
    if (idx >= 0) {
      _messages[idx] = msg;
      _rerenderMessage(msg);
      return;
    }
    // Tampon sınırını koru
    if (!msg.is_featured && _messages.filter(m => !m.is_featured).length >= RECENT_LIMIT) {
      _messages = _messages.filter(m => m.is_featured);
    }
    _messages.push(msg);
    _appendMessage(msg);
    scrollToBottom();
  }

  /* ── MESAJ GÖNDER ─────────────────────────── */
  async function _sendMessage() {
    if (!_fixtureId) return;

    const input = document.getElementById('fr-input');
    if (!input) return;
    const raw = input.value;

    /* validasyon */
    const err = _validateMessage(raw, MAX_MSG_LEN);
    if (err) { _showError(err); return; }

    /* nickname kontrolü */
    if (!_nickname) { _showNickModal(() => _sendMessage()); return; }

    /* rate limit */
    const now = Date.now();
    if (now - _lastSent < RATE_LIMIT_MS) {
      _showError(`Lütfen ${Math.ceil((RATE_LIMIT_MS - (now - _lastSent)) / 1000)}s bekleyin.`);
      return;
    }
    _lastSent = now;

    const message = _sanitizeText(raw);
    input.value = '';
    _setBtnLoading(true);

    /* optimistic render */
    const temp = {
      id:          `temp-${Date.now()}`,
      fixture_id:  _fixtureId,
      session_id:  _sessionId,
      nickname:    _nickname,
      message,
      is_featured: false,
      feature_tier:   null,
      feature_amount: 0,
      payment_status: 'none',
      created_at:  new Date().toISOString(),
      _optimistic: true,
    };
    _messages.push(temp);
    _appendMessage(temp);
    scrollToBottom();

    try {
      const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const { data, error } = await _sb.from('forum_messages').insert({
        fixture_id:  _fixtureId,
        session_id:  _sessionId,
        nickname:    _nickname,
        message,
        is_featured: false,
        payment_status: 'none',
        expires_at:  expires,
      }).select(); // <-- .single() BURADAN SİLİNDİ

      if (error) throw error;

      /* temp satırını gerçek id ile güncelle */
      const insertedData = data && data.length > 0 ? data[0] : null;

      const i = _messages.findIndex(m => m.id === temp.id);
      if (i >= 0 && insertedData) {
        _messages[i] = insertedData;
        const el = document.querySelector(`[data-msg-id="${temp.id}"]`);
        if (el) el.dataset.msgId = insertedData.id;
      }
    } catch (e) {
      console.error('[Forum] Gönderim hatası:', e);
      /* optimistic mesajı kaldır */
      _messages = _messages.filter(m => m.id !== temp.id);
      const el = document.querySelector(`[data-msg-id="${temp.id}"]`);
      if (el) el.remove();
      _showError('Mesaj gönderilemedi. Tekrar deneyin.');
      input.value = message;
    } finally {
      _setBtnLoading(false);
    }
  }
  /* ── ÖNE ÇIKAN MESAJ (Super Chat) ─────────── */
  function _showFeaturedModal() {
    if (!_nickname) { _showNickModal(() => _showFeaturedModal()); return; }

    /* mevcut modalı kapat */
    document.getElementById('fr-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fr-modal-overlay';
    overlay.className = 'fr-modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true" aria-label="Öne Çıkan Mesaj">
        <div class="fr-modal-hdr">
          <div class="fr-modal-title">💎 Öne Çıkan Mesaj</div>
          <button class="fr-modal-close" onclick="document.getElementById('fr-modal-overlay').remove()">✕</button>
        </div>
        <p class="fr-modal-sub">Mesajın öne çıksın, uzun süre saklansın!</p>

        <div class="fr-tier-grid" id="fr-tier-grid"></div>

        <div class="fr-modal-input-wrap">
          <textarea
            id="fr-feat-msg"
            class="fr-feat-textarea"
            maxlength="${MAX_FEATURED_LEN}"
            placeholder="Öne çıkan mesajınızı yazın…"
            rows="3"
          ></textarea>
          <div class="fr-feat-count"><span id="fr-feat-cnt">0</span>/${MAX_FEATURED_LEN}</div>
        </div>

        <div id="fr-selected-tier" class="fr-selected-tier hidden"></div>

        <button class="fr-pay-btn" id="fr-pay-btn" disabled>Tier seçin</button>
        <p class="fr-modal-disclaimer">
          ⚠️ Demo mod: Ödeme simüle edilmektedir.
          Prodüksiyonda Supabase Edge Function + ödeme sağlayıcısı entegrasyonu gereklidir.
        </p>
      </div>`;

    document.body.appendChild(overlay);

    /* tier kartlarını doldur */
    const grid = document.getElementById('fr-tier-grid');
    let selectedTier = null;

    Object.entries(TIERS).forEach(([key, tier]) => {
      const card = document.createElement('div');
      card.className = 'fr-tier-card';
      card.innerHTML = `
        <div class="fr-tier-emoji">${tier.emoji}</div>
        <div class="fr-tier-name">${tier.label}</div>
        <div class="fr-tier-price">₺${tier.amount}</div>
        <div class="fr-tier-pin">${tier.pin ? '📌 Sabitlenir' : tier.amount >= 50 ? '⭐ Öne çıkar' : '✨ Vurgulu'}</div>`;
      card.style.setProperty('--tc', tier.color);
      card.addEventListener('click', () => {
        grid.querySelectorAll('.fr-tier-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedTier = key;
        _updatePayBtn(tier, key);
      });
      grid.appendChild(card);
    });

    /* karakter sayacı */
    const textarea = document.getElementById('fr-feat-msg');
    textarea.addEventListener('input', () => {
      document.getElementById('fr-feat-cnt').textContent = textarea.value.length;
    });

    function _updatePayBtn(tier, key) {
      const btn = document.getElementById('fr-pay-btn');
      btn.disabled = false;
      btn.textContent = `${tier.emoji} ₺${tier.amount} öde ve gönder`;
      btn.style.setProperty('--btn-color', tier.color);
      btn.className = 'fr-pay-btn active';
      document.getElementById('fr-selected-tier').classList.remove('hidden');
      document.getElementById('fr-selected-tier').textContent =
        `Seçilen: ${tier.emoji} ${tier.label} — ₺${tier.amount} ${tier.pin ? '(Kalıcı)' : '(Uzun süreli)'}`;
    }

    document.getElementById('fr-pay-btn').addEventListener('click', async () => {
      if (!selectedTier) return;
      const raw = textarea.value;
      const err = _validateMessage(raw, MAX_FEATURED_LEN);
      if (err) { _showError(err); return; }

      overlay.remove();
      await _processFeaturedPayment(selectedTier, _sanitizeText(raw));
    });
  }

  /**
   * Ödeme işlem akışı
   * ─────────────────
   * DEMO MOD:  Anında onaylanır (payment_status = 'verified')
   * PRODUCTION:
   *   1. INSERT ile is_featured=false, payment_status='pending' kayıt oluştur
   *   2. Ödeme sağlayıcısına (İyzico/Stripe) yönlendir
   *   3. Webhook geldiğinde Edge Function:
   *      UPDATE forum_messages SET is_featured=true, payment_status='verified'
   *      WHERE id = <id> (service role ile)
   *   4. RLS: anon kullanıcılar is_featured=true GÜNCELLEYEMEZ
   */
  async function _processFeaturedPayment(tierKey, message) {
    const tier = TIERS[tierKey];
    if (!tier) return;

    /* Öne çıkan mesaj için nickname gerekli ama üyelik zorunlu değil */
    if (!_nickname) { _showNickModal(() => _processFeaturedPayment(tierKey, message)); return; }

    _showToast(`${tier.emoji} Mesajınız gönderiliyor…`);

    try {
      /* Payment modülü varsa kullan (gerçek ödeme akışı) */
      if (typeof Payment !== 'undefined') {
        const result = await Payment.startPayment({
          tierKey,
          message,
          fixtureId:  _fixtureId,
          sessionId:  _sessionId,
          nickname:   _nickname,
        });

        if (!result.success) { _showError(result.error || 'Ödeme başarısız.'); return; }
        if (result.pending)  return;  // ödeme modal'ı açık, callback bekliyor

        /* Demo/doğrudan onay — mesajı öne çıkar */
        _messages.unshift(result.data);
        _prependFeaturedMessage(result.data);
        scrollToBottom();
        _showToast(`${tier.emoji} Mesajınız öne çıktı!`);
        return;
      }

      /* Fallback: Payment modülü yoksa eski davranış */
      // ESKİ KOD:
// const { data, error } = await _sb.from('forum_messages').insert({ ... }).select().single();

// YENİ KOD:
const { data, error } = await _sb.from('forum_messages').insert({
  fixture_id:     _fixtureId,
  session_id:     _sessionId,
  nickname:       _nickname,
  message,
  is_featured:    true,
  feature_tier:   tierKey,
  feature_amount: tier.amount,
  payment_status: 'verified',
  expires_at:     null,
}).select(); // .single() KALDIRILDI

if (error) throw error;

const insertedData = data && data.length > 0 ? data[0] : null;

if (insertedData) {
  _messages.unshift(insertedData);
  _prependFeaturedMessage(insertedData);
  scrollToBottom();
}
_showToast(`${tier.emoji} Mesajınız öne çıktı!`);

    } catch (e) {
      console.error('[Forum] Öne çıkan mesaj hatası:', e);
      _showError('İşlem başarısız. Lütfen tekrar deneyin.');
    }
  }

  /* ── NICKNAME MODAL ───────────────────────── */
  function _showNickModal(callback) {
    document.getElementById('fr-nick-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'fr-nick-overlay';
    overlay.className = 'fr-modal-overlay';

    overlay.innerHTML = `
      <div class="fr-modal fr-nick-modal" role="dialog" aria-modal="true">
        <div class="fr-modal-hdr">
          <div class="fr-modal-title">👤 Kullanıcı Adı Seç</div>
        </div>
        <p class="fr-modal-sub">Forum'u kullanmak için bir takma ad belirle.</p>
        <input
          type="text"
          id="fr-nick-input"
          class="fr-nick-input"
          maxlength="${MAX_NICK_LEN}"
          placeholder="Takma adın…"
          autocomplete="off"
          spellcheck="false"
        />
        <div id="fr-nick-err" class="fr-err hidden"></div>
        <button class="fr-pay-btn active" id="fr-nick-save" style="--btn-color:var(--or)">Kaydet</button>
      </div>`;

    document.body.appendChild(overlay);

    const input = document.getElementById('fr-nick-input');
    const errEl = document.getElementById('fr-nick-err');
    if (_nickname) input.value = _nickname;
    input.focus();

    function _save() {
      const nick = _sanitizeText(input.value.trim());
      if (!nick || nick.length < 2) {
        errEl.textContent = 'En az 2 karakter gir.';
        errEl.classList.remove('hidden');
        return;
      }
      if (nick.length > MAX_NICK_LEN) {
        errEl.textContent = `En fazla ${MAX_NICK_LEN} karakter.`;
        errEl.classList.remove('hidden');
        return;
      }
      _saveNickname(nick);
      overlay.remove();
      if (callback) callback();
    }

    document.getElementById('fr-nick-save').addEventListener('click', _save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') _save(); });
  }

  /* ── RENDER ───────────────────────────────── */
  function _renderPanel() {
    const panel = document.getElementById('d-fr');
    if (!panel) return;

    if (_isLoading) {
      panel.innerHTML = `
        <div class="fr-wrap">
          <div class="fr-msg-list">
            <div class="fr-loading">
              <div class="fr-loading-dot"></div>
              <div class="fr-loading-dot"></div>
              <div class="fr-loading-dot"></div>
            </div>
          </div>
          ${_buildInputArea()}
        </div>`;
      _bindInputEvents();
      return;
    }

    panel.innerHTML = `
      <div class="fr-wrap">
        <div class="fr-msg-list" id="fr-msg-list" role="log" aria-live="polite" aria-label="Forum mesajları">
          ${_messages.length ? _messages.map(m => _buildMessageHTML(m)).join('') : '<div class="fr-empty">İlk mesajı sen gönder! 🎉</div>'}
        </div>
        ${_buildInputArea()}
      </div>`;
    /* innerHTML'den sonra mesaj metinlerini güvenli şekilde set et */
    _messages.forEach(m => {
      const el = panel.querySelector(`[data-msg-id="${String(m.id)}"]`);
      if (el) _setMessageText(el, m.message);
    });
    _bindInputEvents();
  }

  function _buildInputArea() {
    const nick = _nickname || 'Anonim';
    return `
      <div class="fr-input-area">
        <div class="fr-nick-bar">
          <span class="fr-nick-lbl">👤 <strong>${esc(nick)}</strong></span>
          <button class="fr-nick-change" id="fr-nick-btn" title="Adı değiştir">✎ Değiştir</button>
        </div>
        <div class="fr-input-row">
          <textarea
            id="fr-input"
            class="fr-textarea"
            maxlength="${MAX_MSG_LEN}"
            placeholder="Mesajınızı yazın…"
            rows="2"
            aria-label="Mesaj"
          ></textarea>
          <div class="fr-actions">
            <button class="fr-feat-btn" id="fr-feat-btn" title="Öne Çıkan Mesaj Gönder">
              💎 Öne Çık
            </button>
            <button class="fr-send-btn" id="fr-send-btn" aria-label="Gönder">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8L2 2l2 6-2 6 12-6z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="fr-input-meta">
          <span class="fr-char-cnt" id="fr-char-cnt">0/${MAX_MSG_LEN}</span>
          <span class="fr-err hidden" id="fr-inline-err"></span>
        </div>
      </div>`;
  }

  function _bindInputEvents() {
    document.getElementById('fr-send-btn')?.addEventListener('click', _sendMessage);
    document.getElementById('fr-feat-btn')?.addEventListener('click', _showFeaturedModal);
    document.getElementById('fr-nick-btn')?.addEventListener('click', () => _showNickModal());

    const input = document.getElementById('fr-input');
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendMessage();
      }
    });
    input?.addEventListener('input', () => {
      const cnt = document.getElementById('fr-char-cnt');
      if (cnt) cnt.textContent = `${input.value.length}/${MAX_MSG_LEN}`;
    });
  }

  /* ── MESAJ HTML OLUŞTUR ───────────────────── */
  function _buildMessageHTML(msg) {
    const tier = msg.is_featured && msg.feature_tier ? TIERS[msg.feature_tier] : null;
    const isOwn = msg.session_id === _sessionId;
    const time  = _fmtTime(msg.created_at);

    if (tier) {
      return `
        <div class="fr-msg fr-featured fr-tier-${msg.feature_tier} ${isOwn ? 'fr-own' : ''}"
             data-msg-id="${esc(String(msg.id))}"
             style="--tc:${tier.color};--tb:${tier.bg};--tbr:${tier.border}">
          <div class="fr-feat-header">
            <span class="fr-feat-badge">${tier.emoji} ${tier.label}</span>
            ${tier.pin ? '<span class="fr-pin-badge">📌 SABİTLENDİ</span>' : ''}
            <span class="fr-msg-time">${time}</span>
          </div>
          <div class="fr-feat-nick">${esc(msg.nickname)}</div>
          <div class="fr-feat-body"></div>
        </div>`;
    }

    return `
      <div class="fr-msg ${isOwn ? 'fr-own' : ''}" data-msg-id="${esc(String(msg.id))}">
        <div class="fr-msg-meta">
          <span class="fr-msg-nick ${isOwn ? 'fr-own-nick' : ''}">${esc(msg.nickname)}</span>
          <span class="fr-msg-time">${time}</span>
        </div>
        <div class="fr-msg-body"></div>
      </div>`;
  }

  /**
   * DOM'a ekledikten sonra güvenli metin atama
   * (innerHTML kullanmadan XSS'i tamamen engeller)
   */
  function _setMessageText(el, message) {
    const bodyEl = el.querySelector('.fr-msg-body, .fr-feat-body');
    if (bodyEl) bodyEl.textContent = message;   // ← textContent ile 100% güvenli
  }

  function _appendMessage(msg) {
    const list = document.getElementById('fr-msg-list');
    if (!list) return;

    const emptyEl = list.querySelector('.fr-empty');
    if (emptyEl) emptyEl.remove();

    const tmp = document.createElement('div');
    tmp.innerHTML = _buildMessageHTML(msg);
    const el = tmp.firstElementChild;
    list.appendChild(el);
    _setMessageText(el, msg.message);
  }

  function _prependFeaturedMessage(msg) {
    const list = document.getElementById('fr-msg-list');
    if (!list) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = _buildMessageHTML(msg);
    const el = tmp.firstElementChild;
    list.prepend(el);
    _setMessageText(el, msg.message);
  }

  function _rerenderMessage(msg) {
    const el = document.querySelector(`[data-msg-id="${msg.id}"]`);
    if (!el) return;
    _setMessageText(el, msg.message);
  }

  /* ── YARDIMCILAR ──────────────────────────── */
  function _validateMessage(raw, maxLen) {
    if (!raw || !raw.trim()) return 'Mesaj boş olamaz.';
    if (raw.trim().length > maxLen) return `En fazla ${maxLen} karakter.`;
    return null;
  }

  function _sanitizeText(s) {
    return String(s)
      .trim()
      .slice(0, MAX_FEATURED_LEN)
      /* Özel boşluk karakterlerini normalize et */
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      /* Birden fazla boşluğu teke indir */
      .replace(/\s{3,}/g, '  ');
  }

  function _fmtTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  }

  function _showError(msg) {
    const el = document.getElementById('fr-inline-err');
    if (el) {
      el.textContent = msg;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 4000);
    }
  }

  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'fr-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 400);
    }, 3000);
  }

  function _setBtnLoading(loading) {
    const btn = document.getElementById('fr-send-btn');
    if (!btn) return;
    btn.disabled = loading;
    btn.style.opacity = loading ? '.5' : '';
  }

  /* ── UUID ─────────────────────────────────── */
  function _uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* XSS-safe escape (HTML attribute'lar için) */
  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  /* ── PUBLIC API ───────────────────────────── */
  return { init, open, close, scrollToBottom };

})();


const result = await Payment.startPayment({...});
if (!result.success) { _showError(result.error || 'Ödeme başarısız.'); return; }
if (result.pending)  return;

if (result.data) {  // ← null kontrolü
  _messages.unshift(result.data);
  _prependFeaturedMessage(result.data);
  scrollToBottom();
}
_showToast(`${tier.emoji} Mesajınız öne çıktı!`);
