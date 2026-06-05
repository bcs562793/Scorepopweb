/* ═══════════════════════════════════════════════════════
   SCOREPOP — bball.js  (v2.0)
   Basketbol sayfası için data + render katmanı

   v2.0 değişiklikleri:
     • B.rowCache ile tüm satırlar kaydediliyor (canlı/arşiv fark yok)
     • _findBballRow artık doğru çalışıyor
     • Detay modalı: 4 sekme — Özet · İstatistik · H2H · Puan Durumu
     • H2H: ev/deplasman formu + aralarındaki maçlar
     • Puan Durumu: tam lig tablosu (poz, takım, O/G/M/pct/avg)
     • İstatistik: live_stats çubuklukları + gelişmiş gösterim

   Data kaynakları:
     • Canlı / Bugün  → Supabase `live_bball`
     • Geçmiş arşiv   → GitHub blyarchieve/data/raw/{date}/events.json
     • Yaklaşan       → Supabase `live_bball` (status_short=NS)
═══════════════════════════════════════════════════════ */
'use strict';

/* ── STATE ──────────────────────────────────────────── */
const B = {
  sb:           null,
  page:         'today',
  date:         todayStr(),
  timer:        null,
  cd:           30,
  tickTimer:    null,
  detail:       null,
  archiveCache: {},
  rowCache:     {},   /* ← YENİ: id → row (tüm kaynaklar) */
  activeTab:    'oz', /* oz | st | h2 | pd */
};

/* ── ARCHIVE BASE ────────────────────────────────────── */
const BBALL_ARCHIVE_BASE = 'https://raw.githubusercontent.com/bcs562793/blyarchieve/main/data/raw';

/* ── HELPERS ─────────────────────────────────────────── */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

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

