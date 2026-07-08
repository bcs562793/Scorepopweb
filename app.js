/* ═══════════════════════════════════════════════
   SCOREPOP — app.js  (v15.1 — Arşiv Desteği)
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
  gzOddsCache: {},    /* YYYY-MM-DD → parsed gz array */
  tickTimer:   null,   // ✅ EKLE
  detailKickoffAt:  null,   // ✅ YENİ
  detailSecondHalfAt: null, // ✅ YENİ 
  _detailStatus:      null,
};

/* ── LİG ÖNCELİK SİSTEMİ (JSON league_id tabanlı) ───────────────────── */
const LEAGUE_CONF = [
   
  { id: 14598, source: "mackolik", priority: -1, name: "Dünya kupası 2026 Son 16" },
  { id: 14364, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14365, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14366, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14367, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14368, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14369, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14370, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14371, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14372, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14373, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14374, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 14375, source: "mackolik", priority: -1, name: "Dünya kupası 2026" },
  { id: 1, source: "mackolik", priority: -1, name: "Türkiye Süper Lig" },
  { id: 584, source: "bilyoner", priority: -1, name: "Türkiye Süper Lig" },
  { id: 102, source: "mackolik", priority: -4, name: "Şampiyonlar Ligi" },
  { id: 44, source: "bilyoner", priority: -4, name: "Şampiyonlar Ligi" },
  { id: 126, source: "bilyoner", priority: -4, name: "Şampiyonlar Ligi" },
  { id: 1650, source: "bilyoner", priority: -3, name: "Avrupa Ligi" },
  { id: 588, source: "mackolik", priority: -3, name: "Avrupa Ligi" },
  { id: 1644, source: "bilyoner", priority: -3, name: "Avrupa Ligi" },
  { id: 11031, source: "bilyoner", priority: -3, name: "Avrupa Ligi" },
  { id: 14037, source: "bilyoner", priority: -3, name: "Avrupa Ligi" },
  { id: 13868, source: "bilyoner", priority: -3, name: "Avrupa Ligi" },
  { id: 23986, source: "bilyoner", priority: -2, name: "Konferans Ligi" },
  { id: 12748, source: "bilyoner", priority: -2, name: "Konferans Ligi" },
  { id: 12861, source: "bilyoner", priority: -2, name: "Konferans Ligi" },
  { id: 12597, source: "mackolik", priority: -2, name: "Konferans Ligi" },
  { id: 13876, source: "bilyoner", priority: -2, name: "Konferans Ligi" },
  { id: 24, source: "mackolik", priority: 0, name: "İngiltere Premier League" },
  { id: 43, source: "bilyoner", priority: 0, name: "Premier League" },
  { id: 3, source: "mackolik", priority: 1, name: "Almanya Bundesliga" },
  { id: 45, source: "bilyoner", priority: 1, name: "Bundesliga" },
  { id: 20, source: "mackolik", priority: 2, name: "İspanya La Liga" },
  { id: 129, source: "bilyoner", priority: 2, name: "La Liga" },
  { id: 15, source: "mackolik", priority: 3, name: "İtalya Serie A" },
  { id: 143, source: "bilyoner", priority: 3, name: "Serie A" },
  { id: 5, source: "mackolik", priority: 4, name: "Ligue 1" },
  { id: 381, source: "bilyoner", priority: 4, name: "Ligue 1" },
  { id: 75, source: "mackolik", priority: 300, name: "Türkiye Kupası" },
  { id: 50, source: "mackolik", priority: 302, name: "İngiltere League Cup" },
  { id: 51, source: "mackolik", priority: 303, name: "Community Shield" },
  { id: 17, source: "mackolik", priority: 5, name: "Eredivisie" },
  { id: 322, source: "bilyoner", priority: 5, name: "Eredivisie" },
  { id: 1861, source: "bilyoner", priority: 5, name: "Eredivisie" },
  { id: 19, source: "mackolik", priority: 6, name: "Primeira Liga" },
  { id: 566, source: "bilyoner", priority: 6, name: "Primeira Liga" },
  { id: 87, source: "mackolik", priority: 7, name: "İsviçre Super League" },
  { id: 15, source: "bilyoner", priority: 7, name: "İsviçre Super League" },
  { id: 221, source: "bilyoner", priority: 7, name: "İsviçre Super League" },
  { id: 45241, source: "bilyoner", priority: 7, name: "İsviçre Super League" },
  { id: 119, source: "mackolik", priority: 8, name: "Danimarka Superliga" },
  { id: 1262, source: "bilyoner", priority: 8, name: "Danimarka Superliga" },
  { id: 111, source: "mackolik", priority: 9, name: "Hırvatistan HNL" },
  { id: 207, source: "bilyoner", priority: 9, name: "Hırvatistan HNL" },
  { id: 33402, source: "bilyoner", priority: 9, name: "Hırvatistan HNL" },
  { id: 179, source: "mackolik", priority: 10, name: "İskoçya Premiership" },
  { id: 590, source: "bilyoner", priority: 10, name: "İskoçya Premiership" },
  { id: 9, source: "mackolik", priority: 11, name: "Belçika Pro League" },
  { id: 1220, source: "bilyoner", priority: 11, name: "Belçika Pro League" },
  { id: 218, source: "mackolik", priority: 12, name: "Avusturya Bundesliga" },
  { id: 1209, source: "bilyoner", priority: 12, name: "Avusturya Bundesliga" },
  { id: 1211, source: "bilyoner", priority: 12, name: "Avusturya Bundesliga" },
  { id: 106, source: "mackolik", priority: 13, name: "Polonya Ekstraklasa" },
  { id: 202, source: "bilyoner", priority: 13, name: "Polonya Ekstraklasa" },
  { id: 286, source: "mackolik", priority: 14, name: "Sırbistan Super Liga" },
  { id: 25886, source: "bilyoner", priority: 14, name: "Sırbistan Super Liga" },
  { id: 25887, source: "bilyoner", priority: 14, name: "Sırbistan Super Liga" },
  { id: 22, source: "mackolik", priority: 15, name: "İsveç Allsvenskan" },
  { id: 18, source: "mackolik", priority: 16, name: "Norveç Eliteserien" },
  { id: 573, source: "bilyoner", priority: 16, name: "Norveç Eliteserien" },
  { id: 13, source: "mackolik", priority: 17, name: "Finlandiya Veikkausliiga" },
  { id: 628, source: "bilyoner", priority: 17, name: "Finlandiya Veikkausliiga" },
  { id: 429, source: "mackolik", priority: 18, name: "Bosna Hersek" },
  { id: 16324, source: "bilyoner", priority: 18, name: "Bosna Hersek" },
  { id: 2, source: "mackolik", priority: 100, name: "Türkiye 1. Lig" },
  { id: 1980, source: "bilyoner", priority: 100, name: "Türkiye 1. Lig" },
  { id: 25, source: "mackolik", priority: 101, name: "Championship" },
  { id: 52, source: "bilyoner", priority: 101, name: "Championship" },
  { id: 4, source: "mackolik", priority: 102, name: "2. Bundesliga" },
  { id: 132, source: "bilyoner", priority: 102, name: "2. Bundesliga" },
  { id: 21, source: "mackolik", priority: 103, name: "Segunda División" },
  { id: 1951, source: "bilyoner", priority: 103, name: "Segunda División" },
  { id: 16, source: "mackolik", priority: 104, name: "Serie B" },
  { id: 6, source: "mackolik", priority: 105, name: "Ligue 2" },
  { id: 614, source: "bilyoner", priority: 105, name: "Ligue 2" },
  { id: 120, source: "mackolik", priority: 106, name: "Eerste Divisie" },
  { id: 474, source: "mackolik", priority: 107, name: "Liga de Honra" },
  { id: 1897, source: "bilyoner", priority: 107, name: "Liga de Honra" },
  { id: 114, source: "mackolik", priority: 108, name: "İsviçre Challenge League" },
  { id: 1975, source: "bilyoner", priority: 108, name: "İsviçre Challenge League" },
  { id: 416, source: "mackolik", priority: 109, name: "Danimarka 1.Division" },
  { id: 13292, source: "bilyoner", priority: 110, name: "Hırvatistan 1.NL" },
  { id: 26, source: "mackolik", priority: 111, name: "İskoçya Championship" },
  { id: 577, source: "bilyoner", priority: 111, name: "İskoçya Championship" },
  { id: 415, source: "mackolik", priority: 112, name: "Belçika 1B Pro League" },
  { id: 219, source: "mackolik", priority: 113, name: "Avusturya 2.Liga" },
  { id: 598, source: "bilyoner", priority: 113, name: "Avusturya 2.Liga" },
  { id: 107, source: "mackolik", priority: 114, name: "Polonya 1.Liga" },
  { id: 997, source: "bilyoner", priority: 114, name: "Polonya 1.Liga" },
  { id: 287, source: "mackolik", priority: 115, name: "Sırbistan Liga 2" },
  { id: 104, source: "mackolik", priority: 116, name: "İsveç Superettan" },
  { id: 349, source: "bilyoner", priority: 116, name: "İsveç Superettan" },
  { id: 1708, source: "bilyoner", priority: 200, name: "Türkiye 2. Lig" },
  { id: 60, source: "mackolik", priority: 200, name: "Türkiye 3. Lig" },
  { id: 61, source: "mackolik", priority: 200, name: "Türkiye 3. Lig" },
  { id: 62, source: "mackolik", priority: 200, name: "Türkiye 3. Lig" },
  { id: 63, source: "mackolik", priority: 200, name: "Türkiye 3. Lig" },
  { id: 12, source: "mackolik", priority: 202, name: "İngiltere League Two" },
  { id: 105, source: "bilyoner", priority: 202, name: "İngiltere League Two" },
  { id: 414, source: "bilyoner", priority: 202, name: "İngiltere League Two" }
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

function getLeaguePriority(id, name) {
  // Önce isme göre ara (ID eşleşmese bile çalışır)
  const lowerName = _toLowerTr(name || '');
  const byName = LEAGUE_CONF.find(l => _toLowerTr(l.name) === lowerName);
  if (byName) return byName.priority;

  if (!id) return 999;
  const matches = LEAGUE_CONF.filter(l => l.id == id);
  if (matches.length === 0) return 999;
  if (matches.length === 1) return matches[0].priority;

  const lowerN = (name || '').toLowerCase();
  const exact = matches.find(l => {
    const checkWord = l.name.toLowerCase().split(' ')[0];
    return lowerN.includes(checkWord);
  });
  return exact ? exact.priority : matches[0].priority;
}

function _toLowerTr(str) {
  if (!str) return '';
  return str.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase().trim();
}

function _leagueSortKey(group) {
  const fav = isFavLeague(group.name) ? 0 : 1;
  const priority = getLeaguePriority(group.id, group.name);
  return { fav, priority, name: _toLowerTr(group.name) };
}

function _sortLeagueGroups(groups) {
  return [...groups].sort((a, b) => {
    const ka = _leagueSortKey(a);
    const kb = _leagueSortKey(b);
    if (ka.fav !== kb.fav) return ka.fav - kb.fav;
    if (ka.priority !== kb.priority) return ka.priority - kb.priority;
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

/* 2. Auth — bloklamadan başlat, arka planda çalışsın */
  try {
    if (typeof Auth !== 'undefined') {
      Auth.init(S.sb).then(() => {
        Auth.onChange(user => {
          if (user) {
            const n = Auth.getDisplayName();
            if (n) try { localStorage.setItem('sp_nick', n); } catch {}
          }
        });
      }).catch(e => console.warn('Auth:', e));
    }
  } catch(e) { console.warn('Auth:', e); }

  /* 3. Payment */
  try { if (typeof Payment !== 'undefined') Payment.init(S.sb); } catch(e) {}

  buildDateStrip();
  /* Oran Analizi tarih strip — Türkiye saatine göre bugün */
  OA.date = todayTR();
  _buildOddsDateStrip();
  bindEvents();

  /* 4. Router */
  try { if (typeof Router !== 'undefined') Router.init(); }
  catch(e) { navigate('live'); }

  startClock();
  startRealtime();

  /* Dakika ticker'ı — sayfadan/realtime durumundan bağımsız her zaman çalışır.
     Liste satırları ve açık maç detayındaki dakikayı saniyede bir ilerletir. */
  if (!S.tickTimer) S.tickTimer = setInterval(_tickLiveMinutes, 1000);
}

/* readyState zaten complete ise load eventi bir daha tetiklenmez — direkt çağır */
function _bootWhenReady() {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }
}
/* Dosyanın tamamı (OA dahil) parse edilsin, sonra başlat */
Promise.resolve().then(_bootWhenReady);

/* ── EVENTS ─────────────────────────────────── */
function bindEvents() {
  document.querySelectorAll('.sb-btn[data-page]').forEach(b =>
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

  document.querySelectorAll('.sb-btn[data-page]').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page));

  /* Oran Analizi sayfası — ayrı view */
  if (page === 'odds') {
    document.getElementById('date-strip').style.display = 'none';
    const calBtn2 = document.querySelector('.tb-cal-grp');
    if (calBtn2) calBtn2.style.display = 'none';
    stopRealtime();
    showView('odds');
    loadOddsPage();
    return;
  }

  const showDate = page !== 'live';
  document.getElementById('date-strip').style.display = showDate ? 'flex' : 'none';
  const calBtn2 = document.querySelector('.tb-cal-grp');
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
  /* Detay açıkken de canlı dinle — today/upcoming/derin link ile gelinmiş olabilir */
  if (!S.realtimeChannel) startRealtime();
  /* Oran analizi sayfasından geliyorsa sadece oranlar tabında aç */
  loadDetail(id, isLive, S.page === 'odds');
}

function closeDetail(reload = true) {
  try { if (typeof Forum !== 'undefined') Forum.close(); } catch(e) {}
  /* Detay arka plan olay yenileyicisini durdur */
  if (S.detailEvTimer) { clearInterval(S.detailEvTimer); S.detailEvTimer = null; }
  S.detail  = null;
  S._detailM = null;
  if (S.page === 'odds') {
    showView('odds');
    return;
  }
  /* Canlı sayfaya dönmüyorsak realtime dinlemeyi bırak */
  if (S.page !== 'live') stopRealtime();
  showView('matches');
  if (reload) loadMatches();
}

function showView(v) {
  document.getElementById('view-matches').classList.toggle('hidden', v !== 'matches');
  document.getElementById('view-detail').classList.toggle('hidden', v !== 'detail');
  const vo = document.getElementById('view-odds');
  if (vo) vo.classList.toggle('hidden', v !== 'odds');
  const vt = document.getElementById('view-team');
  if (vt) vt.classList.toggle('hidden', v !== 'team');
  const vp = document.getElementById('view-player');
  if (vp) vp.classList.toggle('hidden', v !== 'player');
  document.getElementById('col-hdr').style.display = v === 'matches' ? '' : 'none';
}


/* ══════════════════════════════════════════════════════════════════
   ORAN ANALİZİ SAYFASI
══════════════════════════════════════════════════════════════════ */

const OA = {
  date:    todayStr(),
  loading: false,
  matches: [],
  oddsMap: {},
};

/* Türkiye saatine göre bugünün tarihini al */
function todayTR() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
}

async function loadOddsPage() {
  if (OA.loading) return;
  OA.loading = true;
  const root = document.getElementById('odds-matches-root');
  if (!root) { OA.loading = false; return; }
  root.innerHTML = `<div class="empty"><div class="empty-i">⏳</div><div class="empty-t">Maçlar yükleniyor…</div></div>`;

  try {
    const today  = todayTR();
    const isToday  = OA.date === today;
    const isPast   = OA.date < today;

    let rows = [];

    if (isPast) {
      /* Geçmiş — archiveCache'ten */
      rows = Object.values(S.archiveCache).map(m => normFix(m));
      if (!rows.length) {
        root.innerHTML = `<div class="empty"><div class="empty-i">📂</div><div class="empty-t">Bu tarih için arşiv yüklü değil.<br>Önce Bugün sekmesinde o tarihe git.</div></div>`;
        OA.loading = false; return;
      }
    } else {
      /* Bugün veya gelecek:
         future_matches'te date kolonu UTC'de kaydedildiğinden,
         Türkiye gece maçları bir sonraki gün olarak görünebilir.
         Çözüm: seçili tarih + bir sonraki günü birlikte çek, dedupe et. */
      const nextDate = fmtDate(new Date(new Date(OA.date).getTime() + 86400000));

      const [liveRes, futRes, futNextRes] = await Promise.all([
        isToday
          ? S.sb.from('live_matches').select('*').limit(300)
          : Promise.resolve({ data: [] }),
        S.sb.from('future_matches').select('*').eq('date', OA.date).limit(300),
        S.sb.from('future_matches').select('*').eq('date', nextDate).limit(100),
      ]);

      const map = new Map();

      const addRow = (r) => {
        let n = null;
        if (r.raw_data) try { n = normFix({...r,...JSON.parse(r.raw_data)}); } catch(e){}
        if (!n && r.data) {
          let d = r.data;
          if (typeof d === 'string') { try { d = JSON.parse(d); } catch(e) { d = null; } }
          if (d) { const list = Array.isArray(d)?d:[d]; n = normFix({...r,...list[0]}); }
        }
        if (!n) n = normFix(r);
        if (!n.fixture_id) return;
        if (!map.has(n.fixture_id)) map.set(n.fixture_id, n);
      };

      (liveRes.data  || []).forEach(addRow);
      (futRes.data   || []).forEach(addRow);
      /* Bir sonraki günden sadece kickoff_time'ı seçili güne düşen maçları al */
      (futNextRes.data || []).forEach(r => {
        let n = null;
        if (r.raw_data) try { n = normFix({...r,...JSON.parse(r.raw_data)}); } catch(e){}
        if (!n) n = normFix(r);
        if (!n.fixture_id) return;
        /* kickoff_time'dan gerçek tarihi hesapla */
        const kt = n.kickoff_time || '';
        if (kt) {
          const ktDate = new Date(kt).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
          if (ktDate === S.date && !map.has(n.fixture_id)) map.set(n.fixture_id, n);
        }
      });

      rows = Array.from(map.values());
    }

    rows = rows.filter(m => m.fixture_id);
    OA.matches = rows;

    if (!rows.length) {
      root.innerHTML = `<div class="empty"><div class="empty-i">📭</div><div class="empty-t">Bu tarihte maç bulunamadı</div></div>`;
      OA.loading = false; return;
    }

    /* match_odds ve match_info'yu toplu çek[cite: 1] */
    const ids = rows.map(m => m.fixture_id).filter(Boolean);
    OA.oddsMap = {};
    if (ids.length) {
      /* match_odds ve match_info'dan bilyoner_id'yi getirecek şekilde join ekledik[cite: 1] */
      const [ { data: oddsData }, { data: fmData } ] = await Promise.all([
        S.sb.from('match_odds').select('fixture_id, odds_data, updated_at').in('fixture_id', ids),
        S.sb.from('future_matches').select('fixture_id, bilyoner_id').in('fixture_id', ids)
      ]);
      
      const bilyonerMap = {};
      (fmData || []).forEach(f => {
          if(f.bilyoner_id) bilyonerMap[f.fixture_id] = f.bilyoner_id;
      });

      /* match_info'yu bilyoner id lerine göre in ile getir[cite: 1] */
      const bilyonerIds = Object.values(bilyonerMap).filter(Boolean);
      let matchInfoData = [];
      if(bilyonerIds.length > 0) {
           const { data: infoData } = await S.sb.from('match_info').select('*').in('fixture_id', bilyonerIds);
           matchInfoData = infoData || [];
      }

      /* OA.oddsMap içerisine hem odds hem de match_info datasını koyalım[cite: 1] */
      (oddsData || []).forEach(o => {
          OA.oddsMap[String(o.fixture_id)] = { odds_data: o.odds_data, updated_at: o.updated_at };
      });

      rows.forEach(r => {
           const bid = bilyonerMap[r.fixture_id];
           if(bid) {
                const info = matchInfoData.find(i => String(i.fixture_id) === String(bid));
                if(info) {
                     if(!OA.oddsMap[String(r.fixture_id)]) OA.oddsMap[String(r.fixture_id)] = {};
                     OA.oddsMap[String(r.fixture_id)].match_info = info;
                }
           }
      });
    }

    _renderOddsPage(root, rows);
  } catch(e) {
    console.error('[OddsPage]', e);
    root.innerHTML = `<div class="empty"><div class="empty-i">⚠️</div><div class="empty-t">Yükleme hatası</div></div>`;
  }
  OA.loading = false;
}

function _renderOddsPage(root, rows) {
  /* Ligleri sırala */
  const groups = {};
  rows.forEach(m => {
    const k = (m.league_id && m.league_id !== 0)
      ? String(m.league_id)
      : `${_toLowerTr(m.league_country || '')}__${_toLowerTr(m.league_name || 'Diğer')}`;
    if (!groups[k]) groups[k] = {
      id:      m.league_id || 0,
      name:    m.league_name  || 'Diğer',
      logo:    m.league_logo  || '',
      country: m.league_country || '',
      flag:    m.league_flag  || '',
      matches: []
    };
    groups[k].matches.push(m);
  });
  const sorted = _sortLeagueGroups(Object.values(groups));

  const hasOdds = m => OA.oddsMap[String(m.fixture_id)]?.odds_data?.markets?.['1x2'] != null;

  let html = '';
  sorted.forEach(g => {
    const with_ = g.matches.filter(m =>  hasOdds(m));
    const without_ = g.matches.filter(m => !hasOdds(m));
    
    // Doğru hizalama için bayrak, logo ve isim tanımlamaları ana sayfadaki gibi yapıldı
    const logo = g.logo
      ? `<img src="${esc(g.logo)}" onerror="this.style.display='none'" alt="" style="width:16px;height:16px;object-fit:contain;flex-shrink:0">`
      : '';
    const countryFlag = g.flag
      ? `<img src="${g.flag}" onerror="this.style.display='none'" alt="" style="width:16px;height:11px;object-fit:cover;border-radius:2px;flex-shrink:0">`
      : '';
    const fullName = g.country
      ? `${esc(g.country)} ${esc(g.name)}`
      : esc(g.name);

    // Flex kapsayıcılar ile 56px taşma sorunu engellendi
    html += `<div class="lg-grp" data-league="${esc(g.name)}">
      <div class="lg-hdr" onclick="this.closest('.lg-grp').classList.toggle('closed')">
        <div style="display:flex;align-items:center;gap:6px;flex:1;flex-wrap:nowrap">
          ${countryFlag}
          ${logo}
          <span class="lg-hdr-name" style="white-space:nowrap;font-size:13px;font-weight:500">${fullName}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          <span class="lg-ct">${g.matches.length}</span>
          <span class="lg-arrow">▾</span>
        </div>
      </div>`;
    [...with_, ...without_].forEach(m => { html += _buildOddsRow(m); });
    html += `</div>`;
  });

  root.innerHTML = html || `<div class="empty"><div class="empty-t">Gösterilecek maç yok</div></div>`;
}

function _buildOddsRow(m) {
  const st    = statusInfo(m);
  const hs    = m.home_score != null ? m.home_score : '-';
  const as    = m.away_score != null ? m.away_score : '-';
  const isNS  = !['1H','2H','HT','ET','BT','P','LIVE','FT','AET','PEN'].includes(m.status_short);

  const odRow = OA.oddsMap[String(m.fixture_id)];
  const od    = odRow?.odds_data ?? null;
  const mk    = od?.markets ?? null;
  const sofa  = od?.sofa_1x2 ?? null;

  const o1x2  = mk?.['1x2'] ?? null;
  const h1    = o1x2?.home, hX = o1x2?.draw, h2 = o1x2?.away;

  /* Sofascore oran hareketi */
  const ch1 = sofa?.['1']?.change ?? null;
  const chX = sofa?.['x']?.change ?? null;
  const ch2 = sofa?.['2']?.change ?? null;
  const hasCh = ch1 !== null && chX !== null && ch2 !== null;
  const arr = v => v===1?'<span class="oa-up">↑</span>':v===-1?'<span class="oa-dn">↓</span>':'<span class="oa-eq">→</span>';

  /* Sinyal badge */
  let sigBadge = '';
  if (hasCh) {
    const sig = buildSignals(sofa);
    if (sig && sig.tier !== 'none') {
      const tc = { strong:'oa-sig-strong', medium:'oa-sig-medium', weak:'oa-sig-weak' };
      const tl = { strong:'⬡ Güçlü', medium:'◈ Orta', weak:'◇ Zayıf' };
      sigBadge = `<span class="oa-sig-badge ${tc[sig.tier]}">${tl[sig.tier]} · %${sig.winnerPct.toFixed(0)} ${sig.winnerLabel}</span>`;
    }
  }

  const hLogo = m.home_logo ? `<img src="${esc(m.home_logo)}" width="18" height="18" onerror="this.style.display='none'" alt="">` : '';
  const aLogo = m.away_logo ? `<img src="${esc(m.away_logo)}" width="18" height="18" onerror="this.style.display='none'" alt="">` : '';

  return `
    <div class="oa-row" onclick="openOddsDetail(${m.fixture_id}, ${st.live})">
      <div class="oa-left">
        <div class="oa-time"><span class="mr-t1 ${st.cls}">${st.label}</span></div>
        <div class="oa-teams">
          <div class="oa-team">${hLogo}<span>${esc(m.home_team||'')}</span></div>
          <div class="oa-score">${isNS?'<span class="oa-vs">vs</span>':`<span>${hs}</span><span class="oa-sep">:</span><span>${as}</span>`}</div>
          <div class="oa-team">${aLogo}<span>${esc(m.away_team||'')}</span></div>
        </div>
      </div>
      <div class="oa-right">
        ${o1x2 ? `
          <div class="oa-odds">
            <div class="oa-odd-cell">
              <span class="oa-odd-lbl">1</span>
              <span class="oa-odd-val ${h1 < 1.8 ? 'oa-fav' : ''}">${h1 ? h1.toFixed(2) : '-'}</span>
              ${hasCh ? arr(ch1) : ''}
            </div>
            <div class="oa-odd-cell">
              <span class="oa-odd-lbl">X</span>
              <span class="oa-odd-val">${hX ? hX.toFixed(2) : '-'}</span>
              ${hasCh ? arr(chX) : ''}
            </div>
            <div class="oa-odd-cell">
              <span class="oa-odd-lbl">2</span>
              <span class="oa-odd-val ${h2 < 1.8 ? 'oa-fav' : ''}">${h2 ? h2.toFixed(2) : '-'}</span>
              ${hasCh ? arr(ch2) : ''}
            </div>
          </div>
          ${sigBadge}
        ` : `<div class="oa-no-odds">Oran yok</div>`}
      </div>
    </div>`;
}

