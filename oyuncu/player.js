'use strict';
/* ScorePop — Bağımsız oyuncu sayfası (/oyuncu/{id}-slug)
   Doğrudan URL / yenileme / SEO. SPA içi gezinmede app.js renderPlayerPage çalışır;
   bu dosya onun bağımsız ikizidir. Kaynak:
   tm_players + tm_market_values + tm_player_stats + tm_player_transfer (+ tm_teams). */

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function eur(v){ return v ? '€'+Number(v).toLocaleString('tr-TR') : '–'; }
function teamSlug(name){
  return String(name||'').toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function sparkline(mvals){
  const pts=(mvals||[]).filter(m=>m.value_eur!=null);
  if(pts.length<2) return '';
  const W=600,H=120,pad=8, vals=pts.map(p=>+p.value_eur);
  const min=Math.min(...vals),max=Math.max(...vals),span=(max-min)||1;
  const x=i=>pad+(i/(pts.length-1))*(W-2*pad), y=v=>H-pad-((v-min)/span)*(H-2*pad);
  const line=pts.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.value_eur).toFixed(1)}`).join(' ');
  const area=`${line} L${x(pts.length-1).toFixed(1)},${H-pad} L${x(0).toFixed(1)},${H-pad} Z`;
  return `<svg class="pl-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${area}" fill="var(--or3)"/>
    <path d="${line}" fill="none" stroke="var(--or)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const root = document.getElementById('player-root');

  const last=(window.location.pathname.split('/').filter(Boolean).pop()||'');
  const m=last.match(/^(\d+)/);
  if(!m){ root.innerHTML=`<div class="empty"><div class="empty-t">Geçersiz oyuncu URL'si</div></div>`; return; }
  const pid=parseInt(m[1],10);

  try{
    const { data:p } = await sb.from('tm_players').select('*').eq('id',pid).maybeSingle();
    if(!p){ root.innerHTML=`<div class="empty"><div class="empty-t">Oyuncu bulunamadı.</div></div>`; return; }

    const [teamR,mvR,stR,trR]=await Promise.all([
      p.team_id ? sb.from('tm_teams').select('id,name,crest_url,mac_t_id').eq('id',p.team_id).maybeSingle() : Promise.resolve({data:null}),
      sb.from('tm_market_values').select('value_date,value_eur,club,age').eq('player_id',pid).order('value_date',{ascending:true}),
      sb.from('tm_player_stats').select('*').eq('player_id',pid).order('saison_id',{ascending:false}),
      sb.from('tm_player_transfer').select('*').eq('player_id',pid).order('transfer_date',{ascending:false})
    ]);
    const team=teamR?.data||null, mvals=mvR?.data||[], stats=stR?.data||[], transfers=trR?.data||[];

    let clubMap={};
    const ids=[...new Set(transfers.flatMap(t=>[t.from_club_id,t.to_club_id]).filter(x=>x!=null))];
    if(ids.length){ try{ const {data}=await sb.from('tm_teams').select('id,name').in('id',ids); (data||[]).forEach(c=>clubMap[c.id]=c.name);}catch(e){} }

    document.title=(p.name||'Oyuncu')+' — Profil, İstatistik, Piyasa Değeri | ScorePop';
    render(root,p,team,mvals,stats,transfers,clubMap);
  }catch(err){ console.error(err); root.innerHTML=`<div class="empty"><div class="empty-t">Bağlantı hatası oluştu.</div></div>`; }
});

