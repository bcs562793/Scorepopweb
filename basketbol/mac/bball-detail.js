/* ═══════════════════════════════════════════════════════
   SCOREPOP — bball-detail.js  (v1.0)
   Basketbol maç detay sayfası  /basketbol/mac/[id]-slug

   Akış:
     1. URL'den match ID parse et
     2. Supabase live_bball'dan fetch et
     3. Bulunamazsa GitHub arşivden dene
     4. Render: hero + 4 sekme (Özet / İstatistik / H2H / Puan Durumu)
     5. SEO: meta title/description, og:tags, Schema.org SportsEvent
═══════════════════════════════════════════════════════ */
'use strict';

const BBALL_ARCHIVE_BASE = 'https://raw.githubusercontent.com/bcs562793/blyarchieve/main/data/raw';

let D = { row: null, tab: 'oz', refreshTimer: null };

/* ── HELPERS ─────────────────────────────────────────── */
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(iso){ if(!iso) return '--:--'; try { const d=new Date(iso); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; } catch{return '--:--';} }
function safeJSON(v,fb){ if(!v) return fb; if(typeof v==='object') return v; try{return JSON.parse(v);}catch{return fb;} }
function makeSlug(...parts){ return parts.filter(Boolean).join('-vs-').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); }

/* ── STATUS ─────────────────────────────────────────── */
function bballStatus(m) {
  const LIVE = {'1Q':'Ç1','Q1':'Ç1','2Q':'Ç2','Q2':'Ç2','HT':'DEVRE','HALF':'DEVRE','3Q':'Ç3','Q3':'Ç3','4Q':'Ç4','Q4':'Ç4','OT':'UZT','OT1':'UZT1','OT2':'UZT2','LIVE':'CANLI'};
  const DONE = new Set(['FT','AOT','FINISHED','PLAYED','POST']);
  const s = (m.status_short||'').toUpperCase();
  if (DONE.has(s)) return {live:false,done:true,label:'Maç Sonu',cls:'done'};
  if (LIVE[s]) { let label=LIVE[s]; if(m.match_clock) label+=` ${m.match_clock}`; return {live:true,done:false,label,cls:'live'}; }
  return {live:false,done:false,label:fmtTime(m.scheduled_at||m.matchDate),cls:'sched'};
}

/* ── URL PARSING ─────────────────────────────────────── */
function parseIdFromURL() {
  const parts = window.location.pathname.split('/');
  const macIdx = parts.indexOf('mac');
  if (macIdx === -1) return null;
  const segment = parts[macIdx + 1] || '';
  const id = segment.split('-')[0];
  return id || null;
}

/* ── DATA FETCH ─────────────────────────────────────── */
async function fetchMatchData(id) {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /* Try live_bball */
  const numId = parseInt(id, 10);
  if (!isNaN(numId)) {
    const { data, error } = await sb.from('live_bball').select('*').eq('id', numId).single();
    if (!error && data) return data;
  }

  /* Try betradar_id */
  const { data: bData } = await sb.from('live_bball').select('*').eq('betradar_id', id).limit(1);
  if (bData?.length) return bData[0];

  /* Try archive — find today or yesterday's archive */
  return await fetchArchiveMatch(id);
}

async function fetchArchiveMatch(id) {
  const today = new Date();
  for (let i = 0; i <= 14; i++) {
    const d = new Date(today.getTime() - i*86400000);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    try {
      const res = await fetch(`${BBALL_ARCHIVE_BASE}/${dateStr}/events.json`);
      if (!res.ok) continue;
      const events = await res.json();
      const arr = Array.isArray(events) ? events : (events.events||events.data||[]);
      const found = arr.find(e => String(e.sbsEventId)===String(id) || String(e.betRadarId)===String(id));
      if (found) return archiveEventToRow(found);
    } catch {}
  }
  return null;
}

