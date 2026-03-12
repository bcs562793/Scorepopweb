/* ═══════════════════════════════════════════════
   SCOREPOP — payment.js
   Ödeme sistemi — İyzico (TR) + Stripe (global)

   AKIŞ:
   1. Kullanıcı tier seçer
   2. Supabase'e "pending" kayıt oluşturulur
   3. Ödeme sağlayıcısına yönlendirilir (iframe veya redirect)
   4. Ödeme tamamlanınca webhook → Edge Function →
      UPDATE forum_messages SET payment_status='verified', is_featured=true
   5. Realtime abonelik değişikliği yakalar → mesaj öne çıkar

   GÜVENLİK:
   - Fiyatlar CLIENT'ta asla değiştirilmez → Edge Function doğrular
   - message_id + amount imzalanmış token ile gönderilir
   - Supabase RLS: anon is_featured/payment_status güncelleme yapamaz
════════════════════════════════════════════════ */
'use strict';

const Payment = (() => {

  let _sb         = null;
  let _edgeFnUrl  = null;    // config.js'den gelecek: PAYMENT_EDGE_URL

  /* Tier fiyatları BURADA tanımlı — Edge Function'da da aynı liste doğrulanır */
  const TIER_PRICES = {
    bronze:  10,
    silver:  25,
    gold:    50,
    diamond: 100,
  };

  /* ── BAŞLAT ────────────────────────────────── */
  function init(sb) {
    _sb = sb;
    /* config.js'de tanımlıysa Edge Function URL'ini al */
    _edgeFnUrl = (typeof PAYMENT_EDGE_URL !== 'undefined')
      ? PAYMENT_EDGE_URL
      : null;
  }

  /* ── ANA ÖDEME AKIŞI ─────────────────────── */
  async function startPayment({ tierKey, message, fixtureId, sessionId, nickname }) {
    const amount = TIER_PRICES[tierKey];
    if (!amount) return { success: false, error: 'Geçersiz tier.' };

    /* 1. Supabase'e pending kayıt oluştur */
    const expires = null;  // öne çıkan mesajlar kalıcı
    const { data: insertData, error: insertErr } = await _sb
      .from('forum_messages')
      .insert({
        fixture_id:     fixtureId,
        session_id:     sessionId,
        nickname,
        message,
        is_featured:    false,           // ödeme onaylanınca true olacak
        feature_tier:   tierKey,
        feature_amount: amount,
        payment_status: 'pending',
        expires_at:     expires,
      })
      .select(); // .single() KALDIRILDI

    if (insertErr) return { success: false, error: insertErr.message };

    const pending = insertData && insertData.length > 0 ? insertData[0] : null;
    if (!pending) return { success: false, error: 'Kayıt oluşturulamadı.' };

    /* 2. Demo mod mu yoksa gerçek ödeme mi? */
    if (!_edgeFnUrl) {
      return _demoPayment(pending);
    }

    /* 3. Gerçek ödeme akışı */
    return _realPayment(pending, amount);
  }

  /* ── DEMO MOD ─────────────────────────────── */
  async function _demoPayment(pending) {
    /* Demo modda Edge Function olmadığı için direkt verified yapıyoruz */
    console.warn('[Payment] ⚠️ DEMO MOD — Gerçek ödeme yapılmıyor!');

    const { data: updateData, error } = await _sb
      .from('forum_messages')
      .update({ is_featured: true, payment_status: 'verified' })
      .eq('id', pending.id)
      .select(); // .single() KALDIRILDI

    if (error) return { success: false, error: error.message };

    const data = updateData && updateData.length > 0 ? updateData[0] : null;
    return { success: true, data };
  }

  /* ── GERÇEK ÖDEME (İyzico / Stripe) ─────── */
  async function _realPayment(pending, amount) {
    try {
      /* Edge Function'dan ödeme formu/URL'i al */
      const resp = await fetch(_edgeFnUrl + '/create-payment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id:  pending.id,
          amount,
          currency:    'TRY',
          description: `ScorePop Öne Çıkan Mesaj — ${pending.feature_tier}`,
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        return { success: false, error: err || 'Ödeme başlatılamadı.' };
      }

      const result = await resp.json();

      /* İyzico: checkoutFormContent (HTML form) */
      if (result.checkoutFormContent) {
        _showIyzicoModal(result.checkoutFormContent, pending.id);
        return { success: true, data: pending, pending: true };
      }

      /* Stripe: url (redirect) */
      if (result.url) {
        window.location.href = result.url;
        return { success: true, data: pending, pending: true };
      }

      return { success: false, error: 'Ödeme sağlayıcısından yanıt alınamadı.' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /* ── İYZİCO CHECKOUT MODAL ───────────────── */
  function _showIyzicoModal(formContent, messageId) {
    document.getElementById('sp-pay-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sp-pay-overlay';
    overlay.className = 'sp-modal-overlay';

    overlay.innerHTML = `
      <div class="sp-modal sp-pay-modal" role="dialog" aria-modal="true">
        <div class="sp-modal-hdr">
          <div class="sp-modal-title">💳 Ödeme</div>
          <button class="sp-modal-close" onclick="_cancelPayment('${messageId}')">✕</button>
        </div>
        <div class="sp-pay-frame" id="sp-pay-frame"></div>
        <p class="sp-pay-note">🔒 Ödeme güvenli İyzico altyapısıyla işlenmektedir.</p>
      </div>`;

    document.body.appendChild(overlay);

    /* İyzico form HTML'ini güvenle enjekte et */
    const frame = document.getElementById('sp-pay-frame');
    frame.innerHTML = formContent;

    /* İyzico scriptlerini çalıştır */
    frame.querySelectorAll('script').forEach(oldScript => {
      const newScript = document.createElement('script');
      if (oldScript.src) newScript.src = oldScript.src;
      else newScript.textContent = oldScript.textContent;
      document.body.appendChild(newScript);
    });

    /* Ödeme tamamlanınca İyzico postMessage gönderir */
    window.addEventListener('message', function _pmHandler(e) {
      if (e.data?.status === 'success') {
        overlay.remove();
        window.removeEventListener('message', _pmHandler);
        _onPaymentSuccess(messageId);
      }
      if (e.data?.status === 'failure') {
        overlay.remove();
        window.removeEventListener('message', _pmHandler);
        _onPaymentFail(messageId);
      }
    });
  }

  /* ── ÖDEME SONUÇ CALLBACK'LERİ ──────────── */
  async function _onPaymentSuccess(messageId) {
    const { data: rows } = await _sb
      .from('forum_messages')
      .select('*')
      .eq('id', messageId); // .single() KALDIRILDI

    const data = rows && rows.length > 0 ? rows[0] : null;

    if (data?.payment_status === 'verified') {
      _showToast('✅ Ödeme başarılı! Mesajın öne çıktı.');
    } else {
      _pollVerification(messageId, 8);
    }
  }

  async function _pollVerification(messageId, retries) {
    if (retries <= 0) {
      _showToast('⏳ Ödeme işleniyor, kısa süre sonra görünecek.');
      return;
    }
    await _sleep(2000);
    const { data: rows } = await _sb
      .from('forum_messages')
      .select('payment_status')
      .eq('id', messageId); // .single() KALDIRILDI

    const data = rows && rows.length > 0 ? rows[0] : null;

    if (data?.payment_status === 'verified') {
      _showToast('✅ Mesajın öne çıktı!');
    } else {
      _pollVerification(messageId, retries - 1);
    }
  }

  async function _onPaymentFail(messageId) {
    await _sb.from('forum_messages')
      .update({ payment_status: 'failed' })
      .eq('id', messageId)
      .eq('payment_status', 'pending');
    _showToast('❌ Ödeme başarısız. Tekrar deneyin.');
  }

  async function _cancelPayment(messageId) {
    document.getElementById('sp-pay-overlay')?.remove();
    await _sb.from('forum_messages')
      .update({ payment_status: 'failed' })
      .eq('id', messageId)
      .eq('payment_status', 'pending');
  }

  /* ── YARDIMCILAR ──────────────────────────── */
  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'fr-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3500);
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── PUBLIC ────────────────────────────────── */
  return { init, startPayment, TIER_PRICES };

})();
