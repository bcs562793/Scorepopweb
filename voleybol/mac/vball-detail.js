/* ═══════════════════════════════════════════════════════
   SCOREPOP — vball-detail.js  (v1.0)
   Voleybol maç detay sayfası  /voleybol/mac/[id]-slug

   Veri kaynakları:
     1. Supabase live_vball   (canlı/bugünkü/geçmiş maçlar — FT satırları kalır)
     2. Supabase future_vball (ileri tarihli — temel bilgi)
   Not: voleybolda arşiv kaynağı yok (bkz. voleybol/vball.js).

   Set modeli: maksimum 5 set (3 kazanan taraf maçı alır).
═══════════════════════════════════════════════════════ */
'use strict';

let VD = { row: null, refreshTimer: null };

/* ── HELPERS ─────────────────────────────────────────── */
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(iso){ if(!iso)return '--:--'; try{const d=new Date(iso);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}catch{return '--:--';} }
function safeJSON(v,fb){
  if(!v)return fb;
  if(typeof v==='object')return v;
  try{
    let p=JSON.parse(v);
    if(typeof p==='string') p=JSON.parse(p);
    return p;
  }catch{return fb;}
}
function teamMono(name,size){
  const n=String(name||'').trim();
  const parts=n.split(/\s+/).filter(Boolean);
  const ini=(parts.length>1?parts[0][0]+parts[1][0]:n.slice(0,2)).toLocaleUpperCase('tr-TR');
  let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;
  const hue=h%360;
  return `<div class="tm-mono" style="width:${size}px;height:${size}px;font-size:${Math.round(size*.38)}px;background:hsl(${hue} 28% 16%);border-color:hsl(${hue} 30% 26%);color:hsl(${hue} 45% 72%)">${esc(ini)}</div>`;
}

/* ── STATUS ─────────────────────────────────────────── */
const MAX_SETS = 5; /* voleybolda maç maksimum 5 set üzerinden oynanır (3 set kazanan alır) */

function vballStatus(m){
  const LM={'S1':'1. Set','S2':'2. Set','S3':'3. Set','S4':'4. Set','S5':'5. Set'};
  const s=(m.status_short||'').toUpperCase();
  if(s==='FT')return{live:false,done:true,label:'Maç Sonu',cls:'done'};
  if(s==='INT')return{live:false,done:true,label:'Tatil Edildi',cls:'done'};
  if(LM[s])return{live:true,done:false,label:LM[s],cls:'live'};
  return{live:false,done:false,label:fmtTime(m.scheduled_at),cls:'sched'};
}

/* ── URL PARSING ─────────────────────────────────────── */
function parseIdFromURL(){
  const parts=window.location.pathname.split('/');
  const idx=parts.indexOf('mac');
  if(idx===-1)return null;
  const seg=parts[idx+1]||'';
  return seg.split('-')[0]||null;
}

/* future_vball row → display row (aynı alan şeması, boş set verisiyle) */
function futureToRow(r){
  return{
    nesine_bid:String(r.nesine_bid),_isFuture:true,
    league_name:r.league_name||'',country:r.country||'',
    home_team:r.home_team||'',away_team:r.away_team||'',
    status_short:'NS',current_set:null,
    home_sets:null,away_sets:null,
    home_set_points:null,away_set_points:null,
    home_s1:null,away_s1:null,home_s2:null,away_s2:null,home_s3:null,away_s3:null,
    home_s4:null,away_s4:null,home_s5:null,away_s5:null,
    scheduled_at:r.starts_at,
    home_recent_form:'[]',away_recent_form:'[]',
    h2h:null,standings:null,
  };
}

/* ═══════════════════════════════════════════════════════
   DATA FETCH
═══════════════════════════════════════════════════════ */
async function fetchMatchData(id){
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const numId=parseInt(id,10);
  if(isNaN(numId))return null;

  /* 1. live_vball by nesine_bid */
  const{data,error}=await sb.from('live_vball').select('*').eq('nesine_bid',numId).limit(1);
  if(!error&&data?.length)return data[0];

  /* 2. future_vball by nesine_bid */
  const{data:fData}=await sb.from('future_vball').select('*').eq('nesine_bid',numId).limit(1);
  if(fData?.length)return futureToRow(fData[0]);

  return null;
}