/* Oran sayfasından maça tıklayınca — sadece Oranlar tabında aç */
function openOddsDetail(id, isLive) {
  S.detail     = id;
  S.detailLive = isLive;
  S.page       = 'odds'; /* geri gelince odds sayfasına dön */
  showView('detail');
  if (!S.realtimeChannel) startRealtime();
  loadDetail(id, isLive, true /* oddsOnly */);
}

/* Oran analizi tarih strip */
function _buildOddsDateStrip() {
  const el = document.getElementById('oa-date-strip');
  if (!el) return;
  el.innerHTML = '';
  const dow = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
  const today = todayTR();

  for (let i = -1; i <= 5; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const s = fmtDate(d);
    const btn = document.createElement('button');
    btn.className = 'oa-dp' + (s === today ? ' active' : '');
    const dd = pad2(d.getDate()) + '/' + pad2(d.getMonth()+1);
    const lbl = s === today ? 'Bugün' : i === 1 ? 'Yarın' : i === -1 ? 'Dün' : dow[d.getDay()];
    btn.innerHTML = `<span class="oa-dp-d">${dd}</span><span class="oa-dp-w">${lbl}</span>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('#oa-date-strip .oa-dp').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      OA.date = s;
      loadOddsPage();
    });
    el.appendChild(btn);
  }
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
      document.querySelectorAll('.sb-btn[data-page]').forEach(b =>
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
      document.querySelectorAll('.sb-btn[data-page]').forEach(b =>
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

/* Önceki / sonraki gün — takvim yanındaki ok butonları */
function shiftFootballDate(delta) {
  const base = S.date || todayStr();
  const d = new Date(base + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const s = fmtDate(d);
  S.date = s;
  S.page = 'today';
  document.querySelectorAll('.sb-btn[data-page]').forEach(b =>
    b.classList.toggle('active', b.dataset.page === 'today'));
  try { if (typeof Router !== 'undefined') Router.goToday(s); } catch(e) {}
  let matched = null;
  document.querySelectorAll('#date-strip .dp').forEach(b => {
    if (b.dataset.dateVal === s) matched = b;
  });
  _activateDateBtn(matched);
  const cp = document.getElementById('cal-picker');
  if (cp) cp.value = '';
  const calBtn = document.querySelector('.tb-cal-btn');
  if (calBtn) calBtn.classList.remove('active');
  loadMatches();
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
  const BB_LIVE = ['1Q','Q1','2Q','Q2','HT','HALF','3Q','Q3','4Q','Q4','OT','OT1','OT2','LIVE'];
  const [{ data, error }, bbRes] = await Promise.all([
    S.sb.from('live_matches').select('*')
      .in('status_short',['1H','2H','HT','ET','BT','P','LIVE'])
      .limit(120),
    S.sb.from('live_bball')
      .select('id,home_team,away_team,home_score,away_score,status_short,match_clock,league_name,country,scheduled_at,home_avatar,away_avatar')
      .in('status_short', BB_LIVE)
      .limit(60),
  ]);
  if (error) throw error;
  const bbRows = bbRes?.data || [];

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
    _renderBballLive(bbRows, true);
  } else {
    render(rows, true);
    _renderBballLive(bbRows, false);
  }
}

/* ── CANLI BASKETBOL — Canlı sekmesi alt bölümü ─────────────
   Futbol gruplarının altında ayrı .lg-grp blokları olarak render
   edilir. Satırlar futbol detayına değil /basketbol/mac/ sayfasına
   gider. data-id KULLANILMAZ — silent temizlik (.mr[data-id])
   futbol id'lerine bakar, bball satırlarını silmesin diye. */
function _bbSlug(s){return String(s||'').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);}
function _bbStatusLbl(m){
  const LM={'1Q':'Ç1','Q1':'Ç1','2Q':'Ç2','Q2':'Ç2','HT':'DV','HALF':'DV','3Q':'Ç3','Q3':'Ç3','4Q':'Ç4','Q4':'Ç4','OT':'UZT','OT1':'UZT','OT2':'UZT','LIVE':'CANLI'};
  const s=(m.status_short||'').toUpperCase();
  let l=LM[s]||s;
  if(m.match_clock)l+=` ${m.match_clock}`;
  return l;
}
function _renderBballLive(bbRows, silent){
  const root=document.getElementById('matches-root');
  if(!root)return;
  let sec=document.getElementById('bb-live-sec');
  if(!bbRows.length){ if(sec)sec.remove(); return; }

  /* Futbol boşsa "Maç bulunamadı" bloğunu kaldır — bball listesi var */
  if(!silent){
    const emptyEl=root.querySelector(':scope > .empty');
    if(emptyEl && !root.querySelector('.mr[data-id]')) emptyEl.remove();
  }

  const groups={};
  bbRows.forEach(m=>{
    const k=m.league_name||'Basketbol';
    (groups[k]=groups[k]||[]).push(m);
  });

  const rowHtml=m=>{
    const href=`/basketbol/mac/${m.id}-${_bbSlug(m.home_team)}-vs-${_bbSlug(m.away_team)}`;
    return `
    <div class="mr is-live" data-bbid="${m.id}" onclick="window.location.href='${href}'">
      <div class="mr-time"><span class="mr-t1 live">${esc(_bbStatusLbl(m))}</span></div>
      <div class="mr-home"><span class="mr-name">${esc(m.home_team||'')}</span><div class="mr-logo-wrap">${m.home_avatar?`<img class="mr-logo" src="${esc(m.home_avatar)}" onerror="this.style.display='none'" alt="">`:'<div class="mr-logo-ph"></div>'}</div></div>
      <div class="mr-score"><div class="mr-sb live"><span class="mr-n">${m.home_score??'-'}</span><div class="mr-sep"></div><span class="mr-n">${m.away_score??'-'}</span></div></div>
      <div class="mr-away"><div class="mr-logo-wrap">${m.away_avatar?`<img class="mr-logo" src="${esc(m.away_avatar)}" onerror="this.style.display='none'" alt="">`:'<div class="mr-logo-ph"></div>'}</div><span class="mr-name">${esc(m.away_team||'')}</span></div>
      <div class="mr-x"><span class="mr-arr">›</span></div>
    </div>`;
  };

  const html=Object.entries(groups).map(([name,ms])=>`
    <div class="lg-grp">
      <div class="lg-hdr" onclick="this.closest('.lg-grp').classList.toggle('closed')">
        <div style="display:flex;align-items:center;gap:6px;flex:1;flex-wrap:nowrap">
          <svg class="sb-sport-ic" width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.2"/><path d="M7 1v12M1 7h12M2.8 2.8c2 1.6 2 6.8 0 8.4M11.2 2.8c-2 1.6-2 6.8 0 8.4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
          <span class="lg-hdr-name" style="white-space:nowrap;font-size:13px;font-weight:500">Basketbol — ${esc(name)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0"><span class="lg-arrow">▾</span></div>
      </div>
      <div class="lg-body">${ms.map(rowHtml).join('')}</div>
    </div>`).join('');

  if(!sec){
    sec=document.createElement('div');
    sec.id='bb-live-sec';
    root.appendChild(sec);
  }
  sec.innerHTML=html;
}

async function loadToday(silent = false) {
  _fetchLiveCount();

  if (S.date < todayStr()) {
    if (silent && S.archiveCache && S.archiveCache._date === S.date) return;
    await loadArchive(S.date, silent);
    return;
  }

  const isToday = S.date === todayStr();

  /* Tüm satırları sayfalı çek — Supabase varsayılan 1000 limitini aşmak için.
     fetchAllRows() sayfa sayfa çekip birleştirir, hiçbir satır kaçmaz. */
  const [liveAllData, futureAllData] = await Promise.all([
    isToday
      ? fetchAllRows(S.sb.from('live_matches').select('*').order('league_name'))
      : Promise.resolve([]),
    fetchAllRows(S.sb.from('future_matches').select('*').eq('date', S.date)),
  ]);

  const matchesMap = new Map();

  function processNorm(norm) {
    if (!norm.fixture_id) return;
    if (!matchesMap.has(norm.fixture_id)) {
      matchesMap.set(norm.fixture_id, norm);
    } else {
      const existing = matchesMap.get(norm.fixture_id);
      if (!existing.kickoff_time && norm.kickoff_time) existing.kickoff_time = norm.kickoff_time;
      if (!existing.league_country && norm.league_country) existing.league_country = norm.league_country;
      if (!existing.league_flag && norm.league_flag) existing.league_flag = norm.league_flag;
      if (!existing.league_logo && norm.league_logo) existing.league_logo = norm.league_logo;
    }
  }

  function parseRows(list) {
    (list || []).forEach(r => {
      if (r.raw_data) {
        try {
          const parsed = JSON.parse(r.raw_data);
          processNorm(normFix({ ...r, ...parsed }));
          return;
        } catch(e) {}
      }
      if (r.data && typeof r.data === 'object') {
        let d = r.data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch(e) { d = null; } }
        if (d && typeof d === 'object') {
          const list2 = Array.isArray(d) ? d : [d];
          list2.forEach(m => processNorm(normFix({ ...r, ...m })));
          return;
        }
      }
      processNorm(normFix(r));
    });
  }

  parseRows(liveAllData);
  parseRows(futureAllData);

  const rows = Array.from(matchesMap.values());

  rows.sort((a, b) => {
    const ta = new Date(a.kickoff_time || 0).getTime();
    const tb = new Date(b.kickoff_time || 0).getTime();
    return ta - tb;
  });
  
  render(rows, false);
}


/* ── Supabase sayfalı çekme: tüm satırları limit olmadan getirir ──────
   PostgREST varsayılan olarak max 1000 satır döndürür.
   Bu fonksiyon sayfa sayfa çekip hepsini birleştirir.
───────────────────────────────────────────────────────────────────── */
async function fetchAllRows(query) {
  const PAGE = 1000;
  let from = 0;
  let all  = [];
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) { console.error('[fetchAllRows] hata:', error.message); break; }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break; /* son sayfa — bitti */
    from += PAGE;
  }
  return all;
}

const ARCHIVE_BASE = 'https://raw.githubusercontent.com/bcs562793/scorepop-worker/main/data';

async function loadArchive(date) {
  setMatchesHTML(`<div class="empty"><div class="empty-i">⏳</div><div class="empty-t">${date} arşivi yükleniyor…</div></div>`);

  try {
    let json;
    let res = await fetch(`${ARCHIVE_BASE}/${date}.json.gz`);
    
    // 1. Durum: .json.gz dosyası başarıyla bulunduysa manuel olarak GZIP'ten çıkar
    if (res.ok) {
      const ds = new DecompressionStream('gzip');
      const decompressedStream = res.body.pipeThrough(ds);
      const decompressedResponse = new Response(decompressedStream);
      json = await decompressedResponse.json();
    } 
    // 2. Durum: .gz bulunamadıysa standart .json dosyasına düş (Fallback)
    else {
      res = await fetch(`${ARCHIVE_BASE}/${date}.json`);
      
      if (!res.ok) {
        setMatchesHTML(`<div class="empty"><div class="empty-i">📂</div><div class="empty-t">${date} tarihine ait arşiv bulunamadı</div></div>`);
        return;
      }
      
      json = await res.json();
    }

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
    .gt('date', S.date)
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
  const parsed = typeof r.raw_data === 'object'
    ? r.raw_data
    : (() => { try { return JSON.parse(r.raw_data); } catch(e) { return null; } })();
  if (parsed) {
    processNorm(normFix({ ...r, ...parsed }));
    return;
  }
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

    /* 🔧 YENİ: JS'de sırala */
  rows.sort((a, b) => {
    const ta = new Date(a.kickoff_time || a.date || 0).getTime();
    const tb = new Date(b.kickoff_time || b.date || 0).getTime();
    return ta - tb;
  });

  render(rows, false);
}


function normFix(m) {
  /* fixture hem doğrudan hem data içinden gelebilir */
  const rawDataFx = (m.raw_data && typeof m.raw_data === 'object') ? m.raw_data.fixture : null;
  const fx = (m.fixture && typeof m.fixture === 'object') ? m.fixture : rawDataFx;

  /* Saat için: fixture.date en öncelikli, diğerleri yedek */
  const kt = fx?.date
        || m.kickoff_time || m.kickoff_at
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
    pen_home:   m.pen_home ?? null,
    pen_away:   m.pen_away ?? null,
    status_short: resolvedStatus,
    elapsed_time: m.elapsed_time ?? fx?.status?.elapsed ?? null,
    kickoff_time: kt,
    kickoff_at:    m.kickoff_at    || null,
    second_half_at: m.second_half_at || null, 
    visual_url:   m.visual_url || null,
    stream_url:   m.stream_url || m.m3u8_url || null,  /* TV yayını (m3u8) — varsa görselin önüne geçer */
    raw_data:     m.raw_data   || null,   /* venue + referee için buildDetail'e gerekli */
  };
}

/* ── RENDER ──────────────────────────────────── */
function _sortMatches(matches) {
  /* Sadece başlangıç saatine göre sırala.
     Canlı maçlar başladıkları saatte kalır, öne taşınmaz. */
  const getTime = m => {
    const raw = m.kickoff_time || m.fixture_date || m.match_date ||
                m.event_date   || m.date_time    || m.match_time || m.time;
    if (!raw) return 0;
    const t = new Date(raw).getTime();
    return isNaN(t) ? 0 : t;
  };

  return [...matches].sort((a, b) => {
    const ta = getTime(a);
    const tb = getTime(b);
    if (ta !== tb) return ta - tb;
    /* Aynı saatli maçlar her zaman aynı sırada dursun */
    return String(a.fixture_id || '').localeCompare(String(b.fixture_id || ''));
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
    /* FIX: league_id varsa onu kullan — aynı lig live_matches ve future_matches'te
       farklı isimle gelebilir (örn. "Serie A" vs "İtalya-Serie A"), id her zaman aynı */
    const k = (m.league_id && m.league_id !== 0)
      ? String(m.league_id)
      : `${_toLowerTr(m.league_country || '')}__${_toLowerTr(m.league_name || 'Diğer')}`;

    if (!groups[k]) groups[k] = {
      id:      m.league_id   || 0,   // ← EKLE 
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
  const extra = (m.stream_url || m.visual_url)
    ? `<span class="mr-tv">TV</span>`
    : `<span class="mr-arr">›</span>`;

  /* ── GOL VURGUSU: sadece realtime skor değişiminde aktif ── */
  const gd = S.lastGoals[String(m.fixture_id)];
  const homeScored = !!(gd?.home);
  const awayScored = !!(gd?.away);

  return `
    <div class="mr ${st.live ? 'is-live' : ''}" data-id="${m.fixture_id}"
         data-status="${m.status_short || ''}"
         data-kickoff-at="${m.kickoff_at || ''}"
         data-second-half-at="${m.second_half_at || ''}"
         data-elapsed="${m.elapsed_time ?? ''}"
         data-updated-at="${m.updated_at || ''}"
       onclick="openDetail(${m.fixture_id},${st.live})">
      <div class="mr-time">
        <span class="mr-t1 ${st.cls}">${st.label}</span>
        ${st.live ? `<span class="mr-t2"></span>` : ''}
      </div>
      <div class="mr-home${homeScored ? ' goal-band' : ''}" onclick="goToTeam(${m.home_team_id},'${(m.home_team||'').replace(/'/g,"\\'")}',event)" style="cursor:pointer">
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
        ${penText(m) ? `<span class="mr-pen">${penText(m)} pen</span>` : ''}
      </div>
      <div class="mr-away${awayScored ? ' goal-band' : ''}" onclick="goToTeam(${m.away_team_id},'${(m.away_team||'').replace(/'/g,"\\'")}',event)" style="cursor:pointer">
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

/* Arşiv maçında gz oranları geç gelince Oranlar panelini yeniden bas */
function _injectArchiveOdds(m, odds) {
  const panel = document.getElementById('d-or');
  if (!panel) return;
  const od = odds?.odds_data ?? null;
  if (!od || !od.markets) return;

  const mac1x2  = od.markets['1x2']  ?? null;
  const curOu25 = od.markets['ou25'] ?? null;
  let sofa1x2 = od.sofa_1x2 ? JSON.parse(JSON.stringify(od.sofa_1x2)) : null;
  if (sofa1x2) {
    ['1','x','2'].forEach(k => {
      const d = sofa1x2[k]; if (!d) return;
      const op = d.opening, cl = d.closing;
      if (op != null && cl != null && Math.abs(cl - op) > 0.04) d.change = cl < op ? -1 : 1;
    });
  }
  /* Sadece sinyal kartını basıyoruz — tam market dökümü istersen buildDetail'i
     tekrar çağırmak yerine burada genişletilebilir */
  panel.innerHTML = `<div class="or2-wrap">${renderSignalCard(m.fixture_id, sofa1x2, mac1x2, curOu25)}</div>`;
}

/* ── DETAIL ──────────────────────────────────── */
async function loadDetail(id, isLive, oddsOnly = false) {
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

      /* Detayı oransız HEMEN aç — gz beklemeden */
      buildDetail(m, evs, stats, lus, h2h, null, null, null, oddsOnly);

      /* Oranları arka planda yükle, gelince Oranlar panelini güncelle */
      const matchDate = (m.kickoff_time || m.date || S.date || '').slice(0,10);
      fetchGzOdds(matchDate, m.home_team, m.away_team).then(gzOdds => {
        if (!gzOdds || String(S.detail) !== String(id)) return; // kullanıcı başka maça geçtiyse boşver
        _injectArchiveOdds(m, gzOdds);
      }).catch(()=>{});
      return;
    }

    /* ── Normal akış: Supabase ────────────────────────────────────── */
    let m = null;
    const tables = isLive
      ? ['live_matches','future_matches']
      : ['live_matches','future_matches'];  /* daily_matches kullanımda değil */

    for (const tbl of tables) {
      const { data, error } = await S.sb
        .from(tbl).select('*').eq('fixture_id', id).maybeSingle();
      if (error) { console.warn('[Detail]', tbl, error.message); continue; }
      if (data)  { m = data; break; }
    }

     if (m) {
  const rd = m.raw_data;
  if (rd && typeof rd === 'object' && rd.fixture?.date && !m.kickoff_time) {
    m.kickoff_time = rd.fixture.date;
  }
  if (rd && typeof rd === 'string') {
    try {
      const p = JSON.parse(rd);
      if (p.fixture?.date && !m.kickoff_time) m.kickoff_time = p.fixture.date;
    } catch(e) {}
  }
}


    /* ── Supabase'de yoksa arşivden dene ────────────────────────────── */
    if (!m) {
      const archiveResult = await _loadDetailFromArchive(id);
      if (archiveResult) {
        buildDetail(
          archiveResult.m,
          archiveResult.evs,
          archiveResult.stats,
          archiveResult.lus,
          archiveResult.h2h,
          null, null, null,
          oddsOnly
        );
        return;
      }
      setDetailHTML('<div class="empty"><div class="empty-t">Maç bulunamadı</div></div>');
      return;
    }

    if (m.data && typeof m.data === 'object') {
      const nested = Array.isArray(m.data) ? m.data[0] : m.data;
      if (nested) {
        m = { ...m, ...normFix(nested) };
        /* fixture objesini koru — buildDetail kart için venue/referee okur */
        if (nested.fixture && typeof nested.fixture === 'object') {
          m._fixture = nested.fixture;
        }
      }
    }
    /* Ayrıca data string ise parse et ve fixture'ı sakla */
    if (!m._fixture && m.data && typeof m.data === 'string') {
      try {
        const parsed = JSON.parse(m.data);
        const d = Array.isArray(parsed) ? parsed[0] : parsed;
        if (d?.fixture) m._fixture = d.fixture;
      } catch(e) {}
    }

    /* ── live_matches'te venue/referee yoksa future_matches'ten tamamla ──
       Bilyoner/Nesine kaynağında fixture.venue ve referee null gelir.
       future_matches.data'sında gerçek fixture verisi olabilir.        */
    if (!m._fixture?.referee && !m._fixture?.venue?.name && !m._fixture?.venue?.city) {
      try {
        const { data: futData } = await S.sb
          .from('future_matches')
          .select('data')
          .eq('fixture_id', id)
          .maybeSingle();
        if (futData?.data) {
          const fd = typeof futData.data === 'string'
            ? JSON.parse(futData.data) : futData.data;
          const fx = (Array.isArray(fd) ? fd[0] : fd)?.fixture || null;
          if (fx && (fx.referee || fx.venue?.name || fx.venue?.city)) {
            m._fixture = { ...(m._fixture || {}), ...fx };
          }
        }
      } catch(e) {}
    }

    const sq = async (query) => {
      try {
        const res = await query;
        if (res.error) console.warn('[sq error]', res.error.message);
        return res;
      } catch { return { data: null }; }
    };

    console.log('[H2H] home_team_id:', m.home_team_id, 'away_team_id:', m.away_team_id);

    /* bilyoner_id'yi bulup match_info'yu ona göre çekeceğiz[cite: 1] */
    const fmRes = await sq(S.sb.from('future_matches').select('bilyoner_id').eq('fixture_id', id).maybeSingle());
    const bilyonerId = fmRes?.data?.bilyoner_id;
    
    let matchInfoQuery = Promise.resolve({ data: null });
    if (bilyonerId) {
         matchInfoQuery = sq(S.sb.from('match_info').select('*').eq('fixture_id', bilyonerId).maybeSingle());
    }

    const [
      { data: evs  },
      { data: stats },
      { data: lus  },
      { data: pred },
      { data: dbOdds },
      { data: matchInfoData }, // bilyonerId ile çekilen match_info[cite: 1]
    ] = await Promise.all([
      sq(S.sb.from('match_events').select('*').eq('fixture_id', id).order('elapsed_time')),
      sq(S.sb.from('match_statistics').select('*').eq('fixture_id', id).maybeSingle()),
      sq(S.sb.from('match_lineups').select('*').eq('fixture_id', id).maybeSingle()),
      sq(S.sb.from('match_predictions').select('*').eq('fixture_id', id).maybeSingle()),
      sq(S.sb.from('match_odds').select('*').eq('fixture_id', id).maybeSingle()),
      matchInfoQuery // bilyonerId ile çekilen match_info[cite: 1]
    ]);

    /* H2H ayrı — .then() zinciri sq() ile uyumsuz olduğu için */
    let h2h = null;
    if (m.home_team_id && m.away_team_id) {
      const h2hRes = await sq(
        S.sb.from('match_h2h').select('*')
          .or(`h2h_key.eq.${m.home_team_id}-${m.away_team_id},h2h_key.eq.${m.away_team_id}-${m.home_team_id}`)
          .limit(1)
      );
      h2h = h2hRes?.data?.[0] ?? null;
    }

    // ✅ oranlar direkt match_odds'tan gelir, gz sadece sim analizi için
    buildDetail(m, evs||[], stats, lus, h2h, pred, dbOdds || null, matchInfoData || null, oddsOnly);
  } catch (e) {
    console.error(e);
    setDetailHTML(`<div class="empty"><div class="empty-t">Hata: ${esc(e.message)}</div></div>`);
  }
}

/* ── TV YAYIN OYNATICI (m3u8 / HLS) ──────────────────────────
   stream_url doluysa 2D görsel yerine bu oynatıcı gösterilir. */
function _loadHlsJs() {
  if (window.Hls) return Promise.resolve();
  if (window._hlsLoadPromise) return window._hlsLoadPromise;
  window._hlsLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.15/hls.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('hls.js yüklenemedi'));
    document.head.appendChild(s);
  });
  return window._hlsLoadPromise;
}

function _destroyStreamPlayer() {
  if (window._hlsInstance) {
    try { window._hlsInstance.destroy(); } catch (e) {}
    window._hlsInstance = null;
  }
  if (window._streamVideoRO) {
    try { window._streamVideoRO.disconnect(); } catch (e) {}
    window._streamVideoRO = null;
  }
}

/* ── VİDEO SARMALAYICIYI PİKSEL CİNSİNDEN SABİTLE ────────────────
   aspect-ratio CSS'i tek başına native fullscreen giriş/çıkışında
   bazı tarayıcılarda bozuluyor (video dikeye uzuyor). CSS'e güvenmek
   yerine, eski d-visual-iframe scaling mantığıyla aynı şekilde
   wrapper'ın yüksekliğini JS ile piksel olarak hesaplayıp zorluyoruz
   ve fullscreen değişiminde + belirli aralıklarla kendini onarıyoruz. */
function _scaleStreamVideoWrap() {
  const wrap  = document.querySelector('.d-visual-video-wrap');
  const video = document.getElementById('d-stream-player');
  if (!wrap) return;

  /* Fullscreen'deyken hiçbir şeye dokunma — tarayıcı kendi boyutlandırır */
  const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
  if (fsEl) return;

  void wrap.offsetWidth; /* layout'u zorla hesaplat */
  const w = wrap.getBoundingClientRect().width;
  if (!w || w < 10) return;

  const maxH = window.innerHeight * 0.7;
  const h = Math.min(Math.round(w * 9 / 16), Math.round(maxH));

  wrap.style.height    = h + 'px';
  wrap.style.maxHeight = '';   /* px height zaten sınırlıyor */

  if (video) {
    video.style.width  = '100%';
    video.style.height = '100%';
  }
}

function _scheduleStreamVideoScale() {
  [0, 100, 300, 600, 1000, 2000, 3500, 5000, 8000, 12000].forEach(ms => {
    setTimeout(_scaleStreamVideoWrap, ms);
  });

  const wrap = document.querySelector('.d-visual-video-wrap');
  if (wrap && 'ResizeObserver' in window) {
    if (window._streamVideoRO) window._streamVideoRO.disconnect();
    window._streamVideoRO = new ResizeObserver(() => _scaleStreamVideoWrap());
    window._streamVideoRO.observe(wrap);
  }
}

if (!window._streamFsGuardAdded) {
  window._streamFsGuardAdded = true;
  ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'].forEach(evt => {
    document.addEventListener(evt, () => {
      /* Fullscreen'den çıkışta tarayıcının bıraktığı boyutu ez —
         hemen ve birkaç kez tekrar dene (bazı tarayıcılar geç uyguluyor) */
      [0, 50, 150, 400, 1000, 2000].forEach(ms => setTimeout(_scaleStreamVideoWrap, ms));
    });
  });
  window.addEventListener('resize', () => _scaleStreamVideoWrap());
}

