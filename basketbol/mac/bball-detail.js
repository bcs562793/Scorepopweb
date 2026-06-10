/* ═══════════════════════════════════════════════════════
   SCOREPOP — bball-detail.js  (v2.0)
   Basketbol maç detay sayfası  /basketbol/mac/[id]-slug

   Veri kaynakları (öncelik sırasıyla):
     1. Supabase live_bball  (canlı/bugünkü maçlar, tam veri)
     2. Supabase future_bball (ileri tarihli — temel bilgi)
     3. GitHub arşiv  basketball-{date}/events.json  (geçmiş maçlar)
═══════════════════════════════════════════════════════ */
'use strict';

const BBALL_ARCHIVE_BASE = 'https://raw.githubusercontent.com/bcs562793/blyarchieve/main/data/raw';

let D = { row: null, tab: 'oz', refreshTimer: null };

/* ── HELPERS ─────────────────────────────────────────── */
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(iso){ if(!iso)return '--:--'; try{const d=new Date(iso);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}catch{return '--:--';} }
function safeJSON(v,fb){
  if(!v)return fb;
  if(typeof v==='object')return v;
  try{
    let p=JSON.parse(v);
    /* Handle double-encoded: "\"[...]\"" → parse again */
    if(typeof p==='string') p=JSON.parse(p);
    return p;
  }catch{return fb;}
}
function makeSlug(...p){ return p.filter(Boolean).join('-vs-').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); }

/* ── STATUS ─────────────────────────────────────────── */
function bballStatus(m){
  const LM={'1Q':'Ç1','Q1':'Ç1','2Q':'Ç2','Q2':'Ç2','HT':'DEVRE','HALF':'DEVRE','3Q':'Ç3','Q3':'Ç3','4Q':'Ç4','Q4':'Ç4','OT':'UZT','OT1':'UZT1','OT2':'UZT2','LIVE':'CANLI'};
  const DONE=new Set(['FT','AOT','FINISHED','PLAYED','POST']);
  const s=(m.status_short||'').toUpperCase();
  if(DONE.has(s))return{live:false,done:true,label:'Maç Sonu',cls:'done'};
  if(LM[s]){let l=LM[s];if(m.match_clock)l+=` ${m.match_clock}`;return{live:true,done:false,label:l,cls:'live'};}
  return{live:false,done:false,label:fmtTime(m.scheduled_at||m.matchDate),cls:'sched'};
}

/* ── URL PARSING ─────────────────────────────────────── */
function parseIdFromURL(){
  const parts=window.location.pathname.split('/');
  const idx=parts.indexOf('mac');
  if(idx===-1)return null;
  const seg=parts[idx+1]||'';
  return seg.split('-')[0]||null;
}

/* ═══════════════════════════════════════════════════════
   ARCHIVE NORMALISATION  (paylaşılan fonksiyonlar)
═══════════════════════════════════════════════════════ */
function normalizeArchiveStanding(standing){
  if(!standing)return null;
  const groups=standing.general;
  if(!Array.isArray(groups)||!groups.length)return null;
  return{season:{tables:groups.map(g=>({
    name:g.name||'',
    tablerows:(g.teams||[]).map(t=>({
      pos:t.position,
      team:{name:t.name,haslogo:false,abbr:''},
      total:t.played,winTotal:t.won,lossTotal:t.lost,
      goalsForTotal:t.scored,goalsAgainstTotal:t.against,
      goalDiffTotal:(t.scored||0)-(t.against||0),
      pctTotal:parseFloat((t.wpg||'0').replace(',','.'))||0,
      promotion:null,
    })),
  }))},};
}

function normalizeArchiveH2H(e){
  const split=s=>{const mat=String(s||'').trim().match(/^(\d+)\s*[-:]\s*(\d+)/);return mat?[mat[1],mat[2]]:[(s||'').trim(),undefined];};
  const cvt=(fd,name)=>{
    if(!fd||!fd.matches?.length)return null;
    return{
      title:fd.title||name,
      recentForms:fd.recentForms||fd.matches.slice(0,5).map(m=>m.result||''),
      teamForm:fd.matches.map(m=>{const sc=split(m.score),ht=split(m.htScore);return{date:m.date,homeTeamName:m.home,awayTeamName:m.away,homeTeamScore:sc[0],awayTeamScore:sc[1],htHomeScore:ht[0],htAwayScore:ht[1],markedTeamResult:m.result,tournamentName:m.tournament||''};}),
    };
  };
  const hForms=cvt(e.homeFormDetail,e.homeTeam);
  const aForms=cvt(e.awayFormDetail,e.awayTeam);
  const between=(e.h2h||[]).map(m=>{const sc=split(m.score),ht=split(m.htScore);return{date:m.date,homeTeamName:m.home,awayTeamName:m.away,homeTeamScore:sc[0],awayTeamScore:sc[1],htHomeScore:ht[0],htAwayScore:ht[1]};});
  if(!hForms&&!aForms&&!between.length)return null;
  return{homeTeamForms:hForms,awayTeamForms:aForms,matchesBetween:between.length?{title:'Aralarındaki Maçlar',matches:between}:null};
}

