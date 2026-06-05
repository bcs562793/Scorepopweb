/* ═══════════════════════════════════════════════════════
   SCOREPOP — bball.js  (v4.0 — liste sayfası)

   Geçmiş:  GitHub arşiv  data/raw/basketball-{date}/events.json
   Bugün:   Supabase live_bball
   İleri:   Supabase future_bball  (id, nesine_bid, home_team, away_team, league_name, starts_at)
═══════════════════════════════════════════════════════ */
'use strict';

const B = {
  sb:           null,
  date:         todayStr(),
  timer:        null,
  cd:           30,
  archiveCache: {},
  rowCache:     {},
};

const BBALL_ARCHIVE_BASE = 'https://raw.githubusercontent.com/bcs562793/blyarchieve/main/data/raw';

/* ── HELPERS ─────────────────────────────────────────── */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(iso){ if(!iso) return '--:--'; try{const d=new Date(iso);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}catch{return '--:--';} }
function dateLabel(str){ const M=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']; const[,m,d]=(str||'').split('-'); return m?`${+d} ${M[+m-1]}`:str; }
function makeSlug(...p){ return p.filter(Boolean).join('-vs-').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); }

/* ── STATUS ─────────────────────────────────────────── */
function bballStatus(m){
  const LM={'1Q':'Ç1','Q1':'Ç1','2Q':'Ç2','Q2':'Ç2','HT':'DEVRE','HALF':'DEVRE','3Q':'Ç3','Q3':'Ç3','4Q':'Ç4','Q4':'Ç4','OT':'UZT','OT1':'UZT1','OT2':'UZT2','LIVE':'CANLI'};
  const DONE=new Set(['FT','AOT','FINISHED','PLAYED','POST']);
  const s=(m.status_short||'').toUpperCase();
  if(DONE.has(s)) return{live:false,done:true,label:'MS',cls:'done'};
  if(LM[s]){let l=LM[s];if(m.match_clock)l+=` ${m.match_clock}`;return{live:true,done:false,label:l,cls:'live'};}
  return{live:false,done:false,label:fmtTime(m.scheduled_at||m.matchDate),cls:'sched'};
}

/* ═══════════════════════════════════════════════════════
   ARCHIVE NORMALISATION
   Arşivdeki farklı format → bball-detail.js'in beklediği ortak format
═══════════════════════════════════════════════════════ */

/* standing.general[{name, teams:[]}]  →  {season:{tables:[{name, tablerows:[]}]}} */
function normalizeArchiveStanding(standing) {
  if (!standing) return null;
  const groups = standing.general;
  if (!Array.isArray(groups) || !groups.length) return null;
  return {
    season: {
      tables: groups.map(g => ({
        name: g.name || '',
        tablerows: (g.teams || []).map(t => ({
          pos: t.position,
          team: { name: t.name, haslogo: false, abbr: '' },
          total: t.played,
          winTotal: t.won,
          lossTotal: t.lost,
          goalsForTotal: t.scored,
          goalsAgainstTotal: t.against,
          goalDiffTotal: (t.scored || 0) - (t.against || 0),
          pctTotal: parseFloat((t.wpg || '0').replace(',', '.')) || 0,
          promotion: null,
        })),
      })),
    },
  };
}

