/* ═══════════════════════════════════════════════════════
   SCOREPOP — bball.js  (v1.10)
   Basketbol sayfası için data + render katmanı

   Data kaynakları:
     • Canlı / Bugün  → Supabase `live_bball`  (scheduled_at kolonu)
     • Geçmiş arşiv   → GitHub blyarchieve/data/raw/{date}/events.json
     • Yaklaşan       → Supabase `future_matches` (basketball league_id listesi)

   Skor formatı:
     Toplam + Periyot skorları (Ç1/Ç2/Ç3/Ç4/OT)
═══════════════════════════════════════════════════════ */
'use strict';

/* ── STATE ──────────────────────────────────────────── */
const B = {
  sb:       null,
  page:     'today',   /* today | live | archive | upcoming */
  date:     todayStr(),
  timer:    null,
  cd:       30,
  tickTimer: null,
  rtChannel: null,   /* Supabase realtime kanalı */
  rtReloadT: null,   /* görünmeyen satır için debounce'lu tam yenileme */
  detail:   null,
  archiveCache: {},
  rowsCache: {},   /* id → row; canlı/bugün/yaklaşan satırları depolar */
};

/* ── ARCHIVE BASE ────────────────────────────────────── */
const BBALL_ARCHIVE_BASE = 'https://raw.githubusercontent.com/bcs562793/blyarchieve/main/data/raw';

/* ── KNOWN BASKETBALL LEAGUE IDs in future_matches ──────
   live_bball table'dan çekilen league'lerin bilyoner/mackolik ID'leri.
   Zamanla genişletilebilir. */
const BBALL_LEAGUE_IDS = new Set([
  138, 139, 140, 141, 142, 143, 144, 145,   /* NBA, EuroLeague vs. */
  2525,                                        /* Big V Avustralya */
]);

/* ── HELPERS ─────────────────────────────────────────── */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _bbSlug(s){return String(s||'').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);}

function fmtTime(isoStr) {
  if (!isoStr) return '--:--';
  try {
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return '--:--'; }
}

function dateLabel(str) {
  const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const [,m,d] = (str||'').split('-');
  return m ? `${+d} ${months[+m-1]}` : str;
}

/* ── STATUS → DISPLAY ───────────────────────────────── */
function bballStatus(m) {
  /* status_short map for basketball */
  const LIVE_MAP = {
    '1Q': 'Ç1', 'Q1': 'Ç1',
    '2Q': 'Ç2', 'Q2': 'Ç2',
    'HT': 'DEVRE', 'HALF': 'DEVRE',
    '3Q': 'Ç3', 'Q3': 'Ç3',
    '4Q': 'Ç4', 'Q4': 'Ç4',
    'OT': 'UZT', 'OT1': 'UZT1', 'OT2': 'UZT2',
    'LIVE': 'CANLI',
  };
  const DONE_SET = new Set(['FT','AOT','FINISHED','PLAYED','POST']);
  const s = (m.status_short || '').toUpperCase();

  if (DONE_SET.has(s)) return { live: false, done: true, label: 'MS', cls: 'done' };

  if (LIVE_MAP[s]) {
    let label = LIVE_MAP[s];
    if (m.match_clock) label += ` ${m.match_clock}`;
    return { live: true, done: false, label, cls: 'live' };
  }

  /* NS / FIXTURE → show scheduled time */
  return { live: false, done: false, label: fmtTime(m.scheduled_at || m.matchDate), cls: 'sched' };
}

/* ── DATE STRIP ─────────────────────────────────────── */
function buildBballDateStrip() {
  const el = document.getElementById('bball-date-strip');
  if (!el) return;

  const today = todayStr();
  const days  = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    days.push(s);
  }

  el.innerHTML = days.map(s => {
    const isTod = s === today;
    const isAct = s === B.date;
    return `<button class="bdp${isAct ? ' active' : ''}" data-date="${s}" onclick="pickBballDate('${s}')">
      ${isTod ? 'Bugün' : dateLabel(s)}
    </button>`;
  }).join('');

  /* scroll active into view */
  setTimeout(() => {
    const act = el.querySelector('.bdp.active');
    if (act) act.scrollIntoView({ inline: 'center', behavior: 'smooth' });
  }, 100);
}

