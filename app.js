/* ═══════════════════════════════════════════════
   SCOREPOP — app.js  (v7.2 — Arşiv Desteği)
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
};

/* ── LİG ÖNCELİK SİSTEMİ ───────────────────── */
/*
   tier 1 = Üst ligler (sıralı)
   tier 2 = Alt ligler (sıralı)
   Eşleşme: league_name içinde keyword geçiyorsa eşleşir.
   Aynı tier içinde order küçük olan önce gelir.
*/
const LEAGUE_TIERS = [
  /* ─── TIER 0: BÜYÜK ULUSLARARASI TURNUVALAR (HER ZAMAN EN ÜSTTE) ─── */
  { tier: 0, order: 1,  keywords: ['world cup', 'dünya kupası', 'fifa world cup', 'wc qualifier', 'world cup qualifier', 'dünya kupası eleme', 'coupe du monde', 'weltmeisterschaft'] },
  { tier: 0, order: 2,  keywords: ['euro 2024', 'euro 2025', 'euro 2026', 'euro 2027', 'avrupa şampiyonası', 'uefa european championship', 'european championship qualifier', 'euro qualifier', 'avrupa şampiyonası eleme', 'uefa euro'] },
  { tier: 0, order: 3,  keywords: ['nations league', 'uluslar ligi', 'uefa nations', 'league a', 'league b', 'league c', 'league d'] },
  { tier: 0, order: 4,  keywords: ['copa america', 'copa américa', 'conmebol', 'south america championship'] },
  { tier: 0, order: 5,  keywords: ['africa cup', 'afcon', 'can 20', 'africa nations'] },
  { tier: 0, order: 6,  keywords: ['asian cup', 'afc asian cup', 'asya kupası', 'asian championship'] },
  { tier: 0, order: 7,  keywords: ['gold cup', 'concacaf gold', 'concacaf championship'] },

  /* ─── TIER 1: ÜST LİGLER (ülke önceliğiyle) ─── */
  /* 1. Türkiye */
  { tier: 1, order: 1,  keywords: ['süper lig', 'super lig', 'trendyol süper', 'türkiye 1.', 'spor toto süper'], country: 'turkey' },
  /* 2. İngiltere */
  { tier: 1, order: 2,  keywords: ['premier league', 'ingiltere premier', 'england premier', 'premier lig'], country: 'england' },
  /* 3. İspanya */
  { tier: 1, order: 3,  keywords: ['la liga', 'laliga', 'ispanya 1.', 'primera división', 'primera division'], country: 'spain' },
  /* 4. Almanya */
  { tier: 1, order: 4,  keywords: ['bundesliga', 'almanya 1.', '1. bundesliga'], country: 'germany' },
  /* 5. Fransa */
  { tier: 1, order: 5,  keywords: ['ligue 1', 'fransa 1.', 'ligue 1 mcdonald'], country: 'france' },
  /* 6. İtalya */
  { tier: 1, order: 6,  keywords: ['serie a', 'italya 1.', 'serie a tim'], country: 'italy' },
  /* 7. Portekiz */
  { tier: 1, order: 7,  keywords: ['primeira liga', 'liga portugal', 'portekiz 1.', 'liga nos'], country: 'portugal' },
  /* 8. Hollanda */
  { tier: 1, order: 8,  keywords: ['eredivisie', 'hollanda 1.', 'netherlands 1.'], country: 'netherlands' },
  /* 9. Belçika */
  { tier: 1, order: 9,  keywords: ['jupiler', 'pro league', 'belgian pro', 'belçika 1.', 'first division a'], country: 'belgium' },
  /* 10. Çekya */
  { tier: 1, order: 10, keywords: ['chance liga', '1. liga', 'czech 1.', 'çekya 1.', 'fortuna liga'], country: 'czech' },
  /* 11. İskoçya */
  { tier: 1, order: 11, keywords: ['scottish premiership', 'scotland premier', 'premiership scotland'], country: 'scotland' },
  /* 12. İsviçre */
  { tier: 1, order: 12, keywords: ['super league', 'swiss super', 'swiss league'], country: 'switzerland' },
  /* 13. Avusturya */
  { tier: 1, order: 13, keywords: ['bundesliga', 'austrian bundesliga', 'admiral bundesliga', 'avusturya 1.', 'österreichische'], country: 'austria' },
  /* 14. Norveç */
  { tier: 1, order: 14, keywords: ['eliteserien', 'norveç 1.', 'norway 1.'], country: 'norway' },
  /* 15. Yunanistan */
  { tier: 1, order: 15, keywords: ['super league', 'yunanistan 1.', 'greek super', 'super league 1', 'super league greece'], country: 'greece' },
  /* 16. Danimarka */
  { tier: 1, order: 16, keywords: ['superliga', 'danimarka 1.', 'danish superliga'], country: 'denmark' },
  /* 17. İsrail */
  { tier: 1, order: 17, keywords: ['premier league', 'ligat ha\'al', 'israel premier', 'israeli premier'], country: 'israel' },
  /* 18. Ukrayna */
  { tier: 1, order: 18, keywords: ['premier league', 'ukrainian premier', 'ukrayna premier', 'upl'], country: 'ukraine' },
  /* 19. Sırbistan */
  { tier: 1, order: 19, keywords: ['superliga', 'srpska superliga', 'serbia superliga', 'super liga'], country: 'serbia' },
  /* 20. Hırvatistan */
  { tier: 1, order: 20, keywords: ['hnl', 'hrvatska nogometna', 'croatian football', 'supersport hnl'], country: 'croatia' },
  /* 21. Polonya */
  { tier: 1, order: 21, keywords: ['ekstraklasa', 'polish ekstraklasa'], country: 'poland' },
  /* 22. Kıbrıs */
  { tier: 1, order: 22, keywords: ['premier league', 'cyprus first', 'cyta championship', 'cyprus championship', 'first division'], country: 'cyprus' },
  /* 23. Macaristan */
  { tier: 1, order: 23, keywords: ['nemzeti bajnokság', 'nb i', 'otp bank liga', 'hungarian nb'], country: 'hungary' },
  /* 24. İsveç */
  { tier: 1, order: 24, keywords: ['allsvenskan', 'swedish allsvenskan'], country: 'sweden' },
  /* 25. Romanya */
  { tier: 1, order: 25, keywords: ['liga i', 'liga 1', 'superliga', 'romanian liga'], country: 'romania' },

  /* Avrupa Kulüp Kupaları — ülke liglerinden sonra */
  { tier: 1, order: 90, keywords: ['champions league', 'şampiyonlar ligi', 'ucl'] },
  { tier: 1, order: 91, keywords: ['europa league', 'avrupa ligi', 'uel'] },
  { tier: 1, order: 92, keywords: ['conference league', 'konferans ligi', 'uecl'] },

  /* ─── TIER 2: 2. LİGLER (aynı ülke sıralamasıyla) ─── */
  { tier: 2, order: 1,  keywords: ['1. lig', 'tff 1', 'türkiye 2.'], country: 'turkey' },
  { tier: 2, order: 2,  keywords: ['championship', 'ingiltere 2.', 'efl championship'], country: 'england' },
  { tier: 2, order: 3,  keywords: ['la liga 2', 'segunda', 'laliga2', 'ispanya 2.'], country: 'spain' },
  { tier: 2, order: 4,  keywords: ['2. bundesliga', 'almanya 2.'], country: 'germany' },
  { tier: 2, order: 5,  keywords: ['ligue 2', 'fransa 2.'], country: 'france' },
  { tier: 2, order: 6,  keywords: ['serie b', 'italya 2.'], country: 'italy' },
  { tier: 2, order: 7,  keywords: ['portekiz 2.', 'liga sabseg', 'segunda liga'], country: 'portugal' },
  { tier: 2, order: 8,  keywords: ['eerste divisie', 'hollanda 2.', 'keuken kampioen'], country: 'netherlands' },
  { tier: 2, order: 9,  keywords: ['proximus league', 'first division b', 'belçika 2.', 'belgian 2.'], country: 'belgium' },
  { tier: 2, order: 10, keywords: ['czech 2.', 'çekya 2.', 'fnl czech'], country: 'czech' },
  { tier: 2, order: 11, keywords: ['scottish championship', 'championship scotland'], country: 'scotland' },
  { tier: 2, order: 12, keywords: ['challenge league', 'swiss challenge'], country: 'switzerland' },
  { tier: 2, order: 13, keywords: ['2. liga', 'austrian 2.', 'avusturya 2.'], country: 'austria' },
  { tier: 2, order: 14, keywords: ['obos-ligaen', '1. divisjon', 'norveç 2.'], country: 'norway' },
  { tier: 2, order: 15, keywords: ['super league 2', 'yunanistan 2.', 'greek 2.'], country: 'greece' },
  { tier: 2, order: 16, keywords: ['1. division', 'danimarka 2.'], country: 'denmark' },
  { tier: 2, order: 17, keywords: ['liga leumit', 'israeli national', 'leumit'], country: 'israel' },
  { tier: 2, order: 18, keywords: ['persha liha', 'ukrayna 2.'], country: 'ukraine' },
  { tier: 2, order: 19, keywords: ['prva liga srbije', 'sırbistan 2.'], country: 'serbia' },
  { tier: 2, order: 20, keywords: ['hnl 2', 'hırvatistan 2.', 'prva nl'], country: 'croatia' },
  { tier: 2, order: 21, keywords: ['i liga', 'polonya 2.', 'polish i liga'], country: 'poland' },
  { tier: 2, order: 22, keywords: ['cyprus 2.', 'kıbrıs 2.', 'cyprus second'], country: 'cyprus' },
  { tier: 2, order: 23, keywords: ['nb ii', 'macaristan 2.', 'hungarian nb ii'], country: 'hungary' },
  { tier: 2, order: 24, keywords: ['superettan', 'isveç 2.', 'swedish superettan'], country: 'sweden' },
  { tier: 2, order: 25, keywords: ['liga ii', 'romanya 2.', 'romanian liga ii'], country: 'romania' },

  /* İngiltere alt ligler */
  { tier: 2, order: 30, keywords: ['league one', 'efl league one'], country: 'england' },
  { tier: 2, order: 31, keywords: ['league two', 'efl league two'], country: 'england' },
  /* Türkiye alt ligler */
  { tier: 2, order: 32, keywords: ['2. lig', 'tff 2'], country: 'turkey' },
  { tier: 2, order: 33, keywords: ['3. lig', 'tff 3'], country: 'turkey' },
  /* Süper Kupa */
  { tier: 2, order: 99, keywords: ['süper kupa', 'super cup'] },
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
  'İsviçre':   'switzerland',
  'iskocya':   'scotland',
  'İskoçya':   'scotland',
  'polonya':   'poland',
  'çekya':     'czech',
  'çek cumhuriyeti': 'czech',
  'avusturya': 'austria',
  'norveç':    'norway',
  'yunanistan':'greece',
  'danimarka': 'denmark',
  'İsrail':    'israel',
  'israil':    'israel',
  'ukrayna':   'ukraine',
  'sırbistan': 'serbia',
  'hırvatistan':'croatia',
  'kıbrıs':   'cyprus',
  'macaristan':'hungary',
  'İsveç':     'sweden',
  'isveç':     'sweden',
  'romanya':   'romania',
};