/* archive homeFormDetail + h2h array  →  {homeTeamForms, awayTeamForms, matchesBetween} */
function normalizeArchiveH2H(e) {
  const scoreToArr = s => (s || '').split(' - ').map(x => x.trim());

  const convertForm = (fd, teamName) => {
    if (!fd || !fd.matches?.length) return null;
    return {
      title: fd.title || teamName,
      recentForms: fd.recentForms || fd.matches.slice(0, 5).map(m => m.result || ''),
      teamForm: fd.matches.map(m => {
        const sc = scoreToArr(m.score), ht = scoreToArr(m.htScore);
        return {
          date: m.date,
          homeTeamName: m.home,
          awayTeamName: m.away,
          homeTeamScore: sc[0],
          awayTeamScore: sc[1],
          htHomeScore: ht[0],
          htAwayScore: ht[1],
          markedTeamResult: m.result,
          tournamentName: m.tournament || m.competitionName || '',
        };
      }),
    };
  };

  const hForms = convertForm(e.homeFormDetail, e.homeTeam);
  const aForms = convertForm(e.awayFormDetail, e.awayTeam);

  const betweenMatches = (e.h2h || []).map(m => {
    const sc = scoreToArr(m.score), ht = scoreToArr(m.htScore);
    return {
      date: m.date,
      homeTeamName: m.home,
      awayTeamName: m.away,
      homeTeamScore: sc[0],
      awayTeamScore: sc[1],
      htHomeScore: ht[0],
      htAwayScore: ht[1],
    };
  });

  if (!hForms && !aForms && !betweenMatches.length) return null;

  return {
    homeTeamForms: hForms,
    awayTeamForms: aForms,
    matchesBetween: betweenMatches.length ? { title: 'Aralarındaki Maçlar', matches: betweenMatches } : null,
  };
}

/* ── ARCHIVE EVENT → NORMALIZED ROW ─────────────────── */
function archiveEventToRow(e) {
  const toNum = v => (v!=null&&v!==''?+v:null);
  const id = String(e.sbsEventId||e.betRadarId||`arc_${Math.random().toString(36).slice(2)}`);
  const isDone = e.matchStatus === 'PLAYED';
  const isNS   = e.matchStatus === 'FIXTURE' || e.matchStatus === 'NS';
  return {
    id,
    _isArchive: true,
    league_name:  e.competitionName || '',
    country:      '',
    home_team:    e.homeTeam || e.homeFormDetail?.title || '',
    away_team:    e.awayTeam || e.awayFormDetail?.title || '',
    home_avatar:  null,
    away_avatar:  null,
    status_short: isDone ? 'FT' : (isNS ? 'NS' : e.matchStatus || 'NS'),
    home_score:   toNum(e.scoreTotal?.home),
    away_score:   toNum(e.scoreTotal?.away),
    home_q1: toNum(e.scoreQ1?.home),  away_q1: toNum(e.scoreQ1?.away),
    home_q2: toNum(e.scoreQ2?.home),  away_q2: toNum(e.scoreQ2?.away),
    home_q3: toNum(e.scoreQ3?.home),  away_q3: toNum(e.scoreQ3?.away),
    home_q4: toNum(e.scoreQ4?.home),  away_q4: toNum(e.scoreQ4?.away),
    home_ot: null, away_ot: null, period: null, match_clock: null,
    scheduled_at: e.matchDate || e.date || null,
    /* Normalize form for list page form badges */
    home_recent_form: JSON.stringify(e.homeFormDetail?.recentForms || e.homeRecentForm || []),
    away_recent_form: JSON.stringify(e.awayFormDetail?.recentForms || e.awayRecentForm || []),
    /* Normalize H2H and standings to unified format */
    h2h:       JSON.stringify(normalizeArchiveH2H(e)),
    standings: JSON.stringify(normalizeArchiveStanding(e.standing)),
    live_stats: null,
  };
}

/* ── future_bball row → normalized row ──────────────── */
function futureRowToDisplay(r) {
  return {
    id:           String(r.nesine_bid || r.id),
    _futureDbId:  r.id,
    _nesine_bid:  r.nesine_bid,
    league_name:  r.league_name || '',
    country:      r.country || '',
    home_team:    r.home_team || '',
    away_team:    r.away_team || '',
    home_avatar:  null,
    away_avatar:  null,
    status_short: 'NS',
    home_score: null, away_score: null,
    home_q1: null, away_q1: null, home_q2: null, away_q2: null,
    home_q3: null, away_q3: null, home_q4: null, away_q4: null,
    home_ot: null, away_ot: null, period: null, match_clock: null,
    scheduled_at: r.starts_at,
    home_recent_form: '[]',
    away_recent_form: '[]',
    h2h: null, standings: null, live_stats: null,
    _isFuture: true,
  };
}

