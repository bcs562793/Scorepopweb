/* ═══════════════════════════════════════════════════
   SCOREPOP — app.js
   Supabase bağlantısı config.js üzerinden gelir.
════════════════════════════════════════════════════ */
'use strict';

/* ── STATE ──────────────────────────────────────── */
const State = {
  sb: null,
  page: 'live',         // 'live' | 'today' | 'upcoming'
  date: todayStr(),
  league: 'all',
  detail: null,         // fixture_id || null
  detailLive: false,
  refreshTimer: null,
  countdown: 30,
  totalCycle: 30,
};

/* ── BOOT ───────────────────────────────────────── */
window.addEventListener('load', () => {
  State.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  buildDateStrip();
  bindNav();
  navigate('live');
  startRefresh();
});

/* ── NAVIGATION ─────────────────────────────────── */
function bindNav() {
  // Desktop nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
  // Mobile nav
  document.querySelectorAll('.mob-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });
  // Back button
  document.getElementById('back-btn').addEventListener('click', closeDetail);
}

function navigate(page) {
  State.page = page;
  State.league = 'all';
  closeDetail(false); // go to matches view

  // Update active nav states
  document.querySelectorAll('.nav-btn, .mob-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  // Date strip visibility
  const showDate = page !== 'live';
  document.getElementById('date-strip-wrap').style.display = showDate ? '' : 'none';

  loadMatches();
}

function openDetail(fixtureId, isLive) {
  State.detail = fixtureId;
  State.detailLive = isLive;
  document.getElementById('view-matches').classList.add('hidden');
  document.getElementById('view-detail').classList.remove('hidden');
  loadDetail(fixtureId, isLive);
}

function closeDetail(doRender = true) {
  State.detail = null;
  document.getElementById('view-matches').classList.remove('hidden');
  document.getElementById('view-detail').classList.add('hidden');
  if (doRender) loadMatches();
}

/* ── DATE STRIP ─────────────────────────────────── */
function buildDateStrip() {
  const strip = document.getElementById('date-strip');
  strip.innerHTML = '';
  const dow = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
  for (let i = -3; i <= 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const str = fmtDate(d);
    const pill = document.createElement('button');
    pill.className = 'date-pill' + (i === 0 ? ' active' : '');
    const day = String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
    const label = i === 0 ? 'Bugün' : i === 1 ? 'Yarın' : i === -1 ? 'Dün' : dow[d.getDay()];
    pill.innerHTML = `<span class="dp-day">${day}</span><span class="dp-dow">${label}</span>`;
    pill.addEventListener('click', () => {
      State.date = str;
      document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      loadMatches();
    });
    strip.appendChild(pill);
  }
}

/* ── LOAD MATCHES ───────────────────────────────── */
async function loadMatches(silent = false) {
  try {
    if (State.page === 'live')     await loadLive(silent);
    else if (State.page === 'today') await loadToday();
    else                             await loadUpcoming();
  } catch (err) {
    console.error('[loadMatches]', err);
    if (!silent) setMatchesHTML(`<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-msg">Bağlantı hatası</div></div>`);
  }
}

async function loadLive(silent = false) {
  const { data, error } = await State.sb
    .from('live_matches')
    .select('*')
    .in('status_short', ['1H','2H','HT','ET','BT','P','LIVE'])
    .limit(100)
    .order('league_name');
  if (error) throw error;
  const rows = data || [];
  document.getElementById('live-count').textContent = rows.length;
  if (silent) silentScoreUpdate(rows);
  else        renderMatches(rows, true);
}

async function loadToday() {
  const { data, error } = await State.sb
    .from('daily_matches')
    .select('*')
    .eq('match_date', State.date)
    .order('league_name');
  if (error) throw error;
  renderMatches(data || [], false);
}

async function loadUpcoming() {
  const { data, error } = await State.sb
    .from('future_matches')
    .select('*')
    .eq('date', State.date)
    .order('league_id');
  if (error) throw error;
  const expanded = [];
  (data || []).forEach(row => {
    if (row.data) {
      if (Array.isArray(row.data)) row.data.forEach(m => expanded.push(normalizeFixture(m)));
      else expanded.push(normalizeFixture(row.data));
    } else {
      expanded.push(row);
    }
  });
  renderMatches(expanded, false);
}

function normalizeFixture(m) {
  return {
    fixture_id:   m.fixture?.id   || m.fixture_id,
    league_name:  m.league?.name  || m.league_name  || '',
    league_logo:  m.league?.logo  || m.league_logo  || '',
    home_team:    m.teams?.home?.name || m.home_team || '',
    away_team:    m.teams?.away?.name || m.away_team || '',
    home_logo:    m.teams?.home?.logo || m.home_logo || '',
    away_logo:    m.teams?.away?.logo || m.away_logo || '',
    home_score:   m.goals?.home   ?? m.home_score   ?? null,
    away_score:   m.goals?.away   ?? m.away_score   ?? null,
    status_short: m.fixture?.status?.short   || m.status_short  || 'NS',
    elapsed_time: m.fixture?.status?.elapsed || m.elapsed_time  || null,
  };
}

/* ── RENDER MATCHES ─────────────────────────────── */
function renderMatches(rows, isLive) {
  if (!rows.length) {
    setMatchesHTML(`<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-msg">Maç bulunamadı</div></div>`);
    buildLeagueFilter([]);
    return;
  }

  // Group by league
  const groups = {};
  rows.forEach(m => {
    const k = m.league_name || 'Diğer';
    if (!groups[k]) groups[k] = { name: k, logo: m.league_logo || '', matches: [] };
    groups[k].matches.push(m);
  });

  buildLeagueFilter(Object.values(groups));

  const html = Object.values(groups).map(g => renderLeagueGroup(g, isLive)).join('');
  setMatchesHTML(html);
  applyLeagueFilter();
}

function renderLeagueGroup(g, isLive) {
  const rows = g.matches.map(m => renderMatchRow(m, isLive)).join('');
  const logo = g.logo
    ? `<img class="lg-flag" src="${g.logo}" onerror="this.style.display='none'" alt="">`
    : `<div class="lg-flag-placeholder"></div>`;
  return `
    <div class="lg-group" data-league="${escHtml(g.name)}">
      <div class="lg-header" onclick="toggleGroup(this)">
        ${logo}
        <span class="lg-name">${escHtml(g.name)}</span>
        <span class="lg-count">${g.matches.length}</span>
        <span class="lg-toggle">▾</span>
      </div>
      <div class="lg-body">${rows}</div>
    </div>`;
}

function renderMatchRow(m, isLive) {
  const st = statusInfo(m);
  const hs = m.home_score !== null && m.home_score !== undefined ? m.home_score : '-';
  const as = m.away_score !== null && m.away_score !== undefined ? m.away_score : '-';

  // Winner detection for finished matches
  let homeCls = '', awayCls = '';
  if (st.cls === 'done' && hs !== '-' && as !== '-') {
    if (parseInt(hs) > parseInt(as)) { homeCls = 'winner'; awayCls = 'loser'; }
    else if (parseInt(as) > parseInt(hs)) { awayCls = 'winner'; homeCls = 'loser'; }
  }

  const homeLogo = m.home_logo
    ? `<img class="mc-logo" src="${m.home_logo}" onerror="this.style.display='none'" alt="">`
    : `<div class="mc-logo-ph"></div>`;
  const awayLogo = m.away_logo
    ? `<img class="mc-logo" src="${m.away_logo}" onerror="this.style.display='none'" alt="">`
    : `<div class="mc-logo-ph"></div>`;

  const scoreBoxCls = st.live ? 'mc-score-box is-live' : 'mc-score-box';
  const tvBadge = m.visual_url
    ? `<span class="mc-tv-badge">TV</span>`
    : `<span class="mc-status-icon">›</span>`;

  return `
    <div class="match-row ${st.live ? 'is-live' : ''}" data-id="${m.fixture_id}"
         onclick="openDetail(${m.fixture_id}, ${st.live})">
      <div class="mc-time">
        <span class="mc-time-main ${st.cls}">${st.label}</span>
        ${st.live ? `<span class="mc-time-dot"></span>` : ''}
      </div>
      <div class="mc-home ${homeCls}">
        ${homeLogo}
        <span class="mc-name">${escHtml(m.home_team || '')}</span>
      </div>
      <div class="mc-score">
        <div class="${scoreBoxCls}">
          <span class="mc-score-num">${hs}</span>
          <div class="mc-score-sep"></div>
          <span class="mc-score-num">${as}</span>
        </div>
      </div>
      <div class="mc-away ${awayCls}">
        ${awayLogo}
        <span class="mc-name">${escHtml(m.away_team || '')}</span>
      </div>
      <div class="mc-status">${tvBadge}</div>
    </div>`;
}

/* ── LEAGUE FILTER ──────────────────────────────── */
function buildLeagueFilter(groups) {
  const bar = document.getElementById('filter-bar');
  bar.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.className = 'league-chip' + (State.league === 'all' ? ' active' : '');
  allBtn.textContent = 'Tüm Ligler';
  allBtn.dataset.league = 'all';
  allBtn.addEventListener('click', () => setLeagueFilter('all', groups));
  bar.appendChild(allBtn);

  groups.forEach(g => {
    const btn = document.createElement('button');
    btn.className = 'league-chip' + (State.league === g.name ? ' active' : '');
    btn.dataset.league = g.name;
    if (g.logo) btn.innerHTML = `<img src="${g.logo}" onerror="this.style.display='none'" alt=""> ${escHtml(g.name)}`;
    else btn.textContent = g.name;
    btn.addEventListener('click', () => setLeagueFilter(g.name, groups));
    bar.appendChild(btn);
  });
}

function setLeagueFilter(name, groups) {
  State.league = name;
  document.querySelectorAll('.league-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.league === name);
  });
  applyLeagueFilter();
}

function applyLeagueFilter() {
  document.querySelectorAll('.lg-group').forEach(el => {
    el.style.display = (State.league === 'all' || el.dataset.league === State.league) ? '' : 'none';
  });
}

function toggleGroup(header) {
  header.closest('.lg-group').classList.toggle('collapsed');
}

/* ── DETAIL ─────────────────────────────────────── */
async function loadDetail(fixtureId, isLive) {
  setDetailHTML(`<div class="empty-state" style="min-height:200px"><div class="empty-icon" style="font-size:28px">⚽</div></div>`);

  try {
    const table = isLive ? 'live_matches' : 'daily_matches';
    const { data: match } = await State.sb.from(table).select('*').eq('fixture_id', fixtureId).single();
    if (!match) { setDetailHTML('<div class="empty-state"><div class="empty-msg">Maç bulunamadı</div></div>'); return; }

    const [
      { data: events },
      { data: stats },
      { data: lineups },
      { data: h2h },
      { data: pred },
    ] = await Promise.all([
      State.sb.from('match_events').select('*').eq('fixture_id', fixtureId).order('elapsed_time'),
      State.sb.from('match_statistics').select('*').eq('fixture_id', fixtureId).single(),
      State.sb.from('match_lineups').select('*').eq('fixture_id', fixtureId).single(),
      State.sb.from('match_h2h').select('*').like('h2h_key', `%${match.home_team_id}%`).maybeSingle(),
      State.sb.from('match_predictions').select('*').eq('fixture_id', fixtureId).single(),
    ]);

    renderDetail(match, events || [], stats, lineups, h2h, pred);
  } catch (err) {
    console.error('[loadDetail]', err);
    setDetailHTML(`<div class="empty-state"><div class="empty-msg">Veri yüklenemedi: ${err.message}</div></div>`);
  }
}

function renderDetail(m, events, stats, lineups, h2h, pred) {
  const st = statusInfo(m);
  const hs = m.home_score ?? '-';
  const as = m.away_score ?? '-';

  /* ─ Hero ─ */
  const homeLogo = m.home_logo ? `<img class="hero-logo" src="${m.home_logo}" onerror="this.style.display='none'" alt="">` : '';
  const awayLogo = m.away_logo ? `<img class="hero-logo" src="${m.away_logo}" onerror="this.style.display='none'" alt="">` : '';

  let html = `
    <div class="hero">
      <div class="hero-league">
        ${m.league_logo ? `<img src="${m.league_logo}" onerror="this.style.display='none'" alt="" width="18" height="18">` : ''}
        <span class="hero-league-name">${escHtml(m.league_name || '')}</span>
      </div>
      <div class="hero-teams">
        <div class="hero-team">${homeLogo}<div class="hero-name">${escHtml(m.home_team || '')}</div></div>
        <div class="hero-center">
          <div class="hero-score-box ${st.live ? 'is-live' : ''}">
            <span class="hero-score-num">${hs}</span>
            <div class="hero-score-sep"></div>
            <span class="hero-score-num">${as}</span>
          </div>
          <div class="hero-status ${st.cls}">${st.live ? `⚡ ${st.label}` : st.label}</div>
        </div>
        <div class="hero-team">${awayLogo}<div class="hero-name">${escHtml(m.away_team || '')}</div></div>
      </div>
    </div>`;

  /* ─ Visual ─ */
  html += `
    <div class="visual-section">
      <div class="visual-head">
        <div class="visual-head-left">📺 Canlı Görsel</div>
        ${m.visual_url ? `<span class="visual-head-badge">LIVE</span>` : ''}
      </div>
      ${m.visual_url
        ? `<iframe class="visual-iframe" src="${m.visual_url}" allowfullscreen sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`
        : `<div class="visual-empty"><span class="visual-empty-icon">📡</span>Görsel stream mevcut değil</div>`
      }
    </div>`;

  /* ─ Tabs ─ */
  html += `
    <div class="dtabs">
      <div class="dtab active" onclick="switchTab('events',this)">⚡ Olaylar</div>
      <div class="dtab" onclick="switchTab('stats',this)">📊 İstatistik</div>
      <div class="dtab" onclick="switchTab('lineups',this)">📋 Kadro</div>
      <div class="dtab" onclick="switchTab('h2h',this)">⚔️ H2H</div>
      <div class="dtab" onclick="switchTab('pred',this)">🔮 Forum</div>
    </div>`;

  /* ─ Events ─ */
  html += `<div class="tab-panel active" id="tab-events">`;
  if (!events.length) {
    html += `<div class="events-list"><div class="no-events">Henüz olay yok</div></div>`;
  } else {
    html += `<div class="events-list">`;
    events.forEach(ev => {
      const isHome = ev.team_id == m.home_team_id;
      const icon = getEventIcon(ev.event_type, ev.event_detail);
      const iconCls = getEventIconCls(ev.event_type, ev.event_detail);
      const timeStr = ev.elapsed_time ? `${ev.elapsed_time}${ev.extra_time ? '+' + ev.extra_time : ''}'` : '';
      html += `
        <div class="event-row">
          <div class="ev-time">${timeStr}</div>
          <div class="ev-body ${isHome ? '' : 'away-event'}">
            <div class="ev-icon ${iconCls}">${icon}</div>
            <div>
              <div class="ev-player">${escHtml(ev.player_name || '')}</div>
              ${ev.assist_name ? `<div class="ev-detail">⤷ ${escHtml(ev.assist_name)}</div>` : ''}
              ${ev.event_detail ? `<div class="ev-detail">${escHtml(ev.event_detail)}</div>` : ''}
            </div>
          </div>
          <div class="ev-team ${isHome ? 'home-side' : ''}">${escHtml(ev.team_name || '')}</div>
        </div>`;
    });
    html += `</div>`;
  }
  html += `</div>`;

  /* ─ Stats ─ */
  html += `<div class="tab-panel" id="tab-stats">`;
  const sd = stats?.data;
  if (sd && Array.isArray(sd) && sd.length >= 2) {
    const hs2 = sd[0]?.statistics || [];
    const as2 = sd[1]?.statistics || [];
    html += `<div class="stats-panel">`;
    hs2.forEach((row, i) => {
      const ar = as2[i];
      const hv = row.value ?? 0;
      const av = ar?.value ?? 0;
      const hvn = parseFloat(String(hv)) || 0;
      const avn = parseFloat(String(av)) || 0;
      const tot = hvn + avn;
      const pct = tot > 0 ? Math.round(hvn / tot * 100) : 50;
      html += `
        <div class="stat-row">
          <div class="stat-val home">${hv}</div>
          <div class="stat-mid">
            <div class="stat-label">${escHtml(row.type || '')}</div>
            <div class="stat-bars">
              <div class="stat-bar-h" style="width:${pct}%"></div>
              <div class="stat-bar-a" style="width:${100 - pct}%"></div>
            </div>
          </div>
          <div class="stat-val away">${av}</div>
        </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="empty-state"><div class="empty-msg">İstatistik mevcut değil</div></div>`;
  }
  html += `</div>`;

  /* ─ Lineups ─ */
  html += `<div class="tab-panel" id="tab-lineups">`;
  const ld = lineups?.data;
  if (ld && Array.isArray(ld) && ld.length >= 2) {
    html += `<div class="lineups-grid">`;
    ld.slice(0, 2).forEach(team => {
      const logo = team.team?.logo;
      const name = team.team?.name || '';
      html += `
        <div class="lineup-card">
          <div class="lineup-head">
            ${logo ? `<img src="${logo}" onerror="this.style.display='none'" alt="">` : ''}
            ${escHtml(name)}
          </div>`;
      (team.startXI || []).forEach(p => {
        const pl = p.player;
        html += `<div class="lineup-player"><span class="p-num">${pl?.number || ''}</span><span class="p-name">${escHtml(pl?.name || '')}</span><span class="p-pos">${pl?.pos || ''}</span></div>`;
      });
      if ((team.substitutes || []).length) {
        html += `<div class="lineup-sub-sep">Yedekler</div>`;
        team.substitutes.forEach(p => {
          const pl = p.player;
          html += `<div class="lineup-player" style="opacity:.6"><span class="p-num">${pl?.number || ''}</span><span class="p-name">${escHtml(pl?.name || '')}</span><span class="p-pos">${pl?.pos || ''}</span></div>`;
        });
      }
      html += `</div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="empty-state"><div class="empty-msg">Kadro bilgisi mevcut değil</div></div>`;
  }
  html += `</div>`;

  /* ─ H2H ─ */
  html += `<div class="tab-panel" id="tab-h2h">`;
  const h2hData = h2h?.data?.response || h2h?.data || [];
  if (h2hData.length) {
    html += `<div class="h2h-list">`;
    h2hData.slice(-10).reverse().forEach(hm => {
      const f = hm.fixture || hm;
      const t = hm.teams || {};
      const g = hm.goals || {};
      const date = f.date ? new Date(f.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '';
      html += `
        <div class="h2h-row">
          <div class="h2h-date">${date}</div>
          <div class="h2h-team">${escHtml(t.home?.name || '')}</div>
          <div class="h2h-score">${g.home ?? '-'} - ${g.away ?? '-'}</div>
          <div class="h2h-team right">${escHtml(t.away?.name || '')}</div>
        </div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="empty-state"><div class="empty-msg">H2H verisi mevcut değil</div></div>`;
  }
  html += `</div>`;

  /* ─ Predictions ─ */
  html += `<div class="tab-panel" id="tab-pred">`;
  const pd = pred?.data?.response?.[0] || pred?.data?.[0] || pred?.data;
  if (pd) {
    const pct = pd.predictions?.percent || {};
    const winner = pd.predictions?.winner;
    html += `
      <div class="pred-grid">
        <div class="pred-card pred-home"><div class="pred-pct">${pct.home || '-%'}</div><div class="pred-lbl">Ev Sahibi</div></div>
        <div class="pred-card pred-draw"><div class="pred-pct">${pct.draw || '-%'}</div><div class="pred-lbl">Beraberlik</div></div>
        <div class="pred-card pred-away"><div class="pred-pct">${pct.away || '-%'}</div><div class="pred-lbl">Deplasman</div></div>
      </div>`;
    if (winner) {
      html += `
        <div class="pred-winner">
          ${winner.logo ? `<img src="${winner.logo}" width="30" height="30" onerror="this.style.display='none'" alt="">` : '⚽'}
          <div><div class="pw-label">TAHMİN — KAZANAN</div><div class="pw-name">${escHtml(winner.name || 'Belirsiz')}</div></div>
        </div>`;
    }
  } else {
    html += `<div class="empty-state"><div class="empty-msg">Tahmin verisi mevcut değil</div></div>`;
  }
  html += `</div>`;

  setDetailHTML(html);
}

function switchTab(name, clickedEl) {
  document.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
  if (clickedEl) clickedEl.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById('tab-' + name);
  if (panel) panel.classList.add('active');
}

/* ── SILENT UPDATE ──────────────────────────────── */
function silentScoreUpdate(rows) {
  rows.forEach(m => {
    const row = document.querySelector(`.match-row[data-id="${m.fixture_id}"]`);
    if (!row) return;
    const st = statusInfo(m);
    const hs = m.home_score !== null ? m.home_score : '-';
    const as = m.away_score !== null ? m.away_score : '-';
    const nums = row.querySelectorAll('.mc-score-num');
    if (nums[0] && String(nums[0].textContent) !== String(hs)) { nums[0].textContent = hs; flashEl(nums[0]); }
    if (nums[1] && String(nums[1].textContent) !== String(as)) { nums[1].textContent = as; flashEl(nums[1]); }
    const timeEl = row.querySelector('.mc-time-main');
    if (timeEl && timeEl.textContent !== st.label) timeEl.textContent = st.label;
  });
}

async function silentUpdateDetail() {
  if (!State.detail) return;
  const table = State.detailLive ? 'live_matches' : 'daily_matches';
  const { data } = await State.sb
    .from(table)
    .select('home_score,away_score,elapsed_time,status_short')
    .eq('fixture_id', State.detail)
    .single();
  if (!data) return;
  const st = statusInfo(data);
  const nums = document.querySelectorAll('.hero-score-num');
  if (nums[0]) nums[0].textContent = data.home_score ?? '-';
  if (nums[1]) nums[1].textContent = data.away_score ?? '-';
  const statusEl = document.querySelector('.hero-status');
  if (statusEl) statusEl.textContent = st.live ? `⚡ ${st.label}` : st.label;
}

function flashEl(el) {
  el.style.transition = 'none';
  el.style.color = 'var(--gold)';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = 'color 1.6s ease';
      el.style.color = '';
    });
  });
}

/* ── AUTO REFRESH ───────────────────────────────── */
function startRefresh() {
  if (State.refreshTimer) clearInterval(State.refreshTimer);
  State.countdown = State.totalCycle;
  updateRing(1);

  State.refreshTimer = setInterval(async () => {
    State.countdown--;
    updateRing(State.countdown / State.totalCycle);

    if (State.countdown <= 0) {
      State.countdown = State.totalCycle;
      if (State.detail) {
        await silentUpdateDetail();
      } else {
        await loadMatches(true);
      }
    }
  }, 1000);
}

function updateRing(fraction) {
  const circ = 81.7; // 2π × 13
  const offset = circ * (1 - fraction);
  const el = document.getElementById('ring-progress');
  if (el) el.style.strokeDashoffset = offset;
}

/* ── STATUS HELPERS ─────────────────────────────── */
function statusInfo(m) {
  const s = m.status_short;
  const liveStates = ['1H','2H','HT','ET','BT','P','LIVE'];
  const doneStates = ['FT','AET','PEN'];
  const isLive = liveStates.includes(s);
  const isDone = doneStates.includes(s);

  if (isLive) {
    const label = s === 'HT' ? 'HT' : m.elapsed_time ? `${m.elapsed_time}'` : s;
    return { live: true, label, cls: 'live' };
  }
  if (isDone) return { live: false, label: 'MS', cls: 'done' };
  return { live: false, label: fmtKickoff(m), cls: 'sched' };
}

function fmtKickoff(m) {
  const raw = m.kickoff_time || m.updated_at;
  if (!raw) return '--:--';
  try {
    const d = new Date(raw);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return '--:--'; }
}

/* ── EVENT ICON HELPERS ─────────────────────────── */
function getEventIcon(type, detail) {
  const t = (type || '').toLowerCase();
  const d = (detail || '').toLowerCase();
  if (t === 'goal') return d.includes('penalty') ? '🎯' : '⚽';
  if (t === 'card') return d.includes('red') || d.includes('kırmızı') ? '🟥' : '🟨';
  if (t === 'subst') return '🔄';
  if (t === 'var')   return '📺';
  return '•';
}
function getEventIconCls(type, detail) {
  const t = (type || '').toLowerCase();
  const d = (detail || '').toLowerCase();
  if (t === 'goal') return 'goal';
  if (t === 'card') return d.includes('red') || d.includes('kırmızı') ? 'red' : 'yellow';
  if (t === 'subst') return 'sub';
  if (t === 'var')   return 'var';
  return '';
}

/* ── DOM HELPERS ────────────────────────────────── */
function setMatchesHTML(html) {
  document.getElementById('matches-root').innerHTML = html;
}
function setDetailHTML(html) {
  document.getElementById('detail-root').innerHTML = html;
}
function todayStr() {
  const d = new Date();
  return fmtDate(d);
}
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