function pickBballDate(d) {
  B.date = d;
  buildBballDateStrip();
  loadBball(false);
}

/* ── SUPABASE FETCH (paginated) ─────────────────────── */
async function fetchAllBballRows(query) {
  const PAGE = 1000;
  let from = 0, all = [];
  while (true) {
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) { console.error('[bball fetch]', error.message); break; }
    if (!data || !data.length) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/* ── MAIN LOAD ──────────────────────────────────────── */
async function loadBball(silent = false) {
  if (!silent) showLoading();

  const today = todayStr();

  /* Past date → GitHub archive */
  if (B.date < today) {
    await loadBballArchive(B.date);
    return;
  }

  /* Future date → future_matches */
  if (B.date > today) {
    await loadBballFuture(B.date);
    return;
  }

  /* Today → live_bball */
  await loadBballToday();
}

/* ── TODAY: live_bball ──────────────────────────────── */
async function loadBballToday() {
  try {
    /* scheduled_at kolonu UTC - bugünün maçlarını çek (geniş aralık) */
    const startUTC = `${B.date}T00:00:00+00:00`;
    const endUTC   = `${B.date}T23:59:59+00:00`;

    const rows = await fetchAllBballRows(
      B.sb.from('live_bball')
         .select('*')
         .gte('scheduled_at', startUTC)
         .lte('scheduled_at', endUTC)
         .order('scheduled_at')
    );

    renderBball(rows, true);
  } catch(e) {
    console.error('[loadBballToday]', e);
    showError('Canlı veriler yüklenemedi.');
  }
}

/* ── ARCHIVE: GitHub blyarchieve ────────────────────── */
async function loadBballArchive(date) {
  showLoading(`${date} arşivi yükleniyor…`);
  try {
    const url = `${BBALL_ARCHIVE_BASE}/basketball-${date}/events.json`;
    const res = await fetch(url);

    if (!res.ok) {
      showEmpty(`${date} tarihine ait basketbol arşivi bulunamadı.`);
      return;
    }

    const events = await res.json();
    const arr = Array.isArray(events) ? events : (events.events || events.data || []);

    if (!arr.length) {
      showEmpty(`${date} için basketbol verisi yok.`);
      return;
    }

    /* Cache detail data */
    B.archiveCache = {};
    B.rowsCache = {};   /* arşive geçişte canlı cache'i temizle */
    arr.forEach(e => {
      const id = e.sbsEventId || e.betRadarId;
      if (id) B.archiveCache[String(id)] = e;
    });

    const rows = arr.map(e => archiveEventToRow(e));
    renderBball(rows, false);

  } catch(e) {
    console.error('[loadBballArchive]', e);
    showError('Arşiv yüklenirken hata oluştu.');
  }
}

/* ── UPCOMING: future_matches ───────────────────────── */
async function loadBballFuture(date) {
  showLoading(`${date} fikstürü yükleniyor…`);
  try {
    const rows = await fetchAllBballRows(
      B.sb.from('live_bball')
         .select('*')
         .gte('scheduled_at', `${date}T00:00:00+00:00`)
         .lte('scheduled_at', `${date}T23:59:59+00:00`)
         .eq('status_short', 'NS')
         .order('scheduled_at')
    );

    if (!rows.length) {
      showEmpty(`${date} için yaklaşan basketbol maçı bulunamadı.`);
      return;
    }

    renderBball(rows, false);
  } catch(e) {
    console.error('[loadBballFuture]', e);
    showError('Fikstür yüklenemedi.');
  }
}

/* ── ARCHIVE EVENT → ROW ────────────────────────────── */
function archiveEventToRow(e) {
  const toNum = v => (v != null && v !== '' ? +v : null);
  return {
    id:           e.sbsEventId || e.betRadarId || Math.random(),
    league_name:  e.competitionName || '',
    country:      '',
    home_team:    e.homeTeam || e.homeFormDetail?.title || '',
    away_team:    e.awayTeam || e.awayFormDetail?.title || '',
    home_avatar:  null,
    away_avatar:  null,
    status_short: e.matchStatus === 'PLAYED' ? 'FT' : 'NS',
    home_score:   toNum(e.scoreTotal?.home),
    away_score:   toNum(e.scoreTotal?.away),
    home_q1:      toNum(e.scoreQ1?.home),
    away_q1:      toNum(e.scoreQ1?.away),
    home_q2:      toNum(e.scoreQ2?.home),
    away_q2:      toNum(e.scoreQ2?.away),
    home_q3:      toNum(e.scoreQ3?.home),
    away_q3:      toNum(e.scoreQ3?.away),
    home_q4:      toNum(e.scoreQ4?.home),
    away_q4:      toNum(e.scoreQ4?.away),
    home_ot:      null,
    away_ot:      null,
    period:       null,
    match_clock:  null,
    scheduled_at: e.matchDate || e.date || null,
    home_recent_form: JSON.stringify(e.homeFormDetail?.recentForms || e.homeRecentForm || []),
    away_recent_form: JSON.stringify(e.awayFormDetail?.recentForms || e.awayRecentForm || []),
    standings:    JSON.stringify(e.standing || null),
    h2h:          JSON.stringify(e.h2h || []),
    _archive:     true,
    _rawEvent:    e,
  };
}

/* ── RENDER ─────────────────────────────────────────── */
function renderBball(rows, isLive) {
  updateLiveCount(rows);

  /* Canlı/bugün/yaklaşan satırları id → row haritasında sakla (detay modalı için) */
  B.rowsCache = {};
  rows.forEach(m => { B.rowsCache[String(m.id)] = m; });

  if (!rows.length) {
    showEmpty('Maç bulunamadı.');
    return;
  }

  /* Group by league */
  const groups = {};
  rows.forEach(m => {
    const k = m.league_name || 'Diğer';
    if (!groups[k]) groups[k] = { name: k, country: m.country || '', matches: [] };
    groups[k].matches.push(m);
  });

  /* Sort: live leagues first, then alpha */
  const sorted = Object.values(groups).sort((a, b) => {
    const aLive = a.matches.some(m => bballStatus(m).live);
    const bLive = b.matches.some(m => bballStatus(m).live);
    if (aLive && !bLive) return -1;
    if (!aLive && bLive) return 1;
    return a.name.localeCompare(b.name, 'tr');
  });

  const html = sorted.map(g => renderBballGroup(g)).join('');
  document.getElementById('bball-root').innerHTML = html;
}

function renderBballGroup(g) {
  const liveCount = g.matches.filter(m => bballStatus(m).live).length;
  const liveBadge = liveCount
    ? `<span class="bball-live-badge">${liveCount} CANLI</span>`
    : '';

  return `
    <div class="bball-grp">
      <div class="bball-hdr" onclick="this.closest('.bball-grp').classList.toggle('closed')">
        <span class="bball-sport-icon">🏀</span>
        <span class="bball-hdr-name">${esc(g.country ? `${g.country} ${g.name}` : g.name)}</span>
        ${liveBadge}
        <span class="bball-arrow">▾</span>
      </div>
      <div class="bball-body">${g.matches.map(m => renderBballRow(m)).join('')}</div>
    </div>`;
}

function renderBballRow(m) {
  const st = bballStatus(m);
  const isNS = !st.live && !st.done;

  const hs = isNS ? '—' : (m.home_score != null ? m.home_score : '-');
  const as = isNS ? '—' : (m.away_score != null ? m.away_score : '-');

  let hcls = '', acls = '';
  if (st.done && hs !== '—' && as !== '—') {
    if      (+hs > +as) { hcls = 'bball-win'; acls = 'bball-loss'; }
    else if (+as > +hs) { acls = 'bball-win'; hcls = 'bball-loss'; }
  }

  const homeLogo = m.home_avatar
    ? `<img class="bball-logo" src="${esc(m.home_avatar)}" onerror="this.style.display='none'" alt="">`
    : `<div class="bball-logo-ph">🏀</div>`;
  const awayLogo = m.away_avatar
    ? `<img class="bball-logo" src="${esc(m.away_avatar)}" onerror="this.style.display='none'" alt="">`
    : `<div class="bball-logo-ph">🏀</div>`;

  const statusCls = st.live ? 'bball-status live' : (st.done ? 'bball-status done' : 'bball-status sched');

  const _href = `/basketbol/mac/${m.id}-${_bbSlug(m.home_team)}-vs-${_bbSlug(m.away_team)}`;
  return `
    <div class="bball-mr${st.live ? ' is-live' : ''}" data-id="${m.id}" onclick="window.location.href='${_href}'">
      <div class="${statusCls}">
        <span class="bball-st-label">${esc(st.label)}</span>
      </div>

      <div class="bball-team bball-home">
        <span class="bball-tname ${hcls}">${esc(m.home_team)}</span>
        <div class="bball-logo-wrap">${homeLogo}</div>
      </div>

      <div class="bball-scorebox">
        <div class="bball-total${isNS ? ' bball-vs' : ''}">
          ${isNS
            ? `<span class="bball-vs-txt">vs</span>`
            : `<span class="bball-sn ${hcls}">${hs}</span><div class="bball-sdiv"></div><span class="bball-sn ${acls}">${as}</span>`
          }
        </div>
      </div>

      <div class="bball-team bball-away">
        <div class="bball-logo-wrap">${awayLogo}</div>
        <span class="bball-tname ${acls}">${esc(m.away_team)}</span>
      </div>

      <div class="bball-arr">›</div>
    </div>`;
}

/* ── DETAIL MODAL ───────────────────────────────────── */
function openBballDetail(id) {
  const row = _findBballRow(id);
  if (!row) return;
  B.detail = id;   /* açık modal — realtime tazelemesi için */

  const st = bballStatus(row);
  const isNS = !st.live && !st.done;

  /* Quarter score table */
  const quarters = [
    { lbl: 'Ç1', h: row.home_q1, a: row.away_q1 },
    { lbl: 'Ç2', h: row.home_q2, a: row.away_q2 },
    { lbl: 'Devre', h: (row.home_q1 != null && row.home_q2 != null) ? +row.home_q1 + +row.home_q2 : null,
                    a: (row.away_q1 != null && row.away_q2 != null) ? +row.away_q1 + +row.away_q2 : null, isSub: true },
    { lbl: 'Ç3', h: row.home_q3, a: row.away_q3 },
    { lbl: 'Ç4', h: row.home_q4, a: row.away_q4 },
  ];
  if (row.home_ot != null || row.away_ot != null) {
    quarters.push({ lbl: 'Uzatma', h: row.home_ot, a: row.away_ot });
  }
  quarters.push({
    lbl: 'Toplam', h: row.home_score, a: row.away_score, isTotal: true
  });

  const qRows = quarters
    .filter(q => q.h != null || q.a != null)
    .map(q => `
      <tr class="${q.isTotal ? 'bball-dtl-total' : (q.isSub ? 'bball-dtl-sub' : '')}">
        <td>${q.lbl}</td>
        <td>${q.h ?? '-'}</td>
        <td>${q.a ?? '-'}</td>
      </tr>`).join('');

  /* Recent form */
  const homeForms = safeParseJSON(row.home_recent_form, []);
  const awayForms = safeParseJSON(row.away_recent_form, []);

  const formBadge = arr => (arr || []).map(r =>
    `<span class="bball-form-badge ${r === 'WON' ? 'bball-form-w' : 'bball-form-l'}">${r === 'WON' ? 'G' : 'M'}</span>`
  ).join('');

  const homeLogo = row.home_avatar
    ? `<img src="${esc(row.home_avatar)}" onerror="this.style.display='none'" alt="" class="bball-dtl-logo">`
    : '🏀';
  const awayLogo = row.away_avatar
    ? `<img src="${esc(row.away_avatar)}" onerror="this.style.display='none'" alt="" class="bball-dtl-logo">`
    : '🏀';

  /* Live stats (from live_bball liveStats or archive) */
  let liveStatsHtml = '';
  let statsData = null;

  try {
    if (row.live_stats) statsData = typeof row.live_stats === 'string' ? JSON.parse(row.live_stats) : row.live_stats;
    if (!statsData && row._rawEvent?.liveStats) statsData = row._rawEvent.liveStats;
  } catch(e) {}

  if (statsData?.GENEL) {
    const statKeys = { _2_sayi: '2 Sayı %', _3_sayi: '3 Sayı %', serbest_atis: 'Serbest Atış %' };
    const rows2 = Object.entries(statKeys).map(([key, label]) => {
      const v = statsData.GENEL[key];
      if (!v) return '';
      const hv = +v.home, av = +v.away, tot = hv + av;
      const hpct = tot > 0 ? Math.round(hv / tot * 100) : 50;
      const apct = 100 - hpct;
      return `
        <div class="bball-stat-row">
          <span class="bball-stat-val">${v.home}%</span>
          <div class="bball-stat-bar">
            <div class="bball-stat-h" style="width:${hpct}%"></div>
            <div class="bball-stat-a" style="width:${apct}%"></div>
          </div>
          <span class="bball-stat-lbl">${label}</span>
          <span class="bball-stat-val">${v.away}%</span>
        </div>`;
    }).join('');
    if (rows2.trim()) liveStatsHtml = `<div class="bball-dtl-section"><div class="bball-dtl-sh">İstatistikler</div>${rows2}</div>`;
  }

  const modal = document.getElementById('bball-modal');
  const body = document.getElementById('bball-modal-body');

  body.innerHTML = `
    <div class="bball-dtl-hero">
      <div class="bball-dtl-team">
        ${homeLogo}
        <span class="bball-dtl-tname">${esc(row.home_team)}</span>
      </div>
      <div class="bball-dtl-center">
        ${isNS
          ? `<div class="bball-dtl-time">${esc(st.label)}</div>`
          : `<div class="bball-dtl-score">${row.home_score ?? '-'} – ${row.away_score ?? '-'}</div>`
        }
        <div class="bball-dtl-status ${st.live ? 'live' : (st.done ? 'done' : 'sched')}">${esc(st.label)}</div>
        <div class="bball-dtl-league">${esc(row.league_name)}</div>
      </div>
      <div class="bball-dtl-team">
        ${awayLogo}
        <span class="bball-dtl-tname">${esc(row.away_team)}</span>
      </div>
    </div>

    ${!isNS && qRows ? `
      <div class="bball-dtl-section">
        <div class="bball-dtl-sh">Periyot Skorları</div>
        <table class="bball-qtr-table">
          <thead><tr><th></th><th>${esc(row.home_team)}</th><th>${esc(row.away_team)}</th></tr></thead>
          <tbody>${qRows}</tbody>
        </table>
      </div>` : ''}

    ${liveStatsHtml}

    ${(homeForms.length || awayForms.length) ? `
      <div class="bball-dtl-section">
        <div class="bball-dtl-sh">Son Form</div>
        <div class="bball-dtl-forms">
          <div>
            <span class="bball-dtl-flbl">${esc(row.home_team)}</span>
            <div class="bball-form-badges">${formBadge(homeForms)}</div>
          </div>
          <div>
            <span class="bball-dtl-flbl">${esc(row.away_team)}</span>
            <div class="bball-form-badges">${formBadge(awayForms)}</div>
          </div>
        </div>
      </div>` : ''}
  `;

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

function closeBballModal() {
  B.detail = null;
  document.getElementById('bball-modal').classList.remove('open');
  document.body.classList.remove('modal-open');
}

function _findBballRow(id) {
  const sid = String(id);

  /* 1. Canlı/bugün/yaklaşan cache'i (Supabase'den gelen satırlar) */
  if (B.rowsCache[sid]) return B.rowsCache[sid];

  /* 2. Arşiv cache'i (GitHub'dan gelen eventler) */
  if (B.archiveCache[sid]) return archiveEventToRow(B.archiveCache[sid]);

  return null;
}

function safeParseJSON(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

/* ── UI HELPERS ─────────────────────────────────────── */
function showLoading(msg = 'Yükleniyor…') {
  document.getElementById('bball-root').innerHTML = `
    <div class="bball-empty">
      <div class="bball-empty-icon">⏳</div>
      <div>${msg}</div>
    </div>`;
}

function showEmpty(msg) {
  document.getElementById('bball-root').innerHTML = `
    <div class="bball-empty">
      <div class="bball-empty-icon">📭</div>
      <div>${msg}</div>
    </div>`;
}

function showError(msg) {
  document.getElementById('bball-root').innerHTML = `
    <div class="bball-empty">
      <div class="bball-empty-icon">⚠️</div>
      <div>${msg}</div>
    </div>`;
}

function updateLiveCount(rows) {
  const n = rows.filter(m => bballStatus(m).live).length;
  const el = document.getElementById('bball-live-n');
  const sbEl = document.getElementById('sb-bball-live-n');
  if (el) el.textContent = n;
  if (sbEl) sbEl.textContent = n;
  /* Topbar live badge */
  const badge = document.getElementById('bball-tb-live');
  if (badge) badge.style.display = n > 0 ? 'flex' : 'none';
  const badgeN = document.getElementById('bball-tb-live-n');
  if (badgeN) badgeN.textContent = n;
}

/* ── REALTIME TICKER (periyot saati) ────────────────── */
function startBballTick() {
  if (B.tickTimer) clearInterval(B.tickTimer);
  B.tickTimer = setInterval(() => {
    document.querySelectorAll('.bball-mr.is-live').forEach(el => {
      const id = el.dataset.id;
      /* Tick sadece görsel güncelleme; gerçek veri yenileme loadBball'dan gelir */
    });
  }, 1000);
}

/* ── COUNTDOWN RING ─────────────────────────────────── */
function startBballCountdown() {
  B.cd = B.cycle;
  updateBballRing();
  if (B.timer) clearInterval(B.timer);
  B.timer = setInterval(async () => {
    B.cd--;
    updateBballRing();
    if (B.cd <= 0) {
      B.cd = B.cycle;
      await loadBball(true);
    }
  }, 1000);
}

function updateBballRing() {
  const el = document.getElementById('bball-cd');
  if (el) el.textContent = B.cd;
  const ring = document.getElementById('bball-ring');
  if (!ring) return;
  const r = 8, C = 2 * Math.PI * r;
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - B.cd / B.cycle);
}

/* ── REALTIME (live_bball) ───────────────────────────────
   Görünür 30sn sayaç yerine arka planda sessiz canlı güncelleme.
   Değişen satır yerinde yamalanır (flicker yok); realtime koparsa
   countdown polling'i sessiz yedek olarak devreye girer.          */
function startBballRealtime() {
  if (B.rtChannel) { B.sb.removeChannel(B.rtChannel); B.rtChannel = null; }
  B.rtChannel = B.sb
    .channel('bball-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_bball' }, payload => {
      if (payload.eventType === 'DELETE') return;
      if (B.date !== todayStr()) return;            /* yalnız bugün görünümünde yamala */
      _bballPatchRow(payload.new);
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        if (B.timer) { clearInterval(B.timer); B.timer = null; }   /* görünür sayaç polling'i dur */
        console.log('[Bball realtime] bağlandı ✓');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        startBballCountdown();                       /* yedek polling (görünür halka yok) */
        console.warn('[Bball realtime] koptu, polling başladı');
      }
    });
}