function render(root,p,team,mvals,stats,transfers,clubMap){
  const css=`<style>
    .pl{max-width:920px;margin:0 auto;}
    .pl-hero{border-radius:18px;padding:24px;margin-bottom:14px;background:linear-gradient(135deg,var(--bg2) 0%,var(--bg4) 100%);border:1px solid var(--b1);display:flex;gap:20px;align-items:center;}
    .pl-portrait,.pl-ph{width:104px;height:104px;flex-shrink:0;border-radius:14px;background:var(--bg2);border:1px solid var(--b1);}
    .pl-portrait{object-fit:cover;}
    .pl-ph{display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:800;color:var(--tx3);}
    .pl-num{display:inline-block;font-size:12px;font-weight:700;color:var(--or);background:var(--or2);border:1px solid rgba(242,100,25,.3);padding:2px 8px;border-radius:20px;margin-bottom:7px;}
    .pl-name{font-size:30px;font-weight:800;line-height:1.05;color:var(--tx1);}
    .pl-team{font-size:13px;color:var(--tx2);margin-top:5px;}.pl-team b{color:var(--tx1);}.pl-team a{color:var(--or);text-decoration:none;}.pl-team a:hover{text-decoration:underline;}
    .pl-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;}
    .pl-stat{background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:11px 13px;}
    .pl-stat-l{font-size:10px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--tx3);margin-bottom:5px;}
    .pl-stat-v{font-size:15.5px;font-weight:700;color:var(--tx1);}
    .pl-tabs{display:flex;gap:4px;background:var(--bg2);border:1px solid var(--b1);border-radius:12px;padding:5px;margin-bottom:14px;position:sticky;top:8px;z-index:5;}
    .pl-tab{flex:1;border:none;background:none;font-size:14px;font-weight:600;color:var(--tx2);padding:10px 8px;border-radius:8px;cursor:pointer;}
    .pl-tab.active{color:#fff;background:var(--or);}
    .pl-panel{display:none;}.pl-panel.active{display:block;}
    .pl-empty{text-align:center;color:var(--tx3);padding:34px 0;font-size:14px;}
    .pl-card{border:1px solid var(--b1);border-radius:14px;background:var(--bg2);padding:16px;margin-bottom:12px;}
    .pl-card-t{font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--tx3);margin-bottom:10px;}
    .pl-mv-now{font-size:24px;font-weight:800;color:var(--tx1);}
    .pl-mv-sub{font-size:12px;color:var(--tx3);margin-top:2px;}
    .pl-spark{width:100%;height:120px;display:block;margin-top:10px;}
    .pl-tbl{width:100%;border-collapse:collapse;font-size:13px;}
    .pl-tbl th{font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--tx3);padding:9px 8px;text-align:center;border-bottom:1px solid var(--b2);background:var(--bg4);}
    .pl-tbl th.l,.pl-tbl td.l{text-align:left;}
    .pl-tbl td{padding:9px 8px;text-align:center;border-bottom:1px solid var(--b1);color:var(--tx2);}
    .pl-tbl td.comp{text-align:left;color:var(--tx1);font-weight:600;}.pl-tbl td.g{color:var(--tx1);font-weight:700;}
    .pl-tr{display:grid;grid-template-columns:78px 1fr auto;gap:12px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--b1);}
    .pl-tr:last-child{border-bottom:none;}
    .pl-tr-date{font-size:12px;color:var(--tx3);}.pl-tr-route{font-size:13.5px;color:var(--tx1);}.pl-tr-route .arr{color:var(--tx3);margin:0 7px;}
    .pl-tr-fee{font-size:13px;font-weight:700;color:var(--tx1);white-space:nowrap;}
    @media(max-width:600px){.pl-stats{grid-template-columns:repeat(2,1fr);}.pl-name{font-size:24px;}.pl-portrait,.pl-ph{width:84px;height:84px;}}
  </style>`;

  const pos=p.main_position||p.position||'–';
  const initials=(p.name||'?').split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
  const teamLink=team
    ? (team.mac_t_id!=null ? `<a href="/takim/${team.mac_t_id}-${teamSlug(team.name)}">${esc(team.name)}</a>` : `<b>${esc(team.name)}</b>`)
    : '–';

  const hero=`<div class="pl-hero">
    ${p.portrait_url?`<img class="pl-portrait" src="${esc(p.portrait_url)}" onerror="this.outerHTML='<div class=&quot;pl-ph&quot;>${esc(initials)}</div>'" alt="">`:`<div class="pl-ph">${esc(initials)}</div>`}
    <div><span class="pl-num" ${p.shirt_number!=null&&p.shirt_number!==''?'':'style="display:none"'}>#${esc(p.shirt_number)}</span>
      <div class="pl-name">${esc(p.name||'')}</div>
      <div class="pl-team">${teamLink} &nbsp;·&nbsp; ${esc(pos)}</div></div></div>`;

  const statChips=`<div class="pl-stats">
    <div class="pl-stat"><div class="pl-stat-l">Piyasa Değeri</div><div class="pl-stat-v">${eur(p.market_value_eur)}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Yaş</div><div class="pl-stat-v">${esc(p.age??'–')}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Uyruk</div><div class="pl-stat-v" style="font-size:13px">${esc(p.nationality||'–')}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Boy</div><div class="pl-stat-v">${p.height_cm?esc(p.height_cm)+' cm':'–'}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Ayak</div><div class="pl-stat-v" style="font-size:13px">${esc(p.foot||'–')}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Mevki</div><div class="pl-stat-v" style="font-size:13px">${esc(pos)}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Doğum</div><div class="pl-stat-v" style="font-size:13px">${p.birth_date?esc(String(p.birth_date).slice(0,10)):'–'}</div></div>
    <div class="pl-stat"><div class="pl-stat-l">Menajer</div><div class="pl-stat-v" style="font-size:13px">${esc(p.agent||'–')}</div></div></div>`;

  let mvHtml;
  if(mvals&&mvals.length){
    const cur=mvals[mvals.length-1];
    const peak=mvals.reduce((a,b)=>+b.value_eur>+a.value_eur?b:a,mvals[0]);
    mvHtml=`<div class="pl-card"><div class="pl-card-t">Piyasa Değeri Gelişimi</div>
      <div class="pl-mv-now">${eur(cur.value_eur)}</div>
      <div class="pl-mv-sub">Zirve: ${eur(peak.value_eur)} (${peak.value_date?String(peak.value_date).slice(0,10):'–'}) &nbsp;·&nbsp; ${mvals.length} kayıt</div>
      ${sparkline(mvals)}</div>`;
  } else mvHtml=`<div class="pl-card"><div class="pl-card-t">Piyasa Değeri Gelişimi</div><div class="pl-empty">Değer geçmişi bulunamadı.</div></div>`;

  let extraHtml = p.youth_clubs
    ? `<div class="pl-card"><div class="pl-card-t">Altyapı Kulüpleri</div><div style="font-size:13.5px;color:var(--tx2);line-height:1.6;">${esc(p.youth_clubs)}</div></div>` : '';

  let stHtml;
  if(stats&&stats.length){
    const rows=stats.map(s=>`<tr>
      <td class="comp">${esc(s.competition_name||s.competition||'')}</td>
      <td>${esc(s.season_name||s.saison_id||'')}</td>
      <td>${esc(s.games_played??'–')}</td>
      <td class="g">${esc(s.goals??0)}</td><td class="g">${esc(s.assists??0)}</td>
      <td>${esc(s.yellow_cards??0)}</td><td>${esc(s.red_cards??0)}</td></tr>`).join('');
    stHtml=`<div class="pl-card"><table class="pl-tbl">
      <thead><tr><th class="l">Turnuva</th><th>Sezon</th><th>O</th><th>G</th><th>A</th><th>🟨</th><th>🟥</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  } else stHtml=`<div class="pl-empty">Sezon istatistiği bulunamadı.</div>`;

  let trHtml;
  if(transfers&&transfers.length){
    trHtml=`<div class="pl-card">`+transfers.map(t=>{
      const from=clubMap[t.from_club_id]||(t.from_competition||('#'+(t.from_club_id??'?')));
      const to=clubMap[t.to_club_id]||(t.to_competition||('#'+(t.to_club_id??'?')));
      const fee=t.fee_eur?eur(t.fee_eur):(t.kind?esc(t.kind):'–');
      return `<div class="pl-tr"><div class="pl-tr-date">${t.transfer_date?esc(String(t.transfer_date).slice(0,10)):'–'}</div>
        <div class="pl-tr-route">${esc(from)}<span class="arr">→</span>${esc(to)}</div>
        <div class="pl-tr-fee">${fee}</div></div>`;
    }).join('')+`</div>`;
  } else trHtml=`<div class="pl-empty">Transfer kaydı bulunamadı.</div>`;

  root.innerHTML=css+`<div class="pl">${hero}${statChips}
    <div class="pl-tabs">
      <button class="pl-tab active" data-tab="genel">Genel</button>
      <button class="pl-tab" data-tab="stats">İstatistik</button>
      <button class="pl-tab" data-tab="transfers">Transferler</button>
    </div>
    <div id="pl-genel" class="pl-panel active">${mvHtml}${extraHtml}</div>
    <div id="pl-stats" class="pl-panel">${stHtml}</div>
    <div id="pl-transfers" class="pl-panel">${trHtml}</div></div>`;

  root.querySelectorAll('.pl-tab').forEach(btn=>btn.addEventListener('click',()=>{
    root.querySelectorAll('.pl-tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    root.querySelectorAll('.pl-panel').forEach(p=>p.classList.remove('active'));
    root.querySelector('#pl-'+btn.dataset.tab)?.classList.add('active');
  }));
}
