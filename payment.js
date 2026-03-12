/* ═══════════════════════════════════════════════
   SCOREPOP — payment.js
   Ödeme sistemi — Shopier Entegrasyonu

   AKIŞ:
   1. Kullanıcı tier seçer
   2. Supabase'e "pending" (bekliyor) kayıt oluşturulur
   3. Tarayıcıda yeni bir sekme açılır (Pop-up blokerı aşmak için senkron açılır)
   4. Edge Function'dan Shopier HTML formu istenir ve yeni sekmeye basılır
   5. Ana sekme arka planda Supabase'i dinlemeye (poll) başlar
   6. Shopier Webhook işlemi onaylayınca, ana sekme mesajı öne çıkarır.
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
        expires_at:     null,            // öne çıkan mesajlar kalıcı
      })
      .select();

    if (insertErr) return { success: false, error: insertErr.message };

    const pending = insertData && insertData.length > 0 ? insertData[0] : null;
    if (!pending) return { success: false, error: 'Kayıt oluşturulamadı.' };

    /* 2. Demo mod mu yoksa gerçek ödeme mi? */
    if (!_edgeFnUrl) {
      return _demoPayment(pending);
    }

    /* 3. Gerçek ödeme akışı (Shopier) */
    return _realPayment(pending, amount);
  }

  /* ── DEMO MOD ─────────────────────────────── */
  async function _demoPayment(pending) {
    console.warn('[Payment] ⚠️ DEMO MOD — Gerçek ödeme yapılmıyor!');

    const { data: updateData, error } = await _sb
      .from('forum_messages')
      .update({ is_featured: true, payment_status: 'verified' })
      .eq('id', pending.id)
      .select();

    if (error) {
      console.warn('[Payment] UPDATE hatası (muhtemelen RLS):', error.message);
      return {
        success: true,
        data: { ...pending, is_featured: true, payment_status: 'verified' },
      };
    }

    const data = (updateData && updateData.length > 0)
      ? updateData[0]
      : { ...pending, is_featured: true, payment_status: 'verified' };

    return { success: true, data };
  }

  /* ── GERÇEK ÖDEME (Shopier Yeni Sekme) ─────── */
  async function _realPayment(pending, amount) {
    try {
      /* Kritik UX Adımı: Tarayıcıların "Pop-up Engelleyicisini" aşmak için, 
         fetch (asenkron) işleminden HEMEN ÖNCE senkron olarak boş bir sekme açmalıyız. 
      */
      const payWindow = window.open('', '_blank');
      if (!payWindow) {
        return { success: false, error: 'Lütfen tarayıcınızın açılır pencere (pop-up) engelleyicisine izin verin.' };
      }
      
      // Kullanıcıya yeni sekmede geçici bir yükleniyor ekranı göster
      payWindow.document.write(`
        <div style="font-family:sans-serif; text-align:center; padding-top:50px;">
          <h2>Güvenli Ödeme Sayfasına Yönlendiriliyorsunuz...</h2>
          <p>Lütfen bekleyin.</p>
        </div>
      `);

      /* Edge Function'dan Shopier HTML formu (post) isteği yap */
      const resp = await fetch(_edgeFnUrl + '/create-shopier-payment', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id:  pending.id,
          amount,
          currency:    'TRY',
          tier_label:  pending.feature_tier
        }),
      });

      if (!resp.ok) {
        payWindow.close(); // Hata olursa sekmeyi kapat
        const err = await resp.text();
        return { success: false, error: err || 'Ödeme başlatılamadı.' };
      }

      const result = await resp.json();

      /* Shopier'den gelen form HTML'ini yeni sekmeye bas ve otomatik submit et */
      if (result.shopierHTML) {
        payWindow.document.body.innerHTML = result.shopierHTML;
        
        // Ana sekmede kullanıcıyı bilgilendir ve arka planda kontrol etmeye başla
        _showToast('⏳ Ödeme sayfası yeni sekmede açıldı. Bekleniyor...');
        _pollVerification(pending.id, 60); // 60 defa (yaklaşık 2 dk) kontrol et
        
        return { success: true, data: pending, pending: true };
      }

      payWindow.close();
      return { success: false, error: 'Shopier form verisi alınamadı.' };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /* ── ÖDEME SONUÇ KONTROLÜ (Polling) ──────────── */
  async function _pollVerification(messageId, retries) {
    if (retries <= 0) {
      _showToast('❌ Ödeme süresi doldu veya onaylanmadı.');
      return;
    }
    
    // 2 saniyede bir Supabase'i kontrol et
    await _sleep(2000);
    
    const { data: rows } = await _sb
      .from('forum_messages')
      .select('payment_status')
      .eq('id', messageId);

    const data = rows && rows.length > 0 ? rows[0] : null;

    if (data?.payment_status === 'verified') {
      _showToast('✅ Ödeme başarılı! Mesajın anında öne çıktı.');
      // Not: forum.js realtime dinlediği için mesajı DOM'a otomatik ekleyecektir.
    } else if (data?.payment_status === 'failed') {
       _showToast('❌ Ödeme başarısız oldu.');
    } else {
      // Hala pending, tekrar dene
      _pollVerification(messageId, retries - 1);
    }
  }

  /* ── YARDIMCILAR ──────────────────────────── */
  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'fr-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4000);
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── PUBLIC ────────────────────────────────── */
  return { init, startPayment, TIER_PRICES };

})();