function safeParseJSON(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

/* ── STATUS → DISPLAY ───────────────────────────────── */
function bballStatus(m) {
  const LIVE_MAP = {
    '1Q':'Ç1','Q1':'Ç1','2Q':'Ç2','Q2':'Ç2',
    'HT':'DEVRE','HALF':'DEVRE',
    '3Q':'Ç3','Q3':'Ç3','4Q':'Ç4','Q4':'Ç4',
    'OT':'UZT','OT1':'UZT1','OT2':'UZT2','LIVE':'CANLI',
  };
  const DONE_SET = new Set(['FT','AOT','FINISHED','PLAYED','POST']);
  const s = (m.status_short || '').toUpperCase();

  if (DONE_SET.has(s)) return { live: false, done: true, label: 'MS', cls: 'done' };
  if (LIVE_MAP[s]) {
    let label = LIVE_MAP[s];
    if (m.match_clock) label += ` ${m.match_clock}`;
    return { live: true, done: false, label, cls: 'live' };
  }
  return { live: false, done: false, label: fmtTime(m.scheduled_at || m.matchDate), cls: 'sched' };
}

/* ── DATE STRIP ─────────────────────────────────────── */
function buildBballDateStrip() {
  const el = document.getElementById('bball-date-strip');
  if (!el) return;
  const today = todayStr();
  const days = [];
  for (let i = -6; i <= 6; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    days.push(s);
  }
  el.innerHTML = days.map(s => {
    const isTod = s === today;
    const isAct = s === B.date;
    return `<button class="bdp${isAct?' active':''}" data-date="${s}" onclick="pickBballDate('${s}')">
      ${isTod ? 'Bugün' : dateLabel(s)}
    </button>`;
  }).join('');
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
  if (B.date < today) { await loadBballArchive(B.date); return; }
  if (B.date > today) { await loadBballFuture(B.date); return; }
  await loadBballToday();
}

/* ── TODAY: live_bball ──────────────────────────────── */
async function loadBballToday() {
  try {
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
    const url = `${BBALL_ARCHIVE_BASE}/${date}/events.json`;
    const res = await fetch(url);
    if (!res.ok) { showEmpty(`${date} tarihine ait basketbol arşivi bulunamadı.`); return; }
    const events = await res.json();
    const arr = Array.isArray(events) ? events : (events.events || events.data || []);
    if (!arr.length) { showEmpty(`${date} için basketbol verisi yok.`); return; }

    /* Cache raw archive events by their ID */
    B.archiveCache = {};
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

/* ── UPCOMING: future dates ─────────────────────────── */
async function loadBballFuture(date) {
  showLoading(`${date} fikstürü yükleniyor…`);
  try {
    const rows = await fetchAllBballRows(
      B.sb.from('live_bball')
         .select('*')
         .gte('scheduled_at', `${date}T00:00:00+00:00`)
         .lte('scheduled_at', `${date}T23:59:59+00:00`)
         .order('scheduled_at')
    );
    if (!rows.length) { showEmpty(`${date} için yaklaşan maç bulunamadı.`); return; }
    renderBball(rows, false);
  } catch(e) {
    console.error('[loadBballFuture]', e);
    showError('Fikstür yüklenemedi.');
  }
}

/* ── ARCHIVE EVENT → ROW ────────────────────────────── */
function archiveEventToRow(e) {
  const toNum = v => (v != null && v !== '' ? +v : null);
  const id = String(e.sbsEventId || e.betRadarId || `arc_${Math.random().toString(36).slice(2)}`);
  return {
    id,
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
    h2h:          JSON.stringify(e.h2h || null),
    live_stats:   null,
    _archive:     true,
    _rawEvent:    e,
  };
}

/* ── RENDER ─────────────────────────────────────────── */
function renderBball(rows, isLive) {
  updateLiveCount(rows);

  /* ── YENİ: rowCache'i doldur ── */
  B.rowCache = {};
  rows.forEach(r => { B.rowCache[String(r.id)] = r; });

  if (!rows.length) { showEmpty('Maç bulunamadı.'); return; }

  const groups = {};
  rows.forEach(m => {
    const k = m.league_name || 'Diğer';
    if (!groups[k]) groups[k] = { name: k, country: m.country || '', matches: [] };
    groups[k].matches.push(m);
  });

  const sorted = Object.values(groups).sort((a, b) => {
    const aLive = a.matches.some(m => bballStatus(m).live);
    const bLive = b.matches.some(m => bballStatus(m).live);
    if (aLive && !bLive) return -1;
    if (!aLive && bLive) return 1;
    return a.name.localeCompare(b.name, 'tr');
  });

  document.getElementById('bball-root').innerHTML = sorted.map(g => renderBballGroup(g)).join('');
}

function renderBballGroup(g) {
  const liveCount = g.matches.filter(m => bballStatus(m).live).length;
  const liveBadge = liveCount ? `<span class="bball-live-badge">${liveCount} CANLI</span>` : '';
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

  let qtrsHtml = '';
  if (!isNS) {
    const quarters = [
      [m.home_q1, m.away_q1, 'Ç1'],
      [m.home_q2, m.away_q2, 'Ç2'],
      [m.home_q3, m.away_q3, 'Ç3'],
      [m.home_q4, m.away_q4, 'Ç4'],
    ];
    if (m.home_ot != null || m.away_ot != null) quarters.push([m.home_ot, m.away_ot, 'UZT']);

    const qItems = quarters
      .filter(([h, a]) => h != null || a != null)
      .map(([h, a, lbl]) => {
        const isActive = st.live && (
          (lbl === 'Ç1' && ['1Q','Q1'].includes(m.status_short)) ||
          (lbl === 'Ç2' && ['2Q','Q2'].includes(m.status_short)) ||
          (lbl === 'Ç3' && ['3Q','Q3'].includes(m.status_short)) ||
          (lbl === 'Ç4' && ['4Q','Q4'].includes(m.status_short)) ||
          (lbl === 'UZT' && m.status_short?.toUpperCase().startsWith('OT'))
        );
        return `<span class="bball-qtr${isActive ? ' bball-qtr-live' : ''}">
          <span class="bball-qtr-lbl">${lbl}</span>
          <span class="bball-qtr-h">${h ?? '-'}</span>
          <span class="bball-qtr-sep">:</span>
          <span class="bball-qtr-a">${a ?? '-'}</span>
        </span>`;
      });

    if (qItems.length) qtrsHtml = `<div class="bball-qtrs">${qItems.join('')}</div>`;
  }

  const homeLogo = m.home_avatar
    ? `<img class="bball-logo" src="${esc(m.home_avatar)}" onerror="this.style.display='none'" alt="">`
    : `<div class="bball-logo-ph">🏀</div>`;
  const awayLogo = m.away_avatar
    ? `<img class="bball-logo" src="${esc(m.away_avatar)}" onerror="this.style.display='none'" alt="">`
    : `<div class="bball-logo-ph">🏀</div>`;

  const statusCls = st.live ? 'bball-status live' : (st.done ? 'bball-status done' : 'bball-status sched');

  return `
    <div class="bball-mr${st.live ? ' is-live' : ''}" data-id="${m.id}" onclick="openBballDetail('${m.id}')">
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
        ${qtrsHtml}
      </div>
      <div class="bball-team bball-away">
        <div class="bball-logo-wrap">${awayLogo}</div>
        <span class="bball-tname ${acls}">${esc(m.away_team)}</span>
      </div>
      <div class="bball-arr">›</div>
    </div>`;
}

/* ═══════════════════════════════════════════════════════
   DETAIL MODAL — v2.0
═══════════════════════════════════════════════════════ */

function openBballDetail(id) {
  const row = _findBballRow(id);
  if (!row) { console.warn('[bball] row not found:', id); return; }

  B.detail = row;
  B.activeTab = 'oz';

  renderBballModal(row);
  document.getElementById('bball-modal').classList.add('open');
  document.body.classList.add('modal-open');
}

function closeBballModal() {
  document.getElementById('bball-modal').classList.remove('open');
  document.body.classList.remove('modal-open');
}

function switchBballTab(tab, el) {
  B.activeTab = tab;
  document.querySelectorAll('.bball-dtab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.bball-tpanel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`btp-${tab}`);
  if (panel) panel.classList.add('active');
}

function renderBballModal(row) {
  const st = bballStatus(row);
  const isNS = !st.live && !st.done;
  const body = document.getElementById('bball-modal-body');

  const homeLogo = row.home_avatar
    ? `<img src="${esc(row.home_avatar)}" onerror="this.style.display='none'" alt="" class="bball-dtl-logo">`
    : `<div class="bball-dtl-logo-ph">🏀</div>`;
  const awayLogo = row.away_avatar
    ? `<img src="${esc(row.away_avatar)}" onerror="this.style.display='none'" alt="" class="bball-dtl-logo">`
    : `<div class="bball-dtl-logo-ph">🏀</div>`;

  /* ── Periyot Skorları ── */
  const ozHtml = buildBballOzetTab(row, st, isNS);

  /* ── İstatistik ── */
  const stHtml = buildBballStatsTab(row);

  /* ── H2H ── */
  const h2Html = buildBballH2HTab(row);

  /* ── Puan Durumu ── */
  const pdHtml = buildBballStandingsTab(row);

  /* Hangi sekmeler dolu? */
  const hasStats     = stHtml.hasContent;
  const hasH2H       = h2Html.hasContent;
  const hasStandings = pdHtml.hasContent;

  body.innerHTML = `
    <!-- Hero -->
    <div class="bball-dtl-hero">
      <div class="bball-dtl-team">
        ${homeLogo}
        <span class="bball-dtl-tname">${esc(row.home_team)}</span>
      </div>
      <div class="bball-dtl-center">
        ${isNS
          ? `<div class="bball-dtl-time">${esc(st.label)}</div>`
          : `<div class="bball-dtl-score">
               <span class="bball-dtl-sn">${row.home_score ?? '-'}</span>
               <span class="bball-dtl-sep">–</span>
               <span class="bball-dtl-sn">${row.away_score ?? '-'}</span>
             </div>`
        }
        <div class="bball-dtl-status ${st.live ? 'live' : (st.done ? 'done' : 'sched')}">${esc(st.label)}</div>
        <div class="bball-dtl-league">${esc(row.league_name)}</div>
      </div>
      <div class="bball-dtl-team">
        ${awayLogo}
        <span class="bball-dtl-tname">${esc(row.away_team)}</span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="bball-dtabs">
      <button class="bball-dtab active" onclick="switchBballTab('oz',this)">Özet</button>
      <button class="bball-dtab${hasStats ? '' : ' bball-dtab-dim'}" onclick="switchBballTab('st',this)">İstatistik</button>
      <button class="bball-dtab${hasH2H ? '' : ' bball-dtab-dim'}" onclick="switchBballTab('h2',this)">H2H</button>
      <button class="bball-dtab${hasStandings ? '' : ' bball-dtab-dim'}" onclick="switchBballTab('pd',this)">Puan Durumu</button>
    </div>

    <!-- Panels -->
    <div id="btp-oz" class="bball-tpanel active">${ozHtml}</div>
    <div id="btp-st" class="bball-tpanel">${stHtml.html}</div>
    <div id="btp-h2" class="bball-tpanel">${h2Html.html}</div>
    <div id="btp-pd" class="bball-tpanel">${pdHtml.html}</div>
  `;
}

/* ── ÖZET TAB ─────────────────────────────────────────── */
function buildBballOzetTab(row, st, isNS) {
  let html = '';

  /* Periyot skor tablosu */
  if (!isNS) {
    const quarters = [
      { lbl: 'Ç1',    h: row.home_q1, a: row.away_q1 },
      { lbl: 'Ç2',    h: row.home_q2, a: row.away_q2 },
      { lbl: 'Devre (1.Y)', h: (row.home_q1 != null && row.home_q2 != null) ? +row.home_q1 + +row.home_q2 : null,
                             a: (row.away_q1 != null && row.away_q2 != null) ? +row.away_q1 + +row.away_q2 : null, isSub: true },
      { lbl: 'Ç3',    h: row.home_q3, a: row.away_q3 },
      { lbl: 'Ç4',    h: row.home_q4, a: row.away_q4 },
    ];
    if (row.home_ot != null || row.away_ot != null)
      quarters.push({ lbl: 'Uzatma', h: row.home_ot, a: row.away_ot });
    quarters.push({ lbl: 'Toplam', h: row.home_score, a: row.away_score, isTotal: true });

    const qRows = quarters
      .filter(q => q.h != null || q.a != null)
      .map(q => {
        const cls = q.isTotal ? 'bball-dtl-total' : (q.isSub ? 'bball-dtl-sub' : '');
        let hcls = '', acls = '';
        if (!q.isSub && q.h != null && q.a != null) {
          if (+q.h > +q.a)      { hcls = 'bball-cell-w'; acls = 'bball-cell-l'; }
          else if (+q.a > +q.h) { acls = 'bball-cell-w'; hcls = 'bball-cell-l'; }
        }
        return `<tr class="${cls}"><td>${q.lbl}</td><td class="${hcls}">${q.h ?? '-'}</td><td class="${acls}">${q.a ?? '-'}</td></tr>`;
      }).join('');

    if (qRows) {
      html += `
        <div class="bball-dtl-section">
          <div class="bball-dtl-sh">Periyot Skorları</div>
          <table class="bball-qtr-table">
            <thead><tr><th></th><th>${esc(row.home_team)}</th><th>${esc(row.away_team)}</th></tr></thead>
            <tbody>${qRows}</tbody>
          </table>
        </div>`;
    }
  }

  /* Son Form */
  const homeForms = safeParseJSON(row.home_recent_form, []);
  const awayForms = safeParseJSON(row.away_recent_form, []);

  const formBadge = arr => (arr || []).slice(0, 5).map(r =>
    `<span class="bball-form-badge ${r === 'WON' ? 'bball-form-w' : 'bball-form-l'}">${r === 'WON' ? 'G' : 'M'}</span>`
  ).join('');

  if (homeForms.length || awayForms.length) {
    html += `
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
      </div>`;
  }

  if (!html) html = `<div class="bball-empty" style="padding:40px 20px;"><div class="bball-empty-icon">📭</div><div>Veri henüz mevcut değil</div></div>`;
  return html;
}

/* ── İSTATİSTİK TAB ──────────────────────────────────── */
function buildBballStatsTab(row) {
  let statsData = null;
  try {
    if (row.live_stats) statsData = typeof row.live_stats === 'string' ? JSON.parse(row.live_stats) : row.live_stats;
    if (!statsData && row._rawEvent?.liveStats) statsData = row._rawEvent.liveStats;
  } catch(e) {}

  if (!statsData) {
    return {
      hasContent: false,
      html: `<div class="bball-empty" style="padding:40px 20px;"><div class="bball-empty-icon">📊</div><div>İstatistik verisi mevcut değil</div></div>`
    };
  }

  const ST_KEYS = [
    { key: '_2_sayi',      label: '2 Sayı %',         icon: '🎯' },
    { key: '_3_sayi',      label: '3 Sayı %',         icon: '🏹' },
    { key: 'serbest_atis', label: 'Serbest Atış %',   icon: '⭕' },
    { key: 'ribaund',      label: 'Ribaund',           icon: '💪' },
    { key: 'asist',        label: 'Asist',             icon: '🤝' },
    { key: 'top_kapma',    label: 'Top Kapma',         icon: '🖐' },
    { key: 'blok',         label: 'Blok',              icon: '🛡️' },
    { key: 'top_kaybi',    label: 'Top Kaybı',         icon: '❌' },
  ];

  let rowsHtml = '';
  const genel = statsData.GENEL || statsData;

  ST_KEYS.forEach(({ key, label, icon }) => {
    const v = genel[key];
    if (!v) return;
    const hv = parseFloat(v.home) || 0;
    const av = parseFloat(v.away) || 0;
    const tot = hv + av;
    const hpct = tot > 0 ? Math.round(hv / tot * 100) : 50;
    const apct = 100 - hpct;
    rowsHtml += `
      <div class="bball-stat-row">
        <span class="bball-stat-val">${v.home}</span>
        <div class="bball-stat-bar-wrap">
          <div class="bball-stat-bar">
            <div class="bball-stat-h" style="width:${hpct}%"></div>
            <div class="bball-stat-a" style="width:${apct}%"></div>
          </div>
          <span class="bball-stat-lbl">${icon} ${label}</span>
        </div>
        <span class="bball-stat-val bball-stat-r">${v.away}</span>
      </div>`;
  });

  if (!rowsHtml) {
    return {
      hasContent: false,
      html: `<div class="bball-empty" style="padding:40px 20px;"><div class="bball-empty-icon">📊</div><div>İstatistik verisi mevcut değil</div></div>`
    };
  }

  const html = `
    <div class="bball-dtl-section">
      <div class="bball-stat-header">
        <span class="bball-stat-team-lbl">${esc(row.home_team)}</span>
        <span></span>
        <span class="bball-stat-team-lbl r">${esc(row.away_team)}</span>
      </div>
      ${rowsHtml}
    </div>`;

  return { hasContent: true, html };
}

/* ── H2H TAB ─────────────────────────────────────────── */
function buildBballH2HTab(row) {
  const h2h = safeParseJSON(row.h2h, null);
  if (!h2h) {
    return {
      hasContent: false,
      html: `<div class="bball-empty" style="padding:40px 20px;"><div class="bball-empty-icon">🆚</div><div>H2H verisi mevcut değil</div></div>`
    };
  }

  let html = '';
  let hasContent = false;

  /* ── Aralarındaki Maçlar ── */
  const between = h2h.matchesBetween;
  const betweenMatches = between?.matches || between?.teamForm || [];
  if (between?.emptyMessage && !betweenMatches.length) {
    html += `<div class="bball-dtl-section">
      <div class="bball-dtl-sh">🆚 Aralarındaki Maçlar</div>
      <div class="bball-h2h-empty">${esc(between.emptyMessage)}</div>
    </div>`;
  } else if (betweenMatches.length) {
    hasContent = true;
    html += `<div class="bball-dtl-section">
      <div class="bball-dtl-sh">🆚 Aralarındaki Maçlar</div>
      <div class="bball-h2h-list">${betweenMatches.map(m => renderH2HRow(m, row.home_team)).join('')}</div>
    </div>`;
  }

  /* ── Ev Sahibi Son Maçlar ── */
  const homeFormData = h2h.homeTeamForms;
  if (homeFormData?.teamForm?.length) {
    hasContent = true;
    html += `<div class="bball-dtl-section">
      <div class="bball-dtl-sh">🏠 ${esc(homeFormData.title || row.home_team)} — Son Maçlar</div>
      <div class="bball-h2h-list">${homeFormData.teamForm.slice(0,7).map(m => renderH2HRow(m, homeFormData.title || row.home_team)).join('')}</div>
    </div>`;
  }

  /* ── Deplasman Son Maçlar ── */
  const awayFormData = h2h.awayTeamForms;
  if (awayFormData?.teamForm?.length) {
    hasContent = true;
    html += `<div class="bball-dtl-section">
      <div class="bball-dtl-sh">✈️ ${esc(awayFormData.title || row.away_team)} — Son Maçlar</div>
      <div class="bball-h2h-list">${awayFormData.teamForm.slice(0,7).map(m => renderH2HRow(m, awayFormData.title || row.away_team)).join('')}</div>
    </div>`;
  }

  if (!html) {
    return {
      hasContent: false,
      html: `<div class="bball-empty" style="padding:40px 20px;"><div class="bball-empty-icon">🆚</div><div>H2H verisi mevcut değil</div></div>`
    };
  }

  return { hasContent, html };
}

function renderH2HRow(m, markedTeam) {
  /* Supports both matchesBetween format and teamForm format */
  const date    = m.date || '';
  const homeTm  = m.homeTeamName || m.home_team || '';
  const awayTm  = m.awayTeamName || m.away_team || '';
  const homeScr = m.homeTeamScore ?? m.homeTeamOtScore ?? m.home_score ?? '-';
  const awayScr = m.awayTeamScore ?? m.awayTeamOtScore ?? m.away_score ?? '-';
  const result  = m.markedTeamResult; /* WON / LOST / DRAW */
  const resCls  = result === 'WON' ? 'bball-h2h-w' : (result === 'LOST' ? 'bball-h2h-l' : 'bball-h2h-d');
  const resLbl  = result === 'WON' ? 'G' : (result === 'LOST' ? 'M' : 'B');

  /* Check half-time score */
  const htHomeScr = m.htHomeScore ?? null;
  const htAwayScr = m.htAwayScore ?? null;
  const htStr = (htHomeScr != null && htAwayScr != null) ? `<span class="bball-h2h-ht">(${htHomeScr}-${htAwayScr})</span>` : '';

  return `
    <div class="bball-h2h-row">
      <span class="bball-h2h-date">${esc(date)}</span>
      <span class="bball-h2h-team home">${esc(homeTm)}</span>
      <span class="bball-h2h-score">${esc(String(homeScr))} – ${esc(String(awayScr))}${htStr}</span>
      <span class="bball-h2h-team away">${esc(awayTm)}</span>
      ${result ? `<span class="bball-h2h-res ${resCls}">${resLbl}</span>` : '<span></span>'}
    </div>`;
}

/* ── PUAN DURUMU TAB ─────────────────────────────────── */
function buildBballStandingsTab(row) {
  const sdata = safeParseJSON(row.standings, null);
  if (!sdata) {
    return {
      hasContent: false,
      html: `<div class="bball-empty" style="padding:40px 20px;"><div class="bball-empty-icon">📋</div><div>Puan durumu verisi mevcut değil</div></div>`
    };
  }

  /* Supports both direct standings object and nested season.tables */
  let tables = [];
  try {
    if (sdata.season?.tables)       tables = sdata.season.tables;
    else if (sdata.tables)          tables = sdata.tables;
    else if (Array.isArray(sdata))  tables = sdata;
    else if (sdata.tablerows)       tables = [sdata];
  } catch(e) {}

  if (!tables.length) {
    return {
      hasContent: false,
      html: `<div class="bball-empty" style="padding:40px 20px;"><div class="bball-empty-icon">📋</div><div>Puan durumu verisi mevcut değil</div></div>`
    };
  }

  let html = '';

  tables.forEach(table => {
    const rows = table.tablerows || [];
    if (!rows.length) return;

    const tname = table.name || table.abbr || '';
    html += `<div class="bball-dtl-section">`;
    if (tname) html += `<div class="bball-dtl-sh">${esc(tname)}</div>`;

    html += `
      <div class="bball-std-wrap">
        <table class="bball-std-table">
          <thead>
            <tr>
              <th class="bball-std-pos">#</th>
              <th class="bball-std-team">Takım</th>
              <th title="Oynanan">O</th>
              <th title="Galibiyet">G</th>
              <th title="Mağlubiyet">M</th>
              <th title="Attığı Sayı">AS</th>
              <th title="Yediği Sayı">YS</th>
              <th title="Averaj">Avg</th>
              <th title="Kazanma Yüzdesi">%</th>
            </tr>
          </thead>
          <tbody>`;

    rows.forEach(r => {
      const isHome = (r.team?.name || '').toLowerCase() === row.home_team.toLowerCase();
      const isAway = (r.team?.name || '').toLowerCase() === row.away_team.toLowerCase();
      const highlight = isHome ? 'bball-std-home' : (isAway ? 'bball-std-away' : '');

      /* Promotion badge */
      const promo = r.promotion;
      let promoCls = '';
      if (promo?.cssclass?.includes('playoff'))       promoCls = 'bball-std-promo';
      if (promo?.cssclass?.includes('promotionplay')) promoCls = 'bball-std-qual';

      const pct = r.pctTotal != null ? (r.pctTotal * 100).toFixed(1) : '-';
      const avg = r.goalDiffTotal != null
        ? (r.goalDiffTotal > 0 ? '+' : '') + r.goalDiffTotal
        : '-';
      const avgCls = r.goalDiffTotal > 0 ? 'bball-std-pos' : (r.goalDiffTotal < 0 ? 'bball-std-neg' : '');

      html += `
        <tr class="${highlight}">
          <td class="bball-std-pos-cell">
            ${promoCls ? `<span class="bball-std-dot ${promoCls}"></span>` : ''}
            ${r.pos ?? '-'}
          </td>
          <td class="bball-std-team-cell">
            ${r.team?.haslogo ? `<img src="https://sportradar.com/img/team_logo/${r.team._id}.png" class="bball-std-logo" onerror="this.style.display='none'" alt="">` : ''}
            <span class="bball-std-tname">${esc(r.team?.name || '-')}</span>
          </td>
          <td>${r.total ?? '-'}</td>
          <td class="bball-std-g">${r.winTotal ?? '-'}</td>
          <td class="bball-std-m">${r.lossTotal ?? '-'}</td>
          <td>${r.goalsForTotal ?? '-'}</td>
          <td>${r.goalsAgainstTotal ?? '-'}</td>
          <td class="${avgCls}">${avg}</td>
          <td class="bball-std-pct">${pct !== '-' ? pct + '%' : '-'}</td>
        </tr>`;
    });

    html += `</tbody></table></div>`;

    /* Legend */
    html += `
      <div class="bball-std-legend">
        <span><span class="bball-std-dot bball-std-promo"></span> Playoff</span>
        <span><span class="bball-std-dot bball-std-qual"></span> Eleme Playoff</span>
      </div>`;

    html += `</div>`;
  });

  if (!html) {
    return {
      hasContent: false,
      html: `<div class="bball-empty" style="padding:40px 20px;"><div class="bball-empty-icon">📋</div><div>Puan durumu verisi mevcut değil</div></div>`
    };
  }

  return { hasContent: true, html };
}

/* ── ROW LOOKUP ──────────────────────────────────────── */
function _findBballRow(id) {
  const sid = String(id);
  /* 1) rowCache (canlı + arşiv satırları) */
  if (B.rowCache[sid]) return B.rowCache[sid];
  /* 2) Archive raw event cache → dönüştür */
  if (B.archiveCache[sid]) return archiveEventToRow(B.archiveCache[sid]);
  return null;
}

/* ── UI HELPERS ─────────────────────────────────────── */
function showLoading(msg = 'Yükleniyor…') {
  document.getElementById('bball-root').innerHTML = `
    <div class="bball-empty">
      <div class="bball-empty-icon">⏳</div><div>${msg}</div>
    </div>`;
}
function showEmpty(msg) {
  document.getElementById('bball-root').innerHTML = `
    <div class="bball-empty">
      <div class="bball-empty-icon">📭</div><div>${msg}</div>
    </div>`;
}
function showError(msg) {
  document.getElementById('bball-root').innerHTML = `
    <div class="bball-empty">
      <div class="bball-empty-icon">⚠️</div><div>${msg}</div>
    </div>`;
}

function updateLiveCount(rows) {
  const n = rows.filter(m => bballStatus(m).live).length;
  const el    = document.getElementById('bball-live-n');
  const sbEl  = document.getElementById('sb-bball-live-n');
  const badge = document.getElementById('bball-tb-live');
  const badgeN = document.getElementById('bball-tb-live-n');
  if (el) el.textContent = n;
  if (sbEl) sbEl.textContent = n;
  if (badge) badge.style.display = n > 0 ? 'flex' : 'none';
  if (badgeN) badgeN.textContent = n;
}

/* ── COUNTDOWN ──────────────────────────────────────── */
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
      /* Açık modal varsa güncelle */
      if (B.detail && document.getElementById('bball-modal').classList.contains('open')) {
        const fresh = B.rowCache[String(B.detail.id)];
        if (fresh) { B.detail = fresh; renderBballModal(fresh); }
      }
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

function startBballTick() {
  if (B.tickTimer) clearInterval(B.tickTimer);
  B.tickTimer = setInterval(() => {
    /* Görsel tick için yer bırakıldı */
  }, 1000);
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
  startBballCountdown();
  startBballTick();

  document.getElementById('bball-modal').addEventListener('click', e => {
    if (e.target.id === 'bball-modal') closeBballModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBballModal();
  });
}

document.addEventListener('DOMContentLoaded', initBball);