function archiveEventToRow(e){
  const toNum=v=>(v!=null&&v!==''?+v:null);
  const id=String(e.sbsEventId||e.betRadarId||`arc_${Math.random().toString(36).slice(2)}`);
  return{
    id,_isArchive:true,
    league_name:e.competitionName||'',country:'',
    home_team:e.homeTeam||e.homeFormDetail?.title||'',
    away_team:e.awayTeam||e.awayFormDetail?.title||'',
    home_avatar:null,away_avatar:null,
    status_short:e.matchStatus==='PLAYED'?'FT':(e.matchStatus==='FIXTURE'?'NS':e.matchStatus||'NS'),
    home_score:toNum(e.scoreTotal?.home),away_score:toNum(e.scoreTotal?.away),
    home_q1:toNum(e.scoreQ1?.home),away_q1:toNum(e.scoreQ1?.away),
    home_q2:toNum(e.scoreQ2?.home),away_q2:toNum(e.scoreQ2?.away),
    home_q3:toNum(e.scoreQ3?.home),away_q3:toNum(e.scoreQ3?.away),
    home_q4:toNum(e.scoreQ4?.home),away_q4:toNum(e.scoreQ4?.away),
    home_ot:null,away_ot:null,period:null,match_clock:null,
    scheduled_at:e.matchDate||e.date||null,
    home_recent_form:JSON.stringify(e.homeFormDetail?.recentForms||e.homeRecentForm||[]),
    away_recent_form:JSON.stringify(e.awayFormDetail?.recentForms||e.awayRecentForm||[]),
    h2h:JSON.stringify(normalizeArchiveH2H(e)),
    standings:JSON.stringify(normalizeArchiveStanding(e.standing)),
    live_stats:null,
  };
}

/* ═══════════════════════════════════════════════════════
   DATA FETCH
═══════════════════════════════════════════════════════ */
async function fetchMatchData(id){
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const numId=parseInt(id,10);

  /* 1. live_bball by numeric id */
  if(!isNaN(numId)){
    const{data,error}=await sb.from('live_bball').select('*').eq('id',numId).single();
    if(!error&&data)return data;
  }

  /* 2. live_bball by betradar_id */
  const{data:bData}=await sb.from('live_bball').select('*').eq('betradar_id',id).limit(1);
  if(bData?.length)return bData[0];

  /* 3. live_bball by nesine_bid (= sbsEventId in archive) */
  if(!isNaN(numId)){
    const{data:nData}=await sb.from('live_bball').select('*').eq('nesine_bid',numId).limit(1);
    if(nData?.length)return nData[0];
  }

  /* 4. future_bball by nesine_bid */
  if(!isNaN(numId)){
    const{data:fData}=await sb.from('future_bball').select('*').eq('nesine_bid',numId).limit(1);
    if(fData?.length){
      const base=futureToRow(fData[0]);
      /* Enrich with archive H2H/standings if available */
      const enriched=await enrichFutureFromArchive(base,numId);
      return enriched;
    }
    /* Also try future_bball by id */
    const{data:fById}=await sb.from('future_bball').select('*').eq('id',numId).limit(1);
    if(fById?.length){
      const base=futureToRow(fById[0]);
      if(fById[0].nesine_bid){
        const enriched=await enrichFutureFromArchive(base,fById[0].nesine_bid);
        return enriched;
      }
      return base;
    }
  }

  /* 5. GitHub archive — scan recent days */
  return await fetchArchiveMatch(id);
}

