'use strict';
/* ScorePop — Bağımsız takım sayfası (/takim/{id}-slug)
   Doğrudan URL açılışı, yenileme ve SEO botları bu sayfayı görür.
   SPA içi gezinmede app.js'teki renderTeamPage devreye girer; bu dosya onun
   bağımsız (config.js + supabase dışında bağımsız) ikizidir.
   - mac_t_id ile tm_teams'e bağlanır; yoksa TAKIM ADINDAN fuzzy eşleştirir. */

/* ───────── İsim normalizasyon & benzerlik (Türkçe) ───────── */
const _STOP = new Set(['fc','sc','sk','as','cf','if','fk','ac','cd','sd','ud','afc','spor','kulubu','kulup','club','calcio','team','the','de','la']);
function turkNorm(s){
  return String(s||'').toLowerCase()
    .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u')
    .replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/&/g,' ve ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function toks(s){ return turkNorm(s).split(' ').filter(t=>t && !_STOP.has(t)); }
function jaccard(a,b){
  const A=new Set(toks(a)), B=new Set(toks(b));
  if(!A.size||!B.size) return 0;
  let i=0; A.forEach(x=>{ if(B.has(x)) i++; });
  return i/(A.size+B.size-i);
}
function isReserve(name){
  return /\b(u1[0-9]|u2[0-9]|u9|reserve|reserves|youth|akademi|altyapi|amator|genc|kadin|women|woman|femin|b takimi|ii|junior)\b/.test(turkNorm(name));
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function resolveTeam(sb, macId, teamName){
  /* 1) Birincil: mac_t_id */
  if(macId!=null && !isNaN(macId)){
    const { data } = await sb.from('tm_teams').select('*').eq('mac_t_id', macId).maybeSingle();
    if(data){ data._linkedBy='id'; return data; }
  }
  /* 2) Fallback: isimden fuzzy */
  if(teamName){
    const core = toks(teamName).sort((a,b)=>b.length-a.length)[0]||'';
    if(core.length>=3){
      const rawFirst = String(teamName).trim().split(/\s+/)[0]||'';
      let cands=[];
      try{
        const { data } = await sb.from('tm_teams').select('*')
          .or(`name.ilike.%${core}%,name.ilike.${rawFirst}%`).limit(60);
        if(data) cands=data;
      }catch(e){
        try{ const { data } = await sb.from('tm_teams').select('*').ilike('name',`%${core}%`).limit(60); if(data) cands=data; }catch(_){}
      }
      let best=null, bs=0;
      for(const c of cands){
        let sc=jaccard(teamName,c.name);
        if(isReserve(c.name) && !isReserve(teamName)) sc-=0.35;
        if(sc>bs){ bs=sc; best=c; }
      }
      if(best && bs>=0.6){ best._linkedBy='name'; best._matchScore=+bs.toFixed(2); return best; }
    }
  }
  return null;
}

/* ───────── Fikstür parse (raw_data/data JSON blob) ───────── */
function parseFixture(r){
  let d = {};
  if(r.raw_data){ try{ d = typeof r.raw_data==='string'?JSON.parse(r.raw_data):r.raw_data; }catch(e){} }
  else if(r.data){ let x=r.data; if(typeof x==='string'){ try{ x=JSON.parse(x); }catch(e){ x=null; } } if(x){ d = Array.isArray(x)?x[0]:x; } }
  const m = {...r, ...d};
  return {
    fixture_id: m.fixture?.id || m.fixture_id || r.fixture_id,
    home_team_id: m.teams?.home?.id ?? m.home_team_id ?? null,
    away_team_id: m.teams?.away?.id ?? m.away_team_id ?? null,
    home_team: m.teams?.home?.name || m.home_team || '',
    away_team: m.teams?.away?.name || m.away_team || '',
    date: r.date || m.date || (m.fixture?.date||'').slice(0,10),
    kickoff: m.fixture?.date || m.kickoff_time || m.kickoff_at || null
  };
}

function posCat(pos){
  const p=(pos||'').toLowerCase();
  if(/kale/.test(p)) return {c:'#a855f7',k:'KL'};
  if(/stoper|bek|defans|libero?\b|savun/.test(p) && !/ön/.test(p)) return {c:'#3b82f6',k:'DF'};
  if(/orta saha|numara|libero/.test(p)) return {c:'#10b981',k:'OS'};
  if(/kanat|forvet|santrafor|santrfor/.test(p)) return {c:'#f26419',k:'FW'};
  return {c:'#8b95a4',k:'•'};
}

/* Sezon chip'i: tabloyu seçilen sezonla yeniden çiz */
window.tpSetSeason = function(y){
  const by = window.__tpSeasons, build = window.__tpBuildRows;
  if(!by || !by[y] || !build) return;
  window.__tpSeasonSel = y;
  const tbl = document.querySelector('#tp-stand-tbl tbody');
  if(tbl) tbl.innerHTML = build(by[y]);
  document.querySelectorAll('.tp-schip').forEach(b=>
    b.classList.toggle('active', b.textContent.startsWith(String(y))));
};

/* ───────── Giriş ───────── */
document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const root = document.getElementById('team-root');

  const last = (window.location.pathname.split('/').filter(Boolean).pop() || '');
  const idMatch = last.match(/^(\d+)/);
  if(!idMatch){
    root.innerHTML = `<div class="empty"><div class="empty-t">Geçersiz Takım URL'si</div></div>`;
    return;
  }
  const macId = parseInt(idMatch[1], 10);
  const nameGuess = (last.match(/^\d+-(.+)$/)||[])[1]?.replace(/-/g,' ').trim() || '';

  try{
    const tmTeam = await resolveTeam(sb, macId, nameGuess);
    if(tmTeam && tmTeam._linkedBy==='name')
      console.info(`[takim] mac_t_id=${macId} link yok → isimden eşleşti: "${tmTeam.name}" (skor ${tmTeam._matchScore})`);

    /* Fikstür — bugünden ileri, client-side filtre */
    const today = new Date().toLocaleDateString('sv-SE',{ timeZone:'Europe/Istanbul' });
    const { data: futRows } = await sb.from('future_matches')
      .select('*').gte('date', today).order('date',{ ascending:true }).limit(2000);
    const parsed = (futRows||[]).map(parseFixture);
    let fixtures = parsed
      .filter(f => String(f.home_team_id)===String(macId) || String(f.away_team_id)===String(macId))
      .slice(0,15);
    /* id eşleşmesi boşsa: takım adından eşleştir (tm_teams lookup'ıyla aynı desen) */
    if(!fixtures.length){
      const nrm=s=>String(s||'').toLowerCase()
        .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
        .replace(/[^a-z0-9]+/g,' ').trim();
      const targets=[];
      if(tmTeam&&tmTeam.name) targets.push(nrm(tmTeam.name));
      if(nameGuess) targets.push(nrm(nameGuess));
      const match1=(a,b)=>a&&b&&(a===b||a.startsWith(b+' ')||b.startsWith(a+' '));
      fixtures = parsed.filter(f=>{
        const h=nrm(f.home_team), a=nrm(f.away_team);
        return targets.some(t=>match1(h,t)||match1(a,t));
      }).slice(0,15);
    }

    /* Sezonluk fikstür: tm_fixtures (team_mac_id = URL'deki mac_t_id) */
    let seasonFx=[];
    try{
      const { data } = await sb.from('tm_fixtures').select('*')
        .eq('team_mac_id', macId).order('kickoff',{ascending:true});
      if(data) seasonFx=data;
    }catch(e){}

    let standings=[], players=[];
    if(tmTeam && tmTeam.league){
      try{ const { data } = await sb.from('tm_standings').select('*').eq('league',tmTeam.league); if(data) standings=data; }catch(e){}
    }
    if(tmTeam && tmTeam.id){
      try{ const { data } = await sb.from('tm_players').select('*').eq('team_id',tmTeam.id).order('market_value_eur',{ascending:false}); if(data) players=data; }catch(e){}
    }

    document.title = (tmTeam?.name ? tmTeam.name : 'Takım') + ' — Fikstür, Kadro, Puan Durumu | ScorePop';
    render(root, macId, tmTeam, fixtures, standings, players, seasonFx);
  }catch(err){
    console.error(err);
    root.innerHTML = `<div class="empty"><div class="empty-t">Bağlantı hatası oluştu.</div></div>`;
  }
});