function archiveEventToRow(e) {
  const toNum = v => (v!=null&&v!==''?+v:null);
  return {
    id: e.sbsEventId||e.betRadarId,
    league_name: e.competitionName||'', country:'',
    home_team: e.homeTeam||e.homeFormDetail?.title||'',
    away_team: e.awayTeam||e.awayFormDetail?.title||'',
    home_avatar:null, away_avatar:null,
    status_short: e.matchStatus==='PLAYED'?'FT':'NS',
    home_score:toNum(e.scoreTotal?.home), away_score:toNum(e.scoreTotal?.away),
    home_q1:toNum(e.scoreQ1?.home), away_q1:toNum(e.scoreQ1?.away),
    home_q2:toNum(e.scoreQ2?.home), away_q2:toNum(e.scoreQ2?.away),
    home_q3:toNum(e.scoreQ3?.home), away_q3:toNum(e.scoreQ3?.away),
    home_q4:toNum(e.scoreQ4?.home), away_q4:toNum(e.scoreQ4?.away),
    home_ot:null, away_ot:null, period:null, match_clock:null,
    scheduled_at: e.matchDate||e.date||null,
    home_recent_form: JSON.stringify(e.homeFormDetail?.recentForms||[]),
    away_recent_form: JSON.stringify(e.awayFormDetail?.recentForms||[]),
    standings: JSON.stringify(e.standing||null),
    h2h: JSON.stringify(e.h2h||null),
    live_stats: null,
  };
}

/* ── SEO ─────────────────────────────────────────────── */
function setSEO(row, st) {
  const hs = row.home_score, as = row.away_score;
  const hasScore = hs!=null && as!=null && st.done;
  const scoreStr = hasScore ? `${hs}-${as}` : '-';

  let title, desc;
  if (st.done) {
    title = `${row.home_team} ${scoreStr} ${row.away_team} Maç Sonucu${row.league_name?' — '+row.league_name:''}`;
    desc  = `${row.home_team} ${scoreStr} ${row.away_team} maç sonucu. Periyot skorları, istatistikler ve form bilgileri. ${row.league_name||'Basketbol'}.`;
  } else if (st.live) {
    title = `🔴 ${row.home_team} ${hs??'-'}-${as??'-'} ${row.away_team} CANLI`;
    desc  = `${row.home_team} vs ${row.away_team} canlı skor. ${st.label}. ${row.league_name||'Basketbol'} canlı maç takibi.`;
  } else {
    title = `${row.home_team} - ${row.away_team}${row.league_name?' | '+row.league_name:''} | Basketbol`;
    desc  = `${row.home_team} - ${row.away_team} maçı. ${row.league_name||'Basketbol'}. Canlı skor, istatistikler ve puan durumu ScorePop'ta.`;
  }

  document.title = `${title} | ScorePop`;

  const setMeta = (name, val) => {
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) { el = document.createElement('meta'); el.name=name; document.head.appendChild(el); }
    el.content = val;
  };
  const setOG = (prop, val) => {
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (!el) { el = document.createElement('meta'); el.setAttribute('property',prop); document.head.appendChild(el); }
    el.content = val;
  };

  setMeta('description', desc);
  setOG('og:title', title);
  setOG('og:description', desc);
  setOG('og:url', window.location.href);
  setOG('og:type', 'article');
  setOG('og:image', row.home_avatar || row.away_avatar || 'https://scorepop.com.tr/logo.png');

  /* Canonical */
  let canon = document.querySelector('link[rel="canonical"]');
  if (!canon) { canon=document.createElement('link'); canon.rel='canonical'; document.head.appendChild(canon); }
  canon.href = window.location.origin + window.location.pathname;

  /* Schema.org SportsEvent */
  const startISO = row.scheduled_at ? new Date(row.scheduled_at).toISOString() : new Date().toISOString();
  const schema = {
    '@context':'https://schema.org',
    '@type':'SportsEvent',
    name:`${row.home_team} - ${row.away_team}`,
    sport:'Basketball',
    description: desc,
    url: window.location.href,
    startDate: startISO,
    eventStatus: st.live ? 'https://schema.org/EventLive' : (st.done ? 'https://schema.org/EventCompleted' : 'https://schema.org/EventScheduled'),
    organizer: { '@type':'SportsOrganization', name: row.league_name||'Basketball', url:'https://scorepop.com.tr' },
    performer: [{ '@type':'SportsTeam', name:row.home_team }, { '@type':'SportsTeam', name:row.away_team }],
    homeTeam: { '@type':'SportsTeam', name:row.home_team },
    awayTeam: { '@type':'SportsTeam', name:row.away_team },
    ...(hasScore ? { homeScore:{'@type':'Integer',value:hs}, awayScore:{'@type':'Integer',value:as} } : {}),
  };
  let jsonld = document.getElementById('bd-jsonld');
  if (!jsonld) { jsonld=document.createElement('script'); jsonld.id='bd-jsonld'; jsonld.type='application/ld+json'; document.head.appendChild(jsonld); }
  jsonld.textContent = JSON.stringify(schema);

  /* BreadcrumbList */
  const bc = {
    '@context':'https://schema.org','@type':'BreadcrumbList',
    itemListElement:[
      {'@type':'ListItem',position:1,name:'Ana Sayfa',item:'https://scorepop.com.tr/'},
      {'@type':'ListItem',position:2,name:'Basketbol',item:'https://scorepop.com.tr/basketbol/'},
      {'@type':'ListItem',position:3,name:`${row.home_team} - ${row.away_team}`,item:window.location.href},
    ]
  };
  let bcld = document.getElementById('bd-breadcrumb');
  if (!bcld) { bcld=document.createElement('script'); bcld.id='bd-breadcrumb'; bcld.type='application/ld+json'; document.head.appendChild(bcld); }
  bcld.textContent = JSON.stringify(bc);
}

