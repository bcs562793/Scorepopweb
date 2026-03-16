/* ═══════════════════════════════════════════════
   SCOREPOP — app.js  (v3.8)
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
  sb:          null,
  page:        'live',
  date:        todayStr(),
  league:      'all',
  detail:      null,
  detailLive:  false,
  timer:       null,
  cd:          30,
  cycle:       30,
  allLeagues:  [],
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
  { tier: 1, order: 1,  keywords: ['süper lig', 'super lig', 'trendyol süper'], country: 'turkey' },
  { tier: 1, order: 2,  keywords: ['premier league'], country: 'england' },
  { tier: 1, order: 3,  keywords: ['la liga'], country: 'spain' },
  { tier: 1, order: 4,  keywords: ['serie a'], country: 'italy' },
  { tier: 1, order: 5,  keywords: ['bundesliga'], country: 'germany' },
  { tier: 1, order: 6,  keywords: ['ligue 1'], country: 'france' },
  { tier: 1, order: 7,  keywords: ['primeira liga', 'liga portugal'], country: 'portugal' },
  { tier: 1, order: 8,  keywords: ['eredivisie'], country: 'netherlands' },
  { tier: 1, order: 9,  keywords: ['champions league', 'şampiyonlar ligi'] },
  { tier: 1, order: 10, keywords: ['europa league', 'avrupa ligi'] },
  { tier: 1, order: 11, keywords: ['conference league', 'konferans ligi'] },

  /* ─── TIER 2: ALT LİGLER ─── */
  { tier: 2, order: 1,  keywords: ['1. lig', 'tff 1'], country: 'turkey' },
  { tier: 2, order: 2,  keywords: ['championship'], country: 'england' },
  { tier: 2, order: 3,  keywords: ['la liga 2', 'segunda', 'laliga2'], country: 'spain' },
  { tier: 2, order: 4,  keywords: ['serie b'], country: 'italy' },
  { tier: 2, order: 5,  keywords: ['2. bundesliga'], country: 'germany' },
  { tier: 2, order: 6,  keywords: ['ligue 2'], country: 'france' },
  { tier: 2, order: 7,  keywords: ['league one', 'efl league one'], country: 'england' },
  { tier: 2, order: 8,  keywords: ['league two', 'efl league two'], country: 'england' },
  { tier: 2, order: 9,  keywords: ['2. lig', 'tff 2'], country: 'turkey' },
  { tier: 2, order: 10, keywords: ['3. lig', 'tff 3'], country: 'turkey' },
  { tier: 2, order: 11, keywords: ['jupiler', 'pro league'], country: 'belgium' },
  { tier: 2, order: 12, keywords: ['super league', 'swiss super'], country: 'switzerland' },
  { tier: 2, order: 13, keywords: ['scottish premiership'], country: 'scotland' },
  { tier: 2, order: 14, keywords: ['ekstraklasa'], country: 'poland' },
  { tier: 2, order: 15, keywords: ['süper kupa', 'super cup'] },
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
function _matchLeagueTier(leagueName, country) {
  const lower = (leagueName || '').toLowerCase().trim();
  const lowerCountry = (country || '').toLowerCase().trim();
  for (const entry of LEAGUE_TIERS) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        /* Eğer entry'de country kısıtı varsa ve ülke verisi doluysa, ülke eşleşmeli */
        if (entry.country && lowerCountry && !lowerCountry.includes(entry.country)) continue;
        return { tier: entry.tier, order: entry.order };
      }
    }
  }
  return { tier: 3, order: 999 };  /* Tanımsız → en sona */
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
window.addEventListener('load', async () => {
  /* Watchdog'u durdur */
  window._appStarted = true;
  if (window._watchdog) clearTimeout(window._watchdog);

  S.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
});

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
  const dow = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
  for (let i = -3; i <= 4; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    const s = fmtDate(d);
    const btn = document.createElement('button');
    btn.className = 'dp' + (i === 0 ? ' active' : '');
    const dd = pad2(d.getDate()) + '/' + pad2(d.getMonth()+1);
    const lbl = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : i === -1 ? 'Dün' : dow[d.getDay()];
    btn.innerHTML = `<span class="dp-d">${dd}</span><span class="dp-w">${lbl}</span>`;
    btn.addEventListener('click', () => {
      S.date = s;
      document.querySelectorAll('.dp').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      loadMatches();
    });
    el.appendChild(btn);
  }
  el.style.display = 'none';
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
  const rows = data || [];
  updLiveCt(rows.length);
  if (silent) silentUpdate(rows);
  else        render(rows, true);
}