/* --- YENİ: Türkçe karakterleri güvenle küçültme yardımcısı --- */
function _toLowerTr(str) {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .trim();
}

function _normalizeCountry(country) {
  const lower = _toLowerTr(country);
  return COUNTRY_TR_MAP[lower] || lower;   /* Türkçe → İngilizce, yoksa olduğu gibi */
}

/*  Lig adından { tier, order } döndür — ülke filtresi destekler  */
function _extractCountryFromName(leagueName) {
  const lower = _toLowerTr(leagueName);

  /* Türkçe ülke adları — COUNTRY_TR_MAP + ek ülkeler */
  const TR_EXTRA = {
    ...COUNTRY_TR_MAP,
    'arjantin':'argentina','brezilya':'brazil','meksika':'mexico',
    'abd':'usa','kanada':'canada','avustralya':'australia',
    'japonya':'japan','cin':'china','rusya':'russia',
    'bahreyn':'bahrain','suudi':'saudi','katar':'qatar',
    'misir':'egypt','fas':'morocco','nijerya':'nigeria',
    'gambiya':'gambia','ruanda':'rwanda','burkina':'burkina',
    'bosna':'bosnia','karadag':'montenegro','faroe':'faroe',
    'irak':'iraq','umman':'oman','urdun':'jordan',
    'kolombiya':'colombia','sili':'chile','uruguay':'uruguay',
    'peru':'peru','venezuela':'venezuela','ekvador':'ecuador',
    'bolivya':'bolivia','paraguay':'paraguay','angola':'angola',
    'kenya':'kenya','bulgaristan':'bulgaria','moldova':'moldova',
    'slovakya':'slovakia','slovenya':'slovenia','arnavutluk':'albania',
    'makedonya':'northmacedonia','ermenistan':'armenia',
    'gurcistan':'georgia','azerbaycan':'azerbaijan',
    'kazakistan':'kazakhstan','belarus':'belarus',
    'litvanya':'lithuania','letonya':'latvia','estonya':'estonia',
    'finlandiya':'finland','luksemburg':'luxembourg','malta':'malta',
    'bae':'uae','hindistan':'india','endonezya':'indonesia',
    'tayland':'thailand','vietnam':'vietnam','malezya':'malaysia',
    'gana':'ghana','kamerun':'cameroon','senegal':'senegal',
    'fildisi':'cotedivoire','zimbabve':'zimbabwe','zambia':'zambia',
    'tunisia':'tunisia','tunus':'tunisia','cezayir':'algeria',
    'libya':'libya','sudan':'sudan','etyopya':'ethiopia',
    'tanzanya':'tanzania','kongo':'congo','mozambik':'mozambique',
    'madagaskar':'madagascar','mali':'mali','niger':'niger',
  };

  for (const [trName, enName] of Object.entries(TR_EXTRA)) {
    const trLower = _toLowerTr(trName);
    if (trLower.length >= 3 && lower.includes(trLower)) return enName;
  }

  /* İngilizce ülke adları */
  const EN_NAMES = [
    'turkey','england','spain','italy','germany','france','portugal',
    'netherlands','belgium','scotland','switzerland','austria','norway',
    'greece','denmark','israel','ukraine','serbia','croatia','poland',
    'cyprus','hungary','sweden','romania','czech','argentina','brazil',
    'mexico','usa','canada','australia','japan','china','russia',
    'bahrain','saudi','qatar','egypt','morocco','nigeria','gambia',
    'rwanda','burkina','bosnia','montenegro','faroe','iraq','oman',
    'jordan','colombia','chile','uruguay','peru','venezuela','ecuador',
    'bolivia','paraguay','angola','kenya','bulgaria','moldova',
    'slovakia','slovenia','albania','macedonia','armenia','georgia',
    'azerbaijan','kazakhstan','belarus','lithuania','latvia','estonia',
    'finland','luxembourg','malta','uae','india','indonesia',
    'thailand','vietnam','malaysia','ghana','cameroon','senegal',
    'zimbabwe','zambia','tunisia','algeria','libya','sudan',
    'ethiopia','congo','mozambique','madagascar','mali','niger',
    'singapore','philippines','myanmar','cambodia','laos',
    'afghanistan','pakistan','bangladesh','nepal','srilanka',
    'iran','syria','lebanon','kuwait','yemen','libya',
  ];

  for (const en of EN_NAMES) {
    if (lower.includes(en)) return en;
  }

  return null;
}

