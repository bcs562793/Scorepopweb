/* ═══════════════════════════════════════════════
   SCOREPOP — app.js  (v4.7 — Arşiv Desteği)
   Fixes: 
     - Sidebar lig isimleri yatay (flex-wrap) 
     - --:-- sorunu giderildi (fmtKickoff robust)
     - match_statistics uses maybeSingle + robust data parsing
     - Forum tab wired to forum.js
   v3.1:
     - Lig sıralaması: favori > üst lig > alt lig > diğer
     - Favori lig takip (localStorage)
════════════════════════════════════════════════ */
'use strict';

const S = {
  sb:           null,
  page:         'live',
  date:         todayStr(),
  league:       'all',
  detail:       null,
  detailLive:   false,
  timer:        null,
  cd:           30,
  cycle:        30,
  allLeagues:   [],
  lastGoals:    {},   /* fixture_id (string) → { events: [...] } */
  archiveCache: {},   /* fixture_id (string) → tam maç objesi (arşivden) */
};

/* ── LİG ÖNCELİK SİSTEMİ ───────────────────── */
/*
   tier 1 = Üst ligler (sıralı)
   tier 2 = Alt ligler (sıralı)
   Eşleşme: league_name içinde keyword geçiyorsa eşleşir.
   Aynı tier içinde order küçük olan önce gelir.
*/
const LEAGUE_TIERS = [
  /* ─── TIER 1: ÜST LİGLER ─── */
  /* country kısıtı: eşleşme garantisi için var ama Mackolik TR isim verebilir,
     bu yüzden TR karşılıklar da keyword listesine eklendi                     */

  { tier: 1, order: 1,  keywords: ['süper lig', 'super lig', 'trendyol süper', 'türkiye 1.', 'spor toto süper'], country: 'turkey' },

  { tier: 1, order: 2,  keywords: ['premier league', 'ingiltere premier', 'england premier', 'premier lig'], country: 'england' },

  { tier: 1, order: 3,  keywords: ['la liga', 'laliga', 'ispanya 1.', 'primera división', 'primera division'], country: 'spain' },

  { tier: 1, order: 4,  keywords: ['serie a', 'italya 1.', 'serie a tim'], country: 'italy' },

  { tier: 1, order: 5,  keywords: ['bundesliga', 'almanya 1.', '1. bundesliga'], country: 'germany' },

  { tier: 1, order: 6,  keywords: ['ligue 1', 'fransa 1.', 'ligue 1 mcdonald'], country: 'france' },

  { tier: 1, order: 7,  keywords: ['primeira liga', 'liga portugal', 'portekiz 1.', 'liga nos'], country: 'portugal' },

  { tier: 1, order: 8,  keywords: ['eredivisie', 'hollanda 1.', 'netherlands 1.'], country: 'netherlands' },

  { tier: 1, order: 9,  keywords: ['champions league', 'şampiyonlar ligi', 'ucl'] },
  { tier: 1, order: 10, keywords: ['europa league', 'avrupa ligi', 'uel'] },
  { tier: 1, order: 11, keywords: ['conference league', 'konferans ligi', 'uecl'] },

  /* ─── TIER 2: 2. LİGLER ─── */
  { tier: 2, order: 1,  keywords: ['1. lig', 'tff 1', 'türkiye 2.'], country: 'turkey' },

  { tier: 2, order: 2,  keywords: ['championship', 'ingiltere 2.', 'efl championship'], country: 'england' },

  { tier: 2, order: 3,  keywords: ['la liga 2', 'segunda', 'laliga2', 'ispanya 2.'], country: 'spain' },

  { tier: 2, order: 4,  keywords: ['serie b', 'italya 2.'], country: 'italy' },

  { tier: 2, order: 5,  keywords: ['2. bundesliga', 'almanya 2.'], country: 'germany' },

  { tier: 2, order: 6,  keywords: ['ligue 2', 'fransa 2.'], country: 'france' },

  { tier: 2, order: 7,  keywords: ['portekiz 2.', 'liga sabseg', 'segunda liga'], country: 'portugal' },

  { tier: 2, order: 8,  keywords: ['eerste divisie', 'hollanda 2.', 'keuken kampioen'], country: 'netherlands' },

  { tier: 2, order: 9,  keywords: ['league one', 'efl league one'], country: 'england' },
  { tier: 2, order: 10, keywords: ['league two', 'efl league two'], country: 'england' },
  { tier: 2, order: 11, keywords: ['2. lig', 'tff 2'], country: 'turkey' },
  { tier: 2, order: 12, keywords: ['3. lig', 'tff 3'], country: 'turkey' },
  { tier: 2, order: 13, keywords: ['jupiler', 'pro league'], country: 'belgium' },
  { tier: 2, order: 14, keywords: ['super league', 'swiss super'], country: 'switzerland' },
  { tier: 2, order: 15, keywords: ['scottish premiership'], country: 'scotland' },
  { tier: 2, order: 16, keywords: ['ekstraklasa'], country: 'poland' },
  { tier: 2, order: 17, keywords: ['süper kupa', 'super cup'] },
];

/* Favori ligler — localStorage'dan oku/yaz */
function getFavLeagues() {
  try {
    const raw = localStorage.getItem('sp_fav_leagues');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveFavLeagues(arr) {
  try { localStorage.setItem('sp_fav_leagues', JSON.stringify(arr)); } catch {}
}

function toggleFavLeague(name) {
  const favs = getFavLeagues();
  const idx = favs.indexOf(name);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(name);
  saveFavLeagues(favs);
  return favs;
}

function isFavLeague(name) {
  return getFavLeagues().includes(name);
}

/*  Lig adından { tier, order } döndür — ülke filtresi destekler  */

/* Mackolik Türkçe ülke adları → İngilizce eşlemesi */
const COUNTRY_TR_MAP = {
  'türkiye':   'turkey',
  'ingiltere': 'england',
  'ispanya':   'spain',
  'italya':    'italy',
  'almanya':   'germany',
  'fransa':    'france',
  'portekiz':  'portugal',
  'hollanda':  'netherlands',
  'belçika':   'belgium',
  'isviçre':   'switzerland',
  'iskocya':   'scotland',
  'polonya':   'poland',
};

function _normalizeCountry(country) {
  const lower = (country || '').toLowerCase().trim();
  return COUNTRY_TR_MAP[lower] || lower;   /* Türkçe → İngilizce, yoksa olduğu gibi */
}

function _matchLeagueTier(leagueName, country) {
  const lower = (leagueName || '').toLowerCase().trim();
  const lowerCountry = _normalizeCountry(country);

  let bestMatch = null;

  for (const entry of LEAGUE_TIERS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        /* Ülke kısıtı yok → doğrudan eşleş */
        if (!entry.country) {
          return { tier: entry.tier, order: entry.order };
        }
        /* Ülke kısıtı var ve ülke bilgisi de var → tam eşleşme gerekli */
        if (lowerCountry && lowerCountry.includes(entry.country)) {
          return { tier: entry.tier, order: entry.order };
        }
        /* Ülke bilgisi YOK ama keyword eşleşti → yedek olarak sakla */
        if (!lowerCountry && !bestMatch) {
          bestMatch = { tier: entry.tier, order: entry.order };
        }
      }
    }
  }

  return bestMatch || { tier: 3, order: 999 };  /* Tanımsız → en sona */
}

/*  Grup sıralama anahtarı: favori(0/1) → tier → order → alfabe  */
function _leagueSortKey(group) {
  const fav = isFavLeague(group.name) ? 0 : 1;
  const { tier, order } = _matchLeagueTier(group.name, group.country);
  return { fav, tier, order, name: (group.name || '').toLowerCase() };
}

function _sortLeagueGroups(groups) {
  return [...groups].sort((a, b) => {
    const ka = _leagueSortKey(a);
    const kb = _leagueSortKey(b);
    if (ka.fav !== kb.fav)   return ka.fav - kb.fav;
    if (ka.tier !== kb.tier) return ka.tier - kb.tier;
    if (ka.order !== kb.order) return ka.order - kb.order;
    return ka.name.localeCompare(kb.name, 'tr');
  });
}

/* ── BOOT ───────────────────────────────────── */
async function _boot() {
  /* Watchdog'u durdur */
  window._appStarted = true;
  if (window._watchdog) clearTimeout(window._watchdog);

  S.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  /* 🗑 SİL — İLK 1000 ÜYE KAMPANYASI BAŞLANGICI */
  window._sb = S.sb;  /* promo sayacı için */
  window.dispatchEvent(new Event('sb-ready'));
  /* 🗑 SİL — İLK 1000 ÜYE KAMPANYASI BİTİŞİ */

  /* 1. Forum — Auth'dan önce başlat (session bağımsız) */
  try { Forum.init(S.sb); } catch(e) { console.warn('Forum:', e); }

  /* 2. Auth — async, tamamlanmasını bekle */
  try {
    if (typeof Auth !== 'undefined') {
      await Auth.init(S.sb);
      Auth.onChange(user => {
        if (user) {
          const n = Auth.getDisplayName();
          if (n) try { localStorage.setItem('sp_nick', n); } catch {}
        }
      });
    }
  } catch(e) { console.warn('Auth:', e); }

  /* 3. Payment */
  try { if (typeof Payment !== 'undefined') Payment.init(S.sb); } catch(e) {}

  buildDateStrip();
  bindEvents();

  /* 4. Router */
  try { if (typeof Router !== 'undefined') Router.init(); }
  catch(e) { navigate('live'); }

  startClock();
  startRealtime();
}

/* readyState zaten complete ise load eventi bir daha tetiklenmez — direkt çağır */
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  _boot();
} else {
  window.addEventListener('load', _boot);
}

/* ── EVENTS ─────────────────────────────────── */
function bindEvents() {
  document.querySelectorAll('.sb-btn').forEach(b =>
    b.addEventListener('click', () => navigate(b.dataset.page)));
  document.getElementById('back-btn').addEventListener('click', closeDetail);
}

/* ── SIDEBAR TOGGLE (mobile) ─────────────────── */
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}