/* ── SEO ─────────────────────────────────────────────── */
function setSEO(row,st){
  const hs=row.home_sets,as=row.away_sets;
  const hasScore=hs!=null&&as!=null&&st.done;
  const scoreStr=hasScore?`${hs}-${as}`:'vs';
  let title,desc;
  if(st.done){title=`${row.home_team} ${scoreStr} ${row.away_team} Maç Sonucu${row.league_name?' — '+row.league_name:''}`;desc=`${row.home_team} ${scoreStr} ${row.away_team}. Set skorları. ${row.league_name||'Voleybol'}.`;}
  else if(st.live){title=`🔴 ${row.home_team} ${hs??0}-${as??0} ${row.away_team} CANLI`;desc=`${row.home_team} vs ${row.away_team} canlı. ${st.label}. ${row.league_name||'Voleybol'}.`;}
  else{title=`${row.home_team} - ${row.away_team}${row.league_name?' | '+row.league_name:''} | Voleybol`;desc=`${row.home_team} - ${row.away_team}. ${row.league_name||'Voleybol'}. Set skorları ScorePop'ta.`;}
  document.title=`${title} | ScorePop`;
  const setM=(n,v)=>{let el=document.querySelector(`meta[name="${n}"]`);if(!el){el=document.createElement('meta');el.name=n;document.head.appendChild(el);}el.content=v;};
  const setOG=(p,v)=>{let el=document.querySelector(`meta[property="${p}"]`);if(!el){el=document.createElement('meta');el.setAttribute('property',p);document.head.appendChild(el);}el.content=v;};
  setM('description',desc);setOG('og:title',title);setOG('og:description',desc);setOG('og:url',window.location.href);setOG('og:type','article');setOG('og:image','https://scorepop.com.tr/logo.png');
  let canon=document.querySelector('link[rel="canonical"]');if(!canon){canon=document.createElement('link');canon.rel='canonical';document.head.appendChild(canon);}canon.href=window.location.origin+window.location.pathname;
  const startISO=row.scheduled_at?new Date(row.scheduled_at).toISOString():new Date().toISOString();
  const endISO=new Date(new Date(startISO).getTime()+2*60*60*1000).toISOString();
  const schema={'@context':'https://schema.org','@type':'SportsEvent',name:`${row.home_team} - ${row.away_team}`,sport:'Volleyball',description:desc,url:window.location.href,startDate:startISO,endDate:endISO,eventStatus:st.live?'https://schema.org/EventLive':(st.done?'https://schema.org/EventCompleted':'https://schema.org/EventScheduled'),image:'https://scorepop.com.tr/logo.png',organizer:{'@type':'SportsOrganization',name:row.league_name||'Voleybol',url:'https://scorepop.com.tr'},performer:[{'@type':'SportsTeam',name:row.home_team},{'@type':'SportsTeam',name:row.away_team}],offers:{'@type':'Offer',url:window.location.origin+window.location.pathname,price:'0',priceCurrency:'TRY',availability:'https://schema.org/OnlineOnly'},location:{'@type':'Place',name:row.league_name||'Voleybol',address:{'@type':'PostalAddress',addressCountry:row.country||'TR'}},homeTeam:{'@type':'SportsTeam',name:row.home_team},awayTeam:{'@type':'SportsTeam',name:row.away_team},...(hasScore?{homeScore:{'@type':'Integer',value:hs},awayScore:{'@type':'Integer',value:as}}:{})};
  let jl=document.getElementById('bd-jsonld');if(!jl){jl=document.createElement('script');jl.id='bd-jsonld';jl.type='application/ld+json';document.head.appendChild(jl);}jl.textContent=JSON.stringify(schema);
  const bc={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'Ana Sayfa',item:'https://scorepop.com.tr/'},{'@type':'ListItem',position:2,name:'Voleybol',item:'https://scorepop.com.tr/voleybol/'},{'@type':'ListItem',position:3,name:`${row.home_team} - ${row.away_team}`,item:window.location.href}]};
  let bcl=document.getElementById('bd-breadcrumb');if(!bcl){bcl=document.createElement('script');bcl.id='bd-breadcrumb';bcl.type='application/ld+json';document.head.appendChild(bcl);}bcl.textContent=JSON.stringify(bc);
}