/* ── DATE STRIP ─────────────────────────────────────── */
function buildBballDateStrip(){
  const el=document.getElementById('bball-date-strip'); if(!el) return;
  const today=todayStr(), days=[];
  for(let i=-6;i<=6;i++){const d=new Date();d.setDate(d.getDate()+i);const s=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;days.push(s);}
  el.innerHTML=days.map(s=>`<button class="bdp${s===B.date?' active':''}" onclick="pickBballDate('${s}')">${s===today?'Bugün':dateLabel(s)}</button>`).join('');
  setTimeout(()=>el.querySelector('.bdp.active')?.scrollIntoView({inline:'center',behavior:'smooth'}),100);
}
function pickBballDate(d){B.date=d;buildBballDateStrip();loadBball(false);}

/* ── SUPABASE PAGINATED FETCH ────────────────────────── */
async function fetchAllBballRows(query){
  const PAGE=1000;let from=0,all=[];
  while(true){const{data,error}=await query.range(from,from+PAGE-1);if(error){console.error('[bball]',error.message);break;}if(!data?.length)break;all=all.concat(data);if(data.length<PAGE)break;from+=PAGE;}
  return all;
}

/* ── MAIN LOAD ──────────────────────────────────────── */
async function loadBball(silent=false){
  if(!silent) showLoading();
  const today=todayStr();
  if(B.date<today){await loadBballArchive(B.date);return;}
  if(B.date>today){await loadBballFuture(B.date);return;}
  await loadBballToday();
}

/* ── TODAY: live_bball ──────────────────────────────── */
async function loadBballToday(){
  try{
    const rows=await fetchAllBballRows(
      B.sb.from('live_bball')
        .select('id,nesine_bid,home_team,away_team,league_name,country,status_short,home_score,away_score,home_q1,away_q1,home_q2,away_q2,home_q3,away_q3,home_q4,away_q4,home_ot,away_ot,period,match_clock,scheduled_at,home_avatar,away_avatar,home_recent_form,away_recent_form')
        .gte('scheduled_at',`${B.date}T00:00:00+00:00`)
        .lte('scheduled_at',`${B.date}T23:59:59+00:00`)
        .order('scheduled_at')
    );
    renderBball(rows,true);
  }catch(e){console.error('[loadBballToday]',e);showError('Canlı veriler yüklenemedi.');}
}

/* ── PAST: GitHub archive ───────────────────────────── */
async function loadBballArchive(date){
  showLoading(`${date} arşivi yükleniyor…`);
  try{
    /* URL: data/raw/basketball-{date}/events.json */
    const url=`${BBALL_ARCHIVE_BASE}/basketball-${date}/events.json`;
    const res=await fetch(url);
    if(!res.ok){showEmpty(`${date} tarihine ait basketbol arşivi bulunamadı.`);return;}
    const events=await res.json();
    const arr=Array.isArray(events)?events:(events.events||events.data||[]);
    if(!arr.length){showEmpty(`${date} için basketbol verisi yok.`);return;}
    /* Cache by sbsEventId / betRadarId */
    B.archiveCache={};
    arr.forEach(e=>{const id=e.sbsEventId||e.betRadarId;if(id)B.archiveCache[String(id)]=e;});
    renderBball(arr.map(archiveEventToRow),false);
  }catch(e){console.error('[loadBballArchive]',e);showError('Arşiv yüklenirken hata oluştu.');}
}

