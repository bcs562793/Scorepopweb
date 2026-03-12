/* ═══════════════════════════════════════════════
   SCOREPOP — app.js  (v2)
   Fixes: match_statistics uses maybeSingle + robust data parsing
   New  : Forum tab wired to forum.js
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

/* ── BOOT ───────────────────────────────────── */
window.addEventListener('load', () => {
  S.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  Forum.init(S.sb);          // ← forum modülünü başlat
  buildDateStrip();
  bindEvents();
  navigate('live');
  startClock();
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

  showView('matches');
  loadMatches();
}

function openDetail(id, isLive) {
  S.detail     = id;
  S.detailLive = isLive;
  showView('detail');
  loadDetail(id, isLive);
}

function closeDetail(reload = true) {
  Forum.close();           // ← forum aboneliğini kapat
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
  let rows = [];

  /* 1) match_date kolonu dene */
  const { data: d1 } = await S.sb
    .from('daily_matches').select('*')
    .eq('match_date', S.date).order('league_name');
  if (d1 && d1.length) { rows = d1; }

  /* 2) date kolonu dene */
  if (!rows.length) {
    const { data: d2 } = await S.sb
      .from('daily_matches').select('*')
      .eq('date', S.date).order('league_name');
    if (d2 && d2.length) rows = d2;
  }

  /* 3) live_matches'ta NS status dene */
  if (!rows.length) {
    const { data: ns } = await S.sb
      .from('live_matches').select('*')
      .eq('status_short', 'NS')
      .order('league_name');
    if (ns && ns.length) rows = ns;
  }

  render(rows, false);
}

async function loadUpcoming() {
  const { data, error } = await S.sb
    .from('future_matches').select('*')
    .eq('date', S.date).order('league_id');
  if (error) throw error;
  const rows = [];
  (data || []).forEach(r => {
    if (!r.data) { rows.push(r); return; }
    if (Array.isArray(r.data)) r.data.forEach(m => rows.push(normFix(m)));
    else rows.push(normFix(r.data));
  });
  render(rows, false);
}

function normFix(m) {
  return {
    fixture_id:   m.fixture?.id  || m.fixture_id,
    league_name:  m.league?.name || m.league_name || '',
    league_logo:  m.league?.logo || m.league_logo || '',
    home_team:    m.teams?.home?.name || m.home_team || '',
    away_team:    m.teams?.away?.name || m.away_team || '',
    home_logo:    m.teams?.home?.logo || m.home_logo || '',
    away_logo:    m.teams?.away?.logo || m.away_logo || '',
    home_score:   m.goals?.home  ?? m.home_score  ?? null,
    away_score:   m.goals?.away  ?? m.away_score  ?? null,
    status_short: m.fixture?.status?.short   || m.status_short  || 'NS',
    elapsed_time: m.fixture?.status?.elapsed || m.elapsed_time  || null,
    kickoff_time: m.fixture?.date            || m.kickoff_time  || null,
  };
}

/* ── RENDER ──────────────────────────────────── */
function render(rows, isLive) {
  if (!rows.length) {
    setMatchesHTML(`<div class="empty"><div class="empty-i">📭</div><div class="empty-t">Maç bulunamadı</div></div>`);
    buildSidebarLeagues([]);
    return;
  }
  const groups = {};
  rows.forEach(m => {
    const k = m.league_name || 'Diğer';
    if (!groups[k]) groups[k] = { name: k, logo: m.league_logo || '', matches: [] };
    groups[k].matches.push(m);
  });
  S.allLeagues = Object.values(groups);
  buildSidebarLeagues(S.allLeagues);
  setMatchesHTML(S.allLeagues.map(g => renderGroup(g, isLive)).join(''));
  applyFilter();
}

function renderGroup(g, isLive) {
  const liveCount = g.matches.filter(m => statusInfo(m).live).length;
  const logo = g.logo
    ? `<img class="lg-flag" src="${g.logo}" onerror="this.style.display='none'" alt="">`
    : `<div class="lg-flag-ph"></div>`;
  const liveBadge = liveCount
    ? `<span class="lg-live-ct">${liveCount} CANLI</span>` : '';
  return `
    <div class="lg-grp" data-league="${esc(g.name)}">
      <div class="lg-hdr" onclick="this.closest('.lg-grp').classList.toggle('closed')">
        <div class="lg-hdr-left">${logo}<span class="lg-hdr-name">${esc(g.name)}</span></div>
        <div class="lg-hdr-right">
          ${liveBadge}
          <span class="lg-ct">${g.matches.length}</span>
          <span class="lg-arrow">▾</span>
        </div>
      </div>
      <div class="lg-body">${g.matches.map(m => renderRow(m, isLive)).join('')}</div>
    </div>`;
}

function renderRow(m, isLive) {
  const st = statusInfo(m);
  const isNS = m.home_score == null && m.away_score == null && !statusInfo(m).live;
  const hs = m.home_score != null ? m.home_score : (isNS ? 'v' : '-');
  const as = m.away_score != null ? m.away_score : (isNS ? '' : '-');
  let hcls = '', acls = '';
  if (st.cls === 'done' && hs !== '-' && as !== '-') {
    const hi = +hs, ai = +as;
    if   (hi > ai) { hcls = 'bold'; acls = 'dim'; }
    else if (ai > hi) { acls = 'bold'; hcls = 'dim'; }
  }
  const hLogo = m.home_logo
    ? `<img class="mr-logo" src="${m.home_logo}" onerror="this.style.display='none'" alt="">`
    : `<div class="mr-logo-ph"></div>`;
  const aLogo = m.away_logo
    ? `<img class="mr-logo" src="${m.away_logo}" onerror="this.style.display='none'" alt="">`
    : `<div class="mr-logo-ph"></div>`;
  const sbCls = st.live ? 'mr-sb live' : 'mr-sb';
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
function buildSidebarLeagues(groups) {
  const el = document.getElementById('sb-league-list');
  el.innerHTML = '';
  const allBtn = document.createElement('div');
  allBtn.className = 'sb-lg-item' + (S.league === 'all' ? ' active' : '');
  allBtn.innerHTML = `<span class="sb-lg-n">Tüm Ligler</span><span class="sb-lg-ct">${groups.reduce((a,g)=>a+g.matches.length,0)}</span>`;
  allBtn.addEventListener('click', () => { setLeague('all'); if(window.innerWidth<=680) toggleSidebar(); });
  el.appendChild(allBtn);
  groups.forEach(g => {
    const item = document.createElement('div');
    item.className = 'sb-lg-item' + (S.league === g.name ? ' active' : '');
    item.innerHTML = `
      ${g.logo ? `<img src="${g.logo}" onerror="this.style.display='none'" alt="">` : ''}
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
    const tbl = isLive ? 'live_matches' : 'daily_matches';
    const { data: m, error: mErr } = await S.sb
      .from(tbl).select('*').eq('fixture_id', id).maybeSingle();   // ← maybeSingle
    if (mErr) throw mErr;
    if (!m) {
      setDetailHTML('<div class="empty"><div class="empty-t">Maç bulunamadı</div></div>');
      return;
    }

    /* paralel sorgular — hepsi maybeSingle ile güvenli */
    const [
      { data: evs },
      { data: stats,  error: stErr  },
      { data: lus },
      { data: h2h },
      { data: pred },
    ] = await Promise.all([
      S.sb.from('match_events').select('*').eq('fixture_id', id).order('elapsed_time'),
      S.sb.from('match_statistics').select('*').eq('fixture_id', id).maybeSingle(),  // ← DÜZELTİLDİ
      S.sb.from('match_lineups').select('*').eq('fixture_id', id).maybeSingle(),
      S.sb.from('match_h2h').select('*').like('h2h_key',`%${m.home_team_id}%`).maybeSingle(),
      S.sb.from('match_predictions').select('*').eq('fixture_id', id).maybeSingle(), // ← maybeSingle
    ]);

    if (stErr) console.warn('İstatistik hatası:', stErr.message);

    buildDetail(m, evs||[], stats, lus, h2h, pred);
  } catch (e) {
    console.error(e);
    setDetailHTML(`<div class="empty"><div class="empty-t">Hata: ${esc(e.message)}</div></div>`);
  }
}

function buildDetail(m, evs, stats, lus, h2h, pred) {
  const st = statusInfo(m);
  const hs = m.home_score ?? '-', as = m.away_score ?? '-';

  /* hero */
  let html = `
    <div class="d-hero">
      <div class="d-league">
        ${m.league_logo ? `<img src="${m.league_logo}" width="16" height="16" onerror="this.style.display='none'" alt="">` : ''}
        <span class="d-league-n">${esc(m.league_name||'')}</span>
      </div>
      <div class="d-teams">
        <div class="d-team">
          ${m.home_logo ? `<img class="d-logo" src="${m.home_logo}" onerror="this.style.display='none'" alt="">` : ''}
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
          ${m.away_logo ? `<img class="d-logo" src="${m.away_logo}" onerror="this.style.display='none'" alt="">` : ''}
          <div class="d-tname">${esc(m.away_team||'')}</div>
        </div>
      </div>
    </div>`;

  /* visual stream */
  html += `
    <div class="d-visual">
      <div class="d-visual-hdr">
        <div class="d-visual-hdr-l">📺 Canlı Görsel</div>
        ${m.visual_url ? `<span class="d-visual-live">LIVE</span>` : ''}
      </div>
      ${m.visual_url
        ? `<iframe class="d-visual-iframe" src="${m.visual_url}" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`
        : `<div class="d-visual-empty">📡<span>Görsel stream mevcut değil</span></div>`}
    </div>`;

  /* tabs */
  html += `
    <div class="d-tabs">
      <div class="d-tab active" onclick="switchTab('ev',this)">Olaylar</div>
      <div class="d-tab" onclick="switchTab('st',this)">İstatistik</div>
      <div class="d-tab" onclick="switchTab('lu',this)">Kadro</div>
      <div class="d-tab" onclick="switchTab('h2',this)">H2H</div>
      <div class="d-tab" onclick="switchTab('fr',this)">Forum</div>
    </div>`;

  /* ── events panel ────────────────────────── */
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

  /* ── stats panel — DÜZELTİLMİŞ ─────────── */
  html += `<div class="d-panel" id="d-st">`;
  const sd = parseStatsData(stats);
  if (sd && sd.home.length && sd.away.length) {
    html += `<div class="st-panel">`;
    sd.home.forEach((r, i) => {
      const ar    = sd.away[i];
      const hvRaw = r.value   ?? 0;
      const avRaw = ar?.value ?? 0;
      /* yüzde değerlerini sayıya çevir (%64 → 64) */
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

  /* ── lineups panel ───────────────────────── */
  html += `<div class="d-panel" id="d-lu">`;
  const ld = lus?.data;
  if (ld && Array.isArray(ld) && ld.length >= 2) {
    html += `<div class="lu-grid">`;
    ld.slice(0,2).forEach(team => {
      html += `
        <div class="lu-card">
          <div class="lu-hdr">
            ${team.team?.logo ? `<img src="${team.team.logo}" onerror="this.style.display='none'" alt="">` : ''}
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

  /* ── h2h panel ───────────────────────────── */
  html += `<div class="d-panel" id="d-h2">`;
  const hd = h2h?.data?.response || h2h?.data || [];
  if (hd.length) {
    html += `<div class="h2h-list">`;
    hd.slice(-10).reverse().forEach(hm => {
      const f=hm.fixture||hm, t=hm.teams||{}, g=hm.goals||{};
      const dt = f.date ? new Date(f.date).toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit',year:'2-digit'}) : '';
      html += `
        <div class="h2h-row">
          <div class="h2h-d">${dt}</div>
          <div class="h2h-t">${esc(t.home?.name||'')}</div>
          <div class="h2h-sc">${g.home??'-'} - ${g.away??'-'}</div>
          <div class="h2h-t r">${esc(t.away?.name||'')}</div>
        </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="empty"><div class="empty-t">H2H verisi yok</div></div>`;
  }
  html += `</div>`;

  /* ── forum panel ─────────────────────────── */
  html += `<div class="d-panel" id="d-fr"></div>`;

  setDetailHTML(html);

  /* forum'u bu fixture için başlat */
  Forum.open(m.fixture_id);
}

/* ── STATS PARSER (düzeltilmiş) ──────────────── */
/**
 * Supabase'den gelen istatistik satırını normalleştirir.
 * Desteklenen formatlar:
 *   { data: [ {statistics:[...]}, {statistics:[...]} ] }
 *   { data: { home: [...], away: [...] } }
 *   { statistics: [ {statistics:[...]}, ... ] }  (flat)
 */
function parseStatsData(row) {
  if (!row) return null;

  /* Format 1: row.data dizisi (orijinal format) */
  const d = row.data;
  if (d && Array.isArray(d) && d.length >= 2) {
    const home = d[0]?.statistics || [];
    const away = d[1]?.statistics || [];
    if (home.length) return { home, away };
  }

  /* Format 2: row.data.home / row.data.away */
  if (d && d.home && Array.isArray(d.home) && d.away) {
    return { home: d.home, away: d.away };
  }

  /* Format 3: doğrudan row.statistics dizisi */
  if (row.statistics && Array.isArray(row.statistics) && row.statistics.length >= 2) {
    return {
      home: row.statistics[0]?.statistics || [],
      away: row.statistics[1]?.statistics || [],
    };
  }

  /* Format 4: row kendisi iki takım içeriyor (home_stats / away_stats kolonları) */
  if (row.home_stats || row.home_statistics) {
    const hs = row.home_stats || row.home_statistics || [];
    const as = row.away_stats || row.away_statistics || [];
    return { home: hs, away: as };
  }

  console.warn('[Stats] Tanınamayan veri formatı:', row);
  return null;
}

/* ── TAB SWITCH ─────────────────────────────── */
function switchTab(name, el) {
  document.querySelectorAll('.d-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.d-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('d-' + name);
  if (panel) panel.classList.add('active');

  /* forum sekmesi ilk açıldığında kaydır */
  if (name === 'fr') Forum.scrollToBottom();
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
  const tbl = S.detailLive ? 'live_matches' : 'daily_matches';
  const { data } = await S.sb
    .from(tbl).select('home_score,away_score,elapsed_time,status_short')
    .eq('fixture_id', S.detail).single();
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

/* ── CLOCK ───────────────────────────────────── */
function startClock() {
  if (S.timer) clearInterval(S.timer);
  S.cd = S.cycle;
  updateRing(1);
  S.timer = setInterval(async () => {
    S.cd--;
    updateRing(S.cd / S.cycle);
    document.getElementById('sb-cd').textContent = S.cd;
    if (S.cd <= 0) {
      S.cd = S.cycle;
      if (S.detail) await silentUpdateDetail();
      else          await loadMatches(true);
    }
  }, 1000);
}

function updateRing(frac) {
  const c = 50.3;
  const el = document.getElementById('sb-ring');
  if (el) el.style.strokeDashoffset = c * (1 - frac);
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

function fmtKickoff(m) {
  const raw = m.kickoff_time || m.updated_at;
  if (!raw) return '--:--';
  try {
    const d = new Date(raw);
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  } catch { return '--:--'; }
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
