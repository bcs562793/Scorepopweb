'use strict';

const B = {
  sb: null, date: todayStr(), timer: null, cd: 30,
  archiveCache: {}, rowCache: {},
};
const BBALL_ARCHIVE = 'https://raw.githubusercontent.com/bcs562793/blyarchieve/main/data/raw';

function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(iso){ if(!iso)return '--:--'; try{const d=new Date(iso);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}catch{return '--:--';} }
function dateLabel(s){ const M=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']; const[,m,d]=(s||'').split('-'); return m?`${+d} ${M[+m-1]}`:s; }
function makeSlug(...p){ return p.filter(Boolean).join('-vs-').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80); }

function bballStatus(m){
  const LM={'1Q':'Ç1','Q1':'Ç1','2Q':'Ç2','Q2':'Ç2','HT':'DEVRE','HALF':'DEVRE','3Q':'Ç3','Q3':'Ç3','4Q':'Ç4','Q4':'Ç4','OT':'UZT','OT1':'UZT1','OT2':'UZT2','LIVE':'CANLI'};
  const DONE=new Set(['FT','AOT','FINISHED','PLAYED','POST']);
  const s=(m.status_short||'').toUpperCase();
  if(DONE.has(s))return{live:false,done:true,label:'MS',cls:'done'};
  if(LM[s]){return{live:true,done:false,label:LM[s],clock:m.match_clock||null,cls:'live'};}
  return{live:false,done:false,label:fmtTime(m.scheduled_at||m.matchDate),cls:'sched'};
}

/* ── Normalize functions (archive format → unified) ── */
function normalizeArchiveStanding(standing){
  if(!standing)return null;
  const groups=standing.general;
  if(!Array.isArray(groups)||!groups.length)return null;
  return{season:{tables:groups.map(g=>({name:g.name||'',tablerows:(g.teams||[]).map(t=>({pos:t.position,team:{name:t.name,haslogo:false},total:t.played,winTotal:t.won,lossTotal:t.lost,goalsForTotal:t.scored,goalsAgainstTotal:t.against,goalDiffTotal:(t.scored||0)-(t.against||0),pctTotal:parseFloat((t.wpg||'0').replace(',','.'))||0,promotion:null}))}))}};
}
function normalizeArchiveH2H(e){
  const split=s=>(s||'').split(' - ').map(x=>x.trim());
  const cvt=(fd,name)=>{if(!fd||!fd.matches?.length)return null;return{title:fd.title||name,recentForms:fd.recentForms||fd.matches.slice(0,5).map(m=>m.result||''),teamForm:fd.matches.map(m=>{const sc=split(m.score),ht=split(m.htScore);return{date:m.date,homeTeamName:m.home,awayTeamName:m.away,homeTeamScore:sc[0],awayTeamScore:sc[1],htHomeScore:ht[0],htAwayScore:ht[1],markedTeamResult:m.result,tournamentName:m.tournament||m.competitionName||''};})};};
  const hF=cvt(e.homeFormDetail,e.homeTeam), aF=cvt(e.awayFormDetail,e.awayTeam);
  const bw=(e.h2h||[]).map(m=>{const sc=split(m.score),ht=split(m.htScore);return{date:m.date,homeTeamName:m.home,awayTeamName:m.away,homeTeamScore:sc[0],awayTeamScore:sc[1],htHomeScore:ht[0],htAwayScore:ht[1]};});
  if(!hF&&!aF&&!bw.length)return null;
  return{homeTeamForms:hF,awayTeamForms:aF,matchesBetween:bw.length?{title:'Aralarındaki Maçlar',matches:bw}:null};
}
function archiveEventToRow(e){
  const n=v=>(v!=null&&v!==''?+v:null), id=String(e.sbsEventId||e.betRadarId||`arc_${Math.random().toString(36).slice(2)}`);
  return{id,_isArchive:true,league_name:e.competitionName||'',country:'',home_team:e.homeTeam||'',away_team:e.awayTeam||'',home_avatar:null,away_avatar:null,status_short:e.matchStatus==='PLAYED'?'FT':(e.matchStatus==='FIXTURE'?'NS':e.matchStatus||'NS'),home_score:n(e.scoreTotal?.home),away_score:n(e.scoreTotal?.away),home_q1:n(e.scoreQ1?.home),away_q1:n(e.scoreQ1?.away),home_q2:n(e.scoreQ2?.home),away_q2:n(e.scoreQ2?.away),home_q3:n(e.scoreQ3?.home),away_q3:n(e.scoreQ3?.away),home_q4:n(e.scoreQ4?.home),away_q4:n(e.scoreQ4?.away),home_ot:null,away_ot:null,period:null,match_clock:null,scheduled_at:e.matchDate||e.date||null,home_recent_form:JSON.stringify(e.homeFormDetail?.recentForms||e.homeRecentForm||[]),away_recent_form:JSON.stringify(e.awayFormDetail?.recentForms||e.awayRecentForm||[]),h2h:JSON.stringify(normalizeArchiveH2H(e)),standings:JSON.stringify(normalizeArchiveStanding(e.standing)),live_stats:null};
}
function futureRowToDisplay(r){
  return{id:String(r.nesine_bid||r.id),_futureDbId:r.id,_nesine_bid:r.nesine_bid,league_name:r.league_name||'',country:r.country||'',home_team:r.home_team||'',away_team:r.away_team||'',home_avatar:null,away_avatar:null,status_short:'NS',home_score:null,away_score:null,home_q1:null,away_q1:null,home_q2:null,away_q2:null,home_q3:null,away_q3:null,home_q4:null,away_q4:null,home_ot:null,away_ot:null,period:null,match_clock:null,scheduled_at:r.starts_at,home_recent_form:'[]',away_recent_form:'[]',h2h:null,standings:null,live_stats:null,_isFuture:true};
}