/* Lig adından { tier, order } döndür — ülke filtresi destekler  */
function _matchLeagueTier(leagueName, country) {
  const lower        = _toLowerTr(leagueName);
  const lowerCountry = _normalizeCountry(country);
  const extracted    = _extractCountryFromName(leagueName);

  for (const entry of LEAGUE_TIERS) {
    for (const kw of entry.keywords) {
      if (!lower.includes(kw)) continue;

      /* 1. Ülke bağımsız bir turnuvaysa (Şampiyonlar Ligi vb.) direkt eşleşir */
      if (!entry.country) return { tier: entry.tier, order: entry.order };

      /* 2. API'den gelen ülke verisi varsa, eşleşmek ZORUNDA */
      if (lowerCountry) {
        if (lowerCountry.includes(entry.country)) {
          return { tier: entry.tier, order: entry.order };
        }
        continue; /* Ülke tutmadıysa diğer keyword/lige geç (Örn: Mısır -> İngiltere'yi atlar) */
      }

      /* 3. API'de ülke yok ama lig adından ülke (mısır, arjantin vb.) çıkarabildiysek, eşleşmek ZORUNDA */
      if (extracted) {
        if (extracted === entry.country) {
          return { tier: entry.tier, order: entry.order };
        }
        continue; /* Çıkarılan ülke tutmadıysa geç */
      }

      /* 4. Hem ülke boş hem de isimden ülke çıkarılamadıysa (Örn: Sadece "Premier League" yazıyorsa)
         Eski kod burada direkt ilk bulduğuna (İngiltere) atıyordu, bu da Mısır/Bahreyn gibi
         ülkesi boş gelen ligleri İngiltere Tier 1 yapıyordu.
         Artık sadece keyword içinde bizzat ülke adı geçiyorsa eşleştiriyoruz. */
      const trCountry = Object.keys(COUNTRY_TR_MAP).find(k => COUNTRY_TR_MAP[k] === entry.country);
      if (kw.includes(entry.country) || (trCountry && kw.includes(trCountry))) {
        return { tier: entry.tier, order: entry.order };
      }
    }
  }
  return { tier: 3, order: 999 };
}