/* ═══════════════════════════════════════════════════════
   RENDER — Hero + Tabs + Panels
═══════════════════════════════════════════════════════ */
function renderDetail(row) {
  D.row = row;
  const st  = bballStatus(row);
  const isNS = !st.live && !st.done;

  setSEO(row, st);

  /* Logo helpers */
  const hl = row.home_avatar
    ? `<img src="${esc(row.home_avatar)}" onerror="this.style.display='none'" alt="${esc(row.home_team)}" class="bd-logo">`
    : `<div class="bd-logo-ph">🏀</div>`;
  const al = row.away_avatar
    ? `<img src="${esc(row.away_avatar)}" onerror="this.style.display='none'" alt="${esc(row.away_team)}" class="bd-logo">`
    : `<div class="bd-logo-ph">🏀</div>`;

  /* ── SCORE ROW ── */
  let scoreHtml;
  if (isNS) {
    scoreHtml = `<div class="bd-score-time">${esc(st.label)}</div>`;
  } else {
    const hs = row.home_score ?? '-', as = row.away_score ?? '-';
    let hcls='', acls='';
    if (st.done) {
      if (+hs>+as){hcls='bd-win';acls='bd-loss';} else if (+as>+hs){acls='bd-win';hcls='bd-loss';}
    }
    scoreHtml = `
      <div class="bd-score-box${st.live?' live':''}">
        <span class="bd-sn ${hcls}">${hs}</span>
        <span class="bd-sep">–</span>
        <span class="bd-sn ${acls}">${as}</span>
      </div>`;
  }

  /* ── QUARTER MINI STRIP (under score) ── */
  let qStrip = '';
  if (!isNS) {
    const qs = [
      [row.home_q1,row.away_q1,'Ç1'],[row.home_q2,row.away_q2,'Ç2'],
      [row.home_q3,row.away_q3,'Ç3'],[row.home_q4,row.away_q4,'Ç4'],
    ];
    if (row.home_ot!=null||row.away_ot!=null) qs.push([row.home_ot,row.away_ot,'UZT']);
    const items = qs.filter(([h,a])=>h!=null||a!=null).map(([h,a,l])=>{
      const isAct=st.live&&((l==='Ç1'&&['1Q','Q1'].includes(row.status_short))||(l==='Ç2'&&['2Q','Q2'].includes(row.status_short))||(l==='Ç3'&&['3Q','Q3'].includes(row.status_short))||(l==='Ç4'&&['4Q','Q4'].includes(row.status_short))||(l==='UZT'&&row.status_short?.toUpperCase().startsWith('OT')));
      return `<span class="bd-qchip${isAct?' active':''}"><b>${l}</b> ${h??'-'}–${a??'-'}</span>`;
    });
    if (items.length) qStrip=`<div class="bd-qstrip">${items.join('')}</div>`;
  }

  /* ── TABS ── */
  const ozHtml  = buildOzetTab(row, st, isNS);
  const stData  = buildStatsTab(row);
  const h2Data  = buildH2HTab(row);
  const pdData  = buildStandingsTab(row);

  /* ── STATUS BADGE ── */
  let statusBadge;
  if (st.live) {
    statusBadge = `<span class="bd-badge live"><span class="bd-badge-dot"></span>${esc(st.label)}</span>`;
  } else if (st.done) {
    statusBadge = `<span class="bd-badge done">MS</span>`;
  } else {
    statusBadge = `<span class="bd-badge sched">${esc(st.label)}</span>`;
  }

  /* ── FORM MINI ── */
  const hForm = safeJSON(row.home_recent_form,[]);
  const aForm = safeJSON(row.away_recent_form,[]);
  const formBadges = arr => (arr||[]).slice(0,5).map(r=>`<span class="bd-fb ${r==='WON'?'w':'l'}">${r==='WON'?'G':'M'}</span>`).join('');

  document.getElementById('bd-root').innerHTML = `

    <!-- HERO -->
    <div class="bd-hero">
      <div class="bd-league">
        <span class="bd-league-name">${esc(row.league_name||'')}</span>
      </div>

      <div class="bd-matchup">
        <!-- Home -->
        <div class="bd-team">
          <div class="bd-logo-wrap">${hl}</div>
          <div class="bd-tname">${esc(row.home_team)}</div>
          <div class="bd-form">${formBadges(hForm)}</div>
        </div>

        <!-- Center -->
        <div class="bd-center">
          ${scoreHtml}
          ${statusBadge}
          ${qStrip}
        </div>

        <!-- Away -->
        <div class="bd-team">
          <div class="bd-logo-wrap">${al}</div>
          <div class="bd-tname">${esc(row.away_team)}</div>
          <div class="bd-form">${formBadges(aForm)}</div>
        </div>
      </div>
    </div>

    <!-- TABS -->
    <div class="bd-tabs" id="bd-tabbar">
      <button class="bd-tab active" onclick="switchBDTab('oz',this)">Özet</button>
      <button class="bd-tab${stData.hasContent?'':' dim'}" onclick="switchBDTab('st',this)">İstatistik</button>
      <button class="bd-tab${h2Data.hasContent?'':' dim'}" onclick="switchBDTab('h2',this)">H2H</button>
      <button class="bd-tab${pdData.hasContent?'':' dim'}" onclick="switchBDTab('pd',this)">Puan Durumu</button>
    </div>

    <!-- PANELS -->
    <div id="bdp-oz" class="bd-panel active">${ozHtml}</div>
    <div id="bdp-st" class="bd-panel">${stData.html}</div>
    <div id="bdp-h2" class="bd-panel">${h2Data.html}</div>
    <div id="bdp-pd" class="bd-panel">${pdData.html}</div>
  `;
}