/* ── DATE STRIP ── */
function buildBballDateStrip(){
  const el=document.getElementById('bball-date-strip'); if(!el)return;
  const today=todayStr(), days=[];
  const base=new Date(B.date+'T12:00:00');
  for(let i=-6;i<=6;i++){const d=new Date(base);d.setDate(d.getDate()+i);const s=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;days.push(s);}
  el.innerHTML=days.map(s=>`<button class="bdp${s===B.date?' active':''}" onclick="pickBballDate('${s}')">${s===today?'Bugün':dateLabel(s)}</button>`).join('');
  setTimeout(()=>el.querySelector('.bdp.active')?.scrollIntoView({inline:'center',behavior:'smooth'}),100);
}
function pickBballDate(d){B.date=d;buildBballDateStrip();loadBball(false);}
function pickBballCalendar(d){if(!d)return;B.date=d;buildBballDateStrip();loadBball(false);}
function bballOpenCalendar(){
  const i=document.getElementById('bball-date-input'); if(!i)return;
  i.value=B.date;
  try{ i.showPicker(); }catch{ i.focus(); i.click(); }
}

/* ── FETCH ── */
async function fetchAllBball(query){
  const PAGE=1000;let from=0,all=[];
  while(true){const{data,error}=await query.range(from,from+PAGE-1);if(error){console.error('[bball]',error.message);break;}if(!data?.length)break;all=all.concat(data);if(data.length<PAGE)break;from+=PAGE;}
  return all;
}

/* ── LOAD ── */
async function loadBball(silent=false){
  if(!silent)showSkel();
  const today=todayStr();
  if(B.date<today){await loadArchive(B.date);return;}
  if(B.date>today){await loadFuture(B.date);return;}
  await loadToday();
}

async function loadToday(){
  try{
    const dayStart=`${B.date}T00:00:00+03:00`, dayEnd=`${B.date}T23:59:59+03:00`;
    const [liveRows,futureRows]=await Promise.all([
      fetchAllBball(
        B.sb.from('live_bball')
          .select('id,nesine_bid,home_team,away_team,league_name,country,status_short,home_score,away_score,home_q1,away_q1,home_q2,away_q2,home_q3,away_q3,home_q4,away_q4,home_ot,away_ot,period,match_clock,scheduled_at,home_avatar,away_avatar,home_recent_form,away_recent_form')
          .gte('scheduled_at',dayStart)
          .lte('scheduled_at',dayEnd)
          .order('scheduled_at')
      ),
      fetchAllBball(
        B.sb.from('future_bball')
          .select('id,nesine_bid,home_team,away_team,league_name,country,starts_at,has_broadcast')
          .gte('starts_at',dayStart)
          .lte('starts_at',dayEnd)
          .order('starts_at')
      ),
    ]);
    const seen=new Set(liveRows.map(r=>r.nesine_bid).filter(Boolean));
    const merged=liveRows
      .concat(futureRows.filter(r=>!(r.nesine_bid&&seen.has(r.nesine_bid))).map(futureRowToDisplay))
      .sort((a,b)=>String(a.scheduled_at||'').localeCompare(String(b.scheduled_at||'')));
    renderBball(merged);
  }catch(e){console.error(e);showError('Veriler yüklenemedi.');}
}

