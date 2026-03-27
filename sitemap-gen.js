/* ═══════════════════════════════════════════════
   SCOREPOP — sitemap-gen.js
   Günlük maçları Supabase'den çekip sitemap.xml
   olarak GitHub Actions ile otomatik günceller.
   
   Kullanım: node sitemap-gen.js
   GitHub Actions: Her gün 06:00 ve 12:00'da çalışır
════════════════════════════════════════════════ */

const https = require('https');
const fs    = require('fs');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const BASE_URL     = 'https://scorepop.com.tr';

/* ── Canlı indeksleme ayarları ─────────────────────────────────────────
   GitHub Actions secrets olarak tanımlayın:
     GOOGLE_SA_JSON    — Service Account JSON (string, base64 veya raw)
     INDEXNOW_KEY      — IndexNow doğrulama anahtarı
─────────────────────────────────────────────────────────────────────── */
const INDEXNOW_KEY  = process.env.INDEXNOW_KEY  || '';
const GOOGLE_SA_JSON = process.env.GOOGLE_SA_JSON || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL ve SUPABASE_KEY env değişkenleri gerekli');
  process.exit(1);
}

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
  // Bugün + yarın + dünün maçlarını çek (canlı + daily)
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

  const fmt = d => d.toISOString().slice(0, 10);
  const dates = [fmt(yesterday), fmt(today), fmt(tomorrow)];

  let matches = [];
  try {
    // live_matches — şu an canlı olanlar
    const live = await fetchJson('live_matches?select=fixture_id,home_team,away_team,league_name,home_score,away_score,status_short&order=fixture_id.desc&limit=200');
    console.log('live_matches yanit:', JSON.stringify(live).slice(0,200));
    if (Array.isArray(live)) matches.push(...live);

    // daily_matches — bugün + yarın planlanmış
    const daily = await fetchJson(`daily_matches?select=fixture_id,home_team,away_team,league_name,home_score,away_score,status_short&order=fixture_id.desc&limit=400`);
    console.log('daily_matches yanit:', JSON.stringify(daily).slice(0,200));
    if (Array.isArray(daily)) matches.push(...daily);
  } catch(e) {
    console.error('Supabase fetch hatası:', e.message);
  }

  // Tekrarları kaldır
  const seen = new Set();
  matches = matches.filter(m => {
    if (!m.fixture_id) return false;
    if (seen.has(m.fixture_id)) return false;
    seen.add(m.fixture_id);
    return true;
  });

  const now = new Date().toISOString();

  const urls = [
    // Ana sayfa
    `  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${fmt(today)}</lastmod>
    <changefreq>always</changefreq>
    <priority>1.0</priority>
  </url>`,
    // Bugün sayfası
    `  <url>
    <loc>${BASE_URL}/bugun</loc>
    <lastmod>${fmt(today)}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`,
    // Canlı sayfası
    `  <url>
    <loc>${BASE_URL}/canli</loc>
    <lastmod>${now}</lastmod>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>`,
    // Her maç için ayrı URL
    ...matches.map(m => {
      const slug = `${slugify(m.home_team)}-vs-${slugify(m.away_team)}`;
      const isLive = m.status_short === 'live' || m.status_short === 'inprogress' || m.status_short === 'ht';
      return `  <url>
    <loc>${BASE_URL}/mac/${m.fixture_id}-${slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${isLive ? 'always' : 'hourly'}</changefreq>
    <priority>${isLive ? '0.95' : '0.8'}</priority>
  </url>`;
    })
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  fs.writeFileSync('sitemap.xml', xml, 'utf8');
  console.log(`✅ sitemap.xml güncellendi — ${matches.length} maç, ${urls.length} URL`);

  /* ── Canlı maçlara anlık indeksleme pingi gönder ─────────────────── */
  const liveMatches = matches.filter(m =>
    ['1H','2H','HT','ET','BT','P','LIVE'].includes(m.status_short)
  );

  const liveUrls = liveMatches.map(m => {
    const slug = `${slugify(m.home_team)}-vs-${slugify(m.away_team)}`;
    return `${BASE_URL}/mac/${m.fixture_id}-${slug}`;
  });

  if (liveUrls.length > 0) {
    console.log(`📡 ${liveUrls.length} canlı maç için ping gönderiliyor...`);
    await pingIndexNow(liveUrls);
    await pingGoogleIndexingAPI(liveUrls);
  } else {
    console.log('ℹ️  Şu an canlı maç yok — indeksleme pingleri atlandı.');
  }
}

/* ── IndexNow (Bing + Yandex) ───────────────────────────────────────── */
async function pingIndexNow(urlList) {
  if (!INDEXNOW_KEY) {
    console.warn('⚠️  INDEXNOW_KEY tanımlanmamış — IndexNow atlandı.');
    return;
  }

  const host = new URL(BASE_URL).hostname;
  const body = JSON.stringify({
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${BASE_URL}/${INDEXNOW_KEY}.txt`,
    urlList,
  });

  const endpoints = [
    { host: 'www.bing.com',    path: '/indexnow' },
    { host: 'yandex.com',      path: '/indexnow' },
  ];

  for (const ep of endpoints) {
    await new Promise(resolve => {
      const req = https.request(
        { host: ep.host, path: ep.path, method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=utf-8',
                     'Content-Length': Buffer.byteLength(body) } },
        res => {
          console.log(`  IndexNow → ${ep.host}: HTTP ${res.status || res.statusCode}`);
          res.resume();
          resolve();
        }
      );
      req.on('error', e => { console.warn(`  IndexNow ${ep.host} hata:`, e.message); resolve(); });
      req.write(body);
      req.end();
    });
  }
}

/* ── Google Indexing API ─────────────────────────────────────────────
   Service Account JSON'unu GOOGLE_SA_JSON ortam değişkenine koyun.
   Gerekli npm paketi: google-auth-library
   GitHub Actions'da: npm install google-auth-library
─────────────────────────────────────────────────────────────────────── */
async function pingGoogleIndexingAPI(urlList) {
  if (!GOOGLE_SA_JSON) {
    console.warn('⚠️  GOOGLE_SA_JSON tanımlanmamış — Google Indexing API atlandı.');
    return;
  }

  let auth;
  try {
    const { google } = require('googleapis');  // isteğe bağlı bağımlılık
    const credentials = JSON.parse(GOOGLE_SA_JSON);
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    });
  } catch (e) {
    console.warn('⚠️  Google auth başlatılamadı (googleapis yüklü mü?):', e.message);
    return;
  }

  const accessToken = await auth.getAccessToken().catch(e => {
    console.warn('⚠️  Google access token alınamadı:', e.message);
    return null;
  });
  if (!accessToken) return;

  let ok = 0, fail = 0;
  for (const url of urlList) {
    const body = JSON.stringify({ url, type: 'URL_UPDATED' });
    await new Promise(resolve => {
      const req = https.request(
        { host: 'indexing.googleapis.com', path: '/v3/urlNotifications:publish',
          method: 'POST',
          headers: { 'Content-Type': 'application/json',
                     'Authorization': `Bearer ${accessToken}`,
                     'Content-Length': Buffer.byteLength(body) } },
        res => {
          if (res.statusCode === 200) ok++;
          else fail++;
          res.resume();
          resolve();
        }
      );
      req.on('error', e => { fail++; resolve(); });
      req.write(body);
      req.end();
    });
  }
  console.log(`  Google Indexing API: ${ok} başarılı, ${fail} başarısız`);
}

generate().catch(e => { console.error(e); process.exit(1); });