/* future_bball row → display row */
function futureToRow(r){
  return{
    id:String(r.nesine_bid||r.id),_futureDbId:r.id,_nesine_bid:r.nesine_bid,
    league_name:r.league_name||'',country:r.country||'',
    home_team:r.home_team||'',away_team:r.away_team||'',
    home_avatar:null,away_avatar:null,
    status_short:'NS',home_score:null,away_score:null,
    home_q1:null,away_q1:null,home_q2:null,away_q2:null,
    home_q3:null,away_q3:null,home_q4:null,away_q4:null,
    home_ot:null,away_ot:null,period:null,match_clock:null,
    scheduled_at:r.starts_at,
    home_recent_form:'[]',away_recent_form:'[]',
    h2h:null,standings:null,live_stats:null,_isFuture:true,
  };
}

/* Enrich a future match row with H2H/standings from archive by sbsEventId */
async function enrichFutureFromArchive(baseRow, nesine_bid){
  try{
    /* The archive has fixture matches in date-based files.
       We search the near-future dates (up to 7 days out). */
    const today=new Date();
    for(let i=0;i<=7;i++){
      const d=new Date(today.getTime()+i*86400000);
      const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const res=await fetch(`${BBALL_ARCHIVE_BASE}/basketball-${dateStr}/events.json`);
      if(!res.ok)continue;
      const events=await res.json();
      const arr=Array.isArray(events)?events:(events.events||events.data||[]);
      const found=arr.find(e=>String(e.sbsEventId)===String(nesine_bid)||String(e.betRadarId)===String(nesine_bid));
      if(found){
        const archRow=archiveEventToRow(found);
        return{...baseRow,
          home_recent_form:archRow.home_recent_form,
          away_recent_form:archRow.away_recent_form,
          h2h:archRow.h2h,
          standings:archRow.standings,
        };
      }
    }
  }catch(e){console.warn('[enrichFuture]',e);}
  return baseRow;
}

/* Scan recent past dates in archive by sbsEventId */
async function fetchArchiveMatch(id){
  const today=new Date();
  for(let i=0;i<=14;i++){
    const d=new Date(today.getTime()-i*86400000);
    const dateStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    try{
      const res=await fetch(`${BBALL_ARCHIVE_BASE}/basketball-${dateStr}/events.json`);
      if(!res.ok)continue;
      const events=await res.json();
      const arr=Array.isArray(events)?events:(events.events||events.data||[]);
      const found=arr.find(e=>String(e.sbsEventId)===String(id)||String(e.betRadarId)===String(id));
      if(found)return archiveEventToRow(found);
    }catch{}
  }
  return null;
}

