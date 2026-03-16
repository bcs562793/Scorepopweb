/* ═══════════════════════════════════════════════
   SCOREPOP — forum.js  (v3.7 — Kompakt Pin)

   DEĞİŞİKLİKLER:
   ✅ Pinned section: Elmas kalıcı, Altın 30s, Gümüş 20s, Bronz 10s
   ✅ Süre dolunca mesaj kronolojik pozisyonuna iner (rengi korunur)
   ✅ Tier sırası: Elmas > Altın > Gümüş > Bronz
   ✅ Maç izolasyonu: fixture_id closure kontrolü
   ✅ Mesaj kayma/üst üste sorunu düzeltildi (cerrahi DOM)
   ✅ Geri sayım göstergesi pinned mesajlarda
   ✅ KREDİ SİSTEMİ: Bakiye kontrolü, anlık gönderim, Kredi Mağazası yönlendirme
   ✅ Giriş yapınca session_id → user_id bağlantısı
   ✅ v3.2: Kompakt pin satırları — tıkla aç, chat asla gömülmez
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
  let _sb              = null;
  let _fixtureId       = null;
  let _channel         = null;
  let _pinnedSlots     = [];
  let _chatMsgs        = [];
  let _lastSent        = 0;
  let _sessionId       = null;
  let _nickname        = null;
  let _isLoading       = false;
  let _pinTimer        = null;
  let _pollTimer       = null;   /* polling fallback zamanlayici */
  let _realtimeOk      = false;  /* gercek zamanli baglanti saglikli mi? */
  let _lastMsgId       = 0;      /* polling: son gorulen mesaj id */
  let _reconnectTimer  = null;
  let _reconnectDelay  = 3000;
  let _ownSessionIds   = new Set();  /* bu kullanıcının tüm session_id'leri */

  /* ── INIT ─────────────────────────────────── */
  function init(sb) {
    _sb        = sb;
    _sessionId = _getOrCreateSession();
    _nickname  = _getStoredNickname();
    /* localStorage'dan önceki session'ları yükle */
    try {
      const stored = localStorage.getItem('sp_own_sessions');
      if (stored) _ownSessionIds = new Set(JSON.parse(stored));
    } catch(e) {}
    _ownSessionIds.add(_sessionId);

    if (typeof Auth !== 'undefined') {
      Auth.onChange(async user => {
        if (!user) return;

        const name = Auth.getDisplayName();
        if (name) {
          _nickname = name;
          try { localStorage.setItem('sp_nick', name); } catch {}
          const el = document.querySelector('.fr-nick-lbl strong');
          if (el) el.textContent = name;
        }

        /* Bu kullanıcıya ait tüm session_id'leri kaydet → isOwn doğru çalışsın */
        try {
          const { data: ownSessions } = await _sb
            .from('user_credits')
            .select('session_id')
            .eq('user_id', user.id);
          if (ownSessions?.length) {
            const ids = ownSessions.map(r => r.session_id).filter(Boolean);
            localStorage.setItem('sp_own_sessions', JSON.stringify(ids));
            _ownSessionIds = new Set(ids);
          }
        } catch(e) {}

        if (user.id && _sessionId && _sb) {
          try {
            await _sb.rpc('add_credits', {
              p_session_id:  _sessionId,
              p_amount:      0,
              p_description: 'session_link',
              p_user_id:     user.id,
            });
          } catch (e) {
            console.warn('[Forum] session bağlama hatası:', e);
          }
        }
      });
    }
  }

  /* ── OPEN / CLOSE ─────────────────────────── */
  function open(fixtureId) {
    _fixtureId      = fixtureId;
    _pinnedSlots    = [];
    _chatMsgs       = [];
    _lastMsgId      = 0;
    _realtimeOk     = false;
    _reconnectDelay = 3000;
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
    _stopPinTimer();
    _stopPolling();
    _renderAll();
    _loadMessages();
    _subscribe();
    _startPolling();
  }

  function close() {
    _stopPinTimer();
    _stopPolling();
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
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

    _refreshPinnedSection();

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

      /* polling icin son gorülen id'yi güncelle */
      const allLoaded = [...(featured || []), ...(regular || [])];
      allLoaded.forEach(msg => { if (msg.id > _lastMsgId) _lastMsgId = msg.id; });

    } catch (e) {
      console.error('[Forum] Yükleme hatasi:', e);
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
    if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }

    const fid = _fixtureId;
    _channel = _sb
      .channel(`forum:${fid}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'forum_messages',
        filter: `fixture_id=eq.${fid}`,
      }, payload => {
        if (_fixtureId !== fid) return;
        _realtimeOk = true;
        _reconnectDelay = 3000;
        /* pending mesajları INSERT'te yoksay (is_featured olsun olmasın) — UPDATE'te yakala */
        if (payload.new.payment_status === 'pending') return;
        _onNewMessage(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'forum_messages',
        filter: `fixture_id=eq.${fid}`,
      }, payload => {
        if (_fixtureId !== fid) return;
        _realtimeOk = true;
        /* featured mesaj verified olunca pin'e ekle, chat'ten temizle */
        if (payload.new.is_featured && payload.new.payment_status === 'verified') {
          const chatIdx = _chatMsgs.findIndex(m => m.id === payload.new.id);
          if (chatIdx >= 0) {
            _chatMsgs.splice(chatIdx, 1);
            document.querySelector(`[data-msg-id="${payload.new.id}"]`)?.remove();
          }
          if (!_pinnedSlots.some(s => s.msg.id === payload.new.id)) {
            _addFeaturedMessage(payload.new);
          }
        }
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          _realtimeOk = true;
          _reconnectDelay = 3000;
          console.log('[Forum] Realtime baglandi.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          _realtimeOk = false;
          console.warn('[Forum] Realtime koptu:', status, err?.message || '');
          _scheduleReconnect(fid);
        }
      });
  }

  function _scheduleReconnect(fid) {
    if (_reconnectTimer) return;  /* zaten bekliyor */
    if (_fixtureId !== fid) return;  /* fixture degisti, gerek yok */
    _reconnectTimer = setTimeout(() => {
      _reconnectTimer = null;
      if (_fixtureId !== fid) return;
      console.log('[Forum] Yeniden baglaniliyor... (delay:', _reconnectDelay, 'ms)');
      _subscribe();
      _reconnectDelay = Math.min(_reconnectDelay * 2, 30000);
    }, _reconnectDelay);
  }

  /* ── POLLING FALLBACK ─────────────────────── */
  /* Realtime calismiyor veya tab arka plandaysa 15sn'de bir yeni mesaj cek */
  function _startPolling() {
    if (_pollTimer) return;
    _pollTimer = setInterval(_pollNewMessages, 3000);
  }

  function _stopPolling() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  }

  async function _pollNewMessages() {
    if (!_fixtureId || !_sb || _isLoading) return;
    /* Her zaman yeni mesajları kontrol et */

    try {
      const query = _sb
        .from('forum_messages')
        .select('*')
        .eq('fixture_id', _fixtureId)
        .order('id', { ascending: true });

      if (_lastMsgId > 0) query.gt('id', _lastMsgId);

      const { data, error } = await query.limit(50);
      if (error || !data?.length) return;

      data.forEach(msg => {
        /* pending featured mesajları için lastMsgId güncelleme — UPDATE sonrası tekrar gelsin */
        if (msg.is_featured && msg.payment_status !== 'verified') return;
        _onNewMessage(msg);
        if (msg.id > _lastMsgId) _lastMsgId = msg.id;
      });
    } catch (e) {
      console.warn('[Forum] Poll hatasi:', e.message);
    }
  }

  function _onNewMessage(msg) {
    if (!msg) return;

    /* polling icin son gorülen id'yi takip et */
    if (msg.id && msg.id > _lastMsgId) _lastMsgId = msg.id;

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
      /* Chat'te pending olarak girmiş olabilir — temizle */
      const ci = _chatMsgs.findIndex(m => m.id === msg.id);
      if (ci >= 0) {
        _chatMsgs.splice(ci, 1);
        document.querySelector(`[data-msg-id="${msg.id}"]`)?.remove();
      }
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
    /* Zaten pin'de varsa tekrar ekleme */
    if (_pinnedSlots.some(s => s.msg.id === msg.id)) return;
    /* Chat'te varsa temizle */
    const chatIdx = _chatMsgs.findIndex(m => m.id === msg.id);
    if (chatIdx >= 0) {
      _chatMsgs.splice(chatIdx, 1);
      document.querySelector(`[data-msg-id="${msg.id}"]`)?.remove();
    }

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

    let balance = 0;
    if (typeof Payment !== 'undefined') {
      balance = await Payment.getBalance(_sessionId);
    }

    console.log('[Forum] bakiye:', balance, 'gereken:', tier.amount);

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

    if (!message || !message.trim()) {
      _showToast('⚠️ Mesaj boş olamaz.');
      return;
    }

    const result = await Payment.startPayment({
      tierKey,
      message: message.trim(),
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

  /* ══════════════════════════════════════════════
     KOMPAKT PİN SİSTEMİ
     ──────────────────────────────────────────────
     • Her pin tek satırda: BADGE + nick + kırpılmış metin + süre
     • Tıklayınca tam metin açılır/kapanır
     • Hepsi görünür — hiçbir mesaj gizlenmez
     • Chat alanı asla gömülmez
  ══════════════════════════════════════════════ */

  /* Kompakt pin satırı — tıkla aç/kapa */
  function _buildPinnedHTML(msg, unpinAt) {
    const tier = TIERS[msg.feature_tier];
    if (!tier) return '';
    const isOwn     = _ownSessionIds.has(msg.session_id) || (msg.user_id && typeof Auth !== "undefined" && Auth.getUser()?.id && msg.user_id === Auth.getUser().id);
    const time      = _fmtTime(msg.created_at);
    const permanent = unpinAt === Infinity;
    const remainMs  = permanent ? 0 : Math.max(0, unpinAt - Date.now());
    const remainS   = Math.ceil(remainMs / 1000);

    const timerHTML = permanent
      ? '<span style="font-size:10px;margin-left:auto;flex-shrink:0;opacity:.7;">📌</span>'
      : `<span class="fr-pin-countdown" data-unpin="${unpinAt}" style="font-size:10px;margin-left:auto;flex-shrink:0;opacity:.7;">${remainS}s</span>`;

    return `
      <div class="fr-pin-slot ${isOwn ? 'fr-own' : ''}"
           data-pin-id="${esc(String(msg.id))}"
           style="
             display:flex;align-items:center;gap:8px;
             padding:6px 12px;margin:2px 8px;border-radius:6px;
             cursor:pointer;font-size:12px;
             background:${tier.bg};
             border:1px solid ${tier.border};
             border-left:3px solid ${tier.color};
             transition:all .15s;
           "
           onclick="this.classList.toggle('fr-pin-open');var b=this.querySelector('.fr-pin-full');if(b)b.style.display=b.style.display==='block'?'none':'block';var t=this.querySelector('.fr-pin-trunc');if(t)t.style.display=t.style.display==='none'?'':'none'">
        <span style="font-size:11px;font-weight:500;color:${tier.color};flex-shrink:0;white-space:nowrap;">${tier.emoji} ${tier.label.toUpperCase()}</span>
        <span style="font-weight:500;font-size:11px;color:var(--color-text-primary);flex-shrink:0;">${esc(msg.nickname)}</span>
        <span class="fr-pin-trunc" style="display:none;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--color-text-secondary);font-size:11px;"></span>
<span class="fr-pin-full" style="flex:1;color:var(--color-text-primary);font-size:12px;line-height:1.4;word-break:break-word;"></span>
        <span style="font-size:10px;color:var(--color-text-tertiary);flex-shrink:0;white-space:nowrap;">${time}</span>
        ${timerHTML}
      </div>`;
  }

  /* Pinned section header + tüm kompakt satırlar */
  function _buildPinnedSectionHTML() {
    if (_pinnedSlots.length === 0) return '';

    let html = `<div style="
      display:flex;align-items:center;padding:4px 12px;
      font-size:11px;color:var(--color-text-secondary);
    ">📌 ${_pinnedSlots.length} sabitlenmiş mesaj</div>`;

    _pinnedSlots.forEach(s => {
      html += _buildPinnedHTML(s.msg, s.unpinAt);
    });

    return html;
  }

  /* Pinned section güncelle */
  function _refreshPinnedSection() {
    const section = document.getElementById('fr-pinned-section');
    if (!section) return;

    if (_pinnedSlots.length === 0) {
      section.style.display = 'none';
      section.innerHTML = '';
      return;
    }

    section.style.display = '';
    section.innerHTML = _buildPinnedSectionHTML();

    /* Mesaj text'lerini güvenli ata */
    _pinnedSlots.forEach(s => {
      const el = section.querySelector(`.fr-pin-slot[data-pin-id="${String(s.msg.id)}"]`);
      if (!el) return;
      const trunc = el.querySelector('.fr-pin-trunc');
      const full  = el.querySelector('.fr-pin-full');
      if (trunc) trunc.textContent = s.msg.message;
      if (full)  full.textContent  = s.msg.message;
    });
  }

  /* ── TAM RENDER ───────────────────────────── */
  function _renderAll() {
    const panel = document.getElementById('d-fr');
    if (!panel) return;

    const WRAP_STYLE = 'display:flex;flex-direction:column;height:500px;overflow:hidden;';
    const LIST_STYLE = 'flex:1;overflow-y:auto;min-height:0;';
    const PIN_STYLE  = 'flex-shrink:0;border-bottom:1px solid rgba(255,255,255,.08);';

    if (_isLoading) {
      panel.innerHTML = `
        <div class="fr-wrap" style="${WRAP_STYLE}">
          <div class="fr-pinned-section" id="fr-pinned-section" style="${PIN_STYLE}display:none;"></div>
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

    const pinnedHTML = _buildPinnedSectionHTML();
    const chatHTML   = _chatMsgs.length
      ? _chatMsgs.map(m => _buildMsgHTML(m)).join('')
      : '<div class="fr-empty">İlk mesajı sen gönder! 🎉</div>';

    const hasPins = _pinnedSlots.length > 0;

    panel.innerHTML = `
      <div class="fr-wrap" style="${WRAP_STYLE}">
        <div class="fr-pinned-section" id="fr-pinned-section" style="${PIN_STYLE}${hasPins ? '' : 'display:none;'}">${pinnedHTML}</div>
        <div class="fr-msg-list" id="fr-msg-list" role="log" aria-live="polite" aria-label="Forum mesajları" style="${LIST_STYLE}">${chatHTML}</div>
        ${_buildInputArea()}
      </div>`;

    /* Text'leri güvenli ata */
    _chatMsgs.forEach(m => {
      const el = panel.querySelector(`[data-msg-id="${String(m.id)}"]`);
      if (el) _setMsgText(el, m.message);
    });
    _pinnedSlots.forEach(s => {
      const el = panel.querySelector(`.fr-pin-slot[data-pin-id="${String(s.msg.id)}"]`);
      if (!el) return;
      const trunc = el.querySelector('.fr-pin-trunc');
      const full  = el.querySelector('.fr-pin-full');
      if (trunc) trunc.textContent = s.msg.message;
      if (full)  full.textContent  = s.msg.message;
    });

    _bindInputEvents();
  }

  /* ── PINNED BÖLME YENİDEN İNŞA ───────────── */
  function _rebuildPinnedDOM() {
    _refreshPinnedSection();
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

  /* ── CHAT MESAJ HTML (renk korunur) ───────── */
  function _buildMsgHTML(msg) {
    const tier  = msg.is_featured && msg.feature_tier ? TIERS[msg.feature_tier] : null;
    const isOwn = _ownSessionIds.has(msg.session_id) || (msg.user_id && typeof Auth !== "undefined" && Auth.getUser()?.id && msg.user_id === Auth.getUser().id);
    const time  = _fmtTime(msg.created_at);

    if (tier) {
      const tierClass = `fr-chat-${msg.feature_tier}`;
  return `
    <div class="fr-msg ${isOwn ? 'fr-own' : ''} ${tierClass}" data-msg-id="${esc(String(msg.id))}"
         style="background:${tier.bg};border-radius:8px;padding:8px 12px;">
      <div class="fr-msg-meta" style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:13px;">${tier.emoji}</span>
        <span class="fr-msg-nick ${isOwn ? 'fr-own-nick' : ''}" style="color:${tier.color};">${esc(msg.nickname)}</span>
        <span class="fr-msg-time">${time}</span>
      </div>
      <div class="fr-msg-body"></div>
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
      // Zero-width ve görünmez karakterler
      .replace(/[\u200B-\u200D\uFEFF\u00AD\u180E]/g, '')
      // RTL/LTR override karakterleri — metin yönü manipülasyonu
      .replace(/[\u202A-\u202E\u2066-\u2069\u206A-\u206F]/g, '')
      // Homoglyph ve özel unicode blokları
      .replace(/[\uFFF0-\uFFFF]/g, '')
      // Çoklu boşluk
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