async function loadToday() {
  _fetchLiveCount();   /* sayaç her zaman güncel kalsın */
  const { data, error } = await S.sb.from('live_matches')
    .select('*')
    .order('league_name');

  if (error) {
    console.error("Maçlar çekilemedi:", error.message);
    return;
  }

  const rows = [];
  (data || []).forEach(r => {
    /* 1. raw_data TEXT kolonu — live_matches saati buraya koyuyor */
    if (r.raw_data) {
      try {
        const parsed = JSON.parse(r.raw_data);
        rows.push(normFix({ ...r, ...parsed }));
        return;
      } catch(e) {}
    }
    /* 2. data JSONB kolonu */
    if (r.data && typeof r.data === 'object') {
      const list = Array.isArray(r.data) ? r.data : [r.data];
      list.forEach(m => rows.push(normFix({ ...r, ...m })));
      return;
    }
    /* 3. Düz satır */
    rows.push(normFix(r));
  });

  render(rows, false);
}

async function loadUpcoming() {
  _fetchLiveCount();   /* sayaç her zaman güncel kalsın */
  const { data, error } = await S.sb
    .from('future_matches')
    .select('*')
    .limit(100);

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
    home_score:   m.goals?.home  ?? m.home_score  ?? null,
    away_score:   m.goals?.away  ?? m.away_score  ?? null,
    status_short: fx?.status?.short   || m.status_short  || 'NS',
    elapsed_time: fx?.status?.elapsed || m.elapsed_time  || null,
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

  return `
    <div class="mr ${st.live ? 'is-live' : ''}" data-id="${m.fixture_id}"
         onclick="openDetail(${m.fixture_id},${st.live})">
      <div class="mr-time">
        <span class="mr-t1 ${st.cls}">${st.label}</span>
        ${st.live ? `<span class="mr-t2"></span>` : ''}
      </div>
      <div class="mr-home">
        <span class="mr-name ${hcls}">${esc(m.home_team||'')}</span>
        <div class="mr-logo-wrap">${hLogo}</div>
      </div>
      <div class="mr-score">
        <div class="${sbCls}">
          <span class="mr-n">${hs}</span>
          ${isNS ? '' : '<div class="mr-sep"></div>'}
          ${isNS ? '' : `<span class="mr-n">${as}</span>`}
        </div>
      </div>
      <div class="mr-away">
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
    ] = await Promise.all([
      sq(S.sb.from('match_events').select('*').eq('fixture_id', id).order('elapsed_time')),
      sq(S.sb.from('match_statistics').select('*').eq('fixture_id', id).maybeSingle()),
      sq(S.sb.from('match_lineups').select('*').eq('fixture_id', id).maybeSingle()),
sq(S.sb.from('match_h2h').select('*')
  .or(`h2h_key.eq.${m.home_team_id}-${m.away_team_id},h2h_key.eq.${m.away_team_id}-${m.home_team_id}`)
  .limit(1)
  .then(r => ({ data: r.data?.[0] ?? null, error: r.error }))
),      sq(S.sb.from('match_predictions').select('*').eq('fixture_id', id).maybeSingle()),
    ]);

    buildDetail(m, evs||[], stats, lus, h2h, pred);
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
  wrap.style.opacity  = '1';
  wrap.style.overflow = 'hidden';

  iframe.style.width           = NATIVE_W + 'px';
  iframe.style.height          = NATIVE_H + 'px';
  iframe.style.transformOrigin = '0 0';
  iframe.style.transform       = 'scale(' + scale + ')';
}

 function _scheduleVisualScale() {
  [50, 200, 600, 1500].forEach(function(ms) { setTimeout(scaleVisualIframe, ms); });
}

function buildDetail(m, evs, stats, lus, h2h, pred) {
  const st = statusInfo(m);
  const hs = m.home_score ?? '-', as = m.away_score ?? '-';

  try {
    if (typeof Router !== 'undefined') {
      Router.goMatch(m.fixture_id, m.home_team, m.away_team);
      Router.setMatchMeta(m.home_team, m.away_team, m.home_score, m.away_score, m.league_name);
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
      <div class="d-tab" onclick="switchTab('lu',this)">Kadro</div>
      <div class="d-tab" onclick="switchTab('h2',this)">H2H</div>
      <div class="d-tab" onclick="switchTab('fr',this)">Forum</div>
    </div>`;

  html += `<div class="d-panel active" id="d-ev">`;
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
  rows.forEach(m => {
    const row = document.querySelector(`.mr[data-id="${m.fixture_id}"]`);
    if (!row) return;
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
    .select('home_score,away_score,elapsed_time,status_short')
    .eq('fixture_id', S.detail)
    .maybeSingle();
  if (!data) return;
  const st = statusInfo(data);
  const nums = document.querySelectorAll('.d-score-n');
  if (nums[0]) nums[0].textContent = data.home_score ?? '-';
  if (nums[1]) nums[1].textContent = data.away_score ?? '-';
  const ste = document.querySelector('.d-status');
  if (ste) ste.textContent = st.live ? `⚡ ${st.label}` : st.label;
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
        return;
      }

      /* Liste görünümü — sadece bu satırı güncelle, sayfayı yenileme */
      if (payload.eventType === 'INSERT') {
        /* Yeni maç geldi — listeye ekle */
        loadMatches(true);
      } else {
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
