/* ═══════════════════════════════════════════════
   SCOREPOP — sitemap-gen.js
   Günlük maçları Supabase'den çekip sitemap.xml
   olarak GitHub Actions ile otomatik günceller.
   
   Kullanım: node sitemap-gen.js
   GitHub Actions: Her gün 06:00 ve 12:00'da çalışır
════════════════════════════════════════════════ */

const https = require('https');
const fs    = require('fs');

const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_KEY;
const BASE_URL       = 'https://scorepop.com.tr';
const INDEXNOW_KEY   = process.env.INDEXNOW_KEY  || '';
const GOOGLE_SA_JSON = process.env.GOOGLE_SA_JSON || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL ve SUPABASE_KEY env değişkenleri gerekli');
  process.exit(1);
}

/* ── DÜZELTME 1: Gerçek status kısa kodları (büyük harf) ── */
const LIVE_STATUSES = new Set(['1H','2H','HT','ET','BT','P','LIVE']);

function slugify(str) {
  return (str || '')
    .toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function fetchJson(path) {
  return new Promise((resolve, reject) => {
    const url = `${SUPABASE_URL}/rest/v1/${path}`;
    const req = https.request(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept': 'application/json',
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function generate() {
  const today     = new Date();
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const fmt = d => d.toISOString().slice(0, 10);

  let matches = [];

  try {
    /* ── live_matches: şu an canlı olanlar ── */
    const live = await fetchJson(
      'live_matches?select=fixture_id,home_team,away_team,league_name,home_score,away_score,status_short,updated_at' +
      '&order=fixture_id.desc&limit=200'
    );
    console.log('live_matches yanit:', JSON.stringify(live).slice(0, 200));
    if (Array.isArray(live)) matches.push(...live);

    /* ── DÜZELTME 2: daily_matches'e tarih filtresi ekle ── */
    for (const date of [fmt(yesterday), fmt(today), fmt(tomorrow)]) {
      const daily = await fetchJson(
        `daily_matches?select=fixture_id,home_team,away_team,league_name,home_score,away_score,status_short` +
        `&date=eq.${date}&order=fixture_id.desc&limit=400`
      );
      console.log(`daily_matches [${date}]:`, JSON.stringify(daily).slice(0, 100));
      if (Array.isArray(daily)) matches.push(...daily);
    }

    /* ── DÜZELTME 3: future_matches bugün + yarın dahil et ──
       Planlanmış maçların URL'lerini Google öğrenmeden izleyemez */
    for (const date of [fmt(today), fmt(tomorrow)]) {
      const future = await fetchJson(
        `future_matches?select=fixture_id,data,date` +
        `&date=eq.${date}&order=fixture_id.desc&limit=400`
      );
      console.log(`future_matches [${date}]:`, JSON.stringify(future).slice(0, 100));
      if (Array.isArray(future)) {
        future.forEach(r => {
          let home_team = '', away_team = '', status_short = 'NS';
          try {
            const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
            home_team    = d?.teams?.home?.name || '';
            away_team    = d?.teams?.away?.name || '';
            status_short = d?.fixture?.status?.short || 'NS';
          } catch(e) {}
          if (r.fixture_id && home_team && away_team) {
            matches.push({ fixture_id: r.fixture_id, home_team, away_team, status_short });
          }
        });
      }
    }

  } catch(e) {
    console.error('Supabase fetch hatası:', e.message);
  }

  /* Tekrarları kaldır — fixture_id bazlı, live_matches öncelikli */
  const seen = new Set();
  matches = matches.filter(m => {
    if (!m.fixture_id) return false;
    if (seen.has(m.fixture_id)) return false;
    seen.add(m.fixture_id);
    return true;
  });

  const now = new Date().toISOString();

  const urls = [
    `  <url>\n    <loc>${BASE_URL}/</loc>\n    <lastmod>${fmt(today)}</lastmod>\n    <changefreq>always</changefreq>\n    <priority>1.0</priority>\n  </url>`,
    `  <url>\n    <loc>${BASE_URL}/bugun</loc>\n    <lastmod>${fmt(today)}</lastmod>\n    <changefreq>hourly</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    `  <url>\n    <loc>${BASE_URL}/canli</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>always</changefreq>\n    <priority>0.9</priority>\n  </url>`,
    ...matches.map(m => {
      const slug    = `${slugify(m.home_team)}-vs-${slugify(m.away_team)}`;
      const isLive  = LIVE_STATUSES.has(m.status_short); /* DÜZELTME 1 */
      return `  <url>\n    <loc>${BASE_URL}/mac/${m.fixture_id}-${slug}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${isLive ? 'always' : 'hourly'}</changefreq>\n    <priority>${isLive ? '0.95' : '0.8'}</priority>\n  </url>`;
    })
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  fs.writeFileSync('sitemap.xml', xml, 'utf8');
  console.log(`✅ sitemap.xml güncellendi — ${matches.length} maç, ${urls.length} URL`);

  /* ── Canlı maçlara öncelikli Google + IndexNow pingi ── */
  const liveUrls = matches
    .filter(m => LIVE_STATUSES.has(m.status_short))
    .map(m => `${BASE_URL}/mac/${m.fixture_id}-${slugify(m.home_team)}-vs-${slugify(m.away_team)}`);

  /* ── Planlanmış maçları Bing/Yandex'e bildir (Google'a değil, kota tüketir) ── */
  const scheduledUrls = matches
    .filter(m => !LIVE_STATUSES.has(m.status_short))
    .map(m => `${BASE_URL}/mac/${m.fixture_id}-${slugify(m.home_team)}-vs-${slugify(m.away_team)}`)
    .slice(0, 500);

  if (liveUrls.length > 0) {
    console.log(`📡 ${liveUrls.length} canlı maç için öncelikli ping...`);
    await pingIndexNow(liveUrls);
    await pingGoogleIndexingAPI(liveUrls);
  }
  if (scheduledUrls.length > 0) {
    console.log(`📋 ${scheduledUrls.length} planlanmış maç URL'si IndexNow'a gönderiliyor...`);
    await pingIndexNow(scheduledUrls);
  }
  if (liveUrls.length === 0 && scheduledUrls.length === 0) {
    console.log('ℹ️  Ping gönderilecek maç yok.');
  }
}

/* ── IndexNow (Bing + Yandex) ── */
async function pingIndexNow(urlList) {
  if (!INDEXNOW_KEY) { console.warn('⚠️  INDEXNOW_KEY tanımlanmamış — IndexNow atlandı.'); return; }
  const host = new URL(BASE_URL).hostname;
  const body = JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`, urlList });
  for (const ep of [{ host: 'www.bing.com', path: '/indexnow' }, { host: 'yandex.com', path: '/indexnow' }]) {
    await new Promise(resolve => {
      const req = https.request(
        { host: ep.host, path: ep.path, method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } },
        res => { console.log(`  IndexNow → ${ep.host}: HTTP ${res.statusCode}`); res.resume(); resolve(); }
      );
      req.on('error', e => { console.warn(`  IndexNow ${ep.host} hata:`, e.message); resolve(); });
      req.write(body); req.end();
    });
  }
}

/* ── Google Indexing API ── */
async function pingGoogleIndexingAPI(urlList) {
  if (!GOOGLE_SA_JSON) { console.warn('⚠️  GOOGLE_SA_JSON tanımlanmamış — Google Indexing API atlandı.'); return; }
  let auth;
  try {
    const { google } = require('googleapis');
    auth = new google.auth.GoogleAuth({ credentials: JSON.parse(GOOGLE_SA_JSON), scopes: ['https://www.googleapis.com/auth/indexing'] });
  } catch (e) { console.warn('⚠️  Google auth başlatılamadı:', e.message); return; }
  const accessToken = await auth.getAccessToken().catch(() => null);
  if (!accessToken) return;
  let ok = 0, fail = 0;
  for (const url of urlList) {
    const body = JSON.stringify({ url, type: 'URL_UPDATED' });
    await new Promise(resolve => {
      const req = https.request(
        { host: 'indexing.googleapis.com', path: '/v3/urlNotifications:publish', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}`, 'Content-Length': Buffer.byteLength(body) } },
        res => { res.statusCode === 200 ? ok++ : fail++; res.resume(); resolve(); }
      );
      req.on('error', () => { fail++; resolve(); });
      req.write(body); req.end();
    });
  }
  console.log(`  Google Indexing API: ${ok} başarılı, ${fail} başarısız`);
}

generate().catch(e => { console.error(e); process.exit(1); });