/* ── FUTURE: future_bball table ─────────────────────── */
async function loadBballFuture(date){
  showLoading(`${date} fikstürü yükleniyor…`);
  try{
    const rows=await fetchAllBballRows(
      B.sb.from('future_bball')
        .select('id,nesine_bid,home_team,away_team,league_name,country,starts_at,has_broadcast')
        .gte('starts_at',`${date}T00:00:00+00:00`)
        .lte('starts_at',`${date}T23:59:59+00:00`)
        .order('starts_at')
    );
    if(!rows.length){
      /* future_bball boşsa arşivden dene */
      const url=`${BBALL_ARCHIVE_BASE}/basketball-${date}/events.json`;
      const res=await fetch(url);
      if(res.ok){
        const events=await res.json();
        const arr=Array.isArray(events)?events:(events.events||events.data||[]);
        if(arr.length){renderBball(arr.map(archiveEventToRow),false);return;}
      }
      showEmpty(`${date} için fikstür bulunamadı.`);
      return;
    }
    renderBball(rows.map(futureRowToDisplay),false);
  }catch(e){console.error('[loadBballFuture]',e);showError('Fikstür yüklenemedi.');}
}

/* ── RENDER ─────────────────────────────────────────── */
function renderBball(rows,isLive){
  updateLiveCount(rows);
  B.rowCache={};
  rows.forEach(r=>{B.rowCache[String(r.id)]=r;});
  if(!rows.length){showEmpty('Maç bulunamadı.');return;}

  const groups={};
  rows.forEach(m=>{const k=m.league_name||'Diğer';if(!groups[k])groups[k]={name:k,country:m.country||'',matches:[]};groups[k].matches.push(m);});
  const sorted=Object.values(groups).sort((a,b)=>{
    const aL=a.matches.some(m=>bballStatus(m).live),bL=b.matches.some(m=>bballStatus(m).live);
    if(aL&&!bL)return -1;if(!aL&&bL)return 1;return a.name.localeCompare(b.name,'tr');
  });
  document.getElementById('bball-root').innerHTML=sorted.map(g=>renderBballGroup(g)).join('');
}

function renderBballGroup(g){
  const lc=g.matches.filter(m=>bballStatus(m).live).length;
  const lb=lc?`<span class="bball-live-badge">${lc} CANLI</span>`:'';
  return `<div class="bball-grp">
    <div class="bball-hdr" onclick="this.closest('.bball-grp').classList.toggle('closed')">
      <span class="bball-sport-icon">🏀</span>
      <span class="bball-hdr-name">${esc(g.country?`${g.country} ${g.name}`:g.name)}</span>
      ${lb}<span class="bball-arrow">▾</span>
    </div>
    <div class="bball-body">${g.matches.map(m=>renderBballRow(m)).join('')}</div>
  </div>`;
}