function switchBDTab(tab, el) {
  D.tab = tab;
  document.querySelectorAll('.bd-tab').forEach(t=>t.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('.bd-panel').forEach(p=>p.classList.remove('active'));
  const p = document.getElementById(`bdp-${tab}`);
  if (p) p.classList.add('active');
}

/* ═══════════════════════════════════════════════════════
   ÖZET TAB
═══════════════════════════════════════════════════════ */
function buildOzetTab(row, st, isNS) {
  let html = '';

  if (!isNS) {
    const quarters = [
      {lbl:'Ç1',h:row.home_q1,a:row.away_q1},
      {lbl:'Ç2',h:row.home_q2,a:row.away_q2},
      {lbl:'Devre',h:(row.home_q1!=null&&row.home_q2!=null)?+row.home_q1+ +row.home_q2:null,
                   a:(row.away_q1!=null&&row.away_q2!=null)?+row.away_q1+ +row.away_q2:null,sub:true},
      {lbl:'Ç3',h:row.home_q3,a:row.away_q3},
      {lbl:'Ç4',h:row.home_q4,a:row.away_q4},
    ];
    if (row.home_ot!=null||row.away_ot!=null) quarters.push({lbl:'Uzatma',h:row.home_ot,a:row.away_ot});
    quarters.push({lbl:'Toplam',h:row.home_score,a:row.away_score,total:true});

    const trs = quarters.filter(q=>q.h!=null||q.a!=null).map(q=>{
      const cls=q.total?'bd-tr-total':(q.sub?'bd-tr-sub':'');
      let hcls='',acls='';
      if (!q.sub&&!q.total&&q.h!=null&&q.a!=null){if(+q.h>+q.a){hcls='bd-cell-w';acls='bd-cell-l';}else if(+q.a>+q.h){acls='bd-cell-w';hcls='bd-cell-l';}}
      return `<tr class="${cls}"><td>${q.lbl}</td><td class="${hcls}">${q.h??'-'}</td><td class="${acls}">${q.a??'-'}</td></tr>`;
    }).join('');

    if (trs) {
      html += `<div class="bd-section">
        <div class="bd-sh">Periyot Skorları</div>
        <table class="bd-qtr-table">
          <thead><tr><th></th><th>${esc(row.home_team)}</th><th>${esc(row.away_team)}</th></tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>`;
    }
  }

  if (!html) html = `<div class="bd-empty"><div class="bd-ei">📭</div><div>Veri henüz mevcut değil</div></div>`;
  return html;
}

/* ═══════════════════════════════════════════════════════
   İSTATİSTİK TAB
═══════════════════════════════════════════════════════ */
function buildStatsTab(row) {
  let statsData = null;
  try {
    if (row.live_stats) statsData = typeof row.live_stats==='string'?JSON.parse(row.live_stats):row.live_stats;
  } catch{}
  if (!statsData) return { hasContent:false, html:`<div class="bd-empty"><div class="bd-ei">📊</div><div>İstatistik verisi bu maç için mevcut değil</div></div>` };

  const KEYS=[
    {key:'_2_sayi',label:'2 Sayı %'},
    {key:'_3_sayi',label:'3 Sayı %'},
    {key:'serbest_atis',label:'Serbest Atış %'},
    {key:'ribaund',label:'Ribaund'},
    {key:'asist',label:'Asist'},
    {key:'top_kapma',label:'Top Kapma'},
    {key:'blok',label:'Blok'},
    {key:'top_kaybi',label:'Top Kaybı'},
  ];

  const genel = statsData.GENEL||statsData;
  let rows='';
  KEYS.forEach(({key,label})=>{
    const v=genel[key]; if(!v) return;
    const hv=parseFloat(v.home)||0, av=parseFloat(v.away)||0, tot=hv+av;
    const hp=tot>0?Math.round(hv/tot*100):50;
    rows+=`<div class="bd-stat-row">
      <span class="bd-sv home">${v.home}</span>
      <div class="bd-sb-wrap">
        <div class="bd-sb"><div class="bd-sb-h" style="width:${hp}%"></div><div class="bd-sb-a" style="width:${100-hp}%"></div></div>
        <div class="bd-sl">${label}</div>
      </div>
      <span class="bd-sv away">${v.away}</span>
    </div>`;
  });

  if (!rows) return {hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">📊</div><div>İstatistik verisi mevcut değil</div></div>`};

  return {hasContent:true, html:`
    <div class="bd-section">
      <div class="bd-stat-hdr">
        <span>${esc(row.home_team)}</span>
        <span></span>
        <span style="text-align:right">${esc(row.away_team)}</span>
      </div>
      ${rows}
    </div>`};
}

/* ═══════════════════════════════════════════════════════
   H2H TAB
═══════════════════════════════════════════════════════ */
function buildH2HTab(row) {
  const h2h = safeJSON(row.h2h, null);
  if (!h2h) return {hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">🆚</div><div>H2H verisi mevcut değil</div></div>`};

  let html='', hasContent=false;

  /* Aralarındaki maçlar */
  const between = h2h.matchesBetween;
  const bMatches = between?.matches||between?.teamForm||[];
  if (between?.emptyMessage&&!bMatches.length) {
    html+=`<div class="bd-section"><div class="bd-sh">🆚 Aralarındaki Maçlar</div><div class="bd-h2h-empty">${esc(between.emptyMessage)}</div></div>`;
    hasContent=true;
  } else if (bMatches.length) {
    hasContent=true;
    html+=`<div class="bd-section"><div class="bd-sh">🆚 Aralarındaki Maçlar</div><div class="bd-h2h-list">${bMatches.map(m=>renderH2HMatch(m)).join('')}</div></div>`;
  }

  /* Ev sahibi son maçlar */
  const hForms = h2h.homeTeamForms;
  if (hForms?.teamForm?.length) {
    hasContent=true;
    html+=`<div class="bd-section"><div class="bd-sh">🏠 ${esc(hForms.title||row.home_team)} Son Maçlar</div><div class="bd-h2h-list">${hForms.teamForm.slice(0,7).map(m=>renderH2HMatch(m,hForms.title||row.home_team)).join('')}</div></div>`;
  }

  /* Deplasman son maçlar */
  const aForms = h2h.awayTeamForms;
  if (aForms?.teamForm?.length) {
    hasContent=true;
    html+=`<div class="bd-section"><div class="bd-sh">✈️ ${esc(aForms.title||row.away_team)} Son Maçlar</div><div class="bd-h2h-list">${aForms.teamForm.slice(0,7).map(m=>renderH2HMatch(m,aForms.title||row.away_team)).join('')}</div></div>`;
  }

  if (!html) return {hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">🆚</div><div>H2H verisi mevcut değil</div></div>`};
  return {hasContent,html};
}

function renderH2HMatch(m, markedTeam) {
  const date = m.date||'';
  const hTm  = m.homeTeamName||m.home_team||'';
  const aTm  = m.awayTeamName||m.away_team||'';
  const hScr = m.homeTeamScore??m.homeTeamOtScore??m.home_score??'-';
  const aScr = m.awayTeamScore??m.awayTeamOtScore??m.away_score??'-';
  const res  = m.markedTeamResult;
  const rcls = res==='WON'?'w':(res==='LOST'?'l':'d');
  const rlbl = res==='WON'?'G':(res==='LOST'?'M':'B');
  const ht   = (m.htHomeScore!=null&&m.htAwayScore!=null) ? `<span class="bd-h2h-ht">(${m.htHomeScore}–${m.htAwayScore})</span>` : '';
  const league = m.tournamentName||m.tournamentShortName||'';
  return `<div class="bd-h2h-row">
    <div class="bd-h2h-meta">
      <span class="bd-h2h-date">${esc(date)}</span>
      ${league?`<span class="bd-h2h-league">${esc(league)}</span>`:''}
    </div>
    <div class="bd-h2h-match">
      <span class="bd-h2h-t home">${esc(hTm)}</span>
      <span class="bd-h2h-sc">${esc(String(hScr))} – ${esc(String(aScr))}${ht}</span>
      <span class="bd-h2h-t away">${esc(aTm)}</span>
    </div>
    ${res?`<span class="bd-h2h-res ${rcls}">${rlbl}</span>`:'<span></span>'}
  </div>`;
}

/* ═══════════════════════════════════════════════════════
   PUAN DURUMU TAB
═══════════════════════════════════════════════════════ */
function buildStandingsTab(row) {
  const sdata = safeJSON(row.standings, null);
  if (!sdata) return {hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">📋</div><div>Puan durumu verisi mevcut değil</div></div>`};

  let tables=[];
  try {
    if (sdata.season?.tables)       tables=sdata.season.tables;
    else if (sdata.tables)          tables=sdata.tables;
    else if (Array.isArray(sdata))  tables=sdata;
    else if (sdata.tablerows)       tables=[sdata];
  } catch{}

  if (!tables.length) return {hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">📋</div><div>Puan durumu verisi mevcut değil</div></div>`};

  let html='';
  tables.forEach(table=>{
    const trows=table.tablerows||[]; if(!trows.length) return;
    const tname=table.name||table.abbr||'';
    html+=`<div class="bd-section">`;
    if (tname) html+=`<div class="bd-sh">${esc(tname)}</div>`;
    html+=`<div class="bd-std-wrap"><table class="bd-std-table">
      <thead><tr>
        <th class="c">#</th><th class="l">Takım</th>
        <th title="Oynanan">O</th><th title="Galibiyet" class="g">G</th>
        <th title="Mağlubiyet" class="m">M</th>
        <th title="Attığı Sayı">AS</th><th title="Yediği Sayı">YS</th>
        <th title="Averaj">Avg</th><th title="Kazanma %" class="pct">%</th>
      </tr></thead><tbody>`;

    trows.forEach(r=>{
      const isH=(r.team?.name||'').toLowerCase()===row.home_team.toLowerCase();
      const isA=(r.team?.name||'').toLowerCase()===row.away_team.toLowerCase();
      const hl=isH?'row-h':(isA?'row-a':'');
      const promo=r.promotion;
      let dotCls='';
      if (promo?.cssclass?.includes('promotionplayoff')) dotCls='dot-qual';
      else if (promo?.cssclass?.includes('playoff'))     dotCls='dot-playoff';
      const pct=r.pctTotal!=null?(r.pctTotal*100).toFixed(1)+' %':'-';
      const diff=r.goalDiffTotal;
      const avg=diff!=null?((diff>0?'+':'')+diff):'-';
      const avgCls=diff>0?'pos':(diff<0?'neg':'');
      html+=`<tr class="${hl}">
        <td class="c pos-cell">${dotCls?`<span class="td-dot ${dotCls}"></span>`:''}${r.pos??'-'}</td>
        <td class="team-cell">
          ${r.team?.haslogo?`<img src="https://sportradar.com/img/team_logo/${r.team._id}.png" class="td-logo" onerror="this.style.display='none'" alt="">` :''}
          <span class="td-tname">${esc(r.team?.name||'-')}</span>
        </td>
        <td>${r.total??'-'}</td>
        <td class="g">${r.winTotal??'-'}</td>
        <td class="m">${r.lossTotal??'-'}</td>
        <td>${r.goalsForTotal??'-'}</td>
        <td>${r.goalsAgainstTotal??'-'}</td>
        <td class="${avgCls}">${avg}</td>
        <td class="pct">${pct}</td>
      </tr>`;
    });

    html+=`</tbody></table></div>`;
    html+=`<div class="bd-legend"><span><span class="td-dot dot-playoff"></span> Playoff</span><span><span class="td-dot dot-qual"></span> Eleme</span></div>`;
    html+=`</div>`;
  });

  if (!html) return {hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">📋</div><div>Puan durumu verisi mevcut değil</div></div>`};
  return {hasContent:true,html};
}

/* ── LIVE REFRESH ────────────────────────────────────── */
async function refreshDetail(id) {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const numId = parseInt(id,10);
  if (isNaN(numId)) return;
  const {data,error} = await sb.from('live_bball').select('*').eq('id',numId).single();
  if (!error && data) { renderDetail(data); restoreTab(); }
}

function restoreTab() {
  const tab = D.tab;
  const el = document.querySelector(`.bd-tab[onclick*="'${tab}'"]`);
  if (el) switchBDTab(tab, el);
}

/* ── INIT ────────────────────────────────────────────── */
async function initDetail() {
  const id = parseIdFromURL();
  if (!id) { showDetailError('Geçersiz maç adresi.'); return; }

  showDetailLoading();

  if (typeof window.supabase === 'undefined') { showDetailError('Supabase SDK yüklenemedi.'); return; }

  const row = await fetchMatchData(id);
  if (!row) { showDetailError(`Maç verisi bulunamadı (ID: ${id})`); return; }

  renderDetail(row);

  /* Canlı maçta her 30sn refresh */
  const st = bballStatus(row);
  if (st.live) {
    D.refreshTimer = setInterval(()=>refreshDetail(id), 30000);
  }
}

function showDetailLoading() {
  document.getElementById('bd-root').innerHTML=`<div class="bd-init-loading"><div class="bd-spin"></div><div>Maç verisi yükleniyor…</div></div>`;
}
function showDetailError(msg) {
  document.getElementById('bd-root').innerHTML=`<div class="bd-init-error"><div class="bd-ei" style="font-size:32px">⚠️</div><div>${esc(msg)}</div><a class="bd-back-btn" href="/basketbol/">← Basketbol Sayfasına Dön</a></div>`;
}

document.addEventListener('DOMContentLoaded', initDetail);
