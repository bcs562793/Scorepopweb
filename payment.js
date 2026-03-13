/* ═══════════════════════════════════════════════
   SCOREPOP — payment.js  (v4 — Kredi Sistemi)

   ESKİ AKIŞ: Her mesaj → ödeme ekranı → geri dön
   YENİ AKIŞ: Kredi bakiyesi → anlık gönder
              Yetersizse → Kredi Mağazası modal

   PUBLIC API (geriye dönük uyumlu):
     Payment.init(sb)
     Payment.startPayment({ tierKey, message, fixtureId, sessionId, nickname })
       → { success, data }         — kredi yeterliydi
       → { success:false, needsCredits:true, tierKey } — yetersiz
       → { success:false, error }  — başka hata
     Payment.getBalance(sessionId) → number
     Payment.showCreditStore(onClose?) — Kredi Mağazası'nı aç
     Payment.TIER_PRICES            — { bronze:10, silver:25, ... }
════════════════════════════════════════════════ */
'use strict';

const Payment = (() => {

  let _sb        = null;
  let _edgeFnUrl = null;

  /* Tier'ların kredi maliyeti */
  const TIER_PRICES = {
    bronze:  10,
    silver:  25,
    gold:    50,
    diamond: 100,
  };

  /* ─── Kredi paketleri ────────────────────────────
     Shopier ürün linklerini buradan değiştirin:
     Her paketin `url` alanını kendi Shopier ürün
     sayfanızın adresiyle güncelleyin.
  ──────────────────────────────────────────────── */
  const CREDIT_PACKAGES = [
    { key: 'test',    credits: 100,  price: 1,   label: '🧪 Test',   popular: false, bonus: 'Test paketi', url: 'https://www.shopier.com/bizedemiofsayt/45196611' },
    { key: 'starter', credits: 100,  price: 29,  label: 'Başlangıç', popular: false, bonus: null,          url: 'https://www.shopier.com/bizedemiofsayt/45196611' },
    { key: 'popular', credits: 300,  price: 79,  label: 'Popüler',   popular: true,  bonus: '+ 20 bonus',  url: 'https://www.shopier.com/bizedemiofsayt/45196663' },
    { key: 'pro',     credits: 750,  price: 179, label: 'Pro',       popular: false, bonus: '+ 75 bonus',  url: 'https://www.shopier.com/bizedemiofsayt/45196703' },
    { key: 'ultra',   credits: 2000, price: 399, label: 'Ultra',     popular: false, bonus: '+ 300 bonus', url: 'https://www.shopier.com/bizedemiofsayt/45196733' },
  ];

  /* ── BAŞLAT ──────────────────────────────────── */
  function init(sb) {
    _sb        = sb;
    _edgeFnUrl = (typeof PAYMENT_EDGE_URL !== 'undefined' ? PAYMENT_EDGE_URL : null) || window.PAYMENT_EDGE_URL || null;
  }

  /* ── BAKİYE SORGULA ──────────────────────────── */
  async function getBalance(sessionId) {
    if (!_sb || !sessionId) return 0;
    try {
      let userId = null;
      try {
        const { data, error } = await _sb.auth.getUser();
        if (!error) userId = data?.user?.id ?? null;
      } catch {}

      const { data, error } = await _sb.rpc('get_balance', {
        p_session_id: sessionId,
        p_user_id:    userId,
      });

      if (error) {
        console.error('[Payment] get_balance RPC hatası:', error);
        return 0;
      }
      return data ?? 0;
    } catch (ex) {
      console.error('[Payment] getBalance hata:', ex);
      return 0;
    }
  }

  /* ── ANA ÖDEME AKIŞI ─────────────────────────── */
  async function startPayment({ tierKey, message, fixtureId, sessionId, nickname }) {
    const cost = TIER_PRICES[tierKey];
    if (!cost) return { success: false, error: 'Geçersiz tier.' };

    /* 1. Bakiye kontrolü */
    const balance = await getBalance(sessionId);
    if (balance < cost) {
      return { success: false, needsCredits: true, tierKey, balance, cost };
    }

    /* 2. DB'ye pending kayıt oluştur */
    const { data: insertData, error: insertErr } = await _sb
      .from('forum_messages')
      .insert({
        fixture_id:     fixtureId,
        session_id:     sessionId,
        nickname,
        message,
        is_featured:    false,
        feature_tier:   tierKey,
        feature_amount: cost,
        payment_status: 'pending',
        expires_at:     null,
      })
      .select();

    if (insertErr) return { success: false, error: insertErr.message };

    const pending = insertData?.[0];
    if (!pending) return { success: false, error: 'Kayıt oluşturulamadı.' };

    /* 3. Atomik kredi düşme (RPC) */
    let userId = null;
    try {
      const { data } = await _sb.auth.getUser();
      userId = data?.user?.id ?? null;
    } catch {}

    const { data: newBalance, error: rpcErr } = await _sb.rpc('deduct_credits', {
      p_session_id:  sessionId,
      p_amount:      cost,
      p_description: `${tierKey} öne çıkan mesaj`,
      p_fixture_id:  fixtureId,
      p_message_id:  pending.id,
      p_user_id:     userId,
    });

    if (rpcErr || newBalance === -1) {
      try { await _sb.from('forum_messages').delete().eq('id', pending.id); } catch {}
      return { success: false, needsCredits: true, tierKey, balance, cost };
    }

    /* 4. Mesajı verified olarak işaretle */
    const { data: verifiedData, error: updErr } = await _sb
      .from('forum_messages')
      .update({ is_featured: true, payment_status: 'verified' })
      .eq('id', pending.id)
      .select();

    if (updErr) {
      console.warn('[Payment] UPDATE hatası (muhtemelen RLS):', updErr.message);
      return {
        success:    true,
        data:       { ...pending, is_featured: true, payment_status: 'verified' },
        newBalance,
      };
    }

    return {
      success:    true,
      data:       verifiedData?.[0] ?? { ...pending, is_featured: true, payment_status: 'verified' },
      newBalance,
    };
  }

  /* ── KREDİ MAĞAZASI MODAL ────────────────────── */
  function showCreditStore(sessionId, onClose) {
    document.getElementById('sp-credit-store-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sp-credit-store-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,.55);backdrop-filter:blur(4px);
      display:flex;align-items:center;justify-content:center;padding:16px;
    `;
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); if (onClose) onClose(); }
    });

    overlay.innerHTML = `
      <div id="sp-credit-modal" style="
        background:var(--color-background-primary);
        border:1px solid var(--color-border-tertiary);
        border-radius:16px;width:100%;max-width:480px;
        max-height:90vh;overflow-y:auto;padding:24px;
        box-sizing:border-box;
      ">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:18px;font-weight:500;color:var(--color-text-primary)">💎 Kredi Yükle</div>
          <button id="sp-store-close" style="
            background:none;border:none;cursor:pointer;
            font-size:18px;color:var(--color-text-secondary);padding:4px;
          ">✕</button>
        </div>
        <p style="font-size:13px;color:var(--color-text-secondary);margin:0 0 20px;">
          Kredilerle öne çıkan mesajları anında gönder — ödeme ekranı beklemeden.
        </p>

        <div id="sp-balance-bar" style="
          display:flex;align-items:center;gap:8px;padding:10px 14px;
          background:var(--color-background-secondary);border-radius:10px;
          margin-bottom:20px;font-size:13px;
        ">
          <span style="color:var(--color-text-secondary)">Mevcut bakiye:</span>
          <span id="sp-store-balance" style="font-weight:500;color:var(--color-text-primary)">Yükleniyor…</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
          ${CREDIT_PACKAGES.map(pkg => `
            <div class="sp-pkg-card" data-pkg="${pkg.key}" style="
              border:1.5px solid ${pkg.popular ? 'var(--color-border-secondary)' : 'var(--color-border-tertiary)'};
              border-radius:12px;padding:14px 12px;cursor:pointer;position:relative;
              transition:border-color .15s,background .15s;
              background:${pkg.popular ? 'var(--color-background-secondary)' : 'transparent'};
            ">
              ${pkg.popular ? `<div style="
                position:absolute;top:-10px;left:50%;transform:translateX(-50%);
                background:var(--color-text-primary);color:var(--color-background-primary);
                font-size:10px;font-weight:500;padding:2px 8px;border-radius:10px;white-space:nowrap;
              ">EN POPÜLER</div>` : ''}
              <div style="font-weight:500;font-size:15px;color:var(--color-text-primary);margin-bottom:4px;">
                ${pkg.label}
              </div>
              <div style="font-size:22px;font-weight:500;color:var(--color-text-primary);margin-bottom:2px;">
                ${pkg.credits}<span style="font-size:13px;color:var(--color-text-secondary);"> kredi</span>
              </div>
              ${pkg.bonus
                ? `<div style="font-size:11px;color:#3B6D11;margin-bottom:6px;">${pkg.bonus}</div>`
                : '<div style="margin-bottom:6px;height:16px;"></div>'}
              <div style="font-size:18px;font-weight:500;color:var(--color-text-primary);">₺${pkg.price}</div>
            </div>
          `).join('')}
        </div>

        <div style="font-size:12px;color:var(--color-text-secondary);margin-bottom:16px;padding:10px 12px;background:var(--color-background-secondary);border-radius:8px;">
          <div style="font-weight:500;margin-bottom:6px;">Kredi maliyetleri:</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            <span>🥉 Bronz — 10 kredi</span>
            <span>🥈 Gümüş — 25 kredi</span>
            <span>🥇 Altın — 50 kredi</span>
            <span>💎 Elmas — 100 kredi</span>
          </div>
        </div>

        <button id="sp-store-pay-btn" disabled style="
          width:100%;padding:13px;border:none;border-radius:10px;
          background:var(--color-border-secondary);color:var(--color-text-secondary);
          font-size:15px;font-weight:500;cursor:not-allowed;transition:all .15s;
        ">Paket seçin</button>
      </div>`;

    document.body.appendChild(overlay);

    /* Bakiyeyi yükle */
    getBalance(sessionId).then(bal => {
      const el = document.getElementById('sp-store-balance');
      if (el) el.textContent = `${bal} kredi`;
    });

    /* Kapat butonu */
    document.getElementById('sp-store-close').addEventListener('click', () => {
      overlay.remove();
      if (onClose) onClose();
    });

    /* Paket seçimi */
    let selectedPkg = null;
    overlay.querySelectorAll('.sp-pkg-card').forEach(card => {
      card.addEventListener('click', () => {
        overlay.querySelectorAll('.sp-pkg-card').forEach(c => {
          c.style.borderColor = 'var(--color-border-tertiary)';
          c.style.background  = 'transparent';
        });
        card.style.borderColor = '#185FA5';
        card.style.background  = '#E6F1FB';
        selectedPkg = CREDIT_PACKAGES.find(p => p.key === card.dataset.pkg);
        const btn = document.getElementById('sp-store-pay-btn');
        if (btn && selectedPkg) {
          btn.disabled       = false;
          btn.style.cssText += ';background:var(--color-text-primary);color:var(--color-background-primary);cursor:pointer;';
          btn.textContent    = `${selectedPkg.credits} kredi satın al — ₺${selectedPkg.price}`;
        }
      });
    });

    /* Ödeme başlat */
    document.getElementById('sp-store-pay-btn').addEventListener('click', async () => {
      if (!selectedPkg) return;
      overlay.remove();
      await _processCreditPurchase(sessionId, selectedPkg, onClose);
    });
  }

  /* ── KREDİ SATIN ALMA AKIŞI (DİREKT LİNK YÖNLENDİRMESİ) ──────────────────── */
  async function _processCreditPurchase(sessionId, pkg, onClose) {
    if (!pkg.url) {
      _showToast('❌ Bu paket için satın alma linki bulunamadı.');
      return;
    }

    _showToast('⏳ Shopier ödeme sayfasına yönlendiriliyorsunuz…');

    /* Yeni sekmede direkt Shopier ürün linkini aç */
    const win = window.open(pkg.url, '_blank');
    if (!win) {
      _showToast('❌ Popup engellendi, tarayıcı ayarlarını kontrol edin.');
      return;
    }

    _showToast('✅ Ödeme yaptıktan sonra bakiyeniz hesabınıza tanımlanacaktır.');
  }

  /* ── KREDİ YÜKLEME POLLING ───────────────────── */
  async function _pollCreditVerification(sessionId, expectedBalance, retries, onClose) {
    if (retries <= 0) { _showToast('❌ Ödeme doğrulanamadı.'); return; }
    await _sleep(2000);
    const bal = await getBalance(sessionId);
    if (bal >= expectedBalance) {
      _showToast(`✅ ${bal} krediniz yüklendi!`);
      if (onClose) onClose(bal);
    } else {
      _pollCreditVerification(sessionId, expectedBalance, retries - 1, onClose);
    }
  }

  /* ── YARDIMCILAR ─────────────────────────────── */
  function _showToast(msg) {
    const t = document.createElement('div');
    t.className   = 'fr-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 4000);
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── PUBLIC API ──────────────────────────────── */
  return { init, startPayment, getBalance, showCreditStore, TIER_PRICES, CREDIT_PACKAGES };

})();
