'use strict';

/* ═══════════════════════════════════════════════════════
   SCOREPOP — vball.js (v2, web repo bball.js v2 tabanlı)
   Voleybol: set modeli
     ana skor  = home_sets/away_sets (kazanılan setler)
     set chip  = home_s1..s5
     durum     = NS | S1..S5 | FT | INT
   Veri: live_vball + future_vball (Supabase)
   Not: voleybolda arşiv kaynağı yok — geçmiş tarihler de
        live_vball'dan okunur (FT satırları tabloda kalır).
═══════════════════════════════════════════════════════ */

const V = {
  sb: null, date: todayStr(), timer: null, cd: 30, cycle: 30,
  rowCache: {},
};

function _vbSlug(s){return String(s||'').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,50);}

function vbMono(name){
  const n=String(name||'').trim();
  const parts=n.split(/\s+/).filter(Boolean);
  const ini=(parts.length>1?parts[0][0]+parts[1][0]:n.slice(0,2)).toLocaleUpperCase('tr-TR');
  let h=0;for(let i=0;i<n.length;i++)h=(h*31+n.charCodeAt(i))>>>0;
  const hue=h%360;
  return `<span class="tm-mono" style="width:20px;height:20px;font-size:8px;border-radius:5px;background:hsl(${hue} 28% 16%);border-color:hsl(${hue} 30% 26%);color:hsl(${hue} 45% 72%)">${esc(ini)}</span>`;
}

function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

/* FIX: Set bazlı verilerden kazanılan (TAMAMLANMIŞ) set sayısını hesaplar.
   Önceki hâli current_set'i hiç kontrol etmiyordu, bu yüzden o an oynanan
   seti de "kim önde ise o kazandı" gibi sayıyordu (örn. 1. set 5-3 iken
   0-1 gösteriyordu, 22-22 olunca fark kalktığı için 0-0'a düşüyordu).
   Artık current_set'ten ÖNCEKİ setler sayılır, o an oynanan set asla
   sayılmaz — maç bittiğinde (st.done) tüm setler değerlendirilir. */
function computeSetScore(m, st){
  // FIX: DB'nin hazır home_sets/away_sets toplamı ingestion tarafında son
  // setin işlenmemesi yüzünden gerçek değerin 1 eksiğinde donup kalabiliyor
  // (bkz. tespit: FT/INT maçlarda tutarlı şekilde -1). Set kolonları (s1..s5)
  // doğru geldiği için artık HER ZAMAN onlardan hesaplanıyor; DB toplamı
  // sadece set kolonları hiç yoksa (örn. eski/eksik satır) yedek olarak kullanılıyor.
  const activeSet = (st && st.done) ? 6 : (m.current_set || 1);
  let hs=0, as=0, any=false;
  for(let i=1;i<=5;i++){
    if(i>=activeSet) break; // henüz oynanmakta olan / gelecek set — atla
    const h=m[`home_s${i}`], a=m[`away_s${i}`];
    if(h==null||a==null)continue;
    any=true;
    if(+h>+a)hs++; else if(+a>+h)as++;
  }
  if(any) return {hs, as};
  if(m.home_sets!=null && m.away_sets!=null) return {hs:m.home_sets, as:m.away_sets};
  return {hs:0, as:0};
}