function renderBballRow(m){
  const st=bballStatus(m);
  const isNS=!st.live&&!st.done;
  const hs=isNS?'—':(m.home_score!=null?m.home_score:'-');
  const as=isNS?'—':(m.away_score!=null?m.away_score:'-');
  let hcls='',acls='';
  if(st.done&&hs!=='—'&&as!=='—'){if(+hs>+as){hcls='bball-win';acls='bball-loss';}else if(+as>+hs){acls='bball-win';hcls='bball-loss';}}

  let qtrsHtml='';
  if(!isNS){
    const qs=[[m.home_q1,m.away_q1,'Ç1'],[m.home_q2,m.away_q2,'Ç2'],[m.home_q3,m.away_q3,'Ç3'],[m.home_q4,m.away_q4,'Ç4']];
    if(m.home_ot!=null||m.away_ot!=null)qs.push([m.home_ot,m.away_ot,'UZT']);
    const qi=qs.filter(([h,a])=>h!=null||a!=null).map(([h,a,l])=>{
      const ia=st.live&&((l==='Ç1'&&['1Q','Q1'].includes(m.status_short))||(l==='Ç2'&&['2Q','Q2'].includes(m.status_short))||(l==='Ç3'&&['3Q','Q3'].includes(m.status_short))||(l==='Ç4'&&['4Q','Q4'].includes(m.status_short))||(l==='UZT'&&m.status_short?.toUpperCase().startsWith('OT')));
      return `<span class="bball-qtr${ia?' bball-qtr-live':''}"><span class="bball-qtr-lbl">${l}</span><span class="bball-qtr-h">${h??'-'}</span><span class="bball-qtr-sep">:</span><span class="bball-qtr-a">${a??'-'}</span></span>`;
    });
    if(qi.length)qtrsHtml=`<div class="bball-qtrs">${qi.join('')}</div>`;
  }

  const hl=m.home_avatar?`<img class="bball-logo" src="${esc(m.home_avatar)}" onerror="this.style.display='none'" alt="">`:`<div class="bball-logo-ph">🏀</div>`;
  const al=m.away_avatar?`<img class="bball-logo" src="${esc(m.away_avatar)}" onerror="this.style.display='none'" alt="">`:`<div class="bball-logo-ph">🏀</div>`;
  const slug=makeSlug(m.home_team,m.away_team);
  const url=`/basketbol/mac/${m.id}${slug?'-'+slug:''}`;

  return `<a class="bball-mr${st.live?' is-live':''}" href="${url}" data-id="${m.id}">
    <div class="bball-status ${st.cls}"><span class="bball-st-label">${esc(st.label)}</span></div>
    <div class="bball-team bball-home"><span class="bball-tname ${hcls}">${esc(m.home_team)}</span><div class="bball-logo-wrap">${hl}</div></div>
    <div class="bball-scorebox">
      <div class="bball-total${isNS?' bball-vs':''}">
        ${isNS?`<span class="bball-vs-txt">vs</span>`:`<span class="bball-sn ${hcls}">${hs}</span><div class="bball-sdiv"></div><span class="bball-sn ${acls}">${as}</span>`}
      </div>${qtrsHtml}
    </div>
    <div class="bball-team bball-away"><div class="bball-logo-wrap">${al}</div><span class="bball-tname ${acls}">${esc(m.away_team)}</span></div>
    <div class="bball-arr">›</div>
  </a>`;
}

/* ── UI HELPERS ─────────────────────────────────────── */
function showLoading(msg='Yükleniyor…'){document.getElementById('bball-root').innerHTML=`<div class="bball-empty"><div class="bball-empty-icon">⏳</div><div>${msg}</div></div>`;}
function showEmpty(msg){document.getElementById('bball-root').innerHTML=`<div class="bball-empty"><div class="bball-empty-icon">📭</div><div>${msg}</div></div>`;}
function showError(msg){document.getElementById('bball-root').innerHTML=`<div class="bball-empty"><div class="bball-empty-icon">⚠️</div><div>${msg}</div></div>`;}
function updateLiveCount(rows){
  const n=rows.filter(m=>bballStatus(m).live).length;
  ['bball-live-n','sb-bball-live-n'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=n;});
  const b=document.getElementById('bball-tb-live');if(b)b.style.display=n>0?'flex':'none';
  const bn=document.getElementById('bball-tb-live-n');if(bn)bn.textContent=n;
}

/* ── COUNTDOWN ──────────────────────────────────────── */
function startBballCountdown(){
  B.cd=B.cycle;updateBballRing();
  if(B.timer)clearInterval(B.timer);
  B.timer=setInterval(async()=>{B.cd--;updateBballRing();if(B.cd<=0){B.cd=B.cycle;await loadBball(true);}},1000);
}
function updateBballRing(){
  const el=document.getElementById('bball-cd');if(el)el.textContent=B.cd;
  const ring=document.getElementById('bball-ring');if(!ring)return;
  const r=8,C=2*Math.PI*r;ring.style.strokeDasharray=C;ring.style.strokeDashoffset=C*(1-B.cd/B.cycle);
}

/* ── INIT ────────────────────────────────────────────── */
async function initBball(){
  if(typeof window.supabase==='undefined'){console.error('Supabase SDK yüklenmedi!');return;}
  B.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  buildBballDateStrip();
  await loadBball(false);
  startBballCountdown();
}
document.addEventListener('DOMContentLoaded',initBball);