/* ── NAVIGATION ─────────────────────────────── */
function navigate(page) {
  S.page   = page;
  S.league = 'all';
  closeDetail(false);

  document.querySelectorAll('.sb-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page));

  const showDate = page !== 'live';
  document.getElementById('date-strip').style.display = showDate ? 'flex' : 'none';
  const calBtn2 = document.querySelector('.tb-cal-btn');
  if (calBtn2) calBtn2.style.display = showDate ? 'flex' : 'none';

  try {
    if (typeof Router !== 'undefined') {
      if      (page === 'live')     Router.goLive();
      else if (page === 'today')    Router.goToday(S.date);
      else if (page === 'upcoming') Router.goUpcoming(S.date);
      const titles = { live:'Canlı Maçlar', today:'Bugün', upcoming:'Yaklaşan Maçlar' };
      Router.setPageMeta(titles[page] || '');
    }
  } catch(e) {}

  showView('matches');
  loadMatches();

  /* Canlı sayfada realtime aç, diğerlerinde kapat */
  if (page === 'live') startRealtime();
  else stopRealtime();
}

function openDetail(id, isLive) {
  S.detail     = id;
  S.detailLive = isLive;
  showView('detail');
  loadDetail(id, isLive);
}

function closeDetail(reload = true) {
  try { if (typeof Forum !== 'undefined') Forum.close(); } catch(e) {}
  S.detail = null;
  showView('matches');
  if (reload) loadMatches();
}

function showView(v) {
  document.getElementById('view-matches').classList.toggle('hidden', v !== 'matches');
  document.getElementById('view-detail').classList.toggle('hidden', v !== 'detail');
  document.getElementById('col-hdr').style.display = v === 'matches' ? '' : 'none';
}

/* ── DATE STRIP ─────────────────────────────── */
function buildDateStrip() {
  const el = document.getElementById('date-strip');
  el.innerHTML = '';
  const dow = ['Paz','Pzt','Sal','\u00c7ar','Per','Cum','Cmt'];

  for (let i = -3; i <= 4; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const s = fmtDate(d);
    const btn = document.createElement('button');
    btn.className = 'dp' + (i === 0 ? ' active' : '');
    btn.dataset.dateVal = s;
    const dd = pad2(d.getDate()) + '/' + pad2(d.getMonth()+1);
    const lbl = i === 0 ? 'Bug\u00fcn' : i === 1 ? 'Yar\u0131n' : i === -1 ? 'D\u00fcn' : dow[d.getDay()];
    btn.innerHTML = '<span class="dp-d">' + dd + '</span><span class="dp-w">' + lbl + '</span>';
    btn.addEventListener('click', () => {
      S.date = s;
      S.page = 'today';
      document.querySelectorAll('.sb-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.page === 'today'));
      try { if (typeof Router !== 'undefined') Router.goToday(s); } catch(e) {}
      _activateDateBtn(btn);
      const cp = document.getElementById('cal-picker');
      if (cp) cp.value = '';
      const calBtn = document.querySelector('.tb-cal-btn');
      if (calBtn) calBtn.classList.remove('active');
      loadMatches();
    });
    el.appendChild(btn);
  }
  el.style.display = 'none';

  /* Takvim input'unu baslat (HTML'deki #cal-picker) */
  const calPicker = document.getElementById('cal-picker');
  if (calPicker) {
    calPicker.max = fmtDate(new Date());
    calPicker.addEventListener('change', () => {
      const picked = calPicker.value;
      if (!picked) return;
      S.date = picked;
      S.page = 'today';
      document.querySelectorAll('.sb-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.page === 'today'));
      try { if (typeof Router !== 'undefined') Router.goToday(picked); } catch(e) {}
      _activateDateBtn(null);
      const calBtn = document.querySelector('.tb-cal-btn');
      if (calBtn) calBtn.classList.add('active');
      loadMatches();
    });
  }
}

function _activateDateBtn(activeBtn) {
  document.querySelectorAll('#date-strip .dp').forEach(p => p.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');
}

/* ── LOAD ────────────────────────────────────── */
async function loadMatches(silent = false) {
  try {
    if (S.page === 'live')        await loadLive(silent);
    else if (S.page === 'today')  await loadToday();
    else                          await loadUpcoming();
  } catch (e) {
    console.error(e);
    if (!silent) setMatchesHTML(`<div class="empty"><div class="empty-i">⚠️</div><div class="empty-t">Bağlantı hatası</div></div>`);
  }
}

async function loadLive(silent = false) {
  const { data, error } = await S.sb
    .from('live_matches').select('*')
    .in('status_short',['1H','2H','HT','ET','BT','P','LIVE'])
    .limit(120).order('league_name');
  if (error) throw error;

  /* normFix üzerinden geçir — stale dedektörü otomatik FT'ye çeker */
  const rows = (data || []).map(r => normFix(r)).filter(m => {
    const LIVE_SET = new Set(['1H','2H','HT','ET','BT','P','LIVE']);
    return LIVE_SET.has(m.status_short); // stale → FT olmuş → canlı listesinden düşer
  });
  updLiveCt(rows.length);
   if (silent) {
    /* Artık canlı olmayan maçları DOM'dan temizle */
    const activeIds = new Set(rows.map(r => String(r.fixture_id)));
    document.querySelectorAll('.mr[data-id]').forEach(el => {
      if (!activeIds.has(el.dataset.id)) {
        const lgGrp = el.closest('.lg-grp');
        el.remove();
        if (lgGrp && !lgGrp.querySelector('.mr')) lgGrp.remove();
      }
    });
    silentUpdate(rows);
  } else {
    render(rows, true);
  }
}

async function loadToday() {
  _fetchLiveCount();

  if (S.date < todayStr()) {
    await loadArchive(S.date);
    return;
  }

  // ─── 1. live_matches: canlı + NS (worker tarafından takip edilenler) ───
  const isToday = S.date === todayStr();

  const [liveRes, futureRes] = await Promise.all([
    isToday
      ? S.sb.from('live_matches').select('*').order('league_name')   // updated_at dahil (stale dedektörü için)
      : Promise.resolve({ data: [], error: null }),
    S.sb.from('future_matches').select('*').eq('date', S.date).limit(300),
  ]);

  if (liveRes.error)  console.error("live_matches hatası:", liveRes.error.message);
  if (futureRes.error) console.error("future_matches hatası:", futureRes.error.message);

  // fixture_id bazlı dedupe — live_matches öncelikli (gerçek zamanlı skor içeriyor)
  const seen = new Set();
  const rows = [];

  function parseRows(list) {
    (list || []).forEach(r => {
      if (r.raw_data) {
        try {
          const parsed = JSON.parse(r.raw_data);
          const norm = normFix({ ...r, ...parsed });
          if (norm.fixture_id && !seen.has(norm.fixture_id)) {
            seen.add(norm.fixture_id);
            rows.push(norm);
          }
          return;
        } catch(e) {}
      }
      if (r.data && typeof r.data === 'object') {
        const list2 = Array.isArray(r.data) ? r.data : [r.data];
        list2.forEach(m => {
          const norm = normFix({ ...r, ...m });
          if (norm.fixture_id && !seen.has(norm.fixture_id)) {
            seen.add(norm.fixture_id);
            rows.push(norm);
          }
        });
        return;
      }
      const norm = normFix(r);
      if (norm.fixture_id && !seen.has(norm.fixture_id)) {
        seen.add(norm.fixture_id);
        rows.push(norm);
      }
    });
  }

  // Önce live_matches (öncelikli), sonra future_matches (ek NS maçlar)
  parseRows(liveRes.data);
  parseRows(futureRes.data);

  render(rows, false);
}

/* ── ARŞİV: Geçmiş tarih maçları GitHub'dan yükle ─── */
const ARCHIVE_BASE = 'https://raw.githubusercontent.com/bcs562793/scorepop-worker/main/data';

async function loadArchive(date) {
  setMatchesHTML(`<div class="empty"><div class="empty-i">⏳</div><div class="empty-t">${date} arşivi yükleniyor…</div></div>`);

  try {
    // Önce .json.gz dene, olmadığında .json'a düş
     let res = await fetch(`${ARCHIVE_BASE}/${date}.json.gz`);
     if (!res.ok) {
     res = await fetch(`${ARCHIVE_BASE}/${date}.json`);
   }

    if (!res.ok) {
      setMatchesHTML(`<div class="empty"><div class="empty-i">📂</div><div class="empty-t">${date} tarihine ait arşiv bulunamadı</div></div>`);
      return;
    }

    const json = await res.json();

    /* JSON formatı: dizi ya da { response: [...] } olabilir */
    const raw = Array.isArray(json) ? json
               : Array.isArray(json?.response) ? json.response
               : [];

    if (!raw.length) {
      setMatchesHTML(`<div class="empty"><div class="empty-i">📂</div><div class="empty-t">${date} için maç verisi yok</div></div>`);
      return;
    }

    /* Tam maç verisini fixture_id bazında cache'le (detail için) */
    S.archiveCache = {};
    raw.forEach(m => {
      const id = m?.fixture?.id;
      if (id) S.archiveCache[String(id)] = m;
    });

    const rows = raw.map(m => normFix(m));
    render(rows, false);

  } catch (e) {
    console.error('Arşiv yüklenemedi:', e);
    setMatchesHTML(`<div class="empty"><div class="empty-i">⚠️</div><div class="empty-t">Arşiv yüklenirken hata oluştu</div></div>`);
  }
}

/* ── ARŞİV ADAPTÖRLER: scraper formatı → buildDetail formatı ── */

/* Scraper events → Supabase match_events satırı formatı
   Scraper : { minute, minuteExtra, type, detail, playerName, assistName, teamSide, teamId, teamName }
   buildDetail: { elapsed_time, extra_time, event_type, event_detail, player_name, assist_name, team_id, team_name } */
function archiveAdaptEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map(e => ({
    elapsed_time: e.minute      ?? null,
    extra_time:   e.minuteExtra ?? null,
    event_type:   e.type        ?? '',
    event_detail: e.detail      ?? '',
    player_name:  e.playerName  ?? '',
    assist_name:  e.assistName  ?? null,
    team_id:      e.teamId      ?? null,
    team_name:    e.teamName    ?? '',
  }));
}

/* Scraper stats → parseStatsData'nın beklediği { data: [...] } formatı
   parseStatsData zaten homeVal/awayVal formatını destekliyor */
function archiveAdaptStats(stats) {
  if (!Array.isArray(stats) || !stats.length) return null;
  return { data: stats };
}

/* Scraper lineups → buildDetail'in beklediği { data: [teamA, teamB] } formatı
   Scraper : { home: { startXI:[{id,name,number}], substitutes:[] }, away: {...} }
   buildDetail: lus.data[i] = { team:{logo,name}, startXI:[{player:{number,name,pos}}], substitutes:[] } */
function archiveAdaptLineups(lineups, match) {
  if (!lineups) return null;

  const adaptTeam = (side) => {
    const lu    = lineups[side] || { startXI: [], substitutes: [] };
    const tInfo = match?.teams?.[side] || {};

    const adaptPlayers = (arr) =>
      (arr || []).map(p => ({
        player: { number: p.number || '', name: p.name || '', pos: p.pos || '' }
      }));

    return {
      team:        { id: tInfo.id || null, name: tInfo.name || '', logo: tInfo.logo || '' },
      formation:   lu.formation || null,
      startXI:     adaptPlayers(lu.startXI),
      substitutes: adaptPlayers(lu.substitutes),
    };
  };

  return { data: [ adaptTeam('home'), adaptTeam('away') ] };
}

/* Scraper h2h → buildDetail'in beklediği { data: {...} } formatı
   Scraper: { h2h:[], homeForm:[], awayForm:[], homeScorers:[], awayScorers:[] } */
function archiveAdaptH2H(h2h) {
  if (!h2h) return null;
  return { data: h2h };
}

async function loadUpcoming() {
  _fetchLiveCount();   /* sayaç her zaman güncel kalsın */
  const { data, error } = await S.sb
    .from('future_matches')
    .select('*')
    .gt('date', S.date)    // bugün dahil değil — bugün loadToday'de gösteriliyor
    .order('date')
    .limit(200);

  if (error) {
    console.error("Gelecek maçlar yüklenemedi:", error.message);
    return;
  }

  const rows = [];
  (data || []).forEach(r => {
    /* Tüm veri formatlarını destekle */

    /* 1. raw_data TEXT kolonu */
    if (r.raw_data) {
      try { rows.push(normFix({...r, ...JSON.parse(r.raw_data)})); return; } catch(e) {}
    }

    /* 2. data kolonu (JSONB veya TEXT) — { fixture:{date,...}, teams:{...}, ... } */
    if (r.data) {
      let d = r.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch(e) { d = null; } }
      if (d && typeof d === 'object') {
        const list = Array.isArray(d) ? d : [d];
        list.forEach(m => rows.push(normFix({ ...r, ...m })));
        return;
      }
    }

    /* 3. fixture doğrudan JSONB kolonu — { id, date, venue, ... } */
    if (r.fixture) {
      let fx = r.fixture;
      if (typeof fx === 'string') { try { fx = JSON.parse(fx); } catch(e) { fx = null; } }
      if (fx && typeof fx === 'object') {
        rows.push(normFix({ ...r, fixture: fx }));
        return;
      }
    }

    /* 4. Düz satır */
    rows.push(normFix(r));
  });

  render(rows, false);
}


function normFix(m) {
  /* fixture hem doğrudan hem data içinden gelebilir */
  const fx = (m.fixture && typeof m.fixture === 'object') ? m.fixture : null;

  /* Saat için: fixture.date en öncelikli, diğerleri yedek */
  const kt = fx?.date
        || m.kickoff_time || m.fixture_date
        || m.match_time   || m.event_date   || m.date_time
        || m.start_time   || m.event_time   || m.scheduled_at
        || m.fixture_time || m.game_time    || m.time
        || null;
  /* NOT: m.date kasıtlı atlandı — "2026-03-15" gibi saat içermeyen tarih */

  /* ── DB kolonu her zaman raw_data'ya karşı önceliklidir ──
     Örn: raw_data "1H @ 90'" gösterse bile DB status_short "FT" ise FT'yi kullan */
  const dbStatus  = m.status_short || null;        // DB kolonu (en güvenilir)
  const rawStatus = fx?.status?.short || null;     // raw_data snapshot (stale olabilir)
  let resolvedStatus = dbStatus || rawStatus || 'NS';

  /* ── Takılı maç dedektörü: 1H / 2H ama updated_at çok eski ──
     Eğer worker DB'yi güncellemediyse, elapsed ≥ 90 olan "canlı" maçı
     45+ dakikadır güncellenmemişse otomatik MS say */
  const LIVE_SET = new Set(['1H','2H','HT','ET','BT','P','LIVE']);
  if (LIVE_SET.has(resolvedStatus) && m.updated_at) {
    const elapsed = m.elapsed_time ?? fx?.status?.elapsed ?? 0;
    const updatedAt = new Date(m.updated_at).getTime();
    const staleMins = (Date.now() - updatedAt) / 60000;
    /* 1H @ 90+ dakika ve 45 dk'dır güncelleme yoksa → FT say */
    if (elapsed >= 90 && staleMins > 45) {
      console.warn(`[normFix] Stale live match detected: fixture ${m.fixture_id}, elapsed ${elapsed}', stale ${Math.round(staleMins)} min → forcing FT`);
      resolvedStatus = 'FT';
    }
  }

  return {
    fixture_id:    fx?.id              || m.fixture_id,
    league_id:     m.league?.id        || m.league_id    || 0,
    league_name:   m.league?.name      || m.league_name  || '',
    league_logo:   m.league?.logo      || m.league_logo  || '',
    league_country:m.league?.country   || m.league_country || '',
    league_flag:   m.league?.flag      || m.league_flag  || '',
    home_team:    m.teams?.home?.name || m.home_team   || '',
    away_team:    m.teams?.away?.name || m.away_team   || '',
    home_logo:    m.teams?.home?.logo || m.home_logo   || '',
    away_logo:    m.teams?.away?.logo || m.away_logo   || '',
    home_team_id: m.teams?.home?.id   || m.home_team_id || null,
    away_team_id: m.teams?.away?.id   || m.away_team_id || null,
    home_score: m.home_score  ?? m.goals?.home  ?? null,
    away_score: m.away_score  ?? m.goals?.away  ?? null,
    status_short: resolvedStatus,
    elapsed_time: m.elapsed_time ?? fx?.status?.elapsed ?? null,
    kickoff_time: kt,
    visual_url:   m.visual_url || null,
  };
}

/* ── RENDER ──────────────────────────────────── */
function _sortMatches(matches) {
  const order = m => {
    const s = m.status_short;
    if (['1H','2H','HT','ET','BT','P','LIVE'].includes(s)) return 0;
    if (!s || s === 'NS' || s === 'TBD')                   return 1;
    return 2;
  };
  return [...matches].sort((a, b) => {
    const od = order(a) - order(b);
    if (od !== 0) return od;
    const ta = new Date(a.kickoff_time || a.fixture_date || a.match_date || 0).getTime();
    const tb = new Date(b.kickoff_time || b.fixture_date || b.match_date || 0).getTime();
    return ta - tb;
  });
}

function render(rows, isLive) {
  if (!rows.length) {
    setMatchesHTML(`<div class="empty"><div class="empty-i">📭</div><div class="empty-t">Maç bulunamadı</div></div>`);
    buildSidebarLeagues([]);
    return;
  }
  const groups = {};
  rows.forEach(m => {
    /* league_id varsa en güvenli anahtar o, yoksa ülke+isim kombinasyonu */
    const k = m.league_id
      ? String(m.league_id)
      : `${(m.league_country || '').toLowerCase()}__${(m.league_name || 'Diğer').toLowerCase()}`;
    if (!groups[k]) groups[k] = {
      name:    m.league_name  || 'Diğer',
      logo:    m.league_logo    || '',
      country: m.league_country || '',
      flag:    m.league_flag    || '',
      matches: []
    };
    groups[k].matches.push(m);
  });
  Object.values(groups).forEach(g => { g.matches = _sortMatches(g.matches); });

  /* ▼ YENİ: Ligleri öncelik sırasına göre sırala ▼ */
  S.allLeagues = _sortLeagueGroups(Object.values(groups));

  buildSidebarLeagues(S.allLeagues);
  setMatchesHTML(S.allLeagues.map(g => renderGroup(g, isLive)).join(''));
  applyFilter();
}

function renderGroup(g, isLive) {
  const liveCount = g.matches.filter(m => statusInfo(m).live).length;
  const logo = g.logo
    ? `<img src="${esc(g.logo)}" onerror="this.style.display='none'" alt="" style="width:16px;height:16px;object-fit:contain;flex-shrink:0">`
    : '';
  const countryFlag = g.flag
    ? `<img src="${g.flag}" onerror="this.style.display='none'" alt="" style="width:16px;height:11px;object-fit:cover;border-radius:2px;flex-shrink:0">`
    : '';
  /* "Belgium Pro League" — ülke + lig tek string */
  const fullName = g.country
    ? `${esc(g.country)} ${esc(g.name)}`
    : esc(g.name);
  const liveBadge = liveCount
    ? `<span style="display:inline-flex;align-items:center;white-space:nowrap;...">${liveCount} CANLI</span>`
    : '';

  /* ▼ YENİ: Favori yıldızı ▼ */
  const isFav = isFavLeague(g.name);
  const starBtn = `<span class="lg-fav" data-league="${esc(g.name)}"
    onclick="event.stopPropagation();_toggleFavFromHeader(this)"
    style="cursor:pointer;font-size:14px;margin-left:4px;opacity:${isFav ? '1' : '0.3'};transition:opacity .15s;"
    title="${isFav ? 'Favoriden çıkar' : 'Favorilere ekle'}">${isFav ? '⭐' : '☆'}</span>`;

  return `
    <div class="lg-grp" data-league="${esc(g.name)}">
      <div class="lg-hdr" onclick="this.closest('.lg-grp').classList.toggle('closed')">
        <div style="display:flex;align-items:center;gap:6px;flex:1;flex-wrap:nowrap">
          ${countryFlag}
          ${logo}
          <span class="lg-hdr-name" style="white-space:nowrap;font-size:13px;font-weight:500">${fullName}</span>
          ${starBtn}
          ${liveBadge}
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <span class="lg-arrow">▾</span>
        </div>
      </div>
      <div class="lg-body">${g.matches.map(m => renderRow(m, isLive)).join('')}</div>
    </div>`;
}

/* Favori toggle — lig başlığındaki yıldızdan çağrılır */
function _toggleFavFromHeader(el) {
  const name = el.dataset.league;
  const favs = toggleFavLeague(name);
  const nowFav = favs.includes(name);
  el.textContent = nowFav ? '⭐' : '☆';
  el.style.opacity = nowFav ? '1' : '0.3';
  el.title = nowFav ? 'Favoriden çıkar' : 'Favorilere ekle';
  /* Sidebar'ı da güncelle */
  buildSidebarLeagues(S.allLeagues);
  /* Listeyi yeniden sırala ve renderla (mevcut sayfada) */
  S.allLeagues = _sortLeagueGroups(S.allLeagues);
  setMatchesHTML(S.allLeagues.map(g => renderGroup(g, S.page === 'live')).join(''));
  applyFilter();
}

function renderRow(m, isLive) {
  const st = statusInfo(m);

  const DONE  = new Set(['FT','AET','PEN']);
  const LIVE2 = new Set(['1H','2H','HT','ET','BT','P','LIVE']);
  const isNS  = !LIVE2.has(m.status_short) && !DONE.has(m.status_short);

  const hs = isNS ? 'v' : (m.home_score != null ? m.home_score : '-');
  const as = isNS ? ''  : (m.away_score != null ? m.away_score : '-');

  let hcls = '', acls = '';
  if (!isNS && st.cls === 'done' && hs !== '-' && as !== '-') {
    if      (+hs > +as) { hcls = 'bold'; acls = 'dim'; }
    else if (+as > +hs) { acls = 'bold'; hcls = 'dim'; }
  }

  const hLogo = m.home_logo
    ? `<img class="mr-logo" src="${esc(m.home_logo)}" onerror="this.style.display='none'" alt="">`
    : `<div class="mr-logo-ph"></div>`;
  const aLogo = m.away_logo
    ? `<img class="mr-logo" src="${esc(m.away_logo)}" onerror="this.style.display='none'" alt="">`
    : `<div class="mr-logo-ph"></div>`;

  const sbCls = st.live ? 'mr-sb live' : (isNS ? 'mr-sb ns' : 'mr-sb');
  const extra = m.visual_url
    ? `<span class="mr-tv">TV</span>`
    : `<span class="mr-arr">›</span>`;

  /* ── GOL VURGUSU: sadece realtime skor değişiminde aktif ── */
  const gd = S.lastGoals[String(m.fixture_id)];
  const homeScored = !!(gd?.home);
  const awayScored = !!(gd?.away);

  return `
    <div class="mr ${st.live ? 'is-live' : ''}" data-id="${m.fixture_id}"
         onclick="openDetail(${m.fixture_id},${st.live})">
      <div class="mr-time">
        <span class="mr-t1 ${st.cls}">${st.label}</span>
        ${st.live ? `<span class="mr-t2"></span>` : ''}
      </div>
      <div class="mr-home${homeScored ? ' goal-band' : ''}">
        <span class="mr-name ${hcls}">${esc(m.home_team||'')}</span>
        <div class="mr-logo-wrap">${hLogo}</div>
      </div>
      <div class="mr-score">
        <div class="${sbCls}">
          ${homeScored ? `<span class="mr-ball">⚽</span>` : ''}
          <span class="mr-n">${hs}</span>
          ${isNS ? '' : '<div class="mr-sep"></div>'}
          ${isNS ? '' : `<span class="mr-n">${as}</span>`}
          ${awayScored ? `<span class="mr-ball">⚽</span>` : ''}
        </div>
      </div>
      <div class="mr-away${awayScored ? ' goal-band' : ''}">
        <div class="mr-logo-wrap">${aLogo}</div>
        <span class="mr-name ${acls}">${esc(m.away_team||'')}</span>
      </div>
      <div class="mr-x">${extra}</div>
    </div>`;
}

/* ── SIDEBAR LEAGUES ─────────────────────────── */
/* FIX: Lig isimleri yatay chip/pill olarak akıyor */
function buildSidebarLeagues(groups) {
  const el = document.getElementById('sb-league-list');
  el.innerHTML = '';

  /* Wrapper'ı flex-wrap yap */
  el.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:8px 4px;';

  const allBtn = document.createElement('div');
  allBtn.className = 'sb-lg-item' + (S.league === 'all' ? ' active' : '');
  /* Chip stili: satır sayısını sıfırla, yatay hizala */
  allBtn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;cursor:pointer;white-space:nowrap;font-size:12px;';
  allBtn.innerHTML = `<span class="sb-lg-n">Tüm Ligler</span><span class="sb-lg-ct">${groups.reduce((a,g)=>a+g.matches.length,0)}</span>`;
  allBtn.addEventListener('click', () => { setLeague('all'); if(window.innerWidth<=680) toggleSidebar(); });
  el.appendChild(allBtn);

  /* ▼ YENİ: Sidebar'da da favori → tier 1 → tier 2 → diğer sırasıyla göster ▼ */
  const sorted = _sortLeagueGroups(groups);

  sorted.forEach(g => {
    const fav = isFavLeague(g.name);
    const item = document.createElement('div');
    item.className = 'sb-lg-item' + (S.league === g.name ? ' active' : '');
    item.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;cursor:pointer;white-space:nowrap;font-size:12px;';
    item.innerHTML = `
      ${fav ? '<span style="font-size:10px;">⭐</span>' : ''}
      ${g.logo ? `<img src="${esc(g.logo)}" width="14" height="14" style="flex-shrink:0" onerror="this.style.display='none'" alt="">` : ''}
      <span class="sb-lg-n">${esc(g.name)}</span>
      <span class="sb-lg-ct">${g.matches.length}</span>`;
    item.addEventListener('click', () => { setLeague(g.name); if(window.innerWidth<=680) toggleSidebar(); });
    el.appendChild(item);
  });
}

function setLeague(name) {
  S.league = name;
  document.querySelectorAll('.sb-lg-item').forEach(el => {
    const lg = el.querySelector('.sb-lg-n')?.textContent?.trim();
    const isAll = name === 'all' && lg === 'Tüm Ligler';
    el.classList.toggle('active', isAll || lg === name);
  });
  applyFilter();
}

function applyFilter() {
  document.querySelectorAll('.lg-grp').forEach(el => {
    el.style.display = (S.league === 'all' || el.dataset.league === S.league) ? '' : 'none';
  });
}

/* ── DETAIL ──────────────────────────────────── */
async function loadDetail(id, isLive) {
  setDetailHTML(`<div class="empty" style="min-height:160px"><div class="empty-i">⚽</div></div>`);
  try {

    /* ── ARŞİV CACHE kontrolü ──────────────────────────────────────
       Geçmiş tarih seçildiyse Supabase'e gitmeden cache'ten oku    */
    const cached = S.archiveCache[String(id)];
    if (cached) {
      const m    = normFix(cached);
      const evs  = archiveAdaptEvents(cached.events);
      const stats = archiveAdaptStats(cached.stats);
      const lus  = archiveAdaptLineups(cached.lineups, cached);
      const h2h  = archiveAdaptH2H(cached.h2h);
      buildDetail(m, evs, stats, lus, h2h, null, null);
      return;
    }

    /* ── Normal akış: Supabase ────────────────────────────────────── */
    let m = null;
    const tables = isLive
      ? ['live_matches','daily_matches','future_matches']
      : ['daily_matches','live_matches','future_matches'];

    for (const tbl of tables) {
      const { data, error } = await S.sb
        .from(tbl).select('*').eq('fixture_id', id).maybeSingle();
      if (error) { console.warn('[Detail]', tbl, error.message); continue; }
      if (data)  { m = data; break; }
    }

    if (!m) {
      setDetailHTML('<div class="empty"><div class="empty-t">Maç bulunamadı</div></div>');
      return;
    }

    if (m.data && typeof m.data === 'object') {
      const nested = Array.isArray(m.data) ? m.data[0] : m.data;
      if (nested) m = { ...m, ...normFix(nested) };
    }

    const sq = async (query) => {
      try {
        const res = await query;
        if (res.error) console.warn('[sq error]', res.error.message);
        return res;
      } catch { return { data: null }; }
    };

    console.log('[H2H] home_team_id:', m.home_team_id, 'away_team_id:', m.away_team_id);

    const [
      { data: evs  },
      { data: stats },
      { data: lus  },
      { data: h2h  },
      { data: pred },
      { data: odds },
    ] = await Promise.all([
      sq(S.sb.from('match_events').select('*').eq('fixture_id', id).order('elapsed_time')),
      sq(S.sb.from('match_statistics').select('*').eq('fixture_id', id).maybeSingle()),
      sq(S.sb.from('match_lineups').select('*').eq('fixture_id', id).maybeSingle()),
sq(S.sb.from('match_h2h').select('*')
  .or(`h2h_key.eq.${m.home_team_id}-${m.away_team_id},h2h_key.eq.${m.away_team_id}-${m.home_team_id}`)
  .limit(1)
  .then(r => ({ data: r.data?.[0] ?? null, error: r.error }))
),      sq(S.sb.from('match_predictions').select('*').eq('fixture_id', id).maybeSingle()),
      sq(S.sb.from('match_odds').select('*').eq('fixture_id', Number(id)).maybeSingle()),
    ]);

    buildDetail(m, evs||[], stats, lus, h2h, pred, odds);
  } catch (e) {
    console.error(e);
    setDetailHTML(`<div class="empty"><div class="empty-t">Hata: ${esc(e.message)}</div></div>`);
  }
}

function scaleVisualIframe() {
  var wrap   = document.querySelector('.d-visual-iframe-wrap');
  var iframe = document.querySelector('.d-visual-iframe');
  if (!wrap || !iframe) return;

  // Layout'u zorla hesaplat
  void wrap.offsetWidth;
  var wrapW = wrap.getBoundingClientRect().width;
  if (!wrapW || wrapW < 10) return;

  // Tracker gerçek boyutu: 600 × 400 (skor bar + saha birlikte)
  var NATIVE_W = 600;
  var NATIVE_H = 400;

  var scale = wrapW / NATIVE_W;

  wrap.style.height   = Math.round(NATIVE_H * scale) + 'px';
  wrap.style.overflow = 'hidden';

  iframe.style.width           = NATIVE_W + 'px';
  iframe.style.height          = NATIVE_H + 'px';
  iframe.style.transformOrigin = '0 0';
  iframe.style.transform       = 'scale(' + scale + ')';
}

function _scheduleVisualScale() {
  // pushState sonrası layout gecikmesi için daha uzun süreler
  [50, 200, 600, 1500].forEach(function(ms) { setTimeout(scaleVisualIframe, ms); });
}

function buildDetail(m, evs, stats, lus, h2h, pred, odds) {
  const st = statusInfo(m);
  const hs = m.home_score ?? '-', as = m.away_score ?? '-';

  try {
    if (typeof Router !== 'undefined') {
      Router.goMatch(m.fixture_id, m.home_team, m.away_team);
      const kickoff = m.kickoff_time || m.fixture_date || m.match_date || m.event_date || null;
      /* status_short doğrudan iletiliyor — LiveBlogPosting ve CANLI etiketi için gerekli */
      Router.setMatchMeta(m.home_team, m.away_team, m.home_score, m.away_score, m.league_name, m.status_short || null, m.fixture_id, kickoff, m.home_logo, m.away_logo);
    }
  } catch(e) {}

  /* ── Anlık indeksleme sinyali ───────────────────────────────────────
     Canlı maçlarda Google Indexing API + IndexNow'a ping gönderir.
     Indexing nesnesi yüklü değilse (INDEXING_EDGE_URL / INDEXNOW_KEY
     ayarlanmamışsa) sessizce atlanır.
  ──────────────────────────────────────────────────────────────────── */
  try {
    if (typeof Indexing !== 'undefined') {
      const slug = (m.home_team && m.away_team)
        ? [m.home_team, m.away_team]
            .join('-vs-')
            .toLowerCase()
            .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
            .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 80)
        : null;
      Indexing.pingMatchPage(m.fixture_id, m.status_short, slug);
    }
  } catch(e) {}

  let html = `
    <div class="d-hero">
      <div class="d-league">
        ${m.league_logo ? `<img src="${esc(m.league_logo)}" width="16" height="16" onerror="this.style.display='none'" alt="">` : ''}
        <span class="d-league-n">${esc(m.league_name||'')}</span>
      </div>
      <div class="d-teams">
        <div class="d-team">
          ${m.home_logo ? `<img class="d-logo" src="${esc(m.home_logo)}" onerror="this.style.display='none'" alt="">` : ''}
          <div class="d-tname">${esc(m.home_team||'')}</div>
        </div>
        <div class="d-center">
          <div class="d-score-box ${st.live?'live':''}">
            <span class="d-score-n">${hs}</span>
            <div class="d-score-sep"></div>
            <span class="d-score-n">${as}</span>
          </div>
          <div class="d-status ${st.cls}">${st.live ? `⚡ ${st.label}` : st.label}</div>
        </div>
        <div class="d-team">
          ${m.away_logo ? `<img class="d-logo" src="${esc(m.away_logo)}" onerror="this.style.display='none'" alt="">` : ''}
          <div class="d-tname">${esc(m.away_team||'')}</div>
        </div>
      </div>
    </div>`;

  html += `
    <div class="d-visual">
      <div class="d-visual-hdr">
        <div class="d-visual-hdr-l">📺 Canlı Görsel</div>
        ${m.visual_url ? `<span class="d-visual-live">LIVE</span>` : ''}
      </div>
      ${m.visual_url
        ? `<div class="d-visual-iframe-wrap"><iframe class="d-visual-iframe" src="${esc(m.visual_url)}" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe></div>`
        : `<div class="d-visual-empty">📡<span>Görsel stream mevcut değil</span></div>`}
    </div>`;

  html += `
    <div class="d-tabs">
      <div class="d-tab active" onclick="switchTab('ev',this)">Olaylar</div>
      <div class="d-tab" onclick="switchTab('st',this)">İstatistik</div>
      <div class="d-tab" onclick="switchTab('or',this)">Oranlar</div>
      <div class="d-tab" onclick="switchTab('lu',this)">Kadro</div>
      <div class="d-tab" onclick="switchTab('h2',this)">H2H</div>
      <div class="d-tab" onclick="switchTab('fr',this)">Forum</div>
    </div>`;

  html += `<div class="d-panel active" id="d-ev">`;

   // ── MAÇ BİLGİ KARTI ── buraya ekle
const kickoff = m.kickoff_time || null;
const kickoffFmt = kickoff ? new Date(kickoff).toLocaleString('tr-TR', {
  day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit',
  timeZone:'Europe/Istanbul'
}) : null;
let referee = null, venue = null, city = null;
try {
  const raw = m.raw_data ? JSON.parse(m.raw_data) : null;
  referee = raw?.fixture?.referee || null;
  venue   = raw?.fixture?.venue?.name || null;
  city    = raw?.fixture?.venue?.city || null;
} catch(e) {}

   console.log('[MIC] kickoff:', m.kickoff_time, 'referee:', referee, 'venue:', venue, 'raw_data var mı:', !!m.raw_data);


html += `<div class="match-info-card">
  ${kickoffFmt ? `<div class="mic-item">
    <span class="mic-icon">🕐</span>
    <span class="mic-text">${kickoffFmt}</span>
  </div>` : ''}
  ${referee ? `<div class="mic-item">
    <span class="mic-icon">🟡</span>
    <span class="mic-text">${esc(referee)}</span>
  </div>` : ''}
  ${venue ? `<div class="mic-item">
    <span class="mic-icon">🏟️</span>
    <span class="mic-text">${esc(venue)}${city ? `, ${esc(city)}` : ''}</span>
  </div>` : ''}
</div>`;
   
  if (!evs.length) {
    html += `<div class="ev-list"><div class="ev-none">Henüz olay yok</div></div>`;
  } else {
    html += `<div class="ev-list">`;
    evs.forEach(e => {
      const home = e.team_id == m.home_team_id;
      const ic = evIcon(e.event_type, e.event_detail);
      const icCls = evCls(e.event_type, e.event_detail);
      const t = e.elapsed_time ? `${e.elapsed_time}${e.extra_time?'+'+e.extra_time:''}'` : '';
      html += `
        <div class="ev-row">
          <div class="ev-t">${t}</div>
          <div class="ev-body ${home?'':'rev'}">
            <div class="ev-ico ${icCls}">${ic}</div>
            <div>
              <div class="ev-pl">${esc(e.player_name||'')}</div>
              ${e.assist_name ? `<div class="ev-dt">⤷ ${esc(e.assist_name)}</div>` : ''}
              ${e.event_detail ? `<div class="ev-dt">${esc(e.event_detail)}</div>` : ''}
            </div>
          </div>
          <div class="ev-team ${home?'home':''}">${esc(e.team_name||'')}</div>
        </div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  html += `<div class="d-panel" id="d-st">`;
  const sd = parseStatsData(stats);
  if (sd && sd.home.length && sd.away.length) {
    html += `<div class="st-panel">`;
    sd.home.forEach((r, i) => {
      const ar    = sd.away[i];
      const hvRaw = r.value   ?? 0;
      const avRaw = ar?.value ?? 0;
      const hvn = parseFloat(String(hvRaw).replace('%','')) || 0;
      const avn = parseFloat(String(avRaw).replace('%','')) || 0;
      const tot = hvn + avn;
      const pct = tot > 0 ? Math.round(hvn / tot * 100) : 50;
      html += `
        <div class="st-row">
          <div class="st-v h">${hvRaw}</div>
          <div class="st-mid">
            <div class="st-name">${esc(r.type||'')}</div>
            <div class="st-bar-row">
              <div class="st-bh" style="width:${pct}%"></div>
              <div class="st-ba" style="width:${100-pct}%"></div>
            </div>
          </div>
          <div class="st-v a">${avRaw}</div>
        </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="empty"><div class="empty-t">İstatistik mevcut değil</div></div>`;
  }
  html += `</div>`;

  /* ── ORANLAR PANELİ ────────────────────────── */
html += `<div class="d-panel" id="d-or">`;
const od = odds?.odds_data ?? null;

if (od && od.markets) {
  const mk = od.markets;
  const src = od.source || 'İddaa / Nesine';
  const updAt = odds.updated_at
    ? new Date(odds.updated_at).toLocaleString('tr-TR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})
    : '';
  const homeN = esc(m.home_team || '');
  const awayN = esc(m.away_team || '');

  /* ── Yardımcı: tek bir oran kartı ── */
  const cell = (lbl, val) => {
    const v = +val || 0;
    const cls = v >= 3 ? 'high' : v >= 1.8 ? 'mid' : 'low';
    return `<div class="or2-cell">
      <div class="or2-lbl">${lbl}</div>
      <div class="or2-val ${cls}">${v > 0 ? v.toFixed(2) : '-'}</div>
    </div>`;
  };

  /* ── Yardımcı: market satırı (başlık + hücreler) ── */
  const marketRow = (title, cells) =>
    `<div class="or2-market">
      <div class="or2-mkt-title">${title}</div>
      <div class="or2-cells" style="grid-template-columns:repeat(${cells.length},1fr)">
        ${cells.join('')}
      </div>
    </div>`;

  /* ── Yardımcı: accordion grup ── */
  let grpIdx = 0;
  const group = (icon, title, content, openByDefault = false) => {
    const id = `or2g${grpIdx++}`;
    return `
      <div class="or2-group ${openByDefault ? 'open' : ''}">
        <div class="or2-group-hdr" onclick="this.closest('.or2-group').classList.toggle('open')">
          <span class="or2-group-icon">${icon}</span>
          <span class="or2-group-title">${title}</span>
          <span class="or2-group-arrow">›</span>
        </div>
        <div class="or2-group-body">${content}</div>
      </div>`;
  };

  html += `<div class="or2-wrap">`;

  /* ── KAYNAK BAR ── */
  html += `
    <div class="or2-src-bar">
      <span class="or2-badge">ORANLAR</span>
      <span class="or2-src">${esc(src)}</span>
      ${updAt ? `<span class="or2-upd">🕐 ${updAt}</span>` : ''}
    </div>`;

  /* ══════════════════════════════════════
     GRUP 1: MAÇ SONUCU
  ══════════════════════════════════════ */
  {
    let g1 = '';
    if (mk['1x2']) {
      const o = mk['1x2'];
      g1 += marketRow('Maç Sonucu', [cell(homeN,o.home), cell('X',o.draw), cell(awayN,o.away)]);
    }
    if (mk['dc']) {
      const o = mk['dc'];
      g1 += marketRow('Çifte Şans', [cell('1X',o['1x']), cell('12',o['12']), cell('X2',o['x2'])]);
    }
    /* Handikap — tüm çizgiler */
    const ahKeys = Object.keys(mk).filter(k => k.startsWith('ah_')).sort();
    ahKeys.forEach(k => {
      const o = mk[k];
      const line = o.line !== undefined ? o.line : k.replace('ah_p','+').replace('ah_m','-').replace('_','.');
      g1 += marketRow(`Handikap (${line})`, [cell(homeN,o.home), cell('X',o.draw), cell(awayN,o.away)]);
    });
    if (mk['ht_ft']) {
      const o = mk['ht_ft'];
      g1 += marketRow('İY / Maç Sonucu', [
        cell('1/1',o['1/1']), cell('1/X',o['1/X']), cell('1/2',o['1/2']),
        cell('X/1',o['X/1']), cell('X/X',o['X/X']), cell('X/2',o['X/2']),
        cell('2/1',o['2/1']), cell('2/X',o['2/X']), cell('2/2',o['2/2']),
      ]);
    }
    if (mk['win_margin']) {
      const o = mk['win_margin'];
      g1 += marketRow('Kaç Farkla Kazanır', [
        cell(`${homeN} 3+`,o.h3p), cell(`${homeN} 2`,o.h2), cell(`${homeN} 1`,o.h1),
        cell('Ber.',o.draw), cell(`${awayN} 1`,o.a1), cell(`${awayN} 2`,o.a2), cell(`${awayN} 3+`,o.a3p),
      ]);
    }
    if (mk['ms_ou15']) {
      const o = mk['ms_ou15'];
      g1 += marketRow('MS + 1.5 Alt/Üst', [
        cell(`${homeN}&Alt`,o.h_u), cell('X&Alt',o.x_u), cell(`${awayN}&Alt`,o.a_u),
        cell(`${homeN}&Üst`,o.h_o), cell('X&Üst',o.x_o), cell(`${awayN}&Üst`,o.a_o),
      ]);
    }
    if (mk['ms_ou25']) {
      const o = mk['ms_ou25'];
      g1 += marketRow('MS + 2.5 Alt/Üst', [
        cell(`${homeN}&Alt`,o.h_u), cell('X&Alt',o.x_u), cell(`${awayN}&Alt`,o.a_u),
        cell(`${homeN}&Üst`,o.h_o), cell('X&Üst',o.x_o), cell(`${awayN}&Üst`,o.a_o),
      ]);
    }
    if (mk['ms_ou35']) {
      const o = mk['ms_ou35'];
      g1 += marketRow('MS + 3.5 Alt/Üst', [
        cell(`${homeN}&Alt`,o.h_u), cell('X&Alt',o.x_u), cell(`${awayN}&Alt`,o.a_u),
        cell(`${homeN}&Üst`,o.h_o), cell('X&Üst',o.x_o), cell(`${awayN}&Üst`,o.a_o),
      ]);
    }
    if (mk['ms_ou45']) {
      const o = mk['ms_ou45'];
      g1 += marketRow('MS + 4.5 Alt/Üst', [
        cell(`${homeN}&Alt`,o.h_u), cell('X&Alt',o.x_u), cell(`${awayN}&Alt`,o.a_u),
        cell(`${homeN}&Üst`,o.h_o), cell('X&Üst',o.x_o), cell(`${awayN}&Üst`,o.a_o),
      ]);
    }
    if (mk['ms_kg']) {
      const o = mk['ms_kg'];
      g1 += marketRow('MS + Karşılıklı Gol', [
        cell(`${homeN}&Var`,o.h_y), cell('X&Var',o.x_y), cell(`${awayN}&Var`,o.a_y),
        cell(`${homeN}&Yok`,o.h_n), cell('X&Yok',o.x_n), cell(`${awayN}&Yok`,o.a_n),
      ]);
    }
    if (g1) html += group('⚽', 'Maç Sonucu', g1, true);
  }

  /* ══════════════════════════════════════
     GRUP 2: ALT / ÜST
  ══════════════════════════════════════ */
  {
    let g2 = '';
    ['ou15','ou25','ou35','ou45','ou55'].forEach(k => {
      if (!mk[k]) return;
      const n = k.replace('ou','').replace(/(\d)(\d)/,'$1.$2');
      g2 += marketRow(`${n} Gol Alt/Üst`, [cell(`Alt ${n}`,mk[k].under), cell(`Üst ${n}`,mk[k].over)]);
    });
    if (mk['ou25_kg']) {
      const o = mk['ou25_kg'];
      g2 += marketRow('2.5 Alt/Üst + KG', [cell('Alt&Var',o.u_y), cell('Üst&Var',o.o_y), cell('Alt&Yok',o.u_n), cell('Üst&Yok',o.o_n)]);
    }
    if (mk['goal_range']) {
      const o = mk['goal_range'];
      g2 += marketRow('Toplam Gol Aralığı', [cell('0-1',o['0_1']), cell('2-3',o['2_3']), cell('4-5',o['4_5']), cell('6+',o['6p'])]);
    }
    if (mk['odd_even']) {
      g2 += marketRow('Tek / Çift', [cell('Tek',mk['odd_even'].odd), cell('Çift',mk['odd_even'].even)]);
    }
    if (g2) html += group('📊', 'Alt / Üst & Toplam Gol', g2, true);
  }

  /* ══════════════════════════════════════
     GRUP 3: YARI
  ══════════════════════════════════════ */
  {
    let g3 = '';
    if (mk['ht_1x2']) {
      const o = mk['ht_1x2'];
      g3 += marketRow('1. Yarı Sonucu', [cell(homeN,o.home), cell('X',o.draw), cell(awayN,o.away)]);
    }
    if (mk['ht_dc']) {
      const o = mk['ht_dc'];
      g3 += marketRow('1. Yarı Çifte Şans', [cell('1X',o['1x']), cell('12',o['12']), cell('X2',o['x2'])]);
    }
    if (mk['2h_1x2']) {
      const o = mk['2h_1x2'];
      g3 += marketRow('2. Yarı Sonucu', [cell(homeN,o.home), cell('X',o.draw), cell(awayN,o.away)]);
    }
    if (mk['home_win_both']) {
      g3 += marketRow(`${homeN} Her İki Yarıyı Kazanır`, [cell('Evet',mk['home_win_both'].yes), cell('Hayır',mk['home_win_both'].no)]);
    }
    if (mk['away_win_both']) {
      g3 += marketRow(`${awayN} Her İki Yarıyı Kazanır`, [cell('Evet',mk['away_win_both'].yes), cell('Hayır',mk['away_win_both'].no)]);
    }
    if (mk['ht_ms_ou15']) {
      const o = mk['ht_ms_ou15'];
      g3 += marketRow('1Y Sonucu + 1Y 1.5 Alt/Üst', [
        cell(`${homeN}&Alt`,o.h_u), cell('X&Alt',o.x_u), cell(`${awayN}&Alt`,o.a_u),
        cell(`${homeN}&Üst`,o.h_o), cell('X&Üst',o.x_o), cell(`${awayN}&Üst`,o.a_o),
      ]);
    }
    if (mk['ht_ms_kg']) {
      const o = mk['ht_ms_kg'];
      g3 += marketRow('1Y Sonucu + 1Y KG', [
        cell(`${homeN}&Var`,o.h_y), cell('X&Var',o.x_y), cell(`${awayN}&Var`,o.a_y),
        cell(`${homeN}&Yok`,o.h_n), cell('X&Yok',o.x_n), cell(`${awayN}&Yok`,o.a_n),
      ]);
    }
    /* 1Y Alt/Üst */
    ['ht_ou05','ht_ou15','ht_ou25'].forEach(k => {
      if (!mk[k]) return;
      const n = k.replace('ht_ou','').replace(/(\d)(\d)/,'$1.$2');
      g3 += marketRow(`1Y ${n} Gol Alt/Üst`, [cell(`Alt ${n}`,mk[k].under), cell(`Üst ${n}`,mk[k].over)]);
    });
    if (mk['ht_odd_even']) {
      g3 += marketRow('1Y Tek / Çift', [cell('Tek',mk['ht_odd_even'].odd), cell('Çift',mk['ht_odd_even'].even)]);
    }
    if (mk['both_half_u15']) {
      g3 += marketRow('İki Yarı da 1.5 Alt', [cell('Evet',mk['both_half_u15'].yes), cell('Hayır',mk['both_half_u15'].no)]);
    }
    if (mk['both_half_o15']) {
      g3 += marketRow('İki Yarı da 1.5 Üst', [cell('Evet',mk['both_half_o15'].yes), cell('Hayır',mk['both_half_o15'].no)]);
    }
    if (mk['more_goals_half']) {
      const o = mk['more_goals_half'];
      g3 += marketRow('En Çok Gol Olacak Yarı', [cell('1. Yarı',o.first), cell('Eşit',o.equal), cell('2. Yarı',o.second)]);
    }
    if (g3) html += group('🕐', 'Yarı Marketleri', g3);
  }

  /* ══════════════════════════════════════
     GRUP 4: GOL
  ══════════════════════════════════════ */
  {
    let g4 = '';
    if (mk['btts']) {
      g4 += marketRow('Karşılıklı Gol', [cell('Var',mk['btts'].yes), cell('Yok',mk['btts'].no)]);
    }
    if (mk['ht_btts']) {
      g4 += marketRow('1Y Karşılıklı Gol', [cell('Var',mk['ht_btts'].yes), cell('Yok',mk['ht_btts'].no)]);
    }
    if (mk['2h_btts']) {
      g4 += marketRow('2Y Karşılıklı Gol', [cell('Var',mk['2h_btts'].yes), cell('Yok',mk['2h_btts'].no)]);
    }
    if (mk['halves_btts']) {
      const o = mk['halves_btts'];
      g4 += marketRow('1Y/2Y Karşılıklı Gol', [cell('Evet/Evet',o.yy), cell('Evet/Hayır',o.yn), cell('Hayır/Evet',o.ny), cell('Hayır/Hayır',o.nn)]);
    }
    if (mk['first_goal']) {
      const o = mk['first_goal'];
      g4 += marketRow('İlk Golü Kim Atar', [cell(homeN,o.home), cell('Olmaz',o.none), cell(awayN,o.away)]);
    }
    if (mk['home_score_both']) {
      g4 += marketRow(`${homeN} Her İki Yarıda Gol`, [cell('Atar',mk['home_score_both'].yes), cell('Atmaz',mk['home_score_both'].no)]);
    }
    if (mk['away_score_both']) {
      g4 += marketRow(`${awayN} Her İki Yarıda Gol`, [cell('Atar',mk['away_score_both'].yes), cell('Atmaz',mk['away_score_both'].no)]);
    }
    if (mk['home_more_goals_half']) {
      const o = mk['home_more_goals_half'];
      g4 += marketRow(`${homeN} Hangi Yarıda Daha Çok Gol`, [cell('1. Yarı',o.first), cell('Eşit',o.equal), cell('2. Yarı',o.second)]);
    }
    if (mk['away_more_goals_half']) {
      const o = mk['away_more_goals_half'];
      g4 += marketRow(`${awayN} Hangi Yarıda Daha Çok Gol`, [cell('1. Yarı',o.first), cell('Eşit',o.equal), cell('2. Yarı',o.second)]);
    }
    if (g4) html += group('🎯', 'Gol Marketleri', g4);
  }

  /* ══════════════════════════════════════
     GRUP 5: TARAF ALT/ÜST
  ══════════════════════════════════════ */
  {
    let g5 = '';
    [
      ['h_ou05',`${homeN} 0.5`], ['h_ou15',`${homeN} 1.5`], ['h_ou25',`${homeN} 2.5`],
      ['a_ou05',`${awayN} 0.5`], ['a_ou15',`${awayN} 1.5`], ['a_ou25',`${awayN} 2.5`],
      ['h_ht_ou05',`${homeN} 1Y 0.5`], ['a_ht_ou05',`${awayN} 1Y 0.5`],
    ].forEach(([k, lbl]) => {
      if (!mk[k]) return;
      g5 += marketRow(`${lbl} Gol Alt/Üst`, [cell('Alt',mk[k].under), cell('Üst',mk[k].over)]);
    });
    if (g5) html += group('⚖️', 'Taraf Alt / Üst', g5);
  }

  html += `</div>`; /* or2-wrap */
} else {
  html += `<div class="empty"><div class="empty-t">Oran verisi henüz mevcut değil</div></div>`;
}
html += `</div>`; /* d-or panel */

  html += `<div class="d-panel" id="d-lu">`;
  const ld = lus?.data;
  if (ld && Array.isArray(ld) && ld.length >= 2) {
    html += `<div class="lu-grid">`;
    ld.slice(0,2).forEach(team => {
      html += `
        <div class="lu-card">
          <div class="lu-hdr">
            ${team.team?.logo ? `<img src="${esc(team.team.logo)}" onerror="this.style.display='none'" alt="">` : ''}
            ${esc(team.team?.name||'')}
          </div>`;
      (team.startXI||[]).forEach(p => {
        const pl = p.player;
        html += `<div class="lu-pl"><span class="lu-num">${pl?.number||''}</span><span class="lu-n">${esc(pl?.name||'')}</span><span class="lu-pos">${pl?.pos||''}</span></div>`;
      });
      if ((team.substitutes||[]).length) {
        html += `<div class="lu-sub-lbl">Yedekler</div>`;
        team.substitutes.forEach(p => {
          const pl = p.player;
          html += `<div class="lu-pl" style="opacity:.55"><span class="lu-num">${pl?.number||''}</span><span class="lu-n">${esc(pl?.name||'')}</span><span class="lu-pos">${pl?.pos||''}</span></div>`;
        });
      }
      html += `</div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="empty"><div class="empty-t">Kadro bilgisi mevcut değil</div></div>`;
  }
  html += `</div>`;

  html += `<div class="d-panel" id="d-h2">`;
  const raw = h2h?.data;
  const hd   = Array.isArray(raw?.h2h)       ? raw.h2h       : [];
  const hf   = Array.isArray(raw?.homeForm)   ? raw.homeForm  : [];
  const af   = Array.isArray(raw?.awayForm)   ? raw.awayForm  : [];
  const hsc  = Array.isArray(raw?.homeScorers)? raw.homeScorers: [];
  const asc  = Array.isArray(raw?.awayScorers)? raw.awayScorers: [];

  if (hd.length) {
    html += `<div class="h2h-section-title">🆚 Karşılaşmalar</div><div class="h2h-list">`;
    hd.slice(-10).reverse().forEach(hm => {
      const dt  = hm.date || '';
      const htn = esc(hm.homeTeam || '');
      const atn = esc(hm.awayTeam || '');
      const hg  = hm.homeGoals ?? '-';
      const ag  = hm.awayGoals ?? '-';
      html += `
        <div class="h2h-row">
          <div class="h2h-d">${dt}</div>
          <div class="h2h-t">${htn}</div>
          <div class="h2h-sc">${hg} - ${ag}</div>
          <div class="h2h-t r">${atn}</div>
        </div>`;
    });
    html += `</div>`;
  }

  const renderForm = (form, title) => {
    if (!form.length) return '';
    let s = `<div class="h2h-section-title">${title}</div><div class="h2h-list">`;
    form.forEach(fm => {
      const resCls = fm.result === 'W' ? 'h2h-res w' : fm.result === 'L' ? 'h2h-res l' : 'h2h-res d';
      s += `
        <div class="h2h-row">
          <div class="h2h-d">${esc(fm.date || '')}</div>
          <div class="h2h-t">${esc(fm.homeTeam || '')}</div>
          <div class="h2h-sc">${fm.homeGoals ?? '-'} - ${fm.awayGoals ?? '-'}</div>
          <div class="h2h-t r">${esc(fm.awayTeam || '')}</div>
          <div class="${resCls}">${esc(fm.result || '')}</div>
        </div>`;
    });
    s += `</div>`;
    return s;
  };

  html += renderForm(hf, `🏠 ${esc(m.home_team)} Son 10 Maç`);
  html += renderForm(af, `✈️ ${esc(m.away_team)} Son 10 Maç`);

  const renderScorers = (scorers, title) => {
    if (!scorers.length) return '';
    let s = `<div class="h2h-section-title">${title}</div><div class="h2h-scorers">`;
    scorers.forEach(sc => {
      s += `<div class="h2h-scorer-row"><span class="h2h-scorer-n">${esc(sc.name || '')}</span><span class="h2h-scorer-g">${sc.goals ?? 0} ⚽</span></div>`;
    });
    s += `</div>`;
    return s;
  };

  html += renderScorers(hsc, `🏠 ${esc(m.home_team)} Gol Krallığı`);
  html += renderScorers(asc, `✈️ ${esc(m.away_team)} Gol Krallığı`);

  if (!hd.length && !hf.length && !af.length) {
    html += `<div class="empty"><div class="empty-t">H2H verisi yok</div></div>`;
  }

  html += `</div>`;

  html += `<div class="d-panel" id="d-fr"></div>`;

  setDetailHTML(html);
  Forum.open(m.fixture_id);

  // iframe'i container'a sığacak şekilde ölçekle (3 farklı gecikme ile dene)
  _scheduleVisualScale();

  // Ekran döndürmede veya resize'da tekrar hesapla
  if (window._visualResizeHandler) {
    window.removeEventListener('resize', window._visualResizeHandler);
  }
  window._visualResizeHandler = function() { scaleVisualIframe(); };
  window.addEventListener('resize', window._visualResizeHandler);
}

/* ── STATS PARSER ──────────────────────────── */
function parseStatsData(row) {
  if (!row) return null;
  const d = row.data;
  if (!d) return null;

  if (Array.isArray(d) && d[0]?.statistics) {
    const home = d[0].statistics;
    const away = d[1]?.statistics || [];
    if (home.length) return { home, away };
  }

  if (Array.isArray(d) && d[0]?.stats) {
    const home = d[0].stats;
    const away = d[1]?.stats || [];
    if (home.length) return { home, away };
  }

  if (Array.isArray(d) && d[0]?.type !== undefined &&
      ('home' in d[0] || 'away' in d[0] || 'homeVal' in d[0])) {
    return {
      home: d.map(s => ({ type: s.type, value: s.homeVal ?? s.home ?? 0 })),
      away: d.map(s => ({ type: s.type, value: s.awayVal ?? s.away ?? 0 })),
    };
  }

  if (Array.isArray(d) && d[0]?.type !== undefined && d[0]?.team_id !== undefined) {
    const ids = [...new Set(d.map(s => s.team_id))];
    const homeStats = d.filter(s => s.team_id === ids[0]).map(s => ({ type: s.type, value: s.value }));
    const awayStats = d.filter(s => s.team_id === ids[1]).map(s => ({ type: s.type, value: s.value }));
    if (homeStats.length) return { home: homeStats, away: awayStats };
  }

  if (d.home && d.away) return { home: d.home, away: d.away };

  console.warn('[Stats] Bilinmeyen format. data[0] keys:', Object.keys(d[0] || d));
  return null;
}

/* ── TAB SWITCH ─────────────────────────────── */
function switchTab(name, el) {
  document.querySelectorAll('.d-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.d-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('d-' + name);
  if (panel) panel.classList.add('active');
  if (name === 'fr') { try { Forum.scrollToBottom(); } catch(e) {} }
}

/* ── SILENT UPDATE ───────────────────────────── */
function silentUpdate(rows) {
  const DONE = new Set(['FT','AET','PEN']);
  rows.forEach(m => {
    const row = document.querySelector(`.mr[data-id="${m.fixture_id}"]`);
    if (!row) return;

    /* Maç bittiyse → satırı DOM'dan kaldır */
    if (DONE.has(m.status_short)) {
      const lgGrp = row.closest('.lg-grp');
      row.remove();
      /* Lig grubunda başka maç kalmadıysa onu da kaldır */
      if (lgGrp && !lgGrp.querySelector('.mr')) lgGrp.remove();
      return;
    }

    const st = statusInfo(m);
    const hs = m.home_score != null ? m.home_score : '-';
    const as = m.away_score != null ? m.away_score : '-';
    const nums = row.querySelectorAll('.mr-n');
    if (nums[0] && String(nums[0].textContent) !== String(hs)) { nums[0].textContent = hs; flashEl(nums[0]); }
    if (nums[1] && String(nums[1].textContent) !== String(as)) { nums[1].textContent = as; flashEl(nums[1]); }
    const tEl = row.querySelector('.mr-t1');
    if (tEl && tEl.textContent !== st.label) tEl.textContent = st.label;
  });
}

async function silentUpdateDetail() {
  if (!S.detail) return;
  const { data } = await S.sb
    .from('live_matches')
    .select('home_score,away_score,elapsed_time,status_short,updated_at,fixture_id')
    .eq('fixture_id', S.detail)
    .maybeSingle();
  if (!data) return;
  /* normFix üzerinden geçir — stale dedektörü buraya da etki eder */
  const m = normFix(data);
  const st = statusInfo(m);
  const nums = document.querySelectorAll('.d-score-n');
  if (nums[0]) nums[0].textContent = m.home_score ?? '-';
  if (nums[1]) nums[1].textContent = m.away_score ?? '-';
  const ste = document.querySelector('.d-status');
  if (ste) ste.textContent = st.live ? `⚡ ${st.label}` : st.label;
}

/* ── GOL FLASH ───────────────────────────────── */
/* Skor değişince çağrılır. 30 saniye sonra otomatik söner. */
const GOAL_FLASH_MS = 30000;

function _flashGoal(fixtureId, homeGoal, awayGoal) {
  const key = String(fixtureId);

  /* Varsa önceki timeout'u iptal et */
  if (S.lastGoals[key]?._timer) clearTimeout(S.lastGoals[key]._timer);

  const timer = setTimeout(() => {
    delete S.lastGoals[key];
    _clearGoalBand(key);
  }, GOAL_FLASH_MS);

  S.lastGoals[key] = { home: homeGoal, away: awayGoal, _timer: timer };

  /* DOM'u hemen güncelle */
  const row = document.querySelector(`.mr[data-id="${key}"]`);
  if (!row) return;
  _applyGoalBand(row, homeGoal, awayGoal);
}

function _applyGoalBand(row, homeGoal, awayGoal) {
  const homeDiv = row.querySelector('.mr-home');
  const awayDiv = row.querySelector('.mr-away');
  const scoreBox = row.querySelector('.mr-sb');

  row.querySelectorAll('.mr-ball').forEach(b => b.remove());

  homeDiv?.classList.toggle('goal-band', !!homeGoal);
  awayDiv?.classList.toggle('goal-band', !!awayGoal);

  if (scoreBox) {
    if (homeGoal) {
      const ball = document.createElement('span');
      ball.className = 'mr-ball'; ball.textContent = '⚽';
      scoreBox.prepend(ball);
    }
    if (awayGoal) {
      const ball = document.createElement('span');
      ball.className = 'mr-ball'; ball.textContent = '⚽';
      scoreBox.append(ball);
    }
  }
}

function _clearGoalBand(fixtureId) {
  const row = document.querySelector(`.mr[data-id="${fixtureId}"]`);
  if (!row) return;
  row.querySelector('.mr-home')?.classList.remove('goal-band');
  row.querySelector('.mr-away')?.classList.remove('goal-band');
  row.querySelectorAll('.mr-ball').forEach(b => b.remove());
}

function flashEl(el) {
  el.style.transition = 'none';
  el.style.color = 'var(--or)';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = 'color 1.8s ease';
    el.style.color = '';
  }));
}

/* ── REALTIME + CLOCK ────────────────────────── */

/* Supabase Realtime channel referansı */
S.realtimeChannel = null;

function _parseRealtimeRow(row) {
  /* Realtime payload.new — raw_data string ise parse et ve birleştir */
  if (row.raw_data) {
    try {
      const parsed = JSON.parse(row.raw_data);
      return normFix({ ...row, ...parsed });
    } catch(e) {}
  }
  if (row.data && typeof row.data === 'object') {
    const d = Array.isArray(row.data) ? row.data[0] : row.data;
    return normFix({ ...row, ...d });
  }
  return normFix(row);
}

function startRealtime() {
  if (S.realtimeChannel) {
    S.sb.removeChannel(S.realtimeChannel);
    S.realtimeChannel = null;
  }

  S.realtimeChannel = S.sb
    .channel('live-scores')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'live_matches',
    }, payload => {
      if (payload.eventType === 'DELETE') return;

      const m = _parseRealtimeRow(payload.new);

      /* Detay paneli açıksa → skor + dakika güncelle */
      if (S.detail && String(m.fixture_id) === String(S.detail)) {
        const nums = document.querySelectorAll('.d-score-n');
        if (nums[0]) { if (nums[0].textContent !== String(m.home_score ?? '-')) { nums[0].textContent = m.home_score ?? '-'; flashEl(nums[0]); } }
        if (nums[1]) { if (nums[1].textContent !== String(m.away_score ?? '-')) { nums[1].textContent = m.away_score ?? '-'; flashEl(nums[1]); } }
        const ste = document.querySelector('.d-status');
        const st = statusInfo(m);
        if (ste) ste.textContent = st.live ? `⚡ ${st.label}` : st.label;
        /* Maç FT/AET/PEN'e geçtiyse arka planda listeyi de güncelle (90' takılmasını önler) */
        if (!st.live) loadMatches(true);
        return;
      }

      /* Liste görünümü — sadece bu satırı güncelle, sayfayı yenileme */
      if (payload.eventType === 'INSERT') {
        loadMatches(true);
      } else {
        /* Skor değiştiyse → flash aç, 30sn sonra kapat */
        const row = document.querySelector(`.mr[data-id="${m.fixture_id}"]`);
        const prevH = row?.querySelector('.mr-n:first-of-type')?.textContent;
        const prevA = row?.querySelectorAll('.mr-n')?.[1]?.textContent;
        const newH  = String(m.home_score ?? '-');
        const newA  = String(m.away_score ?? '-');

        const homeGoal = prevH !== undefined && prevH !== newH && Number(newH) > Number(prevH);
        const awayGoal = prevA !== undefined && prevA !== newA && Number(newA) > Number(prevA);

        if (homeGoal || awayGoal) {
          _flashGoal(m.fixture_id, homeGoal, awayGoal);
        }

        silentUpdate([m]);
      }

      /* Canlı maç sayısını güncelle — DOM'a bağımlı değil */
      _fetchLiveCount();
    })
    .subscribe(status => {
      const el = document.getElementById('sb-cd');
      if (status === 'SUBSCRIBED') {
        /* Realtime bağlandı — polling'i durdur */
        if (S.timer) { clearInterval(S.timer); S.timer = null; }
        if (el) el.closest('.sb-ring-wrap') && (el.closest('.sb-ring-wrap').style.display = 'none');
        console.log('[Realtime] bağlandı ✓');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        /* Bağlantı koptu — polling'e geri dön */
        startClock();
        console.warn('[Realtime] koptu, polling başladı');
      }
    });
}

function stopRealtime() {
  if (S.realtimeChannel) {
    S.sb.removeChannel(S.realtimeChannel);
    S.realtimeChannel = null;
  }
}

/* Fallback: Realtime bağlanamadıysa 10 sn polling */
function startClock() {
  if (S.timer) clearInterval(S.timer);
  S.cd = 5;
  S.cycle = 5;
  updateRing(1);
  S.timer = setInterval(async () => {
    S.cd--;
    updateRing(S.cd / S.cycle);
    document.getElementById('sb-cd').textContent = S.cd;
    if (S.cd <= 0) {
      S.cd = S.cycle;
      /* Realtime bağlıysa polling gerekmez, sadece yedek */
      const isConnected = S.realtimeChannel?.state === 'joined';
      if (!isConnected) {
        if (S.detail) await silentUpdateDetail();
        else          await loadMatches(true);
      }
    }
  }, 1000);
}

function updateRing(frac) {
  const c = 50.3;
  const el = document.getElementById('sb-ring');
  if (el) el.style.strokeDashoffset = c * (1 - frac);
}

/* Canlı maç sayısını her zaman Supabase'den çek — hangi sayfada olursa olsun */
async function _fetchLiveCount() {
  try {
    const { count } = await S.sb
      .from('live_matches')
      .select('*', { count: 'exact', head: true })
      .in('status_short', ['1H','2H','HT','ET','BT','P','LIVE']);
    updLiveCt(count ?? 0);
  } catch (e) {
    console.warn('[LiveCount] hata:', e.message);
  }
}

function updLiveCt(n) {
  document.getElementById('sb-live-n').textContent = n;
  document.getElementById('tb-live-n').textContent = n;
}

/* ── STATUS ──────────────────────────────────── */
function statusInfo(m) {
  const s = m.status_short;
  const liveSet = new Set(['1H','2H','HT','ET','BT','P','LIVE']);
  const doneSet = new Set(['FT','AET','PEN']);
  if (liveSet.has(s)) {
    const label = s === 'HT' ? 'HT' : m.elapsed_time ? `${m.elapsed_time}'` : s;
    return { live: true, label, cls: 'live' };
  }
  if (doneSet.has(s)) return { live: false, label: 'MS', cls: 'done' };
  return { live: false, label: fmtKickoff(m), cls: 'sched' };
}

/* ── FIX: fmtKickoff — --:-- sorununu çözer ─── */
function fmtKickoff(m) {
  /* Önce fixture.date'e bak — future_matches burada tutuyor */
  const fixtureDate = m.fixture?.date || null;

  const candidates = [
    fixtureDate,
    m.kickoff_time, m.fixture_date,  m.match_time,
    m.event_date,   m.date_time,     m.start_time,
    m.event_time,   m.scheduled_at,  m.match_date,
    m.fixture_time, m.game_time,     m.time,
  ];
  /* Not: m.date kolonuna BAKMA — "2026-03-15" gibi saat içermeyen tarih */

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const v = raw.trim();
    if (!v) continue;

    /* Sadece "HH:MM" veya "HH:MM:SS" */
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) return v.slice(0, 5);

    /* Pure date "YYYY-MM-DD" — saat yok, atla */
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) continue;

    /* ISO datetime — "2026-03-15T20:00:00+03:00" gibi */
    try {
      const d = new Date(v);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString('tr-TR', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul'
        });
      }
    } catch { /* devam */ }
  }

  return '--:--';
}

/* ── EVENT ICONS ─────────────────────────────── */
function evIcon(type, detail) {
  const t = (type||'').toLowerCase(), d = (detail||'').toLowerCase();
  if (t==='goal') return d.includes('penalty') ? '🎯' : '⚽';
  if (t==='card') return d.includes('red')||d.includes('kırmızı') ? '🟥' : '🟨';
  if (t==='subst') return '🔄';
  if (t==='var')   return '📺';
  return '·';
}
function evCls(type, detail) {
  const t = (type||'').toLowerCase(), d = (detail||'').toLowerCase();
  if (t==='goal') return 'g';
  if (t==='card') return d.includes('red')||d.includes('kırmızı') ? 'r' : 'y';
  if (t==='subst') return 's';
  if (t==='var')   return 'v';
  return '';
}

/* ── UTILS ───────────────────────────────────── */
function setMatchesHTML(h) { document.getElementById('matches-root').innerHTML = h; }
function setDetailHTML(h)  { document.getElementById('detail-root').innerHTML = h; }
function todayStr() { return fmtDate(new Date()); }
function fmtDate(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function pad2(n) { return String(n).padStart(2,'0'); }
function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
