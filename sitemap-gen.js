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
    const live = await fetchJson('live_matches?select=fixture_id,home_team,away_team,league_name,home_score,away_score,status&order=fixture_id.desc&limit=200');
    if (Array.isArray(live)) matches.push(...live);

    // daily_matches — bugün + yarın planlanmış
    const daily = await fetchJson(`daily_matches?select=fixture_id,home_team,away_team,league_name,home_score,away_score,status&order=fixture_id.desc&limit=400`);
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
    <loc>${BASE_URL}/#/bugun</loc>
    <lastmod>${fmt(today)}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>`,
    // Canlı sayfası
    `  <url>
    <loc>${BASE_URL}/#/canli</loc>
    <lastmod>${now}</lastmod>
    <changefreq>always</changefreq>
    <priority>0.9</priority>
  </url>`,
    // Her maç için ayrı URL
    ...matches.map(m => {
      const slug = `${slugify(m.home_team)}-vs-${slugify(m.away_team)}`;
      const isLive = m.status === 'live' || m.status === 'inprogress' || m.status === 'ht';
      return `  <url>
    <loc>${BASE_URL}/#/mac/${m.fixture_id}-${slug}</loc>
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
}

generate().catch(e => { console.error(e); process.exit(1); });