/* Grup sıralama anahtarı: favori(0/1) → tier → order → alfabe  */
function _leagueSortKey(group) {
  const fav = isFavLeague(group.name) ? 0 : 1;
  const { tier, order } = _matchLeagueTier(group.name, group.country);
  return { fav, tier, order, name: _toLowerTr(group.name) };
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
    .limit(120);
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

  // fixture_id bazlı dedupe — Set yerine Map kullanarak verileri birleştireceğiz
  const matchesMap = new Map();

  // Tekil maçı Map'e ekleyen veya eksik verisini güncelleyen yardımcı fonksiyon
  function processNorm(norm) {
    if (!norm.fixture_id) return;

    if (!matchesMap.has(norm.fixture_id)) {
      matchesMap.set(norm.fixture_id, norm);
    } else {
      // Maç zaten live_matches'ten eklenmişse, eksik verilerini (saat, ülke, logo) future_matches'ten yamala
      const existing = matchesMap.get(norm.fixture_id);
      
      if (!existing.kickoff_time && norm.kickoff_time) existing.kickoff_time = norm.kickoff_time;
      
      // ▼ YENİ: Sıralama ve görsellik için eksik ülke/lig bilgilerini de tamamla ▼
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
        const list2 = Array.isArray(r.data) ? r.data : [r.data];
        list2.forEach(m => {
          processNorm(normFix({ ...r, ...m }));
        });
        return;
      }
      processNorm(normFix(r));
    });
  }

  // Önce live_matches (öncelikli), sonra future_matches (ek NS maçlar)
  parseRows(liveRes.data);
  parseRows(futureRes.data);

  // Map'in içindeki birleştirilmiş değerleri Diziye (Array) çevir
  const rows = Array.from(matchesMap.values());
  render(rows, false);
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
    raw_data:     m.raw_data   || null,   /* venue + referee için buildDetail'e gerekli */
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
      const matchDate = (m.kickoff_time || m.date || S.date || '').slice(0,10);
      const gzOdds = await fetchGzOdds(matchDate, m.home_team, m.away_team);
      buildDetail(m, evs, stats, lus, h2h, null, gzOdds);
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

    const [
  { data: evs  },
  { data: stats },
  { data: lus  },
  { data: pred },
  { data: dbOdds },  // ← EKLENMELİ    
] = await Promise.all([
  sq(S.sb.from('match_events').select('*').eq('fixture_id', id).order('elapsed_time')),
  sq(S.sb.from('match_statistics').select('*').eq('fixture_id', id).maybeSingle()),
  sq(S.sb.from('match_lineups').select('*').eq('fixture_id', id).maybeSingle()),
  sq(S.sb.from('match_predictions').select('*').eq('fixture_id', id).maybeSingle()),
  sq(S.sb.from('match_odds').select('*').eq('fixture_id', id).maybeSingle()) // <-- EKSİK OLAN SORGUNU BURAYA EKLE
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
       buildDetail(m, evs||[], stats, lus, h2h, pred, dbOdds || null);
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
  const ch = v => v === 1 ? 'yükseldi' : v === -1 ? 'düştü' : 'sabit';
  const dirMap = { '1': 'Ev sahibi', '2': 'Deplasman', 'X': 'Beraberlik' };

  let ms = '';
  if (ch1 === -1 && chx === 1 && ch2 === 1) {
    ms = 'Ev sahibi oranı düşerken rakipler yükseliyor — piyasa evi açık favori görüyor.';
  } else if (ch1 === 1 && chx === 1 && ch2 === -1) {
    ms = 'Deplasman oranı düşerken rakipler yükseliyor — piyasa deplasmanı favori görüyor.';
  } else if (chx === 1 && ch1 !== 1 && ch2 !== 1) {
    ms = 'Beraberlik uzaklaşıyor — piyasa sonucun açık olacağını öngörüyor.';
  } else if (chx === -1 && ch1 !== -1 && ch2 !== -1) {
    ms = 'Beraberlik yaklaşıyor — piyasa sıkışık, düşük tempolu maç bekliyor.';
  } else if (ch1 === 0 && chx === 1 && ch2 === -1) {
    ms = 'Deplasman güçleniyor, beraberlik uzaklaşıyor — açık maç beklentisi var.';
  } else {
    ms = `${dirMap[winner]} tarafında anlamlı hareket var.`;
  }

  const golNote = ou25Delta >= 5
    ? ` Benzer kombinasyonlarda gol sayısı ortalamanın üzerinde (%${+(51.7+ou25Delta).toFixed(0)} üst25).`
    : ou25Delta <= -5
    ? ` Benzer kombinasyonlarda gol sayısı ortalamanın altında (%${+(51.7+ou25Delta).toFixed(0)} üst25).`
    : '';

  return `${ms}${golNote} Bu sinyal <strong>${n.toLocaleString('tr-TR')} maçlık</strong> geçmiş veriye dayanıyor.`;
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
        <button class="sim-btn" onclick="runSimAnalysisV2(${fixtureId}, ${mac1x2Json}, ${curOu25Json})">
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
      <button class="sim-btn" onclick="runSimAnalysisV2(${fixtureId}, ${mac1x2Json}, ${curOu25Json})">
        🔍 Geçmiş Maçları Tara — Detaylı Analiz
      </button>
      <div class="sim-result" id="sim-result-${fixtureId}"></div>
    </div>`;
}

/* ─────────────────────────────────────────────────────────────────────
   4. DETAYLI BENZERLİK ANALİZİ — runSimAnalysisV2
   
   cur1x2: Mackolik fiyatları { home, draw, away }
   curOu25: { under, over }
   
   Filtre sırası (kademeli, TARGET 5-30 maç):
     0. Sofascore change combo (varsa)
     1. MS oranı ±0.20→0.05 (Mackolik)
     2. 2.5 Alt/Üst ±0.15→0.05
     3. KG Var varlık filtresi
     4. Ev1.5 / Dep1.5 (türetilmiş beklenti)
───────────────────────────────────────────────────────────────────── */
async function runSimAnalysisV2(fixtureId, cur1x2, curOu25) {
  const resultEl = document.getElementById(`sim-result-${fixtureId}`);
  if (!resultEl) return;

  resultEl.innerHTML = '<div class="sim-loading">⏳ Benzer maçlar aranıyor…</div>';

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

  /* Mackolik market değeri */
  const getMac = (m, mktName, outName) => {
    for (const mk of (m.mackolik_markets || [])) {
      if (mk.market_name === mktName) {
        const oc = (mk.outcomes || []).find(o => o.name === outName);
        return oc?.odds ?? null;
      }
    }
    return null;
  };

  /* Sofascore 1X2 change hareketi */
  const getSofaChange = m => {
    for (const sm of (m.sofascore_markets || [])) {
      if (sm.market_group === '1X2' || sm.market_name === 'Full time' || sm.market_name === '1X2') {
        const cm = {};
        for (const c of (sm.choices || [])) cm[c.name] = c;
        if (cm['1'] !== undefined && cm['X'] !== undefined && cm['2'] !== undefined) {
          return { '1': cm['1'].change ?? 0, 'X': cm['X'].change ?? 0, '2': cm['2'].change ?? 0 };
        }
      }
    }
    return null;
  };

  const ok = (val, ref, tol) => val != null && ref != null && Math.abs(val - ref) <= tol;

  /* ── Mevcut maç parametreleri ── */
  /* cur1x2: { home, draw, away } — Mackolik kapanış fiyatları */
  const mac1  = cur1x2?.home ?? null;
  const macX  = cur1x2?.draw ?? null;
  const mac2  = cur1x2?.away ?? null;
  const macU  = curOu25?.under ?? null;
  const macO  = curOu25?.over  ?? null;

  /* Ev/Dep 1.5 Üst beklentisi — MS oranından tahmin */
  const expEv15  = mac1 != null ? (mac1 < 1.70 ? 1.35 : mac1 < 2.00 ? 1.50 : mac1 < 2.50 ? 1.70 : 1.90) : null;
  const expDep15 = mac2 != null ? (mac2 < 2.00 ? 1.80 : mac2 < 2.50 ? 1.60 : mac2 < 3.00 ? 1.45 : 1.30) : null;

  /* ── Filtre havuzu ── */
  const TARGET_MIN = 5;
  const TARGET_MAX = 30;
  const MAX_STEPS  = 40;

  const FILTERS = [

    /* 0. Sofascore change combo — arşiv maçının kendi change'ini kontrol et */
    /* cur1x2'de change alanları yoktur (Mackolik fiyatı), bu filtre arşivde sofascore'dan okur */
    /* Gelecekte sofa_1x2 geçirilirse burası aktif olur — şimdilik skip */
    /* { id:'Combo', skip: true, ... } */

    /* 1. MS oranı — 6 kademe */
    {
      id: 'MS', skip: mac1 == null,
      levels: [
        { tol: 0.20, label: 'MS±0.20' },
        { tol: 0.15, label: 'MS±0.15' },
        { tol: 0.10, label: 'MS±0.10' },
        { tol: 0.07, label: 'MS±0.07' },
        { tol: 0.05, label: 'MS±0.05' },
        { tol: 0.03, label: 'MS±0.03' },
      ],
      fn: (arr, tol) => arr.filter(m =>
        ok(getMac(m,'Maç Sonucu','1'), mac1, tol) &&
        ok(getMac(m,'Maç Sonucu','X'), macX, tol) &&
        ok(getMac(m,'Maç Sonucu','2'), mac2, tol)
      ),
    },

    /* 2. 2.5 Alt/Üst */
    {
      id: '2.5AÜ', skip: macO == null,
      levels: [
        { tol: 0.15, label: '2.5AÜ±0.15' },
        { tol: 0.10, label: '2.5AÜ±0.10' },
        { tol: 0.07, label: '2.5AÜ±0.07' },
        { tol: 0.05, label: '2.5AÜ±0.05' },
      ],
      fn: (arr, tol) => arr.filter(m =>
        ok(getMac(m,'2,5 Alt/Üst','Alt'), macU, tol) &&
        ok(getMac(m,'2,5 Alt/Üst','Üst'), macO, tol)
      ),
    },

    /* 3. KG Var varlık filtresi */
    {
      id: 'KG', skip: false,
      levels: [{ tol: 999, label: 'KG varlık' }],
      fn: arr => arr.filter(m => getMac(m,'Karşılıklı Gol','Var') != null),
    },

    /* 4. Ev 1.5 Üst */
    {
      id: 'Ev1.5', skip: expEv15 == null,
      levels: [
        { tol: 0.25, label: 'Ev1.5±0.25' },
        { tol: 0.18, label: 'Ev1.5±0.18' },
        { tol: 0.12, label: 'Ev1.5±0.12' },
      ],
      fn: (arr, tol) => arr.filter(m => ok(getMac(m,'Evsahibi 1,5 Alt/Üst','Alt'), expEv15, tol)),
    },

    /* 5. Dep 1.5 Üst */
    {
      id: 'Dep1.5', skip: expDep15 == null,
      levels: [
        { tol: 0.30, label: 'Dep1.5±0.30' },
        { tol: 0.20, label: 'Dep1.5±0.20' },
        { tol: 0.12, label: 'Dep1.5±0.12' },
      ],
      fn: (arr, tol) => arr.filter(m => ok(getMac(m,'Deplasman 1,5 Alt/Üst','Alt'), expDep15, tol)),
    },

  ].filter(f => !f.skip);

  /* ── Başlangıç: sonucu olan maçlar ── */
  let matches = all.filter(m => getResult(m) !== null);

  const lvlIdx  = Object.fromEntries(FILTERS.map(f => [f.id, 0]));
  const applied = {};
  let step = 0;

  while (matches.length > TARGET_MAX && step < MAX_STEPS) {
    step++;
    let bestFilter = null, bestResult = null, bestScore = Infinity;

    for (const flt of FILTERS) {
      const idx = lvlIdx[flt.id];
      if (idx >= flt.levels.length) continue;
      let narrowed;
      try { narrowed = flt.fn(matches, flt.levels[idx].tol); } catch { continue; }
      if (narrowed.length < TARGET_MIN) continue;
      const score = narrowed.length <= TARGET_MAX ? 0 : narrowed.length - TARGET_MAX;
      const better = score < bestScore || (score === bestScore && bestResult && narrowed.length < bestResult.length);
      if (better) { bestScore = score; bestResult = narrowed; bestFilter = flt; }
    }

    if (!bestFilter) break;
    const lvl = bestFilter.levels[lvlIdx[bestFilter.id]];
    applied[bestFilter.id] = lvl.label;
    lvlIdx[bestFilter.id]++;
    matches = bestResult;
    if (matches.length <= TARGET_MAX) break;
  }

  /* ── İstatistik ── */
  const total = matches.length;
  if (total < 3) {
    resultEl.innerHTML = '<div class="sim-empty">🔍 Yeterli benzer maç bulunamadı (min. 3)</div>';
    return;
  }

  const cnt = { '1':0, 'X':0, '2':0 };
  let o15 = 0, o25 = 0, o35 = 0, kg = 0;
  matches.forEach(m => {
    const r = getResult(m); if (!r) return;
    cnt[r]++;
    const tg = (m.home_score ?? 0) + (m.away_score ?? 0);
    if (tg > 1.5) o15++;
    if (tg > 2.5) o25++;
    if (tg > 3.5) o35++;
    if (m.home_score > 0 && m.away_score > 0) kg++;
  });

  /* ── Render ── */
  const pct  = (n, t) => t > 0 ? Math.round(n / t * 100) : 0;
  const bar  = (n, t, cls) => {
    const w = pct(n, t);
    return `<div class="sim-bar-wrap"><div class="sim-bar ${cls}" style="width:${w}%"></div><span>${n} (%${w})</span></div>`;
  };
  const dSign = (v, base) => {
    const d = +(v - base).toFixed(1);
    return d > 0 ? `<span class="delta-pos">+${d}%</span>` : d < 0 ? `<span class="delta-neg">${d}%</span>` : '';
  };

  const filterLabel = Object.values(applied).join(' + ') || 'Genel';

  resultEl.innerHTML = `
    <div class="sim-card">
      <div class="sim-header">
        <span class="sim-count">${total} Benzer Maç</span>
        <span class="sim-filter" title="${filterLabel}">✅ ${filterLabel}</span>
      </div>
      <div class="sim-results">
        <div class="sim-col">
          <div class="sim-col-lbl">🏠 Ev</div>
          ${bar(cnt['1'], total, 'bar-1')}
          <div style="font-size:10px;color:var(--tx2)">baza %${SP_BASE.p1.toFixed(0)} ${dSign(pct(cnt['1'],total), SP_BASE.p1)}</div>
        </div>
        <div class="sim-col">
          <div class="sim-col-lbl">🤝 Ber</div>
          ${bar(cnt['X'], total, 'bar-x')}
          <div style="font-size:10px;color:var(--tx2)">baza %${SP_BASE.px.toFixed(0)} ${dSign(pct(cnt['X'],total), SP_BASE.px)}</div>
        </div>
        <div class="sim-col">
          <div class="sim-col-lbl">✈️ Dep</div>
          ${bar(cnt['2'], total, 'bar-2')}
          <div style="font-size:10px;color:var(--tx2)">baza %${SP_BASE.p2.toFixed(0)} ${dSign(pct(cnt['2'],total), SP_BASE.p2)}</div>
        </div>
      </div>
      <div class="sim-market-grid" style="padding:8px 12px 12px;">
        <div class="sim-mkt-block">
          <div class="sim-mkt-block-title">Alt / Üst</div>
          <div class="sim-mkt-row"><span class="sim-mkt-label">1.5 Üst</span><span class="sim-mkt-val">%${pct(o15,total)} ${dSign(pct(o15,total),74.3)}</span></div>
          <div class="sim-mkt-bar-wrap"><div class="sim-mkt-bar bar-blue" style="width:${pct(o15,total)}%"></div></div>
          <div class="sim-mkt-row" style="margin-top:6px"><span class="sim-mkt-label">2.5 Üst</span><span class="sim-mkt-val">%${pct(o25,total)} ${dSign(pct(o25,total),SP_BASE.ou25)}</span></div>
          <div class="sim-mkt-bar-wrap"><div class="sim-mkt-bar bar-blue" style="width:${pct(o25,total)}%"></div></div>
          <div class="sim-mkt-row" style="margin-top:6px"><span class="sim-mkt-label">3.5 Üst</span><span class="sim-mkt-val">%${pct(o35,total)} ${dSign(pct(o35,total),SP_BASE.ou35)}</span></div>
          <div class="sim-mkt-bar-wrap"><div class="sim-mkt-bar bar-blue" style="width:${pct(o35,total)}%"></div></div>
        </div>
        <div class="sim-mkt-block">
          <div class="sim-mkt-block-title">Karşılıklı Gol</div>
          <div class="sim-mkt-row"><span class="sim-mkt-label">KG Var</span><span class="sim-mkt-val">%${pct(kg,total)} ${dSign(pct(kg,total),SP_BASE.kg)}</span></div>
          <div class="sim-mkt-bar-wrap"><div class="sim-mkt-bar bar-green" style="width:${pct(kg,total)}%"></div></div>
          <div class="sim-mkt-row" style="margin-top:6px"><span class="sim-mkt-label">KG Yok</span><span class="sim-mkt-val">%${pct(total-kg,total)}</span></div>
          <div class="sim-mkt-bar-wrap"><div class="sim-mkt-bar bar-amber" style="width:${pct(total-kg,total)}%"></div></div>
          <div style="font-size:10px;color:var(--tx2);margin-top:8px">baza KG Var: %${SP_BASE.kg.toFixed(0)}</div>
        </div>
      </div>
      <div class="sim-change" style="font-size:11px;color:var(--tx2);padding-top:6px;">
        ℹ️ Baza: ${SP_BASE.n.toLocaleString('tr-TR')} maç · %${SP_BASE.p1} ev · %${SP_BASE.ou25} 2.5 Üst · %${SP_BASE.kg} KG Var
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

function buildDetail(m, evs, stats, lus, h2h, pred, odds) {
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

  // ── MAÇ BİLGİ KARTI ── sadece veri varsa göster
let referee = null, venue = null, city = null;
let _kickoffFromRaw = null;
try {
  /* raw_data: live_matches; _fixture: future_matches parse; fixture: diğer */
  let fx = null;
  if (m.raw_data) {
    const raw = JSON.parse(m.raw_data);
    fx = raw?.fixture || null;
    if (!fx && raw?.referee) { referee = raw.referee; }
  }
  if (!fx && m._fixture) fx = m._fixture;
  if (!fx && m.fixture && typeof m.fixture === 'object') fx = m.fixture;
  if (!fx && m.data) {
    const d = typeof m.data === 'string' ? JSON.parse(m.data) : m.data;
    fx = (Array.isArray(d) ? d[0] : d)?.fixture || null;
  }
  if (fx) {
    referee        = fx.referee      || null;
    venue          = fx.venue?.name  || null;
    city           = fx.venue?.city  || null;
    _kickoffFromRaw = fx.date        || null; /* live_matches'te kickoff_time yok */
  }
} catch(e) {}
/* kickoff_time yoksa raw_data'daki fixture.date'i kullan */
const kickoff = m.kickoff_time || _kickoffFromRaw || null;
const kickoffFmt = kickoff ? new Date(kickoff).toLocaleString('tr-TR', {
  day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit',
  timeZone:'Europe/Istanbul'
}) : null;

if (kickoffFmt || referee || venue) {
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
}
   
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

     /* ── BENZERİ ORANLARIN ANALİZİ ── */
  {
  /* sofa_1x2 → oran hareketi change:-1/0/1 → sinyal kartı için
     mac_1x2  → Mackolik kapanış fiyatları {home,draw,away} → arşiv filtresi için */
  const sofa1x2 = od?.sofa_1x2 ?? null;
  const mac1x2  = od?.markets?.['1x2']  ?? null;
  const curOu25 = od?.markets?.['ou25'] ?? null;
  html += renderSignalCard(m.fixture_id, sofa1x2, mac1x2, curOu25);
}

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

  /* ══════════════════════════════════════
     GRUP 6: SOFASCORE ORAN DEĞİŞİMİ
  ══════════════════════════════════════ */
  {
    const s1x2 = od.sofa_1x2;
    if (s1x2) {
      const arrow = ch => ch === 1 ? '↑' : ch === -1 ? '↓' : '→';
      const arrowCls = ch => ch === 1 ? 'sofa-up' : ch === -1 ? 'sofa-dn' : 'sofa-eq';
      const sofaCell = (lbl, d) => {
        if (!d) return '';
        const op = d.opening != null ? d.opening.toFixed(2) : '-';
        const cl = d.closing != null ? d.closing.toFixed(2) : '-';
        const ar = arrow(d.change ?? 0);
        const arCls = arrowCls(d.change ?? 0);
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
        ${sofaCell('X', s1x2['x'])}
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