/* ── SEO ─────────────────────────────────────────────── */
function setSEO(row,st){
  const hs=row.home_score,as=row.away_score;
  const hasScore=hs!=null&&as!=null&&st.done;
  const scoreStr=hasScore?`${hs}-${as}`:'vs';
  let title,desc;
  if(st.done){title=`${row.home_team} ${scoreStr} ${row.away_team} Maç Sonucu${row.league_name?' — '+row.league_name:''}`;desc=`${row.home_team} ${scoreStr} ${row.away_team}. Periyot skorları, istatistikler. ${row.league_name||'Basketbol'}.`;}
  else if(st.live){title=`🔴 ${row.home_team} ${hs??'-'}-${as??'-'} ${row.away_team} CANLI`;desc=`${row.home_team} vs ${row.away_team} canlı. ${st.label}. ${row.league_name||'Basketbol'}.`;}
  else{title=`${row.home_team} - ${row.away_team}${row.league_name?' | '+row.league_name:''} | Basketbol`;desc=`${row.home_team} - ${row.away_team}. ${row.league_name||'Basketbol'}. H2H, puan durumu ScorePop'ta.`;}
  document.title=`${title} | ScorePop`;
  const setM=(n,v)=>{let el=document.querySelector(`meta[name="${n}"]`);if(!el){el=document.createElement('meta');el.name=n;document.head.appendChild(el);}el.content=v;};
  const setOG=(p,v)=>{let el=document.querySelector(`meta[property="${p}"]`);if(!el){el=document.createElement('meta');el.setAttribute('property',p);document.head.appendChild(el);}el.content=v;};
  setM('description',desc);setOG('og:title',title);setOG('og:description',desc);setOG('og:url',window.location.href);setOG('og:type','article');setOG('og:image',row.home_avatar||row.away_avatar||'https://scorepop.com.tr/logo.png');
  let canon=document.querySelector('link[rel="canonical"]');if(!canon){canon=document.createElement('link');canon.rel='canonical';document.head.appendChild(canon);}canon.href=window.location.origin+window.location.pathname;
  const startISO=row.scheduled_at?new Date(row.scheduled_at).toISOString():new Date().toISOString();
  const endISO=new Date(new Date(startISO).getTime()+2.5*60*60*1000).toISOString();
  const schema={'@context':'https://schema.org','@type':'SportsEvent',name:`${row.home_team} - ${row.away_team}`,sport:'Basketball',description:desc,url:window.location.href,startDate:startISO,endDate:endISO,eventStatus:st.live?'https://schema.org/EventLive':(st.done?'https://schema.org/EventCompleted':'https://schema.org/EventScheduled'),image:row.home_avatar||row.away_avatar||'https://scorepop.com.tr/logo.png',organizer:{'@type':'SportsOrganization',name:row.league_name||'Basketbol',url:'https://scorepop.com.tr'},performer:[{'@type':'SportsTeam',name:row.home_team},{'@type':'SportsTeam',name:row.away_team}],offers:{'@type':'Offer',url:window.location.origin+window.location.pathname,price:'0',priceCurrency:'TRY',availability:'https://schema.org/OnlineOnly'},location:{'@type':'Place',name:row.league_name||'Basketbol',address:{'@type':'PostalAddress',addressCountry:row.country||'TR'}},homeTeam:{'@type':'SportsTeam',name:row.home_team},awayTeam:{'@type':'SportsTeam',name:row.away_team},...(hasScore?{homeScore:{'@type':'Integer',value:hs},awayScore:{'@type':'Integer',value:as}}:{})};  
  offers:{'@type':'Offer',url:window.location.origin+window.location.pathname,price:'0',priceCurrency:'TRY',availability:'https://schema.org/OnlineOnly',validFrom:startISO}
  let jl=document.getElementById('bd-jsonld');if(!jl){jl=document.createElement('script');jl.id='bd-jsonld';jl.type='application/ld+json';document.head.appendChild(jl);}jl.textContent=JSON.stringify(schema);
  const bc={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Ana Sayfa',item:'https://scorepop.com.tr/'},{'@type':'ListItem',position:2,name:'Basketbol',item:'https://scorepop.com.tr/basketbol/'},{'@type':'ListItem',position:3,name:`${row.home_team} - ${row.away_team}`,item:window.location.href}]};
  let bcl=document.getElementById('bd-breadcrumb');if(!bcl){bcl=document.createElement('script');bcl.id='bd-breadcrumb';bcl.type='application/ld+json';document.head.appendChild(bcl);}bcl.textContent=JSON.stringify(bc);
}

/* ═══════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════ */
function renderDetail(row){
  D.row=row;
  const st=bballStatus(row);
  const isNS=!st.live&&!st.done;
  setSEO(row,st);

  const hl=row.home_avatar?`<img src="${esc(row.home_avatar)}" onerror="this.style.display='none'" alt="${esc(row.home_team)}" class="bd-logo">`:`<div class="bd-logo-ph">🏀</div>`;
  const al=row.away_avatar?`<img src="${esc(row.away_avatar)}" onerror="this.style.display='none'" alt="${esc(row.away_team)}" class="bd-logo">`:`<div class="bd-logo-ph">🏀</div>`;

  let scoreHtml;
  if(isNS){scoreHtml=`<div class="bd-score-time">${esc(st.label)}</div>`;}
  else{
    const hs=row.home_score??'-',as=row.away_score??'-';
    let hcls='',acls='';
    if(st.done){if(+hs>+as){hcls='bd-win';acls='bd-loss';}else if(+as>+hs){acls='bd-win';hcls='bd-loss';}}
    scoreHtml=`<div class="bd-score-box${st.live?' live':''}"><span class="bd-sn ${hcls}">${hs}</span><span class="bd-sep">–</span><span class="bd-sn ${acls}">${as}</span></div>`;
  }

  let qStrip='';
  if(!isNS){
    const qs=[[row.home_q1,row.away_q1,'Ç1'],[row.home_q2,row.away_q2,'Ç2'],[row.home_q3,row.away_q3,'Ç3'],[row.home_q4,row.away_q4,'Ç4']];
    if(row.home_ot!=null||row.away_ot!=null)qs.push([row.home_ot,row.away_ot,'UZT']);
    const items=qs.filter(([h,a])=>h!=null||a!=null).map(([h,a,l])=>{
      const ia=st.live&&((l==='Ç1'&&['1Q','Q1'].includes(row.status_short))||(l==='Ç2'&&['2Q','Q2'].includes(row.status_short))||(l==='Ç3'&&['3Q','Q3'].includes(row.status_short))||(l==='Ç4'&&['4Q','Q4'].includes(row.status_short))||(l==='UZT'&&row.status_short?.toUpperCase().startsWith('OT')));
      return `<span class="bd-qchip${ia?' active':''}"><b>${l}</b> ${h??'-'}–${a??'-'}</span>`;
    });
    if(items.length)qStrip=`<div class="bd-qstrip">${items.join('')}</div>`;
  }

  const hForm=safeJSON(row.home_recent_form,[]);
  const aForm=safeJSON(row.away_recent_form,[]);
  const formBadges=arr=>(arr||[]).slice(0,5).map(r=>`<span class="bd-fb ${r==='WON'?'w':'l'}">${r==='WON'?'G':'M'}</span>`).join('');

  let statusBadge;
  if(st.live)statusBadge=`<span class="bd-badge live"><span class="bd-badge-dot"></span>${esc(st.label)}</span>`;
  else if(st.done)statusBadge=`<span class="bd-badge done">MS</span>`;
  else statusBadge=`<span class="bd-badge sched">${esc(st.label)}</span>`;

  const ozHtml=buildOzetTab(row,st,isNS);
  const stData=buildStatsTab(row);
  const h2Data=buildH2HTab(row);
  const pdData=buildStandingsTab(row);

  document.getElementById('bd-root').innerHTML=`
    <div class="bd-hero">
      <div class="bd-league"><span class="bd-league-name">${esc(row.league_name||'')}</span></div>
      <div class="bd-matchup">
        <div class="bd-team">
          <div class="bd-logo-wrap">${hl}</div>
          <div class="bd-tname">${esc(row.home_team)}</div>
          <div class="bd-form">${formBadges(hForm)}</div>
        </div>
        <div class="bd-center">${scoreHtml}${statusBadge}${qStrip}</div>
        <div class="bd-team">
          <div class="bd-logo-wrap">${al}</div>
          <div class="bd-tname">${esc(row.away_team)}</div>
          <div class="bd-form">${formBadges(aForm)}</div>
        </div>
      </div>
    </div>
    <div class="bd-tabs" id="bd-tabbar">
      <button class="bd-tab active" onclick="switchBDTab('oz',this)">Özet</button>
      <button class="bd-tab${stData.hasContent?'':' dim'}" onclick="switchBDTab('st',this)">İstatistik</button>
      <button class="bd-tab${h2Data.hasContent?'':' dim'}" onclick="switchBDTab('h2',this)">H2H</button>
      <button class="bd-tab${pdData.hasContent?'':' dim'}" onclick="switchBDTab('pd',this)">Puan Durumu</button>
    </div>
    <div id="bdp-oz" class="bd-panel active">${ozHtml}</div>
    <div id="bdp-st" class="bd-panel">${stData.html}</div>
    <div id="bdp-h2" class="bd-panel">${h2Data.html}</div>
    <div id="bdp-pd" class="bd-panel">${pdData.html}</div>`;
}

function switchBDTab(tab,el){
  D.tab=tab;
  document.querySelectorAll('.bd-tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  document.querySelectorAll('.bd-panel').forEach(p=>p.classList.remove('active'));
  const p=document.getElementById(`bdp-${tab}`);if(p)p.classList.add('active');
}

/* ── ÖZET TAB ──────────────────────────────────────── */
function buildOzetTab(row,st,isNS){
  let html='';
  if(!isNS){
    const quarters=[
      {lbl:'Ç1',h:row.home_q1,a:row.away_q1},
      {lbl:'Ç2',h:row.home_q2,a:row.away_q2},
      {lbl:'Devre',h:(row.home_q1!=null&&row.home_q2!=null)?+row.home_q1+ +row.home_q2:null,a:(row.away_q1!=null&&row.away_q2!=null)?+row.away_q1+ +row.away_q2:null,sub:true},
      {lbl:'Ç3',h:row.home_q3,a:row.away_q3},
      {lbl:'Ç4',h:row.home_q4,a:row.away_q4},
    ];
    if(row.home_ot!=null||row.away_ot!=null)quarters.push({lbl:'Uzatma',h:row.home_ot,a:row.away_ot});
    quarters.push({lbl:'Toplam',h:row.home_score,a:row.away_score,total:true});
    const trs=quarters.filter(q=>q.h!=null||q.a!=null).map(q=>{
      const cls=q.total?'bd-tr-total':(q.sub?'bd-tr-sub':'');
      let hcls='',acls='';
      if(!q.sub&&!q.total&&q.h!=null&&q.a!=null){if(+q.h>+q.a){hcls='bd-cell-w';acls='bd-cell-l';}else if(+q.a>+q.h){acls='bd-cell-w';hcls='bd-cell-l';}}
      return `<tr class="${cls}"><td>${q.lbl}</td><td class="${hcls}">${q.h??'-'}</td><td class="${acls}">${q.a??'-'}</td></tr>`;
    }).join('');
    if(trs)html+=`<div class="bd-section"><div class="bd-sh">Periyot Skorları</div><table class="bd-qtr-table"><thead><tr><th></th><th>${esc(row.home_team)}</th><th>${esc(row.away_team)}</th></tr></thead><tbody>${trs}</tbody></table></div>`;
  }
  if(!html)html=`<div class="bd-empty"><div class="bd-ei">📭</div><div>${isNS?'Maç henüz başlamadı':'Veri mevcut değil'}</div></div>`;
  return html;
}

/* ── İSTATİSTİK TAB ────────────────────────────────────────────
   Gerçek live_stats formatı:
   [{periodCode:"GENEL", statistics:[{statisticsCode:"_2_SAYI",
     homeTeamValue:"53", awayTeamValue:"45", valueLabel:"2 Sayı"}]}]
──────────────────────────────────────────────────────────── */
function buildStatsTab(row){
  if(!row.live_stats) return{hasContent:false,html:_noStats()};

  /* Parse — handle single or double encoding */
  let parsed=null;
  try{
    parsed = typeof row.live_stats==='string' ? JSON.parse(row.live_stats) : row.live_stats;
    if(typeof parsed==='string') parsed = JSON.parse(parsed);
  }catch{ return{hasContent:false,html:_noStats()}; }

  /* Build statsMap: CODE → {home, away, label} */
  let statsMap = null;

  if(Array.isArray(parsed)){
    /* Current DB format: array of periods */
    const genel = parsed.find(p=>p.periodCode==='GENEL') || parsed[0];
    if(genel?.statistics?.length){
      statsMap = {};
      genel.statistics.forEach(s=>{
        statsMap[s.statisticsCode] = {
          home:  s.homeTeamValue,
          away:  s.awayTeamValue,
          label: s.valueLabel,
        };
      });
    }
  } else if(parsed && typeof parsed==='object'){
    /* Legacy format fallback: {GENEL:{_2_sayi:{home,away}}} */
    const genel = parsed.GENEL || parsed;
    statsMap = {};
    Object.entries(genel).forEach(([k,v])=>{
      if(v && v.home!=null) statsMap[k.toUpperCase()] = {home:v.home, away:v.away, label:k};
    });
  }

  if(!statsMap || !Object.keys(statsMap).length) return{hasContent:false,html:_noStats()};

  /* Preferred display order */
  const ORDER = ['_2_SAYI','_3_SAYI','SERBEST_ATIS','RIBAUND',
                 'RIBAUND_SAVUNMA','RIBAUND_HUCUM','ASIST',
                 'TOP_KAYBI','TOP_CALMA','BLOK','FAUL'];

  /* Show ordered keys first, then any remaining */
  const keys = [...ORDER, ...Object.keys(statsMap).filter(k=>!ORDER.includes(k))];

  let rowsHtml='';
  keys.forEach(code=>{
    const v=statsMap[code]; if(!v) return;
    const hv=parseFloat(v.home)||0, av=parseFloat(v.away)||0, tot=hv+av;
    const hp = tot>0 ? Math.round(hv/tot*100) : 50;
    rowsHtml+=`<div class="bd-stat-row">
      <span class="bd-sv home">${esc(v.home)}</span>
      <div class="bd-sb-wrap">
        <div class="bd-sb">
          <div class="bd-sb-h" style="width:${hp}%"></div>
          <div class="bd-sb-a" style="width:${100-hp}%"></div>
        </div>
        <div class="bd-sl">${esc(v.label||code)}</div>
      </div>
      <span class="bd-sv away">${esc(v.away)}</span>
    </div>`;
  });

  if(!rowsHtml) return{hasContent:false,html:_noStats()};
  return{hasContent:true, html:`
    <div class="bd-section">
      <div class="bd-stat-hdr">
        <span>${esc(row.home_team)}</span><span></span>
        <span style="text-align:right">${esc(row.away_team)}</span>
      </div>
      ${rowsHtml}
    </div>`};
}
function _noStats(){return`<div class="bd-empty"><div class="bd-ei">📊</div><div>İstatistik verisi bu maç için mevcut değil</div></div>`;}

/* ── H2H TAB ────────────────────────────────────────── */
function buildH2HTab(row){
  let h2h=safeJSON(row.h2h,null);
  if(!h2h)return{hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">🆚</div><div>H2H verisi mevcut değil</div></div>`};
  if(h2h.homeFormDetail||h2h.awayFormDetail||Array.isArray(h2h.h2h)){
    h2h=normalizeArchiveH2H(h2h);
  }
  if(!h2h)return{hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">🆚</div><div>H2H verisi mevcut değil</div></div>`};
  let html='',has=false;
  const between=h2h.matchesBetween;
  const bm=between?.matches||between?.teamForm||[];
  if(between?.emptyMessage&&!bm.length){html+=`<div class="bd-section"><div class="bd-sh">🆚 Aralarındaki Maçlar</div><div class="bd-h2h-empty">${esc(between.emptyMessage)}</div></div>`;has=true;}
  else if(bm.length){has=true;html+=`<div class="bd-section"><div class="bd-sh">🆚 Aralarındaki Maçlar</div><div class="bd-h2h-list">${bm.map(m=>renderH2HMatch(m)).join('')}</div></div>`;}
  const hf=h2h.homeTeamForms;
  if(hf?.teamForm?.length){has=true;html+=`<div class="bd-section"><div class="bd-sh">🏠 ${esc(hf.title||row.home_team)} Son Maçlar</div><div class="bd-h2h-list">${hf.teamForm.slice(0,7).map(m=>renderH2HMatch(m)).join('')}</div></div>`;}
  const af=h2h.awayTeamForms;
  if(af?.teamForm?.length){has=true;html+=`<div class="bd-section"><div class="bd-sh">✈️ ${esc(af.title||row.away_team)} Son Maçlar</div><div class="bd-h2h-list">${af.teamForm.slice(0,7).map(m=>renderH2HMatch(m)).join('')}</div></div>`;}
  if(!html)return{hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">🆚</div><div>H2H verisi mevcut değil</div></div>`};
  return{hasContent:has,html};
}

function renderH2HMatch(m){
  const ne=v=>(v!=null&&v!=='');
  const hScr=ne(m.homeTeamScore)?m.homeTeamScore:ne(m.homeTeamOtScore)?m.homeTeamOtScore:'-';
  const aScr=ne(m.awayTeamScore)?m.awayTeamScore:ne(m.awayTeamOtScore)?m.awayTeamOtScore:'-';
  const res=m.markedTeamResult;
  const rc=res==='WON'?'w':(res==='LOST'?'l':'d');
  const rl=res==='WON'?'G':(res==='LOST'?'M':'B');
  const ht=(m.htHomeScore!=null&&m.htAwayScore!=null)?`<span class="bd-h2h-ht">(${m.htHomeScore}–${m.htAwayScore})</span>`:'';
  const lg=m.tournamentName||'';
  return `<div class="bd-h2h-row">
    <div>
      <div class="bd-h2h-meta"><span class="bd-h2h-date">${esc(m.date||'')}</span>${lg?`<span class="bd-h2h-league">${esc(lg)}</span>`:''}</div>
      <div class="bd-h2h-match">
        <span class="bd-h2h-t home">${esc(m.homeTeamName||'')}</span>
        <span class="bd-h2h-sc">${esc(String(hScr))} – ${esc(String(aScr))}${ht}</span>
        <span class="bd-h2h-t away">${esc(m.awayTeamName||'')}</span>
      </div>
    </div>
    ${res?`<span class="bd-h2h-res ${rc}">${rl}</span>`:'<span></span>'}
  </div>`;
}

/* ── PUAN DURUMU TAB ─────────────────────────────────── */
function buildStandingsTab(row){
  const sdata=safeJSON(row.standings,null);
  if(!sdata)return{hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">📋</div><div>Puan durumu verisi mevcut değil</div></div>`};

  /* Handle both live_bball format (season.tables) and archive format (general) */
  let tables=[];
  try{
    if(sdata.season?.tables)       tables=sdata.season.tables;
    else if(sdata.tables)          tables=sdata.tables;
    else if(Array.isArray(sdata))  tables=sdata;
    else if(sdata.tablerows)       tables=[sdata];
    /* Archive format already normalized by normalizeArchiveStanding so will match season.tables */
  }catch{}

  if(!tables.length)return{hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">📋</div><div>Puan durumu verisi mevcut değil</div></div>`};

  let html='';
  tables.forEach(table=>{
    const trows=table.tablerows||[];if(!trows.length)return;
    const tname=table.name||table.abbr||'';
    html+=`<div class="bd-section">${tname?`<div class="bd-sh">${esc(tname)}</div>`:''}<div class="bd-std-wrap"><table class="bd-std-table">
      <thead><tr><th class="c">#</th><th class="l">Takım</th><th>O</th><th class="g">G</th><th class="m">M</th><th>AS</th><th>YS</th><th>Avg</th><th class="pct">%</th></tr></thead>
      <tbody>`;
    trows.forEach(r=>{
      const isH=(r.team?.name||'').toLowerCase()===row.home_team.toLowerCase();
      const isA=(r.team?.name||'').toLowerCase()===row.away_team.toLowerCase();
      const hl=isH?'row-h':(isA?'row-a':'');
      const promo=r.promotion;
      let dotCls='';
      if(promo?.cssclass?.includes('promotionplayoff'))dotCls='dot-qual';
      else if(promo?.cssclass?.includes('playoff'))dotCls='dot-playoff';
      const pct=r.pctTotal!=null?(r.pctTotal*100).toFixed(1)+' %':'-';
      const diff=r.goalDiffTotal;
      const avg=diff!=null?((diff>0?'+':'')+diff):'-';
      const avgCls=diff>0?'pos':(diff<0?'neg':'');
      html+=`<tr class="${hl}">
        <td class="c pos-cell">${dotCls?`<span class="td-dot ${dotCls}"></span>`:''}${r.pos??'-'}</td>
        <td class="team-cell">${r.team?.haslogo?`<img src="https://sportradar.com/img/team_logo/${r.team._id}.png" class="td-logo" onerror="this.style.display='none'" alt="">`:''}<span class="td-tname">${esc(r.team?.name||'-')}</span></td>
        <td>${r.total??'-'}</td><td class="g">${r.winTotal??'-'}</td><td class="m">${r.lossTotal??'-'}</td>
        <td>${r.goalsForTotal??'-'}</td><td>${r.goalsAgainstTotal??'-'}</td>
        <td class="${avgCls}">${avg}</td><td class="pct">${pct}</td>
      </tr>`;
    });
    html+=`</tbody></table></div><div class="bd-legend"><span><span class="td-dot dot-playoff"></span> Playoff</span><span><span class="td-dot dot-qual"></span> Eleme</span></div></div>`;
  });
  if(!html)return{hasContent:false,html:`<div class="bd-empty"><div class="bd-ei">📋</div><div>Puan durumu verisi mevcut değil</div></div>`};
  return{hasContent:true,html};
}

/* ── LIVE REFRESH ─────────────────────────────────────── */
async function refreshDetail(id){
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const numId=parseInt(id,10);if(isNaN(numId))return;
  const{data,error}=await sb.from('live_bball').select('*').eq('id',numId).single();
  if(!error&&data){const prevTab=D.tab;renderDetail(data);const el=document.querySelector(`.bd-tab[onclick*="'${prevTab}'"]`);if(el)switchBDTab(prevTab,el);}
}

/* ── INIT ──────────────────────────────────────────────── */
async function initDetail(){
  const id=parseIdFromURL();
  if(!id){showDetailError('Geçersiz maç adresi.');return;}
  showDetailLoading();
  if(typeof window.supabase==='undefined'){showDetailError('Supabase SDK yüklenemedi.');return;}
  const row=await fetchMatchData(id);
  if(!row){showDetailError(`Maç verisi bulunamadı (ID: ${id})`);return;}
  renderDetail(row);
  const st=bballStatus(row);
  if(st.live)D.refreshTimer=setInterval(()=>refreshDetail(id),30000);
}

function showDetailLoading(){document.getElementById('bd-root').innerHTML=`<div class="bd-init-loading"><div class="bd-spin"></div><div>Maç verisi yükleniyor…</div></div>`;}
function showDetailError(msg){document.getElementById('bd-root').innerHTML=`<div class="bd-init-error"><div class="bd-ei" style="font-size:32px">⚠️</div><div>${esc(msg)}</div><a class="bd-back-btn" href="/basketbol/">← Basketbol Sayfasına Dön</a></div>`;}

document.addEventListener('DOMContentLoaded',initDetail);