/* ═══════════════════════════════════════════════════════
   RENDER
═══════════════════════════════════════════════════════ */
function renderDetail(row){
  VD.row=row;
  const st=vballStatus(row);
  const isNS=!st.live&&!st.done;
  setSEO(row,st);

  const hl=teamMono(row.home_team,64);
  const al=teamMono(row.away_team,64);

  let scoreHtml;
  if(isNS){
    scoreHtml=`<div class="bd-score-time">${esc(st.label)}</div>`;
  }else{
    const hs=row.home_sets??0,as=row.away_sets??0;
    let hcls='',acls='';
    if(st.done){if(+hs>+as){hcls='bd-win';acls='bd-loss';}else if(+as>+hs){acls='bd-win';hcls='bd-loss';}}
    scoreHtml=`<div class="bd-score-box${st.live?' live':''}"><span class="bd-sn ${hcls}">${hs}</span><span class="bd-sep">–</span><span class="bd-sn ${acls}">${as}</span></div>`;
    /* Canlıyken oynanan setin anlık sayısı */
    if(st.live&&row.home_set_points!=null&&row.away_set_points!=null){
      scoreHtml+=`<div class="bd-live-point">${row.home_set_points} – ${row.away_set_points}</div>`;
    }
  }

  /* Set şeridi — sadece oynanmış/oynanmakta olan setler (maks. 5) */
  let qStrip='';
  if(!isNS){
    const sets=[
      [row.home_s1,row.away_s1,'S1'],
      [row.home_s2,row.away_s2,'S2'],
      [row.home_s3,row.away_s3,'S3'],
      [row.home_s4,row.away_s4,'S4'],
      [row.home_s5,row.away_s5,'S5'],
    ];
    const items=[];
    sets.forEach(([h,a,lbl],i)=>{
      if(h==null&&a==null)return;
      const isCurrent=st.live&&row.current_set===i+1;
      items.push(`<div class="bd-qchip${isCurrent?' active':''}"><b>${lbl}</b>${h}-${a}</div>`);
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

  const ozHtml=buildSetsTab(row,st,isNS);

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
    <div id="bdp-oz" class="bd-panel active">${ozHtml}</div>`;
}

/* ── SET SKORLARI TABLOSU ─────────────────────────────── */
function buildSetsTab(row,st,isNS){
  let html='';
  if(!isNS){
    const setRows=[
      {lbl:'1. Set',h:row.home_s1,a:row.away_s1},
      {lbl:'2. Set',h:row.home_s2,a:row.away_s2},
      {lbl:'3. Set',h:row.home_s3,a:row.away_s3},
      {lbl:'4. Set',h:row.home_s4,a:row.away_s4},
      {lbl:'5. Set',h:row.home_s5,a:row.away_s5},
    ];
    setRows.push({lbl:'Setler',h:row.home_sets,a:row.away_sets,total:true});
    const trs=setRows.filter(q=>q.h!=null||q.a!=null).map(q=>{
      const cls=q.total?'bd-tr-total':'';
      let hcls='',acls='';
      if(!q.total&&q.h!=null&&q.a!=null){if(+q.h>+q.a){hcls='bd-cell-w';acls='bd-cell-l';}else if(+q.a>+q.h){acls='bd-cell-w';hcls='bd-cell-l';}}
      return `<tr class="${cls}"><td>${q.lbl}</td><td class="${hcls}">${q.h??'-'}</td><td class="${acls}">${q.a??'-'}</td></tr>`;
    }).join('');
    if(trs)html+=`<div class="bd-section"><div class="bd-sh">Set Skorları</div><table class="bd-qtr-table"><thead><tr><th></th><th>${esc(row.home_team)}</th><th>${esc(row.away_team)}</th></tr></thead><tbody>${trs}</tbody></table></div>`;
  }
  if(!html)html=`<div class="bd-empty"><div class="empty-mark"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M6 9h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><div>${isNS?'Maç henüz başlamadı':'Veri mevcut değil'}</div></div>`;
  return html;
}

/* ── LIVE REFRESH ─────────────────────────────────────── */
async function refreshDetail(id){
  const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const numId=parseInt(id,10);if(isNaN(numId))return;
  const{data,error}=await sb.from('live_vball').select('*').eq('nesine_bid',numId).limit(1);
  if(!error&&data?.length)renderDetail(data[0]);
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
  const st=vballStatus(row);
  if(st.live)VD.refreshTimer=setInterval(()=>refreshDetail(id),20000);
}

function showDetailLoading(){document.getElementById('bd-root').innerHTML=`<div class="bd-init-loading"><div class="bd-spin"></div><div>Maç verisi yükleniyor…</div></div>`;}
function showDetailError(msg){document.getElementById('bd-root').innerHTML=`<div class="bd-init-error"><div class="empty-mark"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2 16.5 15h-15L9 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 7v3.5M9 12.6v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><div>${esc(msg)}</div><a class="bd-back-btn" href="/voleybol/">← Voleybol Sayfasına Dön</a></div>`;}

document.addEventListener('DOMContentLoaded',initDetail);