function render(root, macId, tmTeam, fixtures, standings, players, seasonFx){
  const css = `<style>
    .tp{max-width:920px;margin:0 auto;}
    .tp-hero{position:relative;overflow:hidden;border-radius:18px;padding:26px 26px 22px;margin-bottom:14px;
      background:linear-gradient(135deg,var(--bg2) 0%,var(--bg4) 100%);border:1px solid var(--b1);}
    .tp-hero-top{display:flex;gap:20px;align-items:center;}
    .tp-crest{width:92px;height:92px;flex-shrink:0;border-radius:16px;background:var(--bg2);border:1px solid var(--b1);
      display:flex;align-items:center;justify-content:center;}
    .tp-crest img{width:66px;height:66px;object-fit:contain;}
    .tp-crest .tp-ph{font-size:32px;font-weight:800;color:var(--tx3);}
    .tp-league{display:inline-block;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
      color:var(--or);background:var(--or2);border:1px solid rgba(242,100,25,.3);padding:3px 10px;border-radius:20px;margin-bottom:8px;}
    .tp-name{font-size:30px;font-weight:800;line-height:1.05;color:var(--tx1);}
    .tp-meta{font-size:13px;color:var(--tx2);margin-top:6px;}.tp-meta b{color:var(--tx1);font-weight:600;}
    .tp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:18px;}
    .tp-stat{background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:12px 14px;}
    .tp-stat-l{font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--tx3);margin-bottom:5px;}
    .tp-stat-v{font-size:17px;font-weight:700;color:var(--tx1);}
    .tp-tabs{display:flex;gap:4px;background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:5px;margin-bottom:14px;position:sticky;top:8px;z-index:5;}
    .tp-tab{flex:1;border:none;background:none;font-size:14px;font-weight:600;color:var(--tx2);padding:10px 8px;border-radius:8px;cursor:pointer;}
    .tp-tab.active{color:#fff;background:var(--or);}
    .tp-panel{display:none;}.tp-panel.active{display:block;}
    .tp-empty{text-align:center;color:var(--tx3);padding:40px 0;font-size:14px;}
    .tp-squad{border:1px solid var(--b1);border-radius:14px;overflow:hidden;background:var(--bg2);}
    .tp-prow{display:grid;grid-template-columns:4px 36px 1fr auto;align-items:center;gap:12px;padding:11px 16px 11px 0;border-bottom:1px solid var(--b1);}
    .tp-prow:last-child{border-bottom:none;}.tp-prow:nth-child(even){background:var(--bg4);}
    .tp-pbar{width:4px;height:38px;border-radius:0 3px 3px 0;}
    .tp-pcat{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;}
    .tp-pname{font-size:14px;font-weight:600;color:var(--tx1);}.tp-ppos{font-size:11.5px;color:var(--tx3);margin-top:2px;}
    .tp-pval{font-size:13.5px;font-weight:600;color:var(--tx1);padding-right:16px;white-space:nowrap;}.tp-pval.muted{color:var(--tx3);}
    .tp-seasons{display:flex;gap:6px;margin-bottom:10px;}
    .tp-schip{border:1px solid var(--b1);background:var(--bg2);color:var(--tx2);font-size:12.5px;font-weight:600;
      padding:6px 14px;border-radius:20px;cursor:pointer;}
    .tp-schip.active{background:var(--or);border-color:var(--or);color:#fff;}
    .tp-stand{border:1px solid var(--b1);border-radius:14px;overflow:hidden;background:var(--bg2);}
    .tp-stand table{width:100%;border-collapse:collapse;font-size:13px;}
    .tp-stand th{font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--tx3);padding:11px 8px;text-align:center;border-bottom:1px solid var(--b2);background:var(--bg4);}
    .tp-stand th.l,.tp-stand td.l{text-align:left;}
    .tp-stand td{padding:11px 8px;text-align:center;border-bottom:1px solid var(--b1);color:var(--tx2);}
    .tp-stand td.team{text-align:left;color:var(--tx1);font-weight:600;}.tp-stand td.pts{font-weight:800;color:var(--tx1);}
    .tp-stand tr.me{background:var(--or3);}.tp-stand tr.me td{color:var(--or);}.tp-stand tr.me td.team{color:var(--or);font-weight:800;}
    .tp-fx{border:1px solid var(--b1);border-radius:14px;overflow:hidden;background:var(--bg2);}
    .tp-frow{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--b1);cursor:pointer;}
    .tp-frow:last-child{border-bottom:none;}.tp-frow:hover{background:var(--or3);}
    .tp-fdate{font-size:11px;color:var(--tx3);width:54px;text-align:center;flex-shrink:0;line-height:1.3;}
    .tp-fcomp{font-size:10.5px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--tx3);
      background:var(--bg4);padding:8px 14px;border-bottom:1px solid var(--b1);}
    .tp-fscore{width:64px;text-align:center;flex-shrink:0;font-size:13.5px;color:var(--tx1);}
    .tp-frow.next{background:var(--or3);}
    .tp-fteams{flex:1;font-size:13.5px;color:var(--tx1);}.tp-fvs{color:var(--tx3);margin:0 6px;}
    @media(max-width:600px){.tp-stats{grid-template-columns:repeat(2,1fr);}.tp-name{font-size:24px;}.tp-crest{width:72px;height:72px;}.tp-crest img{width:50px;height:50px;}}
  </style>`;

  let hero;
  if(tmTeam){
    const founded = tmTeam.founded ? String(tmTeam.founded).split('-')[0] : '–';
    const fmtEur = v => v ? '€'+Number(v).toLocaleString('tr-TR') : '–';
    const initials = (tmTeam.name||'?').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
    hero = `<div class="tp-hero"><div class="tp-hero-top">
      <div class="tp-crest">${tmTeam.crest_url?`<img src="${esc(tmTeam.crest_url)}" onerror="this.parentNode.innerHTML='<span class=&quot;tp-ph&quot;>${esc(initials)}</span>'" alt="">`:`<span class="tp-ph">${esc(initials)}</span>`}</div>
      <div><span class="tp-league">${esc(tmTeam.league||'Lig')}</span>
        <div class="tp-name">${esc(tmTeam.name||'')}</div>
        <div class="tp-meta">Kuruluş: <b>${esc(founded)}</b> &nbsp;·&nbsp; Stadyum: <b>${esc(tmTeam.stadium||'–')}</b></div></div></div>
      <div class="tp-stats">
        <div class="tp-stat"><div class="tp-stat-l">Kadro Değeri</div><div class="tp-stat-v">${fmtEur(tmTeam.squad_value_eur)}</div></div>
        <div class="tp-stat"><div class="tp-stat-l">Yaş Ort.</div><div class="tp-stat-v">${esc(tmTeam.avg_age||'–')}</div></div>
        <div class="tp-stat"><div class="tp-stat-l">Yabancı</div><div class="tp-stat-v">${esc(tmTeam.foreigners??'–')}</div></div>
        <div class="tp-stat"><div class="tp-stat-l">Kadro</div><div class="tp-stat-v">${esc(tmTeam.player_count ?? (players?players.length:'–'))}</div></div>
      </div></div>`;
  } else {
    hero = `<div class="tp-hero"><div class="tp-name" style="font-size:22px;">Takım #${esc(macId)}</div>
      <div class="tp-meta">Bu takımın detaylı profili henüz oluşturulmamış.</div></div>`;
  }

  let fxHtml;
  if(seasonFx&&seasonFx.length){
    /* Sezonluk fikstür (tm_fixtures). Maç linki: match_id sitedeki fixture_id ile
       aynıysa tıklanabilir — future_matches'ten kanıtla, varsayma. */
    const knownIds = new Set((fixtures||[]).map(f=>String(f.fixture_id)));
    const now = Date.now();
    let lastComp = null, nextMarked = false;
    fxHtml = `<div class="tp-fx">`+seasonFx.map(m=>{
      const ko = m.kickoff ? new Date(m.kickoff) : null;
      const d  = ko ? ko.toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'}) : '';
      const t  = ko ? ko.toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
      const played = m.home_score!=null;
      const mid = played
        ? `<b>${m.home_score} - ${m.away_score}</b>`
        : `<span class="tp-fvs">${t}</span>`;
      let compHdr='';
      if(m.competition && m.competition!==lastComp){
        compHdr = `<div class="tp-fcomp">${esc(m.competition)}</div>`;
        lastComp = m.competition;
      }
      let cls='tp-frow';
      if(!played && !nextMarked && ko && ko.getTime()>=now-6*36e5){ cls+=' next'; nextMarked=true; }
      const click = knownIds.has(String(m.match_id))
        ? ` onclick="window.location.href='/mac/${m.match_id}'" style="cursor:pointer"`
        : ` style="cursor:default"`;
      return compHdr+`<div class="${cls}"${click}>
        <div class="tp-fdate">${d}</div>
        <div class="tp-fteams" style="text-align:right">${esc(m.home_name)}</div>
        <div class="tp-fscore">${mid}</div>
        <div class="tp-fteams">${esc(m.away_name)}</div></div>`;
    }).join('')+`</div>`;
  } else if(fixtures&&fixtures.length){
    fxHtml = `<div class="tp-fx">`+fixtures.map(m=>{
        const t = m.kickoff ? new Date(m.kickoff).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'}) : '--:--';
        const d = m.date ? new Date(m.date).toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit'}) : '';
        return `<div class="tp-frow" onclick="window.location.href='/mac/${m.fixture_id}'">
          <div class="tp-fdate">${d}<br>${t}</div>
          <div class="tp-fteams">${esc(m.home_team)}<span class="tp-fvs">v</span>${esc(m.away_team)}</div></div>`;
      }).join('')+`</div>`;
  } else {
    fxHtml = `<div class="tp-empty">Fikstür bulunamadı.</div>`;
  }

  let sqHtml = (players&&players.length)
    ? `<div class="tp-squad">`+players.map(p=>{
        const cat=posCat(p.position);
        const mv=p.market_value_eur?'€'+Number(p.market_value_eur).toLocaleString('tr-TR'):'–';
        const pslug=String(p.name||p.player_name||'').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        return `<div class="tp-prow" style="cursor:pointer" onclick="window.location.href='/oyuncu/${p.id}-${pslug}'"><div class="tp-pbar" style="background:${cat.c}"></div>
          <div class="tp-pcat" style="background:${cat.c}">${cat.k}</div>
          <div><div class="tp-pname">${esc(p.name||p.player_name||'')}</div>${p.position?`<div class="tp-ppos">${esc(p.position)}</div>`:''}</div>
          <div class="tp-pval${p.market_value_eur?'':' muted'}">${mv}</div></div>`;
      }).join('')+`</div>`
    : `<div class="tp-empty">Kadro bilgisi bulunamadı.</div>`;

  let stHtml;
  if(standings&&standings.length){
    const num=v=>{const n=parseFloat(v);return isNaN(n)?-Infinity:n;};
    /* Sezon ayrımı: saison_id'ye göre grupla, varsayılan = en çok maç oynanmış
       sezon (eşitlikte yeni olan). Diğer sezonlar chip ile seçilebilir. */
    const bySeason = {};
    for(const s of standings){ const k = s.saison_id ?? 0; (bySeason[k]=bySeason[k]||[]).push(s); }
    const seasons = Object.keys(bySeason).map(Number).sort((a,b)=>b-a);
    let season = seasons[0];
    if(seasons.length>1){
      let best=-1;
      for(const y of seasons){
        const pl = bySeason[y].reduce((t,s)=>t+(parseInt(s.played)||0),0);
        if(pl>best){ best=pl; season=y; }
      }
    }
    window.__tpSeasons = bySeason; window.__tpSeasonSel = season;
    standings = bySeason[season];
    const gdOf=s=>{const d=num(s.goal_diff??s.goal_difference??s.gd);
      if(d!==-Infinity)return d;
      const gf=num(s.goals_for),ga=num(s.goals_against);
      return (gf!==-Infinity&&ga!==-Infinity)?gf-ga:-Infinity;};
    const buildRows = list => [...list].sort((a,b)=>
        num(b.points??b.pts)-num(a.points??a.pts) ||
        gdOf(b)-gdOf(a) ||
        num(b.win??b.wins??b.won??b.w)-num(a.win??a.wins??a.won??a.w)
      ).map((s,i)=>{
      const nm=s.team_name||s.team||s.name||'';
      const me=(tmTeam&&tmTeam.name&&nm===tmTeam.name)?' class="me"':'';
      const g=s.win??s.wins??s.won??s.w??'–', b=s.draw??s.draws??s.drawn??s.d??'–', l=s.loss??s.losses??s.lost??s.l??'–', gdv=gdOf(s), av=(gdv===-Infinity?'–':(gdv>0?'+':'')+gdv);
      return `<tr${me}><td>${i+1}</td><td class="team">${esc(nm)}</td>
        <td>${esc(s.played??s.matches??s.mp??'–')}</td><td>${esc(g)}</td><td>${esc(b)}</td><td>${esc(l)}</td><td>${esc(av)}</td><td class="pts">${esc(s.points??s.pts??'')}</td></tr>`;
    }).join('');
    window.__tpBuildRows = buildRows;
    const rows = buildRows(standings);
    const chips = seasons.length>1
      ? `<div class="tp-seasons">`+seasons.map(y=>
          `<button class="tp-schip${y===season?' active':''}" onclick="tpSetSeason(${y})">${y}/${String(y+1).slice(2)}</button>`
        ).join('')+`</div>`
      : '';
    stHtml=chips+`<div class="tp-stand" id="tp-stand-tbl"><table><thead><tr><th class="l">#</th><th class="l">Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>Av</th><th>P</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else {
    stHtml=`<div class="tp-empty">Puan durumu bulunamadı.</div>`;
  }

  root.innerHTML = css + `<div class="tp">${hero}
    <div class="tp-tabs">
      <button class="tp-tab active" data-tab="fixtures">Fikstür</button>
      <button class="tp-tab" data-tab="squad">Kadro</button>
      <button class="tp-tab" data-tab="standings">Puan Durumu</button>
    </div>
    <div id="tp-fixtures" class="tp-panel active">${fxHtml}</div>
    <div id="tp-squad" class="tp-panel">${sqHtml}</div>
    <div id="tp-standings" class="tp-panel">${stHtml}</div></div>`;

  root.querySelectorAll('.tp-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      root.querySelectorAll('.tp-tab').forEach(t=>t.classList.remove('active'));
      btn.classList.add('active');
      root.querySelectorAll('.tp-panel').forEach(p=>p.classList.remove('active'));
      root.querySelector('#tp-'+btn.dataset.tab)?.classList.add('active');
    });
  });
}