async function loadArchive(date){
  showLoading(`${date} yükleniyor…`);
  try{
    const res=await fetch(`${BBALL_ARCHIVE}/basketball-${date}/events.json`);
    if(!res.ok){showEmpty(`${date} arşivi bulunamadı.`);return;}
    const events=await res.json();
    const arr=Array.isArray(events)?events:(events.events||events.data||[]);
    if(!arr.length){showEmpty(`${date} için veri yok.`);return;}
    B.archiveCache={};
    arr.forEach(e=>{const id=e.sbsEventId||e.betRadarId;if(id)B.archiveCache[String(id)]=e;});
    renderBball(arr.map(archiveEventToRow));
  }catch(e){console.error(e);showError('Arşiv yüklenemedi.');}
}

async function loadFuture(date){
  showLoading(`${date} fikstürü yükleniyor…`);
  try{
    const rows=await fetchAllBball(
      B.sb.from('future_bball')
        .select('id,nesine_bid,home_team,away_team,league_name,country,starts_at,has_broadcast')
        .gte('starts_at',`${date}T00:00:00+03:00`)
        .lte('starts_at',`${date}T23:59:59+03:00`)
        .order('starts_at')
    );
    if(!rows.length){
      const res=await fetch(`${BBALL_ARCHIVE}/basketball-${date}/events.json`);
      if(res.ok){const ev=await res.json();const arr=Array.isArray(ev)?ev:(ev.events||ev.data||[]);if(arr.length){renderBball(arr.map(archiveEventToRow));return;}}
      showEmpty(`${date} için fikstür bulunamadı.`);return;
    }
    renderBball(rows.map(futureRowToDisplay));
  }catch(e){console.error(e);showError('Fikstür yüklenemedi.');}
}

/* ── RENDER ── */
function renderBball(rows){
  updateLiveCount(rows);
  B.rowCache={};
  rows.forEach(r=>{B.rowCache[String(r.id)]=r;});
  if(!rows.length){showEmpty('Maç bulunamadı.');return;}

  const groups={};
  rows.forEach(m=>{const k=m.league_name||'Diğer';if(!groups[k])groups[k]={name:k,country:m.country||'',matches:[]};groups[k].matches.push(m);});
  const sorted=Object.values(groups).sort((a,b)=>{
    const aL=a.matches.some(m=>bballStatus(m).live), bL=b.matches.some(m=>bballStatus(m).live);
    if(aL&&!bL)return -1;if(!aL&&bL)return 1;return a.name.localeCompare(b.name,'tr');
  });
  document.getElementById('bball-root').innerHTML=sorted.map(renderGroup).join('');
}

function renderGroup(g){
  const lc=g.matches.filter(m=>bballStatus(m).live).length;
  const livePill=lc?`<span class="bb-live-pill"><span class="bb-live-dot"></span>${lc}</span>`:'';
  return `<div class="bb-grp">
    <div class="bb-hdr" onclick="this.closest('.bb-grp').classList.toggle('closed')">
      <span class="bb-hdr-flag">🏀</span>
      <div class="bb-hdr-info">
        <div class="bb-hdr-name">${esc(g.name)}</div>
      </div>
      ${livePill}
      <span class="bb-arrow">▾</span>
    </div>
    <div class="bb-body">${g.matches.map(renderRow).join('')}</div>
  </div>`;
}