function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtTime(iso){ if(!iso)return '--:--'; try{const d=new Date(iso);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}catch{return '--:--';} }
function dateLabel(s){ const M=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']; const[,m,d]=(s||'').split('-'); return m?`${+d} ${M[+m-1]}`:s; }

function vballStatus(m){
  const LM={'S1':'1.SET','S2':'2.SET','S3':'3.SET','S4':'4.SET','S5':'5.SET'};
  const s=(m.status_short||'').toUpperCase();
  if(s==='FT')return{live:false,done:true,label:'MS',cls:'done'};
  if(s==='INT')return{live:false,done:true,label:'TATİL',cls:'done'};
  if(LM[s]){return{live:true,done:false,label:LM[s],cls:'live'};}
  return{live:false,done:false,label:fmtTime(m.scheduled_at),cls:'sched'};
}

function futureRowToDisplay(r){
  return{nesine_bid:String(r.nesine_bid),league_name:r.league_name||'',country:r.country||'',
    home_team:r.home_team||'',away_team:r.away_team||'',
    status_short:'NS',home_sets:null,away_sets:null,
    home_set_points:null,away_set_points:null,current_set:null,
    home_s1:null,away_s1:null,home_s2:null,away_s2:null,home_s3:null,away_s3:null,
    home_s4:null,away_s4:null,home_s5:null,away_s5:null,
    scheduled_at:r.starts_at,_isFuture:true};
}

/* ── DATE STRIP ── */
function buildVballDateStrip(){
  const el=document.getElementById('vball-date-strip'); if(!el)return;
  const today=todayStr(), days=[];
  const base=new Date(V.date+'T12:00:00');
  for(let i=-6;i<=6;i++){const d=new Date(base);d.setDate(d.getDate()+i);const s=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;days.push(s);}
  el.innerHTML=days.map(s=>`<button class="bdp${s===V.date?' active':''}" onclick="pickVballDate('${s}')">${s===today?'Bugün':dateLabel(s)}</button>`).join('');
  setTimeout(()=>el.querySelector('.bdp.active')?.scrollIntoView({inline:'center',behavior:'smooth'}),100);
}
function pickVballDate(d){V.date=d;buildVballDateStrip();loadVball(false);}
function pickVballCalendar(d){if(!d)return;V.date=d;buildVballDateStrip();loadVball(false);}
function vballOpenCalendar(){
  const i=document.getElementById('vball-date-input'); if(!i)return;
  i.value=V.date;
  try{ i.showPicker(); }catch{ i.focus(); i.click(); }
}

/* ── FETCH ── */
async function fetchAllVball(query){
  const PAGE=1000;let from=0,all=[];
  while(true){const{data,error}=await query.range(from,from+PAGE-1);if(error){console.error('[vball]',error.message);break;}if(!data?.length)break;all=all.concat(data);if(data.length<PAGE)break;from+=PAGE;}
  return all;
}

/* ── LOAD ── */
async function loadVball(silent=false){
  if(!silent)showSkel();
  const today=todayStr();
  /* Geçmiş: live_vball'da FT satırları durur → aynı sorgu çalışır.
     Gelecek: future_vball ile birleştir. Bugün: ikisi birden. */
  await loadDay(V.date, V.date >= today);
}

async function loadDay(date, includeFuture){
  try{
    const dayStart=`${date}T00:00:00+03:00`, dayEnd=`${date}T23:59:59+03:00`;
    const liveQ = fetchAllVball(
      V.sb.from('live_vball')
        .select('nesine_bid,home_team,away_team,league_name,country,status_short,current_set,home_sets,away_sets,home_set_points,away_set_points,home_s1,away_s1,home_s2,away_s2,home_s3,away_s3,home_s4,away_s4,home_s5,away_s5,scheduled_at')
        .gte('scheduled_at',dayStart)
        .lte('scheduled_at',dayEnd)
        .order('scheduled_at')
    );
    const futQ = includeFuture ? fetchAllVball(
      V.sb.from('future_vball')
        .select('nesine_bid,home_team,away_team,league_name,country,starts_at')
        .gte('starts_at',dayStart)
        .lte('starts_at',dayEnd)
        .order('starts_at')
    ) : Promise.resolve([]);

    const [liveRows,futureRows]=await Promise.all([liveQ,futQ]);
    const seen=new Set(liveRows.map(r=>String(r.nesine_bid)));
    const merged=liveRows
      .concat(futureRows.filter(r=>!seen.has(String(r.nesine_bid))).map(futureRowToDisplay))
      .sort((a,b)=>String(a.scheduled_at||'').localeCompare(String(b.scheduled_at||'')));
    if(!merged.length){showEmpty(`${date} için voleybol maçı bulunamadı.`);return;}
    renderVball(merged);
  }catch(e){console.error(e);showError('Veriler yüklenemedi.');}
}

/* ── RENDER ── */
function renderVball(rows){
  updateLiveCount(rows);
  V.rowCache={};
  rows.forEach(r=>{V.rowCache[String(r.nesine_bid)]=r;});
  if(!rows.length){showEmpty('Maç bulunamadı.');return;}

  const groups={};
  rows.forEach(m=>{const k=m.league_name||'Diğer';if(!groups[k])groups[k]={name:k,country:m.country||'',matches:[]};groups[k].matches.push(m);});
  const sorted=Object.values(groups).sort((a,b)=>{
    const aL=a.matches.some(m=>vballStatus(m).live), bL=b.matches.some(m=>vballStatus(m).live);
    if(aL&&!bL)return -1;if(!aL&&bL)return 1;return a.name.localeCompare(b.name,'tr');
  });
  document.getElementById('vball-root').innerHTML=sorted.map(renderGroup).join('');
}

function renderGroup(g){
  const lc=g.matches.filter(m=>vballStatus(m).live).length;
  const livePill=lc?`<span class="lg-live-ct">${lc} CANLI</span>`:'';
  return `<div class="lg-grp">
    <div class="lg-hdr" onclick="this.closest('.lg-grp').classList.toggle('closed')">
      <div style="display:flex;align-items:center;gap:6px;flex:1;flex-wrap:nowrap">
        <span class="lg-hdr-name" style="white-space:nowrap;font-size:13px;font-weight:500">${esc(g.name)}</span>
        ${livePill}
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <span class="lg-arrow">▾</span>
      </div>
    </div>
    <div class="lg-body">${g.matches.map(renderRow).join('')}</div>
  </div>`;
}

function renderRow(m){
  const st=vballStatus(m);
  const isNS=!st.live&&!st.done;
  const stCls=st.live?'live':(st.done?'done':'sched');
  const cs=isNS?{hs:0,as:0}:computeSetScore(m, st);
  const hs=isNS?'v':cs.hs;
  const as_=isNS?'':cs.as;

  let hcls='',acls='';
  if(st.done&&hs!=='v'&&as_!==''){if(+hs>+as_){hcls='bold';acls='dim';}else if(+as_>+hs){acls='bold';hcls='dim';}}

  const hl=vbMono(m.home_team);
  const al=vbMono(m.away_team);
  const sbCls = st.live ? 'mr-sb live' : (isNS ? 'mr-sb ns' : 'mr-sb');
  const _href = `/voleybol/mac/${m.nesine_bid}-${_vbSlug(m.home_team)}-vs-${_vbSlug(m.away_team)}`;

return `<div class="mr${st.live?' is-live':''}" data-id="${m.nesine_bid}" onclick="window.location.href='${_href}'">
    <div class="mr-time"><span class="mr-t1 ${stCls}">${esc(st.label)}</span></div>
    <div class="mr-home">
      <span class="mr-name ${hcls}">${esc(m.home_team)}</span>
      <div class="mr-logo-wrap">${hl}</div>
    </div>
    <div class="mr-score">
      <div class="${sbCls}">
        <span class="mr-n">${hs}</span>
        ${isNS?'':'<div class="mr-sep"></div>'}
        ${isNS?'':`<span class="mr-n">${as_}</span>`}
      </div>
    </div>
    <div class="mr-away">
      <div class="mr-logo-wrap">${al}</div>
      <span class="mr-name ${acls}">${esc(m.away_team)}</span>
    </div>
    <div class="mr-x"><span class="mr-arr">›</span></div>
  </div>`;
}

/* ── UI ── */
function showSkel(){document.getElementById('vball-root').innerHTML=`<div class="bb-skel"><div class="bb-skel-h"></div><div class="bb-skel-r"></div><div class="bb-skel-r"></div><div class="bb-skel-r"></div><div class="bb-skel-h"></div><div class="bb-skel-r"></div><div class="bb-skel-r"></div></div>`;}
function showLoading(msg){document.getElementById('vball-root').innerHTML=`<div class="bb-empty"><div class="bb-empty-icon">⏳</div><div class="bb-empty-msg">${msg}</div></div>`;}
function showEmpty(msg){document.getElementById('vball-root').innerHTML=`<div class="bb-empty"><div class="empty-mark"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M6 9h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><div class="bb-empty-msg">${msg}</div></div>`;}
function showError(msg){document.getElementById('vball-root').innerHTML=`<div class="bb-empty"><div class="empty-mark"><svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2 16.5 15h-15L9 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 7v3.5M9 12.6v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></div><div class="bb-empty-msg">${msg}</div></div>`;}

function updateLiveCount(rows){
  const n=rows.filter(m=>vballStatus(m).live).length;
  ['vball-tb-live-n','sb-vball-live-n','vball-live-n'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=n;});
  const b=document.getElementById('vball-tb-live');if(b)b.style.display=n>0?'flex':'none';
}

/* ── COUNTDOWN ── */
function startCountdown(){
  V.cd=V.cycle||30;updateRing();
  if(V.timer)clearInterval(V.timer);
  V.timer=setInterval(async()=>{V.cd--;updateRing();if(V.cd<=0){V.cd=V.cycle||30;await loadVball(true);}},1000);
}
function updateRing(){
  const el=document.getElementById('vball-cd');if(el)el.textContent=V.cd;
  const ring=document.getElementById('vball-ring');if(!ring)return;
  const C=2*Math.PI*8;ring.style.strokeDasharray=C;ring.style.strokeDashoffset=C*(1-V.cd/(V.cycle||30));
}

/* ── INIT ── */
async function initVball(){
  if(typeof window.supabase==='undefined'){console.error('Supabase SDK yüklenmedi!');return;}
  V.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  buildVballDateStrip();
  await loadVball(false);
  startCountdown();
}
document.addEventListener('DOMContentLoaded',initVball);