async function _initStreamPlayer(url) {
  _destroyStreamPlayer();
  const video = document.getElementById('d-stream-player');
  if (!video || !url) return;

  /* Safari / iOS: native HLS desteği var, hls.js'e gerek yok */
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.play().catch(() => {});
    _scheduleStreamVideoScale();
    return;
  }

  try {
    await _loadHlsJs();
    if (window.Hls && window.Hls.isSupported()) {
      const hls = new window.Hls({ lowLatencyMode: true });
      window._hlsInstance = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
        _scaleStreamVideoWrap();
      });
      hls.on(window.Hls.Events.ERROR, (evt, data) => {
        if (data?.fatal) console.warn('[stream] hls.js fatal error', data);
      });
    } else {
      /* Tarayıcı ne native ne hls.js destekliyor — düz src dene */
      video.src = url;
      video.play().catch(() => {});
    }
  } catch (e) {
    console.warn('[stream] oynatıcı başlatılamadı:', e);
  }
  _scheduleStreamVideoScale();
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

  /* CSS'te opacity:0 ile başlıyor — ölçek uygulandı, şimdi görünür yap */
  wrap.style.opacity = '1';
}

function _scheduleVisualScale() {
  // pushState sonrası layout gecikmesi için daha uzun süreler
  [50, 200, 600, 1500].forEach(function(ms) { setTimeout(scaleVisualIframe, ms); });

  /* Wrap genişlik kazanınca otomatik ölçekle — timer'lar kaçırırsa yedek */
  const wrap = document.querySelector('.d-visual-iframe-wrap');
  if (wrap && 'ResizeObserver' in window) {
    if (window._visualRO) window._visualRO.disconnect();
    window._visualRO = new ResizeObserver(() => scaleVisualIframe());
    window._visualRO.observe(wrap);
  }
}

/* ══════════════════════════════════════════════════════════════
   GitHub orancek repo'sundan gz oran verisi çek ve maçı eşleştir
   ══════════════════════════════════════════════════════════════ */

const ORANCEK_BASE = 'https://raw.githubusercontent.com/bcs562793/orancek/main/data';

function _normTeam(name) {
  return (name || '').toLowerCase()
    .replace(/[çc]/g,'c').replace(/[ğg]/g,'g').replace(/[ıi]/g,'i')
    .replace(/[öo]/g,'o').replace(/[şs]/g,'s').replace(/[üu]/g,'u')
    .replace(/(fc|fk|sk|bk|afc|cf|sc|ac|as)/g,'')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}