function renderRow(m){
  const st=bballStatus(m);
  const isNS=!st.live&&!st.done;
  const hs=isNS?null:(m.home_score??null);
  const as_=isNS?null:(m.away_score??null);
  const hasScore=hs!=null&&as_!=null;

  /* win/loss classes */
  let hcls='',acls='';
  if(st.done&&hasScore){if(+hs>+as_){hcls='w';acls='l';}else if(+as_>+hs){acls='w';hcls='l';}}

  /* Logos */
  const hl=m.home_avatar?`<img class="bb-logo" src="${esc(m.home_avatar)}" onerror="this.style.display='none'" alt="">`:`<span class="bb-logo-ph">🏀</span>`;
  const al=m.away_avatar?`<img class="bb-logo" src="${esc(m.away_avatar)}" onerror="this.style.display='none'" alt="">`:`<span class="bb-logo-ph">🏀</span>`;

  /* Score box */
  let scoreHtml;
  if(isNS){
    scoreHtml=`<div class="bb-total"><span class="bb-vs">vs</span></div>`;
  }else{
    scoreHtml=`<div class="bb-total">
      <span class="bb-sn ${hcls}">${hs??'-'}</span>
      <span class="bb-sdiv"></span>
      <span class="bb-sn ${acls}">${as_??'-'}</span>
    </div>`;
  }

  /* Quarter chips */
  const QMAP={'1Q':'Ç1','Q1':'Ç1','2Q':'Ç2','Q2':'Ç2','3Q':'Ç3','Q3':'Ç3','4Q':'Ç4','Q4':'Ç4','OT':'OT'};
  const activeQ=(m.status_short||'').toUpperCase();
  const qs=[[m.home_q1,m.away_q1,'Ç1','1Q'],[m.home_q2,m.away_q2,'Ç2','2Q'],[m.home_q3,m.away_q3,'Ç3','3Q'],[m.home_q4,m.away_q4,'Ç4','4Q']];
  if(m.home_ot!=null||m.away_ot!=null)qs.push([m.home_ot,m.away_ot,'OT','OT']);
  const qItems=qs.filter(([h,a])=>h!=null||a!=null).map(([h,a,lbl,key])=>{
    const isAct=st.live&&(activeQ===key||activeQ===key.replace('Q','')+'Q'||activeQ===QMAP[activeQ]===lbl);
    return `<div class="bb-qchip${isAct?' act':''}"><span class="bb-ql">${lbl}</span><span class="bb-qs">${h??'-'}–${a??'-'}</span></div>`;
  });

  const slug=makeSlug(m.home_team,m.away_team);
  const url=`/basketbol/mac/${m.id}${slug?'-'+slug:''}`;

  /* Status label */
  let stHtml;
  if(st.live){
    stHtml=`<div class="bb-st-lbl">${esc(st.label)}</div>${st.clock?`<div class="bb-st-clk">${esc(st.clock)}'</div>`:''}`;
  }else if(st.done){
    stHtml=`<div class="bb-st-lbl">MS</div>`;
  }else{
    stHtml=`<div class="bb-st-lbl">${esc(st.label)}</div>`;
  }

  return `<a class="bb-mr ${st.cls}" href="${url}" data-id="${m.id}">
    <div class="bb-st">${stHtml}</div>
    <div class="bb-team bb-home">
      <span class="bb-tname ${hcls}">${esc(m.home_team)}</span>
      <div class="bb-logo-wrap">${hl}</div>
    </div>
    <div class="bb-scores">
      ${scoreHtml}
      ${(st.live&&qItems.length)?`<div class="bb-qtrs">${qItems.join('')}</div>`:''}
    </div>
    <div class="bb-team bb-away">
      <div class="bb-logo-wrap">${al}</div>
      <span class="bb-tname ${acls}">${esc(m.away_team)}</span>
    </div>
    <span class="bb-arr">›</span>
  </a>`;
}

/* ── UI ── */
function showSkel(){document.getElementById('bball-root').innerHTML=`<div class="bb-skel"><div class="bb-skel-h"></div><div class="bb-skel-r"></div><div class="bb-skel-r"></div><div class="bb-skel-r"></div><div class="bb-skel-h"></div><div class="bb-skel-r"></div><div class="bb-skel-r"></div></div>`;}
function showLoading(msg){document.getElementById('bball-root').innerHTML=`<div class="bb-empty"><div class="bb-empty-icon">⏳</div><div class="bb-empty-msg">${msg}</div></div>`;}
function showEmpty(msg){document.getElementById('bball-root').innerHTML=`<div class="bb-empty"><div class="bb-empty-icon">📭</div><div class="bb-empty-msg">${msg}</div></div>`;}
function showError(msg){document.getElementById('bball-root').innerHTML=`<div class="bb-empty"><div class="bb-empty-icon">⚠️</div><div class="bb-empty-msg">${msg}</div></div>`;}

function updateLiveCount(rows){
  const n=rows.filter(m=>bballStatus(m).live).length;
  ['bball-tb-live-n','sb-bball-live-n','bball-live-n'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=n;});
  const b=document.getElementById('bball-tb-live');if(b)b.style.display=n>0?'flex':'none';
}

/* ── COUNTDOWN ── */
function startCountdown(){
  B.cd=B.cycle||30;updateRing();
  if(B.timer)clearInterval(B.timer);
  B.timer=setInterval(async()=>{B.cd--;updateRing();if(B.cd<=0){B.cd=B.cycle||30;await loadBball(true);}},1000);
}
function updateRing(){
  const el=document.getElementById('bball-cd');if(el)el.textContent=B.cd;
  const ring=document.getElementById('bball-ring');if(!ring)return;
  const C=2*Math.PI*8;ring.style.strokeDasharray=C;ring.style.strokeDashoffset=C*(1-B.cd/(B.cycle||30));
}

/* ── INIT ── */
async function initBball(){
  if(typeof window.supabase==='undefined'){console.error('Supabase SDK yüklenmedi!');return;}
  B.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  buildBballDateStrip();
  await loadBball(false);
  startCountdown();
}
document.addEventListener('DOMContentLoaded',initBball);
