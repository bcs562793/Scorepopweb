/* ═══════════════════════════════════════════════
   SCOREPOP — indexing.js  v1.0
   Canlı maç sayfaları için anlık indeksleme

   Desteklenen yöntemler:
     1. Google Indexing API  (Edge Function üzerinden)
     2. IndexNow             (Bing + Yandex — client-side)

   Yapılandırma (index.html'deki config bloğunda):
     window.INDEXING_EDGE_URL  — Supabase/Cloudflare Edge URL
     window.INDEXNOW_KEY       — IndexNow doğrulama anahtarı
     window.SITE_BASE_URL      — ör: https://scorepop.com.tr
════════════════════════════════════════════════ */
'use strict';

const Indexing = (() => {

  /* Hangi status kodları "canlı maç" sayılır */
  const LIVE_STATUSES = new Set(['1H','2H','HT','ET','BT','P','LIVE']);

  /* Aynı fixture_id için tekrar ping gönderme */
  const _pinged = new Set();

  /* ── PUBLIC API ─────────────────────────────── */

  /**
   * Maç sayfası açıldığında çağrılır.
   * @param {number|string} fixtureId  - Maç ID
   * @param {string}        statusShort - Maç durumu kodu
   * @param {string}        [slug]     - URL slug (opsiyonel)
   */
  function pingMatchPage(fixtureId, statusShort, slug) {
    const id = String(fixtureId);
    if (_pinged.has(id)) return;   // Zaten ping gönderildi
    _pinged.add(id);

    const base = (window.SITE_BASE_URL || window.location.origin).replace(/\/$/, '');
    const path = slug ? `/mac/${id}-${slug}` : `/mac/${id}`;
    const fullUrl = base + path;

    const isLive = LIVE_STATUSES.has(statusShort);

    /* Canlı maçlara tam hız ping */
    if (isLive) {
      _pingGoogleIndexingAPI(fullUrl);
      _pingIndexNow(fullUrl);
      console.info('[Indexing] Canlı ping gönderildi →', fullUrl);
    } else {
      /* Canlı olmayan maçlar için sadece IndexNow (daha sessiz yol) */
      _pingIndexNow(fullUrl);
    }
  }

  /* ── GOOGLE INDEXING API ────────────────────── */
  /*
   * Google Indexing API doğrudan tarayıcıdan çağrılamaz
   * (OAuth2 service account gerektirir). Bu yüzden sizin
   * backend Edge Function'ınıza POST gönderiyoruz.
   *
   * Edge Function kurulumu için README'ye bakın.
   */
  async function _pingGoogleIndexingAPI(url) {
    const edgeUrl = window.INDEXING_EDGE_URL;
    if (!edgeUrl || edgeUrl.includes('BURAYA')) {
      console.warn('[Indexing] INDEXING_EDGE_URL ayarlanmamış — Google ping atlandı.');
      return;
    }

    try {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, type: 'URL_UPDATED' }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        console.info('[Indexing] Google Indexing API ✓', url);
      } else {
        console.warn('[Indexing] Google API yanıt kodu:', res.status);
      }
    } catch (e) {
      console.warn('[Indexing] Google API ping hatası:', e.message);
    }
  }

  /* ── INDEXNOW ───────────────────────────────── */
  /*
   * IndexNow tamamen client-side çalışır.
   * Tek yapmanız gereken:
   *   1. window.INDEXNOW_KEY değerini ayarlamak
   *   2. Sitenize /{key}.txt dosyası koymak (içinde sadece key yazmalı)
   *
   * İstek mode:'no-cors' ile gönderilir — response okunamaz ama
   * arama motoruna ulaşır. Tarayıcı konsolu 'opaque response' verir,
   * bu normaldir.
   */
  async function _pingIndexNow(url) {
    const key = window.INDEXNOW_KEY;
    if (!key || key.includes('BURAYA')) {
      console.warn('[Indexing] INDEXNOW_KEY ayarlanmamış — IndexNow ping atlandı.');
      return;
    }

    const keyLocation = `${(window.SITE_BASE_URL || window.location.origin).replace(/\/$/, '')}/${key}.txt`;

    /* Hem Bing hem Yandex'e gönder */
    const endpoints = [
      'https://www.bing.com/indexnow',
      'https://yandex.com/indexnow',
    ];

    const body = JSON.stringify({
      host: new URL(window.SITE_BASE_URL || window.location.origin).hostname,
      key,
      keyLocation,
      urlList: [url],
    });

    for (const endpoint of endpoints) {
      try {
        await fetch(`${endpoint}?url=${encodeURIComponent(url)}&key=${key}`, {
  method: 'GET',
  mode: 'no-cors',
  signal: AbortSignal.timeout(5000),
});
        console.info(`[Indexing] IndexNow → ${endpoint} ✓`);
      } catch (e) {
        console.warn(`[Indexing] IndexNow ${endpoint} hatası:`, e.message);
      }
    }
  }

  return { pingMatchPage };

})();