function _sim(a, b) {
  const ta = new Set(_normTeam(a).split(' ').filter(Boolean));
  const tb = new Set(_normTeam(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  ta.forEach(t => { if (tb.has(t)) inter++; });
  return inter / Math.max(ta.size, tb.size);
}

function _macToSite(markets) {
  const mk = {};
  for (const m of (markets || [])) {
    const name = m.market_name || '';
    const oc   = m.outcomes   || [];
    const o = (n) => oc.find(x => x.name === n)?.odds ?? null;
    const ou = () => ({ under: o('Alt'), over: o('Üst') });

    if (name === 'Maç Sonucu')
      mk['1x2'] = { home: o('1'), draw: o('X'), away: o('2') };
    else if (name === 'Çifte Şans')
      mk['dc']  = { '1x': o('1-X'), '12': o('1-2'), 'x2': o('X-2') };
    else if (name === 'Karşılıklı Gol')
      mk['btts'] = { yes: o('Var'), no: o('Yok') };
    else if (name === '1. Yarı Sonucu')
      mk['ht_1x2'] = { home: o('1'), draw: o('X'), away: o('2') };
    else if (name === '1. Yarı Çifte Şans')
      mk['ht_dc'] = { '1x': o('1-X'), '12': o('1-2'), 'x2': o('X-2') };
    else if (name === '2. Yarı Sonucu')
      mk['2h_1x2'] = { home: o('1'), draw: o('X'), away: o('2') };
    else if (name === 'Tek/Çift')
      mk['odd_even'] = { odd: o('Tek'), even: o('Çift') };
    else if (name === 'Toplam Gol Aralığı')
      mk['goal_range'] = { '0_1': o('0-1 Gol'), '2_3': o('2-3 Gol'), '4_5': o('4-5 Gol'), '6p': o('6+ Gol') };
    else if (name === 'Daha Çok Gol Olacak Yarı')
      mk['more_goals_half'] = { first: o('1.Y'), equal: o('Eşit'), second: o('2.Y') };
    else if (name === 'İlk Gol')
      mk['first_goal'] = { home: o('1'), none: o('Olmaz'), away: o('2') };
    else if (name === 'İlk Yarı/Maç Sonucu')
      mk['ht_ft'] = Object.fromEntries(oc.map(x => [x.name, x.odds]));
    else if (name === 'Evsahibi İki Yarıda da Gol')
      mk['home_score_both'] = { yes: o('Atar'), no: o('Atamaz') };
    else if (name === 'Deplasman İki Yarıda da Gol')
      mk['away_score_both'] = { yes: o('Atar'), no: o('Atamaz') };
    else {
      /* Alt/Üst ailesi */
      const auMatch = name.match(/^([\d,]+) Alt\/Üst$/);
      if (auMatch) {
        const n = auMatch[1].replace(',','.');
        const keyMap = {'0.5':'ou05','1.5':'ou15','2.5':'ou25','3.5':'ou35','4.5':'ou45','5.5':'ou55'};
        if (keyMap[n]) mk[keyMap[n]] = ou();
      }
      const htAuMatch = name.match(/^1\. Yarı ([\d,]+) Alt\/Üst$/);
      if (htAuMatch) {
        const n = htAuMatch[1].replace(',','.');
        const keyMap = {'0.5':'ht_ou05','1.5':'ht_ou15','2.5':'ht_ou25'};
        if (keyMap[n]) mk[keyMap[n]] = ou();
      }
      const msAuMatch = name.match(/^Maç Sonucu ve \(([\d,]+)\) Alt\/Üst$/);
      if (msAuMatch) {
        const n = msAuMatch[1].replace(',','.');
        const keyMap = {'1.5':'ms_ou15','2.5':'ms_ou25','3.5':'ms_ou35','4.5':'ms_ou45'};
        if (keyMap[n]) mk[keyMap[n]] = {
          h_u: o('1 ve Alt'), x_u: o('X ve Alt'), a_u: o('2 ve Alt'),
          h_o: o('1 ve Üst'), x_o: o('X ve Üst'), a_o: o('2 ve Üst'),
        };
      }
      const hAuMatch = name.match(/^Evsahibi ([\d,]+) Alt\/Üst$/);
      if (hAuMatch) {
        const n = hAuMatch[1].replace(',','.');
        const keyMap = {'0.5':'h_ou05','1.5':'h_ou15','2.5':'h_ou25','3.5':'h_ou35'};
        if (keyMap[n]) mk[keyMap[n]] = ou();
      }
      const aAuMatch = name.match(/^Deplasman ([\d,]+) Alt\/Üst$/);
      if (aAuMatch) {
        const n = aAuMatch[1].replace(',','.');
        const keyMap = {'0.5':'a_ou05','1.5':'a_ou15','2.5':'a_ou25','3.5':'a_ou35'};
        if (keyMap[n]) mk[keyMap[n]] = ou();
      }
      const ahMatch = name.match(/^Handikaplı Maç Sonucu \((\d+):(\d+)\)$/);
      if (ahMatch) {
        const [h, a] = [ahMatch[1], ahMatch[2]];
        const key = parseInt(h) > parseInt(a) ? `ah_p${h}_${a}` : `ah_m${h}_${a}`;
        mk[key] = { home: o('1'), draw: o('X'), away: o('2'), line: `${h}:${a}` };
      }
    }
  }
  return mk;
}

function _sofaTo1x2(sofaMarkets) {
  for (const sm of (sofaMarkets || [])) {
    if (['Full time','1X2','Maç Sonucu'].includes(sm.market_name)) {
      const res = {};
      for (const c of (sm.choices || [])) {
        res[c.name.toLowerCase()] = {
          opening: c.opening_odds,
          closing: c.closing_odds,
          change:  c.change ?? 0,
          winning: c.winning,
        };
      }
      return Object.keys(res).length ? res : null;
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   GZ DOSYALARI YÜKLEME + BENZERİ ORAN ANALİZİ
   ══════════════════════════════════════════════════════════════ */


let   _gzAllCache  = null;   /* tüm gz maçları birleşik dizi */
let   _gzLoadingP  = null;   /* singleton promise */

async function _loadAllGz() {
  if (_gzAllCache) return _gzAllCache;
  if (_gzLoadingP) return _gzLoadingP;

  _gzLoadingP = (async () => {
    
    /* 1. Dosya listesini oranveri.txt'den çek */
const listResp = await fetch('https://www.onlinescoreboard.store/oranveri.txt');
if (!listResp.ok) throw new Error('oranveri.txt erişilemedi');
const text = await listResp.text();
const gzFiles = text.split('\n')
  .map(l => l.trim())
  .filter(l => l.startsWith('odds_') && l.endsWith('.json.gz'))
  .map(name => `${ORANCEK_BASE}/${name}`);

    /* 2. Tüm gz'leri paralel yükle */
    const all = [];
    await Promise.all(gzFiles.map(async url => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) return;
        const buf = await resp.arrayBuffer();
        const ds  = new DecompressionStream('gzip');
        const w   = ds.writable.getWriter();
        w.write(new Uint8Array(buf)); w.close();
        const out = await new Response(ds.readable).arrayBuffer();
        const arr = JSON.parse(new TextDecoder().decode(out));
        arr.forEach(m => all.push(m));
      } catch(e) { console.warn('[gz load]', url, e); }
    }));

    _gzAllCache = all;
    return all;
  })();

  return _gzLoadingP;
}

function _inRange(val, ref, delta) {
  if (val == null || ref == null) return false;
  return Math.abs(val - ref) <= delta;
}

function _getResult(m) {
  const h = m.home_score, a = m.away_score;
  if (h == null || a == null) return null;
  if (h > a) return '1';
  if (h === a) return 'X';
  return '2';
}

function _getOddsChange(m) {
  /* sofascore_markets'ten 1X2 change bilgisi */
  for (const sm of (m.sofascore_markets || [])) {
    if (['Full time','1X2'].includes(sm.market_name)) {
      const res = {};
      for (const c of (sm.choices || [])) {
        res[c.name] = c.change ?? 0; /* -1/0/1 */
      }
      return res;
    }
  }
  return null;
}

function _getMacOdds(m, marketName, outcomeName) {
  for (const mk of (m.mackolik_markets || [])) {
    if (mk.market_name === marketName) {
      const oc = (mk.outcomes || []).find(o => o.name === outcomeName);
      return oc?.odds ?? null;
    }
  }
  return null;
}

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  function getMac(m, market, outcome) {
    for (const mk of (m.mackolik_markets || [])) {
      if (mk.market_name === market) {
        const oc = (mk.outcomes || []).find(o => o.name === outcome);
        return oc?.odds ?? null;
      }
    }
    return null;
  }

  function ok(val, ref, tol) {
    return val != null && ref != null && Math.abs(val - ref) <= tol;
  }

  function getResult(m) {
    const h = m.home_score, a = m.away_score;
    if (h == null || a == null) return null;
    return h > a ? '1' : h === a ? 'X' : '2';
  }

  function getOddsChange(m) {
    for (const sm of (m.sofascore_markets || [])) {
      if (['Full time','1X2'].includes(sm.market_name)) {
        const res = {};
        for (const c of (sm.choices || [])) res[c.name] = c.change ?? 0;
        return res;
      }
    }
    return null;
  }

  // ── Filtre havuzu — her filtre birden fazla tolerans seviyesine sahip ─────
  // [tolerans, etiket, fn] formatında — geniş→dar sırada
  //
  // Akıllı sistem şu şekilde çalışır:
  //   Her adımda HAVUZDAN bir (filtre, tolerans) çifti seçilir.
  //   Seçim kriteri: hedefe (TARGET) en yakın sonucu veren, MIN altına düşmeyen.
  //   Filtre bir kez seçilince bir sonraki dar toleransına geçilir.

async function runSimAnalysis(fixtureId, cur1x2, curHt, curOu25) {
  const resultEl = document.getElementById(`sim-result-${fixtureId}`);
  if (!resultEl) return;
  resultEl.innerHTML = '<div class="sim-loading">⏳ Taranıyor…</div>';
  const all = await _loadAllGz();
  if (!all.length) { resultEl.innerHTML = '<div>Veri yok</div>'; return; }

  const TARGET_MIN = 5;
  const TARGET_MAX = 12;

  // Ev1.5 ve Dep1.5 için beklenen değer hesapla
  const expEv15  = cur1x2 ? (cur1x2.home < 1.70 ? 1.35 : cur1x2.home < 2.00 ? 1.50 : cur1x2.home < 2.50 ? 1.70 : 1.90) : null;
  const expDep15 = cur1x2 ? (cur1x2.away < 2.00 ? 1.80 : cur1x2.away < 2.50 ? 1.60 : cur1x2.away < 3.00 ? 1.45 : 1.30) : null;

  // Her filtre: { id, levels: [{tol, label}], fn(arr, tol), skip }
  const FILTER_POOL = [
    {
      id: 'MS', skip: !cur1x2,
      levels: [
        { tol: 0.20, label: 'MS'      },
        { tol: 0.15, label: 'MS±0.15' },
        { tol: 0.10, label: 'MS±0.10' },
        { tol: 0.07, label: 'MS±0.07' },
        { tol: 0.05, label: 'MS±0.05' },
      ],
      fn: (arr, tol) => arr.filter(m =>
        ok(getMac(m,'Maç Sonucu','1'), cur1x2.home, tol) &&
        ok(getMac(m,'Maç Sonucu','X'), cur1x2.draw, tol) &&
        ok(getMac(m,'Maç Sonucu','2'), cur1x2.away, tol)
      ),
    },
    {
      id: 'İY', skip: !curHt,
      levels: [
        { tol: 0.20, label: 'İY'      },
        { tol: 0.15, label: 'İY±0.15' },
        { tol: 0.10, label: 'İY±0.10' },
        { tol: 0.07, label: 'İY±0.07' },
      ],
      fn: (arr, tol) => arr.filter(m =>
        ok(getMac(m,'1. Yarı Sonucu','1'), curHt.home, tol) &&
        ok(getMac(m,'1. Yarı Sonucu','X'), curHt.draw, tol) &&
        ok(getMac(m,'1. Yarı Sonucu','2'), curHt.away, tol)
      ),
    },
    {
      id: '2.5AÜ', skip: !curOu25,
      levels: [
        { tol: 0.15, label: '2.5AÜ'      },
        { tol: 0.10, label: '2.5AÜ±0.10' },
        { tol: 0.07, label: '2.5AÜ±0.07' },
        { tol: 0.05, label: '2.5AÜ±0.05' },
      ],
      fn: (arr, tol) => arr.filter(m =>
        ok(getMac(m,'2,5 Alt/Üst','Alt'), curOu25.under, tol) &&
        ok(getMac(m,'2,5 Alt/Üst','Üst'), curOu25.over,  tol)
      ),
    },
    {
      id: 'Ev1.5', skip: !expEv15,
      levels: [
        { tol: 0.25, label: 'Ev1.5'      },
        { tol: 0.18, label: 'Ev1.5±0.18' },
        { tol: 0.12, label: 'Ev1.5±0.12' },
      ],
      fn: (arr, tol) => arr.filter(m =>
        ok(getMac(m,'Evsahibi 1,5 Alt/Üst','Alt'), expEv15, tol)
      ),
    },
    {
      id: 'Dep1.5', skip: !expDep15,
      levels: [
        { tol: 0.30, label: 'Dep1.5'      },
        { tol: 0.20, label: 'Dep1.5±0.20' },
        { tol: 0.12, label: 'Dep1.5±0.12' },
      ],
      fn: (arr, tol) => arr.filter(m =>
        ok(getMac(m,'Deplasman 1,5 Alt/Üst','Alt'), expDep15, tol)
      ),
    },
    {
      id: 'KG', skip: false,
      levels: [
        { tol: 999, label: 'KG' },  // varlık filtresi — tolerans önemsiz
      ],
      fn: (arr) => arr.filter(m => getMac(m,'Karşılıklı Gol','Var') != null),
    },
  ].filter(f => !f.skip);

  // Her filtrenin mevcut seviye indexi (0 = henüz uygulanmadı)
  const levelIdx = Object.fromEntries(FILTER_POOL.map(f => [f.id, 0]));
  // Uygulanan filtreler ve etiketleri
  const applied  = Object.fromEntries(FILTER_POOL.map(f => [f.id, false]));
  const labels   = {};

  let matches = all.filter(m => getResult(m) !== null);

  console.group(`🚀 [AKILLI DARALTMA] Fixture ${fixtureId}`);
  console.log(`📦 Başlangıç: ${matches.length} maç | Hedef: ${TARGET_MIN}-${TARGET_MAX}`);

  let stepCount = 0;
  const MAX_STEPS = 30; // sonsuz döngü koruması

  while (matches.length > TARGET_MAX && stepCount < MAX_STEPS) {
    stepCount++;

    // ── Bir sonraki en iyi adımı bul ─────────────────────────────────────
    // Kriter: TARGET_MIN'e ≥ kalarak hedefe en yakın sonucu veren filtre+tol
    let bestFilter = null;
    let bestResult = null;
    let bestScore  = Infinity; // hedefe uzaklık — küçük = iyi

    for (const filter of FILTER_POOL) {
      const idx = levelIdx[filter.id];
      if (idx >= filter.levels.length) continue; // tüm seviyeleri tükendi

      let narrowed;
      try {
        narrowed = filter.fn(matches, filter.levels[idx].tol);
      } catch(e) { continue; }

      if (narrowed.length < TARGET_MIN) continue; // çok daralıyor — atla

      // Hedefe uzaklık: TARGET_MAX içindeyse 0, üstündeyse fark
      const score = narrowed.length <= TARGET_MAX
        ? 0                                       // hedefte!
        : narrowed.length - TARGET_MAX;           // hâlâ fazla — ne kadar?

      // Eşit skorlarda daha az maç bırakanı tercih et
      const isBetter = score < bestScore ||
        (score === bestScore && bestResult !== null && narrowed.length < bestResult.length);

      if (isBetter) {
        bestScore  = score;
        bestResult = narrowed;
        bestFilter = filter;
      }
    }

    if (!bestFilter) {
      console.log(`⚠️  Adım ${stepCount}: Daha fazla daraltma yapılamıyor — ${matches.length} maçta kalınıyor`);
      break;
    }

    const lvl = bestFilter.levels[levelIdx[bestFilter.id]];
    labels[bestFilter.id] = lvl.label;
    applied[bestFilter.id] = true;
    levelIdx[bestFilter.id]++; // bir sonraki sefere bir dar seviyeye geç
    matches = bestResult;

    const isInTarget = matches.length <= TARGET_MAX;
    console.log(`${isInTarget ? '✅' : '🔧'} Adım ${stepCount}: ${lvl.label} → ${matches.length} maç ${isInTarget ? '(HEDEF!)' : ''}`);

    if (isInTarget) break;
  }

  // Filtre açıklaması — uygulanan filtreleri sırayla birleştir
  const filterDesc = FILTER_POOL
    .filter(f => applied[f.id])
    .map(f => labels[f.id])
    .join(' + ') || 'Tüm Maçlar';

  console.log(`🏁 FİNAL: "${filterDesc}" → ${matches.length} maç`);
  console.groupEnd();

  if (matches.length < 3) {
    resultEl.innerHTML = '<div class="sim-empty">🔍 Yeterli benzer maç bulunamadı (min. 3)</div>';
    return;
  }

  // ── İstatistik ────────────────────────────────────────────────────────────

  const total = matches.length;
  const cnt = { '1':0, 'X':0, '2':0 };
  const changeCnt = {
    '1':{ up:0,upW:0,dn:0,dnW:0,eq:0,eqW:0 },
    'X':{ up:0,upW:0,dn:0,dnW:0,eq:0,eqW:0 },
    '2':{ up:0,upW:0,dn:0,dnW:0,eq:0,eqW:0 },
  };

  matches.forEach(m => {
    const res = getResult(m);
    if (!res) return;
    cnt[res]++;
    const ch = getOddsChange(m);
    if (ch) {
      ['1','X','2'].forEach(k => {
        const dir = ch[k]===1?'up':ch[k]===-1?'dn':'eq';
        changeCnt[k][dir]++;
        if (res===k) changeCnt[k][dir+'W']++;
      });
    }
  });

  const bar = (n,t,cls) => {
    const w = t>0?Math.round(n/t*100):0;
    return `<div class="sim-bar-wrap"><div class="sim-bar ${cls}" style="width:${w}%"></div><span>${n} (%${w})</span></div>`;
  };

  const chRow = (label,key) => {
    const d = changeCnt[key];
    const rows = [];
    if(d.up>0) rows.push(`<tr><td>↑ Yükseldi</td><td>${d.up}</td><td>${d.upW}/${d.up} (%${Math.round(d.upW/d.up*100)})</td></tr>`);
    if(d.dn>0) rows.push(`<tr><td>↓ Düştü</td><td>${d.dn}</td><td>${d.dnW}/${d.dn} (%${Math.round(d.dnW/d.dn*100)})</td></tr>`);
    if(d.eq>0) rows.push(`<tr><td>→ Sabit</td><td>${d.eq}</td><td>${d.eqW}/${d.eq} (%${Math.round(d.eqW/d.eq*100)})</td></tr>`);
    if(!rows.length) return '';
    return `<div class="sim-ch-section">
      <div class="sim-ch-title">${label} oranı değişimi → Kazanma</div>
      <table class="sim-ch-tbl"><tr><th>Yön</th><th>Maç</th><th>Kazandı</th></tr>${rows.join('')}</table>
    </div>`;
  };

  const hasChange = matches.some(m => getOddsChange(m));

  resultEl.innerHTML = `
    <div class="sim-card">
      <div class="sim-header">
        <span class="sim-count">${total} Benzer Maç</span>
        <span class="sim-filter" style="color:#0f0">✅ ${filterDesc}</span>
      </div>
      <div class="sim-results">
        <div class="sim-col"><div class="sim-col-lbl">🏠 Ev Kazandı</div>${bar(cnt['1'],total,'bar-1')}</div>
        <div class="sim-col"><div class="sim-col-lbl">🤝 Beraberlik</div>${bar(cnt['X'],total,'bar-x')}</div>
        <div class="sim-col"><div class="sim-col-lbl">✈️ Dep Kazandı</div>${bar(cnt['2'],total,'bar-2')}</div>
      </div>
      ${hasChange?`<div class="sim-change">
        <div class="sim-ch-hdr">📈 Oran Hareketi → Sonuç İlişkisi</div>
        ${chRow('Ev (1)','1')}${chRow('Beraberlik (X)','X')}${chRow('Deplasman (2)','2')}
      </div>`:''}
    </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   SCOREPOP — Oran Zekası Sinyal Motoru  v1.0
   
   KURULUM:
     1. Bu dosyadaki tüm kodu app.js'e ekle (fetchGzOdds fonksiyonunun
        hemen üstüne yapıştır).
     2. signal_css_addon.css içeriğini style.css'in sonuna ekle.
     3. buildDetail'deki "BENZERİ ORANLARIN ANALİZİ" bloğunu (sim-wrap)
        yeni renderSignalCard çağrısıyla değiştir.
     4. runSimAnalysis fonksiyonunu yeni runSimAnalysisV2 ile değiştir.
   
   DEĞİŞTİRİLECEK buildDetail SATIRI (~L2020):
     Eski:
       html += `<div class="sim-wrap" id="sim-wrap-${m.fixture_id}">...`
     Yeni:
       html += renderSignalCard(m.fixture_id, cur1x2, curOu25);
   
   DEĞİŞTİRİLECEK runSimAnalysis ÇAĞRISI:
     Tüm runSimAnalysis fonksiyonunu KALDIR,
     onclick'leri runSimAnalysisV2(...) olarak güncelle.
════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────
   1. İSTATİSTİK TABLOSU (hardcoded — 57.879 maç, Kasım 2023–Mart 2026)
   
   Her kombinasyon için: [toplam_maç, ev%, beraber%, dep%, üst25%, üst35%, kg%]
   Kaynak: orancek veri analizi (Python)
   Yeniden hesaplamak için: orancek repo'su büyüyünce bu tabloyu güncelle.
───────────────────────────────────────────────────────────────────── */
const SP_SIGNAL_DB = {
  /* change_1, change_x, change_2 → [n, p1, px, p2, ou25, ou35, kg] */
  '0,0,0':   [21267, 43.2, 25.9, 30.9, 50.9, 29.7, 51.2],
  '-1,1,1':  [8548,  57.1, 22.5, 20.4, 55.7, 33.7, 52.7],
  '1,1,-1':  [5167,  30.8, 21.7, 47.4, 55.7, 31.7, 54.1],
  '1,-1,-1': [6435,  45.4, 26.4, 28.2, 48.5, 26.3, 52.2],
  '-1,-1,1': [3565,  34.5, 26.8, 38.6, 49.2, 26.3, 52.1],
  '1,-1,1':  [1183,  38.7, 29.2, 32.0, 44.4, 23.0, 49.1],
  '0,1,-1':  [527,   49.0, 21.1, 30.0, 60.3, 35.5, 57.3],
  '-1,1,-1': [366,   48.9, 23.0, 28.1, 57.1, 34.4, 57.7],
  '-1,1,0':  [617,   52.0, 23.3, 24.6, 55.9, 32.4, 53.5],
  '0,-1,0':  [153,   51.0, 22.2, 26.8, 55.6, 32.0, 51.6],
  '0,1,0':   [315,   50.2, 25.1, 24.8, 54.8, 33.8, 53.8],
  '1,0,-1':  [2898,  39.1, 28.5, 32.4, 52.4, 30.2, 55.5],
  '-1,0,1':  [2564,  35.4, 27.0, 37.6, 50.7, 28.8, 52.9],
  '1,0,0':   [390,   35.1, 28.7, 36.2, 47.4, 24.4, 52.8],
  '-1,0,0':  [102,   35.3, 30.4, 34.3, 53.9, 31.4, 57.8],
  '1,0,1':   [278,   41.7, 25.5, 32.7, 49.6, 23.4, 49.3],
  '0,0,-1':  [138,   44.9, 26.1, 29.0, 56.5, 34.1, 56.5],
  '0,-1,1':  [730,   39.3, 27.8, 32.7, 49.0, 28.8, 51.6],
  '1,1,0':   [273,   41.0, 24.2, 34.8, 51.6, 31.1, 50.5],
  '1,1,1':   [666,   42.2, 31.1, 26.7, 48.0, 29.0, 53.0],
  '0,0,1':   [397,   45.3, 26.4, 28.3, 52.9, 28.5, 52.9],
  '0,1,1':   [334,   47.3, 22.2, 30.5, 55.4, 28.4, 53.3],
  '-1,0,-1': [24,    41.7, 25.0, 33.3, 56.5, 34.1, 56.5],
  '-1,-1,0': [31,    38.7, 32.3, 29.0, 51.6, 31.0, 51.6],
  '-1,-1,-1':[14,    57.1, 21.4, 21.4, 50.0, 28.6, 50.0],
  '0,1,-1':  [527,   49.0, 21.1, 30.0, 60.3, 35.5, 57.3],
  '0,-1,-1': [32,    65.6, 18.8, 15.6, 55.6, 32.0, 51.6],
};

/* Baza istatistikleri */
const SP_BASE = { n: 57878, p1: 44.1, px: 25.9, p2: 30.7, ou25: 51.7, ou35: 29.7, kg: 52.3 };

/* ─────────────────────────────────────────────────────────────────────
   2. SİNYAL HESAPLAMA
───────────────────────────────────────────────────────────────────── */

/**
 * sofa_1x2 objesi: { '1': {change, opening, closing, winning}, 'x': {...}, '2': {...} }
 * Döner: { tier, winner, pct, delta_1x2, ou25, ou25_delta, ou35, ou35_delta,
 *          kg, kg_delta, combo, n, desc, badges[] }
 */
function buildSignals(sofa_1x2) {
  if (!sofa_1x2) return null;

  const ch1 = sofa_1x2['1']?.change ?? 0;
  const chx = sofa_1x2['x']?.change ?? 0;
  const ch2 = sofa_1x2['2']?.change ?? 0;

  const key = `${ch1},${chx},${ch2}`;
  const row = SP_SIGNAL_DB[key];
  if (!row) return null;

  const [n, p1, px, p2, ou25, ou35, kg] = row;

  /* En büyük sapma hangi tarafta? */
  const d1 = +(p1 - SP_BASE.p1).toFixed(1);
  const dx = +(px - SP_BASE.px).toFixed(1);
  const d2 = +(p2 - SP_BASE.p2).toFixed(1);

  let winner, winnerPct, winnerDelta, winnerLabel;
  const maxDelta = Math.max(Math.abs(d1), Math.abs(dx), Math.abs(d2));

  if (Math.abs(d1) >= Math.abs(d2) && Math.abs(d1) >= Math.abs(dx)) {
    winner = '1'; winnerPct = p1; winnerDelta = d1; winnerLabel = 'ev sahibi';
  } else if (Math.abs(d2) >= Math.abs(d1) && Math.abs(d2) >= Math.abs(dx)) {
    winner = '2'; winnerPct = p2; winnerDelta = d2; winnerLabel = 'deplasman';
  } else {
    winner = 'X'; winnerPct = px; winnerDelta = dx; winnerLabel = 'beraberlik';
  }

  /* Güven seviyesi */
  let tier;
  if (maxDelta >= 10 && n >= 500)        tier = 'strong';
  else if (maxDelta >= 5 && n >= 100)    tier = 'medium';
  else if (maxDelta >= 3 && n >= 50)     tier = 'weak';
  else                                    tier = 'none';

  /* Gol sinyali */
  const ou25Delta = +(ou25 - SP_BASE.ou25).toFixed(1);
  const ou35Delta = +(ou35 - SP_BASE.ou35).toFixed(1);
  const kgDelta   = +(kg   - SP_BASE.kg).toFixed(1);

  /* Kombino etiket */
  const chLabel = v => v === 1 ? '↑' : v === -1 ? '↓' : '→';
  const comboChips = [
    { label: `1 ${chLabel(ch1)}`, dir: ch1 },
    { label: `X ${chLabel(chx)}`, dir: chx },
    { label: `2 ${chLabel(ch2)}`, dir: ch2 },
  ];

  /* Açıklama cümlesi */
  const tierText = { strong: 'güçlü sinyal', medium: 'orta sinyal', weak: 'zayıf sinyal', none: 'nötr' };
  const desc = buildSignalDesc(ch1, chx, ch2, winner, winnerPct, winnerDelta, ou25Delta, n);

  /* Maç listesi rozetleri */
  const badges = [];
  if (tier !== 'none') {
    if (winner === '1' && winnerDelta > 4)        badges.push({ cls: 'sp-badge--ev',  text: '▲ EV' });
    if (winner === '2' && winnerDelta > 4)        badges.push({ cls: 'sp-badge--dep', text: '▲ DEP' });
    if (ou25Delta >= 6)                            badges.push({ cls: 'sp-badge--ust', text: '▲ ÜST' });
    if (ou25Delta <= -5)                           badges.push({ cls: 'sp-badge--alt', text: '▼ ALT' });
  }

  return {
    tier, winner, winnerPct, winnerDelta, winnerLabel,
    d1, dx, d2, p1, px, p2,
    ou25, ou25Delta, ou35, ou35Delta, kg, kgDelta,
    combo: comboChips, n, desc, badges,
    key,
  };
}

function buildSignalDesc(ch1, chx, ch2, winner, pct, delta, ou25Delta, n) {
  /* ─── Maç Sonucu sinyali ─── */
  let ms = '';
  if (ch1 === -1 && chx === 1 && ch2 === 1) {
    ms = '🟢 <strong>Güçlü Ev Sinyali:</strong> Ev sahibi oranı düşerken rakipler yükseliyor. Piyasa evi açık favori görüyor — "sharp money" ev sahibinde. 57k maçta bu kombinasyon <strong>%57.1 ev galibiyeti</strong> (baza +13).';
  } else if (ch1 === 1 && chx === 1 && ch2 === -1) {
    ms = '🔵 <strong>Güçlü Deplasman Sinyali:</strong> Deplasman oranı düşerken rakipler yükseliyor. Piyasa deplasmanı favori görüyor — en büyük mutlak sapma. 57k maçta <strong>%47.4 deplasman galibiyeti</strong> (baza +16).';
  } else if (ch1 === -1 && chx === 1 && ch2 === 0) {
    ms = '🟢 <strong>Ev Sinyali:</strong> Ev oranı düşüyor, beraberlik uzaklaşıyor, deplasman sabit. Piyasa evi favori görüyor. Benzer maçlarda <strong>%52 ev galibiyeti</strong>.';
  } else if (ch1 === 0 && chx === 1 && ch2 === -1) {
    ms = '🔵 <strong>Deplasman + Gol Sinyali:</strong> Deplasman güçleniyor, beraberlik uzaklaşıyor, ev sabit. Açık maç beklentisi var. Benzer maçlarda <strong>%60.3 üst 2.5</strong> — en yüksek gol sinyali.';
  } else if (chx === -1 && ch1 !== -1 && ch2 !== -1) {
    ms = '🟡 <strong>Düşük Gol Sinyali:</strong> Beraberlik oranı yaklaşıyor — piyasa sıkışık, düşük tempolu maç bekliyor. Bu kombinasyon 2.5 Üst sadece <strong>%44.4</strong> (baza -7.4). 1.5 Alt dikkat çekici.';
  } else if (ch1 === 1 && chx === -1 && ch2 === 1) {
    ms = '🟡 <strong>Kilitli Maç:</strong> Her iki taraf oranı yükselirken beraberlik kısalıyor. Piyasa düşük tempolu, beraberlik odaklı maç bekliyor. 2.5 Üst <strong>%44.4</strong> (baza -7.4).';
  } else if (ch1 === -1 && chx === -1 && ch2 === 1) {
    ms = '🔵 <strong>Deplasman Sinyali:</strong> Ev ve beraberlik oranları düşerken deplasman yükseliyor. Benzer maçlarda <strong>%38.6 deplasman galibiyeti</strong> (+8 baza).';
  } else if (ch1 === 1 && chx === -1 && ch2 === -1) {
    ms = '🟢 <strong>Ev + Sabit Sinyal:</strong> Beraberlik düşerken ev sabit, deplasman sabit. Beraberlik uzaklaşıyor, ev hafif öne çıkıyor. Benzer maçlarda <strong>%51 ev galibiyeti</strong> (+7).';
  } else if (ch1 === 0 && chx === 0 && ch2 === 0) {
    ms = '⚪ <strong>Nötr:</strong> Tüm oranlar sabit. Piyasada anlamlı bir yön yok. Bu durum 21.267 maçta (%37 tüm maçlar) görülüyor — baza istatistiklerini referans al.';
  } else {
    const dirMap = { '1': 'Ev sahibi', '2': 'Deplasman', 'X': 'Beraberlik' };
    ms = `${dirMap[winner]} tarafında anlamlı hareket var.`;
  }

  /* ─── Gol sinyali ─── */
  let golNote = '';
  if (ou25Delta >= 8) {
    golNote = ` 🔥 <strong>Yüksek Gol:</strong> Bu kombinasyonda 2.5 Üst <strong>%${+(51.7+ou25Delta).toFixed(0)}</strong> (baza +${ou25Delta}).`;
  } else if (ou25Delta >= 4) {
    golNote = ` ⬆️ Gol ortalamanın üzerinde: 2.5 Üst <strong>%${+(51.7+ou25Delta).toFixed(0)}</strong> (+${ou25Delta}).`;
  } else if (ou25Delta <= -5) {
    golNote = ` ⬇️ <strong>Düşük Gol:</strong> 2.5 Üst sadece <strong>%${+(51.7+ou25Delta).toFixed(0)}</strong> (${ou25Delta}).`;
  }

  return `${ms}${golNote} <span style="color:var(--tx3);font-size:10px;">${n.toLocaleString('tr-TR')} maçlık geçmiş veriye dayanıyor.</span>`;
}

/* ─────────────────────────────────────────────────────────────────────
   3. HTML RENDER — Sinyal Kartı
   
   @param sofa1x2  Sofascore oran hareketi { '1':{change}, 'x':{change}, '2':{change} }
                   buildSignals() buradan change:-1/0/1 okur.
   @param mac1x2   Mackolik kapanış fiyatları { home, draw, away }
                   runSimAnalysisV2 butonuna geçirilir (fiyat filtresi için).
   @param curOu25  Mackolik 2.5 Alt/Üst { under, over }
───────────────────────────────────────────────────────────────────── */
function renderSignalCard(fixtureId, sofa1x2, mac1x2, curOu25) {
  /* buildSignals yalnızca oran HAREKETİ (change) bekliyor — Mackolik fiyatı değil */
  const sig = buildSignals(sofa1x2);

  /* Buton için JSON — mac1x2 (fiyat) ve curOu25 geçiyoruz */
  const mac1x2Json  = JSON.stringify(mac1x2  || null).replace(/"/g,'&quot;');
  const curOu25Json = JSON.stringify(curOu25 || null).replace(/"/g,'&quot;');
  const sofaJson    = JSON.stringify(sofa1x2 || null).replace(/"/g,'&quot;');

  const tierLabel = {
    strong: '⬡ GÜÇLÜ SİNYAL',
    medium: '◈ ORTA SİNYAL',
    weak:   '◇ ZAYIF SİNYAL',
    none:   '— NÖTR',
  };

   

  /* Chip HTML */
  const chCls = d => d === 1 ? 'sp-chip--up' : d === -1 ? 'sp-chip--dn' : 'sp-chip--eq';
  const chipsHtml = sig
    ? sig.combo.map(c => `<span class="sp-chip ${chCls(c.dir)}">${c.label}</span>`).join('')
    : '';

  /* Delta renk */
  const dCls  = d => d > 0 ? 'delta-pos' : d < 0 ? 'delta-neg' : '';
  const dSign = d => d > 0 ? `+${d}` : `${d}`;

  /* Market blokları */
  const mktBlock = (title, items) => `
    <div class="sim-mkt-block">
      <div class="sim-mkt-block-title">${title}</div>
      ${items.map(({ label, pct, delta, barCls }) => `
        <div class="sim-mkt-row">
          <span class="sim-mkt-label">${label}</span>
          <span class="sim-mkt-val ${mktValCls(delta)}">
            %${pct.toFixed(0)}
            <span class="sim-mkt-d ${dCls(delta)}">${dSign(delta)}</span>
          </span>
        </div>
        <div class="sim-mkt-bar-wrap">
          <div class="sim-mkt-bar ${barCls}" style="width:${Math.min(pct,100)}%"></div>
        </div>`).join('')}
    </div>`;

  const mktValCls = d => Math.abs(d) >= 6 ? 'sp-mkt--high' : Math.abs(d) >= 3 ? 'sp-mkt--mid' : 'sp-mkt--low';

  if (!sig) {
    /* Sofascore oran hareketi yok — sadece fiyat bazlı arşiv analizi butonu */
    if (!mac1x2) return ''; /* Mackolik fiyatı da yoksa hiçbir şey gösterme */
    return `
      <div class="sim-wrap" id="sim-wrap-${fixtureId}">
        <button class="sim-btn" onclick="runSimAnalysisV2(${fixtureId}, ${mac1x2Json}, ${curOu25Json}, ${sofaJson})">
          📊 Benzer Oranlı Geçmiş Maçları Analiz Et
        </button>
        <div class="sim-result" id="sim-result-${fixtureId}"></div>
      </div>`;
  }

  return `
    <div class="sp-signal sp-signal--${sig.tier}" id="sp-sig-${fixtureId}">
      <div class="sp-signal-hdr">
        <div class="sp-signal-hdr-left">
          <div class="sp-signal-hdr-dot"></div>
          <span>${tierLabel[sig.tier]}</span>
        </div>
        <span class="sp-signal-n">${sig.n.toLocaleString('tr-TR')} maç</span>
      </div>

      <div class="sp-signal-combo">
        <div class="sp-signal-combo-chips">${chipsHtml}</div>
        <span class="sp-signal-arrow">→</span>
        <div class="sp-signal-winner">
          <span class="sp-signal-winner-pct">%${sig.winnerPct.toFixed(0)}</span>
          <span class="sp-signal-winner-lbl">${sig.winnerLabel} kazanır
            <span class="sp-signal-winner-delta ${dCls(sig.winnerDelta)}">(${dSign(sig.winnerDelta)}%)</span>
          </span>
        </div>
      </div>

      <div class="sim-market-grid">
        ${mktBlock('MS Olasılıkları', [
          { label: 'Ev kazanır', pct: sig.p1, delta: sig.d1, barCls: 'bar-green' },
          { label: 'Beraberlik', pct: sig.px, delta: sig.dx, barCls: 'bar-amber' },
          { label: 'Dep kazanır', pct: sig.p2, delta: sig.d2, barCls: 'bar-red'   },
        ])}
        ${mktBlock('Gol Marketleri', [
          { label: '2.5 Üst', pct: sig.ou25, delta: sig.ou25Delta, barCls: 'bar-blue'  },
          { label: '3.5 Üst', pct: sig.ou35, delta: sig.ou35Delta, barCls: 'bar-blue'  },
          { label: 'KG Var',  pct: sig.kg,   delta: sig.kgDelta,   barCls: 'bar-green' },
        ])}
      </div>

      <div class="sp-signal-desc">${sig.desc}</div>
    </div>

    <div class="sim-wrap" id="sim-wrap-${fixtureId}" style="padding-top:4px;">
      <button class="sim-btn" onclick="runSimAnalysisV2(${fixtureId}, ${mac1x2Json}, ${curOu25Json}, ${sofaJson})">
        🔍 Geçmiş Maçları Tara — Detaylı Analiz
      </button>
      <div class="sim-result" id="sim-result-${fixtureId}"></div>
    </div>`;
}


/* ─────────────────────────────────────────────────────────────────────
   4. DETAYLI BENZERLİK ANALİZİ — DERİN ANALİZ (v3 — Dinamik Sapma Entegrasyonu)
───────────────────────────────────────────────────────────────────── */
async function runSimAnalysisV2(fixtureId, cur1x2, curOu25, curSofa) {
  const resultEl = document.getElementById(`sim-result-${fixtureId}`);
  if (!resultEl) return;
  resultEl.innerHTML = '<div class="sim-loading">⏳ Arşiv taranıyor ve sapmalar hesaplanıyor…</div>';
 
  let all;
  try { all = await loadAllGzMatches(); }
  catch(e) { resultEl.innerHTML = '<div class="sim-err">⚠️ Veri yüklenemedi</div>'; return; }
  if (!all || !all.length) { resultEl.innerHTML = '<div class="sim-err">⚠️ Arşiv boş</div>'; return; }

  /* ── Yardımcılar ── */
  const getResult = m => {
    const h = m.home_score, a = m.away_score;
    if (h == null || a == null) return null;
    return h > a ? '1' : h < a ? '2' : 'X';
  };

  const getMac = (m, mktName, outName) => {
    for (const mk of (m.mackolik_markets || [])) {
      if (mk.market_name === mktName) {
        const oc = (mk.outcomes || []).find(o => o.name === outName);
        return oc?.odds ?? null;
      }
    }
    return null;
  };

  const getSofaChange = m => {
    for (const sm of (m.sofascore_markets || [])) {
      if (['Full time','1X2','Maç Sonucu'].includes(sm.market_name) || sm.market_group === '1X2') {
        const cm = {};
        for (const c of (sm.choices || [])) cm[c.name] = c;
        if (cm['1'] !== undefined && cm['X'] !== undefined && cm['2'] !== undefined) {
          const derive = (d) => {
            if (!d) return 0;
            const op = d.opening_odds ?? d.opening;
            const cl = d.closing_odds ?? d.closing;
            if (op != null && cl != null && Math.abs(cl - op) > 0.04) { return cl < op ? -1 : 1; }
            return Number(d.change ?? 0);
          };
          return { '1': derive(cm['1']), 'X': derive(cm['X']), '2': derive(cm['2']) };
        }
      }
    }
    return null;
  };

  const ok = (val, ref, tol) => val != null && ref != null && Math.abs(val - ref) <= tol;

  /* ── Parametreler ── */
  const mac1 = cur1x2?.home  ?? null;
  const macX = cur1x2?.draw  ?? null;
  const mac2 = cur1x2?.away  ?? null;
  const macU = curOu25?.under ?? null;
  const chg1 = curSofa?.['1']?.change ?? null;
  const chgX = curSofa?.['x']?.change ?? null;
  const chg2 = curSofa?.['2']?.change ?? null;
  const hasTrend = chg1 !== null && chgX !== null && chg2 !== null;

  /* ── HAVUZ 1: Baseline (Sadece MS ±0.05) ── */
  const withResult = all.filter(m => getResult(m) !== null && String(m.fixture_id) !== String(fixtureId));
  const poolOdds = mac1 != null
    ? withResult.filter(m =>
        ok(getMac(m,'Maç Sonucu','1'), mac1, 0.05) &&
        ok(getMac(m,'Maç Sonucu','X'), macX, 0.05) &&
        ok(getMac(m,'Maç Sonucu','2'), mac2, 0.05))
    : withResult;

  if (poolOdds.length < 3) {
    resultEl.innerHTML = '<div class="sim-empty">🔍 Yeterli benzer maç bulunamadı (min. 3)</div>';
    return;
  }

  /* ── HAVUZ 2: Akıllı Dinamik Sapma ── */
  let currentPool = [];
  let appliedTol = 0;
  let isTrendUsed = false;

  // 1. Önce Trendi tam uyan maçları ±0.01'den ±0.15'e kadar genişleterek ara
  for (let t = 0.01; t <= 0.15; t += 0.01) {
    const tol = Number(t.toFixed(2));
    const next = withResult.filter(m => {
        const m1 = getMac(m,'Maç Sonucu','1'), mX = getMac(m,'Maç Sonucu','X'), m2 = getMac(m,'Maç Sonucu','2');
        if (!ok(m1, mac1, tol) || !ok(mX, macX, tol) || !ok(m2, mac2, tol)) return false;
        if (!hasTrend) return true;
        const sc = getSofaChange(m);
        return sc && sc['1'] === chg1 && sc['X'] === chgX && sc['2'] === chg2;
    });

    if (next.length >= 5) {
      currentPool = next;
      appliedTol = tol;
      isTrendUsed = hasTrend;
      break;
    }
  }

  // 2. Eğer trendle 5 maç bulunamadıysa, trendsiz sadece MS oranlarına göre ±0.05'ten başla
  if (currentPool.length < 5) {
      currentPool = poolOdds; // Baseline'a geri dön
      appliedTol = 0.05;
      isTrendUsed = false;
  }

  // En yakınları üste al ve 12 ile sınırla
  currentPool.sort((a,b) => {
    const dA = Math.abs((getMac(a,'Maç Sonucu','1')||0) - mac1) + Math.abs((getMac(a,'Maç Sonucu','2')||0) - mac2);
    const dB = Math.abs((getMac(b,'Maç Sonucu','1')||0) - mac1) + Math.abs((getMac(b,'Maç Sonucu','2')||0) - mac2);
    return dA - dB;
  });
  const renderList = currentPool.slice(0, 12);

  /* ── İstatistikler ── */
  const calcStats = list => {
    const c = { '1':0, 'X':0, '2':0, o15:0, o25:0, o35:0, kg:0 };
    list.forEach(m => {
      const r = getResult(m); if (!r) return;
      c[r]++;
      const tg = (m.home_score ?? 0) + (m.away_score ?? 0);
      if (tg > 1.5) c.o15++;
      if (tg > 2.5) c.o25++;
      if (tg > 3.5) c.o35++;
      if (m.home_score > 0 && m.away_score > 0) c.kg++;
    });
    const n = list.length || 1;
    const pct = (v) => Math.round(v / n * 100);
    return { n: list.length, p1: pct(c['1']), px: pct(c['X']), p2: pct(c['2']), o15: pct(c.o15), o25: pct(c.o25), o35: pct(c.o35), kg: pct(c.kg) };
  };

  const s1 = calcStats(poolOdds);
  const s2 = calcStats(currentPool);

  /* ── Render ── */
  const bar = (pct, cls) => `<div class="sim-bar-wrap"><div class="sim-bar ${cls}" style="width:${pct}%"></div><span>%${pct}</span></div>`;
  const delta = (v, base) => {
    const d = v - base;
    if (d === 0) return '';
    return d > 0 ? `<span class="delta-pos">+${d}%</span>` : `<span class="delta-neg">${d}%</span>`;
  };
  const diffTxt = (mVal, curVal) => {
      const d = Math.abs(mVal - curVal);
      return d === 0 ? 'TAM' : `±${d.toFixed(2)}`;
  };

  const matchRows = renderList.map(m => {
    const sc = getSofaChange(m);
    const res = getResult(m);
    const m1 = getMac(m,'Maç Sonucu','1'), mX = getMac(m,'Maç Sonucu','X'), m2 = getMac(m,'Maç Sonucu','2');
    const resCls = res === '1' ? 'color:#4ade80' : res === '2' ? 'color:#f87171' : 'color:#facc15';
    return `<tr>
      <td style="padding:6px 0;">
        <div style="font-size:11px;font-weight:600;">${m.home_team} - ${m.away_team}</div>
        <div style="font-size:9px;color:var(--tx3);">Sapma: ${diffTxt(m1,mac1)} / ${diffTxt(mX,macX)} / ${diffTxt(m2,mac2)}</div>
      </td>
      <td style="color:var(--tx2);font-size:10px;">${m1}/${mX}/${m2}</td>
      <td style="color:var(--tx3);font-size:10px;">${sc ? `${sc['1']}/${sc['X']}/${sc['2']}` : '—'}</td>
      <td style="font-weight:600;white-space:nowrap">${m.home_score}-${m.away_score}</td>
      <td style="${resCls};font-weight:700">${res}</td>
    </tr>`;
  }).join('');

  resultEl.innerHTML = `
    <div class="sim-card">
      <div class="sim-header">
        <span class="sim-count">${s2.n} Benzer Maç</span>
        <span class="sim-filter">✅ Dinamik ±${appliedTol} ${isTrendUsed ? '+ Trend' : ''}</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px 12px 4px;font-size:11px;">
        <div style="background:rgba(255,255,255,.04);border-radius:6px;padding:8px;">
          <div style="color:var(--tx2);margin-bottom:6px;">📎 Sadece MS±0.05 (${s1.n} maç)</div>
          <div style="display:flex;gap:6px;">
            <span style="color:#4ade80">Ev %${s1.p1}</span>
            <span style="color:#facc15">Ber %${s1.px}</span>
            <span style="color:#f87171">Dep %${s1.p2}</span>
          </div>
        </div>
        <div style="background:rgba(59,130,246,.10);border-radius:6px;padding:8px;border:1px solid rgba(59,130,246,.25);">
          <div style="color:#93c5fd;margin-bottom:6px;">🎯 Akıllı Filtre (${s2.n} maç)</div>
          <div style="display:flex;gap:6px;">
            <span style="color:#4ade80">Ev %${s2.p1} ${delta(s2.p1, s1.p1)}</span>
            <span style="color:#facc15">Ber %${s2.px} ${delta(s2.px, s1.px)}</span>
            <span style="color:#f87171">Dep %${s2.p2} ${delta(s2.p2, s1.p2)}</span>
          </div>
        </div>
      </div>

      <div class="sim-results" style="margin-top:6px;">
        <div class="sim-col"><div class="sim-col-lbl">🏠 Ev</div>${bar(s2.p1,'bar-1')}</div>
        <div class="sim-col"><div class="sim-col-lbl">🤝 Ber</div>${bar(s2.px,'bar-x')}</div>
        <div class="sim-col"><div class="sim-col-lbl">✈️ Dep</div>${bar(s2.p2,'bar-2')}</div>
      </div>

      <div class="sim-market-grid" style="padding:8px 12px 10px;">
        <div class="sim-mkt-block">
          <div class="sim-mkt-block-title">Alt / Üst</div>
          <div class="sim-mkt-row"><span class="sim-mkt-label">2.5 Üst</span><span class="sim-mkt-val">%${s2.o25}</span></div>
          <div class="sim-mkt-bar-wrap"><div class="sim-mkt-bar bar-blue" style="width:${s2.o25}%"></div></div>
        </div>
        <div class="sim-mkt-block">
          <div class="sim-mkt-block-title">Karşılıklı Gol</div>
          <div class="sim-mkt-row"><span class="sim-mkt-label">KG Var</span><span class="sim-mkt-val">%${s2.kg}</span></div>
          <div class="sim-mkt-bar-wrap"><div class="sim-mkt-bar bar-green" style="width:${s2.kg}%"></div></div>
        </div>
      </div>

      <div style="padding:0 12px 12px;">
        <div style="font-size:11px;color:#93c5fd;font-weight:600;margin-bottom:6px;">📅 En Benzer ${renderList.length} Maç (Detaylı Sapma)</div>
        <div style="overflow-x:auto;">
          <table style="width:100%;font-size:10px;border-collapse:collapse;color:var(--tx1);">
            <thead>
              <tr style="color:var(--tx2);border-bottom:1px solid rgba(255,255,255,.08);text-align:left;">
                <th style="padding:4px 0;">Takımlar</th>
                <th>Oranlar</th>
                <th>Trend</th>
                <th>Skor</th>
                <th>MS</th>
              </tr>
            </thead>
            <tbody>${matchRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

/* ─────────────────────────────────────────────────────────────────────
   5. YARDIMCI: tüm gz maçları yükle (cache'li)
   Mevcut S.gzOddsCache yapısını kullanır.
───────────────────────────────────────────────────────────────────── */
async function loadAllGzMatches() {
  /* Zaten yüklenmiş tüm cacheden topla */
  const cached = Object.values(S.gzOddsCache).flat();
  if (cached.length >= 5000) return cached;

  /* oranveri.txt'den GERÇEK dosya adlarını çek
     HATA: eski kod d='2025-05-01' → 'odds_2025-05-01.json.gz' → 404
     Dosyalar aylık: odds_2025-05-01_2025-05-31.json.gz
     DOĞRU: fname'i olduğu gibi kullan */
  try {
    const listResp = await fetch('https://www.onlinescoreboard.store/oranveri.txt');
    if (!listResp.ok) throw new Error('liste yok');
    const fnames = (await listResp.text()).split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('odds_') && l.endsWith('.json.gz'));

    for (const fname of fnames) {
      if (S.gzOddsCache[fname] !== undefined) continue;
      try {
        const url  = `${ORANCEK_BASE}/${fname}`;
        const resp = await fetch(url);
        if (!resp.ok) { S.gzOddsCache[fname] = []; continue; }
        const buf  = await resp.arrayBuffer();
        const ds   = new DecompressionStream('gzip');
        const wr   = ds.writable.getWriter();
        wr.write(new Uint8Array(buf)); wr.close();
        const out  = await new Response(ds.readable).arrayBuffer();
        S.gzOddsCache[fname] = JSON.parse(new TextDecoder().decode(out));
      } catch { S.gzOddsCache[fname] = []; }
    }
  } catch(e) { console.warn('[loadAllGzMatches]', e); }

  return Object.values(S.gzOddsCache).flat();
}

/* ─────────────────────────────────────────────────────────────────────
   6. MAÇ LİSTESİ ROZETLERİ
   
   renderMatchCard'a ekle — maçın Sofascore oranı varsa rozet göster.
   Çağrı yeri: maç satırı HTML oluştururken (fixture_id ve sofa 1x2'ye eriş).
───────────────────────────────────────────────────────────────────── */
function buildMatchBadges(sofaMarkets) {
  if (!sofaMarkets || !sofaMarkets.length) return '';
  let s1x2 = null;
  for (const mkt of sofaMarkets) {
    if (mkt.market_group === '1X2' && mkt.market_period === 'Full-time') {
      const cm = {};
      for (const c of (mkt.choices || [])) cm[c.name] = c;
      if (cm['1'] && cm['X'] && cm['2']) {
        s1x2 = { '1': { change: cm['1'].change }, 'x': { change: cm['X'].change }, '2': { change: cm['2'].change } };
      }
      break;
    }
  }
  if (!s1x2) return '';
  const sig = buildSignals(s1x2);
  if (!sig || !sig.badges.length) return '';
  return sig.badges.map(b => `<span class="sp-badge ${b.cls}">${b.text}</span>`).join(' ');
}

async function fetchGzOdds(date, homeTeam, awayTeam) {
  if (!date || date.length < 10) return null;

  /* Zaten yüklü veriyi kullan (loadAllGzMatches cache'i)
     Boşsa yükle — GERÇEK dosya adlarıyla (odds_2025-05-01_2025-05-31.json.gz) */
  let pool = Object.values(S.gzOddsCache).flat();

  if (!pool.length) {
    try {
      const listResp = await fetch('https://www.onlinescoreboard.store/oranveri.txt');
      if (listResp.ok) {
        const fnames = (await listResp.text()).split('\n')
          .map(l => l.trim())
          .filter(l => l.startsWith('odds_') && l.endsWith('.json.gz'));
        for (const fname of fnames) {
          if (S.gzOddsCache[fname] !== undefined) continue;
          try {
            const resp = await fetch(`${ORANCEK_BASE}/${fname}`);
            if (!resp.ok) { S.gzOddsCache[fname] = []; continue; }
            const buf = await resp.arrayBuffer();
            const ds  = new DecompressionStream('gzip');
            const wr  = ds.writable.getWriter();
            wr.write(new Uint8Array(buf)); wr.close();
            const out = await new Response(ds.readable).arrayBuffer();
            S.gzOddsCache[fname] = JSON.parse(new TextDecoder().decode(out));
          } catch { S.gzOddsCache[fname] = []; }
        }
        pool = Object.values(S.gzOddsCache).flat();
      }
    } catch(e) { console.warn('[fetchGzOdds]', e); }
  }

  if (!pool.length) return null;

  /* Takım adı benzerliğiyle eşleştir */
  let best = null, bestScore = 0;
  for (const m of pool) {
    const h = _sim(homeTeam, m.home_team);
    const a = _sim(awayTeam, m.away_team);
    const score = (h + a) / 2;
    if (score > bestScore && score >= 0.50) { bestScore = score; best = m; }
  }
  if (!best) return null;

  /* buildDetail'in beklediği formata çevir */
  return {
    odds_data: {
      source:   'Mackolik + Sofascore',
      markets:  _macToSite(best.mackolik_markets),
      sofa_1x2: _sofaTo1x2(best.sofascore_markets),
      home_score:    best.home_score,
      away_score:    best.away_score,
      ht_home_score: best.ht_home_score,
      ht_away_score: best.ht_away_score,
    },
    updated_at: null,
  };
}

/* ════════════════════════════════════════════════════════════════
   KADRO — GÖRSEL SAHA DİZİLİMİ
════════════════════════════════════════════════════════════════ */

/* İsmi kısalt — sahada sadece soyad göster */
function _shortName(full) {
  const parts = String(full || '').trim().split(/\s+/);
  if (parts.length <= 1) return parts[0] || '';
  return parts[parts.length - 1];
}

/* startXI'yi hatlara böl.
   ÖNCELİK: grid > formation > sıralı varsayılan diziliş
   Nesine/API-Football grid dolu gelince 1. yola düşer (gerçek konum). */
function _lineupLines(team) {
  const xi = (team.startXI || []).map(p => p.player).filter(Boolean);
  if (!xi.length) return [];

  /* 1) grid varsa — en doğru konum (Nesine + API-Football) */
  const hasGrid = xi.length > 1 && xi.every(p => p.grid && /^\d+:\d+$/.test(p.grid));
  if (hasGrid) {
    const byRow = {};
    xi.forEach(p => {
      const [row, col] = p.grid.split(':').map(Number);
      (byRow[row] = byRow[row] || []).push({ ...p, _col: col });
    });
    return Object.keys(byRow).map(Number).sort((a, b) => a - b)
      .map(r => byRow[r].sort((a, b) => a._col - b._col));
  }

  /* 2) formation string'i: "4-2-3-1" */
  const fmt = (team.formation || '').split('-').map(n => parseInt(n, 10)).filter(n => n > 0);

  /* 3) formation yoksa oyuncu sayısına göre varsayılan diziliş seç */
  let counts;
  if (fmt.length && fmt.reduce((a, b) => a + b, 0) === xi.length - 1) {
    counts = fmt;
  } else {
    const outfield = xi.length - 1;
    const DEFAULTS = {
      10: [4, 4, 2], 9: [4, 3, 2], 8: [3, 3, 2],
      7:  [3, 2, 2], 6: [2, 2, 2], 5: [2, 2, 1],
    };
    counts = DEFAULTS[outfield] || [4, 4, 2];
  }

  const lines = [[xi[0]]];
  let idx = 1;
  counts.forEach(c => {
    const line = [];
    for (let i = 0; i < c && idx < xi.length; i++) line.push(xi[idx++]);
    if (line.length) lines.push(line);
  });
  while (idx < xi.length) lines[lines.length - 1].push(xi[idx++]);

  return lines;
}

/* Olaylardan oyuncu→ikon haritası (gol/kart) + değişim dakikaları */
/* İsim normalize — diakritik/noktalama temizle, küçült (TR dahil) */
function _evNorm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i')
    .replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
/* Bir oyuncu için eşleşme anahtarları: id, tam ad, soyad */
function _evKeys(name, id) {
  const keys = [];
  if (id != null && id !== '') keys.push('id:' + id);

  if (!name) return keys;

  let normalized = name;

  // "Soyad, Ad" → "Ad Soyad" formatına çevir
  if (name.includes(',')) {
    const parts = name.split(',').map(s => s.trim());
    if (parts.length === 2) {
      normalized = parts[1] + ' ' + parts[0]; // "Lionel Messi"
    }
  }

  const n = _evNorm(normalized);
  if (n) {
    keys.push(n); // "lionel messi"
    const parts = n.split(' ').filter(Boolean);
    if (parts.length > 1) keys.push('sn:' + parts[parts.length - 1]); // "sn:messi"
  }

  // Orijinal hali de ekle (her ihtimale karşı)
  const nOrig = _evNorm(name);
  if (nOrig && !keys.includes(nOrig)) keys.push(nOrig);

  return keys;
}

/* Kadro oyuncusunu olay haritasında ara: id → tam ad → soyad */
function _evLookup(map, player) {
  if (!player) return undefined;
  if (player.id != null && map['id:' + player.id] != null) return map['id:' + player.id];
  const n = _evNorm(player.name);
  if (n && map[n] != null) return map[n];
  const parts = n.split(' ').filter(Boolean);
  if (parts.length) {
    const sn = 'sn:' + parts[parts.length - 1];
    if (map[sn] != null) return map[sn];
  }
  return undefined;
}

/* Olaylardan oyuncu→olay haritası: { ev:{key:{g,c}}, subs:{key:min} }
   g=gol sayısı, c=kart ('y'|'r'). Eşleşme id / tam ad / soyad. */
function _lineupEventMaps(evs) {
  const ev = {};
  const subs = {};
  const slot = (k) => (ev[k] || (ev[k] = { g: 0, c: '' }));
  const addGoal = (keys) => keys.forEach(k => { slot(k).g++; });
  const addCard = (keys, c) => keys.forEach(k => {
    const s = slot(k);
    if (c === 'r') s.c = 'r';
    else s.c = (s.c === 'y' || s.c === 'r') ? 'r' : 'y';   // 2. sarı → kırmızı
  });
  const addSub = (keys, min) => keys.forEach(k => { if (subs[k] == null) subs[k] = min; });
  (evs || []).forEach(e => {
    const t = (e.event_type || '').toLowerCase();
    const d = (e.event_detail || '').toLowerCase();
    const min = e.elapsed_time ? `${e.elapsed_time}${e.extra_time ? '+' + e.extra_time : ''}'` : '';
    const pKeys = _evKeys(e.player_name, e.player_id);
    const aKeys = _evKeys(e.assist_name, e.assist_id);
    if (t === 'goal') { if (!d.includes('missed')) addGoal(pKeys); }
    else if (t === 'card') addCard(pKeys, (d.includes('red') || d.includes('kırmızı')) ? 'r' : 'y');
    else if (t === 'subst') { addSub(pKeys, min); addSub(aKeys, min); }
  });
  return { ev, subs };
}

/* Olay nesnesi → ikon HTML: gol topu (çoklu gol = top + sayı) + kart */
function _evMarks(info) {
  if (!info) return '';
  let h = '';
  if (info.g === 1) h += '⚽';
  else if (info.g > 1) h += `<span class="g-mult">⚽<b>${info.g}</b></span>`;
  if (info.c === 'y') h += '🟨';
  else if (info.c === 'r') h += '🟥';
  return h;
}

/* Bir takımın 11'ini sahaya yerleştir */
function _pitchPlayers(team, side, maps) {
  const lines = _lineupLines(team);
  const numLines = lines.length;
  let html = '';
  lines.forEach((line, li) => {
    const n = line.length;
    /* Dikey saha: ev sahibi üstte, deplasman altta */
    const yBase = numLines > 1 ? (li / (numLines - 1)) * 36 : 0;
    const y = side === 'home' ? (7 + yBase) : (93 - yBase);
    line.forEach((p, pi) => {
      const x = ((pi + 1) / (n + 1)) * 100;
      const ic = _evMarks(_evLookup(maps.ev, p));
      const subMin = _evLookup(maps.subs, p);
      const subArr = subMin ? `<span class="pp-sub down">▼${subMin}</span>` : '';
      html += `
        <div class="pp ${side}" style="left:${x}%;top:${y}%">
          <div class="pp-shirt">
            <span class="pp-num">${p.number ?? ''}</span>
            ${ic ? `<span class="pp-ev">${ic}</span>` : ''}
          </div>
          <div class="pp-name pp-plink" onclick="goToPlayerByName('${(p.name||'').replace(/'/g,"\\'")}',event)">${esc(_shortName(p.name || ''))}</div>
          ${subArr}
        </div>`;
    });
  });
  return html;
}

function _subsColumn(team, side, maps) {
  const subs = team.substitutes || [];
  if (!subs.length) return '';
  const away = side === 'away';
  const rows = subs.map(p => {
    const pl = p.player || {};
    const ic = _evMarks(_evLookup(maps.ev, pl));
    const _in = _evLookup(maps.subs, pl);
    const inMin = _in ? `<span class="lu-sub-in">▲${_in}</span>` : '';
    const marks = `${ic ? `<span class="lu-sub-ev">${ic}</span>` : ''}${inMin}`;
    const num = `<span class="lu-sub-num">${pl.number ?? ''}</span>`;
    const name = `<span class="lu-sub-name lu-plink" onclick="goToPlayerByName('${(pl.name||'').replace(/'/g,"\\'")}',event)">${esc(pl.name || '')}</span>`;
    return away
      ? `<div class="lu-sub-row lu-row-a">${marks}${name}${num}</div>`
      : `<div class="lu-sub-row">${num}${name}${marks}</div>`;
  }).join('');
  return `<div class="lu-subs-col ${side}">
    <div class="lu-subs-hdr">${esc(team.team?.name || '')} — Yedekler</div>
    <div class="lu-sub-list">${rows}</div>
  </div>`;
}

/* Ana kadro HTML — d-lu paneline basılır */
function buildLineupHTML(ld, m, evs) {
  /* data TEXT olarak gelirse parse et */
  if (typeof ld === 'string') {
    try { ld = JSON.parse(ld); } catch(e) { ld = null; }
  }
  if (!ld || !Array.isArray(ld) || ld.length < 2) {
    return `<div class="empty"><div class="empty-i">👥</div><div class="empty-t">Kadro bilgisi mevcut değil</div></div>`;
  }
  const home = ld[0], away = ld[1];
  const maps = _lineupEventMaps(evs);

  /* yan liste: ilk 11 (numara + isim + gol/kart + çıkan ▼) + T.D. */
  const xiList = (team, side) => {
    const away = side === 'away';
    const xi = (team.startXI || []).map(p => p.player).filter(Boolean);
    const rows = xi.map(p => {
      const ic = _evMarks(_evLookup(maps.ev, p));
      const outMin = _evLookup(maps.subs, p);
      const out = outMin ? `<span class="lu3-out">▼${outMin}</span>` : '';
      const marks = (ic || out) ? `<span class="lu3-ev">${ic}${out}</span>` : '';
      const num = `<span class="lu3-num">${p.number ?? ''}</span>`;
      const name = `<span class="lu3-name lu-plink" onclick="goToPlayerByName('${(p.name||'').replace(/'/g,"\\'")}',event)">${esc(p.name || '')}</span>`;
      return away
        ? `<div class="lu3-row lu3-row-a">${marks}${name}${num}</div>`
        : `<div class="lu3-row">${num}${name}${marks}</div>`;
    }).join('');
    const coach = team.coach?.name
      ? `<div class="lu3-coach">T.D. <b>${esc(team.coach.name)}</b></div>` : '';
    const fmt = team.formation ? ` <span class="lu-fmt">${esc(team.formation)}</span>` : '';
    return `<div class="lu3-team">${esc(team.team?.name || '')}${fmt}</div>
      <div class="lu3-xi">${rows}</div>${coach}`;
  };

  return `
    <div class="lu2-wrap">
      <div class="lu3">
        <div class="lu3-col">${xiList(home, 'home')}</div>
        <div class="lu3-pitch">
          <div class="lu-pitch">
            <div class="lp-line lp-mid"></div>
            <div class="lp-circle"></div>
            <div class="lp-box lp-box-l"></div>
            <div class="lp-box lp-box-r"></div>
            <div class="lp-goal lp-goal-l"></div>
            <div class="lp-goal lp-goal-r"></div>
            ${_pitchPlayers(home, 'home', maps)}
            ${_pitchPlayers(away, 'away', maps)}
          </div>
        </div>
        <div class="lu3-col lu3-col-a">${xiList(away, 'away')}</div>
      </div>
      <div class="lu-subs-grid">
        ${_subsColumn(home, 'home', maps)}
        ${_subsColumn(away, 'away', maps)}
      </div>
    </div>`;
}

/* ── OLAY LİSTESİ İÇ HTML — tek kaynak ──────────────────────────────
   Hem buildDetail hem de sessiz yenileyici (silentRefreshDetailEvents)
   bu fonksiyonu kullanır; mantık tek yerde tutulur.                  */
function _eventsListInner(m, evs) {
  const hs = m.home_score ?? '-', as = m.away_score ?? '-';
  if (!evs.length) {
    return `<div class="ev-none">Henüz olay yok</div>`;
  }
  let out = '';

  /* ── Maç aşaması işaretçileri ───────────────────────────────── */
  const FIN_SET = new Set(['FT','AET','PEN']);
  const isFin   = FIN_SET.has(m.status_short);
  const sShort  = m.status_short;
  const penStr  = penText(m);
  const hadET   = isFin
    ? (sShort === 'AET' || sShort === 'PEN' || evs.some(e => (+e.elapsed_time||0) > 90))
    : (sShort === 'ET'  || sShort === 'BT'  || sShort === 'P' || evs.some(e => (+e.elapsed_time||0) > 90));
  const hadPen  = !!penStr || sShort === 'PEN' || sShort === 'P';

  let _rh = 0, _ra = 0;
  const evPhase   = e => { const el = +e.elapsed_time || 0; return el <= 45 ? 1 : el <= 90 ? 2 : 3; };
  const applyGoal = e => {
    const t = (e.event_type||'').toLowerCase(), d = (e.event_detail||'').toLowerCase();
    if (t !== 'goal') return;
    if (!(+e.elapsed_time)) return;
    if (d.includes('missed') || d.includes('kaçır') || d.includes('saved')) return;
    const homeTeam = e.team_id == m.home_team_id;
    const scoringHome = d.includes('own') ? !homeTeam : homeTeam;
    if (scoringHome) _rh++; else _ra++;
  };
  const phaseRow = txt => `<div class="ev-phase"><span>${txt}</span></div>`;

  out += phaseRow('Maç Başladı');
  let htShown = false, etShown = false;

  evs.forEach(e => {
    const ph = evPhase(e);
    if (ph >= 2 && !htShown) {
      out += phaseRow(`İlk Yarı Sonu · ${_rh}-${_ra}`);
      out += phaseRow('İkinci Yarı Başladı');
      htShown = true;
    }
    if (ph >= 3 && !etShown) {
      out += phaseRow(`Normal Süre Sonu · ${_rh}-${_ra}`);
      out += phaseRow('Uzatmalar Başladı');
      etShown = true;
    }
    const home = e.team_id == m.home_team_id;
    const ic = evIcon(e.event_type, e.event_detail);
    const icCls = evCls(e.event_type, e.event_detail);
    const t = e.elapsed_time ? `${e.elapsed_time}${e.extra_time?'+'+e.extra_time:''}'` : '';
    const info = `<div class="ev-info">
            <div class="ev-pl ev-plink" onclick="goToPlayerByName('${(e.player_name||'').replace(/'/g,"\\'")}',event)">${esc(e.player_name||'')}</div>
            ${e.assist_name ? `<div class="ev-dt ev-plink" onclick="goToPlayerByName('${(e.assist_name||'').replace(/'/g,"\\'")}',event)">⤷ ${esc(e.assist_name)}</div>` : ''}
            ${e.event_detail ? `<div class="ev-dt">${esc(e.event_detail)}</div>` : ''}
          </div>`;
    const ico = `<div class="ev-ico ${icCls}">${ic}</div>`;
    out += `
      <div class="ev-row ${home?'ev-h':'ev-a'}">
        <div class="ev-side ev-left">${home ? info + ico : ''}</div>
        <div class="ev-min">${t}</div>
        <div class="ev-side ev-right">${home ? '' : ico + info}</div>
      </div>`;
    applyGoal(e);
  });

  if (!htShown && sShort === 'HT') {
    out += phaseRow(`İlk Yarı Sonu · ${_rh}-${_ra}`);
  }
  if (isFin) {
    if (!htShown) {
      out += phaseRow(`İlk Yarı Sonu · ${_rh}-${_ra}`);
      out += phaseRow('İkinci Yarı Başladı');
      htShown = true;
    }
    if (hadET) {
      if (!etShown) {
        out += phaseRow(`Normal Süre Sonu · ${_rh}-${_ra}`);
        out += phaseRow('Uzatmalar Başladı');
        etShown = true;
      }
      out += phaseRow(`Uzatma Sonucu · ${hs}-${as}`);
      if (hadPen) out += phaseRow(`Penaltılar · ${penStr}`);
    } else {
      out += phaseRow(`Maç Sonu · ${hs}-${as}`);
    }
  }
  return out;
}

function buildDetail(m, evs, stats, lus, h2h, pred, odds, matchInfo, oddsOnly = false) {
  S.detailKickoffAt   = m.kickoff_at   || null;
  S.detailSecondHalfAt = m.second_half_at || null;
  S._detailStatus      = m.status_short    || null;
  S._detailM           = m;   /* sessiz olay yenileyici için takım id'leri/skor kaynağı */
  const st = statusInfo(m);
  const hs = m.home_score ?? '-', as = m.away_score ?? '-';
  

  try {
    if (typeof Router !== 'undefined') {
      Router.goMatch(m.fixture_id, m.home_team, m.away_team);
      const kickoff = m.kickoff_time || m.fixture_date || m.match_date || m.event_date || null;
      /* venue bilgisini raw_data / fixture / data'dan çek — schema location için */
      let venueInfo = null;
      try {
        let fx = null;
        if (m.raw_data) fx = JSON.parse(m.raw_data)?.fixture || null;
        if (!fx && m._fixture) fx = m._fixture;
        if (!fx && m.fixture && typeof m.fixture === 'object') fx = m.fixture;
        if (!fx && m.data) {
          const d = typeof m.data === 'string' ? JSON.parse(m.data) : m.data;
          fx = (Array.isArray(d) ? d[0] : d)?.fixture || null;
        }
        if (fx) {
          const vName = fx.venue?.name || null;
          const vCity = fx.venue?.city || null;
          if (vName || vCity) venueInfo = { name: vName, city: vCity };
        }
      } catch(e) {}
      Router.setMatchMeta(m.home_team, m.away_team, m.home_score, m.away_score, m.league_name, m.status_short || null, m.fixture_id, kickoff, m.home_logo, m.away_logo, venueInfo);
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
          ${penText(m) ? `<div class="d-pen">Penaltılar ${penText(m)}</div>` : ''}
        </div>
        <div class="d-team">
          ${m.away_logo ? `<img class="d-logo" src="${esc(m.away_logo)}" onerror="this.style.display='none'" alt="">` : ''}
          <div class="d-tname">${esc(m.away_team||'')}</div>
        </div>
      </div>
    </div>`;

  /* oddsOnly=true ise canlı görsel ve diğer tabları gizle */
  /* Yayın önceliği: TV yayını (m3u8) varsa onu göster, yoksa 2D görsel simülasyonu,
     o da yoksa boş durum mesajı. Alan adı: matches tablosunda `stream_url` kolonu. */
  const streamUrl = m.stream_url || m.m3u8_url || null;
  if (!oddsOnly) {
    let visualBody;
    if (streamUrl) {
      visualBody = `<div class="d-visual-video-wrap" style="position:relative;width:100%;aspect-ratio:16/9;max-height:70vh;background:#000;overflow:hidden;"><video id="d-stream-player" class="d-visual-video" style="display:block;width:100%;height:100%;border:none;background:#000;object-fit:contain;" controls playsinline autoplay muted></video></div>`;
    } else if (m.visual_url) {
      visualBody = `<div class="d-visual-iframe-wrap"><iframe class="d-visual-iframe" src="${esc(m.visual_url)}" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups allow-forms"></iframe></div>`;
    } else {
      visualBody = `<div class="d-visual-empty">📡<span>Görsel stream mevcut değil</span></div>`;
    }
    html += `
      <div class="d-visual">
        <div class="d-visual-hdr">
          <div class="d-visual-hdr-l">${streamUrl ? '📺 Canlı Yayın' : '📺 Canlı Görsel'}</div>
          ${(streamUrl || m.visual_url) ? `<span class="d-visual-live">LIVE</span>` : ''}
        </div>
        ${visualBody}
      </div>`;

    html += `
      <div class="d-tabs">
        <div class="d-tab active" onclick="switchTab('bi',this)">Bilgi</div>  
        <div class="d-tab" onclick="switchTab('ev',this)">Olaylar</div>
        <div class="d-tab" onclick="switchTab('st',this)">İstatistik</div>
        <div class="d-tab" onclick="switchTab('or',this)">Oranlar</div>
        <div class="d-tab" onclick="switchTab('lu',this)">Kadro</div>
        <div class="d-tab" onclick="switchTab('h2',this)">H2H</div>
        <div class="d-tab" onclick="switchTab('fr',this)">Forum</div>
      </div>`;
  } else {
    /* Oran Analizi sayfasından gelince — sadece Oranlar tabı */
    html += `
      <div class="d-tabs" style="border-bottom:1px solid rgba(255,255,255,.07)">
        <div class="d-tab active" onclick="switchTab('or',this)">📊 Oran Analizi</div>
        <div class="d-tab" onclick="switchTab('bi',this)">Maç Bilgisi</div>
        <div class="d-tab" onclick="switchTab('h2',this)">H2H</div>
      </div>`;
  }

// ── YEPYENİ MAÇ BİLGİSİ (MATCH INFO) PANELİ ──
  let mi = matchInfo || {};
  
  // JSON Parse işlemleri (Güvenli)
  let smartAnalysis = [];
  let preMatchNotes = { notes: [], refereeStats: {} };
  try { if (typeof mi.smart_analysis === 'string') smartAnalysis = JSON.parse(mi.smart_analysis); else if (mi.smart_analysis) smartAnalysis = mi.smart_analysis; } catch(e){}
  try { if (typeof mi.pre_match_notes === 'string') preMatchNotes = JSON.parse(mi.pre_match_notes); else if (mi.pre_match_notes) preMatchNotes = mi.pre_match_notes; } catch(e){}

  // API'den gelen yedek verileri ayarla
  let apiReferee = null, apiVenue = null, apiCity = null, apiKickoff = null;
  try {
    let fx = null;
    if (m.raw_data) fx = JSON.parse(m.raw_data)?.fixture || null;
    if (!fx && m._fixture) fx = m._fixture;
    if (!fx && m.fixture && typeof m.fixture === 'object') fx = m.fixture;
    if (fx) {
      apiReferee = fx.referee || null;
      apiVenue   = fx.venue?.name || null;
      apiCity    = fx.venue?.city || null;
      apiKickoff = fx.date || null;
    }
  } catch(e) {}

  const kickoff = m.kickoff_time || apiKickoff || null;
  const kickoffFmt = kickoff ? new Date(kickoff).toLocaleString('tr-TR', {
    day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Istanbul'
  }) : null;

  // Supabase'den gelen veriyi önceliklendir, yoksa API'yi kullan
  const dRef   = mi.referee || apiReferee;
  const dVen   = mi.venue || apiVenue;
  const dBroad = mi.broadcaster || null;
  const dLg    = mi.league_detail || null;

  // "Bilgi" Panelini İnşa Et (Normalde İlk Sekme)
  let biHtml = `<div class="d-panel ${!oddsOnly ? 'active' : ''}" id="d-bi"><div class="mi-wrap">`;

  // 1. Üst Bilgi Izgarası (Saat, Hakem, Saha, Yayıncı vs.)
  if (kickoffFmt || dRef || dVen || dBroad || dLg) {
    biHtml += `<div class="mi-grid">`;
    if (kickoffFmt) biHtml += `<div class="mi-box"><div class="mi-icon">🕒</div><div class="mi-txt"><div class="mi-lbl">Tarih & Saat</div><div class="mi-val">${esc(kickoffFmt)}</div></div></div>`;
    if (dLg)        biHtml += `<div class="mi-box"><div class="mi-icon">🏆</div><div class="mi-txt"><div class="mi-lbl">Lig Detayı</div><div class="mi-val">${esc(dLg)}</div></div></div>`;
    if (dRef)       biHtml += `<div class="mi-box"><div class="mi-icon">🟡</div><div class="mi-txt"><div class="mi-lbl">Hakem</div><div class="mi-val">${esc(dRef)}</div></div></div>`;
    if (dVen)       biHtml += `<div class="mi-box"><div class="mi-icon">🏟️</div><div class="mi-txt"><div class="mi-lbl">Saha</div><div class="mi-val">${esc(dVen)}${apiCity ? `, ${esc(apiCity)}` : ''}</div></div></div>`;
    if (dBroad)     biHtml += `<div class="mi-box"><div class="mi-icon">📺</div><div class="mi-txt"><div class="mi-lbl">Yayıncı</div><div class="mi-val">${esc(dBroad)}</div></div></div>`;
    biHtml += `</div>`;
  }

  // 2. Maç Önü Notlar
  // ── YARDIMCI: Maç Bilgisi Accordion (Açılır/Kapanır) Grubu ──
  const miGroup = (icon, title, content, openByDefault = false) => {
    return `
      <div class="mi-group ${openByDefault ? 'open' : ''}">
        <div class="mi-group-hdr" onclick="this.closest('.mi-group').classList.toggle('open')">
          <span class="mi-group-icon">${icon}</span>
          <span class="mi-group-title">${title}</span>
          <span class="mi-group-arrow">›</span>
        </div>
        <div class="mi-group-body">${content}</div>
      </div>`;
  };

  // 2. Maç Önü Notlar
  if (preMatchNotes.notes && preMatchNotes.notes.length > 0) {
    let notesContent = '';
    preMatchNotes.notes.forEach(note => {
      notesContent += `<div class="mi-note-card">${esc(note)}</div>`;
    });
    biHtml += miGroup('📝', 'Maç Önü Notları', notesContent, true); // true = varsayılan olarak açık
  }

  // 3. Hakem İstatistikleri
  if (preMatchNotes.refereeStats && Object.keys(preMatchNotes.refereeStats).length > 0) {
    let refContent = `<div class="mi-ref-grid">`;
    for (const [key, val] of Object.entries(preMatchNotes.refereeStats)) {
      refContent += `<div class="mi-ref-box"><div class="mi-ref-lbl">${esc(key)}</div><div class="mi-ref-val">${esc(val)}</div></div>`;
    }
    refContent += `</div>`;
    biHtml += miGroup('⚖️', 'Hakem İstatistikleri', refContent, false); // false = varsayılan olarak kapalı
  }

  // 4. Akıllı Analiz (Yapay Zeka Yorumları ve Oranlar)
  if (smartAnalysis && smartAnalysis.length > 0) {
    let saContent = `<div class="mi-analysis-list">`;
    smartAnalysis.forEach(sa => {
      saContent += `<div class="mi-analysis-card">`;
      if (sa.market) saContent += `<div class="mi-sa-market">${esc(sa.market)}</div>`;
      if (sa.comment) saContent += `<div class="mi-sa-comment">${esc(sa.comment)}</div>`;
      if (sa.odds && sa.odds.length > 0) {
        saContent += `<div class="mi-sa-odds">`;
        sa.odds.forEach(o => {
          saContent += `<div class="mi-sa-odd-box"><span class="mi-sa-oname">${esc(o.name)}</span><span class="mi-sa-oval">${esc(o.value)}</span><span class="mi-sa-opct">${esc(o.percentage)}</span></div>`;
        });
        saContent += `</div>`;
      }
      saContent += `</div>`;
    });
    saContent += `</div>`;
    biHtml += miGroup('🧠', 'Akıllı Analiz', saContent, true); // true = varsayılan olarak açık
  }
  // Eğer hiçbir veri yoksa
  if (biHtml === `<div class="d-panel ${!oddsOnly ? 'active' : ''}" id="d-bi"><div class="mi-wrap">`) {
    biHtml += `<div class="empty"><div class="empty-i">ℹ️</div><div class="empty-t">Detaylı maç bilgisi bulunamadı</div></div>`;
  }
  
  biHtml += `</div></div>`;
  html += biHtml;

  // Olaylar paneli — içerik tek kaynaktan (_eventsListInner) üretilir
  html += `<div class="d-panel" id="d-ev"><div class="ev-list">${_eventsListInner(m, evs)}</div></div>`;

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
html += `<div class="d-panel ${oddsOnly ? 'active' : ''}" id="d-or">`;
const od = odds?.odds_data ?? null;

if (od && od.markets) {
  const mk = od.markets;
  const mc = od.markets_change || {}; // YENİ: Veritabanındaki trend değişimlerini alıyoruz
  const src = od.source || 'İddaa / Nesine';
  const updAt = odds.updated_at
    ? new Date(odds.updated_at).toLocaleString('tr-TR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'})
    : '';
  const homeN = esc(m.home_team || '');
  const awayN = esc(m.away_team || '');

  /* ── Yardımcı: tek bir oran kartı (TREND OKLARI EKLENDİ) ── */
  const cell = (lbl, mKey, oKey) => {
    const val = mk[mKey]?.[oKey];
    const chg = mc[mKey]?.[oKey] || 0; // 1: Yükseldi, -1: Düştü, 0: Sabit
    const v = +val || 0;

    let cCls = 'eq', arr = '';
    if (chg === 1)  { cCls = 'up'; arr = '<span class="or2-arr up">↑</span>'; }
    if (chg === -1) { cCls = 'dn'; arr = '<span class="or2-arr dn">↓</span>'; }

    return `<div class="or2-cell ${cCls}">
      <div class="or2-lbl">${lbl}</div>
      <div class="or2-val-wrap">
        <span class="or2-val">${v > 0 ? v.toFixed(2) : '-'}</span>
        ${arr}
      </div>
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

  /* ── BENZERİ ORANLARIN ANALİZİ ── */
  let sofa1x2 = od?.sofa_1x2 ? JSON.parse(JSON.stringify(od.sofa_1x2)) : null;
  const mc1x2 = od?.markets_change?.['1x2'] ?? null;

  /* YENİ: Veritabanında (Nesine) 'markets_change' trendi varsa, 
     bunu sofa1x2 formatına çevirip KÖPRÜ GÖREVİ gördür! */
  if (mc1x2) {
    if (!sofa1x2) sofa1x2 = {};
    if (!sofa1x2['1']) sofa1x2['1'] = {};
    if (!sofa1x2['x']) sofa1x2['x'] = {};
    if (!sofa1x2['2']) sofa1x2['2'] = {};
    
    sofa1x2['1'].change = mc1x2.home ?? 0;
    sofa1x2['x'].change = mc1x2.draw ?? 0;
    sofa1x2['2'].change = mc1x2.away ?? 0;
  } 
  /* Eski Sofascore opening/closing yedeği */
  else if (sofa1x2) {
    ['1','x','2'].forEach(k => {
      const d = sofa1x2[k];
      if (!d) return;
      const op = d.opening, cl = d.closing;
      if (op != null && cl != null && Math.abs(cl - op) > 0.04) {
        d.change = cl < op ? -1 : 1;
      }
    });
  }

  const mac1x2  = od?.markets?.['1x2']  ?? null;
  const curOu25 = od?.markets?.['ou25'] ?? null;
  html += renderSignalCard(m.fixture_id, sofa1x2, mac1x2, curOu25);

  /* ══════════════════════════════════════
     GRUP 1: MAÇ SONUCU
  ══════════════════════════════════════ */
  {
    let g1 = '';
    if (mk['1x2']) {
      g1 += marketRow('Maç Sonucu', [cell(homeN,'1x2','home'), cell('X','1x2','draw'), cell(awayN,'1x2','away')]);
    }
    if (mk['dc']) {
      g1 += marketRow('Çifte Şans', [cell('1X','dc','1x'), cell('12','dc','12'), cell('X2','dc','x2')]);
    }
    /* Handikap — tüm çizgiler */
    const ahKeys = Object.keys(mk).filter(k => k.startsWith('ah_')).sort();
    ahKeys.forEach(k => {
      const line = mk[k].line !== undefined ? mk[k].line : k.replace('ah_p','+').replace('ah_m','-').replace('_','.');
      g1 += marketRow(`Handikap (${line})`, [cell(homeN,k,'home'), cell('X',k,'draw'), cell(awayN,k,'away')]);
    });
    if (mk['ht_ft']) {
      g1 += marketRow('İY / Maç Sonucu', [
        cell('1/1','ht_ft','1/1'), cell('1/X','ht_ft','1/X'), cell('1/2','ht_ft','1/2'),
        cell('X/1','ht_ft','X/1'), cell('X/X','ht_ft','X/X'), cell('X/2','ht_ft','X/2'),
        cell('2/1','ht_ft','2/1'), cell('2/X','ht_ft','2/X'), cell('2/2','ht_ft','2/2'),
      ]);
    }
    if (mk['win_margin']) {
      g1 += marketRow('Kaç Farkla Kazanır', [
        cell(`${homeN} 3+`,'win_margin','h3p'), cell(`${homeN} 2`,'win_margin','h2'), cell(`${homeN} 1`,'win_margin','h1'),
        cell('Ber.','win_margin','draw'), cell(`${awayN} 1`,'win_margin','a1'), cell(`${awayN} 2`,'win_margin','a2'), cell(`${awayN} 3+`,'win_margin','a3p'),
      ]);
    }
    if (mk['ms_ou15']) {
      g1 += marketRow('MS + 1.5 Alt/Üst', [
        cell(`${homeN}&Alt`,'ms_ou15','h_u'), cell('X&Alt','ms_ou15','x_u'), cell(`${awayN}&Alt`,'ms_ou15','a_u'),
        cell(`${homeN}&Üst`,'ms_ou15','h_o'), cell('X&Üst','ms_ou15','x_o'), cell(`${awayN}&Üst`,'ms_ou15','a_o'),
      ]);
    }
    if (mk['ms_ou25']) {
      g1 += marketRow('MS + 2.5 Alt/Üst', [
        cell(`${homeN}&Alt`,'ms_ou25','h_u'), cell('X&Alt','ms_ou25','x_u'), cell(`${awayN}&Alt`,'ms_ou25','a_u'),
        cell(`${homeN}&Üst`,'ms_ou25','h_o'), cell('X&Üst','ms_ou25','x_o'), cell(`${awayN}&Üst`,'ms_ou25','a_o'),
      ]);
    }
    if (mk['ms_ou35']) {
      g1 += marketRow('MS + 3.5 Alt/Üst', [
        cell(`${homeN}&Alt`,'ms_ou35','h_u'), cell('X&Alt','ms_ou35','x_u'), cell(`${awayN}&Alt`,'ms_ou35','a_u'),
        cell(`${homeN}&Üst`,'ms_ou35','h_o'), cell('X&Üst','ms_ou35','x_o'), cell(`${awayN}&Üst`,'ms_ou35','a_o'),
      ]);
    }
    if (mk['ms_ou45']) {
      g1 += marketRow('MS + 4.5 Alt/Üst', [
        cell(`${homeN}&Alt`,'ms_ou45','h_u'), cell('X&Alt','ms_ou45','x_u'), cell(`${awayN}&Alt`,'ms_ou45','a_u'),
        cell(`${homeN}&Üst`,'ms_ou45','h_o'), cell('X&Üst','ms_ou45','x_o'), cell(`${awayN}&Üst`,'ms_ou45','a_o'),
      ]);
    }
    if (mk['ms_kg']) {
      g1 += marketRow('MS + Karşılıklı Gol', [
        cell(`${homeN}&Var`,'ms_kg','h_y'), cell('X&Var','ms_kg','x_y'), cell(`${awayN}&Var`,'ms_kg','a_y'),
        cell(`${homeN}&Yok`,'ms_kg','h_n'), cell('X&Yok','ms_kg','x_n'), cell(`${awayN}&Yok`,'ms_kg','a_n'),
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
      g2 += marketRow(`${n} Gol Alt/Üst`, [cell(`Alt ${n}`,k,'under'), cell(`Üst ${n}`,k,'over')]);
    });
    if (mk['ou25_kg']) {
      g2 += marketRow('2.5 Alt/Üst + KG', [cell('Alt&Var','ou25_kg','u_y'), cell('Üst&Var','ou25_kg','o_y'), cell('Alt&Yok','ou25_kg','u_n'), cell('Üst&Yok','ou25_kg','o_n')]);
    }
    if (mk['goal_range']) {
      g2 += marketRow('Toplam Gol Aralığı', [cell('0-1','goal_range','0_1'), cell('2-3','goal_range','2_3'), cell('4-5','goal_range','4_5'), cell('6+','goal_range','6p')]);
    }
    if (mk['odd_even']) {
      g2 += marketRow('Tek / Çift', [cell('Tek','odd_even','odd'), cell('Çift','odd_even','even')]);
    }
    if (g2) html += group('📊', 'Alt / Üst & Toplam Gol', g2, true);
  }

  /* ══════════════════════════════════════
     GRUP 3: YARI
  ══════════════════════════════════════ */
  {
    let g3 = '';
    if (mk['ht_1x2']) {
      g3 += marketRow('1. Yarı Sonucu', [cell(homeN,'ht_1x2','home'), cell('X','ht_1x2','draw'), cell(awayN,'ht_1x2','away')]);
    }
    if (mk['ht_dc']) {
      g3 += marketRow('1. Yarı Çifte Şans', [cell('1X','ht_dc','1x'), cell('12','ht_dc','12'), cell('X2','ht_dc','x2')]);
    }
    if (mk['2h_1x2']) {
      g3 += marketRow('2. Yarı Sonucu', [cell(homeN,'2h_1x2','home'), cell('X','2h_1x2','draw'), cell(awayN,'2h_1x2','away')]);
    }
    if (mk['home_win_both']) {
      g3 += marketRow(`${homeN} Her İki Yarıyı Kazanır`, [cell('Evet','home_win_both','yes'), cell('Hayır','home_win_both','no')]);
    }
    if (mk['away_win_both']) {
      g3 += marketRow(`${awayN} Her İki Yarıyı Kazanır`, [cell('Evet','away_win_both','yes'), cell('Hayır','away_win_both','no')]);
    }
    if (mk['ht_ms_ou15']) {
      g3 += marketRow('1Y Sonucu + 1Y 1.5 Alt/Üst', [
        cell(`${homeN}&Alt`,'ht_ms_ou15','h_u'), cell('X&Alt','ht_ms_ou15','x_u'), cell(`${awayN}&Alt`,'ht_ms_ou15','a_u'),
        cell(`${homeN}&Üst`,'ht_ms_ou15','h_o'), cell('X&Üst','ht_ms_ou15','x_o'), cell(`${awayN}&Üst`,'ht_ms_ou15','a_o'),
      ]);
    }
    if (mk['ht_ms_kg']) {
      g3 += marketRow('1Y Sonucu + 1Y KG', [
        cell(`${homeN}&Var`,'ht_ms_kg','h_y'), cell('X&Var','ht_ms_kg','x_y'), cell(`${awayN}&Var`,'ht_ms_kg','a_y'),
        cell(`${homeN}&Yok`,'ht_ms_kg','h_n'), cell('X&Yok','ht_ms_kg','x_n'), cell(`${awayN}&Yok`,'ht_ms_kg','a_n'),
      ]);
    }
    /* 1Y Alt/Üst */
    ['ht_ou05','ht_ou15','ht_ou25'].forEach(k => {
      if (!mk[k]) return;
      const n = k.replace('ht_ou','').replace(/(\d)(\d)/,'$1.$2');
      g3 += marketRow(`1Y ${n} Gol Alt/Üst`, [cell(`Alt ${n}`,k,'under'), cell(`Üst ${n}`,k,'over')]);
    });
    if (mk['ht_odd_even']) {
      g3 += marketRow('1Y Tek / Çift', [cell('Tek','ht_odd_even','odd'), cell('Çift','ht_odd_even','even')]);
    }
    if (mk['both_half_u15']) {
      g3 += marketRow('İki Yarı da 1.5 Alt', [cell('Evet','both_half_u15','yes'), cell('Hayır','both_half_u15','no')]);
    }
    if (mk['both_half_o15']) {
      g3 += marketRow('İki Yarı da 1.5 Üst', [cell('Evet','both_half_o15','yes'), cell('Hayır','both_half_o15','no')]);
    }
    if (mk['more_goals_half']) {
      g3 += marketRow('En Çok Gol Olacak Yarı', [cell('1. Yarı','more_goals_half','first'), cell('Eşit','more_goals_half','equal'), cell('2. Yarı','more_goals_half','second')]);
    }
    if (g3) html += group('🕐', 'Yarı Marketleri', g3);
  }

  /* ══════════════════════════════════════
     GRUP 4: GOL
  ══════════════════════════════════════ */
  {
    let g4 = '';
    if (mk['btts']) {
      g4 += marketRow('Karşılıklı Gol', [cell('Var','btts','yes'), cell('Yok','btts','no')]);
    }
    if (mk['ht_btts']) {
      g4 += marketRow('1Y Karşılıklı Gol', [cell('Var','ht_btts','yes'), cell('Yok','ht_btts','no')]);
    }
    if (mk['2h_btts']) {
      g4 += marketRow('2Y Karşılıklı Gol', [cell('Var','2h_btts','yes'), cell('Yok','2h_btts','no')]);
    }
    if (mk['halves_btts']) {
      g4 += marketRow('1Y/2Y Karşılıklı Gol', [cell('Evet/Evet','halves_btts','yy'), cell('Evet/Hayır','halves_btts','yn'), cell('Hayır/Evet','halves_btts','ny'), cell('Hayır/Hayır','halves_btts','nn')]);
    }
    if (mk['first_goal']) {
      g4 += marketRow('İlk Golü Kim Atar', [cell(homeN,'first_goal','home'), cell('Olmaz','first_goal','none'), cell(awayN,'first_goal','away')]);
    }
    if (mk['home_score_both']) {
      g4 += marketRow(`${homeN} Her İki Yarıda Gol`, [cell('Atar','home_score_both','yes'), cell('Atmaz','home_score_both','no')]);
    }
    if (mk['away_score_both']) {
      g4 += marketRow(`${awayN} Her İki Yarıda Gol`, [cell('Atar','away_score_both','yes'), cell('Atmaz','away_score_both','no')]);
    }
    if (mk['home_more_goals_half']) {
      g4 += marketRow(`${homeN} Hangi Yarıda Daha Çok Gol`, [cell('1. Yarı','home_more_goals_half','first'), cell('Eşit','home_more_goals_half','equal'), cell('2. Yarı','home_more_goals_half','second')]);
    }
    if (mk['away_more_goals_half']) {
      g4 += marketRow(`${awayN} Hangi Yarıda Daha Çok Gol`, [cell('1. Yarı','away_more_goals_half','first'), cell('Eşit','away_more_goals_half','equal'), cell('2. Yarı','away_more_goals_half','second')]);
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
      g5 += marketRow(`${lbl} Gol Alt/Üst`, [cell('Alt',k,'under'), cell('Üst',k,'over')]);
    });
    if (g5) html += group('⚖️', 'Taraf Alt / Üst', g5);
  }

  /* ══════════════════════════════════════
     GRUP 6: SOFASCORE ORAN DEĞİŞİMİ
  ══════════════════════════════════════ */
  {
    const s1x2 = od.sofa_1x2;
    if (s1x2) {
      /* Opening-closing farkından change türet — DB'deki change yanlışsa düzelt */
      const deriveChange = (d) => {
        if (!d) return 0;
        const op = d.opening, cl = d.closing;
        if (op != null && cl != null && Math.abs(cl - op) > 0.04) {
          return cl < op ? -1 : 1;   // düştü → -1, yükseldi → +1
        }
        return d.change ?? 0;
      };

      const arrow = ch => ch === 1 ? '↑' : ch === -1 ? '↓' : '→';
      const arrowCls = ch => ch === 1 ? 'sofa-up' : ch === -1 ? 'sofa-dn' : 'sofa-eq';
      const sofaCell = (lbl, d) => {
        if (!d) return '';
        const ch  = deriveChange(d);   // ← türetilmiş change
        const op  = d.opening != null ? d.opening.toFixed(2) : '-';
        const cl  = d.closing != null ? d.closing.toFixed(2) : '-';
        const ar  = arrow(ch);
        const arCls = arrowCls(ch);
        const winCls = d.winning === true ? 'sofa-win' : d.winning === false ? 'sofa-lose' : '';
        return `<div class="sofa-cell ${winCls}">
          <div class="sofa-lbl">${lbl}</div>
          <div class="sofa-odds">
            <span class="sofa-open">${op}</span>
            <span class="sofa-arrow ${arCls}">${ar}</span>
            <span class="sofa-close">${cl}</span>
          </div>
        </div>`;
      };
      const g6 = `<div class="sofa-row">
        ${sofaCell(homeN, s1x2['1'])}
        ${sofaCell('X',   s1x2['x'])}
        ${sofaCell(awayN, s1x2['2'])}
      </div>`;
      html += group('📈', 'Oran Değişimi (Sofascore)', g6);
    }
  }

  html += `</div>`; /* or2-wrap */

} else {
  html += `<div class="empty"><div class="empty-t">Oran verisi henüz mevcut değil</div></div>`;
}
html += `</div>`; /* d-or panel */

  html += `<div class="d-panel" id="d-lu">${buildLineupHTML(lus?.data, m, evs)}</div>`;

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

  /* Canlı maç detayında olaylar kullanıcı yenilemeden gelsin:
     realtime tetiklerine ek olarak arka planda sessiz yoklama. */
  _startDetailEventsPoll(m);

  // TV yayını varsa oynatıcıyı başlat, yoksa (başka maça geçişte) eskisini temizle
  if (streamUrl) {
    _initStreamPlayer(streamUrl);
  } else {
    _destroyStreamPlayer();
  }

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

    if (DONE.has(m.status_short)) {
      const lgGrp = row.closest('.lg-grp');
      row.remove();
      if (lgGrp && !lgGrp.querySelector('.mr')) lgGrp.remove();
      return;
    }

    // ✅ EKLE — DOM attribute'larını güncelle (timer için kritik)
    row.dataset.status = m.status_short || '';
    if (m.kickoff_at)     row.dataset.kickoffAt    = m.kickoff_at;
    if (m.secondHalfAt || m.second_half_at) row.dataset.secondHalfAt = m.second_half_at;
    if (m.elapsed_time != null) row.dataset.elapsed   = m.elapsed_time;
    if (m.updated_at)           row.dataset.updatedAt = m.updated_at;

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
    .select('home_score,away_score,elapsed_time,status_short,updated_at,fixture_id,kickoff_at,second_half_at,pen_home,pen_away')
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

  /* Penaltı skoru — canlı patch. Kutu yoksa status'tan sonra oluştur. */
  const pen = penText(m);
  let penEl = document.querySelector('.d-pen');
  if (pen) {
    if (!penEl && ste) {
      penEl = document.createElement('div');
      penEl.className = 'd-pen';
      ste.insertAdjacentElement('afterend', penEl);
    }
    if (penEl) penEl.textContent = `Penaltılar ${pen}`;
  } else if (penEl) {
    penEl.remove();
  }
}

/* ── SESSİZ OLAY YENİLEME ───────────────────────────────────────────
   match_events'i yeniden çeker ve yalnızca #d-ev .ev-list içeriğini
   yerinde günceller. Panel sıfırlanmaz, aktif tab/scroll korunur.    */
async function silentRefreshDetailEvents() {
  if (!S.detail) return;
  const m = S._detailM;
  if (!m) return;                                  /* arşiv/henüz kurulmamış detay */
  const list = document.querySelector('#d-ev .ev-list');
  if (!list) return;
  try {
    const { data: evs } = await S.sb
      .from('match_events').select('*')
      .eq('fixture_id', S.detail).order('elapsed_time');
    if (String(S.detail) !== String(m.fixture_id)) return;  /* kullanıcı başka maça geçti */
    /* Skoru DOM'daki canlı değerle hizala (faz işaretçi başlıkları için) */
    const nums = document.querySelectorAll('.d-score-n');
    if (nums[0] && nums[0].textContent !== '-') m.home_score = nums[0].textContent;
    if (nums[1] && nums[1].textContent !== '-') m.away_score = nums[1].textContent;
    if (S._detailStatus) m.status_short = S._detailStatus;
    const next = _eventsListInner(m, evs || []);
    if (list.innerHTML !== next) list.innerHTML = next;
  } catch (e) {
    console.warn('[Events] sessiz yenileme hatası:', e.message);
  }
}

/* Yoğun realtime güncellemelerini tek olay-yenilemesinde toparlar (debounce). */
function _scheduleEventsRefresh() {
  if (S._evRefreshT) return;
  S._evRefreshT = setTimeout(() => {
    S._evRefreshT = null;
    silentRefreshDetailEvents();
  }, 800);
}

/* Canlı maç detayı açıkken arka planda olayları sessizce yokla. */
function _startDetailEventsPoll(m) {
  if (S.detailEvTimer) { clearInterval(S.detailEvTimer); S.detailEvTimer = null; }
  if (!statusInfo(m).live) return;                 /* yalnızca canlı maçlar */
  S.detailEvTimer = setInterval(() => {
    if (!S.detail) { clearInterval(S.detailEvTimer); S.detailEvTimer = null; return; }
    /* Maç bittiyse yoklamayı durdur */
    if (['FT','AET','PEN'].includes(S._detailStatus)) {
      clearInterval(S.detailEvTimer); S.detailEvTimer = null;
      silentRefreshDetailEvents();                 /* son bir kez tam liste */
      return;
    }
    silentRefreshDetailEvents();
  }, 12000);
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
  if (row.raw_data) {
    // ✅ object mi string mi kontrol et
    const parsed = typeof row.raw_data === 'object'
      ? row.raw_data
      : (() => { try { return JSON.parse(row.raw_data); } catch(e) { return null; } })();
    if (parsed) return normFix({ ...row, ...parsed });
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
      /* Detay paneli açıksa → skor + dakika güncelle */
if (S.detail && String(m.fixture_id) === String(S.detail)) {
  S._detailStatus      = m.status_short    || S._detailStatus;
  S.detailKickoffAt    = m.kickoff_at      || S.detailKickoffAt;
  S.detailSecondHalfAt = m.second_half_at  || S.detailSecondHalfAt;
  const nums = document.querySelectorAll('.d-score-n');
  let scoreChanged = false;
  if (nums[0] && nums[0].textContent !== String(m.home_score ?? '-')) { 
    nums[0].textContent = m.home_score ?? '-'; 
    flashEl(nums[0]); 
    scoreChanged = true; 
  }
  if (nums[1] && nums[1].textContent !== String(m.away_score ?? '-')) { 
    nums[1].textContent = m.away_score ?? '-'; 
    flashEl(nums[1]); 
    scoreChanged = true; 
  }
  const ste = document.querySelector('.d-status');
  const st = statusInfo(m);
  if (ste) ste.textContent = st.live ? `⚡ ${st.label}` : st.label;
  /* Penaltı skoru — realtime patch */
  {
    const pen = penText(m);
    let penEl = document.querySelector('.d-pen');
    if (pen) {
      if (!penEl && ste) {
        penEl = document.createElement('div');
        penEl.className = 'd-pen';
        ste.insertAdjacentElement('afterend', penEl);
      }
      if (penEl) penEl.textContent = `Penaltılar ${pen}`;
    } else if (penEl) {
      penEl.remove();
    }
  }
  /* Detayda her realtime güncellemesinde olayları sessizce tazele
     (gol + kart/değişiklik gibi skor değiştirmeyen olaylar da gelsin).
     Debounce ile yoğun tetikler tek sorguda toparlanır. */
  _scheduleEventsRefresh();
  if (!st.live) loadMatches(true);
  /* return komutunu sildik, akış aşağıya (liste güncellemesine) devam edecek! */
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
      if (status === 'SUBSCRIBED') {
        /* Realtime bağlandı — yedek polling'i durdur */
        if (S.timer) { clearInterval(S.timer); S.timer = null; }
        console.log('[Realtime] bağlandı ✓');
        /* Dakika ticker'ı boot'ta kalıcı başlatılır; burada güvence */
        if (!S.tickTimer) S.tickTimer = setInterval(_tickLiveMinutes, 1000);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        /* Bağlantı koptu — yedek polling'e dön (dakika ticker'ı çalışmaya devam eder) */
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
    /* Görünür geri sayım halkası kaldırıldı; dakika ilerletme kalıcı ticker'da. */
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

function _tickLiveMinutes() {
  const now = Date.now();

  const computeEl = (s, ds) => {
    if (s === 'HT' || s === 'BT' || s === 'P') return null;

    // Timestamp hesabı
    let fromTs = null;
    if (s === '1H' && ds.kickoffAt) {
      const m = Math.floor((now - new Date(ds.kickoffAt).getTime()) / 60000);
      fromTs = Math.max(1, Math.min(52, m));
    } else if (s === '2H' && ds.secondHalfAt) {
      const m = Math.floor((now - new Date(ds.secondHalfAt).getTime()) / 60000);
      fromTs = Math.max(46, Math.min(97, 45 + m));
    } else if (s === 'ET' && ds.secondHalfAt) {
      const m = Math.floor((now - new Date(ds.secondHalfAt).getTime()) / 60000) - 45;
      fromTs = Math.max(91, Math.min(122, 90 + m));
    }

    // DB anchor hesabı
    let fromDb = null;
    if (ds.elapsed && ds.updatedAt) {
      const base = parseInt(ds.elapsed, 10);
      if (!isNaN(base)) {
        const drift = (now - new Date(ds.updatedAt).getTime()) / 60000;
        let v = Math.round(base + drift);
        if (s === '1H')      v = Math.max(1,  Math.min(52,  v));
        else if (s === '2H') v = Math.max(46, Math.min(97,  v));
        else if (s === 'ET') v = Math.max(91, Math.min(122, v));
        fromDb = v;
      }
    }

    // Akıllı seçim
    if (fromTs != null && fromDb != null) {
      return Math.abs(fromTs - fromDb) >= 2 ? fromDb : fromTs;
    }
    return fromDb ?? fromTs;
  };

  // 1. Liste satırları
  document.querySelectorAll('.mr.is-live[data-status]').forEach(row => {
    const el = computeEl(row.dataset.status, row.dataset);
    if (el == null) return;
    const tEl = row.querySelector('.mr-t1');
    if (tEl && tEl.textContent !== `${el}'`) tEl.textContent = `${el}'`;
  });

  // 2. Detay paneli
  if (S.detail) {
    const ste = document.querySelector('.d-status');
    if (ste && ste.classList.contains('live')) {
      const el = computeEl(S._detailStatus, {
        elapsed:      S._detailElapsed,
        updatedAt:    S._detailUpdatedAt,
        kickoffAt:    S.detailKickoffAt,
        secondHalfAt: S.detailSecondHalfAt,
      });
      if (el != null) ste.textContent = `⚡ ${el}'`;
    }
  }
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

function calcElapsed(m) {
  const now = Date.now();
  const s   = m.status_short;

  // HT/BT/P için elapsed yok
  if (s === 'HT' || s === 'BT' || s === 'P') return null;

  // ── A) Timestamp'ten hesapla ──
  let fromTs = null;
  if (s === '1H' && m.kickoff_at) {
    const mins = Math.floor((now - new Date(m.kickoff_at).getTime()) / 60000);
    fromTs = Math.max(1, Math.min(52, mins));
  } else if (s === '2H' && m.second_half_at) {
    const mins = Math.floor((now - new Date(m.second_half_at).getTime()) / 60000);
    fromTs = Math.max(46, Math.min(97, 45 + mins));
  } else if (s === 'ET' && m.second_half_at) {
    const mins = Math.floor((now - new Date(m.second_half_at).getTime()) / 60000) - 45;
    fromTs = Math.max(91, Math.min(122, 90 + mins));
  }

  // ── B) DB elapsed + updated_at'ten hesapla (drift düzeltmeli) ──
  let fromDb = null;
  if (m.elapsed_time != null && m.updated_at) {
    const driftMin = (now - new Date(m.updated_at).getTime()) / 60000;
    let v = Math.round(m.elapsed_time + driftMin);
    if (s === '1H')      v = Math.max(1,  Math.min(52,  v));
    else if (s === '2H') v = Math.max(46, Math.min(97,  v));
    else if (s === 'ET') v = Math.max(91, Math.min(122, v));
    fromDb = v;
  }

  // ── C) Akıllı karar ──
  if (fromTs != null && fromDb != null) {
    const diff = Math.abs(fromTs - fromDb);
    // 2+ dk fark → worker timestamp'i geç yazmış → DB güvenilir
    if (diff >= 2) {
      // İlk tespit edildiğinde uyarı yaz (her tick'te değil)
      if (!m._driftWarned) {
        console.warn(`[calcElapsed] ${m.fixture_id}: ts=${fromTs}', db=${fromDb}' (fark ${diff}dk) → DB tercih edildi`);
        m._driftWarned = true;
      }
      return fromDb;
    }
    return fromTs; // küçük fark, timestamp daha pürüzsüz
  }

  return fromDb ?? fromTs ?? (m.elapsed_time ?? null);
}

/* ── STATUS ──────────────────────────────────── */
/* Penaltı skoru etiketi — pen_home/pen_away doluysa "5-3" döner, yoksa '' */
function penText(m) {
  const ph = m.pen_home, pa = m.pen_away;
  if (ph == null || pa == null) return '';
  if (+ph === 0 && +pa === 0) return '';
  return `${ph}-${pa}`;
}

function statusInfo(m) {
  const s = m.status_short;
  const liveSet = new Set(['1H','2H','HT','ET','BT','P','LIVE']);
  const doneSet = new Set(['FT','AET','PEN']);

  if (liveSet.has(s)) {
    let label;
    if (s === 'HT') {
      label = 'HT';
    } else if (s === 'BT') {
      label = 'BT';
    } else if (s === 'P') {
      label = 'P';
    } else {
      // ✅ DB elapsed_time yerine calcElapsed kullan
      const el = calcElapsed(m);
      label = el != null ? `${el}'` : s;
    }
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

/* ══════════════════════════════════════════════════════════════════
   Arşiv fallback — loadDetail için
   Supabase'de bulunamayan eski maçları GitHub arşivinden çeker.
   Format: array of { fixture, league, teams, goals, score, events, stats, lineups, h2h }
══════════════════════════════════════════════════════════════════ */
async function _loadDetailFromArchive(fixtureId) {
  const id    = String(fixtureId);
  const today = new Date();

  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    try {
      let res  = await fetch(`${ARCHIVE_BASE}/${dateStr}.json.gz`);
      let data;

      if (res.ok) {
        const ds   = new DecompressionStream('gzip');
        const body = new Response(res.body.pipeThrough(ds));
        data = await body.json();
      } else {
        res = await fetch(`${ARCHIVE_BASE}/${dateStr}.json`);
        if (!res.ok) continue;
        data = await res.json();
      }

      const list  = Array.isArray(data) ? data
                  : Array.isArray(data?.response) ? data.response : [];
      const found = list.find(m => String(m?.fixture?.id) === id);
      if (!found) continue;

      /* archiveAdapt fonksiyonlarını kullan (app.js'de zaten var) */
      const m    = normFix({
        fixture_id:   found.fixture?.id,
        home_team:    found.teams?.home?.name   || '',
        away_team:    found.teams?.away?.name   || '',
        home_score:   found.goals?.home         ?? null,
        away_score:   found.goals?.away         ?? null,
        league_name:  found.league?.name        || '',
        status_short: found.fixture?.status?.short || 'FT',
        elapsed_time: found.fixture?.status?.elapsed ?? null,
        kickoff_time: found.fixture?.date       || null,
        home_logo:    found.teams?.home?.logo   || '',
        away_logo:    found.teams?.away?.logo   || '',
        raw_data:     null,
      });

      const evs   = archiveAdaptEvents(found.events  || []);
      const stats = archiveAdaptStats(found.stats    || []);
      const lus   = archiveAdaptLineups(found.lineups || {}, found);
      const h2h   = archiveAdaptH2H(found.h2h        || []);

      /* Router meta güncelle */
      if (typeof Router !== 'undefined' && Router.setMatchMeta) {
        Router.setMatchMeta(
          m.home_team, m.away_team,
          m.home_score, m.away_score,
          m.league_name,
          m.status_short || 'FT',
          m.fixture_id,
          m.kickoff_time,
          m.home_logo, m.away_logo,
          null
        );
      }

      return { m, evs, stats, lus, h2h };

    } catch { /* bu günü atla */ }
  }

  return null;
}


/* ══════════════════════════════════════════════════════════════════
   TAKIM PROFİL SAYFASI  (mac_t_id ile tm_teams'e bağlı)
   + İsim tabanlı fallback: mac_t_id eşleşmesi yoksa takım adından bul
══════════════════════════════════════════════════════════════════ */

/* ── İsim normalizasyon & benzerlik yardımcıları (Türkçe) ── */
window._tmTurkNorm = function(s) {
  return String(s || '').toLowerCase()
    .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u')
    .replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/&/g,' ve ')
    .replace(/[^a-z0-9]+/g,' ')
    .replace(/\s+/g,' ').trim();
};
/* Anlamsız/gürültü token'ları (kulüp ekleri) — eşleşmeyi bozmasın */
const _TM_STOP = new Set(['fc','sc','sk','as','cf','if','fk','ac','cd','sd','ud','afc','spor','kulubu','kulup','club','calcio','team','the','de','la']);
window._tmTokens = function(s) {
  return window._tmTurkNorm(s).split(' ').filter(t => t && !_TM_STOP.has(t));
};
/* Jaccard benzerliği (token kümeleri üzerinden) */
window._tmJaccard = function(a, b) {
  const A = new Set(window._tmTokens(a)), B = new Set(window._tmTokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(x => { if (B.has(x)) inter++; });
  return inter / (A.size + B.size - inter);
};
/* Rezerv / kadın / altyapı takımlarını dışla */
window._tmIsReserve = function(name) {
  const n = window._tmTurkNorm(name);
  return /\b(u1[0-9]|u2[0-9]|u9|reserve|reserves|youth|akademi|altyapi|amator|amator|genc|kadin|women|woman|femin|b takimi|ii|2|junior)\b/.test(n);
};

/* mac_t_id → tm_teams; yoksa isimden fuzzy eşleştir.
   Dönen: tm_teams satırı | null  +  (eşleşme isimden geldiyse linkedBy='name') */
window._tmResolveTeam = async function(sb, macId, teamName) {
  /* 1) Birincil: mac_t_id (kesin/otoriter) */
  if (macId != null && !isNaN(macId)) {
    const { data } = await sb.from('tm_teams').select('*').eq('mac_t_id', macId).maybeSingle();
    if (data) { data._linkedBy = 'id'; return data; }
  }
  /* 2) Fallback: takım adı (mac_t_id atanmamış ama tm_teams'te var) */
  if (teamName) {
    const toks = window._tmTokens(teamName);
    const core = toks.sort((a,b)=>b.length-a.length)[0] || '';   // en uzun anlamlı token
    if (core.length >= 3) {
      /* İlk kelimeyi (orijinal, diakritikli) prefix olarak da dene → daha geniş aday havuzu */
      const rawFirst = String(teamName).trim().split(/\s+/)[0] || '';
      let cands = [];
      try {
        const { data } = await sb.from('tm_teams')
          .select('*')
          .or(`name.ilike.%${core}%,name.ilike.${rawFirst}%`)
          .limit(60);
        if (data) cands = data;
      } catch(e){ /* ilike or() başarısızsa sade ilike dene */
        try { const { data } = await sb.from('tm_teams').select('*').ilike('name', `%${core}%`).limit(60); if (data) cands = data; } catch(_){}
      }
      let best = null, bestScore = 0;
      for (const c of cands) {
        let sc = window._tmJaccard(teamName, c.name);
        if (window._tmIsReserve(c.name) && !window._tmIsReserve(teamName)) sc -= 0.35; // rezervi cezalandır
        if (sc > bestScore) { bestScore = sc; best = c; }
      }
      if (best && bestScore >= 0.6) { best._linkedBy = 'name'; best._matchScore = +bestScore.toFixed(2); return best; }
    }
  }
  return null;
};

window.goToTeam = function(id, name, e) {
  if (e) e.stopPropagation();
  if (id == null) return;
  const slug = String(name || '').toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  history.pushState(null, '', `/takim/${id}-${slug}`);
  window.dispatchEvent(new Event('popstate'));   // router yakalar
};

window.showTeamView = function() {
  showView('team');
  window.scrollTo(0, 0);
};

/* URL slug'undan ("1-galatasaray") takım adını tahmin et — fallback için */
function _teamNameFromSlug() {
  const last = (window.location.pathname.split('/').filter(Boolean).pop() || '');
  const m = last.match(/^\d+-(.+)$/);
  return m ? m[1].replace(/-/g,' ').trim() : '';
}

window.loadTeam = async function(macId, teamName) {
  const root = document.getElementById('team-root');
  if (!root) return;
  root.innerHTML = `<div class="skel" style="padding:20px;"><div class="sk-h"></div><div class="sk-r"></div><div class="sk-r"></div></div>`;
  if (!teamName) teamName = _teamNameFromSlug();

  try {
    const sb = (typeof S !== 'undefined' && S.sb) ? S.sb
             : window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

    /* 1) Takım profili — önce mac_t_id, yoksa isimden fuzzy fallback */
    const tmTeam = await window._tmResolveTeam(sb, macId, teamName);
    if (tmTeam && tmTeam._linkedBy === 'name')
      console.info(`[takim] mac_t_id=${macId} link yok → isimden eşleşti: "${tmTeam.name}" (skor ${tmTeam._matchScore})`);

    /* 2) Fikstür — home_team_id/away_team_id JSON blob içinde, kolon değil.
          Tarihe göre kaba çek, normFix ile parse et, takım id'sine göre client-side filtrele. */
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
    const { data: futRows } = await sb.from('future_matches')
      .select('*').gte('date', today).order('date', { ascending: true }).limit(2000);
    const parseFx = (r) => {
      if (r.raw_data) { try { const d = typeof r.raw_data==='string'?JSON.parse(r.raw_data):r.raw_data; return normFix({...r,...d}); } catch(e){} }
      if (r.data) { let d=r.data; if(typeof d==='string'){try{d=JSON.parse(d)}catch(e){d=null}} if(d){const l=Array.isArray(d)?d:[d]; return normFix({...r,...l[0]});} }
      return normFix(r);
    };
    const fixtures = (futRows || []).map(parseFx)
      .filter(f => f && (String(f.home_team_id)===String(macId) || String(f.away_team_id)===String(macId)))
      .slice(0, 15);

    /* 2b) Sezonluk fikstür: tm_fixtures (team_mac_id = URL'deki mac_t_id) */
    let seasonFx = [];
    try {
      const { data } = await sb.from('tm_fixtures').select('*')
        .eq('team_mac_id', macId).order('kickoff', { ascending: true });
      if (data) seasonFx = data;
    } catch(e){}

    /* 3) Puan durumu + kadro (varsa) */
    let standings = [], players = [];
    if (tmTeam && tmTeam.league) {
      try { const { data } = await sb.from('tm_standings').select('*').eq('league', tmTeam.league).order('rank', { ascending: true }); if (data) standings = data; } catch(e){}
    }
    if (tmTeam && tmTeam.id) {
      try { const { data } = await sb.from('tm_players').select('*').eq('team_id', tmTeam.id).order('market_value_eur', { ascending: false }); if (data) players = data; } catch(e){}
    }

    renderTeamPage(root, macId, tmTeam, fixtures, standings, players, seasonFx);
  } catch (err) {
    console.error('Takım sayfası hatası:', err);
    root.innerHTML = `<div class="empty" style="padding:20px;"><div class="empty-t">Takım verileri yüklenirken sorun oluştu.</div></div>`;
  }
};

window.switchTeamTab = function(name, btn) {
  document.querySelectorAll('.tp-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.tp-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('tp-' + name);
  if (panel) panel.classList.add('active');
};

/* Pozisyon → kategori rengi (kadro sol şeridi) */
function _posCat(pos) {
  const p = (pos || '').toLowerCase();
  if (/kale/.test(p))                         return { c: '#a855f7', k: 'KL' };
  if (/stoper|bek|defans|libero?\b|savun/.test(p) && !/ön/.test(p)) return { c: '#3b82f6', k: 'DF' };
  if (/orta saha|numara|libero/.test(p))      return { c: '#10b981', k: 'OS' };
  if (/kanat|forvet|santrafor|santrfor/.test(p)) return { c: '#f26419', k: 'FW' };
  return { c: '#8b95a4', k: '•' };
}

function renderTeamPage(root, macId, tmTeam, fixtures, standings, players, seasonFx) {
  const css = `<style>
    .tp{max-width:920px;margin:0 auto;}
    .tp-hero{position:relative;overflow:hidden;border-radius:18px;padding:26px 26px 22px;margin-bottom:14px;
      background:linear-gradient(135deg,var(--bg2) 0%,var(--bg4) 100%);border:1px solid var(--b1);}
    .tp-hero::before{content:'';position:absolute;top:-80px;right:-40px;width:280px;height:280px;
      background:radial-gradient(circle,var(--or-glow) 0%,transparent 70%);opacity:.5;pointer-events:none;}
    .tp-hero-top{display:flex;gap:20px;align-items:center;position:relative;z-index:1;}
    .tp-crest{width:92px;height:92px;flex-shrink:0;border-radius:16px;background:var(--bg2);
      border:1px solid var(--b1);box-shadow:0 6px 20px rgba(0,0,0,.08);display:flex;align-items:center;justify-content:center;}
    .tp-crest img{width:66px;height:66px;object-fit:contain;}
    .tp-crest .tp-ph{font-family:'Barlow Condensed',sans-serif;font-size:32px;font-weight:800;color:var(--tx3);}
    .tp-head-info{min-width:0;}
    .tp-league{display:inline-block;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
      color:var(--or);background:var(--or2);border:1px solid rgba(242,100,25,.3);padding:3px 10px;border-radius:20px;margin-bottom:8px;}
    .tp-name{font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:800;line-height:1.05;color:var(--tx1);}
    .tp-meta{font-size:13px;color:var(--tx2);margin-top:6px;}
    .tp-meta b{color:var(--tx1);font-weight:600;}
    .tp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px;position:relative;z-index:1;}
    .tp-stat{background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:12px 14px;}
    .tp-stat-l{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--tx3);margin-bottom:5px;}
    .tp-stat-v{font-family:'JetBrains Mono',monospace;font-size:17px;font-weight:700;color:var(--tx1);}
    .tp-tabs{display:flex;gap:4px;background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:5px;margin-bottom:14px;
      position:sticky;top:8px;z-index:5;}
    .tp-tab{flex:1;border:none;background:none;font-family:'Barlow',sans-serif;font-size:14px;font-weight:600;
      color:var(--tx2);padding:10px 8px;border-radius:8px;cursor:pointer;transition:all .18s;}
    .tp-tab:hover{color:var(--tx1);background:var(--b1);}
    .tp-tab.active{color:#fff;background:var(--or);box-shadow:0 3px 10px var(--or-glow);}
    .tp-panel{display:none;}
    .tp-panel.active{display:block;animation:tpfade .25s ease;}
    @keyframes tpfade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}
    .tp-empty{text-align:center;color:var(--tx3);padding:40px 0;font-size:14px;}

    /* Sezonluk fikstür (tm_fixtures) */
    .tp-fx{border:1px solid var(--b1);border-radius:14px;overflow:hidden;background:var(--bg2);}
    .tp-frow{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--b1);cursor:pointer;}
    .tp-frow:last-child{border-bottom:none;}.tp-frow:hover{background:var(--or3);}
    .tp-frow.next{background:var(--or3);}
    .tp-fdate{font-size:11px;color:var(--tx3);width:54px;text-align:center;flex-shrink:0;line-height:1.3;}
    .tp-fcomp{font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--tx3);
      padding:10px 14px 4px;background:var(--bg4);border-bottom:1px solid var(--b1);}
    .tp-fscore{width:64px;text-align:center;flex-shrink:0;font-size:13.5px;color:var(--tx1);}
    .tp-fteams{flex:1;font-size:13.5px;color:var(--tx1);}.tp-fvs{color:var(--tx3);margin:0 6px;}
    .tp-fres{width:20px;height:20px;flex-shrink:0;border-radius:6px;display:flex;align-items:center;justify-content:center;
      font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:800;color:#fff;}
    .tp-fres.g{background:#10b981;}
    .tp-fres.b{background:#eab308;}
    .tp-fres.m{background:#ef4444;}
    .tp-fres.none{background:transparent;}

    /* Kadro — zebra grid */
    .tp-squad{border:1px solid var(--b1);border-radius:14px;overflow:hidden;background:var(--bg2);}
    .tp-prow{display:grid;grid-template-columns:4px 36px 1fr auto;align-items:center;gap:12px;padding:11px 16px 11px 0;
      border-bottom:1px solid var(--b1);transition:background .15s;}
    .tp-prow:last-child{border-bottom:none;}
    .tp-prow:nth-child(odd){background:var(--bg2);}
    .tp-prow:nth-child(even){background:var(--bg4);}
    .tp-prow:hover{background:var(--or3);}
    .tp-pbar{width:4px;height:38px;border-radius:0 3px 3px 0;}
    .tp-pcat{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;
      font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;color:#fff;}
    .tp-pname{font-size:14px;font-weight:600;color:var(--tx1);line-height:1.2;}
    .tp-ppos{font-size:11.5px;color:var(--tx3);margin-top:2px;}
    .tp-pval{font-family:'JetBrains Mono',monospace;font-size:13.5px;font-weight:600;color:var(--tx1);padding-right:16px;white-space:nowrap;}
    .tp-pval.muted{color:var(--tx3);font-weight:500;}

    /* Puan durumu */
    .tp-stand{border:1px solid var(--b1);border-radius:14px;overflow:hidden;background:var(--bg2);}
    .tp-stand table{width:100%;border-collapse:collapse;font-size:13px;}
    .tp-stand th{font-size:10.5px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--tx3);
      padding:11px 8px;text-align:center;border-bottom:1px solid var(--b2);background:var(--bg4);}
    .tp-stand th.l,.tp-stand td.l{text-align:left;}
    .tp-stand td{padding:11px 8px;text-align:center;border-bottom:1px solid var(--b1);color:var(--tx2);}
    .tp-stand tr:last-child td{border-bottom:none;}
    .tp-stand td.rank{font-family:'JetBrains Mono',monospace;color:var(--tx3);font-weight:600;}
    .tp-stand td.team{text-align:left;color:var(--tx1);font-weight:600;}
    .tp-stand td.pts{font-family:'JetBrains Mono',monospace;font-weight:800;color:var(--tx1);}
    .tp-stand tr.me{background:var(--or3);}
    .tp-stand tr.me td{color:var(--or);}
    .tp-stand tr.me td.team{color:var(--or);font-weight:800;}

    .tp-fx-wrap{border:1px solid var(--b1);border-radius:14px;overflow:hidden;background:var(--bg2);}
    @media(max-width:600px){
      .tp-stats{grid-template-columns:repeat(2,1fr);}
      .tp-name{font-size:24px;}
      .tp-crest{width:72px;height:72px;}.tp-crest img{width:50px;height:50px;}
    }
  </style>`;

  /* ── HERO ── */
  let hero;
  if (tmTeam) {
    const founded = tmTeam.founded ? String(tmTeam.founded).split('-')[0] : '–';
    const fmtEur = v => v ? '€' + Number(v).toLocaleString('tr-TR') : '–';
    const initials = (tmTeam.name || '?').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
    hero = `
      <div class="tp-hero">
        <div class="tp-hero-top">
          <div class="tp-crest">${tmTeam.crest_url ? `<img src="${esc(tmTeam.crest_url)}" onerror="this.parentNode.innerHTML='<span class=&quot;tp-ph&quot;>${esc(initials)}</span>'" alt="">` : `<span class="tp-ph">${esc(initials)}</span>`}</div>
          <div class="tp-head-info">
            <span class="tp-league">${esc(tmTeam.league || 'Lig')}</span>
            <div class="tp-name">${esc(tmTeam.name || '')}</div>
            <div class="tp-meta">Kuruluş: <b>${esc(founded)}</b> &nbsp;·&nbsp; Stadyum: <b>${esc(tmTeam.stadium || '–')}</b></div>
          </div>
        </div>
        <div class="tp-stats">
          <div class="tp-stat"><div class="tp-stat-l">Kadro Değeri</div><div class="tp-stat-v">${fmtEur(tmTeam.squad_value_eur)}</div></div>
          <div class="tp-stat"><div class="tp-stat-l">Yaş Ort.</div><div class="tp-stat-v">${esc(tmTeam.avg_age || '–')}</div></div>
          <div class="tp-stat"><div class="tp-stat-l">Yabancı</div><div class="tp-stat-v">${esc(tmTeam.foreigners ?? '–')}</div></div>
          <div class="tp-stat"><div class="tp-stat-l">Kadro</div><div class="tp-stat-v">${esc(tmTeam.player_count ?? (players ? players.length : '–'))}</div></div>
        </div>
      </div>`;
  } else {
    hero = `<div class="tp-hero"><div class="tp-name" style="font-size:22px;">${esc('Takım #' + macId)}</div>
      <div class="tp-meta">Bu takımın detaylı profili henüz oluşturulmamış.</div></div>`;
  }

  /* ── FİKSTÜR ── */
  let fxHtml = '';
  if (seasonFx && seasonFx.length) {
    /* Sezonluk fikstür (tm_fixtures). Maç linki: match_id sitedeki fixture_id ile
       aynıysa tıklanabilir — future_matches'ten kanıtla, varsayma. */
    const knownIds = new Set((fixtures || []).map(f => String(f.fixture_id)));
    const now = Date.now();
    let lastComp = null, nextMarked = false;
    fxHtml = `<div class="tp-fx">` + seasonFx.map(m => {
      const ko = m.kickoff ? new Date(m.kickoff) : null;
      const d  = ko ? ko.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'}) : '';
      const t  = ko ? ko.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
      const played = m.home_score != null;
      /* G/B/M rozeti — takımın kendi perspektifinden (side: home/away) */
      let resBadge = `<span class="tp-fres none"></span>`;
      if (played) {
        const hs = Number(m.home_score), as = Number(m.away_score);
        const mine   = m.side === 'away' ? as : hs;
        const theirs = m.side === 'away' ? hs : as;
        const r = mine > theirs ? ['g','G'] : mine < theirs ? ['m','M'] : ['b','B'];
        resBadge = `<span class="tp-fres ${r[0]}" title="${r[0]==='g'?'Galibiyet':r[0]==='b'?'Beraberlik':'Mağlubiyet'}">${r[1]}</span>`;
      }
      const mid = played
        ? `<b>${m.home_score} - ${m.away_score}</b>`
        : `<span class="tp-fvs">${t}</span>`;
      let compHdr = '';
      if (m.competition && m.competition !== lastComp) {
        compHdr = `<div class="tp-fcomp">${esc(m.competition)}</div>`;
        lastComp = m.competition;
      }
      let cls = 'tp-frow';
      if (!played && !nextMarked && ko && ko.getTime() >= now - 6*36e5) { cls += ' next'; nextMarked = true; }
      const click = knownIds.has(String(m.match_id))
        ? ` onclick="window.location.href='/mac/${m.match_id}'" style="cursor:pointer"`
        : ` style="cursor:default"`;
      return compHdr + `<div class="${cls}"${click}>
        <div class="tp-fdate">${d}</div>
        <div class="tp-fteams" style="text-align:right">${esc(m.home_name)}</div>
        <div class="tp-fscore">${mid}</div>
        <div class="tp-fteams">${esc(m.away_name)}</div>
        ${resBadge}</div>`;
    }).join('') + `</div>`;
  } else if (fixtures && fixtures.length) {
    fxHtml = `<div class="tp-fx-wrap">` + fixtures.map(m => (typeof renderRow === 'function' ? renderRow(m, false) : '')).join('') + `</div>`;
  } else {
    fxHtml = `<div class="tp-empty">Yaklaşan maç bulunamadı.</div>`;
  }

  /* ── KADRO ── */
  let sqHtml = '';
  if (players && players.length) {
    sqHtml = `<div class="tp-squad">` + players.map(p => {
      const cat = _posCat(p.position);
      const mv = p.market_value_eur ? '€' + Number(p.market_value_eur).toLocaleString('tr-TR') : '–';
      return `<div class="tp-prow" onclick="goToPlayer(${p.id},'${(p.name||p.player_name||'').replace(/'/g,"\\'")}',event)" style="cursor:pointer">
        <div class="tp-pbar" style="background:${cat.c}"></div>
        <div class="tp-pcat" style="background:${cat.c}">${cat.k}</div>
        <div><div class="tp-pname">${esc(p.name || p.player_name || '')}</div>${p.position ? `<div class="tp-ppos">${esc(p.position)}</div>` : ''}</div>
        <div class="tp-pval${p.market_value_eur ? '' : ' muted'}">${mv}</div>
      </div>`;
    }).join('') + `</div>`;
  } else {
    sqHtml = `<div class="tp-empty">Kadro bilgisi bulunamadı.</div>`;
  }

  /* ── PUAN DURUMU ── */
  let stHtml = '';
  if (standings && standings.length) {
    const rows = standings.map(s => {
      const nm = s.team_name || s.team || s.name || '';
      const me = (tmTeam && tmTeam.name && nm === tmTeam.name) ? ' class="me"' : '';
      const g = s.win ?? s.wins ?? s.won ?? s.w ?? '–';
      const b = s.draw ?? s.draws ?? s.drawn ?? s.d ?? '–';
      const m = s.loss ?? s.losses ?? s.lost ?? s.l ?? '–';
      const av = s.goal_diff ?? s.goal_difference ?? s.gd ?? '–';
      return `<tr${me}>
        <td class="rank">${esc(s.rank ?? '')}</td>
        <td class="team">${esc(nm)}</td>
        <td>${esc(s.played ?? s.matches ?? s.mp ?? '–')}</td>
        <td>${esc(g)}</td><td>${esc(b)}</td><td>${esc(m)}</td>
        <td>${esc(av)}</td>
        <td class="pts">${esc(s.points ?? s.pts ?? '')}</td>
      </tr>`;
    }).join('');
    stHtml = `<div class="tp-stand"><table>
      <thead><tr><th class="l">#</th><th class="l">Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>Av</th><th>P</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } else {
    stHtml = `<div class="tp-empty">Puan durumu bulunamadı.</div>`;
  }

  root.innerHTML = css + `
    <div class="tp">
      ${hero}
      <div class="tp-tabs">
        <button class="tp-tab active" onclick="switchTeamTab('fixtures',this)">Fikstür</button>
        <button class="tp-tab" onclick="switchTeamTab('squad',this)">Kadro</button>
        <button class="tp-tab" onclick="switchTeamTab('standings',this)">Puan Durumu</button>
      </div>
      <div id="tp-fixtures" class="tp-panel active">${fxHtml}</div>
      <div id="tp-squad" class="tp-panel">${sqHtml}</div>
      <div id="tp-standings" class="tp-panel">${stHtml}</div>
    </div>`;
}


/* ══════════════════════════════════════════════════════════════════
   OYUNCU PROFİL SAYFASI  (/oyuncu/{id}-slug)
   Kaynak: tm_players + tm_market_values + tm_player_stats + tm_player_transfer
   - Kadro tabından doğrudan id ile açılır.
   - Events/lineups isimlerinden goToPlayerByName ile (fuzzy) açılır.
══════════════════════════════════════════════════════════════════ */

function _plSlug(name){
  return String(name||'').toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

window.goToPlayer = function(id, name, e){
  if (e) e.stopPropagation();
  if (id == null) return;
  history.pushState(null, '', `/oyuncu/${id}-${_plSlug(name)}`);
  window.dispatchEvent(new Event('popstate'));
};

/* Events "Soyad, Ad" / lineups "Ad Soyad" → tm_players'ta isimle bul */
window._resolvePlayerByName = async function(rawName){
  if (!rawName) return null;
  let name = rawName;
  if (name.includes(',')) {                       // "Messi, Lionel" → "Lionel Messi"
    const parts = name.split(',').map(s=>s.trim());
    if (parts.length === 2) name = parts[1] + ' ' + parts[0];
  }
  const sb = (typeof S !== 'undefined' && S.sb) ? S.sb
           : window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
  const toks = window._tmTokens(name);
  const core = toks.sort((a,b)=>b.length-a.length)[0] || '';
  if (core.length < 3) return null;
  const rawCore = String(name).trim().split(/\s+/).sort((a,b)=>b.length-a.length)[0] || '';
  let cands = [];
  try {
    const { data } = await sb.from('tm_players')
      .select('id,name,profile_slug')
      .or(`name.ilike.%${core}%,name.ilike.%${rawCore}%`).limit(80);
    if (data) cands = data;
  } catch(e){
    try { const { data } = await sb.from('tm_players').select('id,name,profile_slug').ilike('name',`%${core}%`).limit(80); if (data) cands = data; } catch(_){}
  }
  let best=null, bs=0;
  for (const c of cands){
    const sc = window._tmJaccard(name, c.name);
    if (sc > bs){ bs = sc; best = c; }
  }
  return (best && bs >= 0.5) ? best : null;
};

window.goToPlayerByName = async function(name, e){
  if (e) e.stopPropagation();
  const p = await window._resolvePlayerByName(name);
  if (p) window.goToPlayer(p.id, p.name);
  else _plToast('Bu oyuncunun detaylı profili bulunamadı');
};

function _plToast(msg){
  let t = document.getElementById('pl-toast');
  if (!t){ t = document.createElement('div'); t.id = 'pl-toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:9999;background:var(--bg2,#1a1d23);color:var(--tx1,#e7eaee);border:1px solid var(--b1,#23262d);padding:10px 16px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.3);opacity:0;transition:opacity .2s;';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._h); t._h = setTimeout(()=>{ t.style.opacity='0'; }, 2200);
}

window.showPlayerView = function(){ showView('player'); window.scrollTo(0,0); };

function _playerNameFromSlug(){
  const last = (window.location.pathname.split('/').filter(Boolean).pop() || '');
  const m = last.match(/^\d+-(.+)$/);
  return m ? m[1].replace(/-/g,' ').trim() : '';
}

window.switchPlayerTab = function(name, btn){
  document.querySelectorAll('.pl-tab').forEach(t=>t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.pl-panel').forEach(p=>p.classList.remove('active'));
  const panel = document.getElementById('pl-'+name);
  if (panel) panel.classList.add('active');
};

window.loadPlayer = async function(pid, name){
  const root = document.getElementById('player-root');
  if (!root) return;
  root.innerHTML = `<div class="skel" style="padding:20px;"><div class="sk-h"></div><div class="sk-r"></div><div class="sk-r"></div></div>`;

  try {
    const sb = (typeof S !== 'undefined' && S.sb) ? S.sb
             : window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);

    const { data: p } = await sb.from('tm_players').select('*').eq('id', pid).maybeSingle();
    if (!p){ root.innerHTML = `<div class="empty" style="padding:20px;"><div class="empty-t">Oyuncu bulunamadı.</div></div>`; return; }

    /* Paralel: takım + değer geçmişi + sezon ist. + transferler */
    const [teamR, mvR, stR, trR] = await Promise.all([
      p.team_id ? sb.from('tm_teams').select('id,name,crest_url,mac_t_id,league').eq('id', p.team_id).maybeSingle() : Promise.resolve({data:null}),
      sb.from('tm_market_values').select('value_date,value_eur,club,age').eq('player_id', pid).order('value_date',{ascending:true}),
      sb.from('tm_player_stats').select('*').eq('player_id', pid).order('saison_id',{ascending:false}),
      sb.from('tm_player_transfers').select('*').eq('player_id', pid).order('transfer_date',{ascending:false})
    ]);
    const team = teamR?.data || null;
    const mvals = mvR?.data || [];
    const stats = stR?.data || [];
    const transfers = trR?.data || [];

    /* Transfer kulüp id'lerini isme çevir (tm_teams) */
    let clubMap = {};
    const clubIds = [...new Set(transfers.flatMap(t=>[t.from_club_id,t.to_club_id]).filter(x=>x!=null))];
    if (clubIds.length){
      try { const { data } = await sb.from('tm_teams').select('id,name').in('id', clubIds);
        (data||[]).forEach(c=>{ clubMap[c.id] = c.name; }); } catch(e){}
    }

    document.title = (p.name || 'Oyuncu') + ' — Profil, İstatistik, Piyasa Değeri | ScorePop';
    renderPlayerPage(root, pid, p, team, mvals, stats, transfers, clubMap);
  } catch(err){
    console.error('Oyuncu sayfası hatası:', err);
    root.innerHTML = `<div class="empty" style="padding:20px;"><div class="empty-t">Oyuncu verileri yüklenirken sorun oluştu.</div></div>`;
  }
};

/* Piyasa değeri sparkline (inline SVG, kütüphanesiz) */
function _plSparkline(mvals){
  const pts = (mvals||[]).filter(m=>m.value_eur!=null);
  if (pts.length < 2) return '';
  const W=600, H=120, pad=8;
  const vals = pts.map(p=>Number(p.value_eur));
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = (max-min)||1;
  const x = i => pad + (i/(pts.length-1))*(W-2*pad);
  const y = v => H-pad - ((v-min)/span)*(H-2*pad);
  const line = pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.value_eur).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length-1).toFixed(1)},${H-pad} L${x(0).toFixed(1)},${H-pad} Z`;
  return `<svg class="pl-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${area}" fill="var(--or3)"/>
    <path d="${line}" fill="none" stroke="var(--or)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function _eur(v){ return v ? '€'+Number(v).toLocaleString('tr-TR') : '–'; }

function renderPlayerPage(root, pid, p, team, mvals, stats, transfers, clubMap){
  const css = `<style>
    .pl{max-width:920px;margin:0 auto;}
    .pl-hero{position:relative;overflow:hidden;border-radius:18px;padding:24px;margin-bottom:14px;
      background:linear-gradient(135deg,var(--bg2) 0%,var(--bg4) 100%);border:1px solid var(--b1);
      display:flex;gap:20px;align-items:center;}
    .pl-portrait{width:104px;height:104px;flex-shrink:0;border-radius:14px;object-fit:cover;background:var(--bg2);border:1px solid var(--b1);}
    .pl-ph{width:104px;height:104px;flex-shrink:0;border-radius:14px;background:var(--bg2);border:1px solid var(--b1);
      display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-size:38px;font-weight:800;color:var(--tx3);}
    .pl-head{min-width:0;}
    .pl-num{display:inline-block;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;color:var(--or);
      background:var(--or2);border:1px solid rgba(242,100,25,.3);padding:2px 8px;border-radius:20px;margin-bottom:7px;}
    .pl-name{font-family:'Barlow Condensed',sans-serif;font-size:30px;font-weight:800;line-height:1.05;color:var(--tx1);}
    .pl-team{font-size:13px;color:var(--tx2);margin-top:5px;}
    .pl-team b{color:var(--tx1);}
    .pl-team a{color:var(--or);text-decoration:none;cursor:pointer;}.pl-team a:hover{text-decoration:underline;}
    .pl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;}
    .pl-stat{background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:11px 13px;}
    .pl-stat-l{font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--tx3);margin-bottom:5px;}
    .pl-stat-v{font-family:'JetBrains Mono',monospace;font-size:15.5px;font-weight:700;color:var(--tx1);}
    .pl-tabs{display:flex;gap:4px;background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:5px;margin-bottom:14px;position:sticky;top:8px;z-index:5;}
    .pl-tab{flex:1;border:none;background:none;font-family:'Barlow',sans-serif;font-size:14px;font-weight:600;color:var(--tx2);padding:10px 8px;border-radius:8px;cursor:pointer;transition:all .18s;}
    .pl-tab:hover{color:var(--tx1);background:var(--b1);}
    .pl-tab.active{color:#fff;background:var(--or);box-shadow:0 3px 10px var(--or-glow);}
    .pl-panel{display:none;}.pl-panel.active{display:block;animation:tpfade .25s ease;}
    .pl-empty{text-align:center;color:var(--tx3);padding:34px 0;font-size:14px;}
    .pl-card{border:1px solid var(--b1);border-radius:14px;background:var(--bg2);padding:16px;margin-bottom:12px;}
    .pl-card-t{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--tx3);margin-bottom:10px;}
    .pl-mv-now{font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:800;color:var(--tx1);}
    .pl-mv-sub{font-size:12px;color:var(--tx3);margin-top:2px;}
    .pl-spark{width:100%;height:120px;display:block;margin-top:10px;}
    .pl-tbl{width:100%;border-collapse:collapse;font-size:13px;}
    .pl-tbl th{font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--tx3);padding:9px 8px;text-align:center;border-bottom:1px solid var(--b2);background:var(--bg4);}
    .pl-tbl th.l,.pl-tbl td.l{text-align:left;}
    .pl-tbl td{padding:9px 8px;text-align:center;border-bottom:1px solid var(--b1);color:var(--tx2);}
    .pl-tbl tr:last-child td{border-bottom:none;}
    .pl-tbl td.comp{text-align:left;color:var(--tx1);font-weight:600;}
    .pl-tbl td.g{font-family:'JetBrains Mono',monospace;color:var(--tx1);font-weight:700;}
    .pl-tr{display:grid;grid-template-columns:78px 1fr auto;gap:12px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--b1);}
    .pl-tr:last-child{border-bottom:none;}
    .pl-tr-date{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--tx3);}
    .pl-tr-route{font-size:13.5px;color:var(--tx1);}.pl-tr-route .arr{color:var(--tx3);margin:0 7px;}
    .pl-tr-fee{font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:700;color:var(--tx1);white-space:nowrap;}
    @media(max-width:600px){.pl-stats{grid-template-columns:repeat(2,1fr);}.pl-name{font-size:24px;}.pl-portrait,.pl-ph{width:84px;height:84px;}}
  </style>`;

  const pos = p.main_position || p.position || '–';
  const initials = (p.name||'?').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
  const teamLink = team
    ? (team.mac_t_id != null
        ? `<a onclick="goToTeam(${team.mac_t_id},'${(team.name||'').replace(/'/g,"\\'")}',event)">${esc(team.name)}</a>`
        : `<b>${esc(team.name)}</b>`)
    : '–';

  const hero = `<div class="pl-hero">
    ${p.portrait_url ? `<img class="pl-portrait" src="${esc(p.portrait_url)}" onerror="this.outerHTML='<div class=&quot;pl-ph&quot;>${esc(initials)}</div>'" alt="">` : `<div class="pl-ph">${esc(initials)}</div>`}
    <div class="pl-head">
      ${p.shirt_number != null && p.shirt_number !== '' ? `<span class="pl-num">#${esc(p.shirt_number)}</span>` : ''}
      <div class="pl-name">${esc(p.name||'')}</div>
      <div class="pl-team">${teamLink} &nbsp;·&nbsp; ${esc(pos)}</div>
    </div></div>`;

  const statChips = `<div class="pl-stats">
    <div class="pl-stat"><div class="pl-stat-l">Piyasa Değeri</div><div class="pl-stat-v">${_eur(p.market_value_eur)}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Yaş</div><div class="pl-stat-v">${esc(p.age ?? '–')}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Uyruk</div><div class="pl-stat-v" style="font-size:13px">${esc(p.nationality || '–')}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Boy</div><div class="pl-stat-v">${p.height_cm ? esc(p.height_cm)+' cm' : '–'}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Ayak</div><div class="pl-stat-v" style="font-size:13px">${esc(p.foot || '–')}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Mevki</div><div class="pl-stat-v" style="font-size:13px">${esc(pos)}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Doğum</div><div class="pl-stat-v" style="font-size:13px">${p.birth_date ? esc(String(p.birth_date).slice(0,10)) : '–'}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Menajer</div><div class="pl-stat-v" style="font-size:13px">${esc(p.agent || '–')}</div></div>
  </div>`;

  /* GENEL: değer grafiği */
  let mvHtml;
  if (mvals && mvals.length){
    const cur = mvals[mvals.length-1];
    const peak = mvals.reduce((a,b)=>Number(b.value_eur)>Number(a.value_eur)?b:a, mvals[0]);
    mvHtml = `<div class="pl-card">
      <div class="pl-card-t">Piyasa Değeri Gelişimi</div>
      <div class="pl-mv-now">${_eur(cur.value_eur)}</div>
      <div class="pl-mv-sub">Zirve: ${_eur(peak.value_eur)} (${peak.value_date?String(peak.value_date).slice(0,10):'–'}) &nbsp;·&nbsp; ${mvals.length} kayıt</div>
      ${_plSparkline(mvals)}
    </div>`;
  } else {
    mvHtml = `<div class="pl-card"><div class="pl-card-t">Piyasa Değeri Gelişimi</div><div class="pl-empty">Değer geçmişi bulunamadı.</div></div>`;
  }

  let extraHtml = '';
  if (p.youth_clubs){
    extraHtml = `<div class="pl-card"><div class="pl-card-t">Altyapı Kulüpleri</div>
      <div style="font-size:13.5px;color:var(--tx2);line-height:1.6;">${esc(p.youth_clubs)}</div></div>`;
  }

  /* İSTATİSTİK */
  let stHtml;
  if (stats && stats.length){
    const rows = stats.map(s=>`<tr>
      <td class="comp">${esc(s.competition_name || s.competition || '')}</td>
      <td>${esc(s.season_name || s.saison_id || '')}</td>
      <td>${esc(s.games_played ?? '–')}</td>
      <td class="g">${esc(s.goals ?? 0)}</td>
      <td class="g">${esc(s.assists ?? 0)}</td>
      <td>${esc(s.yellow_cards ?? 0)}</td>
      <td>${esc(s.red_cards ?? 0)}</td>
    </tr>`).join('');
    stHtml = `<div class="pl-card"><table class="pl-tbl">
      <thead><tr><th class="l">Turnuva</th><th>Sezon</th><th>O</th><th>G</th><th>A</th><th>🟨</th><th>🟥</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } else {
    stHtml = `<div class="pl-empty">Sezon istatistiği bulunamadı.</div>`;
  }

  /* TRANSFERLER */
  let trHtml;
  if (transfers && transfers.length){
    trHtml = `<div class="pl-card">` + transfers.map(t=>{
      const from = clubMap[t.from_club_id] || (t.from_competition || ('#'+(t.from_club_id??'?')));
      const to   = clubMap[t.to_club_id]   || (t.to_competition   || ('#'+(t.to_club_id??'?')));
      const fee  = t.fee_eur ? _eur(t.fee_eur) : (t.kind ? esc(t.kind) : '–');
      return `<div class="pl-tr">
        <div class="pl-tr-date">${t.transfer_date ? esc(String(t.transfer_date).slice(0,10)) : '–'}</div>
        <div class="pl-tr-route">${esc(from)}<span class="arr">→</span>${esc(to)}</div>
        <div class="pl-tr-fee">${fee}</div>
      </div>`;
    }).join('') + `</div>`;
  } else {
    trHtml = `<div class="pl-empty">Transfer kaydı bulunamadı.</div>`;
  }

  root.innerHTML = css + `<div class="pl">
    ${hero}
    ${statChips}
    <div class="pl-tabs">
      <button class="pl-tab active" onclick="switchPlayerTab('genel',this)">Genel</button>
      <button class="pl-tab" onclick="switchPlayerTab('stats',this)">İstatistik</button>
      <button class="pl-tab" onclick="switchPlayerTab('transfers',this)">Transferler</button>
    </div>
    <div id="pl-genel" class="pl-panel active">${mvHtml}${extraHtml}</div>
    <div id="pl-stats" class="pl-panel">${stHtml}</div>
    <div id="pl-transfers" class="pl-panel">${trHtml}</div>
  </div>`;
}