/* Tek satırı yerinde günceller — renderBballRow tek kaynaktan kullanılır. */
function _bballPatchRow(m) {
  if (!m || m.id == null) return;
  B.rowsCache[String(m.id)] = m;
  const el = document.querySelector(`.bball-mr[data-id="${m.id}"]`);
  if (!el) {
    /* Satır görünmüyor (yeni maç / grup yok) → sessiz tam yenile, debounce'lu */
    if (B.rtReloadT) return;
    B.rtReloadT = setTimeout(() => { B.rtReloadT = null; loadBball(true); }, 1200);
    return;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = renderBballRow(m);
  const fresh = tmp.firstElementChild;
  if (fresh) el.replaceWith(fresh);
  /* Açık modal bu maçsa tazele */
  if (B.detail != null && String(B.detail) === String(m.id)) openBballDetail(m.id);
  /* Canlı sayacını yeniden hesapla */
  updateLiveCount(Object.values(B.rowsCache));
}

/* ── INIT ────────────────────────────────────────────── */
async function initBball() {
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase SDK yüklenmedi!');
    return;
  }
  B.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  buildBballDateStrip();
  await loadBball(false);
  startBballCountdown();   /* başlangıç yedeği — realtime bağlanınca durur */
  startBballRealtime();
  startBballTick();

  /* Close modal on backdrop click */
const bballModal = document.getElementById('bball-modal');
if (bballModal) {
  bballModal.addEventListener('click', e => {
    if (e.target.id === 'bball-modal') closeBballModal();
  });
}

  /* Keyboard: Escape closes modal */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBballModal();
  });
}

document.addEventListener('DOMContentLoaded', initBball);
