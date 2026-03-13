/* ═══════════════════════════════════════════════
   SCOREPOP — forum.js  (v3 — Kredi Sistemi)

   DEĞİŞİKLİKLER:
   ✅ Pinned section: Elmas kalıcı, Altın 30s, Gümüş 20s, Bronz 10s
   ✅ Süre dolunca mesaj kronolojik pozisyonuna iner (rengi korunur)
   ✅ Tier sırası: Elmas > Altın > Gümüş > Bronz
   ✅ Maç izolasyonu: fixture_id closure kontrolü
   ✅ Mesaj kayma/üst üste sorunu düzeltildi (cerrahi DOM)
   ✅ Geri sayım göstergesi pinned mesajlarda
   ✅ KREDİ SİSTEMİ: Bakiye kontrolü, anlık gönderim, Kredi Mağazası yönlendirme
════════════════════════════════════════════════ */
'use strict';

const Forum = (() => {

  /* ── SABİTLER ─────────────────────────────── */
  const RATE_LIMIT_MS    = 5000;
  const MAX_MSG_LEN      = 280;
  const MAX_FEATURED_LEN = 500;
  const MAX_NICK_LEN     = 24;
  const PAGE_SIZE        = 60;
  const RECENT_LIMIT     = 100;

  const TIERS = {
    bronze:  { label: 'Bronz',  emoji: '🥉', amount: 10,  color: '#cd7f32', bg: 'rgba(205,127,50,.12)', border: 'rgba(205,127,50,.35)', pinDuration: 10000    },
    silver:  { label: 'Gümüş', emoji: '🥈', amount: 25,  color: '#9aa4b2', bg: 'rgba(154,164,178,.10)', border: 'rgba(154,164,178,.4)',  pinDuration: 20000    },
    gold:    { label: 'Altın',  emoji: '🥇', amount: 50,  color: '#f5c518', bg: 'rgba(245,197,24,.10)', border: 'rgba(245,197,24,.45)',  pinDuration: 30000    },
    diamond: { label: 'Elmas',  emoji: '💎', amount: 100, color: '#00d4ff', bg: 'rgba(0,212,255,.10)',  border: 'rgba(0,212,255,.5)',   pinDuration: Infinity },
  };

  const TIER_RANK = { diamond: 0, gold: 1, silver: 2, bronze: 3 };

  /* ── STATE ────────────────────────────────── */
  let _sb          = null;
  let _fixtureId   = null;
  let _channel     = null;
  let _pinnedSlots = [];
  let _chatMsgs    = [];
  let _lastSent    = 0;
  let _sessionId   = null;
  let _nickname    = null;
  let _isLoading   = false;
  let _pinTimer    = null;

  /* ── INIT ─────────────────────────────────── */
  function init(sb) {
    _sb        = sb;
    _sessionId = _getOrCreateSession();
    _nickname  = _getStoredNickname();

    if (typeof Auth !== 'undefined') {
      Auth.onChange(user => {
        if (!user) return;
        const name = Auth.getDisplayName();
        if (name) {
          _nickname = name;
          try { localStorage.setItem('sp_nick', name); } catch {}
          const el = document.querySelector('.fr-nick-lbl strong');
          if (el) el.textContent = name;
        }
      });
    }
  }

  /* ── OPEN / CLOSE ─────────────────────────── */
  function open(fixtureId) {
    _fixtureId   = fixtureId;
    _pinnedSlots = [];
    _chatMsgs    = [];
    _stopPinTimer();
    _renderAll();
    _loadMessages();
    _subscribe();
  }

  function close() {
    _stopPinTimer();
    if (_channel) {
      _sb.removeChannel(_channel).catch(() => {});
      _channel = null;
    }
    _fixtureId   = null;
    _pinnedSlots = [];
    _chatMsgs    = [];
  }

  function scrollToBottom() {
    const list = document.getElementById('fr-msg-list');
    if (list) list.scrollTop = list.scrollHeight;
  }

  /* ── PIN TIMER ────────────────────────────── */
  function _startPinTimer() {
    if (_pinTimer) return;
    _pinTimer = setInterval(_tickPins, 500);
  }

  function _stopPinTimer() {
    if (_pinTimer) { clearInterval(_pinTimer); _pinTimer = null; }
  }

  function _tickPins() {
    const now = Date.now();

    document.querySelectorAll('.fr-pin-countdown[data-unpin]').forEach(el => {
      const unpinAt   = Number(el.dataset.unpin);
      const remaining = Math.max(0, Math.ceil((unpinAt - now) / 1000));
      el.textContent  = `${remaining}s`;
    });

    const expired = _pinnedSlots.filter(s => s.unpinAt !== Infinity && now >= s.unpinAt);
    if (!expired.length) return;

    expired.forEach(slot => {
      _pinnedSlots = _pinnedSlots.filter(s => s !== slot);

      const pinEl = document.querySelector(`.fr-pin-slot[data-pin-id="${CSS.escape(String(slot.msg.id))}"]`);
      if (pinEl) pinEl.remove();

      _insertChronologically(slot.msg);
      _insertChatDOM(slot.msg);
    });

    const section = document.getElementById('fr-pinned-section');
    if (section && _pinnedSlots.length === 0) {
      section.style.cssText = 'flex-shrink:0;display:none;border-bottom:1px solid rgba(255,255,255,.08);';
    }

    if (!_pinnedSlots.some(s => s.unpinAt !== Infinity)) _stopPinTimer();
  }

  /* ── MESAJ YÜKLEME ────────────────────────── */
  async function _loadMessages() {
    if (!_fixtureId || !_sb) return;
    const fid = _fixtureId;
    _isLoading = true;
    _renderAll();

    try {
      const { data: featured } = await _sb
        .from('forum_messages')
        .select('*')
        .eq('fixture_id', fid)
        .eq('is_featured', true)
        .eq('payment_status', 'verified')
        .order('created_at', { ascending: true });

      const { data: regular } = await _sb
        .from('forum_messages')
        .select('*')
        .eq('fixture_id', fid)
        .eq('is_featured', false)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(PAGE_SIZE);

      if (_fixtureId !== fid) return;

      const now = Date.now();

      (featured || []).forEach(msg => {
        const tier = TIERS[msg.feature_tier];
        if (!tier) return;

        if (tier.pinDuration === Infinity) {
          _pinnedSlots.push({ msg, unpinAt: Infinity });
        } else {
          const sentAt  = new Date(msg.created_at).getTime();
          const unpinAt = sentAt + tier.pinDuration;

          if (now < unpinAt) {
            _pinnedSlots.push({ msg, unpinAt });
          } else {
            _insertChronologically(msg);
          }
        }
      });

      (regular || []).forEach(msg => _insertChronologically(msg));

      _sortPinned();

    } catch (e) {
      console.error('[Forum] Yükleme hatası:', e);
    }

    if (_fixtureId !== fid) return;
    _isLoading = false;
    _renderAll();
    scrollToBottom();

    if (_pinnedSlots.some(s => s.unpinAt !== Infinity)) _startPinTimer();
  }

  /* ── REALTIME ─────────────────────────────── */
  function _subscribe() {
    if (!_fixtureId || !_sb) return;
    if (_channel) { _sb.removeChannel(_channel).catch(() => {}); }

    const fid = _fixtureId;
    _channel = _sb
      .channel(`forum:${fid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'forum_messages',
        filter: `fixture_id=eq.${fid}`,
      }, payload => {
        if (_fixtureId !== fid) return;
        _onNewMessage(payload.new);
      })
      .subscribe();
  }

  function _onNewMessage(msg) {
    if (!msg) return;

    if (_pinnedSlots.some(s => s.msg.id === msg.id)) return;
    const chatIdx = _chatMsgs.findIndex(m => m.id === msg.id);

    const tempIdx = _chatMsgs.findIndex(
      m => m._optimistic && m.session_id === _sessionId && m.message === msg.message
    );
    if (tempIdx >= 0) {
      const tempId = _chatMsgs[tempIdx].id;
      _chatMsgs[tempIdx] = msg;
      const el = document.querySelector(`[data-msg-id="${tempId}"]`);
      if (el) {
        el.dataset.msgId = String(msg.id);
        _setMsgText(el, msg.message);
      }
      return;
    }

    if (chatIdx >= 0) return;

    if (msg.is_featured && msg.payment_status === 'verified') {
      _addFeaturedMessage(msg);
      return;
    }

    const regularCount = _chatMsgs.filter(m => !m.is_featured).length;
    if (regularCount >= RECENT_LIMIT) {
      const firstRegIdx = _chatMsgs.findIndex(m => !m.is_featured);
      if (firstRegIdx >= 0) {
        const removed = _chatMsgs.splice(firstRegIdx, 1)[0];
        document.querySelector(`[data-msg-id="${removed.id}"]`)?.remove();
      }
    }
    _chatMsgs.push(msg);
    _appendChatDOM(msg);
    scrollToBottom();
  }

  /* ── FEATURED MESAJ EKLE ──────────────────── */
  function _addFeaturedMessage(msg) {
    const tier = TIERS[msg.feature_tier];
    if (!tier) return;

    const now     = Date.now();
    const sentAt  = new Date(msg.created_at).getTime();
    const unpinAt = tier.pinDuration === Infinity ? Infinity : sentAt + tier.pinDuration;

    if (unpinAt === Infinity || now < unpinAt) {
      _pinnedSlots.push({ msg, unpinAt });
      _sortPinned();
      _rebuildPinnedDOM();
      if (unpinAt !== Infinity) _startPinTimer();
    } else {
      _insertChronologically(msg);
      _insertChatDOM(msg);
      scrollToBottom();
    }
  }

  /* ── MESAJ GÖNDER ─────────────────────────── */
  async function _sendMessage() {
    if (!_fixtureId) return;
    const input = document.getElementById('fr-input');
    if (!input) return;
    const raw = input.value;

    const err = _validateMessage(raw, MAX_MSG_LEN);
    if (err) { _showError(err); return; }

    if (!_nickname) { _showNickModal(() => _sendMessage()); return; }

    const now = Date.now();
    if (now - _lastSent < RATE_LIMIT_MS) {
      _showError(`Lütfen ${Math.ceil((RATE_LIMIT_MS - (now - _lastSent)) / 1000)}s bekleyin.`);
      return;
    }
    _lastSent = now;

    const message = _sanitizeText(raw);
    input.value   = '';
    _setBtnLoading(true);

    const tempId = `temp-${Date.now()}`;
    const temp   = {
      id: tempId, fixture_id: _fixtureId, session_id: _sessionId,
      nickname: _nickname, message, is_featured: false,
      feature_tier: null, feature_amount: 0, payment_status: 'none',
      created_at: new Date().toISOString(), _optimistic: true,
    };
    _chatMsgs.push(temp);
    _appendChatDOM(temp);
    scrollToBottom();

    try {
      const { data, error } = await _sb.from('forum_messages').insert({
        fixture_id: _fixtureId, session_id: _sessionId,
        nickname: _nickname, message, is_featured: false,
        payment_status: 'none',
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      }).select();

      if (error) throw error;

      const inserted = data?.[0] ?? null;
      if (inserted) {
        const i = _chatMsgs.findIndex(m => m.id === tempId);
        if (i >= 0) {
          _chatMsgs[i] = inserted;
          const el = document.querySelector(`[data-msg-id="${tempId}"]`);
          if (el) el.dataset.msgId = String(inserted.id);
        }
      }
    } catch (e) {
      console.error('[Forum] Gönderim hatası:', e);
      _chatMsgs = _chatMsgs.filter(m => m.id !== tempId);
      document.querySelector(`[data-msg-id="${tempId}"]`)?.remove();
      _showError('Mesaj gönderilemedi. Tekrar deneyin.');
      input.value = message;
    } finally {
      _setBtnLoading(false);
    }
  }

  /* ── ÖNE ÇIKAN MODAL ──────────────────────── */
  async function _showFeaturedModal() {
    if (!_nickname) { _showNickModal(() => _showFeaturedModal()); return; }
    document.getElementById('fr-modal-overlay')?.remove();

    /* Bakiyeyi önceden çek — modal açılmadan önce */
    const balance = (typeof Payment !== 'undefined')
      ? await Payment.getBalance(_sessionId)
      : 0;

    const overlay = document.createElement('div');
    overlay.id        = 'fr-modal-overlay';
    overlay.className = 'fr-modal-overlay';
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
      <div class="fr-modal" role="dialog" aria-modal="true" aria-label="Öne Çıkan Mesaj">
        <div class="fr-modal-hdr">
          <div class="fr-modal-title">💎 Öne Çıkan Mesaj</div>
          <button class="fr-modal-close" onclick="document.getElementById('fr-modal-overlay').remove()">✕</button>
        </div>

        <div id="fr-credit-bar" style="
          display:flex;align-items:center;justify-content:space-between;
          padding:8px 12px;margin-bottom:14px;
          background:var(--color-background-secondary);
          border-radius:8px;font-size:13px;
        ">
          <span style="color:var(--color-text-secondary)">
            💳 Bakiye: <strong id="fr-credit-amount" style="color:var(--color-text-primary)">${balance} kredi</strong>
          </span>
          <button id="fr-buy-credits-btn" style="
            background:none;border:1px solid var(--color-border-secondary);
            border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;
            color:var(--color-text-secondary);
          ">+ Kredi Al</button>
        </div>

        <p class="fr-modal-sub">Tier seç, mesajını yaz — anında yayınla!</p>
        <div class="fr-tier-grid" id="fr-tier-grid"></div>

        <div class="fr-modal-input-wrap">
          <textarea id="fr-feat-msg" class="fr-feat-textarea" maxlength="${MAX_FEATURED_LEN}"
            placeholder="Öne çıkan mesajınızı yazın…" rows="3"></textarea>
          <div class="fr-feat-count"><span id="fr-feat-cnt">0</span>/${MAX_FEATURED_LEN}</div>
        </div>

        <div id="fr-selected-tier" class="fr-selected-tier hidden"></div>

        <div id="fr-credit-warn" style="
          display:none;padding:8px 12px;margin-bottom:10px;
          background:var(--color-background-warning,#FAEEDA);
          border-radius:8px;font-size:12px;color:var(--color-text-warning,#854F0B);
        ">
          ⚠️ Bu tier için yeterli krediniz yok.
          <button id="fr-warn-buy-btn" style="
            background:none;border:none;cursor:pointer;
            text-decoration:underline;color:inherit;padding:0;font-size:12px;
          ">Kredi satın al →</button>
        </div>

        <button class="fr-pay-btn" id="fr-pay-btn" disabled>Tier seçin</button>
      </div>`;

    document.body.appendChild(overlay);

    let selectedTier = null;
    const grid = document.getElementById('fr-tier-grid');

    const _refreshUI = (tier) => {
      const cost    = TIERS[tier].amount;
      const canSend = balance >= cost;
      const btn     = document.getElementById('fr-pay-btn');
      const warn    = document.getElementById('fr-credit-warn');
      const t       = TIERS[tier];

      document.getElementById('fr-selected-tier').classList.remove('hidden');
      document.getElementById('fr-selected-tier').textContent =
        `Seçilen: ${t.emoji} ${t.label} — ${cost} kredi`;

      if (canSend) {
        warn.style.display = 'none';
        btn.disabled        = false;
        btn.textContent     = `${t.emoji} ${cost} kredi kullan ve gönder`;
        btn.style.setProperty('--btn-color', t.color);
        btn.className       = 'fr-pay-btn active';
      } else {
        warn.style.display  = '';
        btn.disabled        = true;
        btn.textContent     = `Yetersiz kredi (${cost - balance} eksik)`;
        btn.className       = 'fr-pay-btn';
      }
    };

    Object.entries(TIERS).forEach(([key, tier]) => {
      const cost      = tier.amount;
      const canAfford = balance >= cost;
      const pinLabel  = tier.pinDuration === Infinity
        ? '📌 Kalıcı sabit'
        : `⏱ ${tier.pinDuration / 1000}s sabit`;

      const card = document.createElement('div');
      card.className = 'fr-tier-card' + (canAfford ? '' : ' fr-tier-disabled');
      card.style.setProperty('--tc', tier.color);
      if (!canAfford) card.style.opacity = '.55';

      card.innerHTML = `
        <div class="fr-tier-emoji">${tier.emoji}</div>
        <div class="fr-tier-name">${tier.label}</div>
        <div class="fr-tier-price">${cost} kredi</div>
        <div class="fr-tier-pin">${pinLabel}</div>
        ${!canAfford ? `<div style="font-size:10px;color:var(--color-text-tertiary);margin-top:2px;">Yetersiz bakiye</div>` : ''}`;

      card.addEventListener('click', () => {
        grid.querySelectorAll('.fr-tier-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        selectedTier = key;
        _refreshUI(key);
      });

      grid.appendChild(card);
    });

    document.getElementById('fr-feat-msg').addEventListener('input', function () {
      document.getElementById('fr-feat-cnt').textContent = this.value.length;
    });

    const _openStore = () => {
      overlay.remove();
      if (typeof Payment !== 'undefined') {
        Payment.showCreditStore(_sessionId, (newBalance) => {
          if (newBalance) _showFeaturedModal();
        });
      }
    };
    document.getElementById('fr-buy-credits-btn').addEventListener('click', _openStore);
    document.getElementById('fr-warn-buy-btn')?.addEventListener('click', _openStore);

    document.getElementById('fr-pay-btn').addEventListener('click', async () => {
      if (!selectedTier) return;
      const raw = document.getElementById('fr-feat-msg').value;
      const err = _validateMessage(raw, MAX_FEATURED_LEN);
      if (err) { _showError(err); return; }
      overlay.remove();
      await _processFeaturedPayment(selectedTier, _sanitizeText(raw));
    });
  }

  /* ── ÖNE ÇIKAN MESAJ İŞLE ────────────────── */
async function _processFeaturedPayment(tierKey, message) {
  const tier = TIERS[tierKey];
  if (!tier) return;
  if (!_nickname) { _showNickModal(() => _processFeaturedPayment(tierKey, message)); return; }

  /* Kredi kontrolü — doğrudan Supabase'e sor */
  let balance = 0;
  if (typeof Payment !== 'undefined') {
    balance = await Payment.getBalance(_sessionId);
  }

  console.log('[Forum] bakiye:', balance, 'gereken:', tier.amount); // debug

  if (balance < tier.amount) {
    Payment.showCreditStore(_sessionId, (newBalance) => {
      if (newBalance && newBalance >= tier.amount) {
        _processFeaturedPayment(tierKey, message);
      }
    });
    return;
  }
  

  _showToast(`${tier.emoji} Gönderiliyor…`);

  if (typeof Payment === 'undefined') {
    const { data, error } = await _sb.from('forum_messages').insert({
      fixture_id: _fixtureId, session_id: _sessionId, nickname: _nickname,
      message, is_featured: true, feature_tier: tierKey,
      feature_amount: tier.amount, payment_status: 'verified', expires_at: null,
    }).select();
    if (!error && data?.[0]) {
      _addFeaturedMessage(data[0]);
      _showToast(`${tier.emoji} Mesajınız öne çıktı!`);
    }
    return;
  }

  const result = await Payment.startPayment({
    tierKey,
    message,
    fixtureId: _fixtureId,
    sessionId: _sessionId,
    nickname:  _nickname,
  });

  if (result.success) {
    _addFeaturedMessage(result.data);
    _showToast(`${tier.emoji} Mesajınız öne çıktı! (Kalan: ${result.newBalance ?? '?'} kredi)`);
    const el = document.getElementById('fr-credit-amount');
    if (el && result.newBalance != null) el.textContent = `${result.newBalance} kredi`;
    return;
  }

  /* Hata olursa da mağazaya gönder — direkt hata mesajı gösterme */
  if (typeof Payment !== 'undefined') {
    Payment.showCreditStore(_sessionId, (newBalance) => {
      if (newBalance && newBalance >= tier.amount) {
        _processFeaturedPayment(tierKey, message);
      }
    });
  }
}

  /* ── NICKNAME MODAL ───────────────────────── */
  function _showNickModal(callback) {
    document.getElementById('fr-nick-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id        = 'fr-nick-overlay';
    overlay.className = 'fr-modal-overlay';
    overlay.innerHTML = `
      <div class="fr-modal fr-nick-modal" role="dialog" aria-modal="true">
        <div class="fr-modal-hdr"><div class="fr-modal-title">👤 Kullanıcı Adı Seç</div></div>
        <p class="fr-modal-sub">Forum'u kullanmak için bir takma ad belirle.</p>
        <input type="text" id="fr-nick-input" class="fr-nick-input" maxlength="${MAX_NICK_LEN}"
          placeholder="Takma adın…" autocomplete="off" spellcheck="false"/>
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

  /* ── TAM RENDER ───────────────────────────── */
  function _renderAll() {
    const panel = document.getElementById('d-fr');
    if (!panel) return;

    const WRAP_STYLE        = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
    const LIST_STYLE        = 'flex:1;overflow-y:auto;min-height:0;';
    const PIN_STYLE_HIDDEN  = 'flex-shrink:0;display:none;border-bottom:1px solid rgba(255,255,255,.08);';
    const PIN_STYLE_VISIBLE = 'flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.08);';

    if (_isLoading) {
      panel.innerHTML = `
        <div class="fr-wrap" style="${WRAP_STYLE}">
          <div class="fr-pinned-section" id="fr-pinned-section" style="${PIN_STYLE_HIDDEN}"></div>
          <div class="fr-msg-list" id="fr-msg-list" style="${LIST_STYLE}">
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

    const pinnedHTML = _pinnedSlots.map(s => _buildPinnedHTML(s.msg, s.unpinAt)).join('');
    const chatHTML   = _chatMsgs.length
      ? _chatMsgs.map(m => _buildMsgHTML(m)).join('')
      : '<div class="fr-empty">İlk mesajı sen gönder! 🎉</div>';

    panel.innerHTML = `
      <div class="fr-wrap" style="${WRAP_STYLE}">
        <div class="fr-pinned-section" id="fr-pinned-section" style="${_pinnedSlots.length ? PIN_STYLE_VISIBLE : PIN_STYLE_HIDDEN}">${pinnedHTML}</div>
        <div class="fr-msg-list" id="fr-msg-list" role="log" aria-live="polite" aria-label="Forum mesajları" style="${LIST_STYLE}">${chatHTML}</div>
        ${_buildInputArea()}
      </div>`;

    _chatMsgs.forEach(m => {
      const el = panel.querySelector(`[data-msg-id="${String(m.id)}"]`);
      if (el) _setMsgText(el, m.message);
    });
    _pinnedSlots.forEach(s => {
      const el = panel.querySelector(`.fr-pin-slot[data-pin-id="${String(s.msg.id)}"]`);
      if (el) { const b = el.querySelector('.fr-feat-body'); if (b) b.textContent = s.msg.message; }
    });

    _bindInputEvents();
  }

  /* ── PINNED BÖLME YENİDEN İNŞA ───────────── */
  function _rebuildPinnedDOM() {
    const section = document.getElementById('fr-pinned-section');
    if (!section) { _renderAll(); return; }

    if (_pinnedSlots.length === 0) {
      section.style.cssText = 'flex-shrink:0;display:none;border-bottom:1px solid rgba(255,255,255,.08);';
      section.innerHTML = '';
      return;
    }
    section.style.cssText = 'flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.08);';
    section.innerHTML = '';
    _pinnedSlots.forEach(s => {
      const tmp = document.createElement('div');
      tmp.innerHTML = _buildPinnedHTML(s.msg, s.unpinAt);
      const el = tmp.firstElementChild;
      section.appendChild(el);
      const bodyEl = el.querySelector('.fr-feat-body');
      if (bodyEl) bodyEl.textContent = s.msg.message;
    });
  }

  /* ── CHAT DOM: SONUNA EKLE ────────────────── */
  function _appendChatDOM(msg) {
    const list = document.getElementById('fr-msg-list');
    if (!list) return;
    list.querySelector('.fr-empty')?.remove();
    const tmp = document.createElement('div');
    tmp.innerHTML = _buildMsgHTML(msg);
    const el = tmp.firstElementChild;
    list.appendChild(el);
    _setMsgText(el, msg.message);
  }

  /* ── CHAT DOM: KRONOLOJİK KONUMA EKLE ───── */
  function _insertChatDOM(msg) {
    const list = document.getElementById('fr-msg-list');
    if (!list) return;
    list.querySelector('.fr-empty')?.remove();

    const msgTime = new Date(msg.created_at).getTime();
    const items   = list.querySelectorAll('[data-msg-id]');
    let insertBefore = null;

    for (const item of items) {
      const found = _chatMsgs.find(m => String(m.id) === item.dataset.msgId);
      if (found && new Date(found.created_at).getTime() > msgTime) {
        insertBefore = item;
        break;
      }
    }

    const tmp = document.createElement('div');
    tmp.innerHTML = _buildMsgHTML(msg);
    const el = tmp.firstElementChild;

    if (insertBefore) list.insertBefore(el, insertBefore);
    else              list.appendChild(el);

    _setMsgText(el, msg.message);
  }

  /* ── HTML OLUŞTURUCULARI ──────────────────── */
  function _buildPinnedHTML(msg, unpinAt) {
    const tier      = TIERS[msg.feature_tier];
    if (!tier) return '';
    const isOwn     = msg.session_id === _sessionId;
    const time      = _fmtTime(msg.created_at);
    const permanent = unpinAt === Infinity;
    const remainMs  = permanent ? 0 : Math.max(0, unpinAt - Date.now());
    const remainS   = Math.ceil(remainMs / 1000);

    const boxStyle = `background:${tier.bg};border:1px solid ${tier.border};border-left:3px solid ${tier.color};border-radius:8px;padding:10px 12px;margin:4px 8px;`;
    return `
      <div class="fr-pin-slot fr-tier-${msg.feature_tier} ${isOwn ? 'fr-own' : ''}"
           data-pin-id="${esc(String(msg.id))}"
           style="${boxStyle}--tc:${tier.color};--tb:${tier.bg};--tbr:${tier.border}">
        <div class="fr-feat-header">
          <span class="fr-feat-badge">${tier.emoji} ${tier.label}</span>
          ${permanent
            ? '<span class="fr-pin-badge">📌 SABİTLENDİ</span>'
            : `<span class="fr-pin-countdown" data-countdown-id="${esc(String(msg.id))}" data-unpin="${unpinAt}">${remainS}s</span>`}
          <span class="fr-msg-time">${time}</span>
        </div>
        <div class="fr-feat-nick">${esc(msg.nickname)}</div>
        <div class="fr-feat-body"></div>
      </div>`;
  }

  function _buildMsgHTML(msg) {
    const tier  = msg.is_featured && msg.feature_tier ? TIERS[msg.feature_tier] : null;
    const isOwn = msg.session_id === _sessionId;
    const time  = _fmtTime(msg.created_at);

    if (tier) {
      const boxStyle = `background:${tier.bg};border:1px solid ${tier.border};border-left:3px solid ${tier.color};border-radius:8px;padding:10px 12px;margin:4px 0;`;
      return `
        <div class="fr-msg fr-featured fr-tier-${msg.feature_tier} ${isOwn ? 'fr-own' : ''}"
             data-msg-id="${esc(String(msg.id))}"
             style="${boxStyle}--tc:${tier.color};--tb:${tier.bg};--tbr:${tier.border}">
          <div class="fr-feat-header">
            <span class="fr-feat-badge">${tier.emoji} ${tier.label}</span>
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

  function _buildInputArea() {
    const nick = _nickname || 'Anonim';
    return `
      <div class="fr-input-area">
        <div class="fr-nick-bar">
          <span class="fr-nick-lbl">👤 <strong>${esc(nick)}</strong></span>
          <button class="fr-nick-change" id="fr-nick-btn" title="Adı değiştir">✎ Değiştir</button>
        </div>
        <div class="fr-input-row">
          <textarea id="fr-input" class="fr-textarea" maxlength="${MAX_MSG_LEN}"
            placeholder="Mesajınızı yazın…" rows="2" aria-label="Mesaj"></textarea>
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
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _sendMessage(); }
    });
    input?.addEventListener('input', () => {
      const cnt = document.getElementById('fr-char-cnt');
      if (cnt) cnt.textContent = `${input.value.length}/${MAX_MSG_LEN}`;
    });
  }

  function _setMsgText(el, message) {
    const bodyEl = el.querySelector('.fr-msg-body, .fr-feat-body');
    if (bodyEl) bodyEl.textContent = message;
  }

  /* ── YARDIMCILAR ──────────────────────────── */
  function _sortPinned() {
    _pinnedSlots.sort((a, b) =>
      (TIER_RANK[a.msg.feature_tier] ?? 99) - (TIER_RANK[b.msg.feature_tier] ?? 99)
    );
  }

  function _insertChronologically(msg) {
    const t   = new Date(msg.created_at).getTime();
    const idx = _chatMsgs.findIndex(m => new Date(m.created_at).getTime() > t);
    if (idx === -1) _chatMsgs.push(msg);
    else            _chatMsgs.splice(idx, 0, msg);
  }

  function _getOrCreateSession() {
    try {
      let id = sessionStorage.getItem('sp_session');
      if (!id) { id = _uuid(); sessionStorage.setItem('sp_session', id); }
      return id;
    } catch { return _uuid(); }
  }

  function _getStoredNickname() {
    if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
      const n = Auth.getDisplayName();
      if (n) return n;
    }
    try { return localStorage.getItem('sp_nick') || null; } catch { return null; }
  }

  function _saveNickname(nick) {
    _nickname = nick;
    try { localStorage.setItem('sp_nick', nick); } catch {}
  }

  function _validateMessage(raw, maxLen) {
    if (!raw || !raw.trim()) return 'Mesaj boş olamaz.';
    if (raw.trim().length > maxLen) return `En fazla ${maxLen} karakter.`;
    return null;
  }

  function _sanitizeText(s) {
    return String(s).trim().slice(0, MAX_FEATURED_LEN)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s{3,}/g, '  ');
  }

  function _fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
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
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3000);
  }

  function _setBtnLoading(loading) {
    const btn = document.getElementById('fr-send-btn');
    if (btn) { btn.disabled = loading; btn.style.opacity = loading ? '.5' : ''; }
  }

  function _uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  /* ── PUBLIC API ───────────────────────────── */
  return { init, open, close, scrollToBottom };

})();
