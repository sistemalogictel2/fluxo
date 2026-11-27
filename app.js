/* Fluxo · lógica. Ordem: preferências/tema → Supabase (dados) → render e telas → administração → gestão/gráficos → inicialização. */

const PREF=(()=>{try{return JSON.parse(localStorage.getItem('fluxo-ui')||'{}')}catch(e){return{}}})();
const THEMES=[['dark','Escuro'],['glass','Glass']],ZOOMS=[1,1.1,1.2];
const themeOf=()=>THEMES.some(x=>x[0]===PREF.t)?PREF.t:'dark';
function applyPref(){const r=document.documentElement;const th=themeOf();const lt=th==='glass';r.dataset.theme=lt?'light':th;r.dataset.skin=lt?th:'';r.style.setProperty('--z',ZOOMS[PREF.z||0]||1);if(window.fitZ)fitZ();try{localStorage.setItem('fluxo-ui',JSON.stringify(PREF))}catch(e){}}
function cycTheme(){const i=THEMES.findIndex(x=>x[0]===themeOf());PREF.t=THEMES[(i+1)%THEMES.length][0];applyPref();render()}
function cycZoom(){PREF.z=((PREF.z||0)+1)%ZOOMS.length;applyPref();render()}
const COLORS=['#fde68a','#fbcfe8','#bfdbfe','#bbf7d0','#ddd6fe','#fed7aa','#a5f3fc','#e5e7eb'];
const COLS=[['todo','A iniciar'],['doing','Em andamento'],['wait','Aguardando'],['done','Concluídas'],['fixo','Fixo']];
const ACT=['painel','tarefa','equipe'];let lastAct='painel',focoKpi=false;
const EMP='__empty_selection__';const EX=new Set();let colOpen,colNow,fQ='';let S={users:[],tasks:[]},view='gestao',fFunc='',fTipo='',fMed='',fPessoa='',fKpi='',fUf='',fSemF=false,ME=(()=>{try{const m=JSON.parse(sessionStorage.getItem('me'));return m&&m.tk?m:null}catch(e){return null}})(),user=ME&&ME.n;
const $=s=>document.querySelector(s);
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=d=>d?d.split('-').reverse().join('/'):'—';
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const srt=a=>[...a].sort((x,y)=>(x.final||'9999').localeCompare(y.final||'9999'));
/* ===== SUPABASE: preencha a URL e a chave (anon / publishable) do seu projeto. Vazio = modo local ===== */
const SB={url:'https://pvpsmephuvjcenheecck.supabase.co',key:'sb_publishable_LmnDxCOjueSDpWo_4naLlg_6eoBFDLN',ok:false,busy:false,get on(){return !!(this.url&&this.key)}};
const TB=[['tasks','fx_tarefas'],['tipos','fx_tipos'],['campos','fx_campos'],['contatos','fx_contatos'],['concessionarias','fx_concessionarias'],['medicoes','fx_medicoes'],['imports','fx_importacoes']];
let LAST={},ANIM=true;
const sbH=()=>({apikey:SB.key,...(SB.key.startsWith('eyJ')?{Authorization:'Bearer '+SB.key}:{}),'Content-Type':'application/json'});
const sbU=t=>SB.url.replace(/\/+$/,'')+'/rest/v1/'+t;
const canon=v=>Array.isArray(v)?'['+v.map(canon).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v??null);
const sig=r=>canon([r.dados,r.pos]);
const rowsOf=k=>(S[k]||[]).map((x,i)=>({id:x.id,dados:x,pos:i}));
const mapOf=rows=>new Map(rows.map(r=>[r.id,sig(r)]));
async function sbPull(){
  const o={};await Promise.all(TB.map(async([k,t])=>{const r=await fetch(sbU(t)+'?select=id,dados,pos&order=pos.asc,id.asc',{headers:sbH()});if(!r.ok){if((k==='medicoes'||k==='imports')&&r.status===404){o[k]=[];if(k==='medicoes')SB.noCls=true;else SB.noImp=true;return}throw new Error(r.status===404?'A tabela '+t+' não existe: rode o SQL 1_renomear_tabelas.sql no Supabase (SQL de atualização)':t+' '+r.status)}if(k==='medicoes')SB.noCls=false;if(k==='imports')SB.noImp=false;o[k]=await r.json()}));return o}
function applyRemote(o){TB.forEach(([k])=>{S[k]=o[k].map(r=>r.dados);LAST[k]=mapOf(rowsOf(k))})}
async function sbPush(){
  for(const[k,t]of TB){const rows=rowsOf(k).filter(r=>r.id),now=mapOf(rows),old=LAST[k]||new Map();
    if(k==='medicoes'&&SB.noCls){if(rows.length)throw new Error('A tabela fx_medicoes não existe no Supabase. Rode o SQL de atualização.');LAST[k]=now;continue}
    if(k==='imports'&&SB.noImp){LAST[k]=now;continue}
    const up=rows.filter(r=>old.get(r.id)!==now.get(r.id)),del=[...old.keys()].filter(i=>!now.has(i));
    if(up.length){const r=await fetch(sbU(t)+'?on_conflict=id',{method:'POST',headers:{...sbH(),Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(up.map(r=>({id:r.id,dados:r.dados,pos:r.pos,updated_at:new Date().toISOString()})))});if(!r.ok)throw new Error(await r.text())}
    for(let i=0;i<del.length;i+=50){const r=await fetch(sbU(t)+'?id=in.('+del.slice(i,i+50).map(x=>'"'+x+'"').join(',')+')',{method:'DELETE',headers:sbH()});if(!r.ok)throw new Error(await r.text())}
    LAST[k]=now}}
async function sbRetry(){if(!SB.ok||!SB.dirty||SB.busy)return;SB.busy=true;try{await sbPush();SB.dirty=false;lastSave=new Date();stUpd();toast('Sincronização retomada ✔')}catch(e){}SB.busy=false}
async function sbPoll(){
  if(!SB.ok||SB.busy||SB.dirty||!user||MEDOPEN||document.querySelector('dialog[open]')||document.activeElement?.matches?.('input,textarea,select'))return;
  try{const o=await sbPull();
    const same=TB.every(([k])=>{const a=mapOf(o[k]),b=LAST[k]||new Map();return a.size===b.size&&[...a].every(([i,s])=>b.get(i)===s)});
    if(!same){const antes=new Set(vez()),mv0=new Map(S.tasks.map(t=>[t.id,t.mov?t.mov.t:0]));applyRemote(o);ensureTipos();if(ME&&!ME.adm&&!meC())ME=user=null;render();
      const nv=vez().filter(i=>!antes.has(i));if(nv.length)toast(nv.length>1?nv.length+' tarefas novas na sua vez':'Nova tarefa na sua vez: '+nome(S.tasks.find(x=>x.id===nv[0])));else if(isAdm()){const ch=S.tasks.filter(t=>t.mov&&t.mov.por!==user&&t.mov.t>(mv0.get(t.id)||0));if(ch.length)toast(ch.length>1?ch.length+' tarefas mudaram de posto':'Mudou de posto: '+nome(ch[0])+' → '+(ch[0].mov.pp||'concluída'))}}}catch(e){}}
let lastSave=null;
const stText=()=>SB.on?(SB.ok?(SB.dirty?'⚠ Alterações pendentes de envio ao banco':'● Supabase conectado')+(lastSave?' · '+lastSave.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):''):'○ Sem conexão · NÃO está salvando no banco'):'';
const stUpd=()=>{const e=$('#fs');if(e)e.textContent=stText()};
const late=t=>t.status!=='done'&&t.status!=='fixo'&&t.final&&t.final<today();
let _tt;function toast(m){const t=$('#toast');clearTimeout(_tt);t.textContent=m;t.hidden=false;t.classList.remove('show');void t.offsetWidth;t.classList.add('show');_tt=setTimeout(()=>{t.classList.remove('show');_tt=setTimeout(()=>t.hidden=true,260)},m.length>60?4800:2600)}

/* ---------- Persistência ---------- */
async function loadLocal(){
  try{const r=await fetch('dados.json',{cache:'no-store'});if(r.ok){S=await r.json();return}}catch(e){}
  try{const l=localStorage.getItem('fluxo-dados');if(l)S=JSON.parse(l)}catch(e){}
}
async function save(){
  const txt=JSON.stringify(S,null,2);
  try{localStorage.setItem('fluxo-dados',txt)}catch(e){}
  lastSave=new Date();
  if(SB.on&&SB.ok){SB.busy=true;try{await sbPush();SB.dirty=false}catch(e){console.error(e);SB.dirty=true;toast('NÃO salvou no banco: '+String(e.message||e).slice(0,140)+' — nova tentativa em instantes')}SB.busy=false}else if(SB.on){toast('Sem conexão com o banco: esta alteração ainda NÃO foi salva no servidor. Reconectando…')}
  stUpd();
}
async function load(){
  if(SB.on){try{const o=await sbPull();
    if(TB.every(([k])=>!o[k].length)){await loadLocal();ensureTipos();SB.ok=true;LAST={};await sbPush();toast('Dados enviados ao Supabase')}
    else{applyRemote(o);SB.ok=true}
    return}catch(e){console.error(e);toast(/SQL/.test(String(e.message))?String(e.message):'Sem conexão com o Supabase — usando dados locais')}}
  await loadLocal()}
/* ---------- Login e perfis ---------- */
const first=n=>nk(n).split(' ')[0],fn1=n=>String(n||'').trim().split(/\s+/)[0];
const LK={n:0,until:0};
const isAdm=()=>!!(ME&&ME.adm);
const meC=()=>ME?(S.contatos||[]).find(c=>ME.cid?c.id===ME.cid:first(c.nome)===first(ME.n)):null;
const mine=f=>{const c=meC();return !!c&&!!f&&pkey(f.pessoa)==='c:'+c.id};
const vez=()=>user?S.tasks.filter(t=>t.status!=='done'&&act(t).some(mine)).map(t=>t.id):[];
const titulo=()=>{const n=vez().length+(isAdm()?S.tasks.filter(movNew).length:0);document.title=(n?`(${n}) `:'')+'Fluxo · Organizador de Tarefas'};
const vis=t=>isAdm()||t.fluxo.some(mine);
/* ---------- Notificação: tarefa mudou de posto (para o gestor) ---------- */
const MOV_DIAS=7;
let _vc=null,_vk='';
const vistos=()=>{const k='fluxo-vistos:'+nk(user);if(_vc&&_vk===k)return _vc;_vk=k;try{_vc=JSON.parse(localStorage.getItem(k)||'{}')||{}}catch(e){_vc={}}return _vc};
function setVisto(ids){const v=vistos();ids.forEach(i=>{const t=S.tasks.find(x=>x.id===i);if(t&&t.mov)v[i]=t.mov.t});Object.keys(v).forEach(k=>{if(!S.tasks.some(x=>x.id===k))delete v[k]});try{localStorage.setItem(_vk,JSON.stringify(v))}catch(e){}}
const movNew=t=>isAdm()&&!!t.mov&&t.mov.por!==user&&Date.now()-t.mov.t<MOV_DIAS*864e5&&t.mov.t>(vistos()[t.id]||0);
const ago=ts=>{const m=Math.max(0,Math.floor((Date.now()-ts)/6e4));return m<1?'agora':m<60?m+' min':m<1440?Math.floor(m/60)+' h':Math.floor(m/1440)+' d'};
const ppShort=x=>String(x||'').includes(',')?String(x):shortName(x);
const movLine=m=>m.tp==='d'?`↩ Devolvida: ${m.dp} (${m.de}) → ${m.pp} (${m.para})`:m.fim?`✔ ${m.dp} concluiu "${m.de}" · tarefa concluída`:m.pp?`${m.dp} (${m.de}) → ${m.pp} (${m.para})`:`${m.dp} concluiu "${m.de}" · aguardando os demais passos`;
const movTag=m=>m.tp==='d'?'Devolvida':m.fim?'Concluída':m.pp?'Novo posto':'Passo concluído';
const snap=t=>{const A=act(t);return{k:A.map(f=>f.id+'@'+pkey(f.pessoa)).join('|'),e:A.map(f=>f.etapa).join(' + '),p:[...new Set(A.map(f=>shortName(f.pessoa)))].join(', ')}};
const mvBadge=()=>{if(!isAdm())return'';const n=S.tasks.filter(movNew).length;return n?` <em class="nb" aria-label="${n} tarefa(s) mudaram de posto">${n}</em>`:''};
const mvRows=(L,max)=>L.slice(0,max).map(t=>{const m=t.mov;return `<div class="gs-row" style="--c:${corOf(t)}"><button type="button" class="gm" data-gv="${t.id}"><b>${esc(nome(t))}</b><small>${esc(movLine(m))} · há ${ago(m.t)}${m.por?' · por '+esc(shortName(m.por)):''}</small></button><span class="tag mv">${movTag(m)}</span></div>`}).join('')+(L.length>max?`<p class="hint">+ ${L.length-max} na aba Todas as tarefas.</p>`:'');
function mvSec(max){const L=S.tasks.filter(movNew).sort((a,b)=>b.mov.t-a.mov.t);if(!L.length)return'';
  return `<section class="gs-sec mvbar" aria-label="Tarefas que mudaram de posto"><h3>🔔 Mudaram de posto <em>${L.length}</em></h3>${mvRows(L,max)}<button type="button" class="btn" data-mvall>✓ Marcar todas como vistas</button></section>`}
document.addEventListener('click',e=>{if(e.target.closest('[data-mvall]')){setVisto(S.tasks.filter(movNew).map(t=>t.id));render()}});
const _sv=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const NI={gestao:_sv('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),painel:_sv('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),tarefa:_sv('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/>'),equipe:_sv('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.6 3.5 5.7"/>'),medicao:_sv('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12.5 9 5 9-5M3 17l9 5 9-5"/>'),med:_sv('<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>'),admin:_sv('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'),guia:_sv('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5Z"/><path d="M4 21.5V4.5M9 7h7"/>')};
function clkH(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `<b>${p(d.getHours())}<i>:</i>${p(d.getMinutes())}</b><small>${d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace(/\./g,'')}</small>`}
if(!window._clkT)window._clkT=setInterval(()=>{const e=document.getElementById('clk');if(e)e.innerHTML=clkH()},15000);
let MEDOPEN=false,MEDANI=false;
function setMed(on,back){
  on=!!on;MEDOPEN=on;
  document.querySelectorAll('.msb').forEach(p=>{p.classList.toggle('open',on);p.setAttribute('aria-hidden',on?'false':'true');p.inert=!on});
  document.querySelectorAll('.msbk').forEach(p=>p.classList.toggle('open',on));
  document.querySelectorAll('nav button[data-v="medicao"]').forEach(b=>{b.setAttribute('aria-expanded',on);b.classList.toggle('on',on)});
  if(on){const p=document.querySelector('.msb .msx');if(p)try{p.focus({preventScroll:true})}catch(e){}}
  else if(back){const b=document.querySelector('nav button[data-v="medicao"]');if(b)try{b.focus({preventScroll:true})}catch(e){}}
}if(!window._mEsc){window._mEsc=1;addEventListener('keydown',e=>{if(e.key==='Escape'&&MEDOPEN&&!document.querySelector('dialog[open]')){setMed(false,1)}})}
const NAV=[['gestao','Gestão'],['medicao','Medições'],['painel','Todas as tarefas'],['tarefa','Por tarefa'],['equipe','Por funcionário'],['med','Concessionárias'],['admin','Administração'],['guia','Passo a passo']];
const allowed=v=>isAdm()||v==='painel';
let USR=null;const MX=new Set(),CC=new Set();
async function rpc(fn,args){const r=await fetch(sbU('rpc/'+fn),{method:'POST',headers:sbH(),body:JSON.stringify(args)}),t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
  if(!r.ok)throw new Error((j&&j.message)||'Erro '+r.status);return j}
async function loadUsr(){try{USR=await rpc('fx_usuarios_listar',{p_token:ME.tk})}catch(e){USR=[];toast('Não foi possível carregar os usuários: '+e.message)}if(view==='admin'&&adminSec==='usr')render()}
/* ---------- Abertura estilo comercial após o login ---------- */
function introFx(done){
  const card=document.querySelector('.login');
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||!document.body.animate){done();return}
  const o=document.createElement('div');o.className='fxi';
  o.innerHTML='<div class="fxbg"></div><div class="fxl"><div class="fxwm">Flu<b>xo</b></div><i class="fxln"></i><div class="fxtg">Organizador de tarefas</div></div>';
  document.body.appendChild(o);
  const q=x=>o.querySelector(x),E='cubic-bezier(.2,.8,.2,1)',tm=[];let fin=0,did=0;
  const go=()=>{if(did)return;did=1;done()},end=ms=>{if(fin)return;fin=1;tm.forEach(clearTimeout);go();o.animate([{opacity:1},{opacity:0}],{duration:ms,fill:'forwards'});setTimeout(()=>o.remove(),ms+60)};
  o.onclick=()=>end(250);
  card&&card.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(8px)'}],{duration:250,easing:'ease',fill:'forwards'});
  q('.fxbg').animate([{opacity:0},{opacity:1}],{duration:300,fill:'both'});
  q('.fxwm').animate([{opacity:0,transform:'translateY(10px)',filter:'blur(6px)'},{opacity:1,transform:'none',filter:'blur(0)'}],{duration:600,delay:100,easing:E,fill:'both'});
  q('.fxln').animate([{opacity:0,transform:'scaleX(0)'},{opacity:1,transform:'scaleX(1)'}],{duration:500,delay:350,easing:E,fill:'both'});
  q('.fxtg').animate([{opacity:0},{opacity:1}],{duration:500,delay:500,easing:'ease-out',fill:'both'});
  tm.push(setTimeout(go,1150),setTimeout(()=>end(500),1250));
}
function loginScreen(){
  $('#app').innerHTML=`<div class="login"><h1>Flu<strong>xo</strong></h1><p>Entre para acompanhar a operação.</p>
  <form id="lf"><div class="f"><label for="u">Usuário</label><input type="text" id="u" autocomplete="username" autocapitalize="none" required></div>
  <div class="f"><label for="p">Senha</label><input type="password" id="p" autocomplete="current-password" required></div>
  <div class="err" id="er" role="alert"></div><button class="btn pri" style="width:100%">Entrar</button></form><p class="by">Desenvolvido por Nelson Martins</p></div>`;
  $('#u').focus();
  $('#lf').onsubmit=async e=>{e.preventDefault();const er=$('#er'),w=LK.until-Date.now();if(w>0){er.textContent='Muitas tentativas. Aguarde '+Math.ceil(w/1000)+'s.';return}
    if(!SB.on){er.textContent='Banco não configurado: preencha a URL e a chave do Supabase no index.html.';return}
    const b=$('#lf button');b.disabled=true;er.textContent='';
    try{let j;try{j=await rpc('fx_login',{p_usuario:nk($('#u').value),p_senha:$('#p').value})}catch(x){er.textContent='Sem conexão com o banco. Tente novamente.';return}
      if(!j){if(++LK.n>=5){LK.n=0;LK.until=Date.now()+30000}er.textContent='Usuário ou senha incorretos.';return}
      LK.n=0;ME={n:j.nome,adm:j.perfil==='gestor'?1:0,cid:j.contato_id||null,tk:j.token};user=ME.n;
      if(!ME.adm&&!meC()){ME=user=null;er.textContent='Este usuário não está vinculado a um funcionário. Fale com o gestor.';return}
      sessionStorage.setItem('me',JSON.stringify(ME));view='gestao';ANIM=true;introFx(()=>render())}
    finally{b.disabled=false}};
}
/* ---------- Menu lateral: concessionárias ---------- */
/* ---------- Valores medidos (Coordenador / Gestor) por mês ---------- */
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mesLbl=k=>k==='_'?'Sem mês medido':MESES[+k.slice(5,7)-1]+'/'+k.slice(0,4);
function valSum(L){const r={n:L.length,c:{t:0,m:new Map()},g:{t:0,m:new Map()}};
  L.forEach(t=>[['c','vmc','dmc'],['g','vmg','dmg']].forEach(([k,v,d])=>{const x=+t[v];if(!x)return;const mk=t[d]?String(t[d]).slice(0,7):'_';r[k].t+=x;r[k].m.set(mk,(r[k].m.get(mk)||0)+x)}));return r}
const VXS={all:true},VX=()=>VXS;
const valPart=(nm,p,k)=>{const cl=!!VX()[k];return `<h4><button type="button" class="mvh" data-vx="${k}" aria-expanded="${!cl}" title="${cl?'Mostrar':'Recolher'} valores do ${nm}"><span>${cl?'▸':'▾'} ${nm}</span><b>${brl(p.t)}</b></button></h4>${cl?'':p.m.size?`<ul>${[...p.m].sort((a,b)=>(a[0]==='_')-(b[0]==='_')||a[0].localeCompare(b[0])).map(([k,v])=>`<li><span>${mesLbl(k)}</span><b>${brl(v)}</b></li>`).join('')}</ul>`:'<div class="mvn">Sem valores lançados</div>'}`};
const valBox=v=>{const cl=!!VX().all;return `<div class="mvs"><button type="button" class="mvh mvt" data-vx="all" aria-expanded="${!cl}" title="${cl?'Mostrar':'Recolher'} todos os valores"><span>${cl?'▸':'▾'} Valor total · ${v.n} tarefa${v.n===1?'':'s'} somada${v.n===1?'':'s'}</span></button>${cl?`<div class="mvn mvc"><span>Coordenador</span><b>${brl(v.c.t)}</b></div><div class="mvn mvc"><span>Gestor</span><b>${brl(v.g.t)}</b></div>`:valPart('Coordenador',v.c,'c')+valPart('Gestor',v.g,'g')}</div>`};
function medSide(){
  if(!isAdm())return'';
  const T=S.tasks.filter(vis);
  const L=(S.concessionarias||[]).map(m=>{const X=T.filter(t=>daConc(tipoOf(t),m));return{m,t:(m.itens||[]).length,n:X.length,d:X.filter(t=>t.status==='done').length,cor:corConc(m),v:valSum(X)}})
    .sort((a,b)=>(a.m.prazo||'9999').localeCompare(b.m.prazo||'9999')||a.m.nome.localeCompare(b.m.nome,'pt-BR'));
  const cardM=({m,t,n,d,cor,v})=>{const lt=!!m.prazo&&m.prazo<today()&&d<(t||n),o=MX.has(m.id);
    return `<article class="mdc${lt?' late':''}${o?' open':''}" style="--c:${cor}"><button type="button" class="mdh" data-mx="${esc(m.id)}" aria-expanded="${o}" title="${o?'Recolher':'Ver informações'}"><span class="mdn">${esc(m.nome)}${lt?' ⚠':''}</span><span class="mdg" aria-hidden="true">${o?'▴':'▾'}</span></button><div class="mdb"><div class="mdr"><span>Medição</span><b>${esc(medNm(m.medicao))||'—'}</b></div><div class="mdr"><span>Tarefas</span><b>${t}</b></div><div class="mdr"><span>Cadastradas</span><b>${n}</b></div><div class="mdr"><span>Concluídas</span><b>${d}</b></div><div class="mdr mdp"><span>Prazo de entrega</span><b>${m.prazo?fmt(m.prazo)+(lt?' ⚠':''):'Sem prazo'}</b></div></div></article>`};
  const G=byMed(L).filter(g=>g.L.length||g.c.id);
  const nM=(S.medicoes||[]).length,op=MEDOPEN?' open':'';
  return `<div class="msbk${op}" data-sbt></div><aside class="msb${op}" aria-hidden="${!MEDOPEN}"${MEDOPEN?'':' inert'} aria-label="Medições e concessionárias cadastradas"><div class="msh2"><button type="button" class="msx" data-sbt aria-expanded="${MEDOPEN}" title="Recolher o menu de medições"><b>Medições</b><em>${nM}</em><span aria-hidden="true">◂</span></button><button type="button" class="btn msr" data-sbc title="Recolher todas as classes e medições abertas">Recolher tudo</button></div><div class="msc">${G.map(g=>{const cl=!CC.has(g.c.id||'_');return `<section class="mcg"><button type="button" class="mch" data-cc="${esc(g.c.id||'_')}" aria-expanded="${!cl}" title="${cl?'Expandir':'Recolher'} ${esc(g.c.nome)}"><span class="mcn">${esc(g.c.nome)}</span><span class="mdg" aria-hidden="true">${cl?'▸':'▾'}</span></button>${cl?'':`<div class="msl">${g.L.map(cardM).join('')||'<div class="empty">Nenhuma concessionária.</div>'}</div>`}</section>`}).join('')||'<div class="empty">Nenhuma medição cadastrada.</div>'}</div></aside>`}
/* ---------- Usuários (definidos no banco) ---------- */
function usrPane(){
  const cn=id=>{const c=(S.contatos||[]).find(x=>x.id===id);return c?c.nome:''};
  return `<div class="admin"><div class="ahead"><div><h2>Usuários</h2><p class="hint">Quem pode entrar no Fluxo. Gestor vê e edita tudo; Normal vê só as tarefas em que tem passo. Ao mudar para Gestor, vale no próximo login da pessoa.</p></div><button class="btn pri" id="nu">+ Novo usuário</button></div>
  ${USR===null?'<div class="empty">Carregando usuários…</div>':`<div class="tgrid">${USR.map(u=>`<article class="tcard${AX.has('u:'+u.id)?' open':''}" style="--c:${u.perfil==='gestor'?'var(--ac)':'var(--ac2)'}">${axHead('u:'+u.id,u.nome,`<button class="btn" data-eu="${u.id}" aria-label="Editar usuário ${esc(u.nome)}">Editar</button>`)}<div class="tb"><dl><dt>Usuário (login)</dt><dd><span class="tag">${esc(u.usuario)}</span></dd><dt>Acesso</dt><dd><span class="tag">${u.perfil==='gestor'?'Gestor · acesso a tudo':'Normal'}</span>${u.ativo?'':'<span class="tag late">Inativo</span>'}</dd><dt>Funcionário vinculado</dt><dd>${esc(cn(u.contato_id))||'<span class="hint">Nenhum</span>'}</dd></dl></div></article>`).join('')||'<div class="empty" style="grid-column:1/-1">Nenhum usuário.</div>'}</div>`}</div>`}
function openUsuario(id){
  const u=(USR||[]).find(x=>x.id===id)||{usuario:'',nome:'',perfil:'normal',contato_id:'',ativo:true},isNew=!id;
  const C=[...(S.contatos||[])].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  const [d,close]=dlg(`<form method="dialog"><div class="dh"><h2>${isNew?'Novo usuário':'Editar usuário'}</h2><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db"><div class="full"><label for="uc">Funcionário vinculado</label><select id="uc"><option value="">— nenhum —</option>${C.map(c=>`<option value="${esc(c.id)}" ${c.id===u.contato_id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select><div class="hint">Define os passos que aparecem como “Sua vez”. Obrigatório para acesso Normal.</div></div>
  <div><label for="un">Nome *</label><input type="text" id="un" required value="${esc(u.nome)}"></div>
  <div><label for="ul">Usuário (login) *</label><input type="text" id="ul" required autocapitalize="none" autocomplete="off" value="${esc(u.usuario)}"></div>
  <div><label for="up">Acesso</label><select id="up"><option value="normal" ${u.perfil==='normal'?'selected':''}>Normal</option><option value="gestor" ${u.perfil==='gestor'?'selected':''}>Gestor (acesso a tudo)</option></select></div>
  <div><label for="us">${isNew?'Senha *':'Nova senha'}</label><input type="password" id="us" autocomplete="new-password" minlength="6" ${isNew?'required':''} placeholder="${isNew?'Mínimo 6 caracteres':'Em branco = manter'}"></div>
  <div class="full chk"><label><input type="checkbox" id="ua" ${u.ativo?'checked':''}>Usuário ativo (pode entrar)</label></div></div>
  <div class="df"><button class="btn pri">Salvar usuário</button>${isNew?'':'<span class="sp"></span><button type="button" class="btn dan" id="dl">Excluir</button>'}</div></form>`,'#f2c14e');
  const q=s=>d.querySelector(s);
  q('#uc').onchange=e=>{const c=C.find(x=>x.id===e.target.value);if(c&&isNew){if(!q('#un').value)q('#un').value=c.nome;if(!q('#ul').value)q('#ul').value=first(c.nome)}};
  q('form').onsubmit=async e=>{e.preventDefault();const perfil=q('#up').value,cid=q('#uc').value;
    if(perfil==='normal'&&!cid){toast('Usuário Normal precisa de um funcionário vinculado');return}
    try{await rpc('fx_usuario_salvar',{p_token:ME.tk,p_id:id||null,p_usuario:q('#ul').value.trim(),p_nome:q('#un').value.trim(),p_perfil:perfil,p_contato_id:cid||null,p_ativo:q('#ua').checked,p_senha:q('#us').value||null});close();await loadUsr();toast('Usuário salvo')}catch(err){toast(err.message)}};
  if(!isNew)q('#dl').onclick=async()=>{if(!await fxAsk({t:'Excluir usuário',m:'Excluir este usuário? Ele deixa de conseguir entrar.',ok:'Excluir',dan:1}))return;try{await rpc('fx_usuario_excluir',{p_token:ME.tk,p_id:id});close();await loadUsr();toast('Usuário excluído')}catch(err){toast(err.message)}};
  q('#un').focus();
}

/* ---------- Telas ---------- */
const people=()=>[...new Set(S.tasks.flatMap(t=>t.fluxo.map(f=>f.pessoa)))];
/* ---------- Fluxo em diagrama: dependências e passos concomitantes ---------- */
const SID=()=>'s'+Math.random().toString(36).slice(2,7)+Date.now().toString(36).slice(-4);
const byId=F=>new Map(F.map(f=>[f.id,f]));
function grp(F){const p=new Map(F.map(f=>[f.id,f.id])),r=x=>{while(p.get(x)!==x)x=p.get(x);return x};
  F.forEach(f=>(f.con||[]).forEach(o=>{if(p.has(o)&&o!==f.id){const a=r(f.id),b=r(o);if(a!==b)p.set(a,b)}}));
  const m=new Map();F.forEach(f=>{const k=r(f.id);if(!m.has(k))m.set(k,[]);m.get(k).push(f.id)});
  const g=new Map();m.forEach(L=>L.forEach(i=>g.set(i,L)));return g}
/* passos que ainda precisam estar concluídos antes de liberar f (dependência de um passo = dependência do bloco dele) */
function needOf(F,G,f,by){const mem=new Set(G.get(f.id)),out=new Set();
  mem.forEach(m=>((by.get(m)||{}).dep||[]).forEach(d=>{if(mem.has(d)||!by.has(d))return;(G.get(d)||[d]).forEach(x=>{if(!mem.has(x))out.add(x)})}));return[...out]}
function fstate(F){const G=grp(F),by=byId(F);return F.map(f=>f.ok?'done':needOf(F,G,f,by).every(x=>by.get(x).ok)?'ready':'wait')}
function cyc(F){const G=grp(F),by=byId(F),nd=new Map(F.map(f=>[f.id,needOf(F,G,f,by)])),c=new Map();
  const go=i=>{if(c.get(i)===1)return true;if(c.get(i)===2)return false;c.set(i,1);for(const x of nd.get(i))if(go(x))return true;c.set(i,2);return false};
  return F.some(f=>go(f.id))}
const waitOf=(F,f)=>{const G=grp(F),by=byId(F);return needOf(F,G,f,by).map(x=>by.get(x)).filter(x=>!x.ok)};
const tstate=t=>t.status==='done'?t.fluxo.map(()=>'done'):fstate(t.fluxo);
const act=t=>{if(t.status==='done'||!t.fluxo.length)return[];const s=fstate(t.fluxo);return t.fluxo.filter((f,i)=>s[i]==='ready')};
const holders=t=>{if(t.status==='done'||!t.fluxo.length){const L=t.fluxo.filter(f=>f.ok).sort((a,b)=>b.ok-a.ok);return L.length?[L[0]]:t.fluxo.slice(-1)}const a=act(t);return a.length?a:t.fluxo.slice(-1)};
const holder=t=>holders(t)[0];
const myE=(t,c)=>act(t).filter(a=>pkey(a.pessoa)==='c:'+c.id).map(a=>a.etapa).join(' + ');
/* tarefas antigas (fluxo linear com "passo") viram dependências em cadeia */
function migTask(t){if(!Array.isArray(t.fluxo))t.fluxo=[];if(t.dag&&t.fluxo.every(f=>f.id))return false;
  const p=Number.isInteger(t.passo)?t.passo:0,dn=t.status==='done';
  t.fluxo.forEach((f,i)=>{if(!f.id)f.id='s'+(i+1)});
  t.fluxo.forEach((f,i)=>{if(!Array.isArray(f.dep))f.dep=i?[t.fluxo[i-1].id]:[];if(!Array.isArray(f.con))f.con=[];if(!f.ok&&(dn||i<p))f.ok=1});
  delete t.passo;t.dag=1;return true}
function migTipo(y){if(!Array.isArray(y.steps)){y.steps=(y.passos||[]).map((e,i)=>({id:'p'+(i+1),etapa:e,campos:[...((y.pc||[])[i]||[])],dep:i?['p'+i]:[],con:[]}));delete y.passos;delete y.pc}
  y.steps.forEach((s,i)=>{if(!s.id)s.id='p'+(i+1);if(!Array.isArray(s.dep))s.dep=[];if(!Array.isArray(s.con))s.con=[];if(!Array.isArray(s.campos))s.campos=[]})}

const nome0=t=>t.fx&&tipoOf(t)?tipoOf(t).nome+' '+t.tarefa:t.tarefa;
let NMC=null;
const nome=t=>{const L=S.tasks||[];if(!NMC||NMC.r!==L||NMC.n!==L.length){const c=new Map(),sf=new Map();L.forEach(x=>{const k=nk(nome0(x));c.set(k,(c.get(k)||0)+1)});const seen=new Map();L.forEach(x=>{const k=nk(nome0(x));if(c.get(k)>1){const i=(seen.get(k)||0)+1;seen.set(k,i);sf.set(x.id,i)}});NMC={r:L,n:L.length,sf}}const i=NMC.sf.get(t.id);return i?nome0(t)+' - '+i:nome0(t)};
const taskUF=t=>{
  const norm=s=>String(s||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').trim().toLowerCase();
  const c=campos().find(x=>norm(x.nome)==='uf'||norm(x.nome)==='estado'||norm(x.nome)==='unidade federativa');
  const v=(c&&t[c.id])||t.uf||t.UF||'';
  return String(v).trim().toUpperCase();
};
function card(t,mode){
  const A=act(t),st=tstate(t),n=t.fluxo.length,dn=st.filter(x=>x==='done').length,mA=A.filter(mine);
  const step=t.status==='done'?'✔ Concluída':n?`${dn} de ${n} passos · agora: ${A.length?esc(A.map(a=>a.etapa).join(' + ')):'—'}`:'Sem fluxo';
  const dots=t.fluxo.map((_,i)=>`<i class="${st[i]==='done'?'on':st[i]==='ready'?'cur':''}"></i>`).join('');
  const ex=EX.has(t.id);
  return `<div class="card${ex?'':' co'}" role="button" tabindex="0" style="--c:${corOf(t)}" draggable="${(mode==='k'||view==='equipe')&&isAdm()}" data-id="${t.id}" aria-label="Abrir tarefa ${esc(nome(t))}. ${esc(step)}">
  <span class="tg" role="button" aria-label="${ex?'Recolher':'Expandir'}" aria-expanded="${ex}" title="${ex?'Recolher':'Expandir'}">${ex?'▴':'▾'}</span>
  <div class="card-title"><h3>${esc(nome(t))}</h3>${taskUF(t)?`<span class="uf-chip" title="Unidade federativa">${esc(taskUF(t))}</span>`:''}</div>${t.sub?`<div class="sub">${esc(t.sub)}</div>`:''}
  <div class="step">${step}${late(t)&&!ex?' <span class="tag late">⚠</span>':''}${movNew(t)?` <span class="tag mv" title="${esc(movLine(t.mov))}">🔔 ${t.mov.tp==='d'?'Devolvida':t.mov.fim?'Concluída':t.mov.pp?'Novo posto':'Passo concluído'}${t.mov.pp&&!t.mov.fim?': '+esc(ppShort(t.mov.pp)):''}</span>`:''}${mode==='k'&&A.length?` <span class="sub">→ ${esc([...new Set(A.map(a=>a.pessoa))].join(', '))}</span>`:''}${mA.length?' <span class="tag vez">Sua vez</span>':''}</div><div class="dots" aria-hidden="true">${dots}</div>${ex&&movNew(t)?`<div class="mvd">${esc(movLine(t.mov))} · há ${ago(t.mov.t)}</div>`:''}${mA.map(a=>`<button type="button" class="btn pri fin" data-fin="${t.id}" data-fs="${a.id}">✔ Finalizar${mA.length>1?': '+esc(a.etapa):' meu passo'}</button>`).join('')}
  <div class="meta">${tipoTag(t)}${t.protocolo?`<span class="tag">Prot. ${esc(t.protocolo)}</span>`:''}${t.portal?`<span class="tag">${esc(t.portal)}</span>`:''}
  ${t.final?`<span class="tag">Entrega ${fmt(t.final)}</span>`:''}${late(t)?'<span class="tag late">⚠ Atrasada</span>':''}</div></div>`;
}

let FXK='';
function fxView(){try{const k=[view,typeof adminSec==='undefined'?'':adminSec,gTab].join('|');if(k===FXK)return;FXK=k;const h=document.documentElement;h.dataset.anim=1;setTimeout(()=>{document.querySelectorAll('.gs-k,.gcp,.tcard,.col,.mdc,.gs-row,.gs-p,.kpi,.gbars .gb').forEach((e,i)=>e.style.setProperty('--d',Math.min(i,14)*35+'ms'));document.querySelectorAll('[data-cu]').forEach(e=>{const n=+e.textContent;if(!n)return;const t0=performance.now(),f=now=>{const p=Math.min(1,(now-t0)/700);e.textContent=Math.round(n*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)})},0);clearTimeout(fxView.t);fxView.t=setTimeout(()=>delete h.dataset.anim,1200)}catch(e){}}
function render(){NMC=null;fxView();
  if(!user){loginScreen();return}
  if(view==='func'){view='admin';adminSec='func'}if(!allowed(view))view='painel';
  if(ACT.includes(view))lastAct=view;
  try{sessionStorage.setItem('ui',JSON.stringify({view,adminSec,gStep}))}catch(e){}
  if(fTipo&&!fvals(fTipo).every(id=>id===EMP||S.tipos.some(y=>y.id===id)))fTipo='';
  if(fMed&&!fvals(fMed).every(id=>id===EMP||(S.medicoes||[]).some(c=>c.id===id)))fMed='';
  if(fPessoa&&!fvals(fPessoa).every(id=>id===EMP||personOpts().some(o=>o[0]===id)))fPessoa='';
  if(fFunc&&!cargos().includes(fFunc))fFunc='';
  if(fUf&&!fvals(fUf).every(id=>id===EMP||ufList().includes(id)))fUf='';
  const B=base(),TF=B.filter(kpiOk),open=B.filter(t=>t.status!=='done').length;
  const kp=(k,n,l)=>`<button type="button" class="kpi" data-k="${k}" aria-pressed="${fKpi===k}"><b>${n}</b><span>${l}</span></button>`;
  let body='';
  if(view==='painel'){
    colNow=colOpen===undefined?((COLS.find(([k])=>TF.some(t=>t.status===k))||[])[0]||null):colOpen;
    body=`<div class="board">${COLS.map(([k,l])=>{const L=srt(TF.filter(t=>t.status===k)),mini=k!==colNow;
      return `<section class="col${mini?' mini':''}" data-s="${k}" aria-label="${l}"><h2><span><button type="button" class="cx" data-cx="${k}" aria-expanded="${!mini}" title="${mini?'Expandir':'Recolher'} coluna ${l}"><span>${l}</span><small aria-hidden="true">${mini?'▸':'▾'}</small></button></span><span><button type="button" class="xa" data-xa title="Expandir/recolher todos" aria-label="Expandir ou recolher todos">⇕</button><em>${L.length}</em></span></h2><div class="list">${L.map(t=>card(t,'k')).join('')||'<div class="empty">Arraste um card para cá</div>'}</div></section>`}).join('')}</div>`;
  }else if(view==='tarefa'){body=tarefaView(TF)
  }else if(view==='guia'){body=guiaView()
  }else if(view==='med'){body=concView()
  }else if(view==='gestao'){body=gestaoView()
  }else if(view==='admin'){body=adminView()
  }else{
    const _me=meC(),_mk=_me?'c:'+_me.id:'',P=flowPeople().filter(([k])=>fhas(fPessoa,k)).sort((x,y)=>(y[0]===_mk)-(x[0]===_mk));
    body=(isAdm()?'<p class="hint" style="margin:0 0 8px">Arraste um card para a coluna de outro funcionário para passar a ele o passo liberado.</p>':'')+`<div class="hsb" id="hsb" hidden aria-hidden="true"><div></div></div><div class="board postit" id="bdp">${P.map(([pk,p])=>[pk,p,srt(TF.filter(t=>holders(t).some(h=>pkey(h.pessoa)===pk)&&(t.status!=='done'||fKpi==='done')))]).filter(x=>!anyF()||x[2].length).map(([pk,p,L],i)=>{
      return `<section class="col" data-p="${esc(pk)}" data-pn="${esc(p)}" aria-label="${esc(p)}"><h2><span><span class="avatar" aria-hidden="true">${esc(p[0])}</span>${esc(p)}</span><span><button type="button" class="xa" data-xa title="Expandir/recolher todos" aria-label="Expandir ou recolher todos">⇕</button><em>${L.length}</em></span></h2><div class="list">${L.map((t,j)=>card(t,'p').replace('class="card"',`class="card" style="--rot:${(j%2?1:-1)*(0.6+j%3*0.4)}deg;--c:${corOf(t)}"`)).join('')||'<div class="empty">Sem atividades</div>'}</div></section>`}).join('')||'<div class="empty" style="width:100%">'+(anyF()?'Nenhum funcionário com tarefas neste filtro.':'Crie uma tarefa com fluxo para ver os funcionários aqui.')+'</div>'}</div>`;
  }
  const _fe=document.activeElement,_fv=_fe&&_fe.matches&&_fe.matches(':focus-visible')&&_fe.closest('header.sb nav')?_fe.dataset.v:null;
  const _xp=!!document.querySelector('header.sb.xp'),_mc=document.querySelector('.msb .msc'),_msT=_mc?{l:_mc.scrollLeft,c:[..._mc.querySelectorAll('.msl')].map(x=>x.scrollTop)}:null;
  $('#app').innerHTML=`<header class="sb"><div class="logo">Flu<b>xo</b></div><span class="sbl">Menu</span>
  <nav aria-label="Telas">${NAV.filter(([v])=>allowed(v)).map(([v,l])=>`<button data-v="${v}" aria-label="${v==='painel'&&!isAdm()?'Minhas tarefas':l}" title="${v==='painel'&&!isAdm()?'Minhas tarefas':l}" ${v==='medicao'?`aria-haspopup="dialog" aria-expanded="${MEDOPEN}" class="${MEDOPEN?'on':''}"`:view===v?'aria-current="page"':''}><i class="ni" aria-hidden="true">${NI[v]||''}</i><span class="nl">${v==='painel'&&!isAdm()?'Minhas tarefas':l}</span>${v==='gestao'?gBadge():''}${v==='tarefa'?mvBadge():''}</button>`).join('')}</nav>
  <div class="sp"></div><span class="status" id="fs" role="status">${esc(stText())}</span>
  <span class="ap" role="group" aria-label="Aparência"><button class="btn" id="bt" title="Trocar tema (tecla T)" aria-label="Tema ${THEMES.find(x=>x[0]===themeOf())[1]}. Trocar tema">◐</button><button class="btn" id="bf" title="Tela cheia" aria-label="Alternar tela cheia">⛶</button><button class="btn" id="bc" title="Recolher ou expandir o cabeçalho" aria-label="Recolher ou expandir o cabeçalho">⇕</button><button class="btn" id="bz" title="Tamanho do texto" aria-label="Tamanho do texto ${Math.round(ZOOMS[PREF.z||0]*100)}%. Alterar">Aa</button></span>
  <button class="btn pri" id="bn" ${isAdm()?'':'hidden'} title="Nova tarefa (tecla N)">+ Nova tarefa</button><button class="btn" id="bo" aria-label="Sair de ${esc(user)}">Sair</button></header>
  <div class="stk"><div class="top">${hero()}
  <div class="kpis" role="group" aria-label="Segmentar por situação">${kp('open',open,'em aberto')}${kp('late',B.filter(late).length,'atrasadas')}${kp('done',B.filter(t=>t.status==='done').length,'concluídas')}</div></div>${['guia','med','gestao'].includes(view)?'':bar()}</div>
  <div class="shell${isAdm()?'':' nosb'}">${medSide()}<main id="main" tabindex="-1">${body}</main></div>`;
  if(_msT){const e=document.querySelector('.msb .msc');if(e){e.scrollLeft=_msT.l;e.querySelectorAll('.msl').forEach((x,i)=>x.scrollTop=_msT.c[i]||0)}}
  if(_xp&&!window._xpLock){const h=document.querySelector('header.sb');if(h)h.classList.add('xp')}
  if(_fv){const b=document.querySelector('header.sb nav [data-v="'+_fv+'"]');if(b)b.focus({preventScroll:true})}
  bind();setHH();titulo();if(view==='guia')bindGuia();if(view==='admin')bindAdmin();
  if(focoKpi){focoKpi=false;focaAtividades()}
}
function focaAtividades(){
  const m=$('#main'),h=$('.stk');if(!m)return;
  const y=Math.max(0,m.getBoundingClientRect().top+window.scrollY-(h?h.offsetHeight:0));
  try{m.focus({preventScroll:true})}catch(e){}
  window.scrollTo({top:y,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});
  const c=m.querySelector('.card');if(c)m.scrollLeft=Math.max(0,(c.closest('.col')||c).offsetLeft-12);
}
function kpiGo(k){
  const naAba=view==='painel';
  fKpi=(naAba&&fKpi===k)?'':k;
  view='painel';
  colOpen=undefined;focoKpi=true;ANIM=true;render();
}
function setHH(){const e=$('.stk');if(e)document.documentElement.style.setProperty('--hh',(e.offsetHeight+(e.offsetParent?8:0))+'px');const h=$('header.sb');document.documentElement.style.setProperty('--hdh',(h?h.offsetHeight:0)+'px')}
addEventListener('resize',setHH);
function bind(){
  document.documentElement.dataset.view=view;try{document.documentElement.classList.toggle('cmp',!!localStorage.getItem('fl_cmp'))}catch(e){}
  {const bc=document.getElementById('bc');if(bc)bc.onclick=()=>{const on=document.documentElement.classList.toggle('cmp');try{localStorage.setItem('fl_cmp',on?'1':'')}catch(e){}setHH();dispatchEvent(new Event('resize'))}}
  setHH();
  {const hb=document.getElementById('hsb'),bd=document.getElementById('bdp');if(hb&&bd){const iw=hb.firstElementChild,upd=()=>{iw.style.width=bd.scrollWidth+'px';hb.hidden=bd.scrollWidth<=bd.clientWidth+2};
    hb.addEventListener('scroll',()=>{if(Math.abs(bd.scrollLeft-hb.scrollLeft)>1)bd.scrollLeft=hb.scrollLeft});bd.addEventListener('scroll',()=>{if(Math.abs(hb.scrollLeft-bd.scrollLeft)>1)hb.scrollLeft=bd.scrollLeft});
    upd();new ResizeObserver(upd).observe(bd);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(upd)}}
  if(ANIM){const a=$('#app');ANIM=false;a.querySelectorAll('.card,.pcap,.tcard,.col,.kpi,.person,.pk').forEach((e,i)=>e.style.setProperty('--i',Math.min(i,14)));a.classList.add('enter');setTimeout(()=>a.classList.remove('enter'),1000)}
  document.querySelectorAll('[data-mx]').forEach(b=>b.onclick=()=>{const k=b.dataset.mx,c=b.closest('.mdc'),o=!MX.has(k);o?MX.add(k):MX.delete(k);c.classList.toggle('open',o);b.setAttribute('aria-expanded',o);b.querySelector('.mdg').textContent=o?'▴':'▾'});
  document.querySelectorAll('[data-mo],[data-gm]').forEach(b=>b.onclick=()=>openConcItens(b.dataset.mo||b.dataset.gm));
  document.querySelectorAll('[data-gv]').forEach(b=>b.onclick=()=>openView(b.dataset.gv));
  const xl=$('#gxl');if(xl)xl.onclick=gXlsx;const gi=$('#gimp'),gf=$('#gimpf');if(gi&&gf){gi.onclick=()=>gf.click();gf.onchange=()=>{const f=gf.files[0];gf.value='';if(f)gImport(f)}}
  
  document.querySelectorAll('[data-gt]').forEach(b=>b.onclick=()=>{gTab=b.dataset.gt;render()});
  {const b=$('#gfb');if(b)b.onclick=()=>{gFOpen=!gFOpen;gMfOpen='';render()};['#gfk','#gfo'].forEach(q=>{const x=$(q);if(x)x.onclick=()=>{gFOpen=false;gMfOpen='';render()}});const cl=$('#gfc');if(cl)cl.onclick=()=>window.gClr();const fb=document.querySelector('.gxb');if(fb){fb.scrollTop=gFSc;fb.onscroll=()=>{gFSc=fb.scrollTop;gFloat()}}gFloat()}
  document.querySelectorAll('[data-hv]').forEach(b=>b.onclick=()=>{const[r,i]=b.dataset.hv.split('|'),rc=(S.imports||[]).find(x=>x.id===r),m=rc&&rc.ms[+i];if(!m)return;if(!S.tasks.some(t=>t.id===m.tid)){fxAsk({t:'Tarefa não encontrada',m:'Esta tarefa não existe mais.',ok:'OK',no:false});return}openView(m.tid,'res',m.cs.map(c=>c.id))});
  {const hr=$('#hrev');if(hr)hr.onclick=gRevert}
  document.querySelectorAll('[data-gmed]').forEach(b=>b.onclick=()=>{gSel=gToggle(gSel,b.dataset.gmed);render()});
  window.gClr=()=>{gSel=gLog=gVt=gUf=gMun=gK=gTar=gTk=gCn='';gR={fu:'',st:'',pa:''};render()};const gClr=window.gClr;const gx=$('#gfx');if(gx)gx.onclick=gClr;const rx=$('#rx');if(rx)rx.onclick=gClr;
  document.querySelectorAll('[data-rk]').forEach(b=>b.onclick=()=>{gK=gK===b.dataset.rk?'':b.dataset.rk;render()});
  document.querySelectorAll('[data-rf]').forEach(b=>b.onclick=()=>{const[k,...r]=b.dataset.rf.split('|'),v=r.join('|');if(k==='uf'){gUf=gToggle(gUf,v);gMun=''}else if(k==='med')gSel=gToggle(gSel,v);else if(k==='log')gLog=gTg(gLog,v);else if(k==='vt')gVt=gTg(gVt,v);else gR[k]=gR[k]===v?'':v;render()});
  document.querySelectorAll('[data-rcx]').forEach(b=>b.onclick=()=>{const k=b.dataset.rcx;if(k==='k')gK='';else if(k==='med')gSel='';else if(k==='log')gLog='';else if(k==='vt')gVt='';else if(k==='uf'){gUf='';gMun=''}else if(k==='mun')gMun='';else gR[k]='';render()});
  document.querySelectorAll('[data-rmore]').forEach(b=>b.onclick=()=>{gMore=!gMore;render()});document.querySelectorAll('[data-rmap]').forEach(b=>b.onclick=()=>{gTab='graf';gCh='map';render()});
  document.querySelectorAll('[data-rcap]').forEach(b=>b.onclick=async()=>{const v=parseInt(await fxAsk({t:'Limite de tarefas',m:'Limite de tarefas por pessoa (linha do gráfico):',inp:1,v:rCap()}),10);if(v>0){try{localStorage.setItem('fl_cap',v)}catch(e){}render()}});
  {let tp=document.getElementById('rtip');if(!tp){tp=document.createElement('div');tp.id='rtip';document.body.appendChild(tp);document.addEventListener('mouseover',e=>{const x=e.target.closest&&e.target.closest('[data-tip]'),t=document.getElementById('rtip');if(!x){t.hidden=true;return}t.textContent=x.dataset.tip;t.hidden=false});document.addEventListener('mousemove',e=>{const t=document.getElementById('rtip');if(t.hidden)return;t.style.left=Math.max(4,Math.min(innerWidth-t.offsetWidth-8,e.clientX+14))+'px';t.style.top=Math.min(innerHeight-t.offsetHeight-8,e.clientY+18)+'px'})}tp.hidden=true}

  document.querySelectorAll('[data-gch]').forEach(b=>b.onclick=()=>{gCh=b.dataset.gch;render()});document.querySelectorAll('[data-guf]').forEach(b=>b.onclick=()=>{gUf=gToggle(gUf,b.dataset.guf);gMun='';render()});document.querySelectorAll('[data-gmun]').forEach(b=>b.onclick=()=>{if(b._t){clearTimeout(b._t);b._t=0;if(b.dataset.tid)openTask(b.dataset.tid);return}b._t=setTimeout(()=>{b._t=0;gMun=gToggle(gMun,b.dataset.gmun);render()},250)});{const x=$('#gfx2');if(x)x.onclick=()=>{gUf=gMun='';render()}}document.querySelectorAll('svg.gmap[data-zf]').forEach(sv=>{try{const p=sv.querySelector('path'),b=p.getBBox(),m=Math.max(b.width,b.height)*.06;sv.setAttribute('viewBox',[b.x-m,b.y-m,b.width+2*m,b.height+2*m].join(' '))}catch(e){}});gFit();gMapInit();requestAnimationFrame(gFit);setTimeout(gFit,250);{const sk=document.querySelector('.stk');if(window._gRS)window._gRS.disconnect();if(sk&&window.ResizeObserver){window._gRS=new ResizeObserver(()=>{clearTimeout(window._gRT2);window._gRT2=setTimeout(()=>{setHH();gFit()},40)});window._gRS.observe(sk)}}{const gp=document.querySelector('.gcp .gmp');if(window._gRO){window._gRO.disconnect()}if(gp&&window.ResizeObserver){window._gRO=new ResizeObserver(()=>{clearTimeout(window._gRT);window._gRT=setTimeout(()=>{window._gRe&&window._gRe()},70)});window._gRO.observe(gp)}}
  document.querySelectorAll('[data-gsub]').forEach(b=>b.onclick=()=>{gSub=b.dataset.gsub;render()});
  document.querySelectorAll('[data-gk]').forEach(b=>b.onclick=()=>{const[a,c]=b.dataset.gk.split('|');gTab=a;if(c)gSub=c;render()});
  document.querySelectorAll('[data-cc]').forEach(b=>b.onclick=()=>{const k=b.dataset.cc;CC.has(k)?CC.delete(k):CC.add(k);render()});
  document.querySelectorAll('[data-vx]').forEach(b=>b.onclick=()=>{const x=VX(),k=b.dataset.vx;x[k]=!x[k];applyPref();render()});
  document.querySelectorAll('[data-sbt]').forEach(b=>b.onclick=()=>setMed(!MEDOPEN,1));document.querySelectorAll('[data-sbc]').forEach(b=>b.onclick=()=>{CC.clear();MX.clear();render()});
  document.querySelectorAll('[data-gc]').forEach(b=>b.onclick=()=>copyText(GP.get(b.dataset.gc)||'').then(ok=>toast(ok?'Pauta copiada':'Não foi possível copiar')));
  if(isAdm())document.querySelectorAll('[data-mx]').forEach(b=>dbl(b,()=>{view='med';ANIM=true;render();openConcItens(b.dataset.mx)}));
  document.querySelectorAll('[data-cx]').forEach(b=>b.onclick=()=>{const k=b.dataset.cx;colOpen=colNow===k?null:k;ANIM=true;render()});
  document.querySelectorAll('.pcap[data-tp]').forEach(b=>b.onclick=()=>openTP(b.dataset.pk,b.dataset.tp));
  document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{if(b.dataset.v==='medicao'){window._xpLock=true;const h=b.closest('header.sb');if(h)h.classList.remove('xp');setMed(!MEDOPEN);return}MEDOPEN=false;if(b.dataset.v==='gestao'&&view!=='gestao'){gTab='graf';gCh='map';gMore=false}view=b.dataset.v;ANIM=true;render()});
  $('#bn').onclick=()=>openTask();$('#bt').onclick=cycTheme;$('#bz').onclick=cycZoom;
   const bindMultiFilter=(w,sep,apply)=>{const id=w.dataset.mf,all=w.querySelector('input[data-all]'),items=[...w.querySelectorAll('input:not([data-all])')];w.querySelector('.gmb').onclick=e=>{e.stopPropagation();gMfOpen=gMfOpen===id?'':id;render()};w.querySelectorAll('input').forEach(i=>i.onchange=()=>{if(i.dataset.all){if(i.checked){items.forEach(x=>{if(x.value!=='__n')x.checked=true;else x.checked=false});apply('')}else{items.forEach(x=>x.checked=false);apply(sep+'__empty_selection__')}render();return}if(i.value==='__n'){if(i.checked)items.filter(x=>x!==i).forEach(x=>x.checked=false)}else{const none=items.find(x=>x.value==='__n');if(none)none.checked=false}const chosen=items.filter(x=>x.checked).map(x=>x.value),nonN=items.filter(x=>x.value!=='__n');if(all)all.checked=false;apply(chosen.length&&chosen.every(v=>v!=='__n')&&chosen.length===nonN.length?'':chosen.join(sep));render()})};
  document.querySelectorAll('.gfl .gmf').forEach(w=>{const id=w.dataset.mf;bindMultiFilter(w,GSEP,v=>{if(id==='gfmed')gSel=v;else if(id==='gflog')gLog=v;else if(id==='gfvt')gVt=v;else if(id==='gfuf'){gUf=v;gMun=''}else if(id==='gfmun')gMun=v;else if(id==='gftk')gTk=v;else if(id==='gfcn')gCn=v})});
  document.querySelectorAll('.bar .gmf').forEach(w=>{const id=w.dataset.mf;bindMultiFilter(w,FSEP,v=>{if(id==='fl-c')fMed=v;else if(id==='fl-t')fTipo=v;else if(id==='fl-p')fPessoa=v;else if(id==='fl-u')fUf=v})});
  const fbt=$('#fbt');if(fbt)fbt.onclick=()=>{fbOpen=!fbOpen;render()};
  const fsem=$('#fsem');if(fsem)fsem.onclick=()=>{fSemF=!fSemF;render()};
  const fx=$('#fl-x');if(fx)fx.onclick=()=>{fTipo=fPessoa=fKpi=fMed=fUf=fQ=fFunc='';fSemF=false;render()};
  const gt=$('#gftar');if(gt)gt.oninput=()=>{clearTimeout(gt._t);gt._t=setTimeout(()=>{gTar=gt.value;const p=gt.selectionStart;render();const n=$('#gftar');if(n){n.focus();n.setSelectionRange(p,p)}},180)};
  const fq=$('#fq');if(fq)fq.oninput=()=>{clearTimeout(fq._t);fq._t=setTimeout(()=>{fQ=fq.value;const p=fq.selectionStart;render();const n=$('#fq');if(n){n.focus();n.setSelectionRange(p,p)}},180)};
  document.querySelectorAll('button.kpi').forEach(b=>b.onclick=()=>kpiGo(b.dataset.k));
  $('#bo').onclick=()=>{sessionStorage.removeItem('me');ME=user=null;USR=null;view='gestao';render()};
  document.querySelectorAll('[data-fin]').forEach(b=>b.onclick=null);
  document.querySelectorAll('.xa').forEach(b=>b.onclick=()=>{const ids=[...b.closest('.col').querySelectorAll('.card')].map(c=>c.dataset.id),all=ids.every(i=>EX.has(i));ids.forEach(i=>all?EX.delete(i):EX.add(i));render()});
  document.querySelectorAll('.card .tg').forEach(g=>g.onclick=e=>{e.stopPropagation();const i=g.closest('.card').dataset.id;EX.has(i)?EX.delete(i):EX.add(i);render()});
  document.querySelectorAll('.card').forEach(c=>{c.onkeydown=e=>{if(e.target===c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openView(c.dataset.id)}};c.onclick=()=>openView(c.dataset.id);
    c.ondragstart=e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('id',c.dataset.id);const cl=c.closest('.col');e.dataTransfer.setData('pk',cl&&cl.dataset.p||'')}});
  document.querySelectorAll('.col[data-p]').forEach(col=>{
    col.ondragover=e=>{if(!isAdm())return;e.preventDefault();col.classList.add('over')};col.ondragleave=()=>col.classList.remove('over');
    col.ondrop=e=>{e.preventDefault();col.classList.remove('over');reatribuir(e.dataTransfer.getData('id'),e.dataTransfer.getData('pk'),col.dataset.p,col.dataset.pn)}});
  document.querySelectorAll('.col[data-s]').forEach(col=>{
    col.ondragover=e=>{e.preventDefault();col.classList.add('over')};col.ondragleave=()=>col.classList.remove('over');
    col.ondrop=async e=>{e.preventDefault();if(!isAdm())return;const t=S.tasks.find(x=>x.id===e.dataTransfer.getData('id'));if(t){t.status=col.dataset.s;await save();render()}}});
}

/* ---------- Tipos de fluxo ---------- */
/* ---------- Campos da tarefa (cadastro com tipo) ---------- */
const CT={texto:'Texto',longo:'Texto longo',numero:'Número',data:'Data',valor:'Valor (R$)'};
const CH={texto:'Texto livre, em uma linha.',longo:'Texto com várias linhas (ex.: observações).',numero:'Só dígitos, sem pontos ou vírgulas. Ex.: 0000000000',data:'Seletor de data, exibida como dd/mm/aaaa.',valor:'Moeda com formatação automática. Ex.: R$ 1.250,00'};
const DEF_CAMPOS=[{id:'sub',nome:'Subtarefa',tipo:'texto'},{id:'protocolo',nome:'Protocolo',tipo:'numero'},{id:'portal',nome:'Portal',tipo:'texto'},{id:'qtd',nome:'Quantidade',tipo:'numero',fixo:1},{id:'repasse',nome:'Data de repasse',tipo:'data',fixo:1},{id:'vmc',nome:'Medição Logictel',tipo:'mes',fixo:1},{id:'dmc',nome:'Data concessionária Coordenador',tipo:'data',fixo:1},{id:'vmg',nome:'Medição V.tal (Romel)',tipo:'texto',fixo:1},{id:'dmg',nome:'Data concessionária Gestor',tipo:'data',fixo:1},{id:'obs',nome:'Observações',tipo:'longo'}];
const MEDF=['vmc','dmc','vmg','dmg'];
const campoOculto=c=>c.id==='dmc'||c.id==='dmg'||/n[ºo°]\s*da\s*medi|data\s+medi[cç][aã]o\s+(coordenador|gestor)/i.test(c.nome||'');
const campos=()=>(S.campos||DEF_CAMPOS).filter(c=>!campoOculto(c));
const fname=k=>(campos().find(c=>c.id===k)||{}).nome||k;
const fid=k=>k==='repasse'?'f6':k==='qtd'?'fq':'cf-'+k;
const brl=v=>(v===''||v==null||isNaN(v))?'':'R$ '+Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtMes=v=>{const m=/^(\d{4})-(\d{2})/.exec(v==null?'':String(v));return m&&+m[2]>=1&&+m[2]<=12?m[2]+'/'+m[1].slice(2):''};
const parseMes=s=>{s=String(s||'').trim().toLowerCase();if(!s)return'';let m=/^(\d{1,2})\s*[\/\-. ]\s*(\d{2}|\d{4})$/.exec(s),mo,y;if(m){mo=+m[1];y=m[2]}else{m=/^([a-zç]{3})[a-zç]*\s*[\/\-. ]?\s*(\d{2}|\d{4})$/.exec(s);if(!m)return'';mo=MESES.indexOf(m[1])+1;y=m[2]}if(mo<1||mo>12)return'';if(y.length===2)y='20'+y;return y+'-'+String(mo).padStart(2,'0')};
const fmtVal=(c,v)=>(v===''||v==null)?'':c.tipo==='data'?fmt(v):c.tipo==='mes'?fmtMes(v):c.tipo==='valor'?brl(v):String(v);
function fieldHtml(c,t){const v=t[c.id]??'',id=fid(c.id),n=esc(c.nome);let i;
  if(c.tipo==='longo')i=`<textarea id="${id}">${esc(v)}</textarea>`;
  else if(c.tipo==='data')i=`<input type="date" id="${id}" value="${esc(v)}">`;
  else if(c.tipo==='mes')i=`<input type="text" id="${id}" data-t="mes" value="${esc(fmtMes(v))}" placeholder="mm/aa" readonly class="mpk" autocomplete="off">`;
  else if(c.tipo==='valor')i=`<input type="text" inputmode="numeric" id="${id}" data-t="valor" value="${esc(brl(v))}" placeholder="R$ 0,00" autocomplete="off">`;
  else if(c.tipo==='numero')i=`<input type="text" inputmode="numeric" id="${id}" data-t="numero" value="${esc(v)}" placeholder="0000000000" autocomplete="off">`;
  else i=`<input type="text" id="${id}" value="${esc(v)}">`;
  return `<div${c.tipo==='longo'?' class="full"':''} data-f="${c.id}"><label for="${id}">${n}</label>${i}</div>`}
/* Seletor de mês/ano (calendário) para campos do tipo mês; valor salvo continua AAAA-MM */
document.addEventListener('click',ev=>{
  const p=document.querySelector('.mpop'),inp=ev.target.closest&&ev.target.closest('input[data-t=mes]');
  if(p&&p.contains(ev.target))return;
  const same=p&&p._i===inp;if(p)p.remove();
  if(!inp||same||inp.disabled)return;
  const cur=parseMes(inp.value);let y=cur?+cur.slice(0,4):new Date().getFullYear();
  const w=document.createElement('div');w.className='mpop';w._i=inp;
  const draw=()=>{const sel=parseMes(inp.value);w.innerHTML=`<div class="mph"><button type="button" data-y="-1" aria-label="Ano anterior">‹</button><b>${y}</b><button type="button" data-y="1" aria-label="Próximo ano">›</button></div><div class="mpg">${MESES.map((m,i)=>`<button type="button" data-m="${i+1}" class="${sel===y+'-'+String(i+1).padStart(2,'0')?'on':''}">${m}</button>`).join('')}</div><div class="mpf"><button type="button" data-m="0">Limpar</button></div>`};
  draw();
  w.onclick=e=>{e.stopPropagation();const b=e.target.closest('button');if(!b)return;
    if(b.dataset.y){y+=+b.dataset.y;draw();return}
    const m=+b.dataset.m;inp.value=m?String(m).padStart(2,'0')+'/'+String(y).slice(2):'';w.remove();inp.dispatchEvent(new Event('change',{bubbles:true}))};
  inp.parentElement.style.position='relative';inp.parentElement.appendChild(w)});
function bindMasks(root){
  root.querySelectorAll('[data-t=mes]').forEach(i=>i.addEventListener('blur',()=>{const p=parseMes(i.value);i.value=p?fmtMes(p):''}));
  root.querySelectorAll('[data-t=numero]').forEach(i=>i.addEventListener('input',()=>{i.value=i.value.replace(/\D/g,'')}));
  root.querySelectorAll('[data-t=valor]').forEach(i=>i.addEventListener('input',()=>{const g=i.value.replace(/\D/g,'');i.value=g?brl(parseInt(g,10)/100):''}))}
function readVal(c,e){if(c.tipo==='mes')return parseMes(e.value);if(c.tipo==='valor'){const g=e.value.replace(/\D/g,'');return g?parseInt(g,10)/100:''}return c.tipo==='longo'?e.value:e.value.trim()}
function ensureCampos(){if(!Array.isArray(S.campos))S.campos=[];
  DEF_CAMPOS.filter(d=>d.fixo&&!S.campos.some(c=>c.id===d.id)).forEach(d=>S.campos.push({...d}));
  DEF_CAMPOS.filter(d=>d.id==='vmc'||d.id==='vmg').forEach(d=>{const c=S.campos.find(x=>x.id===d.id);if(c){c.nome=d.nome;c.tipo=d.tipo}})}
const DEF_TIPOS=[];const _SEED_ANTIGO=[{id:'ty1',nome:'Limpar',cor:COLORS[3],campos:['obs'],passos:['Arrumar lençóis','Tirar pó','Arrumar mesa do PC','Arrumar guarda-roupas','Passar pano','Perfumar'],meta:{v:0,u:'dias'}}];
function ensureTipos(){ensureCampos();if(!S.contatos)S.contatos=[];if(!Array.isArray(S.concessionarias))S.concessionarias=[];if(!Array.isArray(S.tipos))S.tipos=[];if(!Array.isArray(S.medicoes))S.medicoes=[];if(!Array.isArray(S.tasks))S.tasks=[];S.tasks.forEach(migTask);S.tipos.forEach(migTipo);syncCores()}
/* A cor é escolhida só na concessionária; fluxo, tarefas e cards seguem essa cor */
function syncCores(){S.tipos.forEach(y=>{const m=S.concessionarias.find(x=>x.id===y.conc)||(!y.conc?S.concessionarias.find(x=>nk(x.nome)===nk(y.nome)):null);if(!m)return;if(!m.cor&&y.cor)m.cor=y.cor;if(m.cor)y.cor=m.cor})}
const tipoOf=t=>S.tipos.find(x=>x.id===t.tipo);
const concOf=y=>y&&((S.concessionarias||[]).find(m=>m.id===y.conc)||(!y.conc?(S.concessionarias||[]).find(m=>nk(m.nome)===nk(y.nome)):undefined));
const medNm=id=>((S.medicoes||[]).find(c=>c.id===id)||{}).nome||'';
const medId=y=>{const m=concOf(y);return m?m.medicao||'':''};
const concLbl=m=>{const c=medNm(m.medicao);return c?c+' › '+m.nome:m.nome};
const tipoLbl=y=>{const m=concOf(y),c=m?medNm(m.medicao):'';return c?c+' › '+y.nome:y.nome};
const dirOf=t=>{const m=concOf(tipoOf(t));if(!m||!m.dir||!t.tarefa)return'';const d=m.dir.trim().replace(/[\\/]+$/,'');return d+(d.includes('\\')?'\\':'/')+t.tarefa};
const corOf=t=>(tipoOf(t)||{}).cor||t.cor||COLORS[7];
const tipoTag=t=>{const y=tipoOf(t);return y?`<span class="tag tipo" style="--c:${y.cor}"><i></i>${esc(tipoLbl(y))}</span>`:''};
/* ---------- Nomes, filtros e segmentação ---------- */
const nk=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const shortName=n=>{const p=String(n||'').trim().split(/\s+/).filter(Boolean);return p.length>2?p[0]+' '+p[p.length-1]:p.join(' ')};
const chipName=c=>{const s=shortName(c.nome);return (S.contatos||[]).filter(x=>nk(shortName(x.nome))===nk(s)).length>1?c.nome.trim():s};
const pkey=p=>{const c=contactFor(p);return c?'c:'+c.id:'n:'+nk(p)};
function flowPeople(){const m=new Map();S.tasks.forEach(t=>t.fluxo.forEach(f=>{if(f.pessoa==='Sem responsável')return;const k=pkey(f.pessoa);if(!m.has(k)){const c=contactFor(f.pessoa);m.set(k,c?chipName(c):f.pessoa)}}));return[...m]}
const personOpts=()=>{const m=new Map(flowPeople());(S.contatos||[]).forEach(c=>m.set('c:'+c.id,chipName(c)));return[...m].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'))};
const qOk=t=>{const hay=nk([nome(t),t.tarefa,t.protocolo,...holders(t).map(h=>h.pessoa),...t.fluxo.flatMap(f=>[f.etapa,f.pessoa])].join(' '));return nk(fQ).split(' ').every(w=>hay.includes(w))};
const ufV=()=>view==='painel'||view==='tarefa'||view==='equipe';
const semF=t=>act(t).some(f=>!String(f.pessoa||'').trim()||f.pessoa==='Sem responsável'),semOn=()=>fSemF&&(view==='painel'||view==='tarefa');
const ufOf=t=>{try{const f=gFld(/^(UF|ESTADO)$/);return f?(UFK[gNorm(t[f.id])]||''):''}catch(e){return''}};
const ufList=()=>{try{return[...new Set(S.tasks.filter(vis).map(ufOf).filter(Boolean))].sort((a,b)=>UFN[a].localeCompare(UFN[b],'pt-BR'))}catch(e){return[]}};
const FSEP='¦', fvals=v=>v?String(v).split(FSEP).filter(Boolean):[], fhas=(v,x)=>!v||fvals(v).includes(String(x)), fcount=v=>fvals(v).length;
const baseSkip=(skip='')=>S.tasks.filter(t=>vis(t)&&(skip.includes('sem')||!semOn()||semF(t))&&(!skip.includes('uf')&&(!fUf||!ufV()||fhas(fUf,ufOf(t)))||skip.includes('uf'))&&(!skip.includes('q')&&!fQ||skip.includes('q')||qOk(t))&&(!skip.includes('tipo')&&fhas(fTipo,t.tipo||'')||skip.includes('tipo'))&&(!skip.includes('med')&&fhas(fMed,medId(tipoOf(t)))||skip.includes('med'))&&(!skip.includes('pessoa')&&(!fPessoa||holders(t).some(h=>fhas(fPessoa,pkey(h.pessoa))))||skip.includes('pessoa')));
const base=()=>baseSkip();
const kpiOk=t=>!fKpi||(fKpi==='open'?t.status!=='done':fKpi==='late'?late(t):t.status==='done');
const anyF=()=>!!(fTipo||fPessoa||fKpi||fQ||fMed||fFunc||semOn()||(fUf&&ufV()));
const KPI_TXT={open:'em aberto',late:'atrasadas',done:'concluídas'};
function bar(){
  const ZE=[[fMed,'med'],[fTipo,'tipo'],[fPessoa,'pessoa'],[fUf,'uf']].filter(([v])=>fvals(v).includes(EMP)).map(x=>x[1]).join(' '),medRows=baseSkip('med '+ZE),typeRows=baseSkip('tipo '+ZE),peopleRows=baseSkip('pessoa '+ZE),ufRows=baseSkip('uf '+ZE);
  const medIds=new Set(medRows.map(t=>medId(tipoOf(t)))),typeIds=new Set(typeRows.map(t=>t.tipo||'')),personIds=new Set(peopleRows.flatMap(t=>holders(t).map(h=>pkey(h.pessoa)))),ufIds=new Set(ufRows.map(ufOf).filter(Boolean));
  const AC={q:!!fQ,med:fvals(fMed).some(v=>v!==EMP),tipo:fvals(fTipo).some(v=>v!==EMP),pessoa:fvals(fPessoa).some(v=>v!==EMP),uf:!!ufV()&&fvals(fUf).some(v=>v!==EMP),sem:semOn()},oth=k=>Object.keys(AC).some(n=>n!==k&&AC[n]);
  const Y=(S.tipos||[]).filter(y=>!oth('tipo')||typeIds.has(y.id)||fvals(fTipo).includes(y.id)).map(y=>[y.id,tipoLbl(y)]),P=isAdm()?personOpts().filter(([k])=>!oth('pessoa')||personIds.has(k)||fvals(fPessoa).includes(k)):[],C=(S.medicoes||[]).filter(c=>!oth('med')||medIds.has(c.id)||fvals(fMed).includes(c.id)).map(c=>[c.id,c.nome]).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
  const sel=(id,l,cur,all,o,cls)=>(id!=='fl-p'||isAdm())?(()=>{const raw=fvals(cur),none=raw.includes(EMP),chosen=raw.filter(v=>v!==EMP),open=gMfOpen===id,tx=none&&!chosen.length?'Nenhum':chosen.length===0?all:chosen.length===1?(o.find(x=>x[0]===chosen[0])||[0,chosen[0]])[1]:chosen.length+' selecionados',item=(v,t,c,a)=>`<label class="gmi"><input type="checkbox" value="${esc(v)}" ${a?'data-all="1" ':''}${c?'checked':''}><span>${esc(t)}</span></label>`;return `<div class="fg gfi gmf" data-mf="${id}"><span>${l}</span><button type="button" class="gmb" aria-haspopup="true" aria-expanded="${open}"><em>${esc(tx)}</em></button><div class="gmdp"${open?'':' hidden'}>${item('','Todas',!chosen.length&&!none,1)}${o.map(([v,t])=>item(v,t,none?false:(!chosen.length||chosen.includes(v)))).join('')}</div></div>`})():'';
  const f=anyF();
  let extra='';
  if(view==='admin'){
    const n={cls:(S.medicoes||[]).length,med:(S.concessionarias||[]).length,tipos:S.tipos.length,campos:campos().filter(c=>!c.fixo).length,func:(S.contatos||[]).length,usr:USR?USR.length:'·'};
    extra=`<div class="amenu-bar" role="group" aria-label="Cadastros">${ASEC.map(([k,l],i)=>`<button type="button" data-sec="${k}" ${adminSec===k?'aria-current="page"':''}><span>${i+1}. ${l}</span><em>${n[k]}</em></button>`).join('')}</div>`;
  }
  const nF=[fQ,fMed,fTipo,fPessoa,fKpi,fFunc,ufV()&&fUf,semOn()].filter(Boolean).length,nSem=baseSkip('sem').filter(t=>t.status!=='done'&&semF(t)).length;
  return `<div class="bar${fbOpen?'':' fc'}" role="group" aria-label="Filtros"><button type="button" class="btn fbt" id="fbt" aria-expanded="${fbOpen}">Filtros${nF?` <em>${nF}</em>`:''}<span aria-hidden="true">${fbOpen?'▴':'▾'}</span></button>${['painel','tarefa','equipe'].includes(view)?`<div class="fg"><label for="fq">Buscar</label><input type="search" id="fq" class="cs" placeholder="Título, protocolo, pessoa…  ( / )" value="${esc(fQ)}" autocomplete="off"></div>`:''}${sel('fl-c','Medição',fMed,'Todas',C)}${sel('fl-t','Tipo',fTipo,'Todos',Y)}${sel('fl-p','Funcionário',fPessoa,'Todos',P)}${ufV()?sel('fl-u','UF',fUf,'Todas',[...new Set([...ufIds,...fvals(fUf).filter(u=>UFN[u])])].sort((a,b)=>UFN[a].localeCompare(UFN[b],'pt-BR')).map(u=>[u,u]),'fu'):''}${view==='painel'||view==='tarefa'?`<div class="fg fsm"><span aria-hidden="true">&nbsp;</span><button type="button" class="btn fsb" id="fsem" aria-pressed="${!!fSemF}" title="Mostrar só as tarefas que não têm funcionário">Sem funcionário${nSem?` <em>${nSem}</em>`:''}</button></div>`:''}<div class="fst">`
   +(f?`<span class="fcount">${fKpi?'Mostrando '+KPI_TXT[fKpi]+' · ':''}${base().filter(kpiOk).length} de ${S.tasks.filter(vis).length} tarefa(s)</span><button type="button" class="btn clr" id="fl-x">${ICO_BROOM} Limpar filtros</button>`:'')+`</div>`+extra+`</div>`;
}
async function copyText(txt){
  try{await navigator.clipboard.writeText(txt);return true}catch(e){}
  try{const a=document.createElement('textarea');a.value=txt;a.setAttribute('readonly','');a.style.cssText='position:fixed;opacity:0;top:0;left:0';document.body.appendChild(a);a.select();a.setSelectionRange(0,txt.length);const ok=document.execCommand('copy');a.remove();return ok}catch(e){return false}
}
const metaTxt=y=>!y||!y.meta||!+y.meta.v?'Sem meta':y.meta.u==='qtd'?`${y.meta.v} por dia`:`${y.meta.v} ${y.meta.u}`;
const tpOpen=t=>t.status!=='done'||fKpi==='done';
const tpTipo=t=>tipoOf(t)?t.tipo:'';
function tarefaView(TF){
  const nm=new Map(flowPeople()),L=TF.filter(tpOpen);
  const cols=S.tipos.filter(y=>fhas(fTipo,y.id)).map(y=>({id:y.id,nome:tipoLbl(y),cor:y.cor,sub:metaTxt(y)}));
  if(!fTipo)cols.push({id:'',nome:'Sem tipo',cor:'#9aa4b8',sub:'Sem meta'});
  const h=cols.map(c=>{const m=new Map();
    L.filter(t=>tpTipo(t)===c.id).forEach(t=>{const seen=new Set();holders(t).forEach(w=>{if(!String(w.pessoa||'').trim())return;const k=pkey(w.pessoa);if(seen.has(k))return;seen.add(k);if(!m.has(k))m.set(k,{k,n:nm.get(k)||w.pessoa,q:0,mv:0});m.get(k).q++;if(movNew(t))m.get(k).mv++});if(semF(t)){const k='__sem';if(!m.has(k))m.set(k,{k,n:'Sem funcionário',q:0,mv:0});m.get(k).q++;if(movNew(t))m.get(k).mv++}});
    const P=[...m.values()].sort((x,y)=>(x.k==='__sem')-(y.k==='__sem')||y.q-x.q||x.n.localeCompare(y.n,'pt-BR'));
    return P.length||!anyF()?`<section class="col" aria-label="${esc(c.nome)}"><h2><span><i class="dotc" style="background:${c.cor}"></i>${esc(c.nome)}</span><span>${(mvc=>mvc?`<span class="tag mv" title="${mvc} tarefa(s) mudaram de posto">🔔 ${mvc}</span> `:'')(P.reduce((a,p)=>a+p.mv,0))}<em>${P.length}</em></span></h2><div class="hint" style="margin:-6px 6px 8px">${esc(c.sub)}</div><div class="list">${P.map(p=>`<button type="button" class="pcap" data-pk="${esc(p.k)}" data-tp="${esc(c.id)}" style="--k:${c.cor}" aria-label="${esc(p.n)}: ${p.q} tarefa(s) em ${esc(c.nome)}. Ver tarefas"><span class="pn"><span>${esc(p.n)}</span><span class="pct2">${p.q}</span></span><small>${p.q} tarefa(s) neste tipo</small>${p.mv?`<small><span class="tag mv">🔔 ${p.mv} mudou(aram) de posto</span></small>`:''}</button>`).join('')||'<div class="empty">Sem tarefas</div>'}</div></section>`:''}).join('');
  return mvSec(5)+(h?`<div class="hsb" id="hsb" hidden aria-hidden="true"><div></div></div><div class="board" id="bdp">${h}</div>`:'<div class="empty">Nenhuma tarefa com funcionário neste filtro.</div>')}
function openTP(pk,tid){
  const nm=new Map(flowPeople()),y=S.tipos.find(x=>x.id===tid);
  const L=srt(base().filter(kpiOk).filter(tpOpen).filter(t=>tpTipo(t)===tid&&(pk==='__sem'?semF(t):holders(t).some(h=>pkey(h.pessoa)===pk))));
  const [d,close]=dlg(`<div class="dh"><div><h2>${esc(pk==='__sem'?'Sem funcionário':nm.get(pk)||'Funcionário')}</h2><div class="hint">${L.length} tarefa(s) em ${esc(y?y.nome:'Sem tipo')}</div></div><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="vb"><div class="capc">${L.map(t=>card(t,'p').replace('class="card co"','class="card"')).join('')||'<div class="empty">Nenhuma tarefa.</div>'}</div></div>`,y?y.cor:'#9aa4b8');
  d.classList.add('view');
  d.querySelectorAll('.card').forEach(c=>{c.onclick=()=>{close();openView(c.dataset.id)};c.onkeydown=e=>{if(e.target===c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();close();openView(c.dataset.id)}}});
}
function story(){
  const B=base().filter(kpiOk),op=B.filter(t=>t.status!=='done'),lt=op.filter(late).length;
  if(!op.length)return 'Nenhuma tarefa em aberto neste recorte. Tudo em dia.';
  let h=`<b>${op.length}</b> tarefa(s) em andamento no fluxo`+(lt?` · <b class="lt">${lt} atrasada(s)</b>`:'')+'. ';
  if(view==='equipe'){const m=new Map();op.forEach(t=>holders(t).forEach(w=>m.set(w.pessoa,(m.get(w.pessoa)||0)+1)));const x=[...m].sort((a,b)=>b[1]-a[1])[0];return h+(x?`Mais carga com <b>${esc(x[0])}</b>: ${x[1]} atividade(s).`:'')}
  const n=op.filter(t=>t.final).sort((a,b)=>a.final.localeCompare(b.final))[0];
  if(n){const d=Math.round((new Date(n.final+'T12:00:00')-new Date(today()+'T12:00:00'))/864e5),w=holder(n),q=d<0?`atrasada há ${-d} dia(s)`:d===0?'hoje':d===1?'amanhã':`em ${d} dias (${fmt(n.final)})`;
    h+=`Próxima entrega: <b>${esc(nome(n))}</b>${w?` com <b>${esc(w.pessoa)}</b>`:''}, ${q}.`}
  return h;
}
function hero(){
  const h={painel:['A operação, <strong>de ponta a ponta</strong>',story()],
  tarefa:['Quem está em <strong>cada tipo de fluxo</strong>',story()],
  equipe:['Quem está com <strong>cada tarefa</strong>',story()],
  gestao:['O que o <strong>gestor</strong> precisa cobrar','Atrasos, prazos próximos, tarefas paradas e itens sem tarefa.'],
  med:['Os <strong>itens</strong> de cada concessionária','Concessionárias organizadas por medição. Veja quais itens já viraram tarefa e quais ainda faltam cadastrar.'],
  guia:['Aprenda a usar o <strong>Fluxo</strong>','Siga os passos na ordem: primeiro os cadastros, depois as tarefas e o acompanhamento.'],
  func:['Quem faz <strong>a equipe</strong>','Cadastre os funcionários e os contatos usados nos botões de WhatsApp e e-mail.'],
  admin:['Defina o <strong>jeito de trabalhar</strong>','Preencha na ordem das abas: funcionários, usuários, medições, concessionárias, campos da tarefa e tipos de fluxo.']}[view];
  return `<div class="hero"><h1>${h[0]}</h1><p>${h[1]}</p></div>`;
}
function calc(y,rep,q){
  if(!y||!y.meta||!+y.meta.v||!rep)return'';const m=y.meta;let d;
  if(m.u==='dias')d=+m.v;else if(m.u==='horas')d=Math.floor(m.v/24);else{if(!+q)return'';d=Math.ceil(q/m.v)}
  const dt=new Date(rep+'T12:00:00');dt.setDate(dt.getDate()+d);return dt.toISOString().slice(0,10);
}
/* ---------- Passo a passo ---------- */
let gStep=0;
const ERR={
 login:{n:'Entrar no sistema',l:[
  ['Usuário ou senha incorretos.','Usuário ou senha digitados errado, ou o usuário está inativo.','Confira os dois campos e tente de novo. Se continuar, o gestor abre Administração › Usuários, confere se “Usuário ativo” está marcado e define uma nova senha.'],
  ['Muitas tentativas. Aguarde 30s.','Cinco erros seguidos de senha bloqueiam a tela por 30 segundos.','Espere a contagem acabar e digite com calma. Não precisa recarregar a página.'],
  ['Este usuário não está vinculado a um funcionário. Fale com o gestor.','O usuário é do tipo Normal, mas não tem funcionário vinculado.','O gestor abre Administração › Usuários, edita o usuário e escolhe o Funcionário vinculado.'],
  ['Sem conexão com o banco. Tente novamente.','Sem internet ou o banco online não respondeu.','Confira a internet e clique em Entrar de novo.'],
  ['Banco não configurado…','A URL e a chave do Supabase estão vazias no arquivo index.html.','Só quem mantém o arquivo resolve: preencha SB.url e SB.key no começo do código.'],
  ['Sessão encerrada por inatividade','Passaram 2 horas sem usar o sistema.','Entre de novo. O que você já salvou continua no banco.']]},
 func:{n:'1. Funcionários',l:[
  ['Informe o nome do funcionário','O campo Nome está vazio.','Digite o nome completo e salve.'],
  ['Para criar o acesso, informe o usuário e uma senha de pelo menos 6 caracteres','“Criar acesso ao sistema agora” está marcado, mas faltou o login ou a senha tem menos de 6 caracteres.','Preencha usuário e senha (6 ou mais caracteres) ou desmarque a caixa e crie o acesso depois, em Usuários.'],
  ['Funcionário salvo, mas o acesso falhou: …','O funcionário foi salvo, mas o login não foi criado (em geral já existe um usuário com esse login).','Não cadastre o funcionário de novo. Vá em Administração › Usuários, crie o acesso com outro login e escolha este funcionário em “Funcionário vinculado”.'],
  ['Cadastre o contato de … para usar este botão','Você clicou em WhatsApp ou E-mail de alguém que está no fluxo mas não está cadastrado.','O sistema abre Funcionários. Clique em “+ Nome” e preencha WhatsApp e e-mail.']]},
 usr:{n:'2. Usuários',l:[
  ['Usuário Normal precisa de um funcionário vinculado','Acesso Normal sem funcionário escolhido.','Escolha o Funcionário vinculado. Se a pessoa deve ver tudo, troque o acesso para Gestor.'],
  ['A senha precisa de no mínimo 6 caracteres','O navegador bloqueia senhas curtas.','Use 6 ou mais caracteres. Ao editar, deixe em branco para manter a senha atual.'],
  ['Não foi possível carregar os usuários: …','Falha de conexão ou de permissão ao buscar os usuários.','Confira a internet, recarregue a página e entre de novo como Gestor.'],
  ['Mensagem do banco ao salvar (ex.: usuário já existe)','O banco recusou o cadastro.','Leia a mensagem. Quase sempre basta usar outro login.']]},
 cls:{n:'3. Medições',l:[
  ['Cadastre uma medição primeiro','Você tentou cadastrar uma concessionária sem nenhuma medição.','O sistema abre Medições. Cadastre uma e volte.'],
  ['Já existe uma medição com este nome','Duas medições não podem ter o mesmo nome.','Edite a existente ou use outro nome.'],
  ['Mova ou exclua antes as concessionárias desta medição','A medição ainda tem concessionárias.','Edite cada concessionária e escolha outra medição, ou exclua as concessionárias, e depois exclua a medição.'],
  ['A tabela fx_medicoes não existe no Supabase','O SQL de atualização ainda não foi rodado.','Rode o arquivo atualizacao_supabase.sql no SQL Editor do Supabase e recarregue a página.']]},
 med:{n:'4. Concessionárias',l:[
  ['Já existe uma concessionária com este nome','Duas concessionárias não podem ter o mesmo nome.','Abra a que já existe e edite, ou use outro nome.'],
  ['Informe ao menos um item','A caixa de itens está vazia.','Escreva um item por linha.'],
  ['Exclua antes o fluxo desta concessionária','A concessionária tem um tipo de fluxo ligado a ela.','Vá em Tipos de fluxo, exclua o tipo dela (as tarefas continuam, sem tipo) e depois exclua a concessionária.'],
  ['Preencha este campo','O nome ou os itens estão em branco.','Preencha os dois e salve.']]},
 campos:{n:'5. Campos da tarefa',l:[
  ['Não consigo excluir ou mudar o tipo de “Quantidade” e “Data de repasse”','São campos fixos, usados nos cálculos de meta.','Deixe como estão. Você só pode renomear.'],
  ['Excluí um campo e os valores sumiram das tarefas','Os valores ficam guardados, mas deixam de aparecer.','Crie o campo de novo com o mesmo formato e marque-o nos tipos de fluxo.']]},
 tipos:{n:'6. Tipos de fluxo',l:[
  ['Isso criaria um ciclo: um passo ficaria esperando por ele mesmo.','Duas dependências se apontam em círculo (A espera B e B espera A, direta ou indiretamente, inclusive por passos concomitantes).','Desmarque uma das dependências. O diagrama no fim do formulário mostra as setas.'],
  ['Cadastre uma concessionária primeiro','Você clicou em “+ Novo tipo” sem ter concessionária.','O sistema abre Concessionárias. Cadastre uma e volte.'],
  ['A concessionária que eu quero não aparece na lista','Só aparecem concessionárias que ainda não têm fluxo.','Ela já tem um tipo: use “Editar” nele em vez de criar outro.'],
  ['A lista de responsáveis está vazia ao montar o fluxo','Não há funcionários cadastrados.','Cadastre os funcionários (passo 1) e abra o formulário de novo.'],
  ['Excluí um tipo e as tarefas ficaram “Sem tipo”','As tarefas continuam, mas perdem o tipo.','Recrie o tipo da concessionária e escolha-o ao editar cada tarefa.']]},
 tarefa:{n:'Criar tarefa',l:[
  ['Há uma dependência circular no fluxo. Revise as dependências dos passos.','Uma tarefa antiga ou editada ficou com passos esperando uns pelos outros.','Abra “Ordem e dependências” dos passos e desmarque a dependência que fecha o círculo.'],
  ['Defina os passos e o responsável de cada um','A tarefa está sem passos, ou algum passo está com “— responsável —”.','Escolha o tipo de fluxo (os passos aparecem sozinhos) ou use “+ Passo”, e escolha o responsável em todos. Se a lista de responsáveis estiver vazia, cadastre os funcionários antes.'],
  ['Escolha o tipo de fluxo desta tarefa','A concessionária ainda não tem tipo de fluxo (aparece ao dar dois cliques num item que falta, na aba Concessionárias).','Crie o tipo em Administração › Tipos de fluxo para essa concessionária e escolha-o no formulário.'],
  ['Escolha um tipo de fluxo ou adicione passos','Não há tipo selecionado e o fluxo está vazio.','Selecione o Tipo de fluxo no alto do formulário.'],
  ['“— escolha o item —” / Preencha este campo','O Título é obrigatório e vem dos itens da concessionária.','Escolha o item. Se ele não está na lista, inclua em Administração › Concessionárias › Editar itens.'],
  ['A data estimada não é calculada','O tipo está sem meta, ou faltam Data de repasse / Quantidade.','Preencha esses campos ou digite a data final você mesmo.']]},
 painel:{n:'Acompanhar',l:[
  ['O painel mostra “Nenhuma tarefa” ou colunas vazias','Há filtro ativo: botão Em aberto, Atrasadas ou Concluídas, Tipo, Funcionário ou Buscar.','Clique em “Limpar filtros” ou desmarque o botão ativo.'],
  ['Não consigo arrastar o card para outra coluna','Só o gestor muda o status arrastando.','Peça ao gestor, ou finalize o seu passo pelo card.'],
  ['Uma tarefa Fixo nunca aparece como atrasada','Atividades contínuas não atrasam por regra.','Está certo. Use a data e as anotações para controlar.'],
  ['Não encontro uma tarefa (usuário Normal)','Normal vê só tarefas em que tem passo no fluxo.','Peça ao gestor para conferir se seu nome está num passo.']]},
 card:{n:'Finalizar e devolver',l:[
  ['Este passo não é seu','Você tentou finalizar o passo de outra pessoa.','Só o responsável finaliza. O gestor pode finalizar ou avançar qualquer passo.'],
  ['Preencha antes de finalizar o passo: …','Faltam campos obrigatórios daquele passo.','Preencha os campos citados no card, clique em “Salvar campos” e finalize de novo.'],
  ['Esta tarefa foi atualizada por outra pessoa. Confira o passo atual e tente de novo.','Alguém mexeu na tarefa antes de você.','Feche o card, abra de novo, confira o passo atual e repita a ação.'],
  ['Informe a observação da devolução negativa','Devolução Negativa exige observação.','Escreva o que houve ou escolha Administrativa, que não pede texto.'],
  ['Escreva a anotação','A caixa de anotação está vazia.','Digite o texto antes de clicar em Salvar anotação.'],
  ['Não foi possível copiar','O navegador bloqueou a cópia automática.','Selecione o e-mail ou o caminho na tela e copie com Ctrl+C.'],
  ['Não aparece “← Devolver passo”','Só o gestor devolve, e só quando há um passo concluído.','Entre como Gestor ou peça a ele a devolução.']]},
 banco:{n:'Conexão e dados',l:[
  ['Sem conexão com o banco: esta alteração ainda NÃO foi salva no servidor. Reconectando…','A internet caiu ou o banco não respondeu.','Mantenha a página aberta. Quando a conexão voltar, o sistema reenvia sozinho. Não recarregue antes.'],
  ['NÃO salvou no banco: … nova tentativa em instantes','O envio falhou, mas o sistema tenta de novo.','Aguarde. Se a faixa “Alterações pendentes” não sumir, avise quem mantém o sistema.'],
  ['Ocorreu um erro inesperado / Falha na operação','Erro interno da página.','Recarregue (F5), entre de novo e refaça. O que já estava salvo permanece.']]}};
const errHtml=l=>l.map(([m,c,s])=>`<details class="gerr"><summary>${m}</summary><p><b>Por que acontece:</b> ${c}</p><p><b>O que fazer:</b> ${s}</p></details>`).join('');
const GUIA=[
 {f:'Início',t:'Como o Fluxo funciona',x:'Cada tarefa é um fluxo de passos e cada passo tem um funcionário responsável. Os passos formam um diagrama: alguns dependem de outros, alguns são livres e alguns são feitos juntos.',
  m:'<span class="nd">1 Administração</span><span class="ar">→</span><span class="nd">2 Criar tarefas</span><span class="ar">→</span><span class="nd">3 Acompanhar</span>',
  l:['Ordem de uso: Entrar → Funcionários → Usuários → Medições → Concessionárias → Campos da tarefa → Tipos de fluxo → Criar tarefa → Acompanhar e finalizar passos.','Cada etapa usa a anterior. Pular uma gera os erros descritos no fim de cada passo.','Gestor vê todas as abas. Usuário Normal vê só “Minhas tarefas”, com os passos dele. Vários passos podem estar liberados ao mesmo tempo.','Este passo a passo é aberto pelo gestor. Cada passo traz “Possíveis erros” e o último reúne todos.'],
  tip:'Siga a ordem na primeira vez. Depois, volte aqui sempre que tiver dúvida.'},
 {f:'Início',t:'Entre no sistema',x:'Cada pessoa entra com o usuário e a senha definidos pelo gestor.',
  m:'<span class="nd">Usuário</span><span class="ar">→</span><span class="nd">Senha</span><span class="ar">→</span><span class="nd">Entrar</span>',
  l:['Digite o usuário e a senha e clique em Entrar.','Gestor abre na aba Gestão. Usuário Normal abre em Minhas tarefas.','Para sair, use o botão Sair no alto.','Depois de 2 horas sem uso, a sessão fecha sozinha.'],
  tip:'Cinco senhas erradas seguidas bloqueiam a tela por 30 segundos.',e:'login'},
 {f:'Administração',t:'1. Cadastre os funcionários',x:'Quem aparece nos fluxos precisa estar cadastrado, para ter WhatsApp e e-mail à mão.',
  m:'<span class="nd">Ana Souza</span><span class="tag">Analista</span><span class="tag">(21) 99999-9999</span><span class="tag">ana@empresa.com</span>',
  l:['Abra Administração › 1. Funcionários e clique em “+ Novo funcionário”.','Preencha o nome completo (obrigatório), a função, o WhatsApp com DDD e o e-mail.','Se quiser, deixe marcado “Criar acesso ao sistema agora”, confira o usuário e defina uma senha de 6 ou mais caracteres. O acesso nasce como Normal.','Clique em Salvar funcionário.','No fluxo da tarefa ele aparece como Primeiro + Último nome; se houver dois iguais, com o nome completo.'],
  tip:'Quem já aparece em algum fluxo sem cadastro surge como botão “+ Nome”: um clique e você cadastra.',go:['admin','func','Abrir Funcionários'],e:'func'},
 {f:'Administração',t:'2. Defina os acessos',x:'O perfil decide o que cada pessoa vê: Gestor vê e edita tudo; Normal vê só os passos dele.',
  m:'<span class="nd">Gestor<small>vê e edita tudo</small></span><span class="nd">Normal<small>só os seus passos</small></span>',
  l:['Abra Administração › 2. Usuários e clique em “+ Novo usuário”.','Escolha o Funcionário vinculado: nome e login são preenchidos sozinhos.','Defina a senha (mínimo 6 caracteres) e o acesso: Normal ou Gestor.','Deixe “Usuário ativo” marcado e salve.','Para dar acesso a tudo a alguém, edite o usuário e troque para Gestor; vale no próximo login. Senha em branco ao editar mantém a atual.'],
  tip:'Quem já recebeu acesso ao ser cadastrado em Funcionários não precisa de outro aqui.',go:['admin','usr','Abrir Usuários'],e:'usr'},
 {f:'Administração',t:'3. Cadastre as medições',x:'A medição agrupa as concessionárias. Ex.: Regularização Postes tem dentro dela as concessionárias (CPFL, CEMIG…).',
  m:'<span class="nd">Regularização Postes<small>concessionária</small></span><span class="ar">→</span><span class="nd">CPFL<small>concessionária</small></span><span class="tag">Canela</span>',
  l:['Abra Administração › 3. Medições e clique em “+ Nova medição”.','Escreva o nome (ex.: Regularização Postes) e salve.','A medição aparece no menu lateral, e as concessionárias dela ficam dentro dela.','Só dá para excluir uma medição sem concessionárias.'],
  tip:'Cadastre a medição antes da concessionária: a concessionária exige uma medição.',go:['admin','cls','Abrir Medições'],e:'cls'},
 {f:'Administração',t:'4. Cadastre a concessionária',x:'A concessionária fica dentro de uma medição e vem antes do fluxo: nome, itens, diretório, cor e prazo.',
  m:'<span class="nd">CPFL<small>prazo 30/12</small></span><span class="tag">Engenho Novo</span><span class="tag">Cachambi</span>',
  l:['Abra Administração › 4. Concessionárias e clique em “+ Nova concessionária”.','Escolha a Medição, escreva o nome (ex.: CPFL) e os itens, um por linha.','Informe o diretório pai, o caminho da pasta na rede (opcional).','Escolha a cor: fluxo, tarefas e cards seguem ela.','Defina o prazo de entrega e salve.','Ela aparece no menu lateral, dentro da medição, com tarefas, concluídas e prazo.'],
  tip:'Cada item vira o título de uma tarefa e o nome da subpasta dentro do diretório pai.',go:['admin','med','Abrir Concessionárias'],e:'med'},
 {f:'Administração',t:'5. Cadastre os campos da tarefa',x:'Defina quais informações podem entrar numa tarefa e o formato de cada uma.',
  m:'<span class="tag">Texto</span><span class="tag">Texto longo</span><span class="tag">Número</span><span class="tag">Data</span><span class="tag">Valor (R$)</span>',
  l:['Abra Administração › 5. Campos da tarefa e clique em “+ Novo campo”.','Dê um nome e escolha o formato: Texto, Texto longo, Número, Data ou Valor (R$).','Salve. Número só aceita dígitos e Valor vira R$ 0,00 sozinho.'],
  tip:'Cadastre os campos antes dos tipos de fluxo, para poder marcá-los lá. Quantidade e Data de repasse já existem.',go:['admin','campos','Abrir Campos da tarefa'],e:'campos'},
 {f:'Administração',t:'6. Crie os tipos de fluxo',x:'O tipo de fluxo liga uma concessionária a seus passos, campos e meta. Os passos formam um diagrama: você diz o que depende de quê.',
  m:'<span class="nd">1 Levantamento</span><span class="ar">→</span><span class="nd">3 DWG<small>junto com 4</small></span><span class="nd">4 Eixo central<small>junto com 3</small></span><span class="ar">→</span><span class="nd">8 Entrega</span><span class="nd">2 Documentação<small>livre</small></span>',
  l:['Abra Administração › 6. Tipos de fluxo e clique em “+ Novo tipo”. É preciso ter uma concessionária antes.','Escolha a concessionária: só aparecem as que ainda não têm fluxo.','Adicione os passos com “+ Passo”. Em cada um, abra “Ordem e dependências”.','Em “Depende de”, marque os passos que precisam estar concluídos antes. Sem nenhum marcado, o passo é livre e pode ser feito a qualquer momento.','Em “Concomitante com”, marque os passos que devem ser feitos juntos: eles são liberados no mesmo momento e formam um bloco. Quem depende de um deles espera o bloco inteiro.','Um passo que ninguém marca como dependência não bloqueia nada (ex.: Documentação). A tarefa só termina quando todos os passos forem concluídos.','Confira o diagrama no fim do formulário, marque os campos de cada passo e defina a meta de entrega (0 = sem meta).'],
  tip:'Os passos do tipo são copiados para cada nova tarefa. Mudar o tipo depois não altera tarefas já criadas. Dependências circulares são bloqueadas.',go:['admin','tipos','Abrir Tipos de fluxo'],e:'tipos'},
 {f:'Trabalhar',t:'7. Crie uma tarefa',x:'Escolha o tipo de fluxo, o item da concessionária e o funcionário de cada passo.',
  m:'<span class="nd cur">CPFL + Cachambi<small>1 · Ana</small></span><span class="ar">→</span><span class="nd">2 · Bruno</span><span class="ar">→</span><span class="nd">3 · Carla</span>',
  l:['Clique em “+ Nova tarefa” (ou aperte N).','Escolha o Tipo de fluxo: os passos aparecem sozinhos.','Escolha o item da concessionária em Título.','Em cada passo, escolha o responsável. Use ↑ ↓ para reordenar, ✕ para remover e “+ Passo” para incluir. Ajuste dependências e passos concomitantes e confira o diagrama.','Preencha os campos e confira a data estimada final e o status.','Clique em Salvar (ou Ctrl+Enter). Os passos livres já ficam liberados para os responsáveis.','Atalho: na aba Concessionárias, dois cliques em um item “que falta” abre o cadastro já preenchido.'],
  tip:'O fluxo é obrigatório: sem passos e sem responsável em todos eles, a tarefa não salva.',go:['painel','','Ir para Todas as tarefas'],e:'tarefa'},
 {f:'Trabalhar',t:'8. Acompanhe em Todas as tarefas',x:'Veja o andamento de tudo, organizado por status, e use os botões do topo para filtrar.',
  m:'<div class="mc" style="--k:#8ea4cf"><b>○ A iniciar</b><i></i></div><div class="mc" style="--k:var(--ac)"><b>◐ Em andamento</b><i></i><i></i></div><div class="mc" style="--k:#c4a5f5"><b>⏸ Aguardando</b><i></i></div><div class="mc" style="--k:var(--ac2)"><b>✔ Concluídas</b><i></i></div><div class="mc" style="--k:#f49ac1"><b>↻ Fixo</b><i></i></div>',
  l:['Os botões Em aberto, Atrasadas e Concluídas, no topo de qualquer aba, levam sempre para Todas as tarefas já filtrando e rolando até as atividades.','Clique de novo no botão ativo para tirar o filtro; “Limpar filtros” tira todos.','Combine com Buscar, Tipo e Funcionário.','As colunas são os status; o gestor arrasta o card para mudar de coluna.','Dentro da coluna, as tarefas ficam por data de entrega; ▾ expande os detalhes.','Atrasadas têm barra vermelha e ⚠. Fixo é para atividades contínuas: nunca atrasa e, no último passo, volta ao primeiro.'],
  go:['painel','','Abrir Todas as tarefas'],e:'painel'},
 {f:'Trabalhar',t:'9. Finalize o passo',x:'Quem tem um passo liberado clica em Finalizar. Isso libera os passos que dependiam dele.',
  m:'<span class="sd on"></span><span class="sd on"></span><span class="sd cur"></span><span class="sd cur"></span><span class="sd"></span><span class="hint">2 concluídos · 2 liberados · 1 aguardando</span>',
  l:['Clique no card para abrir a tarefa.','Preencha os campos do seu passo (salvam sozinhos ao sair do campo).','Clique em “✔ Finalizar meu passo”. Os passos que dependiam dele são liberados; quando todos estiverem concluídos, a tarefa fica concluída.','Registre ocorrências em Anotações.','O cartão mostra o diagrama, os passos liberados agora e os que aguardam liberação. Gestor também usa “Avançar ⏭” e “← Devolver passo” (escolhe qual passo reabrir). Na devolução, Administrativa não altera a nota; Negativa exige observação e reduz a nota.','No rodapé do card, o gestor tem WhatsApp e Copiar e-mail de cada responsável com passo liberado, e Copiar caminho na rede.'],
  tip:'Quando uma tarefa chega na sua vez, o sistema avisa na tela.',e:'card'},
 {f:'Acompanhar',t:'Gestão: o que cobrar hoje',x:'Tela inicial do gestor, com pendências, concessionárias que pedem atenção.',
  m:'<span class="nd">Atrasadas</span><span class="nd">Vencem em até 2 dias</span><span class="nd">Paradas 3+ dias</span>',
  l:['Abra a aba Gestão.','Em “Precisa de ação agora”: atrasadas, vencendo em até 2 dias, paradas há 3 dias ou mais e passos sem responsável.','Cobre pelo WhatsApp: a mensagem já vem pronta e a tarefa vira “Cobrado hoje”.','Para “Passo sem responsável”, abra a tarefa, clique em Editar e escolha quem faz.'],
  go:['gestao','','Abrir Gestão']},
 {f:'Acompanhar',t:'Veja as concessionárias',x:'O menu lateral e a aba Concessionárias mostram o andamento de cada concessionária, agrupadas por medição.',
  m:'<span class="nd">CPFL<small>Tarefas 12 · Cadastradas 8 · Concluídas 5 · Prazo 30/12</small></span>',
  l:['No menu à esquerda, cada medição agrupa suas concessionárias. Clique no nome da concessionária para ver Tarefas, Cadastradas, Concluídas e o prazo; clique na medição para recolher.','Na aba Concessionárias, clique na concessionária para ver itens cadastrados e os que faltam.','Dois cliques em um item que falta abrem “Nova tarefa” já com ele.','Prazo vencido com tarefa aberta marca ⚠ e borda vermelha.'],
  go:['med','','Abrir Concessionárias']},
 {f:'Acompanhar',t:'Por tarefa e por funcionário',x:'Duas formas de olhar a mesma carga de trabalho.',
  m:'<div class="mc" style="--k:var(--ac)"><b>CPFL</b><i></i><i></i></div><span class="pi" style="background:#fde68a">Ana · 3</span><span class="pi" style="background:#bfdbfe">Bruno · 2</span>',
  l:['Por tarefa: cada coluna é um tipo de fluxo e lista os funcionários que têm tarefas dele.','Clique no nome do funcionário para ver os cards dele naquele tipo.','Por funcionário: cada coluna tem os post-its de uma pessoa; ⇕ expande ou recolhe todos.','Clique em um card para abrir a tarefa.'],
  go:['tarefa','','Abrir Por tarefa']},
 {f:'Cuidar',t:'Seus dados ficam no banco',x:'Tudo o que você cadastra é salvo online e todos veem a mesma informação.',
  m:'<span class="nd">Você salva</span><span class="ar">→</span><span class="nd">Banco online</span><span class="ar">→</span><span class="nd">Todos veem</span>',
  l:['Cada alteração é enviada sozinha; a barra mostra “Supabase conectado”.','Sem internet, as alterações aguardam e são enviadas quando a conexão voltar.','Quem está logado vê o que os outros salvaram em poucos segundos.','Não feche a página enquanto aparecer “Alterações pendentes”.'],e:'banco'},
 {f:'Cuidar',t:'Conforto visual e atalhos',x:'Ajuste a tela e trabalhe mais rápido pelo teclado.',
  m:'<span class="nd">◐ Tema</span><span class="nd">Aa Tamanho</span><span class="kb">N</span><span class="kb">T</span><span class="kb">/</span><span class="kb">1–7</span><span class="kb">Ctrl</span>+<span class="kb">Enter</span><span class="kb">Esc</span>',
  l:['◐ alterna entre Escuro e Glass. Aa aumenta o texto (100%, 110%, 120%).','N cria tarefa, T troca o tema, / busca.','1 a 7 abrem as abas: Gestão, Todas as tarefas, Por tarefa, Por funcionário, Concessionárias, Administração e Passo a passo.','Ctrl+Enter salva, Esc fecha a janela e ← → navegam neste passo a passo.'],
  tip:'Os atalhos não funcionam enquanto você digita em um campo.'},
 {f:'Erros',t:'Possíveis erros e como resolver',x:'Todos os avisos que o sistema pode mostrar, o motivo e o que fazer. Toque em um erro para ver a solução.',all:1,
  l:['Leia a mensagem do aviso: quase sempre ela diz o que falta.','Procure a mensagem no grupo da etapa e siga “O que fazer”.','Se o erro persistir depois de recarregar (F5), avise quem mantém o sistema com o texto exato do aviso.']}];
function guiaView(){
  const n=GUIA.length,g=GUIA[gStep],last=gStep===n-1;let ph='';
  const menu=GUIA.map((x,i)=>{const h=x.f!==ph?`<div class="gph">${x.f}</div>`:'';ph=x.f;return h+`<button type="button" data-gs="${i}" ${i===gStep?'aria-current="step"':''}><b>${i<gStep?'✓':i+1}</b><span>${x.t}</span></button>`}).join('');
  const errs=g.all?`<h3 class="gh">Erros por etapa</h3>${Object.values(ERR).map(o=>`<h4 class="geh">${o.n}</h4>${errHtml(o.l)}`).join('')}`:g.e?`<h3 class="gh">Possíveis erros neste passo</h3>${errHtml(ERR[g.e].l)}`:'';
  return `<div class="alay"><aside class="amenu gmenu" aria-label="Passos">${menu}</aside>
  <section class="gcard apane" aria-live="polite"><div class="gtop"><span class="gpill">${g.f}</span><span class="hint">Passo ${gStep+1} de ${n}</span></div><span class="mbar" style="--k:var(--act);--w:${Math.round((gStep+1)/n*100)}%"><i></i></span>
  <h2>${g.t}</h2><p class="gx">${g.x}</p>${g.m?`<div class="mk" aria-hidden="true">${g.m}</div>`:''}
  <h3 class="gh">Como fazer</h3><ol class="gl">${g.l.map(i=>`<li><span>${i}</span></li>`).join('')}</ol>
  ${g.tip?`<div class="gtip"><b>Dica:</b> ${g.tip}</div>`:''}${errs}${g.go?`<button type="button" class="btn pri" data-go="${g.go[0]}|${g.go[1]}">${g.go[2]} →</button>`:''}
  <div class="gnav"><button type="button" class="btn" id="gp" ${gStep?'':'disabled'}>← Anterior</button><span class="sp"></span><button type="button" class="btn ${g.go?'':'pri'}" id="gn">${last?'Concluir ✔':'Avançar →'}</button></div></section></div>`}
function bindGuia(){
  document.querySelectorAll('[data-gs]').forEach(b=>b.onclick=()=>{gStep=+b.dataset.gs;render()});
  $('#gp').onclick=()=>{if(gStep>0){gStep--;render()}};
  $('#gn').onclick=()=>{if(gStep<GUIA.length-1)gStep++;else{view='painel';gStep=0}render()};
  document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{const[v,sec]=b.dataset.go.split('|');view=v;if(sec)adminSec=sec;render()})}
let adminSec='func';
const AX=new Set();
const axHead=(k,n,b='')=>{const o=AX.has(k);return `<div class="th"><h3>${esc(n)}</h3>${b}<button type="button" class="tgl" data-ax="${esc(k)}" aria-expanded="${o}" aria-label="${o?'Recolher':'Expandir'} ${esc(n)}">${o?'▴':'▾'}</button></div>`};
const ASEC=[['func','Funcionários'],['usr','Usuários'],['cls','Medições'],['med','Concessionárias'],['campos','Campos da tarefa'],['tipos','Tipos de fluxo']];
function medPane(){
  const C=[...(S.medicoes||[])].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  return `<div class="admin"><div class="ahead"><div><h2>Medições</h2><p class="hint">Cadastre primeiro a medição (ex.: Regularização Postes). Cada concessionária fica dentro de uma medição e aparece agrupada por ela no menu lateral, nas listas e nos textos.</p></div><button class="btn pri" id="ncl">+ Nova medição</button></div>
  <div class="tgrid">${C.map(c=>{const M=(S.concessionarias||[]).filter(m=>m.medicao===c.id);return `<article class="tcard${AX.has('k:'+c.id)?' open':''}" style="--c:var(--ac)">${axHead('k:'+c.id,c.nome,`<button class="btn" data-ek="${c.id}" aria-label="Editar medição ${esc(c.nome)}">Editar</button>`)}<div class="tb"><dl><dt>Concessionárias</dt><dd>${M.map(m=>`<span class="tag">${esc(m.nome)}</span>`).join('')||'<span class="hint">Nenhuma concessionária nesta medição</span>'}</dd></dl></div></article>`}).join('')||'<div class="empty" style="grid-column:1/-1">Nenhuma medição cadastrada. Crie a primeira para poder cadastrar concessionárias.</div>'}</div></div>`}
function openMedicao(id){
  const c=(S.medicoes||[]).find(x=>x.id===id)||{nome:''},isNew=!id;
  const [d,close]=dlg(`<form method="dialog"><div class="dh"><h2>${isNew?'Nova medição':'Editar medição'}</h2><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db"><div class="full"><label for="kn">Nome da medição *</label><input type="text" id="kn" required value="${esc(c.nome)}"><div class="hint">Ex.: Regularização Postes. As concessionárias cadastradas para ela ficam dentro dela.</div></div></div>
  <div class="df"><button class="btn pri">Salvar medição</button>${isNew?'':'<span class="sp"></span><button type="button" class="btn dan" id="dl">Excluir</button>'}</div></form>`,'#f2c14e');
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const nm=d.querySelector('#kn').value.trim();if(!nm)return;
    if(S.medicoes.some(x=>x.id!==id&&nk(x.nome)===nk(nm))){toast('Já existe uma medição com este nome');return}
    const o=isNew?{id:'cl'+Date.now()}:c;o.nome=nm;if(isNew)S.medicoes.push(o);await save();close();render()};
  if(!isNew)d.querySelector('#dl').onclick=async()=>{if((S.concessionarias||[]).some(m=>m.medicao===id)){toast('Mova ou exclua antes as concessionárias desta medição');return}if(await fxAsk({t:'Excluir medição',m:'Excluir esta medição?',ok:'Excluir',dan:1})){S.medicoes=S.medicoes.filter(x=>x.id!==id);await save();close();render()}};
  d.querySelector('#kn').focus();
}
const byMed=L=>{const C=[...(S.medicoes||[])].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),g=C.map(c=>({c,L:L.filter(x=>(x.m||x).medicao===c.id)}));const rest=L.filter(x=>!C.some(c=>c.id===(x.m||x).medicao));if(rest.length)g.push({c:{id:'',nome:'Sem medição'},L:rest});return g};
function concPane(){
  const card=m=>`<article class="tcard${AX.has('m:'+m.id)?' open':''}" style="--c:${m.cor||'var(--ac)'}">${axHead('m:'+m.id,m.nome,`<button class="btn" data-em="${m.id}" aria-label="Editar concessionária ${esc(m.nome)}">Editar</button>`)}<div class="tb"><dl><dt>Medição</dt><dd><span class="tag">${esc(medNm(m.medicao))||'<span class="hint">Sem medição</span>'}</span></dd><dt>Itens</dt><dd>${m.itens.map(i=>`<span class="tag">${esc(i)}</span>`).join('')||'<span class="hint">Sem itens</span>'}</dd><dt>Prazo de entrega</dt><dd>${m.prazo?fmt(m.prazo):'<span class="hint">Sem cadastro</span>'}</dd><dt>Diretório pai</dt><dd>${esc(m.dir)||'<span class="hint">Sem cadastro</span>'}</dd><dt>Fluxo</dt><dd>${S.tipos.some(y=>y.conc===m.id)?'Cadastrado':'<span class="hint">Ainda sem fluxo</span>'}</dd></dl></div></article>`;
  const G=byMed(S.concessionarias||[]).filter(g=>g.L.length||g.c.id);
  return `<div class="admin"><div class="ahead"><div><h2>Concessionárias</h2><p class="hint">Cada concessionária fica dentro de uma medição. Cadastre a medição antes (aba Medições), depois a concessionária, os itens (títulos das tarefas) e o diretório pai.</p></div><button class="btn pri" id="nm">+ Nova concessionária</button></div>
  ${G.map(g=>`<section class="mcs"><h3>${esc(g.c.nome)}</h3><div class="tgrid">${g.L.map(card).join('')||'<div class="empty" style="grid-column:1/-1">Nenhuma concessionária nesta medição.</div>'}</div></section>`).join('')||'<div class="empty">Nenhuma concessionária cadastrada.</div>'}</div>`}
function openConc(id){
  if(!(S.medicoes||[]).length){toast('Cadastre uma medição primeiro');view='admin';adminSec='cls';render();return}
  const m=(S.concessionarias||[]).find(x=>x.id===id)||{nome:'',dir:'',itens:[],medicao:''},isNew=!id;
  const [d,close]=dlg(`<form method="dialog"><div class="dh"><h2>${isNew?'Nova concessionária':'Editar concessionária'}</h2><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db">${isNew&&(S.concessionarias||[]).length?'<div class="full"><button type="button" class="btn" id="cclone">Clonar</button></div>':''}<div class="full"><label for="mk">Medição *</label><select id="mk" required><option value="">— escolha a medição —</option>${[...S.medicoes].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=>`<option value="${c.id}" ${c.id===m.medicao?'selected':''}>${esc(c.nome)}</option>`).join('')}</select><div class="hint">A concessionária fica dentro da medição. Ex.: Regularização Postes.</div></div>
  <div class="full"><label for="mn">Nome da concessionária *</label><input type="text" id="mn" required value="${esc(m.nome)}"><div class="hint">É o nome que o fluxo e as tarefas vão usar. Ex.: CPFL</div></div>
  <div class="full"><label for="mi">Itens (um por linha) *</label><textarea id="mi" rows="6" required placeholder="Engenho Novo&#10;Engenho de Dentro&#10;Cachambi">${esc(m.itens.join('\n'))}</textarea><div class="hint">Cada item é uma tarefa da concessionária: o total de itens é o total de tarefas, e cada um vira uma opção de título ao criar a tarefa.</div></div>
  <div class="full"><label for="md">Diretório pai (caminho na rede)</label><input type="text" id="md" placeholder="\\\\servidor\\projetos\\CPFL" value="${esc(m.dir)}"><div class="hint">O botão “Copiar caminho na rede” da tarefa copia este caminho + o título do item (mesmo nome da pasta).</div></div>
  <div class="full"><label id="mcl">Cor da concessionária</label><div class="hint">É a única cor que você escolhe: o fluxo, as tarefas e os cards seguem esta cor.</div><div class="sw" role="radiogroup" aria-labelledby="mcl">${COLORS.map(c=>`<label><input type="radio" name="mc" value="${c}" ${c===(m.cor||COLORS[0])?'checked':''}><span style="--c:${c}"></span><span class="sr">Cor ${c}</span></label>`).join('')}</div></div>
  <div class="full"><label for="mp">Prazo de entrega</label><input type="date" id="mp" value="${esc(m.prazo||'')}"><div class="hint">Aparece sempre no card da concessionária, no menu lateral.</div></div></div>
  <div class="df"><button class="btn pri">Salvar concessionária</button>${isNew?'':'<span class="sp"></span><button type="button" class="btn dan" id="dl">Excluir</button>'}</div></form>`,m.cor||COLORS[0]);
  {const cb=d.querySelector('#cclone');if(cb)cb.onclick=()=>{close();cloneConcPick()}}
  d.querySelectorAll('[name=mc]').forEach(r=>r.onchange=()=>d.style.setProperty('--c',r.value));
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const nm=d.querySelector('#mn').value.trim();
    if(S.concessionarias.some(x=>x.id!==id&&nk(x.nome)===nk(nm))){toast('Já existe uma concessionária com este nome');return}
    const it=[...new Set(d.querySelector('#mi').value.split('\n').map(s=>s.trim()).filter(Boolean))];if(!it.length){toast('Informe ao menos um item');return}
    const o=isNew?{id:'m'+Date.now()}:m;o.medicao=d.querySelector('#mk').value;o.nome=nm;o.itens=it;o.dir=d.querySelector('#md').value.trim();o.prazo=d.querySelector('#mp').value;o.cor=d.querySelector('[name=mc]:checked').value;
    if(isNew)S.concessionarias.push(o);S.tipos.filter(y=>y.conc===o.id).forEach(y=>{y.nome=o.nome;y.cor=o.cor});await save();close();render()};
  if(!isNew)d.querySelector('#dl').onclick=async()=>{if(S.tipos.some(y=>y.conc===id)){toast('Exclua antes o fluxo desta concessionária');return}if(await fxAsk({t:'Excluir concessionária',m:'Excluir esta concessionária?',ok:'Excluir',dan:1})){S.concessionarias=S.concessionarias.filter(x=>x.id!==id);await save();close();render()}};
  d.querySelector('#mn').focus();
}
function openFluxoTipo(id){const y=S.tipos.find(x=>x.id===id);if(!y)return;const F=stepsOf(y),G=grp(F),by=byId(F);
  const [d,close]=dlg(`<div class="dh"><div><h2>${esc(tipoLbl(y))}</h2><div class="hint">Diagrama do fluxo</div></div><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div><div class="vb"><div class="fdw">${flowSvg(F,{sub:f=>{const n=needOf(F,G,f,by);return n.length?'após '+n.map(i=>F.findIndex(z=>z.id===i)+1).join(', '):'livre'}})}</div><div class="fleg">Cada seta liga um passo ao que depende dele. Caixa tracejada = passos concomitantes.</div></div>`,y.cor);d.classList.add('view');fdZoom(d)}
function tiposPane(){
  const TF=base().filter(kpiOk),filt=!!(fPessoa||fKpi);
  const uso=y=>TF.filter(t=>t.tipo===y.id).length;
  const lista=S.tipos.filter(y=>fhas(fTipo,y.id)&&(!filt||uso(y)>0));
  return `<div class="admin"><div class="ahead"><div><h2>Tipos de fluxo</h2><p class="hint">Aparecem como lista pronta ao criar uma tarefa.</p></div><button class="btn pri" id="nt">+ Novo tipo</button></div>
  <div class="tgrid">${lista.map(y=>`<article class="tcard${AX.has('t:'+y.id)?' open':''}" style="--c:${y.cor}">${axHead('t:'+y.id,y.nome,`<button class="btn" data-ed="${y.id}" aria-label="Editar tipo ${esc(y.nome)}">Editar</button>`)}<div class="tb"><dl>
  <dt>Passos do fluxo</dt><dd>${(y.steps||[]).map((p,i)=>`<span class="tag">${i+1}. ${esc(p.etapa)}${p.dep.length?' ← '+p.dep.map(d=>y.steps.findIndex(z=>z.id===d)+1).join(','):' · livre'}${p.con.length?' ⇄':''}${p.campos.length?' · '+p.campos.map(fname).join(', '):''}</span>`).join('')||'<span class="hint">Sem passos</span>'}${(y.steps||[]).length?`<button type="button" class="btn" data-fv="${y.id}" style="min-height:34px;padding:4px 10px">Ver diagrama</button>`:''}</dd>
  <dt>Meta de entrega</dt><dd><span class="tag">${metaTxt(y)}</span></dd>
  <dt>Campos extras</dt><dd>${y.campos.filter(k=>campos().some(c=>c.id===k)).map(k=>`<span class="tag">${esc(fname(k))}</span>`).join('')||'<span class="hint">Só os básicos</span>'}</dd>
  <dt>${anyF()?'No filtro':'Em uso'}</dt><dd>${uso(y)} tarefa(s)</dd></dl>
  </div></article>`).join('')||'<div class="empty" style="grid-column:1/-1">Nenhum tipo neste filtro.</div>'}</div></div>`}
function camposPane(){
  return `<div class="admin"><div class="ahead"><div><h2>Campos da tarefa</h2><p class="hint">Cadastre as informações que podem entrar na tarefa e o tipo de cada uma. Depois marque, em cada tipo de fluxo, quais aparecem.</p></div><button class="btn pri" id="nf">+ Novo campo</button></div>
  <div class="tgrid">${campos().filter(c=>!c.fixo).map(c=>`<article class="tcard${AX.has('c:'+c.id)?' open':''}" style="--c:var(--ac2)">${axHead('c:'+c.id,c.nome,`<button class="btn" data-cf="${c.id}" aria-label="Editar campo ${esc(c.nome)}">Editar</button>`)}<div class="tb"><dl><dt>Tipo</dt><dd><span class="tag">${CT[c.tipo]}</span></dd><dt>Formato</dt><dd class="hint">${CH[c.tipo]}</dd></dl></div></article>`).join('')||'<div class="empty" style="grid-column:1/-1">Nenhum campo cadastrado ainda.</div>'}</div></div>`}
function adminView(){
  return `<div class="alay flat"><div class="apane">${adminSec==='cls'?medPane():adminSec==='med'?concPane():adminSec==='campos'?camposPane():adminSec==='func'?funcView():adminSec==='usr'?usrPane():tiposPane()}</div></div>`}
function fitNames(){document.querySelectorAll('.tcard .th h3').forEach(h=>{h.style.fontSize='';h.style.whiteSpace='nowrap';let f=16;while(h.scrollWidth>h.clientWidth+1&&f>11){f-=.5;h.style.fontSize=f+'px'}if(h.scrollWidth>h.clientWidth+1){h.style.whiteSpace='normal';h.style.overflowWrap='anywhere'}})}
addEventListener('resize',()=>{if(view==='admin')fitNames()});
function bindAdmin(){
  fitNames();
  document.querySelectorAll('.tcard .th').forEach(h=>h.onclick=e=>{if(e.target.closest('[data-ed],[data-cf],[data-ec],[data-em],[data-eu],[data-ek],[data-fv]'))return;const b=h.querySelector('[data-ax]'),k=b.dataset.ax,a=h.closest('.tcard'),o=!AX.has(k);o?AX.add(k):AX.delete(k);a.classList.toggle('open',o);b.setAttribute('aria-expanded',o);b.textContent=o?'▴':'▾';b.setAttribute('aria-label',(o?'Recolher ':'Expandir ')+h.querySelector('h3').textContent)});
  document.querySelectorAll('[data-sec]').forEach(b=>b.onclick=()=>{adminSec=b.dataset.sec;render()});
  const q=(i,f)=>{const e=$(i);if(e)e.onclick=f};q('#nt',()=>openTipo());q('#nf',()=>openCampo());q('#nm',()=>openConc());q('#ncl',()=>openMedicao());
  document.querySelectorAll('[data-ek]').forEach(b=>b.onclick=()=>openMedicao(b.dataset.ek));
  document.querySelectorAll('[data-fv]').forEach(b=>b.onclick=()=>openFluxoTipo(b.dataset.fv));
  document.querySelectorAll('[data-em]').forEach(b=>b.onclick=()=>openConc(b.dataset.em));
  document.querySelectorAll('[data-cf]').forEach(b=>b.onclick=()=>openCampo(b.dataset.cf));
  document.querySelectorAll('[data-ed]').forEach(b=>b.onclick=()=>openTipo(b.dataset.ed));
  if(adminSec==='func')bindFunc();if(adminSec==='usr'){if(USR===null)loadUsr();const nu=$('#nu');if(nu)nu.onclick=()=>openUsuario();document.querySelectorAll('[data-eu]').forEach(b=>b.onclick=()=>openUsuario(b.dataset.eu))}}
function dlg(html,color){
  const d=document.createElement('dialog');d.style.setProperty('--c',color);d.innerHTML=html;document.body.appendChild(d);d.showModal();d.querySelectorAll('.vb section>*,.db>*').forEach((e,i)=>e.style.setProperty('--j',Math.min(i,10)));
  const close=()=>{if(d._c)return;d._c=1;if(d._oc){try{d._oc()}catch(e){console.error(e)}}d.classList.add('out');setTimeout(()=>{d.close();d.remove()},170)};d.addEventListener('cancel',e=>{e.preventDefault();close()});d.addEventListener('mousedown',e=>{if(e.target===d)d._bd=1;else d._bd=0});d.addEventListener('click',e=>{if(e.target===d&&d._bd)close()});d.addEventListener('keydown',e=>{if(e.ctrlKey&&e.key==='Enter'){const f=d.querySelector('form');if(f&&f.reportValidity())f.requestSubmit()}});d.querySelector('#x').onclick=close;return[d,close];
}
function openCampo(id){
  const c=campos().find(x=>x.id===id)||{nome:'',tipo:'texto'},isNew=!id;
  const [d,close]=dlg(`<form method="dialog"><div class="dh"><h2>${isNew?'Novo campo':'Editar campo'}</h2><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db"><div class="full"><label for="cnm">Nome do campo *</label><input type="text" id="cnm" required value="${esc(c.nome)}"></div>
  <div class="full"><label for="ctp">Tipo</label><select id="ctp" ${c.fixo?'disabled':''}>${Object.entries(CT).map(([k,l])=>`<option value="${k}" ${k===c.tipo?'selected':''}>${l}</option>`).join('')}</select><div class="hint" id="cth"></div>${c.fixo?'<div class="hint">Este campo é usado nos cálculos de meta; o tipo não muda.</div>':''}</div></div>
  <div class="df"><button class="btn pri">Salvar campo</button>${isNew||c.fixo?'':'<span class="sp"></span><button type="button" class="btn dan" id="dl">Excluir campo</button>'}</div></form>`,'#5eead4');
  const tp=d.querySelector('#ctp'),h=()=>d.querySelector('#cth').textContent=CH[tp.value];tp.onchange=h;h();
  d.querySelector('form').onsubmit=async()=>{const o=isNew?{id:'c'+Date.now()}:c;o.nome=d.querySelector('#cnm').value.trim();if(!c.fixo)o.tipo=tp.value;
    if(isNew)S.campos.push(o);await save();close();render()};
  if(!isNew&&!c.fixo)d.querySelector('#dl').onclick=async()=>{if(await fxAsk({t:'Excluir campo',m:'Excluir este campo? Os valores já preenchidos nas tarefas ficam guardados, mas deixam de aparecer.',ok:'Excluir',dan:1})){S.campos=S.campos.filter(x=>x.id!==id);S.tipos.forEach(y=>y.campos=y.campos.filter(k=>k!==id));await save();close();render()}};
  d.querySelector('#cnm').focus();
}
function cloneTipoPick(){
  const [d,close]=dlg(`<div class="dh"><div><h2>Clonar fluxo</h2><div class="hint">Escolha o fluxo que será copiado (com a concessionária dele).</div></div><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db"><div class="full">${S.tipos.map(y=>`<button type="button" class="btn" data-cl="${y.id}" style="display:block;width:100%;text-align:left;margin:0 0 8px">${esc(tipoLbl(y))} <span class="hint">· ${(y.steps||[]).length} passo(s)</span></button>`).join('')}</div></div>`,COLORS[0]);
  d.querySelector('#x').onclick=close;
  d.querySelectorAll('[data-cl]').forEach(b=>b.onclick=()=>{close();cloneAsk(null,b.dataset.cl)});
}
function cloneConcPick(){
  const L=(S.concessionarias||[]);
  const [d,close]=dlg(`<div class="dh"><div><h2>Clonar concessionária</h2><div class="hint">Escolha a concessionária que será copiada, com itens, cor e fluxo.</div></div><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db"><div class="full">${L.map(m=>`<button type="button" class="btn" data-cl="${m.id}" style="display:block;width:100%;text-align:left;margin:0 0 8px">${esc(concLbl(m))} <span class="hint">· ${(m.itens||[]).length} item(ns)${S.tipos.some(y=>y.conc===m.id)?' · com fluxo':''}</span></button>`).join('')||'<div class="empty">Nenhuma concessionária cadastrada.</div>'}</div></div>`,COLORS[0]);
  d.querySelector('#x').onclick=close;
  d.querySelectorAll('[data-cl]').forEach(b=>b.onclick=()=>{close();cloneAsk(b.dataset.cl,null)});
}
function cloneAsk(mid,yid){
  const y0=yid?S.tipos.find(x=>x.id===yid):null;
  const m0=(S.concessionarias||[]).find(x=>x.id===(mid||(y0&&y0.conc)))||(y0?(S.concessionarias||[]).find(x=>nk(x.nome)===nk(y0.nome)):null);
  const y=y0||(m0?S.tipos.find(z=>z.conc===m0.id):null);
  if(!m0&&!y){toast('Nada para clonar');return}
  const base=m0?m0.nome:y.nome;
  const [d,close]=dlg(`<form method="dialog"><div class="dh"><div><h2>Clonar “${esc(base)}”</h2><div class="hint">Será criada uma cópia idêntica${y?', com todo o fluxo':''}.</div></div><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db"><div class="full"><label for="cln">Nome para salvar *</label><input type="text" id="cln" required autocomplete="off" value="${esc(base)} (cópia)"></div></div>
  <div class="df"><button class="btn pri">Clonar</button></div></form>`,(m0&&m0.cor)||(y&&y.cor)||COLORS[0]);
  d.querySelector('#x').onclick=close;
  const inp=d.querySelector('#cln');inp.focus();inp.select();
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const nm=inp.value.trim();
    if(!nm){toast('Informe o nome');return}
    if((S.concessionarias||[]).some(x=>nk(x.nome)===nk(nm))||S.tipos.some(z=>nk(z.nome)===nk(nm))){toast('Já existe uma concessionária ou fluxo com este nome');return}
    const t=Date.now(),J=o=>JSON.parse(JSON.stringify(o));
    const nm0=m0?{...J(m0),id:'m'+t,nome:nm}:{id:'m'+t,nome:nm,medicao:((S.medicoes||[])[0]||{}).id||'',itens:[],dir:'',prazo:'',cor:y.cor||COLORS[0]};
    if(!S.concessionarias)S.concessionarias=[];S.concessionarias.push(nm0);
    if(y){const mp=new Map((y.steps||[]).map((p,i)=>[p.id,'s'+t+'_'+i]));
      S.tipos.push({...J(y),id:'ty'+t,conc:nm0.id,nome:nm,cor:nm0.cor||y.cor,
        steps:(y.steps||[]).map(p=>({...J(p),id:mp.get(p.id),dep:(p.dep||[]).map(k=>mp.get(k)).filter(Boolean),con:(p.con||[]).map(k=>mp.get(k)).filter(Boolean)}))})}
    await save();close();render();toast('Clonado: '+nm)};
}
function openTipo(id){
  if(!id&&!(S.concessionarias||[]).length){toast('Cadastre uma concessionária primeiro');adminSec='med';render();return}
  const y=S.tipos.find(x=>x.id===id)||{nome:'',cor:COLORS[0],campos:['protocolo','portal','repasse','obs'],steps:[],meta:{v:0,u:'dias'}};const isNew=!id;
  const [d,close]=dlg(`<form method="dialog"><div class="dh"><h2>${isNew?'Novo tipo de fluxo':'Editar tipo'}</h2><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  ${isNew&&S.tipos.length?'<div style="margin:0 0 10px"><button type="button" class="btn" id="tclone">Clonar</button></div>':''}
  ${tabsH([['geral','Geral'],['passos','Passos'],['diagrama','Diagrama']],'geral','Seções do tipo')}
  <div class="db tp" data-tp="geral"><div class="full"><label for="tn">Concessionária (nome do fluxo) *</label><select id="tn" required><option value="">— escolha a concessionária —</option>${S.concessionarias.filter(m=>m.id===y.conc||(!y.conc&&nk(m.nome)===nk(y.nome))||!S.tipos.some(z=>z.conc===m.id&&z.id!==y.id)).map(m=>`<option value="${m.id}" ${m.id===y.conc||(!y.conc&&nk(m.nome)===nk(y.nome))?'selected':''}>${esc(concLbl(m))}</option>`).join('')}</select><div class="hint">Só aparecem concessionárias cadastradas que ainda não têm fluxo. A cor do fluxo e das tarefas vem da concessionária.</div></div>
    <div class="full"><label>Campos que aparecem ao criar a tarefa</label><div class="chk">${campos().map(c=>`<label><input type="checkbox" value="${c.id}" ${y.campos.includes(c.id)?'checked':''}>${esc(c.nome)}<span class="ct">${CT[c.tipo]}</span></label>`).join('')}</div>
  <div class="hint">Tarefa, fluxo, status e data estimada sempre aparecem.</div></div>
  <div><label for="mv">Meta de entrega</label><input type="number" min="0" step="any" id="mv" value="${y.meta.v}"></div>
  <div><label for="mu">Unidade</label><select id="mu"><option value="horas">Horas</option><option value="dias">Dias</option><option value="qtd">Quantidade por dia</option></select></div>
  <div class="full hint">Horas e dias calculam a data estimada sozinhos. “Quantidade por dia” usa o campo Quantidade da tarefa (marque-o acima). Use 0 para não ter meta.</div></div>
  <div class="db tp" data-tp="passos" hidden><div class="full"><div id="tpe"></div></div></div>
  <div class="db tp" data-tp="diagrama" hidden><div class="full"><div class="fdw" id="tdv"></div><div class="fleg">Cada seta liga um passo ao que depende dele. Passo sem seta chegando é livre; passo sem seta saindo não bloqueia ninguém. Caixa tracejada = passos concomitantes.</div></div></div>
  <div class="df"><button class="btn pri">Salvar tipo</button>${isNew?'':'<span class="sp"></span><button type="button" class="btn dan" id="dl">Excluir tipo</button>'}</div></form>`,y.cor);
  {const cb=d.querySelector('#tclone');if(cb)cb.onclick=()=>{close();cloneTipoPick()}}
  bindTabs(d);const D=flowDesigner(d.querySelector('#tpe'),stepsOf(y),{people:false,pv:d.querySelector('#tdv')});
  d.querySelector('#mu').value=y.meta.u;
  {const tn=d.querySelector('#tn');tn.onchange=()=>{const m=S.concessionarias.find(x=>x.id===tn.value);if(m&&m.cor)d.style.setProperty('--c',m.cor)}}
  d.querySelector('form').onsubmit=async()=>{
    const o=isNew?{id:'ty'+Date.now()}:y;{const m=S.concessionarias.find(x=>x.id===d.querySelector('#tn').value);o.conc=m.id;o.nome=m.nome;o.cor=m.cor||o.cor||COLORS[0]}{o.steps=D.get().steps;delete o.passos;delete o.pc}
    o.campos=[...d.querySelectorAll('.chk input:checked')].map(i=>i.value);o.meta={v:+d.querySelector('#mv').value||0,u:d.querySelector('#mu').value};
    if(isNew)S.tipos.push(o);await save();close();render()};
  if(!isNew)d.querySelector('#dl').onclick=async()=>{if(await fxAsk({t:'Excluir tipo',m:'Excluir este tipo? As tarefas existentes continuam, sem tipo.',ok:'Excluir',dan:1})){S.tipos=S.tipos.filter(x=>x.id!==id);await save();close();render()}};
  d.querySelector('#tn').focus();
}

/* ---------- Contatos ---------- */
const contactFor=n=>{const C=S.contatos||[],k=nk(n);if(!k)return null;
  return C.find(c=>nk(c.nome)===k)||C.find(c=>nk(shortName(c.nome))===k)||(()=>{const m=C.filter(c=>nk(c.nome).split(' ')[0]===k);return m.length===1?m[0]:null})()};
const WA_IMG='<img class="wai" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAcRElEQVR42tWbeZxdVZXvv2vvc+5Ut+aqVBIJBDIwhAAiAs74iTZOT/NRQzvg/D52S7fCE1ufQ1NEUFrbbm0V2unpc2jRoK0+EBQRB0SMyBDEAAlTJlNJKjXfW/fec/Ze749z7q1zb1Xwvf/eSz7nU1X3nrPP3muv9Vu/NWx4qn+qwi9GA/5//afbLDpqnuqWYy9Ot1hEHBCravCmsa8+44CfO7em0XpF+6zXgkHUgFHBqhqjqHhUFFEVUVEEUMTjEBEFI6KoSgyI94g13gAeVQ8EiAJ4n94D2HRKzogIKiCa86LeqDr1UaxqIsHXRGesBHvXmN57Npc2/O6d8uwJba3lBrfUMmXpxY8aZKu/bs9/9P9HOPb2eVd/24zOb5jINaj5iNgrKAiC4tHWMNo+rEjmG13yZQoYBEXR1pPJ+B4hlUfrM0Qy707+RJOn1QiByTGsBbqj8LAE+e8tj/LX/nL1pTt9U6OlNeASAlAERsXKVv/cJz7x+odt5ZpqUDuhMjuDr1QVUdd6TJG2x9vHXUK26fJEyawUVDKCW+KR7NgZASy8QhPZSvqpKiiGXM7Y3h6CuFhdRfcnd3/9g1fJVvHNzV1qlsK2LcZcdIM78/GrPv54vvrB6enDMF+LEWtErEGS8ZMt6Jh49m9dYq+lbdWLF5mdkbKEoDLv0Y6HO+4TQJ0qOIexgVm2nOPq5Z/eMbj59Sf0nTGpqiKpJkgWMAK5yK3dNfqpvd31y6tjB1yiMtYsPcPMBET+T1Gp4/klvjqWkepTCDc7SJtGGfBewccyNBKujMu/3dF38UuHPrd+Tq9UFRFNFrdtixW5yJ26a+slT5Srl1cPHohRDGJMolLZy6eXpi/q/E6PfcGx72mN0yFfr8nV+lyXeL9feLZzPoIgEuqhg9GB3PSzn37of1wXbsXLDRcZABnVUbOVrfqOfZ9fc33t8R3V+nheGs6osdKa9KJd6lB9bdr3U21nYqhCc06yyAIkwZYUEBN4XRITFmmQNnFpCWVrfqeAxsHAUHB+Y2jLb0694nts22KDrTfsFHsR/lcPj31kvlAvMRPFyeJ9u2HpMbnCwovawan1qxEDGJyPUR+DRoBLVFRs8rO5k9LElxBMSCAGjyaarLR7hayNqD6FoJIxxXsT1yq6M5ardNeuG2Xd+oYAfOjJL6748vzu3Ucah0pEjtb2HMte5S8ZbrKbRgxOHWgMaghtkXW5AU7Jr2BdYQUrggGGbBehBEQac8jNsq8xzq7GQR6qH+SJxlFw9cRRmhwGScbLeoVjepAOQTWxQ/G2d8ic1Ri48J6NW28NAH4yf+jCqaLrohI7xNhFILdo8Vnp+0XOxCI4PM5VCGyZTd3nsLn3GbygtJ7VwSBF8h3P6AKQKqCOKZ1nVzTGbZWd/HB6B3dXd+O0ipgCguDVLzFHSbToqUBX1DsbyX43+yoDtwYCjDWmz48K1QQ5VFMXtOjBY8hEWy8SSS4Xz1EISlw89BLe1f8izi6uTkwgjpiPG0zLLCKCMRZrLEiKc+qJfQQeQiznhKs5d3At/zD4Em6vPMxnxm/mJ7P3oCpYU8Dh2sGxDUGbv/p2/+gx1Oal6s35TjWQIpaBBy6740DuyHNltu5VjFlypaKLdy0jXUOAJwaNeXX/sxgdfg1n5FYTuwZzroYJDF25EtYYiKFSqTIxO0WlXsF7T84GlAol+sp9lLqKYKHhIqpRDXHQY4uowC3VHXx4bBs75nZjglICl9qx+BZWLIFdHiUXSMGXD1+i52wIBAPqunBN1+IXM7ssqEiWvSVfWBPgXJW+oJt/O+4S3tz/fFwUM9GYIheE9JV6qM7V+OPjD3LX3rvZfuBuHpnazcHKIar1ajInsZRMieN6l7Nh6DSeddy5nH/ieaxecSJSFKbrs/hYeXnx6bxwzQZGD3+fT439CMRgxCQmIRlN0KUwQVpg28CZ2+q7jJQI6Ln/knvGwomzZa7m1RizyHaegntYCXDxLKeWVrPthH/g9MLxzDRmwQg9uTKTEzP88P6b+PaD3+auqXupdM1Bdx5KRcgXweQSL6Ae4ggaVZirQiViuDbABYPP4S1Pv5gXbryAsCtgrlElLyGlsMh3pn7LW/d8jrpvYEwO32TqndrQ9lOVXChWS+MbagMbpEhI732X3DuWG3+6zNW8ipjFqr80v7dicW6Wc7rWc9PqKxg2PUy5ObryRfI+x007fsbVd3+S7bO/h6Ey9C/DdJWRMI8aAyKoLLhaUUW8gvNovY6fnYAjh5EJz+bhC7li04c5a93pzEVV4tjRF3bzs8oDvPqJa5jzdYyEeHyGdJEB6XRDfUYA9cIGKUlIzz3vum8sN35WogFi2lFel3R5RizeVdlYOomfr/kovVpi1lfpyXcxMznLFb/8Z/597DvocA7TP4zkingrqBUQk6HP0qGmCt6D94jzmMjh5yvokb0MzHZx9cYP8c7nvoO6qTEf1RkM+7it+kde+dhW6qqoMUlgrceIOZoa4ItHNzRKp2UAz7fTXO/BuxSefRvVNQrq6ozYAX6w+oMMmHKy+FyZx/bv4eU/uIjrpv8nrFuFWX4ivqsLlw/QMIAgAGvApFdTGCJg0staCCyaC3DFHNrbgz3hVCZO6OKShy/nkh/8N+I5RzEsMN6Y4kVdG/nSCe/G+zpGyVBh2ql2E9+aawFMKinFd/D6NsFoBiA9gkddna+c8G7W5FcwHVfozXfzxIE9vOanb2R76SGC1SejpRw+R/uiE264sPuiCxoqLFBqI8n9gYEwwOUCpGcYu/o0vjT1Df7rze/BVRzFXJ7JaIaLB17A3y17Fa4xjcVk5psVQBqLpBjh5yMxKY2V1kLJPNgmkOR7i8E1JnnH8Et4Re8zmahPUwoLTE1O8cY7LmFn758JVpxMnAsgsOku047QrfH9Yv+dxZyWQBKt0JzBFfMEJ5zGDfM38v47rqboC1hrqDbmuWb5G1hbWIWPK4mIFwVamSDJN913IhVZtNvq2nYd9RgF7+YZyY1w1fKLqUbzWGMII8t77rqSP4Q7CUbWEofpzhnBiBCISXZlyfBV2wXTFtFlbjUkWpSzxAVLcNxavnD0a3zl/m/TE5SpujrdFPn4yjejrkb7hnZEkBmNMG1JhkUvbzcJEdBojkuXvYoV4RBVV6Mn6ObrD3yX66dvwA4dT2xNsvNisBLgXY04msTFFRIH07nojhBbfXtgkwVkITULi8/nkKFhPrj74+z886OUgyIT8Qybe5/Nc8pn4aNZbIsaZ22/HRzNAvqmk/AZMPQLqirqcXGNZfmn8dbBv2IurlAM8uw9sp/RXf+K9A6iQT5VeUHE4uJZNnav4bNrPsC7VmxBXSWT80sXKh2LlSVorXQkX4zBW4MpDTCRm+GqHZ/GxgGexEQvG3k1OFnQAp81BX8MATQX3rYjLr18Is2owpb+57MiP0RN65RMiW/s/i777X5MaRBvPGISLyEKV6++hO3rP8u7+17B51f+DWfk10NcYyG35jM7lNEAsmboOyatLZD0FkzPSv7z6C3ctf8PdIddzLgKF/Y9g7XFk3BRFdNm0q7JBTJeoCmBFjh0IGc6gPcONGBz37k4F5MzOY7OHuWbh/4X0jOY+nfBIPhohveveC0fXvHX1OOIQ9EEovC2oQvRqI60udvMtShTRDuC0w6QKiC5PI2i41v7f0hOc0Qa021LvLrvmRBVMcgxAT0jAJawwYUJGAUfVzk+v5ynF9cyG1UpByV+e+QedrMHCr34FOydiyhIkbf1b6JWrwNQMDka2mBz//l0mzIurifZH99BVDpTZCyV9sqkx8QkYUl3L7fM3snY3GEKNsS5iE3dZ4IH7+NUu5/KBEDbVE192yWqEFU5J38SA7aHSCOMM9w2fhfkFGuDNOWlENcYkTIDpkzDR5ikGELV1zkhGOElPc+EaA7blt/LmELbu13H36mmZDTCiyJhF/v9Ae6Z+CNFW2LOzXNy/ngGzQA+rqWBYWb3/QIwmjZ3tGgyiSsUFKKIMwonIiTRV6VeYfvsDggLCZ9vvsB7tFHHOZcBPMV7j4rn9cteDC5Cm4vzGeD1/hjzyGwMHZggSTRKEPPb6XsJvKXuIpaFfazPrYSolrC9NizRbN64WRDx7WrmF5iTeg9eWFN4GqqO0AQcrU/xZOMgBPk0O6Ot+8bnJ5iMZgklQAGnnsBYDAHb926HKErvXSqj7Bczt0W4QJuZqAA2x4OV3URxBJKY3Ym5FRA1Eg3ObFBLqzNeQNtspON372IQGMn34/AEBIxHU0xKBSTXmqyqYrBU40ker+4hZ0JidYgIVgP+/ufv4xMPfwxjC3jXaNsRjpVoYvGC20CtuZ8mx8H6ODXXwCCIMazMDaT5yIw5dXAbkxIMWZKc+KwrFPK2iMdjxTDrq0S+kYYTC88YI0CDnx7+TRIxqqcYFNk5uYtrn7gO6RnOmEyHqndenVqhi/FpwTUaJrVKXRsICRfpC0rt3IYO7VrAAL846Mn8VPUgniANYUUkFUqW0ibSdeogLPH9Az/m0PwRCkGeSlRlXe+JbDz5RWjOICZYuqhCFns6A5lOAWkm7ZWE6g1RXKsI25ycawfQDl5hFnQo8zLfbm9CQiTqLkIkycgamwMJMu5yoQpsgy4OzD/G15/4Pt22TC2u0xN28c9nfhhsESOaZt7ThbUSrp003P+Fq/l88mxecgRiW3Xmuq8lIX12QxcCMDUuVNOGrksxM3ySu/B1ZuNpBEvsY3qDMnlbAHXJ9xkKq6JIsY9/2Xktj07toTvXxUQ0zYW95zG6/jJiP0dgbCrd7Ps6Cp50BEqiCxedYXtMvy1TMGGihShHounFJMpnBF0myR9kSU87ynrAJRrgG+ybP4jFEPmIoXw/g02QyWqPJL7Z5Lo4HO/nQ/ddQ9l2YcQw0ZjkylVv5R3Hv4WofoSgVSLTtjSWTSNI08oadZhGc5Mk+SyRveO40nIKNoeiNFzM/uqfE4xaCt8WeEBa61/EwhYEI4kvY+f0owgQ+ZihsJdTek4CopYdZSM3Zzy2bzk37P8mn//T1xgs9OPUMVmf4bpVl/Gu499OHM+gqlhJaaRRTBpExdEk3tWxadZ3EVvMuNCkNcBxZv8pGLEYDLPxHLtnHgeClHN02L8AzGEkW4VdFKAkC/Leg4TcM/EAlbgGCDkb8sLB89r6FNo8iTH40GJ6Brn8D+/lx4/fznBhiIZvMBtXuG71+/j8KR+lKAEurmAkIJAA76a5eOWruWbdf2d9+URcPIv3dazYDv+4wFWcxmBLPKf/LBraIG8K7Kn8mScr+8Hk0+abjiSP9wJNExCWSB01zcEnEgyK/HHmIZ6c20cpKFF3NV4ycD5B0IPzcXseIc3xqRUolmiUQt5w++u45fFfMVwYwuM42pji7wY385szv8rLlr8UL544PsSbVr6Gb544yvuHXsdvT/syXz7t42zs2YiLZmkVbDOCTvKTNU7sOolzuk5lLq7SFRT5w8QO6tEE1oaJCbQ22bcVFdPMUYd0aGdeCliToxqPc+fRuykHRWbiCmd2reXZ3WdBVME2iyXSbgreGky5l5lCnS0/fTU3PHITw8UhROBwY4LTwxP40UlX87NTPsP1p36W645/P1ONGY5E01gnvKPvZdx52nV8au2HKNkCglvQOBSjFho1XjP4AvqCHmKNMQi3HrkDgmZL0FKmnVRLkyaBTobl/eLoTIAwZNvBm3A+qdwbhb9ZsbkdZLQjbrcGHxhM7yCV7ojX/3wLH7vz05RtL735MpONGSbnp3he4Qwu6n4RUdzAo+RtiAocaUxQr9e5fPkbWJdbhcbVNFWY2L73EYWgjzcOv5zZRoVSUOTR2b3cOn4XFLpbHqE969SZEsvm5LWDhaU3OnFIoZtfHfk1d4/voDsoc7QxzeaBCzh/4Lm4eDYBszaXlZpXYPE5i/T1w0CJj9z7Xl7zw9exc+xxhgqDFMMC036O8Wiy1XOmmlSMVZX+fC/bnriRnQfuxEg+qUHisSbAR5O8eeWrOKO4lpl4lm5b5jt7bmS2to8gyKN0pNi0kwoLaDMp2kZEskws+d3YHLGf4193XkdOcvjUBj950t8ThiVU45Q0dSQ0RdI8fwjdZezyZdx0+Hs8//rn8f5br2Tf1CEGcv30F3opBCFi0rY59Yx0DfPw5ONc9rvLiFxEs4ZpCImdY2XvKfzjCe9kOpqlaAvsm/0zX9j9RSRfwEvKM8SnjLAD3wAbYsm//bS/rXB0uTQautAc0dESI0krozEhDx++j2f1P4tT+tcyFc+woWsNs77GnUd/jbWFROpZc8gWgaygBmyxSD2Y4649t/PtB77LzoOPomop2TI5kyc0IVHs+OmTv+Atv3oT+2UfpnsEbwxCgJUQj3L9aZ/g6YW1TEUzDOUHufr+f+HWsR9he5fjm4WWBaaWaKY1YqQ4v8x2XRss7lzTpVtM0gSmhDlc0OATj/wbLzzuuRgRnHesk+UQNyBICYtkS2upJE1qIrkczhgk7Md0xUzOjPOtfV/mW499mT4Z5mn5lZTL3RzlKI9WH4L+ENM/grcgYrFAXD/ENRuu4uW95zNWPcxgoZ/fH76P6x65FtO7DG+0RfNaGEZGuwX8fCxBe1Z4iSyt0raTYg0S5ljWswybsizvlduO3JmyRr+4yKGy0HQhJkGeXIBagwsDpLgMMxijtTpT1QmmakegARRBjutFil34XIixSSNtHI3zvrWX8YFlb+Dw/Dj5IEfsPO+5+3Lmc1VMcSCJOIWULWY0QKWtDSBITDQtjWlnbK4dUVf6fM5y4fJNeOewYhmvT3DX+F1gLUlXcFI8lRaJTRIlLTxoMjtJMpsaWFwYQr6A9PQmVWIV1Bh8CAQ5AlMm1gikwdZTruBDK97OofmjGIH+sI933nEpd0/8Ejt8PM6mu58C6YJrlkUYECRJlwz6N6vJzV3LtJgI4HxEqTTCeQNnU42rFG2RHdP3cqC6h6C3H8XgJcZpNXGnEiJSxJgkilTtsMem5zDJi1UldauCEUtgQmI8sa+yuvtkPrf2A7y8fD6H5scRgYH8MKPb/4kvP/JZguFlSWHGSDu5k2yTlC7EFS0NWNT14jOtr9oKSIwYXFzjjL6zOam4iunGNMOmzPape/FSxfsS+AYD3SfywoHz2Vg4iZ+M/5rfTf4O5xpg8hgTYiRp51Vtb2kRkdRqFCce7xr4uEJ3cYh3rHojH1j5doboZqx2hHyQo9v2cMWdV3PNA1dglw/g8oWkfCadeYpMHj3lf6oqvuYkkGwwlAG7ZFK+DcNEBOI6z+k+i7yEIBDj+PHRX1Mq9PGCFS9m88iFXNj3bFYFIxiFywdfzy/m/sC3jvyYX0z+jiPRGJ56hoiahSZHdUCclr9KnNx9Cpv7N3Hx8Cs5NX8SM9EsR/QoA/l+anHMJbddylceuRa7vBtfKKLN3e/sYfLS0fLjEVS8zaUgSCZpIH4xq0sF4tWBhDy/75nUXQOLZSae5d3r3srGnmtYkz8B62EurnA4OtrCjRcXz+WlJz2LA26c+2q7uLvyEA9WHmZfY4zpeB58jCXHcNjNicXjObN8CueVN3B6YQ19lJmtz3Jw/hClXImR/Ai/P3A/l91+Kdsn78AuL+NKXRDaBdXPdogiHY1TC6ZgCoFKSfL0/PKl943pY2fJbCPTIdLemZl0YNdZZgb5/bk30mNKOBxGDD1hmWpcYy6uEpiAnkIZIwHOOyzCTDRLI44o2BxlWyJnQhyeqtapuwgkCYOLEpIjhwFqvs6cm8fhKIUlSrbEk5MH+MLdX+LanZ+hVqxgh3pwhSLkcmAypXgyrY7N8vpCm7+SC8SY/olV9eUbAoNQVOPaqsGteFkWKKMxOF/hvIFNrAiHmYgnMWrwREwyTTlfZnlhhEMzR7jlgZ/z/R3/yXj1CBc/82I2rb+A5T0jOGKq8TxT0SzOe8SnVFTAEzFDDRXFmoBiWGCwMIBznkfGH+P6B7bx1Qe+wlhjLyw3mJ4+XK4AQZgsPttoSWebr2QwLQHd0Bt9Xv+5PqhrA4ncQxTMMxTvkxq2tqekVNPcumPT0POTigxKOV8kZ/PMzM9x52N/4OZHbubHj9zIrrE/pTEA/HTfjazuX89frbuQC1ZfwOkjpzLSPUxPvpfQBlhj0tMOilNPPaozUZniobFHuX/sfm59/Gf86uDtzMVT0A/2aSV8vojPhUkrjZGOlnrTUWnubHdUVIQeLRz95rPfNxdEeFbanvuekPBibeXlFvfbxrEjNN1sGnwWuUKerlqZ+/f9iZt3/oSbd9/Ejol7ExbYDbIWTGCT7rdYebK6iy/9aRdfuudzlOhhVdfxHN+3mpU9I3R19WFtQOxqTMwdZd/0AfZOP8mB+X2ojaEM9IEtF/D5PC4Xgg1TVmnaGsAWd4o2heNbrTlqnCNftMWqvTcUUw0ANvWd8ZP7j+7+xFwQWOI0HsgUSA2CjyucWjyT+njEJ+79NDc+ehPb9/+WuFGDbuA4sMUQzQs+NDixLe0x/R4TgZ+PqVZneGT+QR4ZfxAOZzTVZE5IdQFDYIsB5HP40OKCzMJbvUYZui1LqX9GCL6VqRIrgawvLL95L4owiildlfcn3nrhbX8KH9skM3NOtYki2iJA6huUowL+iRmqU1PJzpTB5gI0NPicSScYJIto2WRSVMEpeId4h3hNsbVZP5SFhm4haXUzgpoATGrjxmYCG5M5nyCLOzmls4aeDC4Yr8VQhqKBg7tO/sZpA2vWTAdbNmyRG/wNXDx0wcc/dmjPpjkE8bGqiDRdoqbgMadTMDSHHQghEHwoOJtLev7TpufWwpsup8nADKC2Fea2t7SmC2styLQ6TZKxsmO3IfoCccsKpBXTpLS7yf/FeGM0ODe/5lNDa9ZOb9mGTUYbHTWFj/6Tf94t/+Xff27u+Vut+Ug1DpMXulZAJN6Bc0mOsBndNXekhbKyOJgik19oRQi6uGWutaHZvjlZoMudn2umzS4ryDYzSHXMh7EWXbCxdvxdD7zyly8UpNE6yqeqIleK6JVa2vijF3zvwdKeC4mIJI4CFZXF1ZqOxZrOwwuSuT97AswtOlvQfvRO2o/hiIA2myk1AxSkn9PeR6RZxpcRgAkiCnE4Mt310I9P/uJLzjn9eXubJ8fSaFBUVRGROT2krz17+4uv/2PX3lfEDQcN7yTGqKi0dkA6W1w7jE+XaLSW9n6Mxbbbydqy79KlzymotOcdRNtaYkWsV6tCyYerZgfv/3Tfezefc/rz9o7qqBER33Z0VkR0dHTUyIjMqeqWl/3gr6+8q/H7y6bK1bxiQCXtm0UWjq4d67Bkx2SQTFwOxzyGp7L4AOZTnRNiic9FmqFroCa2xTnPKbVVX7/3pN/9g5wtR7Zs22K3ylZ3zKOzC6ph+fDnPnL2Nn546Vh+8rVzI1EpKrgFG27zvaYd1LKqqceq/2fzAyzhu7Xd3tvaa48x/fQ5GwnFQ8b1V4u3nC/P+PSNl/zg9hp1RkdHzdatW/1fPDvcxAS24kMC/vEjV6z7SdfPnjOWGz9jLphfV/Gz2arwQs5VO1rrO0+Bds5WsqfOOo7Tij71Gcw0od/aCzFalILp0vy+3qj3/nNmn7n921d/bUedBoximgcl/69On4+OjhpGF1LnBsGS1N7+X/zfnFvbUcVtW+xTrfF/Awd2sntpqHFUAAAAAElFTkSuQmCC" alt="" width="20" height="20">';
const waLink=(num,msg)=>{let g=String(num).replace(/\D/g,'');if(g.length<=11)g='55'+g;return 'https://wa.me/'+g+'?text='+encodeURIComponent(msg)};
function funcView(){
  const PF=Object.fromEntries((S.tipos||[]).map(y=>[y.id,perf(y.id)]));
  const TF=base().filter(kpiOk),filt=!!(fTipo||fKpi);
  const nTar=c=>TF.filter(t=>{return (t.status!=='done'||fKpi==='done')&&holders(t).some(h=>contactFor(h.pessoa)?.id===c.id)}).length;
  const lista=S.contatos.filter(c=>(!fPessoa||fhas(fPessoa,'c:'+c.id))&&(!fFunc||c.cargo===fFunc)&&(!filt||nTar(c)>0));
  const sem=people().filter(p=>!fFunc&&!contactFor(p)&&(!fPessoa||fhas(fPessoa,pkey(p)))),cg=cargos();
  return `<div class="admin"><div class="ahead"><div><h2>Funcionários</h2><p class="hint">No fluxo da tarefa, escolha o funcionário pela tag (Primeiro + Último nome).</p></div><button class="btn pri" id="nc">+ Novo funcionário</button></div>
  ${cg.length?`<div class="bar"><label for="fl-f">Função</label><select class="fsel" id="fl-f"><option value="">Todas</option>${cg.map(c=>`<option value="${esc(c)}" ${c===fFunc?'selected':''}>${esc(c)}</option>`).join('')}</select></div>`:''}
  ${sem.length?`<p class="hint" style="margin:-6px 0 16px">Aparecem em fluxos, mas sem cadastro: ${sem.map(p=>`<button class="btn" style="min-height:32px;padding:4px 10px;margin:2px" data-new="${esc(p)}">+ ${esc(p)}</button>`).join('')}</p>`:''}
  <div class="tgrid">${lista.map(c=>`<article class="tcard${AX.has('f:'+c.id)?' open':''}" style="--c:var(--ac2)">${axHead('f:'+c.id,c.nome,`<button class="btn" data-ec="${c.id}" aria-label="Editar ${esc(c.nome)}">Editar</button>`)}<div class="tb">${c.cargo?`<div class="hint" style="margin:-6px 0 0">${esc(c.cargo)}</div>`:''}<dl>
  <dt>WhatsApp</dt><dd>${esc(c.whatsapp)||'<span class="hint">Sem cadastro</span>'}</dd>
  <dt>E-mail</dt><dd>${esc(c.email)||'<span class="hint">Sem cadastro</span>'}</dd>
  <dt>Desempenho</dt><dd>${(S.tipos||[]).map(y=>{const o=PF[y.id].get('c:'+c.id);return o&&(o.f||o.neg||o.adm)?`<span class="tag">${esc(y.nome)} ${pl({pct:o.pct})}</span>`:''}).join('')||'<span class="hint">Sem histórico</span>'}</dd>
  <dt>${fKpi==='done'?'Concluídas com ele':filt?'No filtro':'Com ele agora'}</dt><dd>${nTar(c)} tarefa(s)</dd></dl>
  </div></article>`).join('')||`<div class="empty" style="grid-column:1/-1">${S.contatos.length?'Nenhum funcionário neste filtro.':'Nenhum funcionário cadastrado ainda.'}</div>`}</div></div>`;
}
function bindFunc(){const ff=$('#fl-f');if(ff)ff.onchange=()=>{fFunc=ff.value;render()};$('#nc').onclick=()=>openContato();document.querySelectorAll('[data-ec]').forEach(b=>b.onclick=()=>openContato(b.dataset.ec));document.querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>openContato(null,b.dataset.new))}
function openContato(id,pre){
  const c=S.contatos.find(x=>x.id===id)||{nome:pre||'',cargo:'',whatsapp:'',email:''},isNew=!id;
  const [d,close]=dlg(`<form method="dialog"><div class="dh"><h2>${isNew?'Novo funcionário':'Editar funcionário'}</h2><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db"><div class="full"><label for="cn">Nome do funcionário *</label><input type="text" id="cn" list="pl" required value="${esc(c.nome)}"><datalist id="pl">${people().map(p=>`<option value="${esc(p)}">`).join('')}</datalist>
  <div class="hint">No fluxo da tarefa ele aparece como Primeiro + Último nome. Se houver dois iguais, aparece o nome completo.</div></div>
  <div class="full"><label for="cg">Função</label><input type="text" id="cg" placeholder="Opcional" value="${esc(c.cargo)}"></div>
  <div><label for="cw">WhatsApp (com DDD)</label><input type="text" inputmode="tel" id="cw" placeholder="(21) 99999-9999" value="${esc(c.whatsapp)}"></div>
  <div><label for="ce">E-mail</label><input type="text" inputmode="email" id="ce" placeholder="nome@empresa.com" value="${esc(c.email)}"></div>
  ${isNew?`<div class="full chk"><label><input type="checkbox" id="ca" checked>Criar acesso ao sistema agora (usuário Normal)</label></div>
  <div class="full row" id="cab"><div style="flex:1"><label for="cl">Usuário (login)</label><input type="text" id="cl" autocapitalize="none" autocomplete="off" value="${esc(first(c.nome))}"></div><div style="flex:1"><label for="cs">Senha de acesso</label><input type="password" id="cs" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></div></div>`:''}</div>
  <div class="df"><button class="btn pri">Salvar funcionário</button>${isNew?'':'<span class="sp"></span><button type="button" class="btn dan" id="dl">Excluir</button>'}</div></form>`,'#5eead4');
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const w=d.querySelector('#cw').value,nm=d.querySelector('#cn').value;
    if(!first(nm)){toast('Informe o nome do funcionário');return}
    const mk=isNew&&d.querySelector('#ca').checked,lg=mk?nk(d.querySelector('#cl').value).replace(/\s+/g,''):'',pw=mk?d.querySelector('#cs').value:'';
    if(mk&&(!lg||pw.length<6)){toast('Para criar o acesso, informe o usuário e uma senha de pelo menos 6 caracteres');return}
    const o=isNew?{id:'c'+Date.now()}:c;o.nome=d.querySelector('#cn').value.trim();o.cargo=d.querySelector('#cg').value.trim();o.whatsapp=d.querySelector('#cw').value.trim();o.email=d.querySelector('#ce').value.trim();
    if(isNew)S.contatos.push(o);await save();
    if(mk){try{await rpc('fx_usuario_salvar',{p_token:ME.tk,p_id:null,p_usuario:lg,p_nome:o.nome,p_perfil:'normal',p_contato_id:o.id,p_ativo:true,p_senha:pw});USR=null;toast('Funcionário e acesso salvos no banco')}catch(err){toast('Funcionário salvo, mas o acesso falhou: '+err.message)}}
    close();render()};
  if(!isNew)d.querySelector('#dl').onclick=async()=>{if(await fxAsk({t:'Excluir contato',m:'Excluir este contato?',ok:'Excluir',dan:1})){S.contatos=S.contatos.filter(x=>x.id!==id);await save();close();render()}};
  if(isNew){const ca=d.querySelector('#ca'),cab=d.querySelector('#cab'),cl=d.querySelector('#cl');let tc=!!cl.value;ca.onchange=()=>cab.style.display=ca.checked?'':'none';cl.oninput=()=>tc=true;d.querySelector('#cn').addEventListener('input',e=>{if(!tc)cl.value=first(e.target.value)})}
  d.querySelector('#cn').focus();
}

const cargos=()=>[...new Set((S.contatos||[]).map(c=>c.cargo).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
function perf(tid){
  const m=new Map();
  S.tasks.filter(t=>t.tipo===tid).forEach(t=>(t.ev||[]).forEach(e=>{const k=pkey(e.p);let o=m.get(k);if(!o)m.set(k,o={f:0,neg:0,adm:0});if(e.k==='f')o.f++;else if(e.tp==='neg')o.neg++;else o.adm++}));
  m.forEach(o=>{const j=Math.max(o.f,o.neg+o.adm),c=Math.max(0,o.f-o.neg-o.adm);o.pct=j?Math.round((c-o.neg)/j*100):0});return m}
function rank(tid){const P=perf(tid);return(S.contatos||[]).map(c=>{const k='c:'+c.id,o=P.get(k)||{f:0,pct:0};return{c,pct:o.pct,f:o.f}})
  .sort((a,b)=>b.pct-a.pct||b.f-a.f||a.c.nome.localeCompare(b.c.nome,'pt-BR'))}
const pl=r=>r.pct>0?'▲ +'+r.pct+'%':r.pct<0?'▼ '+String(r.pct).replace('-','−')+'%':'● 0%';
const stepsOf=y=>(y.steps||[]).map(e=>({id:e.id,etapa:e.etapa,campos:[...(e.campos||[])],dep:[...(e.dep||[])],con:[...(e.con||[])]}));
/* ---------- Diagrama do fluxo (SVG) ---------- */
/* Zoom e arraste dentro do próprio diagrama (roda do mouse, pinça, botões, teclado) */
function fdZoom(root){
  root.querySelectorAll('.fdw').forEach(w=>{
    const svg=w.querySelector('svg.fdg');if(!svg||w.classList.contains('fdz'))return;
    const vb=svg.viewBox.baseVal,W=(vb&&vb.width)||+svg.getAttribute('width')||600,H=(vb&&vb.height)||+svg.getAttribute('height')||400;
    const t=document.createElement('div');t.className='fdt';t.style.width=W+'px';t.style.height=H+'px';
    svg.replaceWith(t);t.appendChild(svg);svg.style.cssText=`width:${W}px;height:${H}px;min-width:0;max-width:none;margin:0`;
    const c=document.createElement('div');c.className='fdc';
    c.innerHTML='<button type="button" class="btn" data-z="out" aria-label="Diminuir zoom" title="Diminuir (−)">−</button><button type="button" class="btn" data-z="one" aria-label="Zoom 100%" title="Tamanho real (1)"><span class="fdp">100%</span></button><button type="button" class="btn" data-z="in" aria-label="Aumentar zoom" title="Aumentar (+)">+</button><button type="button" class="btn" data-z="fit" aria-label="Ajustar à tela" title="Ajustar à tela (0)">⤢ Ajustar</button>';
    w.classList.add('fdz');w.tabIndex=0;w.appendChild(c);
    const lab=c.querySelector('.fdp');let s=1,x=0,y=0,touched=false;
    const ap=()=>{t.style.transform=`translate(${x}px,${y}px) scale(${s})`;lab.textContent=Math.round(s*100)+'%'};
    const fit=()=>{const cw=w.clientWidth,ch=w.clientHeight;if(!cw||!ch)return;s=Math.max(.2,Math.min((cw-24)/W,(ch-24)/H,1.6));x=(cw-W*s)/2;y=Math.max(12,(ch-H*s)/2);touched=false;ap()};
    const zoomAt=(f,px,py)=>{const n=Math.min(5,Math.max(.2,s*f));f=n/s;x=px-(px-x)*f;y=py-(py-y)*f;s=n;touched=true;ap()};
    const k=()=>(w.getBoundingClientRect().width/w.offsetWidth)||1;
    const mid=()=>[w.clientWidth/2,w.clientHeight/2];
    const act=a=>{if(a==='fit')fit();else if(a==='in')zoomAt(1.25,...mid());else if(a==='out')zoomAt(.8,...mid());else if(a==='one'){const[px,py]=mid();zoomAt(1/s,px,py)}};
    c.addEventListener('click',e=>{const b=e.target.closest('[data-z]');if(b)act(b.dataset.z)});
    w.addEventListener('wheel',e=>{e.preventDefault();const r=w.getBoundingClientRect(),q=k();zoomAt(Math.exp(-e.deltaY*(e.deltaMode===1?.05:.0015)),(e.clientX-r.left)/q,(e.clientY-r.top)/q)},{passive:false});
    const P=new Map();let d0=0;
    w.addEventListener('pointerdown',e=>{if(e.target.closest('.fdc'))return;P.set(e.pointerId,[e.clientX,e.clientY]);try{w.setPointerCapture(e.pointerId)}catch(_){}w.classList.add('pan');d0=0});
    w.addEventListener('pointermove',e=>{if(!P.has(e.pointerId))return;const o=P.get(e.pointerId),q=k();P.set(e.pointerId,[e.clientX,e.clientY]);
      if(P.size===1){x+=(e.clientX-o[0])/q;y+=(e.clientY-o[1])/q;touched=true;ap()}
      else if(P.size===2){const[a,b]=[...P.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(d0){const r=w.getBoundingClientRect();zoomAt(d/d0,((a[0]+b[0])/2-r.left)/q,((a[1]+b[1])/2-r.top)/q)}d0=d}});
    const up=e=>{P.delete(e.pointerId);d0=0;if(!P.size)w.classList.remove('pan')};
    w.addEventListener('pointerup',up);w.addEventListener('pointercancel',up);
    w.addEventListener('dblclick',e=>{if(!e.target.closest('.fdc'))fit()});
    w.addEventListener('keydown',e=>{const m={'+':'in','=':'in','-':'out','_':'out','0':'fit','1':'one'}[e.key];if(m){e.preventDefault();act(m)}});
    new ResizeObserver(()=>{if(!touched)fit()}).observe(w);fit();
  });
}
let _fdn=0;
function flowSvg(F,o={}){
  if(!F.length)return'<div class="empty">Nenhum passo ainda.</div>';
  const st=o.st||null,G=grp(F),by=byId(F),W=196,H=60,GX=26,GY=50,P=18,gid=f=>G.get(f.id)[0],tr=(x,n)=>{x=String(x||'');return x.length>n?x.slice(0,n-1)+'…':x};
  const lv=new Map(),vs=new Set();
  const Lv=g=>{if(lv.has(g))return lv.get(g);if(vs.has(g))return 0;vs.add(g);let m=0;G.get(g).forEach(mid=>(by.get(mid).dep||[]).forEach(d=>{const x=by.get(d);if(!x)return;const dg=gid(x);if(dg!==g)m=Math.max(m,Lv(dg)+1)}));lv.set(g,m);return m};
  const roots=[...new Set(F.map(gid))];roots.forEach(Lv);
  const rows=[];roots.forEach(g=>{const k=lv.get(g);(rows[k]=rows[k]||[]).push(g)});
  const R=[...rows].map(r=>r||[]),ord=new Map(F.map((f,i)=>[f.id,i])),cnt=R.map(r=>r.reduce((a,g)=>a+G.get(g).length,0)),mw=Math.max(...cnt)*W+(Math.max(...cnt)-1)*GX;
  const pos=new Map();
  R.forEach((r,ri)=>{
    const bc=g=>{const xs=[];G.get(g).forEach(m=>(by.get(m).dep||[]).forEach(d=>{const q=pos.get(d);if(q&&!G.get(g).includes(d))xs.push(q.x+W/2)}));return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:1e9};
    if(ri)r.sort((a,b)=>{const x=bc(a),y=bc(b);return x===y?ord.get(a)-ord.get(b):x-y});
    const mem=r.flatMap(g=>G.get(g)),w=mem.length*W+(mem.length-1)*GX,x0=P+(mw-w)/2;
    mem.forEach((id,k)=>pos.set(id,{x:x0+k*(W+GX),y:P+16+ri*(H+GY)}));
  });
  const w=mw+2*P,h=P+16+R.length*(H+GY)-GY+P,mk='ar'+(++_fdn);let out='';
  roots.forEach(g=>{const L=G.get(g);if(L.length<2)return;const a=pos.get(L[0]),b=pos.get(L[L.length-1]);const xs=L.map(i=>pos.get(i).x);const x0=Math.min(...xs)-8,x1=Math.max(...xs)+W+8;out+=`<rect class="gf" x="${x0}" y="${a.y-20}" width="${x1-x0}" height="${H+30}" rx="14"/><text class="gt" x="${x0+10}" y="${a.y-7}">⇄ concomitantes</text>`});
  F.forEach(f=>(f.dep||[]).forEach(d=>{const a=pos.get(d),b=pos.get(f.id);if(!a||!b||G.get(f.id).includes(d))return;const x1=a.x+W/2,y1=a.y+H,x2=b.x+W/2,y2=b.y,ym=(y1+y2)/2;out+=`<path class="ed" d="M${x1} ${y1} C${x1} ${ym} ${x2} ${ym} ${x2} ${y2-2}" marker-end="url(#${mk})"/>`}));
  F.forEach((f,i)=>{const q=pos.get(f.id),s=st?st[i]:'',sub=o.sub?o.sub(f,i):f.pessoa||'',nm=(f.etapa||'').trim()||'Passo';
    out+=`<g class="nd ${s}" transform="translate(${q.x} ${q.y})"><title>${esc(i+1+'. '+nm+(sub?' · '+sub:''))}</title><rect class="bx" width="${W}" height="${H}" rx="11"/><circle cx="21" cy="${H/2}" r="12"/><text class="nm" x="21" y="${H/2+4.5}">${s==='done'?'✓':i+1}</text><text x="40" y="26">${esc(tr(nm,19))}</text><text class="t2" x="40" y="45">${esc((s==='wait'?'🔒 ':'')+tr(sub,22))}</text></g>`});
  return `<svg class="fdg" role="img" aria-label="Diagrama do fluxo: ${esc(F.map((f,i)=>i+1+'. '+((f.etapa||'').trim()||'Passo')).join(', '))}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="min-width:${Math.min(w,540)}px"><defs><marker id="${mk}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="ah" d="M0 0L10 5L0 10z"/></marker></defs>${out}</svg>`;
}
/* ---------- Editor de fluxo: passos, dependências, concomitância, responsável ---------- */
function flowDesigner(host,F0,o={}){
  let F=F0.map(f=>({...f,id:f.id||SID(),dep:[...(f.dep||[])],con:[...(f.con||[])],campos:[...(f.campos||[])]}));
  const OP=new Set(),nm=f=>(f.etapa||'').trim()||'Passo',num=id=>F.findIndex(x=>x.id===id)+1;
  const lab=id=>{const x=F.find(z=>z.id===id);return x?num(id)+'. '+nm(x):''};
  const sumOf=f=>{const G=grp(F),by=byId(F),nd=needOf(F,G,f,by),mem=(G.get(f.id)||[]).filter(x=>x!==f.id),p=[];
    p.push(nd.length?'🔒 Só é liberado depois de: '+nd.map(lab).join(', '):'▶ Livre: pode ser feito a qualquer momento');
    if(mem.length)p.push('⇄ Feito junto com: '+mem.map(lab).join(', '));
    const bl=F.filter(x=>x.id!==f.id&&needOf(F,G,x,by).includes(f.id));
    if(!bl.length&&F.length>1)p.push('não bloqueia nenhum outro passo');
    return p.join(' · ')};
  const pv=()=>{const e=o.pv||host.querySelector('[data-pv]');if(!e)return;const G=grp(F),by=byId(F);
    e.innerHTML=flowSvg(F,{sub:(f)=>o.people?(f.pessoa?shortName(f.pessoa):'— sem responsável —'):(needOf(F,G,f,by).length?'após '+needOf(F,G,f,by).map(num).join(', '):'livre')})};
  const sm=()=>host.querySelectorAll('[data-sm]').forEach(e=>{const f=F[+e.dataset.sm];if(f)e.textContent=sumOf(f)});
  const draw=()=>{const G=grp(F),R=o.people?rank(o.tid()):[];
    host.innerHTML=`<label>${o.people?'Fluxo · quem faz cada passo':'Passos do fluxo'}</label>
    <div class="fl">${F.map((f,i)=>{const same=G.get(f.id)||[],kd='d:'+f.id,kc='c:'+f.id,kf='f:'+f.id;
      return `<div class="fr st" data-i="${i}"><b class="n">${i+1}</b><input type="text" class="fi" value="${esc(f.etapa)}" placeholder="Nome do passo" aria-label="Passo ${i+1}">${o.people?`<select class="fsel fw" aria-label="Responsável pelo passo ${i+1}"><option value="">— responsável —</option>${R.map(r=>`<option value="${esc(chipName(r.c))}" ${f.pessoa&&pkey(f.pessoa)==='c:'+r.c.id?'selected':''}>${esc(chipName(r.c))} · ${pl(r)}</option>`).join('')}${f.pessoa&&!contactFor(f.pessoa)?`<option selected>${esc(f.pessoa)}</option>`:''}</select>`:''}<button type="button" class="btn" data-u="${i}" aria-label="Subir">↑</button><button type="button" class="btn" data-d="${i}" aria-label="Descer">↓</button><button type="button" class="btn dan" data-r="${i}" aria-label="Remover">✕</button>
      <div class="fsm" data-sm="${i}">${esc(sumOf(f))}</div>
      <details class="fc" data-k="${kd}" ${OP.has(kd)?'open':''}><summary>Ordem e dependências (${f.dep.filter(x=>!same.includes(x)).length} depende · ${same.length-1} junto)</summary>
        <div class="dpg"><label>Depende de</label><div class="hint">Este passo só é liberado quando os marcados estiverem concluídos. Sem nenhum marcado, ele é livre e não espera ninguém.</div><div class="sk">${F.filter(x=>x.id!==f.id&&!same.includes(x.id)).map(x=>`<label><input type="checkbox" data-dp="${f.id}" value="${x.id}" ${f.dep.includes(x.id)?'checked':''}>${num(x.id)}. <span data-nm="${x.id}">${esc(nm(x))}</span></label>`).join('')||'<span class="hint">Não há outros passos para escolher.</span>'}</div></div>
        <div class="dpg"><label>Concomitante com</label><div class="hint">Passos feitos juntos: são liberados no mesmo momento e formam um bloco. Quem depende de um deles espera o bloco inteiro.</div><div class="sk">${F.filter(x=>x.id!==f.id).map(x=>`<label><input type="checkbox" data-cn="${f.id}" value="${x.id}" ${f.con.includes(x.id)||(x.con||[]).includes(f.id)?'checked':''}>${num(x.id)}. <span data-nm="${x.id}">${esc(nm(x))}</span></label>`).join('')||'<span class="hint">Não há outros passos.</span>'}</div></div>
      </details>
      <details class="fc" data-k="${kf}" ${OP.has(kf)?'open':''}><summary>Campos para preencher (${(f.campos||[]).length})</summary><div class="sk">${campos().map(c=>`<label><input type="checkbox" data-c="${i}" value="${c.id}" ${(f.campos||[]).includes(c.id)?'checked':''}>${esc(c.nome)}</label>`).join('')}</div></details></div>`}).join('')||'<div class="empty">Escolha um tipo de fluxo ou adicione passos</div>'}</div><button type="button" class="btn" data-add>+ Passo</button>
    ${o.people?`<div class="hint">Lista de responsáveis ordenada pelo desempenho neste fluxo (▲ acima de 0, ● regular, ▼ abaixo). Empate: quem fez mais serviços; depois ordem alfabética.</div>${R.length?'':'<div class="hint">Cadastre funcionários em Administração › Funcionários.</div>'}`:'<div class="hint">Em cada passo, marque os campos que quem estiver nele poderá preencher ou editar.</div>'}
    ${o.pv?'':'<div class="fdp"><label>Diagrama do fluxo</label><div class="fdw" data-pv></div><div class="fleg">Cada seta liga um passo ao que depende dele. Passo sem seta chegando é livre; passo sem seta saindo não bloqueia ninguém. Caixa tracejada = passos concomitantes.</div></div>'}`;
    host.querySelectorAll('details[data-k]').forEach(e=>e.addEventListener('toggle',()=>{e.open?OP.add(e.dataset.k):OP.delete(e.dataset.k)}));
    host.querySelectorAll('.fr').forEach(r=>{const i=+r.dataset.i,f=F[i];
      r.querySelector('.fi').oninput=e=>{f.etapa=e.target.value;host.querySelectorAll('[data-nm="'+f.id+'"]').forEach(x=>x.textContent=nm(f));sm();pv()};
      const s=r.querySelector('select.fw');if(s)s.onchange=e=>{f.pessoa=e.target.value;pv()}});
    host.querySelectorAll('[data-u],[data-d]').forEach(b=>b.onclick=()=>{const i=+(b.dataset.u??b.dataset.d),j=b.dataset.u!==undefined?i-1:i+1;if(j<0||j>=F.length)return;[F[i],F[j]]=[F[j],F[i]];draw()});
    host.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>{const x=F.splice(+b.dataset.r,1)[0];F.forEach(f=>{f.dep=f.dep.filter(i=>i!==x.id);f.con=f.con.filter(i=>i!==x.id)});draw()});
    host.querySelectorAll('input[data-c]').forEach(b=>b.onchange=()=>{const i=+b.dataset.c,s=new Set(F[i].campos||[]);b.checked?s.add(b.value):s.delete(b.value);F[i].campos=[...s];b.closest('details').querySelector('summary').textContent='Campos para preencher ('+s.size+')'});
    host.querySelectorAll('input[data-dp]').forEach(b=>b.onchange=()=>{const f=F.find(x=>x.id===b.dataset.dp),old=f.dep,s=new Set(old);b.checked?s.add(b.value):s.delete(b.value);f.dep=[...s];if(cyc(F)){f.dep=old;b.checked=!b.checked;toast('Isso criaria um ciclo: um passo ficaria esperando por ele mesmo.');return}OP.add('d:'+f.id);draw()});
    host.querySelectorAll('input[data-cn]').forEach(b=>b.onchange=()=>{const f=F.find(x=>x.id===b.dataset.cn),g=F.find(x=>x.id===b.value),a=[...f.con],c=[...g.con];
      if(b.checked){if(!f.con.includes(g.id))f.con.push(g.id);if(!g.con.includes(f.id))g.con.push(f.id)}else{f.con=f.con.filter(i=>i!==g.id);g.con=g.con.filter(i=>i!==f.id)}
      if(cyc(F)){f.con=a;g.con=c;toast('Isso criaria um ciclo: um passo ficaria esperando por ele mesmo.');draw();return}OP.add('d:'+f.id);draw()});
    host.querySelector('[data-add]').onclick=()=>{F.push({id:SID(),etapa:'',pessoa:'',campos:[],dep:F.length?[F[F.length-1].id]:[],con:[]});draw();const fi=host.querySelectorAll('.fi');fi[fi.length-1].focus()};
    pv()};
  draw();
  return{redraw:draw,
    setSteps:l=>{F=l.map((e,i)=>({id:e.id||SID(),etapa:e.etapa,campos:[...(e.campos||[])],dep:[...(e.dep||[])],con:[...(e.con||[])],pessoa:(F[i]||{}).pessoa||''}));draw()},
    get:()=>{if(o.people){const L=F.filter(f=>f.pessoa||(f.etapa||'').trim()),ids=new Set(L.map(f=>f.id));
        return{fluxo:L.map(f=>({...f,pessoa:f.pessoa||'Sem responsável',etapa:(f.etapa||'').trim()||'Passo',dep:f.dep.filter(x=>ids.has(x)),con:f.con.filter(x=>ids.has(x))}))}}
      const L=F.filter(f=>(f.etapa||'').trim()),ids=new Set(L.map(f=>f.id));
      return{steps:L.map(f=>({id:f.id,etapa:f.etapa.trim(),campos:[...f.campos],dep:f.dep.filter(x=>ids.has(x)),con:f.con.filter(x=>ids.has(x))}))}}};
}
const flowEd=(host,t,tid,pv)=>flowDesigner(host,t.fluxo.map(f=>({...f,pessoa:f.pessoa==='Sem responsável'?'':f.pessoa})),{people:true,tid,pv});
/* ---------- Finalizar / voltar passo ---------- */
let _lk=false;
async function avancar(id,dir,x){if(_lk)return;_lk=true;try{await avancar0(id,dir,x)}finally{_lk=false}}
async function sbFresh(id){
  if(!SB.on||!SB.ok||SB.dirty)return true;
  try{const r=await fetch(sbU('fx_tarefas')+'?select=id,dados,pos&id=eq.'+encodeURIComponent(id),{headers:sbH()});if(!r.ok)return true;
    const [row]=await r.json(),i=S.tasks.findIndex(x=>x.id===id);if(!row||i<0)return true;
    const rem=JSON.parse(JSON.stringify(row.dados));migTask(rem);
    if(canon(JSON.parse(JSON.stringify(S.tasks[i])))===canon(rem))return true;
    S.tasks[i]=rem;if(LAST.tasks)LAST.tasks.set(id,sig({dados:row.dados,pos:i}));return false}catch(e){return true}}
async function avancar0(id,dir,x){
  if(!(await sbFresh(id))){toast('Esta tarefa foi atualizada por outra pessoa. Confira os passos atuais e tente de novo.');render();return}
  const t=S.tasks.find(x=>x.id===id);if(!t||!t.fluxo.length)return;const sid=x&&x.sid;let txt;
  const pre=act(t),ids=new Set(pre.map(f=>f.id)),h0=holder(t);
  if(dir>0){
    const c=t.fluxo.find(f=>f.id===sid)||pre[0];
    if(!c||!ids.has(c.id)||(dir===2&&!isAdm()))return;if(!isAdm()&&!mine(c)){toast('Este passo não é seu');return}
    c.ok=Date.now();c.por=user;if(dir===1)(t.ev=t.ev||[]).push({k:'f',i:t.fluxo.indexOf(c),p:c.pessoa,t:Date.now()});
    const todos=t.fluxo.every(f=>f.ok);
    if(todos){if(t.status==='fixo')t.fluxo.forEach(f=>{delete f.ok;delete f.por});else t.status='done'}else if(t.status==='todo')t.status='doing';
    const nx=t.status==='done'?[]:act(t).filter(f=>!ids.has(f.id)||f.id===c.id&&t.status==='fixo'),pp=[...new Set(nx.map(f=>shortName(f.pessoa)))].join(', ');
    t.mov={t:Date.now(),tp:dir===1?'f':'a',de:c.etapa,dp:c.pessoa,para:nx.map(f=>f.etapa).join(' + '),pp,fim:t.status==='done'?1:0,por:user};
    txt=(dir===1?`✔ ${c.etapa} finalizado`:`⏭ ${c.etapa} avançado por ${user}`)+(nx.length?` → liberado: ${t.mov.para} (${pp})`:t.status==='done'?' · tarefa concluída':' · aguardando os demais passos');
    toast(nx.length?(dir===1?'Passo finalizado → ':'Passo avançado → ')+pp:t.status==='done'?'Tarefa concluída ✔':'Passo finalizado ✔')
  }else{
    if(!isAdm())return;const f=t.fluxo.find(z=>z.id===sid);if(!f||!f.ok)return;
    const antes=h0||f,tp=(x&&x.tp)||'adm',ob=(x&&x.obs)||'',ix=t.fluxo.indexOf(f);
    if(t.status==='done')t.status='doing';delete f.ok;delete f.por;
    t.mov={t:Date.now(),tp:'d',de:antes.etapa,dp:antes.pessoa,para:f.etapa,pp:f.pessoa,neg:tp==='neg'?1:0,por:user};(t.ev=t.ev||[]).push({k:'d',i:ix,p:f.pessoa,tp,obs:ob,por:user,t:Date.now()});
    txt=`Devolvido ao passo ${ix+1} (${f.etapa}) · ${f.pessoa} · ${tp==='neg'?'negativa':'administrativa'}`+(ob?': '+ob:'')
  }
  (t.notas=t.notas||[]).push({u:user,t:Date.now(),txt});await save();render();
}
function pedirDevolucao(id){
  const t=S.tasks.find(x=>x.id===id);if(!t)return;const D=t.fluxo.filter(f=>f.ok).sort((a,b)=>b.ok-a.ok);if(!D.length){toast('Nenhum passo concluído para devolver');return}
  const [d,close]=dlg(`<form method="dialog"><div class="dh"><h2>Devolver passo</h2><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="db"><div class="full"><label for="ds">Qual passo voltar?</label><select id="ds">${D.map(f=>`<option value="${f.id}">${t.fluxo.indexOf(f)+1} · ${esc(f.etapa)} (${esc(f.pessoa)})</option>`).join('')}</select><div class="hint">Só esse passo é reaberto. Os passos que dependem dele voltam a ficar bloqueados enquanto ele não for concluído de novo.</div></div>
  <div class="full"><label id="dml">Motivo da devolução *</label><div class="chk" role="radiogroup" aria-labelledby="dml"><label><input type="radio" name="dm" value="adm" checked>Administrativa</label><label><input type="radio" name="dm" value="neg">Negativa (serviço com problema)</label></div></div>
  <div class="full"><label for="do">Observação <span id="dq"></span></label><textarea id="do" rows="4"></textarea><div class="hint">Devolução negativa exige observação e reduz a nota de desempenho de quem fez o passo neste fluxo. A administrativa não altera a nota.</div></div></div>
  <div class="df"><button class="btn pri">Confirmar devolução</button></div></form>`,'#ff8f86');
  const rq=()=>d.querySelector('#dq').textContent=d.querySelector('[name=dm]:checked').value==='neg'?'*':'(opcional)';rq();d.querySelectorAll('[name=dm]').forEach(r=>r.onchange=rq);
  d.querySelector('form').onsubmit=async e=>{e.preventDefault();const tp=d.querySelector('[name=dm]:checked').value,ob=d.querySelector('#do').value.trim(),sid=d.querySelector('#ds').value;
    if(tp==='neg'&&!ob){toast('Informe a observação da devolução negativa');d.querySelector('#do').focus();return}close();await avancar(id,-1,{tp,obs:ob,sid})};
}
async function reatribuir(id,from,to,toName){
  if(!isAdm()||!id||!to||from===to)return;
  if(!(await sbFresh(id))){toast('Esta tarefa foi atualizada por outra pessoa. Tente de novo.');render();return}
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  const L=act(t).filter(f=>pkey(f.pessoa)===from);
  if(!L.length){toast('Este card não tem passo liberado com esse funcionário para passar adiante');return}
  const old=L[0].pessoa,et=L.map(f=>f.etapa).join(' + ');L.forEach(f=>{f.pessoa=toName});
  t.mov={t:Date.now(),tp:'e',de:et,dp:old,para:et,pp:shortName(toName),fim:0,por:user};
  (t.notas=t.notas||[]).push({u:user,t:Date.now(),txt:`⇄ ${et} passou de ${old} para ${toName}`});
  await save();render();toast(`${et} → ${shortName(toName)}`)}
async function abrirDir(id){
  const t=S.tasks.find(x=>x.id===id),p=t&&dirOf(t);if(!p)return;
  toast(await copyText(p)?'Caminho copiado: '+p:'Não foi possível copiar. Caminho: '+p)}
/* ---------- Visualização do card ---------- */
const tabsH=(L,act,label)=>`<div class="tabs" role="tablist" aria-label="${label}">${L.map(([k,l,n])=>`<button type="button" role="tab" id="tb-${k}" aria-selected="${k===act}" aria-controls="tp-${k}" tabindex="${k===act?0:-1}" data-tab="${k}">${l}${n?` <em>${n}</em>`:''}</button>`).join('')}</div>`;
function bindTabs(d,cb){
  const show=k=>{d.querySelectorAll('[data-tab]').forEach(b=>{const on=b.dataset.tab===k;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1});d.querySelectorAll('[data-tp]').forEach(p=>p.hidden=p.dataset.tp!==k);if(cb)cb(k)};
  d.querySelectorAll('[data-tab]').forEach(b=>{b.onclick=()=>show(b.dataset.tab);b.onkeydown=e=>{if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft')return;e.preventDefault();const L=[...d.querySelectorAll('[data-tab]')],i=L.indexOf(b),n=L[(i+(e.key==='ArrowRight'?1:L.length-1))%L.length];n.focus();show(n.dataset.tab)}});
  d.addEventListener('invalid',e=>{const p=e.target.closest&&e.target.closest('[data-tp]');if(p&&p.hidden)show(p.dataset.tp)},true);
  return show}
function openView(id,tab0){
  const t=S.tasks.find(x=>x.id===id);if(!t)return;
  const y=tipoOf(t),n=t.fluxo.length,A=isAdm(),SF=new Set(t.fluxo.flatMap(f=>f.campos||[])),st=tstate(t),AC=act(t),mA=AC.filter(mine),dn=st.filter(x=>x==='done').length,G=grp(t.fluxo);
  const stepTxt=t.status==='done'?'✔ Concluída':n?`${dn} de ${n} passos concluídos`:'Sem fluxo';
  const kv=[...campos().filter(c=>c.tipo!=='longo'&&!SF.has(c.id)).map(c=>[c.nome,fmtVal(c,t[c.id])]),['Entrega prevista',fmt(t.final)+(late(t)?' ⚠ atrasada':'')],['Status',COLS.find(x=>x[0]===t.status)?.[1]],['Meta',y?metaTxt(y):'']].filter(([,v])=>v&&v!=='—');
  const dt=x=>new Date(x).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  const num=f=>t.fluxo.indexOf(f)+1,cc=f=>{const m=(G.get(f.id)||[]).filter(x=>x!==f.id).map(x=>t.fluxo.find(z=>z.id===x)).filter(Boolean);return m.length?' · ⇄ junto com '+m.map(z=>num(z)+'. '+esc(z.etapa)).join(', '):''};
  const wait=t.status==='done'?[]:t.fluxo.filter((f,i)=>st[i]==='wait');
  const agRow=f=>{const can=A||mine(f);return `<div class="agr"><span class="agn"><b>${num(f)}. ${esc(f.etapa)}</b><small>${esc(f.pessoa)}${cc(f)}</small></span>${can?`<button type="button" class="btn pri" data-fs="${f.id}">✔ Finalizar${mine(f)?'':' (gestor)'}</button>`:''}${A?`<button type="button" class="btn" data-sk="${f.id}" title="Conclui o passo sem creditar o funcionário">Avançar ⏭</button>`:''}</div>`};
  const wRow=f=>`<div class="agr"><span class="agn"><b>🔒 ${num(f)}. ${esc(f.etapa)}</b><small>${esc(f.pessoa)} · aguarda: ${waitOf(t.fluxo,f).map(z=>num(z)+'. '+esc(z.etapa)).join(', ')}</small></span></div>`;
  const panel=n?`<section class="agp" aria-label="Passos liberados agora"><h3>${t.status==='done'?'Tarefa concluída':'Liberados agora'} <em>${AC.length}</em></h3>${AC.map(agRow).join('')||`<div class="hint">${t.status==='done'?'Todos os passos foram concluídos.':'Nenhum passo liberado no momento.'}</div>`}</section>${wait.length?`<section class="agp wt" aria-label="Passos aguardando liberação"><h3>Aguardando liberação <em>${wait.length}</em></h3>${wait.map(wRow).join('')}</section>`:''}`:'<div class="empty">Esta tarefa não tem passos.</div>';
  const diag=n?`<div class="fdw">${flowSvg(t.fluxo,{st,sub:(f,i)=>shortName(f.pessoa)+(f.ok>1e11?' · '+dt(f.ok):'')})}</div><div class="fleg">Verde = concluído · amarelo = liberado agora · tracejado = aguardando · caixa tracejada verde = concomitantes. Roda do mouse = zoom · arraste = mover · duplo clique = ajustar.</div>`:'<div class="empty">Sem passos</div>';
  const hist=(t.notas||[]).slice(-30).reverse().map(x=>`<div class="note">${esc(x.txt)}<small>${esc(x.u)} · ${dt(x.t)}</small></div>`).join('');
  const lbl=p=>p<0||!t.fluxo[p]?'Geral':`Passo ${p+1} · ${esc(t.fluxo[p].etapa)}`;
  const anot=(t.anot||[]).slice().reverse().map(a=>`<div class="note"><b>${lbl(a.passo)}</b><div style="white-space:pre-wrap">${esc(a.txt)}</div><small>${esc(a.u)} · ${dt(a.t)}</small>${A?`<button type="button" class="btn dan" data-da="${a.id}" style="min-height:30px;padding:2px 10px;margin-top:6px">Excluir</button>`:''}</div>`).join('');
  const pn=mA.length?t.fluxo.indexOf(mA[0]):-1;
  const noteBox=A||mA.length?`<div class="nt"><label for="na">Nova anotação${A?'':' · '+esc(mA[0].etapa)}</label>${A?`<select id="ns" class="fsel" aria-label="Passo da anotação">${t.fluxo.map((f,i)=>`<option value="${i}" ${AC[0]&&f.id===AC[0].id?'selected':''}>Passo ${i+1} · ${esc(f.etapa)} (${esc(f.pessoa)})</option>`).join('')}<option value="-1">Geral (todos os passos)</option></select>`:''}<textarea id="na" rows="3"></textarea><button type="button" class="btn pri" id="nb" style="margin-top:8px">Salvar anotação</button></div>`:'';
  const sfv=(c,i,ed)=>{const id=`sf${i}-${c.id}`,v=t[c.id]??'',fl=c.tipo==='longo'?' class="full"':'';
    if(!ed)return `<div${fl}><label>${esc(c.nome)}</label><span class="obs">${esc(fmtVal(c,v)||'—')}</span></div>`;
    const x=c.tipo==='longo'?`<textarea id="${id}" data-sf="${c.id}">${esc(v)}</textarea>`:c.tipo==='data'?`<input type="date" id="${id}" data-sf="${c.id}" value="${esc(v)}">`:c.tipo==='mes'?`<input type="text" id="${id}" data-sf="${c.id}" data-t="mes" value="${esc(fmtMes(v))}" placeholder="mm/aa" readonly class="mpk" autocomplete="off">`:`<input type="text" id="${id}" data-sf="${c.id}" ${c.tipo==='valor'||c.tipo==='numero'?`inputmode="numeric" data-t="${c.tipo}"`:''} value="${esc(c.tipo==='valor'?brl(v):v)}" autocomplete="off">`;
    return `<div${fl}><label for="${id}">${esc(c.nome)}</label>${x}</div>`};
  const blocks=t.fluxo.map((f,i)=>{const L=(f.campos||[]).map(k=>campos().find(c=>c.id===k)).filter(Boolean);if(!L.length)return'';
    const ed=A||(t.status!=='done'&&st[i]==='ready'&&mine(f));
    return `<div class="sfb${st[i]==='ready'&&t.status!=='done'?' cur':''}"><h3>${i+1} · ${esc(f.etapa)} <small>${esc(f.pessoa)}${ed?'':' · só leitura'}</small></h3><div class="sfg">${L.map(c=>sfv(c,i,ed)).join('')}</div></div>`}).join('');
  /* contatos: quem tem passo liberado primeiro */
  const seen=new Set(),who=[];[...AC,...t.fluxo].forEach(f=>{const k=pkey(f.pessoa);if(!seen.has(k)){seen.add(k);who.push(f)}});
  const ctw=A?`<div class="ctw">${who.map(w=>{const ct=contactFor(w.pessoa),on=AC.some(a=>pkey(a.pessoa)===pkey(w.pessoa)),msg=`Olá ${fn1(w.pessoa)}, sobre a tarefa "${nome(t)}"${t.protocolo?' (protocolo '+t.protocolo+')':''}${t.final?', entrega prevista '+fmt(t.final):''}. `;
    const wa=ct&&ct.whatsapp?`<a class="btn wa" target="_blank" rel="noopener" href="${waLink(ct.whatsapp,msg)}" data-cob="${t.id}">${WA_IMG} WhatsApp</a>`:`<button type="button" class="btn wa off" data-miss="${esc(w.pessoa)}" title="WhatsApp: Sem cadastro">${WA_IMG} WhatsApp · Sem cadastro</button>`;
    const ml=ct&&ct.email?`<div class="mailbox"><span class="ml"><small>✉ E-mail</small><b>${esc(ct.email)}</b></span><button type="button" class="btn mail" data-em="${esc(ct.email)}" aria-label="Copiar e-mail de ${esc(w.pessoa)}">⧉ Copiar</button></div>`:`<button type="button" class="btn mail off" data-miss="${esc(w.pessoa)}" title="E-mail: Sem cadastro">✉ E-mail · Sem cadastro</button>`;
    return `<div class="ctp"><b>${esc(w.pessoa)}${on?' <span class="tag vez">passo liberado</span>':''}</b>${wa}${ml}</div>`}).join('')}</div>`:'';
  const waSeen=new Set(),waF=A?AC.filter(w=>{const k=pkey(w.pessoa);if(waSeen.has(k))return false;waSeen.add(k);return true}).map(w=>{const ct=contactFor(w.pessoa),msg=`Olá ${fn1(w.pessoa)}, sobre a tarefa "${nome(t)}"${t.protocolo?' (protocolo '+t.protocolo+')':''}${t.final?', entrega prevista '+fmt(t.final):''}. `,tt=`WhatsApp: ${w.pessoa} (${w.etapa})`;
    return ct&&ct.whatsapp?`<a class="btn wa" target="_blank" rel="noopener" href="${waLink(ct.whatsapp,msg)}" data-cob="${t.id}" title="${esc(tt)}" aria-label="${esc(tt)}">${WA_IMG} ${esc(fn1(w.pessoa))}</a>`:`<button type="button" class="btn wa off" data-miss="${esc(w.pessoa)}" title="${esc(tt+' — Sem cadastro')}" aria-label="${esc(tt+' — Sem cadastro')}">${WA_IMG} ${esc(fn1(w.pessoa))}</button>`}).join(''):'';
  const pipe=n?`<ol class="pipe" aria-label="Esteira do processo">${t.fluxo.map((f,i)=>`<li class="${st[i]||''}" title="${esc(f.etapa+' · '+f.pessoa)}"><b>${st[i]==='done'?'✓':i+1}</b><span>${esc(f.etapa)}<small>${esc(shortName(f.pessoa))}</small></span></li>`).join('')}</ol>`:'';
  const T=[['res','Resumo',AC.length],['dia','Diagrama',0],['ano','Anotações',(t.anot||[]).length],['his','Histórico',(t.notas||[]).length],...(A?[['con','Contatos',0]]:[])],tb=T.some(x=>x[0]===tab0)?tab0:'res';
  const tp=(k,h)=>`<div class="tp" role="tabpanel" id="tp-${k}" data-tp="${k}" aria-labelledby="tb-${k}" ${k===tb?'':'hidden'}>${h}</div>`;
  const [d,close]=dlg(`<div class="dh"><div><div class="vt">${tipoTag(t)}<span class="sb">${stepTxt}</span></div><h2 id="dt">${esc(nome(t))}</h2></div><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  ${tabsH(T,tb,'Seções da tarefa')}${pipe}
  <div class="vb">
  ${tp('res',`${panel}<div class="kv">${kv.map(([k,v])=>`<div><label>${k}</label><span>${esc(v)}</span></div>`).join('')}</div>${blocks?`<div class="sfw">${blocks}</div>`:''}${blocks.includes('data-sf')?'<button type="button" class="btn" id="sv" style="align-self:flex-start">Salvar campos</button>':''}${campos().filter(c=>c.tipo==='longo'&&t[c.id]&&!SF.has(c.id)).map(c=>`<div><label>${esc(c.nome)}</label><p class="obs">${esc(t[c.id])}</p></div>`).join('')}`)}
  ${tp('dia',diag)}
  ${tp('ano',`${noteBox}<div class="notes">${anot||'<div class="hint">Nenhuma anotação.</div>'}</div>`)}
  ${tp('his',`${A&&t.mov?`<div class="mvd">Última mudança de posto: ${esc(movLine(t.mov))} · ${dt(t.mov.t)}${t.mov.por?' · por '+esc(t.mov.por):''}</div>`:''}<div class="notes">${hist||'<div class="hint">Sem histórico ainda.</div>'}</div>`)}
  ${A?tp('con',ctw):''}</div>
  <div class="df">${mA.map(f=>`<button type="button" class="btn pri" data-fs="${f.id}">✔ Finalizar${mA.length>1?': '+esc(f.etapa):' meu passo'}</button>`).join('')}${A&&t.fluxo.some(f=>f.ok)?'<button type="button" class="btn" id="bk">← Devolver passo</button>':''}${dirOf(t)?`<button type="button" class="btn" data-dir="${t.id}">📋 Copiar caminho na rede</button>`:''}${waF}<span class="sp"></span>${A?'<button type="button" class="btn" id="ed">✎ Editar</button>':''}</div>`,corOf(t));
  d.classList.add('view');d.setAttribute('aria-labelledby','dt');bindTabs(d);fdZoom(d);
  const on=(s,f)=>{const e=d.querySelector(s);if(e)e.onclick=f};
  const seenNow=movNew(t);if(seenNow)setVisto([id]);
  bindMasks(d);
  const saveF=async(force)=>{let ch=0;d.querySelectorAll('[data-sf]').forEach(e=>{const c=campos().find(x=>x.id===e.dataset.sf);if(!c)return;const v=readVal(c,e);if((t[c.id]??'')!==v){t[c.id]=v;ch=1}});if(ch||force)await save();return ch};
  d.querySelectorAll('[data-sf]').forEach(e=>e.addEventListener('change',async()=>{if(await saveF()&&SB.on&&SB.ok&&!SB.dirty)toast('Salvo no banco ✔')}));
  d._oc=()=>{saveF();if(seenNow)render()};
  on('#nb',async()=>{const x=d.querySelector('#na').value.trim();if(!x){toast('Escreva a anotação');return}await saveF();const ns=d.querySelector('#ns');(t.anot=t.anot||[]).push({id:'a'+Date.now(),passo:ns?+ns.value:pn,u:user,t:Date.now(),txt:x});await save();close();render();openView(id,'ano')});
  d.querySelectorAll('[data-da]').forEach(b=>b.onclick=async()=>{if(!await fxAsk({t:'Excluir anotação',m:'Excluir esta anotação?',ok:'Excluir',dan:1}))return;t.anot=(t.anot||[]).filter(a=>a.id!==b.dataset.da);await save();close();render();openView(id,'ano')});
  on('#sv',async()=>{await saveF(true);if(!SB.on)toast('Campos salvos');else if(SB.ok&&!SB.dirty)toast('Campos salvos no banco ✔')});
  on('#ed',()=>{close();openTask(id)});on('#bk',()=>{close();pedirDevolucao(id)});
  d.querySelectorAll('[data-fs]').forEach(b=>b.onclick=async()=>{await saveF();const f=t.fluxo.find(x=>x.id===b.dataset.fs);if(!f)return;
    const mis=(f.campos||[]).map(k=>campos().find(c=>c.id===k)).filter(c=>c&&(t[c.id]==null||String(t[c.id]).trim()===''));
    if(mis.length){toast('Preencha antes de finalizar o passo: '+mis.map(c=>c.nome).join(', '));const e=d.querySelector('[data-sf="'+mis[0].id+'"]');if(e){const p=e.closest('[data-tp]');if(p&&p.hidden)d.querySelector('[data-tab="'+p.dataset.tp+'"]').click();e.focus()}return}close();await avancar(id,1,{sid:f.id})});
  d.querySelectorAll('[data-sk]').forEach(b=>b.onclick=async()=>{await saveF();const sid=b.dataset.sk;close();await avancar(id,2,{sid})});
  d.querySelectorAll('[data-em]').forEach(em=>em.onclick=()=>copyText(em.dataset.em).then(ok=>{if(ok){em.textContent='✔ Copiado';setTimeout(()=>em.textContent='⧉ Copiar',2000);toast('E-mail copiado')}else toast('Não foi possível copiar — selecione o e-mail e copie manualmente')}));
  d.querySelectorAll('[data-miss]').forEach(b=>b.onclick=()=>{const w=b.dataset.miss;close();view='admin';adminSec='func';render();toast(`Cadastre o contato de ${w||'funcionário'} para usar este botão`)});
  (d.querySelector('[data-fs]')||d.querySelector('#x')).focus();
}

/* ---------- Tarefa (criar / editar) ---------- */

/* ---------- Gestão: o que o gestor precisa cobrar ---------- */
const GSEP='\u0001',gMt=(f,v)=>!f||f.split(GSEP).includes(v||'__n'),gLk=t=>{const k=String(t.vmc||'').slice(0,7);return /^\d{4}-\d{2}$/.test(k)?k:''},gVk=t=>String(t.vmg||'').trim(),
  gTg=(f,v)=>{const a=f?f.split(GSEP):[],i=a.indexOf(v);i<0?a.push(v):a.splice(i,1);return a.join(GSEP)},gLb=(f,fn=x=>x)=>f.split(GSEP).map(x=>x==='__n'||x===EMP?'Nenhuma':fn(x)).join(', ');
let gMfOpen='',fbOpen=false;document.addEventListener('click',e=>{if(gMfOpen&&!e.target.closest('.gmf')){gMfOpen='';render()}});
/* ---------- Relatório XLSX da Gestão (sem bibliotecas) ---------- */
let gRep=null;
const xZip=(files)=>{const E=new TextEncoder(),tb=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t.push(c>>>0)}return t})(),
    crc=b=>{let c=-1;for(let i=0;i<b.length;i++)c=tb[(c^b[i])&255]^(c>>>8);return(c^-1)>>>0},
    u16=n=>[n&255,n>>8&255],u32=n=>[n&255,n>>8&255,n>>16&255,n>>24&255],P=[],C=[];let off=0;
  files.forEach(([name,txt])=>{const nb=E.encode(name),d=E.encode(txt),c=crc(d),
    h=[0x50,0x4b,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c),...u32(d.length),...u32(d.length),...u16(nb.length),...u16(0)];
    P.push(new Uint8Array(h),nb,d);
    C.push(new Uint8Array([0x50,0x4b,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c),...u32(d.length),...u32(d.length),...u16(nb.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(off)]),nb);
    off+=h.length+nb.length+d.length});
  const cs=C.reduce((a,b)=>a+b.length,0);
  return new Blob([...P,...C,new Uint8Array([0x50,0x4b,5,6,0,0,0,0,...u16(files.length),...u16(files.length),...u32(cs),...u32(off),0,0])],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})};
const xSheet=(rows,hdr=1)=>{const L=n=>{let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s},
    X=v=>String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
    w=[];rows.forEach(r=>r.forEach((v,i)=>{const n=v&&typeof v==='object'?String(v.n):String(v??'');w[i]=Math.min(60,Math.max(w[i]||8,n.length+2))}));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${hdr?'<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>':''}</sheetView></sheetViews><cols>${w.map((x,i)=>`<col min="${i+1}" max="${i+1}" width="${x}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.map((r,y)=>`<row r="${y+1}">${r.map((v,i)=>{const a=L(i)+(y+1),st=hdr&&!y?' s="1"':'';
    if(v&&typeof v==='object')return `<c r="${a}" s="2"><v>${v.n}</v></c>`;
    return v===''||v==null?`<c r="${a}"${st}/>`:`<c r="${a}" t="inlineStr"${st}><is><t xml:space="preserve">${X(v)}</t></is></c>`}).join('')}</row>`).join('')}</sheetData>${hdr&&rows[0]?`<autoFilter ref="A1:${L(rows[0].length-1)}${rows.length}"/>`:''}</worksheet>`};
function gXlsx(){if(!gRep)return;const{T,f}=gRep,CP=campos(),SL={todo:'A iniciar',doing:'Em andamento',wait:'Aguardando',done:'Concluída'};
  const H=['Tarefa','Concessionária','Medição','Status',...CP.map(c=>c.nome)],
    R=T.map(t=>{const y=tipoOf(t);return[y?y.nome+' '+(t.tarefa||''):(t.tarefa||''),(concOf(y)||{}).nome||'',medNm(medId(y))||'Sem medição',SL[t.status]||t.status||'',
      ...CP.map(c=>{const v=t[c.id];if(c.tipo==='mes')return fmtMes(v);if(c.tipo==='data')return v?fmt(v):'';if(c.tipo==='valor'){const n=parseFloat(v);return isNaN(n)?'':{n}}return v==null?'':String(v)})]}),
    tv=CP.map((c,i)=>c.tipo==='valor'?[c.nome,{n:R.reduce((a,r)=>a+(r[4+i]&&r[4+i].n||0),0)}]:null).filter(Boolean),
    I=[['Relatório da Gestão',''],['Gerado em',new Date().toLocaleString('pt-BR')],['Tarefas no relatório',String(R.length)],['',''],['Filtros aplicados',''],...f,...(tv.length?[['',''],['Totais','']].concat(tv):[])];
  const ns='http://schemas.openxmlformats.org/',ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const b=xZip([
    ['[Content_Types].xml',ct+'<Types xmlns="'+ns+'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels',ct+'<Relationships xmlns="'+ns+'package/2006/relationships"><Relationship Id="rId1" Type="'+ns+'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml',ct+'<workbook xmlns="'+ns+'spreadsheetml/2006/main" xmlns:r="'+ns+'officeDocument/2006/relationships"><sheets><sheet name="Tarefas" sheetId="1" r:id="rId1"/><sheet name="Filtros" sheetId="2" r:id="rId2"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels',ct+'<Relationships xmlns="'+ns+'package/2006/relationships"><Relationship Id="rId1" Type="'+ns+'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+ns+'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="'+ns+'officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml',ct+'<styleSheet xmlns="'+ns+'spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml',xSheet([H,...R])],['xl/worksheets/sheet2.xml',xSheet(I,0)]]);
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='relatorio-gestao-'+new Date().toISOString().slice(0,10)+'.xlsx';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);toast('Relatório gerado: '+R.length+' tarefa(s).')}
/* ---------- Importar relatório XLSX (atualiza os dados) ---------- */
async function xRead(buf){const dv=new DataView(buf),u=new Uint8Array(buf),D=new TextDecoder();let e=u.length-22;while(e>=0&&dv.getUint32(e,true)!==0x06054b50)e--;if(e<0)throw Error('Arquivo XLSX inválido');
  const n=dv.getUint16(e+10,true);let p=dv.getUint32(e+16,true);const F={};
  for(let i=0;i<n;i++){const m=dv.getUint16(p+10,true),cs=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),lo=dv.getUint32(p+42,true),nm=D.decode(u.subarray(p+46,p+46+nl));p+=46+nl+xl+cl;
    const ls=lo+30+dv.getUint16(lo+26,true)+dv.getUint16(lo+28,true),raw=u.subarray(ls,ls+cs);
    F[nm]=async()=>m===0?D.decode(raw):D.decode(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())}
  return F}
async function xRows(file){const F=await xRead(await file.arrayBuffer()),P=new DOMParser(),doc=t=>P.parseFromString(t,'application/xml');
  const wb=doc(await F['xl/workbook.xml']()),rel=doc(await F['xl/_rels/workbook.xml.rels']()),sh=[...wb.getElementsByTagName('sheet')],pk=sh.find(x=>nk(x.getAttribute('name'))==='tarefas')||sh[0];
  const rid=pk.getAttribute('r:id'),rl=[...rel.getElementsByTagName('Relationship')].find(r=>r.getAttribute('Id')===rid);let tg=rl.getAttribute('Target').replace(/^\//,'');if(!tg.startsWith('xl/'))tg='xl/'+tg;
  const SS=[];if(F['xl/sharedStrings.xml'])[...doc(await F['xl/sharedStrings.xml']()).getElementsByTagName('si')].forEach(si=>SS.push([...si.getElementsByTagName('t')].map(t=>t.textContent).join('')));
  const col=r=>{let n=0;for(const ch of r.replace(/\d+/g,''))n=n*26+ch.charCodeAt(0)-64;return n-1},R=[];
  [...doc(await F[tg]()).getElementsByTagName('row')].forEach(r=>{const a=[];[...r.getElementsByTagName('c')].forEach(c=>{const t=c.getAttribute('t'),v=c.getElementsByTagName('v')[0],i=col(c.getAttribute('r'));let x='';
    if(t==='inlineStr')x=[...c.getElementsByTagName('t')].map(z=>z.textContent).join('');else if(v){const q=v.textContent;x=t==='s'?(SS[+q]||''):t==='str'||t==='e'?q:t==='b'?q==='1'?'Sim':'Não':(q!==''&&!isNaN(q)?+q:q)}
    a[i]=x});R.push(a)});return R}
async function gImport(file){
  try{const rows=await xRows(file);if(!rows.length)throw Error('Planilha vazia');
    const H=(rows[0]||[]).map(h=>nk(h)),ci=H.indexOf('tarefa'),cc=H.indexOf('concessionaria');if(ci<0){fxAsk({t:'Planilha inválida',m:'Planilha sem a coluna “Tarefa”: use o relatório baixado pelo sistema.',ok:'Entendi',no:false});return}
    const CP=campos(),FIX=['tarefa','concessionaria','medicao','status'],cols=CP.map(c=>({c,i:H.indexOf(nk(c.nome))})).filter(x=>x.i>=0&&!FIX.includes(nk(x.c.nome)));
    const key=(n,c)=>nk(n)+'|'+nk(c),mp=new Map();
    S.tasks.forEach(t=>{const y=tipoOf(t),k=key(y?y.nome+' '+(t.tarefa||''):(t.tarefa||''),(concOf(y)||{}).nome||'');if(!mp.has(k))mp.set(k,[]);mp.get(k).push(t)});
    const used=new Map(),ser=n=>new Date(Date.UTC(1899,11,30)+Math.round(n)*864e5).toISOString().slice(0,10);
    const cv=(c,v)=>{const N=typeof v==='number';
      if(c.tipo==='data'){if(N)return ser(v);const q=String(v).trim(),m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(q);return m?m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'):/^\d{4}-\d{2}-\d{2}/.test(q)?q.slice(0,10):undefined}
      if(c.tipo==='mes'){const r=N&&v>20000?ser(v).slice(0,7):parseMes(String(v));return r||undefined}
      if(c.tipo==='valor'){if(N)return v;const f=parseFloat(String(v).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.'));return isNaN(f)?undefined:f}
      return String(v).replace(/\r\n/g,'\n').trim()};
    const same=(c,o,n)=>c.tipo==='data'?String(o||'').slice(0,10)===n:c.tipo==='mes'?fmtMes(o)===fmtMes(n):c.tipo==='valor'?Math.abs((parseFloat(o)||0)-n)<.005:String(o==null?'':o).replace(/\r\n/g,'\n').trim()===n;
    const ch=[];let miss=0,eq=0,bad=0;
    rows.slice(1).forEach(r=>{const nm=r[ci];if(nm===''||nm==null)return;const k=key(nm,cc>=0?r[cc]:''),L=mp.get(k),j=used.get(k)||0;used.set(k,j+1);const t=L&&L[j];if(!t){miss++;return}
      const d=[];cols.forEach(({c,i})=>{const v=r[i];if(v===''||v==null)return;const n=cv(c,v);if(n===undefined||n===''){bad++;return}if(!same(c,t[c.id],n))d.push([c.id,n])});
      d.length?ch.push([t,d]):eq++});
    const nc=ch.reduce((a,x)=>a+x[1].length,0);
    if(!ch.length){fxAsk({t:'Nada a atualizar',m:eq+' tarefa(s) já iguais'+(miss?', '+miss+' sem correspondência':'')+'.',ok:'OK',no:false});return}
    const FU=gFld(/^(UF|ESTADO)$/),FM=gFld(/MUNIC|CIDADE/);
    const ok=await fxAsk({t:'Importar relatório?',h:`<p><b>${esc(file.name)}</b></p><ul class="fxul"><li><b>${ch.length}</b> tarefa(s) serão atualizadas (${nc} campo(s))</li><li>${eq} tarefa(s) já estão iguais</li><li>${miss} linha(s) sem tarefa correspondente (ignoradas)</li>${bad?`<li>${bad} célula(s) com formato inválido (ignoradas)</li>`:''}</ul><p class="hint">Células vazias não apagam dados. Status, Tarefa, Concessionária e Medição não são alterados. Você poderá reverter em Gestão › Histórico de atualizações.</p>`,ok:'Importar'});
    if(!ok)return;
    const rec={id:'i'+Date.now(),arq:file.name,t:Date.now(),por:String(user||''),iguais:eq,sem:miss,ms:ch.map(([t,d])=>({tid:t.id,tarefa:nome(t),conc:(concOf(tipoOf(t))||{}).nome||'',uf:FU?String(t[FU.id]||''):'',mun:FM?String(t[FM.id]||''):'',cs:d.map(([k,n])=>({id:k,nome:(CP.find(c=>c.id===k)||{}).nome||k,de:t[k]==null?'':t[k],para:n}))}))};
    S.imports=S.imports||[];S.imports.unshift(rec);S.imports.length=Math.min(S.imports.length,15);
    ch.forEach(([t,d])=>d.forEach(([k,n])=>{t[k]=n}));await save();gTab='hist';render();await fxAsk({t:'Importação concluída',h:`<p><b>${ch.length}</b> tarefa(s) atualizadas (${nc} campo(s)).</p><p class="hint">Veja o que mudou na aba Histórico de atualizações.</p>`,ok:'Ver histórico',no:false})
  }catch(e){console.error(e);fxAsk({t:'Não foi possível importar',m:'Não foi possível ler o XLSX: '+String(e.message||e).slice(0,160),ok:'Entendi',no:false})}}
let GP=new Map(),gTab='graf',gSub='',gChart='dots',gSel='',gLog='',gVt='';let gCh='map',gUf='',gMun='',gMapFl='',gTar='',gTk='',gCn='',gFOpen=false,gFSc=0;const cnOf=t=>((concOf(tipoOf(t))||{}).nome)||'';const tarOk=t=>(!gTar||nk(nome(t)+' '+(t.tarefa||'')).includes(nk(gTar)))&&(!gTk||gHas(gTk,nk(t.tarefa||'')))&&(!gCn||gHas(gCn,cnOf(t)));
const gVals=v=>v?String(v).split(GSEP).filter(Boolean):[],gHas=(v,x)=>!v||gVals(v).includes(String(x)),gToggle=(v,x)=>{const a=gVals(v),i=a.indexOf(String(x));i<0?a.push(String(x)):a.splice(i,1);return a.join(GSEP)};
const medMatch=(t,id)=>{const i=medId(tipoOf(t)),ex=(S.medicoes||[]).some(c=>c.id===i);return id==='_'?!ex:i===id};
const gOk=(t,sel=1)=>(!sel||!gSel||gVals(gSel).some(v=>medMatch(t,v)))&&(gMt(gLog,gLk(t)))&&(gMt(gVt,gVk(t)));
const BRVB='0 0 613 639',UFN={"AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal", "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais", "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins"},BRMAP={"AC": "m 30.7,238 -2.1,-0 0.5,-1.8 -0.2,-0.8 -0.2,-0.5 -1.2,-0.7 -0.1,-0.5 0.3,-1.1 -0.8,-1.9 -1.1,-0.6 -5.6,-1.2 -7.3,-0.2 0.3,-0.6 2.5,-2.3 0.9,-1.2 0.3,-1.2 -0.2,-1.2 -0.7,-0.9 -0.8,-0.4 -1.7,-3 -0.8,-0.4 -0.9,-0.2 -1.1,-1.1 -0.9,-2.4 -2,-1.5 -1,-3.6 -0.9,-1.6 -1.9,-1.1 -0.1,-1.2 0.8,0.1 0.4,-0.5 0.1,-0.7 -0.2,-0.4 -2.1,-0.9 -0.4,-0.7 -2.2,-1.9 0,-0.4 0.6,-0.1 0.5,-1.3 -0,-1.3 3,-0.4 0.5,-0.4 -0.2,-1.4 -1.2,-1.6 0,0 17.9,7.5 23.7,5.7 12.1,3.1 26.4,14.2 28.5,12.1 0,0 3,1.3 0,0 -0.3,0.5 -1.6,0.7 -2.1,1.6 -2.9,2.8 -1.6,0.9 -0.7,-0.2 -1.5,0.2 -0.1,0.6 -1.9,1.3 -2.1,1 -1.4,1.8 -0.4,1.2 -0.6,0.3 -1.2,-0.8 -0.8,-0.1 -2.4,0.1 -0.7,0.3 -0.6,0.5 -0.4,0.9 -2.4,3.5 -3.8,1.2 -0.8,0.7 -1.9,0.5 -1,0 0.1,-2.1 -1.4,0.2 -3.5,-0.8 -5.2,-0.5 -5.1,0.4 -0.7,-0.6 -2.3,-0.2 -3.6,1.8 -2.7,0.6 -1.7,-0.7 -1.4,-1.4 -1.6,1.2 0,-17.6 0.1,-1.1 0.5,-0.7 0.1,-2.4 -0.3,-0.9 1,-1.2 0.5,-1.1 -1.2,0.2 -3,2.6 -1.6,1 -2.1,2.4 -1.9,0.7 -0.7,1.1 -1.8,1 z", "AL": "m 562.2,230.6 -0.2,-0.7 -1.4,-0.8 -0.5,0.1 -1,-0.3 -0.5,-1.4 0,0 1.3,-1.1 0.6,-1.1 2.2,-0.8 2.4,-3.3 0.1,-0.7 0.8,-0.6 1,1.2 1.7,0.3 1.1,-0.1 2.5,2 1.9,2.1 1.8,1.1 1.9,0.5 2.5,-0.7 3.1,0.3 1.2,-0.1 1.9,-1.1 1.2,0.1 1.8,-1.1 2.2,-2.3 0.1,-0.5 1.6,-1.2 2,-0.2 2.2,0.8 2.6,-1.3 1.5,-0.2 1.9,0.8 2.9,0.3 0.3,0.2 0,0 -2.8,5 -4.5,5.1 -3.6,3.6 -3,4.6 -3.3,2.9 -1,2 -1.3,1.8 0,0 -0.6,-1.3 -3.6,-2.2 -0.5,-0 -1.7,-0.8 -1.8,-1.4 -1.3,-2.5 -5.4,-3.1 -3.7,-0.9 z", "AP": "m 345.2,100 -0.9,-0.1 -0.8,0.3 -1.3,0.1 -2.8,-0.7 -1.4,-1 -0.4,-1.5 -1.9,-1.4 -0.1,-1.3 0.2,-0.7 -0.3,-1.6 -0.3,-0.5 -0.9,-0.2 -0.4,-0.9 0.1,-2.4 -2.9,-3.3 -0.8,0.4 -0.8,-0.2 -1.5,-3.5 0.1,-1.6 -0.6,-1.8 -0.6,-0.6 -0.7,-1.5 -0.2,-2.1 0.4,-3.1 -0.2,-0.3 -2.6,-0.7 -2,-2.3 -0.8,-2.8 0.2,-0.7 0.7,-0.2 -0.5,-1.2 -0.7,0 -2.8,-2.7 -0.9,0.1 -0.4,0.4 -1.3,0.1 -0.8,-0.3 -0.8,-1 -1.1,-0.8 -1.2,-0.1 -0.5,-1.3 -0.7,-0.8 -1.9,-1.1 -1.3,-0.5 -3.4,-0.4 -1.1,0.3 -1.2,-0 -0.3,-0.5 -0.2,-1.4 0.2,-4.5 0.6,-1.3 -0.4,-2.3 -0.6,-0.6 0,0 0.3,-0.2 1,0.3 -0,0.8 -0.3,0.2 0.3,1 1.5,-0.1 0.8,0.2 0.3,0.9 0.8,0.7 2.2,0.8 3.3,0.8 2.8,-1.8 0.3,-0.8 1.7,-1.2 0.8,-0.3 0.7,0.9 2.7,0.9 1.1,-0.1 1.7,-1 0.1,-0.4 0.3,0 1.5,1.3 -0.2,0.9 2.4,-0.2 0.5,0.5 0.9,0.2 0.6,-0 0.9,-0.5 1.7,-1.5 1.8,-1.1 1.8,-2.3 0.4,-1 -0.2,-0.5 3.1,-6.5 0.1,-1.8 1.1,-1.3 0.7,-0.2 3.6,-5.8 0.2,-1.1 0.8,-1.2 1.8,-1.6 0.6,-1.7 2.1,-1.1 0.5,-0.9 1,-0.6 0.6,1.5 0.9,1.4 -1.7,-4.8 -0.1,-1.3 0.2,-0.3 3.4,2.4 1.1,1.2 0.9,1.2 0.5,1.2 0,1.6 0.4,0.3 0.3,-0.5 0.4,-0.1 0.2,0.4 0.2,7.9 0.7,3.9 2.7,6 2.7,8.9 3.3,5 1,0.3 3.3,-0.1 2.8,0.9 1.3,0.8 0.8,2.6 -0.2,3.3 -1.3,1 -1.7,0.4 -0.4,0.3 1.8,-0.1 1,-0.4 0.3,0.2 0.1,0.6 -0.2,0.7 -5,4.1 -1.2,2.1 -2.1,1.4 -1.9,3.7 -2.9,3.5 -0.7,0.5 -0.9,-0.1 -1.4,0.5 -2.1,3 0,0 -1.3,0.1 -0.8,0.9 0,0 -1.5,1.7 -1,2.2 -1.1,1.9 -0.8,0.7 -3,3.5 -0.4,2.4 0.2,1.8 -1.9,1.8 -1,0.1 z m 23.4,-47 -0.5,-0.3 -1.1,-1.9 0.1,-0.9 0.2,-0.4 1.7,-0.5 0.4,0.4 0.8,2.3 -1,1.1 -0.7,0.2 z m 2.5,17.6 -0.4,-0.2 -0.1,-0.7 1.1,-1.1 0.9,-0.1 1.2,0.2 0.5,-0.1 0.4,-0.6 0.1,0.6 -1,1.4 -1,0.5 -1.8,0.2 z m 3.4,-2.9 -0.8,-0.2 0,-0.6 0.7,-1 1.2,-0.1 0.2,0.3 -0.1,0.5 -1.3,1.1 z m -7.2,-18.4 -0.8,-0.5 0.3,-0.8 0.9,-0.2 0.9,0.3 0,0.7 -1.2,0.5 z", "AM": "m 166.1,47.6 0.7,0.8 0.8,0.3 0.6,0 1.1,-0.4 0.6,0.1 0.1,1 1.2,1.2 1,0.4 0.9,-0.2 1.4,0.1 1.9,0.9 0.5,0.7 -0.9,3.3 -0.7,1.5 2.7,3.7 1.7,4.8 0.2,2.3 0.9,1.1 0.1,0.5 -1.6,1.5 0.4,1.6 0.7,1.6 -0.8,3 -0.6,1 0.3,5 0.9,2.2 1.2,0.8 0.6,0.9 1.1,4.3 -0.1,0.6 -1.1,1.3 -1.8,-0.3 -0.1,1.1 5,4.4 0.5,0 2,1.3 1.5,1.6 1,2 0.5,0.1 1.3,-0.4 2.4,1 -0.4,-2.1 0.8,-2.3 0.2,-1.7 -0.4,-1.8 0.8,-3 1,-1.3 1.3,-0.7 2.1,-0.7 0.6,-0.9 1.6,-0.1 2.8,0.9 1.9,2 0.9,2.5 1.8,0.2 1.2,-0.5 1.4,-1.4 2,-0.6 0.4,-0.4 0,-0.5 -1.1,-1.4 -0.2,-0.7 0.1,-0.7 1.1,-2.6 0.1,-1.1 1.7,-3 2.3,-3.3 -0,-0.7 18.5,0.1 0,0 0.4,4.9 -0.4,1.4 0.2,2.3 0.2,0.7 1.7,0.8 0.2,0.4 -0.3,0.7 -0.1,2.1 1.8,2 0.4,0.2 0.7,-0.2 1.8,1.2 0.6,1.8 0,0.9 0.3,0.5 4.6,3.8 4.6,2.5 0.6,0.9 1.4,1.1 1.9,0.7 2.4,1.3 2.3,0.7 1.4,0.1 1.3,0.8 0.1,0.6 1.3,1.3 2.7,1.4 1.1,2.2 1.9,0.8 0.8,-0.6 1.4,-0.3 0.2,0.5 -0.1,0.8 1.8,1.7 -29.9,64.2 -0.8,1.3 -1.4,1.1 -0.6,1 -0,1.1 0.8,2.3 0.4,0.6 1.1,0.6 1.6,1.6 0.6,1.3 0.1,2 0.6,0.6 0,0 -1.2,1.2 -0.2,0.6 -0.1,0.8 0.3,0.8 -0.3,1 -1.2,1.8 -0.9,0.6 -0.4,0.8 0.1,0.8 0.7,1.4 0.5,1.9 -1.4,4.2 -1.2,5.2 -1.2,0.7 -47.9,0.3 0,0 0,-0.7 -0.4,-0.4 -1.4,-0.3 -1.9,1.1 -0.5,1.7 -0.7,0.2 -3.2,-1.5 -0.7,-2.9 -0.6,-0.2 -1,0.1 -0.5,-0.2 -1.2,-3.3 -2.5,-1 -1.3,-1.3 -0.8,-1.9 -0.5,-0.5 -2.1,-1.1 -10.8,0.1 -1.4,2.6 -1.7,0.5 0.1,1.2 -0.3,0.2 -2.5,0.5 -1.2,1.6 -0.1,0.7 0.9,0.7 0.2,0.5 -0.4,1 -0.8,1.1 -2.1,1.2 -0.1,1.8 0.2,1.5 -3.9,-0.5 -2.1,0.4 -1.2,1.1 -1.8,-0.1 -0.8,-0.6 -0.5,-0 -1.8,1.3 -0.5,0.8 0.3,1.8 -2.5,3.2 -0.7,0.1 -0.7,-0.5 -0.6,-2.3 -0.4,-0.1 -1.8,1 -1.3,1.2 -1.4,0.4 -0.8,-0.1 -1.1,0.5 -0.4,0.5 -0.1,0.7 -1.2,0.8 -0.4,0 -2.3,-2.3 -0.7,-0.4 -2.9,0.3 -4,-0.3 0.2,1.3 -0.1,0.6 -1.6,1.8 -1.9,0.6 -3.3,2.6 0,0 -28.5,-12.1 -26.4,-14.2 -12.1,-3.1 -23.7,-5.7 -17.9,-7.5 0,0 -0.1,-0.7 0.7,-2.9 1.2,-1.4 4.9,-3.5 2.3,-0.2 0.5,-0.3 1,-1.6 0.1,-1 -1.7,-4.5 0.4,-1.2 1.2,-2.2 1.3,-1.3 0.9,-1.2 0.4,-1 0.3,-1.7 -0.3,-1.3 0.7,-2 0.3,-2.3 0.7,-0.8 3.7,-1.6 2.2,-1.2 1.1,-1 0.4,-1.4 0.8,-0.4 1.4,-0.1 1.6,-0.9 3.5,-2.7 2.4,-0.4 1.5,0.3 4.2,-1.2 1.5,-0.8 1.8,-0.4 3.3,0.4 1.3,-1.6 0.6,-1.4 1.1,-0.6 2.1,0.2 0.6,0.5 1.3,-0.2 1.1,-0.7 1.7,0.1 0.3,0.5 -0,1.2 1.6,1.3 2.8,0.1 0.6,-0.4 0.5,-0.8 -0.1,-0.4 1.2,-4.9 6.7,-37.2 1.2,-2.9 -1,-5 0.1,-0.3 -1.3,-1.1 -1.5,-2.8 -0,-0.5 0.7,-1.4 -0.5,-1.8 -0.4,-0.4 -1.7,-0.6 -3,-2.4 -1.9,-2.3 0.2,-11.5 3.9,-0.3 1.8,-1.2 3.5,-0.9 2.7,1.8 1.2,0.1 1.3,-0.4 -0.5,-1.7 0.3,-1.7 -1.4,-2.1 -0.6,-0.5 -1.1,-0.6 -1.5,0.5 -2.8,-0.6 -3.6,0.1 -0.1,-9.9 1,0 1.3,-0.6 2.3,-0.6 2.8,0.9 19,0.1 -0.5,-0.7 -0.8,-0.1 -0.4,-1.2 0.9,-1.9 1.4,0.4 0.6,1.5 0.9,1.3 0.7,0.3 0.8,0 1.6,-0.6 1.9,-2.1 0.3,-0.8 1.3,-1.2 2.5,-1.4 1.3,0.5 1.2,2.6 1.6,2 0.7,1.3 0.7,1.8 0.2,1.6 -0.5,3.6 0.2,1.8 3.2,-0.8 8.3,7.1 0.8,0.3 2.5,0.2 2.3,-1 1.7,-1.7 2.1,-1.2 2.2,-0.1 0.6,0.3 0.8,1.1 -0,1 -1.1,1.7 0.4,1 0.6,0.3 1.3,-0.7 0.6,-0.9 0.2,-1.3 1,-1.2 0.5,-0.2 1,0.2 0.6,-0.2 0.4,-0.7 0.5,-2.3 0.5,-0.4 1.5,-0.4 2.9,-1.8 1,0.6 0.9,-0.3 1.6,-1 1,-1.6 2.1,-1.2 2,0.6 2.4,-1.6 0.6,-0.8 0.4,-2.7 -0,-1.3 0.8,-0.9 1,-0.4 1.7,-0 1.3,-0.4 2.1,-1.6 1,-0.4 2.3,-0.3 z", "BA": "m 527.8,365.6 -0.4,-0.8 0.7,-1.4 -0,-0.5 -0.5,-1 -4.1,-3 -0.1,-0.5 0.2,-1.5 -0.6,-1.2 -0.7,0.2 -0.2,0.5 -0.3,0.2 -0.2,-0.2 0.5,-4.4 0.8,-3.3 0.8,-0.9 2.5,0.2 1,-0.7 0,-0.4 -0.6,-1 0.2,-2.6 5,-4.2 1.5,-3.1 -0.4,-1.2 -0.8,-1 -0.9,-0.1 -0.7,-0.4 -2.8,-2.5 -2.1,0 -2.2,-0.6 -2.3,-1.1 -2.7,-0.6 -2,-0.1 -1.3,1 -1.5,0.5 -2.6,-0.5 -0.6,0.2 -0.4,-4 -6.5,-6.2 -0.4,-0.2 -4.4,1.2 -1.5,-1.2 -0.5,0.2 -0.9,-0.2 -2.5,-1.2 -2.2,-1.6 -1,0.2 -4.3,-3.6 -1.1,-0.5 -2.7,-0.8 -1.8,0.2 -1.9,0.9 -0.8,1.1 -0.6,0.2 -5.3,-1.5 -0.6,-0.5 -0.3,-1.5 0.1,-0.9 1.3,-2.7 -0.9,-0.5 -2.3,-0.5 -2.2,-0 -1.2,-0.5 -1.8,-0.1 -3.8,1.6 -4.3,3 -0.6,1.1 -3.4,1.9 -2,0.4 -0.9,1.2 -1.8,1.6 -1.4,0.5 -1,-0.1 -1.9,2.6 -1,0.8 -2.1,-0.4 -0.7,0.1 -0.7,1 -1.3,0.9 -0.4,-0.2 1.4,-3.4 -0.5,-2.4 0,0 1.5,-2 0.2,-0.8 -0.2,-1.3 -0.7,-1.7 0.1,-0.7 0.7,-1.4 -0.1,-0.5 -3.2,-2.6 -1.7,-3.5 -0.6,-3.5 0.1,-1.6 1.2,-3.8 1.6,-1 0.2,-0.4 0.1,-0.9 -1.6,-0.8 -0.1,-0.3 0.5,-2.5 1.4,-1.1 -0,-0.4 -2.7,-2.5 0,0 -0,-0.9 1.4,-2.4 -0,-1.1 -0.2,-0.4 -1.5,-0.5 -0.9,-0.7 -0.3,-1.3 0.1,-2.9 0.2,-0.8 1.9,-1.7 1.1,-0.4 1,-0.7 -0.3,-0.6 -0.6,-0.5 -0.9,-0.3 -1,0.2 -0.3,-0.3 -0.1,-0.5 0.4,-1 2,-0.8 0.6,-0.5 -0,-0.8 -1.9,-1 -3.6,-0.7 -1.9,-2 -0.2,-0.9 0.5,-1.2 1,-0.7 1.5,-3.5 0.9,-0.6 1,-0.3 0.3,-0.4 -1.3,-1.8 0.2,-0.4 3.2,-2.6 3.8,-2 0.6,-0.5 0.2,-1 0.7,-0.7 0,0 2.3,-0 1.4,1.3 0.7,1 0.5,2.2 1.8,2.5 4.2,1.9 1.8,-0.5 2.1,0.2 0.3,-0.2 0.8,-1.4 1.1,-0.4 0.7,-0.9 1.2,-0.9 2.2,-0.8 1.3,0.2 1.5,0.5 1.4,-0.4 3,-2.4 3,-5 0.7,-0.9 0.2,-0.9 0.3,-2.6 -0.1,-1.2 -2.2,-4.4 0.1,-0.9 3.2,-1.6 1.9,-0 1.5,0.5 0.4,0.9 0.3,0.2 2.1,-0.4 1.4,-0.5 1.3,0.4 1.7,1 -0.1,0.7 0.2,0.3 0.8,0.3 3,-0.1 1.5,-0.6 1.7,-0.1 0.8,-1.2 1.5,-1.3 2.7,-0.3 0.8,-0.4 0.8,-1 2.2,0 0.6,0.6 0.3,0.1 1.9,-1.8 -0.1,-2.4 2,-0.4 0.8,0.2 1.1,-0.7 1.5,-2.3 0.5,-1.1 0,0 0.9,0.4 1.2,-0.3 2.2,0.3 2.8,1.4 0.4,0.5 -0.1,2.7 0.7,1.9 2.2,0.9 0.3,2 -0.9,1.7 1.8,0.6 1,-0.2 0.8,-0.9 2.9,-0.9 0.8,-3.6 0.5,-0.9 0.8,-0.2 0.8,0.5 0.6,0.1 2.4,-1 1.1,-1.2 0.2,-0.6 -0.2,-1.4 0.3,-0.2 2.2,-0.5 0.8,-2 1.6,-0.4 2.5,-1.5 0.6,-0.1 1.5,0.6 0.8,1.4 1.4,0.8 2.4,0.8 3,0.4 1.6,1.1 0.5,1.6 0.4,0.3 0.4,-0.1 0.3,-1.8 0.4,-0.4 1,-0 0.5,0.3 0,0.6 -0.6,0.9 0.5,0.8 0.5,0.4 2.1,0.9 0,0.9 1.2,3 0,0 0.5,1.4 1,0.3 0.5,-0.1 1.4,0.8 0.2,0.7 0,0 -0.7,1.2 0.2,2.1 1.3,2.5 2,1.9 0.8,1.1 -0.1,3.1 -0.7,1.6 -0.1,0.9 0.8,2.8 -0.3,0.6 -0.7,0.6 -2.5,1 -1.1,-0.8 -1.7,-0 -0.3,0.3 -0.6,1.6 0,0.8 0.9,1.6 1.1,0.7 0.5,1.5 1.4,1.5 0.1,0.4 -0.1,1.4 -0.3,0.4 0.1,0.4 0.6,0.5 1.9,0.9 0.5,0.7 0.5,0.3 1.6,0.6 2.9,-0.9 0,0 0.6,-0 0.4,0.4 -4.1,8.8 -3.8,5.2 -1,2.3 -5,5.7 -2.5,1.3 -0.9,-0 0.3,-1.4 0.4,-0.1 0.1,-1.1 -0.5,-1.9 -1.9,-0.2 -0.4,-1.3 -0.7,-0.8 -0.4,0.6 -0.5,2.3 -0.5,0.9 -0.6,0.4 -0.6,-0.3 -0.5,-1.7 0.1,-0.3 0.3,-0.1 -0,-0.4 -0.9,1.3 0.9,1.7 0.5,0.2 0.4,-0.1 1.1,0.3 -0.5,1.8 -1.2,1.1 -0.2,1.8 -1.2,1 -0.3,0.7 -0.2,0.8 0.2,0.8 -1.4,-0.4 -0.2,0.4 -0.4,2.5 0.4,-0.7 0.8,0.2 0.2,0.5 -0.2,0.4 0.1,0.6 0.3,0.3 0.3,1 -1,2.5 0.6,3.4 -0.6,0.5 -0.6,-0.2 -0.1,1.1 0.6,0.5 1.2,-1.7 -0.5,-2.2 0.8,-0.6 0.2,0.5 -0.1,1.8 -1,2.6 -0.7,5.4 -0.5,1.8 0.2,2.5 0.8,2.9 0.2,4.5 0.9,6.4 1,3.4 -2.2,6.7 -1.4,6.7 -0.5,1 -0.2,2.9 -1.1,3.7 -0.1,2.3 0.4,4.4 0.9,1.7 -2.2,3 -1.8,0.7 -0.9,0.6 -2.7,3.9 -0.6,2 0,0 -8.1,-5.1 -0.3,-0.5 z m 22.3,-78 -0.2,-1.2 0.7,-0.4 1.1,-1 0.2,-0.6 -0.4,-0.7 0.8,0.1 0.8,1.1 -0.1,0.5 -2.9,2.3 z m -2.5,6.8 -0.6,-0 0,-0.7 0.3,-0.4 -0.8,-0.2 -0.4,-0.4 0.1,-1.1 1.9,-0.1 0.2,0.2 0.1,1.1 -0.7,1.6 z", "CE": "m 574.1,157.1 -4.9,1.6 -2.6,2 -3.3,6.7 -0.8,1.1 -0.9,0.6 -0.7,1.7 0.1,0.7 -1.4,2.4 -1.5,1.5 -0.6,1.1 -1,0.3 -0.8,-0.5 -0.5,0.1 -0.8,0.9 -1.4,2.2 -0.3,2 0.6,0.2 0.7,-0.4 0,0 -0.1,0.5 -0.8,1.1 -1,3 0.5,1.3 -0.7,1.3 -1.1,0.6 -0.2,0.4 -0.1,0.9 0.2,0.4 0.6,0.3 0.3,0.7 -0,1.7 1.2,0.9 0.7,0.1 0.3,1.2 -1.6,3.5 -1.2,1.1 0.2,0.2 0,0 -1.6,0.5 -1.1,0.8 -1.5,2.3 -1.6,0.1 -0.6,-1.6 -0.8,-0.6 -1.4,-0.5 -1,-1.1 -0.5,-1 -1.8,-0.8 -2.9,-1.9 -3.1,-0.4 -1.3,0.1 -2.1,0.8 -1.6,0.2 -0.9,-0.2 -4.9,-0.2 0,0 0.1,-1.3 -0.7,-0.7 -0.1,-1 1.1,-3.1 1.5,-2.2 0,-0.7 -0.8,-1.2 -2.6,-0.5 -1.3,-0.7 -1,-2.7 -1.1,-5.2 -0.8,-2.6 0.2,-0.5 -0.9,-8.2 -0.1,-0.4 -0.9,-0.7 0.8,-0.6 0.6,-1.6 -0.6,-3 -1,-2 0.5,-1.6 -0.8,-3.9 0.7,-1.4 0,-0.8 -1.4,-1.6 -0.4,-1.7 -3.1,-6.4 -1.8,-4.7 -0.3,-1.3 0.2,-1.5 1.6,-2 1.1,-1.9 0.1,-0.8 0,0 0.2,-0.1 -0,-0.6 -0.4,-0.7 0.7,-0.8 6.7,-0.2 2.9,-0.4 2.1,-0.7 7.4,0.8 2.1,1.1 1.9,1.5 4.1,2.2 1.5,0.5 4.8,3 1.2,0.2 2.2,2.3 3,2.1 2.6,0.7 2.4,2.9 1.2,0.6 3,3.8 4.2,3.1 1.5,2 1,1 1.5,0.8 1.1,0 2.4,0.9 0.8,0.7 z", "DF": "m 417,334.1 -14.7,-0 -0.5,-3.3 0.9,-1.8 0.4,-3.7 11.9,0 1.8,2 0.1,2.2 -0.6,1.2 -0.2,2.4 z", "ES": "m 501.9,411.6 -0.3,-0.1 0.4,-2.3 0.6,-1.3 -0.6,-3.1 0.2,-0.4 1.7,-2.1 5.2,0 0.6,-0.3 1,-3.2 1.1,-1.3 0.9,-2.3 0.2,-1.7 0.3,-0.4 1.2,-0.9 1.7,-2.1 0.5,-3 -0.3,-2.4 -1.3,-2.8 -1.1,-1.3 -0.5,-0.1 -0.5,0.3 -0.8,-0.3 -0.5,-0.7 0.4,-0.6 1.5,-0.1 0.8,0.3 1,0 0.9,-0.2 0.3,-0.4 -0.2,-1.7 -1.3,-0.3 -0.2,-0.4 0.3,-1.5 0,-1.9 -0.5,-0.7 -1.3,-0.7 -0.3,-0.7 1.2,-1.9 2.2,-1.3 0.3,-0 1.1,0.7 1.1,0.1 0,-0.8 -1.7,-2.3 1.3,0.1 2.2,-0.3 0.8,-0.6 1.1,-0.3 1.6,-0.1 2.5,0.8 0.9,0.6 0,0 0,0 0,0 0.3,0.5 8.1,5.1 0,0 -0.9,3.4 -0.3,2.9 0.1,3.6 0.7,6.2 -0.3,2.5 -1.5,3.2 -2.8,1.4 -0.6,0.6 -1.7,3.3 -1,3.8 -0.8,1.5 -0.8,-0.7 -0.9,-0.1 -0.3,1.3 1.4,0.5 -1.9,4.2 -3.5,3.8 -0.2,-0.3 -1.9,0.7 -0.8,1.2 -0.1,1.4 -0.4,1.2 -1.6,2 -0.3,1.1 0,0 -1.6,-1.1 -3,0.4 -4.3,-1 -2.5,-1.1 -0.7,-4.7 z", "GO": "m 417,334.1 -0.9,-1 0.2,-2.4 0.6,-1.2 -0.1,-2.2 -1.8,-2 -11.9,-0 -0.4,3.7 -0.9,1.8 0.5,3.3 14.7,0 0,0 0,0 0,0 -0.5,1.5 0.3,1.6 -0.7,1.6 -1,1.2 -0.4,1.5 0.8,1.2 0.8,0.3 1.4,1 1.6,4.6 0,0.6 -2.3,2.7 -3.2,3 -0.4,2.1 1.1,1.1 0.9,-0.5 1.6,0.6 0.5,0.6 0.2,1 -0.2,0.7 -0.7,0.9 -0.5,1.9 1.2,3.5 -3.1,2.1 -1.2,0.2 -0.9,0.9 -0.5,1.1 -4.9,2.7 -0.7,-0.8 -4.3,-1.9 -0.6,0.5 -0.6,0.1 -1.8,0 -1.5,-0.3 -3.9,0.2 -2,-0.9 -4.1,2.6 -2.9,2.9 -0.3,0 -1.3,-1.4 -1.5,-0.3 -3.2,1.6 -3.7,-0.6 -2.5,1 -2.2,0.5 -1.4,2.1 -1.2,2.5 0.1,1 -0.8,1.3 -0.8,0.3 -0.8,-0.2 -0.5,0.1 -0.9,0.7 -1.6,2.1 -0.6,1.9 0.6,0.6 -0,0.3 -0.4,0.2 -0.9,-0.5 0,0 -0.2,-0.5 -2.7,-2.2 -3.1,-0.6 -1.6,-1.6 -1.9,-0.4 -1.5,-0 -3.4,-1.3 -0.7,-0.8 -3.1,-1.6 -0.7,-0.6 -1.4,-0.7 -1.1,-0.2 -2.7,-1.7 -2.8,0.2 -3.8,-0.7 -0.1,-0.3 0.3,-0.8 0.6,-1.2 1.3,-1.8 -0.1,-0.4 -2.2,-0.9 -1.1,0.7 -0.7,-0.2 -0.3,-0.4 -0.2,-1.1 0.3,-2.6 -0.2,-1.8 0,0 -0.9,-2.2 -0.2,-3.4 -1.4,-2.2 -0.2,-0.7 0.4,-3.4 2.5,-3.9 0.4,-2.9 0.7,-0.8 2,-0.8 1.9,-1.8 1.2,-2 0.3,-1.9 0.5,-1 1.3,-1 0.8,-1.4 0.1,-1.5 1.8,-1 1.4,-2.6 2.6,-0.1 2.7,-0.9 0.3,-0.3 2,-4.2 0.7,-1 0.6,-4.1 0.4,-0.7 1.9,-1.9 1.6,-1 1.1,-0.3 1.2,0.7 1.2,-0.7 1.4,-1.4 0.8,-2.9 1.2,-2.9 -0,-0.8 -0.5,-1.1 0.6,-2.7 1.6,-3.1 -0.1,-5.2 1.2,-0.8 1,-2.6 2,-3.2 0.4,-1.1 -0.2,-2.7 0.3,-0.9 1,-0.9 0.3,-1.1 -0.1,-0.6 0,0 0.3,-0.5 0.2,-1.9 0.7,-1.2 1.8,-2.1 0.6,-0.3 -0,1.7 -1.2,1.9 -0.5,2.3 2.4,0.4 2.2,1 3.9,0.4 3.1,1.7 4.1,1.4 0.6,-0.2 1.6,-5.9 1.5,-2.4 1.2,-1 1.1,1.3 1,1.9 1.1,3.7 0.6,3.1 1.1,0.1 0.8,-0.8 0.3,-1 0.6,-0.5 2.8,0.3 4.5,-0.5 0.2,0.7 -0.6,1.6 3.1,1.5 3.4,0.7 0.7,-0.1 0.5,-3.3 0.6,0 1.5,2.6 0.5,0.2 1.8,-0.9 2.5,-2.1 4.5,-1 1.6,0 2.6,-1.1 1.7,-1.3 5.4,-1.4 0,0 2.7,2.5 0,0.4 -1.4,1.1 -0.5,2.5 0.1,0.3 1.6,0.8 -0.1,0.9 -0.2,0.4 -1.6,1 -1.2,3.8 -0.1,1.6 0.6,3.5 1.7,3.5 3.2,2.6 0.1,0.5 -0.7,1.4 -0.1,0.7 0.7,1.7 0.2,1.3 -0.2,0.8 -1.5,2 0,0 -1,1 -3.2,-0.3 -0.9,-1.8 -2.4,-1.5 -1.2,1.5 0.6,3.8 -0.6,0.5 -0.4,0.1 -2.8,-1.1 -1.2,0.2 -0.4,0.3 -0.7,3.2 0.7,0.1 0.5,1.2 -0.6,0.9 -0.7,0.7 0,1.9 0.4,0.6 0.5,0.2 0.7,4.3 -0.5,0.5 -3.4,0.9 -2.3,1.5 z", "MA": "m 458.8,129.2 -0,0.3 -2,2.1 -0.4,0.2 -0,1.4 2,-1.7 0.7,-1.2 2.1,-1.6 0.9,-1.1 1,-6.3 1.1,-0.7 1.1,-0.1 1.7,-0.9 0.7,-0.1 0.5,0.1 0.1,1.6 -0.2,0.5 -1.4,1.9 -3.2,1.8 -0,0.7 0.7,0.1 0.5,-0.8 1.1,-0.3 0.2,0.8 -0.6,0.5 0.2,0.3 4.2,-5 0.9,0.3 2.6,-0.9 4,0.4 -0.5,-2.4 0.6,-0.2 2.4,0.1 1.8,0.4 2.6,1.1 1,0.1 2.1,1.4 1.4,0 1.3,1.3 1.9,1.3 2.5,0.6 1.2,-0.2 0.6,0.8 0.3,0.1 1.6,-0.1 2.5,0.7 0.3,-0.9 -0.7,-0.5 1.7,-0.4 0.6,0.1 -0.1,0.4 0,0 -0.5,1.4 0.2,0.7 0.6,0.5 -0.4,1.5 -1.8,2.3 -4.1,4 -3.3,0.5 -0.8,-0.2 -2.9,3.4 0,1.8 -0.9,1.8 -1.9,1.9 -0.8,2 -0.6,0.2 -0.8,1.1 0.4,1.9 1.2,0.8 0.4,1.3 -0.3,1.5 -1.1,2.9 1.6,2.8 0.6,3 -0.1,2.4 -0.2,0.6 -4.1,4.4 -0.2,2.5 0.1,2.1 0.5,2.3 1.8,2 1.6,0.9 0.2,0.5 0.1,0.8 -0.4,2.2 -0.3,0.4 -0.1,1.2 -0.5,1.5 -1.2,1.3 -2.3,0.3 -0.7,-0.3 -0.8,0 -2.4,0.9 -1.5,0.1 -2.5,-1.8 -1,-0.2 -1.5,0.2 -1,0.6 -1.1,0.3 -0.2,-0.3 -0.8,0.2 -0.5,0.2 -1.9,1.9 0,0.5 -0.6,0.9 -2,2 -2.3,0.9 -2.9,2.6 -1.3,0.5 -1.1,0 -1.7,1.5 -1.1,0.4 -2.6,0.3 -2.7,0.8 -2.1,1.9 -1,3 -0.4,3 -0.6,2.3 -1.4,2.7 -0.3,0.2 -0.3,0.8 -0.1,1.5 -1.2,2.5 -1.7,1.4 -0.7,2 0.7,1.9 0.5,3.2 1.7,3.1 -0,0.5 -0.8,1.4 -0.1,6.4 -1.1,2.5 -0.3,1.1 -0.1,1.9 0,0 -1.3,-0.7 -0.6,-0.8 -0.8,-0.5 -1,-0.3 -1.8,0.2 -0.7,-0.2 -1.4,-2 -1,-2.9 -2.1,-1.6 -0.1,-1.6 1.6,-1.8 -0.1,-0.5 -3.9,-1.9 -0.6,-1.1 -0.1,-1.7 -0.8,-1.6 -0.9,-0.7 -2.1,-0.3 -0.2,-0.4 0.3,-0.7 2.6,-2.5 -0.4,-1.3 0.7,-2.7 0.7,-1.4 0.6,-0.6 1.3,-0.5 3.4,-0.3 -0.4,-1.4 0.6,-3.2 -0.1,-1.8 -1.8,-1.2 -4.3,0.9 -2.1,1.3 -2.3,-3 -0.9,-0.8 -3,-4.2 -0.9,0.1 -0.8,-1.4 0.6,-1.2 -0.1,-0.9 -0.2,-0.3 -1.4,-0.2 -0.4,0.3 -1.9,-1.3 0.2,-0.7 1.8,-0.7 1.8,-2 0.2,-1.6 -0.3,-1 0.3,-2.4 1.8,-6.2 0,-0.4 -0.7,-1.1 -0.2,-1.1 0.2,-3.7 -0.6,-1.5 -0.5,-3.5 -0.8,-1 -3.4,-1.4 -1.2,-0 -0.3,-0.3 -0.1,-1 -0.6,-0.7 -1.7,-0.3 -1,0.5 -1.4,-0.1 -2.8,-1.5 -0.9,-0.1 -2,0.5 -2.6,1.9 -0.5,0.6 0,0 -0.5,-0.1 14.7,-11.8 2.4,0.2 1.2,-0.9 1.6,-2.2 0.4,-1.1 1.6,-1.2 0.6,-2.9 1.1,-0.5 2.4,-2.3 0.5,-1.2 0.3,-1.9 1.6,-4.7 2,-1.5 1.5,-1.8 0.8,-1.4 0.5,-1.3 -0.2,-1.8 0.8,-0.8 -1,-1.6 3.7,-3.1 -0.1,-1.6 0.5,-2.4 1.7,-1.6 0.4,-0.7 0.9,-3 0.1,-1.6 -0.4,-0.5 -1,0.2 -0.3,-0.5 0.1,-0.6 1.1,-0.1 0.6,-0.7 0.7,-4.4 -0.2,-1.4 0.5,-1 0.8,-0.5 0,0 0.6,0 0.2,-0.2 -0.1,-0.5 0.3,-0.7 0.6,-0.5 1.3,1 0.5,1.8 1.2,0.1 0.8,-1.4 0.6,2.9 1,0 0.3,-0.5 0.1,-0.9 0.8,-0 1.7,0.5 0.5,0.7 -1.4,1.7 0.7,0.7 0,0.6 1.2,-2 0.5,-1.5 0.5,0 0.4,1 0,0.6 -0.9,0.9 -0.3,1 0.1,2.7 0.3,0.3 0.5,0.1 0.6,-0.1 1,-0.9 -0.5,-1 0.1,-0.6 1.3,-1.4 1.1,-0.2 2.1,0.6 1.5,-1.1 0.1,0.9 -0.4,0.2 -1.1,1.5 0.6,0.6 0.1,-0.4 1.2,-0.6 0.6,0.8 -0.1,1.2 1.6,1.8 0.9,-0.4 1.6,0.7 0.8,2.4 -0.1,0.9 -2.2,2.7 -0.4,0.9 0.1,0.7 0.6,-1 1.8,-1.7 0.8,-0 0.9,0.8 0.5,1.9 -0.3,1.2 -1,0.2 -1,0.9 -1.2,1.5 0.1,0.8 -1.2,2.4 -0.6,3.5 0.2,0.3 0.9,0.2 z m 0.5,0.5 -0.1,-0.8 0.5,-1.5 -0.4,-1.1 0.1,-0.7 0.9,-1.2 0.6,-0.2 0.1,2.4 -0.2,1.3 -0.8,0.6 -0.7,1.2 z m -6.3,-25.8 -0.4,-0.5 -0.1,-0.6 0.8,-1.1 0.8,-0 0.7,0.4 0.1,0.3 -0.2,0.4 -1.7,1.1 z m 3.5,4.2 -0.3,-0.3 0.1,-0.5 1.1,-0.9 0.5,0.1 0.5,0.8 -0.1,0.6 -0.4,-0.2 -1.3,0.4 z m -14.2,-4.8 -0.2,-0.1 0.9,-3.6 0.3,0.1 0,0.2 -0.4,3.1 -0.7,0.2 z", "MT": "m 207.2,296.3 1.5,-1.4 4.1,-2.6 0.5,-2.5 1.4,-3.8 0.9,-1.1 1.6,-0.5 0.4,-0.4 0.6,-0.8 0.5,-2.2 1.7,-2 0.6,-2.2 0.1,-1.7 -0.6,-1.5 0,-2 -1.5,-3.3 -0.9,0 -0.6,-0.5 -0.4,-3.2 0.1,-1.3 1.4,-1.1 1.4,-1.8 0.2,-0.8 -1.4,-3.6 -1.1,-0.4 -1.1,-0.1 -3.5,0.1 -1.2,-1.1 0.2,-0.6 -17.2,-0.1 0.9,-9 -1.5,-2.8 -0.3,-1.8 0,-0.8 1,-3.5 -0.4,-1.9 0.9,-1.7 -0.8,-2.3 -0.1,-1.4 -0.3,-0.6 -0.8,-0.5 -0.1,-0.3 1.3,-5 0.8,-1.4 -0.6,-1.2 -1.4,-1 0,0 47.9,-0.3 1.2,-0.7 1.2,-5.2 1.4,-4.2 -0.5,-1.9 -0.7,-1.4 -0.1,-0.8 0.4,-0.8 0.9,-0.6 1.2,-1.8 0.3,-1 -0.3,-0.8 0.1,-0.8 0.2,-0.6 1.2,-1.2 0,0 1.2,1.1 2.5,4.1 0.4,1.8 1.4,4 1.3,1.9 0.8,1.6 -0.2,2.4 0.5,2.4 0.7,2.2 1.5,1.1 3,2.8 3.4,1.7 0.2,0.9 -0,1.1 0.2,0.5 0.9,0.4 0.8,-0.2 1.6,0.5 0.5,0.7 0.2,1.1 0.3,0.3 1.4,-0.5 3.7,1.5 34,2.4 63,3.5 0,0 -0.7,1 -0.6,1.9 -1.1,1.2 -0.4,3.1 -0.4,0.8 -0.4,0.3 -1.9,5.3 -0.5,3 -0,3 -1.9,6 0.1,0.9 1.4,1.3 -0.2,0.9 -0.8,0.9 -0.1,0.5 1.1,2.2 -0.5,3.3 0,1.6 0.5,0.6 0.4,3 -0.7,2.8 1,3.3 1,0.5 0.8,0 0,0 0.1,0.6 -0.3,1.1 -1,0.9 -0.3,0.9 0.2,2.7 -0.4,1.1 -2,3.2 -1,2.6 -1.2,0.8 0.1,5.2 -1.6,3.1 -0.6,2.7 0.5,1.1 0,0.8 -1.2,2.9 -0.8,2.9 -1.4,1.4 -1.2,0.7 -1.2,-0.7 -1.1,0.3 -1.6,1 -1.9,1.9 -0.4,0.7 -0.6,4.1 -0.7,1 -2,4.2 -0.3,0.3 -2.7,0.9 -2.6,0.1 -1.4,2.6 -1.8,1 -0.1,1.5 -0.8,1.4 -1.3,1 -0.5,1 -0.3,1.9 -1.2,2 -1.9,1.8 -2,0.8 -0.7,0.8 -0.4,2.9 -2.5,3.9 -0.4,3.4 0.2,0.7 1.4,2.2 0.2,3.4 0.9,2.2 0,0 -1.6,0.3 -1.2,-0.6 -0.9,-0.1 -2.7,0.1 -0.6,0.6 -4.6,-0.3 -1.7,-1.3 -1.3,-0.1 -0.1,-0.5 0.2,-0.5 1.7,-2.8 1.8,-0.7 1.2,-6.6 -1.3,0.1 -5.6,6 -1,-0.1 -2.1,0.9 -1,-0 -0.2,-0.2 -0.3,-1.4 -1.6,-1 -2.4,-0.1 -1.4,0.6 -0.5,0.8 -1.3,0.8 -4.5,0.6 -1.2,-0.6 -1.3,-1.1 -3,-1.2 -0.8,-1 -0.3,-0.9 -0.7,-0.3 -2.6,-0.5 -2.8,-1.2 -0.8,-1.1 -1.3,-0.2 -2,0.5 -1.4,1.2 -1.7,0.5 -0.8,-0.3 -1.6,0.2 -2.6,-0 -1.4,1.4 -0.1,1.2 -2,3 -2,2 -5.6,2 -2.1,-1.5 -1,-1.1 -0.7,-0.2 0,0 -0.7,-0.7 -0.3,-0.8 0.5,-0.7 -2.4,-2.1 -1.3,0.6 -0.5,-0.1 -1.2,-0.7 -0.5,-0.7 -2,-1.4 -1.9,-0.8 -0.3,-0.3 -0.3,-1.1 -0.2,-2.9 -0.6,-1.8 -0.2,-3.7 0.9,-1.6 1.1,-1.1 0.3,-1.8 -0.1,-1.9 -1,0.1 -0.4,0.6 -0.4,0.2 -26.9,-1.1 -1.1,-12.7 -5.4,-6.1 4.9,-0.1 -0.3,-7.5 -2.6,-5.3 -0.5,-2 0.3,-1.1 0.6,-0.6 0.7,-1.3 -1.4,-2.9 -3.1,-1 z", "MS": "m 359.2,400.1 -0.4,2.5 -0.3,0.4 -1.5,0.8 -1.3,0 -0.5,0.2 -1.2,1 -2,2.7 -0.7,0.7 -1,0.3 -0.6,1.7 -0.2,2.9 -2.6,3.6 -1,0.5 -0.2,0.4 0.3,1.9 -0.1,0.9 -1.2,2.3 -2,2.3 0.3,0.8 -0.3,1.2 -1.4,1 -0.4,1.2 -1.7,1.7 -1.3,2.4 -1.9,1.9 -7.6,4.5 -1.3,1.1 -0.7,1.5 -0.8,1.1 0,0 -5.4,2.3 -1.1,0.8 -0.9,2.3 0,1.1 -1.4,3.6 -0.7,0.7 -1.7,1 -1.1,0.3 -0.3,0.3 -1.6,7.9 -0.4,0.8 -2.4,1.6 0,0 -2.5,-2.3 -3.4,-1.9 -4,2 -0.7,0.8 -1.7,0.5 -2.6,0.4 -2.4,-0.5 -1,-0.7 -0.5,-4.3 -0.3,-0.7 -0.9,-0.9 -0.2,-2.5 0.5,-1.3 -0.6,-0.8 -0.1,-0.4 0,-2.9 -0.9,-2 -0.6,-2.7 -0.1,-0.7 0.6,-1.4 0,-1.6 -1.6,-1.1 -0.4,-0.8 -0.2,-2.2 -1.6,-1.8 -2.2,-0.3 -1.5,0.3 -1.8,-0.3 -2.5,-2 -0.6,-1.5 -1.5,0.3 -2.2,2.7 -1,-0.6 -1.7,0.8 -1.1,0.2 -1.7,-0.7 -2.6,-0.5 -3.5,0.2 -3.7,-0.7 -0.5,-0.9 -2,-0.1 -0.9,0.5 -2.5,-0.9 0.9,-7.3 -0.4,-2.4 0.6,-1.4 1,-1.5 0.6,-6 -0.7,-2.3 -0.1,-1.7 -0.8,-1 -0.4,-0.1 -0.5,0.7 -0.6,-3.3 -0.8,-1.9 -1.2,-2 -0.3,-1.8 4,-2.3 0.8,-0.9 -4.2,-3.9 5.4,-11.4 1.1,-0.1 -0.3,-2.1 -0.7,-0.1 3.2,-10.3 0.7,-1.2 -3.1,-5.8 0,-1.9 0,0 0.7,0.2 1,1.1 2.1,1.5 5.6,-2 2,-2 2,-3 0.1,-1.2 1.4,-1.4 2.6,0 1.6,-0.2 0.8,0.3 1.7,-0.5 1.4,-1.2 2,-0.5 1.3,0.2 0.8,1.1 2.8,1.2 2.6,0.5 0.7,0.3 0.3,0.9 0.8,1 3,1.2 1.3,1.1 1.2,0.6 4.5,-0.6 1.3,-0.8 0.5,-0.8 1.4,-0.6 2.4,0.1 1.6,1 0.3,1.4 0.2,0.2 1,0 2.1,-0.9 1,0.1 5.6,-6 1.3,-0.1 -1.2,6.6 -1.8,0.7 -1.7,2.8 -0.2,0.5 0.1,0.5 1.3,0.1 1.7,1.3 4.6,0.3 0.6,-0.6 2.7,-0.1 0.9,0.1 1.2,0.6 1.6,-0.3 0,0 0.2,1.8 -0.3,2.6 0.2,1.1 0.3,0.4 0.7,0.2 1.1,-0.7 2.2,0.9 0.1,0.4 -1.3,1.8 -0.6,1.2 -0.3,0.8 0.1,0.3 3.8,0.7 2.8,-0.2 2.7,1.7 1.1,0.2 1.4,0.7 0.7,0.6 3.1,1.6 0.7,0.8 3.4,1.3 1.5,0 1.9,0.4 1.6,1.6 3.1,0.6 2.7,2.2 0.2,0.5 0,0 -0.6,0.2 -1,4.2 0.6,3.2 z", "MG": "m 527.8,365.6 -0.9,-0.6 -2.5,-0.8 -1.6,0.1 -1.1,0.3 -0.8,0.6 -2.2,0.3 -1.3,-0.1 1.7,2.3 -0,0.8 -1.1,-0.1 -1.1,-0.7 -0.3,0 -2.2,1.3 -1.2,1.9 0.3,0.7 1.3,0.7 0.5,0.7 -0,1.9 -0.3,1.5 0.2,0.4 1.3,0.3 0.2,1.7 -0.3,0.4 -0.9,0.2 -1,-0 -0.8,-0.3 -1.5,0.1 -0.4,0.6 0.5,0.7 0.8,0.3 0.5,-0.3 0.5,0.1 1.1,1.3 1.3,2.8 0.3,2.4 -0.5,3 -1.7,2.1 -1.2,0.9 -0.3,0.4 -0.2,1.7 -0.9,2.3 -1.1,1.3 -1,3.2 -0.6,0.3 -5.2,-0 -1.7,2.1 -0.2,0.4 0.6,3.1 -0.6,1.3 -0.4,2.3 0.3,0.1 0,0 -2.5,2.4 -1.2,0.3 -0.6,0.5 0.7,0.7 -2.4,6 -1.9,3.7 -0.1,0.8 1.4,0.1 0.3,0.6 -0.2,0.5 -2.5,1 -9.5,4.5 -1.4,0.2 0,-0.5 -0.5,-0.2 -2.5,-0.3 -0.6,0.1 -1.6,0.9 -1.2,0.2 -3.2,0.1 -0.4,-0.3 -0.5,0.1 -4.1,1.8 -1.1,0.8 -1.7,0.8 -0.5,-0.3 -2.6,0.2 -2.9,1.3 -2.4,0.7 -0.7,0.5 0,0 -1.2,0.7 -2.2,0.2 -1.9,1 -1.2,1.2 -1.8,0.7 -2.4,0.2 -2.3,-0.1 -0,-0.5 0.3,-0.5 -0.1,-0.3 -1.2,0.3 -0.2,2.3 0.2,0.2 -0.1,0.8 -0.8,1 -1.3,0.3 -0.6,-0.4 -3.6,1 -0.2,-0.5 -2,0.2 -1.1,-0.2 -2,-3.3 1.2,-0.7 -0.5,-1.7 -1.8,-0.8 -1.8,-1.2 -0.7,-1.6 0.5,-1.6 0.2,-3.5 -0.3,-2.9 1.9,-2.7 0.7,-2.2 0.1,-1.3 -0.2,-0.4 -3.7,-1.3 -1,0.1 -0.3,0.4 -0.8,0.3 -1.6,0.1 0,-0.8 -0.8,-2 -1.3,-1.8 -0.4,-2.2 -0.3,-0.6 -0.8,-0.7 0.2,-1.9 1.5,-2 0.1,-0.6 -0.4,-1.6 -1.9,-1.2 -0.6,-0.6 0.3,-2.4 0.6,-1 -0.2,-1 -3.3,-3.4 -1.3,0.3 -0.8,0.6 -1.6,-0.8 -2.4,0.1 -0.3,0.6 0.2,0.5 -0.4,1 -2.8,0.7 -1.1,-0.4 -1.5,-1.4 -1,1.2 -8.2,0.7 -0.5,0.5 -0.5,1.2 0.3,2.5 -0.4,0.4 -1.2,-0.5 -0,-2.8 -0.2,-1 -0.4,-0.4 -0.6,-0.1 -0.3,0.2 -0.4,1.1 -0.7,0.9 -0.5,0.3 -0.6,-0 -1.2,-2.1 -0.3,-1.4 0.1,-0.9 -1.7,-0.8 -2.2,-1.4 -2,0.6 -1.6,-0.2 -1.7,0.3 -4.3,-1 -2.5,-0.1 -1.7,-1.6 -0.8,-0.1 -1.5,0.6 -1.4,1.7 -1.9,0.4 -2.1,1.1 -1.2,1.1 0,0 0.3,-2.6 -0.6,-3.2 1,-4.2 0.6,-0.2 0,0 0.9,0.5 0.4,-0.2 0,-0.3 -0.6,-0.6 0.6,-1.9 1.6,-2.1 0.9,-0.7 0.5,-0.1 0.8,0.2 0.8,-0.3 0.8,-1.3 -0.1,-1 1.2,-2.5 1.4,-2.1 2.2,-0.5 2.5,-1 3.7,0.6 3.2,-1.6 1.5,0.3 1.3,1.4 0.3,0 2.9,-2.9 4.1,-2.6 2,0.9 3.9,-0.2 1.5,0.3 1.8,-0 0.6,-0.1 0.6,-0.5 4.3,1.9 0.7,0.8 4.9,-2.7 0.5,-1.1 0.9,-0.9 1.2,-0.2 3.1,-2.1 -1.2,-3.5 0.5,-1.9 0.7,-0.9 0.2,-0.7 -0.2,-1 -0.5,-0.6 -1.6,-0.6 -0.9,0.5 -1.1,-1.1 0.4,-2.1 3.2,-3 2.3,-2.7 0,-0.6 -1.6,-4.6 -1.4,-1 -0.8,-0.3 -0.8,-1.2 0.4,-1.5 1,-1.2 0.7,-1.6 -0.3,-1.6 0.5,-1.5 1.3,-0.1 2.3,-1.5 3.4,-0.9 0.5,-0.5 -0.7,-4.3 -0.5,-0.2 -0.4,-0.6 -0,-1.9 0.7,-0.7 0.6,-0.9 -0.5,-1.2 -0.7,-0.1 0.7,-3.2 0.4,-0.3 1.2,-0.2 2.8,1.1 0.4,-0.1 0.6,-0.5 -0.6,-3.8 1.2,-1.5 2.4,1.5 0.9,1.8 3.2,0.3 1,-1 0,0 0.5,2.4 -1.4,3.4 0.4,0.2 1.3,-0.9 0.7,-1 0.7,-0.1 2.1,0.4 1,-0.8 1.9,-2.6 1,0.1 1.4,-0.5 1.8,-1.6 0.9,-1.2 2,-0.4 3.4,-1.9 0.6,-1.1 4.3,-3 3.8,-1.6 1.8,0.1 1.2,0.5 2.2,0 2.3,0.5 0.8,0.5 -1.3,2.7 -0.1,0.9 0.3,1.5 0.6,0.5 5.3,1.5 0.6,-0.2 0.8,-1.1 1.9,-0.9 1.8,-0.3 2.7,0.8 1.1,0.5 4.3,3.6 1,-0.2 2.2,1.6 2.5,1.2 0.9,0.2 0.5,-0.2 1.5,1.2 4.4,-1.2 0.4,0.2 6.5,6.2 0.4,4 0.6,-0.2 2.6,0.5 1.5,-0.5 1.3,-1 2,0.1 2.7,0.6 2.3,1.1 2.2,0.6 2.1,-0 2.8,2.5 0.7,0.4 0.9,0.1 0.8,1 0.4,1.2 -1.5,3.1 -5,4.2 -0.1,2.6 0.6,1 0,0.4 -1,0.7 -2.5,-0.2 -0.8,0.9 -0.8,3.3 -0.5,4.4 0.2,0.2 0.3,-0.2 0.2,-0.5 0.6,-0.2 0.6,1.2 -0.2,1.5 0.1,0.5 4.1,3.1 0.5,1 0,0.5 -0.7,1.4 z", "PA": "m 371.3,235.5 -63,-3.5 -34,-2.4 -3.7,-1.5 -1.4,0.5 -0.3,-0.3 -0.2,-1.1 -0.6,-0.7 -1.6,-0.5 -0.8,0.2 -0.9,-0.4 -0.2,-0.5 0,-1.1 -0.2,-0.9 -3.4,-1.7 -3,-2.8 -1.5,-1.1 -0.7,-2.2 -0.5,-2.4 0.2,-2.4 -0.8,-1.6 -1.3,-1.9 -1.4,-4 -0.4,-1.8 -2.5,-4.1 -1.2,-1.1 0,0 -0.6,-0.6 -0.1,-2 -0.6,-1.3 -1.6,-1.6 -1.1,-0.6 -0.4,-0.6 -0.8,-2.3 0,-1.1 0.6,-1 1.4,-1.1 0.8,-1.3 29.9,-64.2 -1.8,-1.7 0.1,-0.8 -0.2,-0.5 -1.4,0.3 -0.8,0.6 -1.9,-0.8 -1.1,-2.2 -2.7,-1.4 -1.3,-1.3 -0.1,-0.6 -1.3,-0.8 -1.4,-0.1 -2.2,-0.7 -2.4,-1.3 -1.9,-0.7 -1.4,-1.1 -0.6,-0.9 -4.6,-2.5 -4.6,-3.8 -0.3,-0.4 -0,-0.9 -0.6,-1.8 -1.8,-1.2 -0.7,0.2 -0.4,-0.2 -1.8,-2 0.1,-2.1 0.3,-0.7 -0.2,-0.4 -1.7,-0.8 -0.2,-0.7 -0.2,-2.3 0.4,-1.4 -0.4,-4.9 0,0 -1.6,-17 0,0 0.8,0.3 0.4,0.6 -0,0.5 0.5,0.4 0.9,0.3 1.4,-0.7 0.5,-0.8 2.7,0.2 0.8,-1.1 -0.5,-1.8 1.8,-0.4 1.4,-1.6 2.6,1 1.9,0 0.5,-1.5 3.3,-1.6 2,0.4 1.2,-0.1 0.5,-0.2 1.2,-1.5 0.4,-1.4 1.5,-1.1 0.9,-0.1 0.7,0.5 2.1,-1.1 0.4,0.1 0.4,1 0.7,0.5 2,0.5 1.6,0.2 0.6,-0.6 1.7,-0.4 0.8,0.3 0.8,-0 0.9,-0.3 2.2,0.3 4.7,1.4 1,-0.1 1,-0.9 -0,-2.3 -2.1,-2.5 -1.2,-0.6 0.5,-1.7 1.3,-1.4 0.3,-1.1 0.3,-0.2 0.7,0.2 0.8,0.8 2.4,1.1 11.6,-2.3 1.6,1.7 1,0.1 0.4,-0.3 0,0 0.6,0.6 0.4,2.3 -0.6,1.3 -0.2,4.5 0.2,1.4 0.3,0.5 1.2,0 1.1,-0.3 3.4,0.4 1.3,0.5 1.9,1.1 0.7,0.8 0.5,1.3 1.2,0.1 1.1,0.8 0.8,1 0.8,0.3 1.3,-0.1 0.4,-0.4 0.9,-0.1 2.8,2.7 0.7,-0 0.5,1.2 -0.7,0.2 -0.2,0.7 0.8,2.8 2,2.3 2.6,0.7 0.2,0.3 -0.4,3.1 0.2,2.1 0.7,1.5 0.6,0.6 0.6,1.8 -0.1,1.6 1.5,3.5 0.8,0.2 0.8,-0.4 2.9,3.3 -0.1,2.4 0.4,0.9 0.9,0.2 0.3,0.5 0.3,1.6 -0.2,0.7 0.1,1.3 1.9,1.4 0.4,1.5 1.4,1 2.8,0.7 1.3,-0.1 0.8,-0.3 0.9,0.1 0,0 -0.5,0.7 0.3,1.6 -0.2,0.5 -1.3,1.1 -1.4,0.2 -0.5,-0.2 -0.8,-0.8 -0.7,-0.1 -3.4,1.6 -0.4,0.5 -1.6,0.7 -0.6,-0 -1.6,0.6 0,0.6 6.5,-1.1 0.9,0.7 0.1,0.5 0,0.7 -0.6,0.5 0.3,0.4 0.6,-0.2 0.9,-1 1,-0 0.5,-0.3 0.6,0.1 1.1,-0.4 1.1,-0.6 3.3,-2.3 1.5,-0.3 1.8,-0.8 3.2,-1.8 0.5,-1 0.7,-0.5 2.1,-1 0.7,-0.7 -0.2,-0.7 0.2,-0.4 1.1,-0.3 1.1,0.1 0.4,0.2 0.4,3.8 -0.5,2.6 0.3,1.6 0.8,1.6 1.3,1.4 0.3,1.6 -0.1,0.5 -1.8,1.8 -0.5,0.1 -0.9,-0.5 -1.8,-0.5 -1.3,-0.3 -0.9,0.1 -2.1,-1 -0.3,-1.1 -0.9,-0.5 -2.3,3.8 -0.6,2.4 0.7,3 0.5,0.6 0.9,0.6 -1,-1.1 -0.4,-2.7 0.1,-0.5 2.6,-4.2 2.3,1.2 0.1,0.5 2.5,2.5 -0.2,2 -0.7,0.6 0.4,2.3 0.5,1.1 1.1,0.8 0.7,0.1 0.5,0.5 -0.3,-0.6 -0.8,-0.2 -1.2,-1 -0.2,-0.7 0.3,-4.2 0.8,-1.2 1.4,0.7 0.8,1.2 -0.1,0.8 1.2,0.9 0.2,-0.3 -1,-1.3 -0.9,-2.1 0,-0.4 2.3,-2.3 1.6,0.1 1.9,0.6 0.3,0.6 -0.6,0.6 0.3,0.3 0.5,0 1,-0.2 1.3,-0.9 4.1,-1 0.8,0.2 1.7,1.1 3.2,-0.4 1.1,-0.4 1,-1 1,-0.6 1.7,-0.5 0.8,0.1 0.1,0.8 -2,4 -0.2,1.5 -0.5,1.1 -0.8,1 -0,0.9 0.6,1.4 -0.3,2.5 0.9,-1.2 0,-1.4 1.5,-3 1.1,-3.2 1.1,-1.6 0.3,-0.3 0.8,-0.1 0.6,-0.3 1.8,-0.2 0.9,-1.4 1.5,-1.7 1.4,-2.3 0.5,-0.5 0.8,0.5 0.6,-0.5 1.6,2.3 1.2,0.6 -0.1,-0.7 -0.3,-0.8 0.6,-1 3.5,-0.5 -1,-0.3 -3.5,0.5 -0.3,-0.2 0.3,-2.4 0.5,-0.3 0.7,0.4 1,0.1 1.1,-3.1 -0.7,-1.4 0,-0.7 1.2,-1.8 2.8,-2.5 0.4,-0.1 1.1,1.1 2.9,-2.1 0.5,-0.1 0.4,0.5 0.1,0.6 -0.3,0.7 1.1,-0.2 0.8,-0.6 0.4,-0.8 0.6,-0.2 0.3,0.1 0.7,1.4 1.3,1.2 0.2,-0.6 -0.1,-0.4 -1,-0.5 -0.1,-0.3 -0.1,-1.2 0.2,-0.4 0.4,-0.2 2.3,0.3 1.2,0.7 0.6,1 1.6,0.7 1.6,-0.8 0.5,2.1 -0.5,0.3 -0,0.6 0.9,-0.5 1.2,-2.4 0.4,0.2 -0.2,1.3 0.4,0.4 2.5,-0.3 0.5,0.7 0.5,1.7 -0.6,0.9 0.8,-0.5 0.3,0.4 1.9,0.1 3.5,-1.2 -0.3,1.6 -0.8,1.8 1.5,-0.5 0.6,-0.6 0.6,1.6 0,0 -0.8,0.5 -0.5,1 0.2,1.4 -0.7,4.4 -0.6,0.7 -1.1,0.1 -0.1,0.6 0.3,0.5 1,-0.2 0.4,0.5 -0.1,1.6 -0.9,3 -0.4,0.7 -1.7,1.6 -0.5,2.4 0.1,1.6 -3.7,3.1 1,1.6 -0.8,0.8 0.2,1.8 -0.5,1.3 -0.8,1.4 -1.5,1.8 -2,1.5 -1.6,4.7 -0.3,1.9 -0.5,1.2 -2.4,2.3 -1.1,0.5 -0.6,2.9 -1.6,1.2 -0.4,1.1 -1.6,2.2 -1.2,0.9 -2.4,-0.2 -14.7,11.8 0.5,0.1 0,0 2.3,0.8 1.9,-0.2 1.3,0.1 1,1.7 0.4,0.3 0.9,0.1 1.3,1.2 -0,0.6 -0.4,0.7 -0.7,0.4 -1,0.1 -0.3,0.3 0.1,1.4 1,1.3 -0.9,2.8 -0.6,0.5 -1.5,0.5 -0.2,0.5 0.3,1.2 -0.2,1.3 -1.3,0.1 -1.5,1.3 -0.8,1.3 0.1,1.5 -0.2,0.5 -2.5,1.2 -3.4,1.1 -2.5,1.8 -0.2,0.3 0.4,2.2 0.1,2.7 -1.3,2.1 -1.4,1.7 -0.1,0.6 0.2,0.9 0.6,1 1.7,1.7 0.8,0.3 0.1,0.3 -0.7,4 -1.8,5.2 -1.1,0.8 -1.7,3.2 -0.2,1 -0.9,1.5 -0.7,0.8 -1.1,0.2 -1.4,0.9 -1,1.9 -1.2,1.7 -1.2,1.1 -1.1,1.6 -1.1,4.5 -1.6,3.7 z m 21.2,-130.3 -4.5,2 -3.4,0.5 -2,-0.3 -0.7,1.1 -1.8,1.2 -0.7,-0.6 -0.6,-1.5 -0.2,0.3 0.4,1.2 -0.3,0.8 -0.7,0.4 -3.8,-1.6 -0.8,0.7 -4.2,1.3 -3.2,-0.6 -0.8,-0.6 -0.2,-1.9 -0.2,-0.4 -1.1,-1 -1.1,-1.6 -0.2,-1.8 0.5,-2.8 0.6,-0.4 1.8,0.4 0.9,-0.7 0.1,-0.6 -1.3,0.4 -1.2,-0.1 -0.9,-0.7 -0.2,-1.1 0.3,-5.1 0.7,-0.8 0.3,0.8 1.8,0.6 0.6,-0.1 -0.5,-0.4 -1.3,-0.2 -0.9,-2.2 0.4,-1.7 0.9,-2 1.3,-1.3 1,-0.6 1.3,-0.5 1.3,-0.1 3.5,0.5 7.2,1.8 3.7,-0.5 0.1,-0.3 1.1,-0.6 2.2,-0.4 2.9,0.3 2.8,0.8 6.5,0.8 0.6,0.5 -0.1,1.2 -0.7,0.7 -0.7,1.5 -0.4,2.6 -0.9,3.3 -1.3,0.7 -0.3,0.7 0.2,1.2 -2,2.6 -1.4,3.5 -0.5,0.5 z m -47.2,-0.2 -0.8,-0.5 1.1,-2.2 -0.1,-1.8 0.2,-0.2 2.3,-0.5 0.9,-0.9 0.1,-0.5 -0.2,-2.3 0.9,-2.6 1.3,-1.5 2.3,-1.5 2.9,-0.2 0.7,2.4 -1.1,2.2 -0.8,3 -1.1,0.7 -1.3,2 -0.8,0.7 -4.9,3.3 -1.6,0.4 z m 28.5,-22.9 -1,-0.2 -2.5,0.1 -0.8,-0.2 -0.3,-0.3 -0.4,-1.1 0,-1.2 1.5,-0.4 1.9,0 2.2,-1.3 4.8,-0.6 0.8,0.3 0.7,0.7 -0.2,1 -2.6,1.4 -1.8,2.5 -1.1,0.5 -1.3,-1.1 z m 4.8,0 1.9,-1.2 2,0 1.6,0.6 0.5,1 0.1,0.6 -0.9,0.8 -2.9,0.3 -1.2,0.3 -2.3,-0.9 -0.2,-0.5 1.3,-1 z m -17,4.4 -0.5,-0.3 -0.6,0 -1.5,-0.7 0.2,-1.2 0.6,-0.9 1.9,-0.4 2.4,-0.9 1.3,0.1 0.8,0.7 0.1,0.1 -1.9,1.6 -1.1,0.3 -1.7,1.4 z m 9.4,-9.7 -0.8,-0.3 -0.2,-1.7 0.1,-0.6 1.2,-1.3 2.5,-0.9 0.2,0.1 0.5,0.7 0,0.9 -1.9,2 -1.6,1.1 z m -13.8,20.2 -0.1,-0.4 0.2,-0.9 1,-2.8 2.6,-1.7 0.7,-0.3 0.7,0.1 -0.2,1.8 -1.6,0.4 -1.6,2.2 -1.8,1.6 z m 10.9,-17.6 -1.2,-0.3 -0.3,-0.5 0.9,-1 0.7,-4 0.9,-1.2 0.3,0.1 0.1,0.3 -0,2.5 0.6,1.9 -0.3,0.9 -1,0.4 -0.6,0.8 z m -14.8,10.2 -0.3,-0.2 0.1,-0.6 0.6,-0.4 1.2,-1.7 0.8,-1.5 0.7,-0.7 1.4,-0.5 -0.2,1.5 -0.4,1 -1.7,1.7 -2.2,1.5 z m 13.9,-7 -0.6,-0.1 -0.8,-0.7 -1,-1.6 -0.1,-0.4 0.2,-0.3 0.8,-0.6 1.9,0.8 0.3,0.4 0.2,2.1 -1,0.4 z m -5.4,30.6 -0.7,-0.1 -0.9,-0.5 -0.7,0.5 -0.8,-0.3 -1.7,-1.7 0,-0.6 1.3,-0 3.1,1.3 0.3,1.5 z m -21.1,-5.5 0,-1 -0.2,-0.3 0.6,-1 2.4,-0.9 0.8,0.4 0.9,0.9 -0.3,0.3 -1,0.5 -2.5,0.4 -0.6,0.7 z m 12.7,-6.7 -0.2,-0 0,-0.3 0.5,-0.9 1.8,-1.6 0.4,-1.2 0.1,-1.3 0.2,-0.3 0.3,0.4 0,1.5 -0.9,2.7 -0.6,0.6 -1.7,0.5 z m 6.3,-9.9 1.6,-3 0.9,-0.2 0.7,0.2 0.3,0.9 -0.6,0.7 -2.9,1.4 z m 31.4,19 -0.8,-0.3 -0.3,-1.1 1,-1.7 1.1,-0.3 0.2,0.1 -0,0.7 -0.7,2.2 -0.4,0.4 z m -33.5,-19.5 -0.5,-0.2 0.3,-2 1.3,-1.8 0.2,0 1.3,0.9 -0,0.2 -1.6,0.6 -1.1,2.2 z m 2.2,5 0.7,0 -0.4,0.5 -0.9,0.3 -0.1,1.1 -0.8,0.7 -1.7,0.8 -0.2,-0.2 0.3,-0.8 0.5,-0.6 1.7,-1.7 0.9,-0.1 z m -22.6,10.2 -0.6,-0.2 -0.1,-0.3 0.4,-0.4 3.6,-1.6 0.5,0.7 -0,0.2 -1.4,0.7 -2.5,0.9 z m 63.5,-4.8 -1,-0.2 -0.8,-0.8 0.9,-1.2 1.3,-0 0.2,1.2 -0.1,0.6 -0.5,0.5 z m -37.2,-18.9 -2.4,0.7 -0.6,0 -0.2,-0.2 1,-1 1,-0.5 1,0.2 0.4,0.3 0.1,0.2 -0.1,0.2 -0.4,0.1 z m -5.3,8.6 -0.1,-0.8 0.2,-0.5 2.5,-1.5 -0.9,2 -0.8,0.6 -0.9,0.1 z m 2.1,4.5 -0.5,-0.1 -0.1,-0.2 0.8,-1.5 1.2,0 -0.1,1.4 -1.3,0.5 z m 28,15.8 -0.3,-0.2 0.9,-1.6 0.7,-0.4 0.2,0.8 0.5,0.4 -0.3,0.5 -0.4,0.3 -0.6,-0.2 -0.7,0.4 z m -26.7,-23.3 -0.9,-0.1 0,-0.2 2.4,-1.8 0,1 -0.2,0.6 -0.2,0.3 -1.1,0.2 z m 67.5,10.2 -0.4,-0.5 0.2,-0.8 1,-0.9 0.2,0.1 0.2,1.8 -1.3,0.3 z", "PB": "m 610.7,199.4 -2.5,-2.1 -0.8,-0.3 -2.6,-0.2 -2.3,1.1 -1.5,1.3 -0.5,1.8 -1.9,1 -2,0.5 -1.1,-0 0,0.6 -0.8,0.5 -2.2,0.3 -3.9,-0.3 -1.6,0.9 -0.6,0.6 -1.8,0.1 -0.9,0.7 -0.5,0.8 0.4,0.7 0,0.5 -0.4,0.5 -1.8,1.5 -1.3,0.2 -1.6,0.8 -1.6,-0.8 -0.9,-0.9 -0.3,-2.2 0.2,-0.5 -0.2,-0.3 -1.1,-0.3 -0.4,0.3 -1.5,0.2 0,-0.5 2.5,-2.6 0.2,-0.4 -0.7,-1.9 -0,-0.5 0.4,-0.8 3,-1.1 0.1,-0.3 -0.5,-1.4 -3.5,-1.9 -1.5,0.4 -2.2,1.3 -0.9,1.5 -1.5,0.9 -1.1,0.3 -2.7,1.9 -1.5,1.6 -1.6,0.2 -2.6,1 -0.8,-0.3 0.1,-0.7 -0.6,-1.2 -0.4,-0.1 -0.9,0.7 -1.5,0.3 -1,-0.3 -1.4,-1.9 -0.4,-0.1 0,0 -0.2,-0.2 1.2,-1.1 1.6,-3.5 -0.3,-1.2 -0.7,-0.1 -1.2,-0.9 0,-1.7 -0.3,-0.7 -0.6,-0.3 -0.2,-0.4 0.1,-0.9 0.2,-0.4 1.1,-0.6 0.7,-1.3 -0.5,-1.3 1,-3 0.8,-1.1 0.1,-0.5 0,0 0.6,-0.5 1.9,1.6 0.9,0.4 2.9,0.6 1.2,-1.1 3.2,-1.7 0.8,-0.7 0.1,-1 0.4,-0.9 3.2,-1.2 1.4,-0.1 3.3,-1 0.6,0.1 0.5,0.4 0,1.2 -3,3.2 -0.4,1 -0.4,1.7 -0.4,0.4 -0.8,0.2 -0.2,0.3 -0.1,1.7 3.5,0.5 0.3,0.2 0.3,1.4 0.3,0.2 3.1,-1.3 1.8,-0.1 1.9,0.3 0.9,1.2 -0.5,1.5 0.8,0.7 2.4,-0.9 0.5,-0.7 0.6,-1.2 -0.5,-0.9 -0.2,-1.4 0.5,-0.6 1,0.3 -0.5,-1.5 -0.7,-0.8 0.3,-1.5 1.8,-1.4 1.4,-0.1 0.4,0.4 -0.1,1 0.6,0.5 3.4,0.4 0.5,0.3 5.8,-0.4 2.2,0.3 2.5,1.1 1,-0.4 3.5,0.2 0.9,-0.2 0,0 0.1,2.4 1.4,4.4 0.1,0.6 -0.2,0.9 -0.4,0.5 -0,0.9 0.6,-0.7 0.5,-1.5 0,2 0.6,1 -0.3,5.2 -0.4,0.6 z", "PR": "m 397,499.7 -5.2,-0 -0.3,0.4 -1.7,0.2 -0.8,-0.1 -0.1,-0.4 -1.6,0.6 -1.4,1.4 -3.4,2.1 -1.4,-0.2 -1.2,-0.6 -3.1,-2.6 -1,-0.4 -0.8,-0 -2.8,0.7 -2.3,0.2 -0.8,-0 -1.4,-0.8 -1.1,0.1 -1.5,0.7 -0.6,1.5 -0.7,0.9 -1.9,1 -3.6,-0.4 -2,1.1 -0.7,0.8 -0.7,1.6 0.8,3 -0.9,0.9 -0.9,0 -0.8,0.4 -0.2,0.5 -1.3,-1.9 -4.2,0.1 -3.8,-0.4 -1.6,-1.2 -0.2,-0.4 -1,-0.6 -4.3,-0.4 -5.3,-1.7 -2.3,0.6 -2.7,-0 -2,-1.4 -0.3,-0.5 -1.1,-0.2 -0.5,-0 -0.7,0.4 -3.6,-0 0,0 -0.2,-1.2 -2.5,-4.2 0,-2.6 -1,-2.9 -3.4,-2.4 -1.1,1.1 -2.1,-0.1 -1.1,0.4 -1.1,0.9 -1.5,-1.1 -0.8,0.1 -0.3,-2.2 0.7,-1.6 1.1,-1.3 1.2,-2.2 0.1,-0.3 -0.5,-0.8 0,-1.2 0.9,-3.6 1.3,-3 -0.2,-2.3 1.3,-2.4 -0.2,-1 -0.8,-0.9 -0.3,-1.6 0.7,-1.1 0.8,-0.5 0,0 2.4,-1.6 0.4,-0.8 1.6,-7.9 0.3,-0.3 1.1,-0.3 1.7,-1 0.7,-0.7 1.4,-3.6 -0,-1.1 0.9,-2.3 1.1,-0.8 5.4,-2.3 0,0 3.3,-2.3 3.8,0.7 4,-0.1 3.3,0.3 1.2,-0.6 0.3,-0.6 0.7,-0.4 1.2,0.3 1.5,0.8 2.5,0.5 2.6,1.1 1.3,0.1 1.1,-0.5 2.6,-0 0.8,1 1.8,0.8 3.5,0.8 0.6,0.5 0.7,1.3 1.7,0.1 0.4,-0.3 1.6,0.1 0.7,0.5 5.3,0.1 3,-0.8 1.1,1.6 3.6,2.8 0.9,1.8 0,2.7 -0.4,0.6 -0.2,0.8 0.4,1.8 1.3,1.5 -0.1,1.8 -0.4,0.6 1.5,3 1.2,1.1 0.7,0.3 0.5,0.7 -0.1,0.9 0.9,2 0.6,0.3 0.2,0.4 -0.2,1.1 -1.3,2.1 0.3,2 0.6,0.4 1,0.2 2.4,-0.1 3.4,-0.5 0.5,0.4 1.6,-0.2 1.6,0.1 1.6,1.3 -0.1,0.4 -0.9,0.7 -0.7,3.3 0.3,0.8 1.1,0.5 0.7,-0.8 1.1,-2.8 0.8,-0.2 2.1,0.6 -0.4,1.9 0.7,3.3 1.4,0.6 0.2,1.3 0,0 -1.4,1 -0.6,1.5 -0.6,-0.1 0.3,-1.9 1.4,-0.9 -1.4,0.3 -0.9,0.5 -0.9,-0 -0.3,-0.4 -0.6,-0.2 -0.5,0.4 -0.3,0.9 0.5,0.8 -0.7,1 -0.3,0.1 -2.5,-0.5 -0.8,-0.5 -0.5,0.1 -0.2,0.9 0.3,0.4 1.6,0.6 1.4,-0.2 2.1,0.6 0.3,0.5 -1,0.7 -1.5,2.8 -1.2,0.8 -2.4,0.6 -0.2,0.5 3,-0.2 0.1,1.2 z", "PE": "m 558.5,227.5 -1.2,-3 -0,-0.9 -2.1,-0.9 -0.5,-0.4 -0.5,-0.8 0.6,-0.9 -0,-0.6 -0.5,-0.3 -1,0 -0.4,0.4 -0.3,1.7 -0.4,0.1 -0.4,-0.3 -0.5,-1.6 -1.6,-1.1 -3,-0.4 -2.4,-0.8 -1.4,-0.8 -0.8,-1.4 -1.5,-0.6 -0.6,0.1 -2.5,1.5 -1.6,0.4 -0.8,2 -2.2,0.5 -0.3,0.2 0.2,1.4 -0.2,0.6 -1.1,1.2 -2.4,1 -0.6,-0.1 -0.8,-0.5 -0.8,0.2 -0.5,0.9 -0.8,3.6 -2.9,0.9 -0.8,0.9 -1,0.2 -1.8,-0.6 0.9,-1.7 -0.3,-2 -2.2,-0.9 -0.7,-1.9 0.1,-2.7 -0.4,-0.5 -2.8,-1.4 -2.2,-0.3 -1.2,0.3 -0.9,-0.4 0,0 2.6,-1.3 2,-1.7 0.5,-0.9 2.3,-1.3 1,-0.3 3.9,-3.9 0.7,-1.8 0.1,-2.3 -0.3,-0.5 -1.6,-1.6 0.1,-2.2 -0.6,-1.1 -0.1,-0.9 0.1,-0.5 0.5,-0.3 1.8,-0.2 0,0 4.9,0.2 0.9,0.2 1.6,-0.2 2.1,-0.8 1.3,-0.1 3.1,0.4 2.9,1.9 1.8,0.8 0.5,1 1,1.1 1.4,0.5 0.8,0.6 0.6,1.6 1.6,-0.1 1.5,-2.3 1.1,-0.8 1.6,-0.5 0,0 0.4,0.1 1.4,1.9 1,0.3 1.5,-0.3 0.9,-0.7 0.4,0.1 0.6,1.2 -0.1,0.7 0.8,0.3 2.6,-1 1.6,-0.2 1.5,-1.6 2.7,-1.9 1.1,-0.3 1.5,-0.9 0.9,-1.5 2.2,-1.3 1.5,-0.4 3.5,1.9 0.5,1.4 -0.1,0.3 -3,1.1 -0.4,0.8 0,0.5 0.7,1.9 -0.2,0.4 -2.5,2.6 -0,0.5 1.5,-0.2 0.4,-0.3 1.1,0.3 0.2,0.3 -0.2,0.5 0.3,2.2 0.9,0.9 1.6,0.8 1.6,-0.8 1.3,-0.2 1.8,-1.5 0.4,-0.5 -0,-0.5 -0.4,-0.7 0.5,-0.8 0.9,-0.7 1.8,-0.1 0.6,-0.6 1.6,-0.9 3.9,0.3 2.2,-0.3 0.8,-0.5 0,-0.6 1.1,0 2,-0.5 1.9,-1 0.5,-1.8 1.5,-1.3 2.3,-1.1 2.6,0.2 0.8,0.3 2.5,2.1 0,0 0.9,0.2 0.6,1.2 -1.3,1.7 -0.1,0.6 0,0.5 0.7,0.4 0.3,0.5 0.2,1.1 -2,6.4 -3.2,8.9 0,0 -0.3,-0.2 -2.9,-0.3 -1.9,-0.8 -1.5,0.2 -2.6,1.3 -2.2,-0.8 -2,0.2 -1.6,1.2 -0.1,0.5 -2.2,2.3 -1.8,1.1 -1.2,-0.1 -1.9,1.1 -1.2,0.1 -3.1,-0.3 -2.5,0.7 -1.9,-0.5 -1.8,-1.1 -1.9,-2.1 -2.5,-2 -1.1,0.1 -1.7,-0.3 -1,-1.2 -0.8,0.6 -0.1,0.7 -2.4,3.3 -2.2,0.8 -0.6,1.1 z", "PI": "m 506,127.2 1.3,0.1 0.7,-0.2 2.2,0.5 1,0.8 0.3,0.6 0,0 -0.1,0.8 -1.1,1.9 -1.6,2 -0.2,1.5 0.3,1.3 1.8,4.7 3.1,6.4 0.4,1.7 1.4,1.6 -0,0.8 -0.7,1.4 0.8,3.9 -0.5,1.6 1,2 0.6,3 -0.6,1.6 -0.8,0.6 0.9,0.7 0.1,0.4 0.9,8.2 -0.2,0.5 0.8,2.6 1.1,5.2 1,2.7 1.3,0.7 2.6,0.5 0.8,1.2 -0,0.7 -1.5,2.2 -1.1,3.1 0.1,1 0.7,0.7 -0.1,1.3 0,0 -1.8,0.2 -0.5,0.3 -0.1,0.5 0.1,0.9 0.6,1.1 -0.1,2.2 1.6,1.6 0.3,0.5 -0.1,2.3 -0.7,1.8 -3.9,3.9 -1,0.3 -2.3,1.3 -0.5,0.9 -2,1.7 -2.6,1.3 0,0 -0.5,1.2 -1.5,2.3 -1.1,0.7 -0.8,-0.2 -2,0.4 0.1,2.4 -1.9,1.8 -0.3,-0.1 -0.6,-0.6 -2.2,-0 -0.8,1 -0.8,0.4 -2.7,0.3 -1.5,1.3 -0.8,1.2 -1.7,0.1 -1.5,0.6 -3,0.1 -0.8,-0.3 -0.2,-0.3 0.1,-0.7 -1.7,-1 -1.3,-0.4 -1.4,0.6 -2.1,0.4 -0.3,-0.2 -0.4,-0.9 -1.5,-0.5 -1.9,0 -3.2,1.6 -0.1,0.9 2.2,4.4 0.1,1.1 -0.3,2.6 -0.2,0.9 -0.7,0.9 -3,5 -3,2.4 -1.4,0.4 -1.5,-0.5 -1.3,-0.2 -2.2,0.8 -1.2,0.9 -0.7,0.9 -1.1,0.4 -0.8,1.4 -0.3,0.2 -2.1,-0.2 -1.8,0.5 -4.2,-1.9 -1.8,-2.5 -0.5,-2.2 -0.7,-1 -1.4,-1.3 -2.3,0 0,0 -2.9,-0.2 0,0 0.1,-1.9 0.3,-1.1 1.1,-2.5 0.1,-6.4 0.8,-1.4 0,-0.5 -1.7,-3.1 -0.5,-3.2 -0.7,-1.9 0.7,-2 1.7,-1.4 1.2,-2.5 0.1,-1.5 0.3,-0.8 0.3,-0.2 1.4,-2.7 0.6,-2.3 0.4,-3 1,-3 2.1,-1.9 2.7,-0.8 2.6,-0.3 1.1,-0.4 1.7,-1.5 1.1,-0 1.3,-0.5 2.9,-2.6 2.3,-0.9 2,-2 0.6,-0.9 0,-0.5 1.9,-1.9 0.5,-0.2 0.8,-0.2 0.2,0.3 1.1,-0.3 1,-0.6 1.5,-0.2 1,0.2 2.5,1.8 1.5,-0.1 2.4,-0.9 0.8,-0 0.7,0.3 2.3,-0.3 1.2,-1.3 0.5,-1.5 0.1,-1.2 0.3,-0.4 0.4,-2.2 -0.1,-0.8 -0.2,-0.5 -1.6,-0.9 -1.8,-2 -0.5,-2.3 -0.1,-2.1 0.2,-2.5 4.1,-4.4 0.2,-0.6 0.1,-2.4 -0.6,-3 -1.6,-2.8 1.1,-2.9 0.3,-1.5 -0.4,-1.3 -1.2,-0.8 -0.3,-1.9 0.8,-1.1 0.6,-0.2 0.8,-2 1.9,-1.9 0.9,-1.8 -0,-1.8 2.9,-3.4 0.8,0.2 3.3,-0.5 4.1,-4 1.8,-2.3 0.4,-1.5 -0.6,-0.5 -0.2,-0.7 0.5,-1.4 0,0 0.7,0.1 1.5,0.9 0.5,0.5 -0.1,0.3 z", "RJ": "m 468.6,450.5 -0.1,-0.8 0.4,-0.3 3.2,0.2 2.6,-0.6 -2.5,-1.6 -1.4,-0.5 -2.8,0.7 -1.4,1.6 -1,0.3 -0.7,-0.1 -1.4,-2.1 -0.5,0 -0.9,0.4 -1,1.1 -3.1,0.8 -0.3,0.9 -0.2,1.9 2.2,0.1 1.1,1 -1.1,1.1 -0.9,-0.2 -1.4,0.2 0,0 -0.5,-0.3 -1.6,-1.7 -0.1,-0.4 1.1,-3.5 1.1,-1.1 2.4,-1 0.5,0.1 2.8,-0.4 1.5,-0.7 1.6,-2.1 -0.8,-1.6 -1.7,-0 -3.1,0.5 -1.8,-0.4 -1.2,-1.6 -0.6,-1.2 -1.3,-0.5 0,0 0.7,-0.5 2.4,-0.7 2.9,-1.3 2.6,-0.2 0.5,0.3 1.7,-0.8 1.1,-0.8 4.1,-1.8 0.5,-0.1 0.4,0.3 3.2,-0.1 1.2,-0.2 1.6,-0.9 0.6,-0.1 2.5,0.3 0.5,0.2 -0,0.5 1.4,-0.2 9.5,-4.5 2.5,-1 0.2,-0.5 -0.3,-0.6 -1.4,-0.1 0.1,-0.8 1.9,-3.7 2.4,-6 -0.7,-0.7 0.6,-0.5 1.2,-0.3 2.5,-2.4 0,0 1.9,0.8 0.7,4.7 2.5,1.1 4.3,1 3,-0.4 1.6,1.1 0,0 -0.1,1.3 -0.9,1.6 -0.2,2.1 1.1,6.8 -0.5,0.7 -3.1,1.8 -6,1.9 -2.8,1.7 -3.5,3.7 -0.1,1.7 0.3,1.2 -0.2,1.6 -0.7,1.5 -1.8,0.5 -6.5,-0.2 -5.8,0.7 -2.4,-0.5 -0.5,-0.4 -0.1,-0.7 1,-1.5 0.7,-1.4 -0.1,-0.6 -0.8,-0.2 -2.8,1.1 -0.3,0.7 0.3,0.8 1.4,1.2 0.2,1 -0.6,0.5 -1.6,0.5 -1.6,-0 -8,1.1 -1.5,0.5 z m -5.1,2 -0.7,-1 2.1,-1.6 1.9,0.9 0.4,0.7 -2.5,0.5 -0.4,-0.3 -0.5,0 -0.4,0.7 z", "RN": "m 609.6,183.2 -0.9,0.2 -3.5,-0.2 -1,0.4 -2.5,-1.1 -2.2,-0.3 -5.8,0.4 -0.5,-0.3 -3.4,-0.4 -0.6,-0.5 0.1,-1 -0.4,-0.4 -1.4,0.1 -1.8,1.4 -0.3,1.5 0.7,0.8 0.5,1.5 -1,-0.3 -0.5,0.6 0.2,1.4 0.5,0.9 -0.6,1.2 -0.5,0.7 -2.4,0.9 -0.8,-0.7 0.5,-1.5 -0.9,-1.2 -1.9,-0.3 -1.8,0.1 -3.1,1.3 -0.3,-0.2 -0.3,-1.4 -0.3,-0.2 -3.5,-0.5 0.1,-1.7 0.2,-0.3 0.8,-0.2 0.4,-0.4 0.4,-1.7 0.4,-1 3,-3.2 -0,-1.2 -0.5,-0.4 -0.6,-0.1 -3.3,1 -1.4,0.1 -3.2,1.2 -0.4,0.9 -0.1,1 -0.8,0.7 -3.2,1.7 -1.2,1.1 -2.9,-0.6 -0.9,-0.4 -1.9,-1.6 -0.6,0.5 0,0 -0.7,0.4 -0.6,-0.2 0.3,-2 1.4,-2.2 0.8,-0.9 0.5,-0.1 0.8,0.5 1,-0.3 0.6,-1.1 1.5,-1.5 1.4,-2.4 -0.1,-0.7 0.7,-1.7 0.9,-0.6 0.8,-1.1 3.3,-6.7 2.6,-2 4.9,-1.6 0,0 0.5,0.8 0.9,0.8 3.1,-0 1.2,0.4 1.7,1.8 1.3,0.5 3.3,-0.3 2.9,0.5 2.5,-0.2 2.3,-0.7 4.5,0.9 1.3,0 1.9,0.9 1,0.8 0.6,0.9 2.3,4.7 0.5,1.8 -0,0.8 1.5,5.4 0.2,1.7 0.7,0.5 1,2.7 z", "RS": "m 322.3,638.8 -0.4,0 -1.9,-1.1 -0.2,-0.5 0.5,-4.3 -0.5,-4.2 0.1,-1.1 0.6,-1.2 2.8,-2.4 0.8,-1.6 2.3,-2.6 -1.5,-1.6 -1.1,-0.6 -2.2,-0.6 -2.3,-2.2 -1.2,-1.6 -0.1,-1.6 -0.4,-1.2 -1.2,-2 -2.1,-2.2 -0.7,-0.6 -2.4,-1.2 -1.4,0.2 -1.9,-1.5 -1.5,-1.6 -1.2,-0.8 -0.1,-1.7 -1.9,-2.2 -3.3,-0.5 -0.9,-0.5 -1.7,-1.7 -1.8,0.1 -2.2,-1.4 -1.9,-3.7 -1.1,-1.5 -2.5,-2.1 -0.7,0.1 -0.7,1.8 -2.6,2.2 -2.7,0.1 0.1,-2.9 0.4,-1.3 -0.4,-1 -3.6,-4.3 -2.4,-1.8 -2.2,-2.1 -1.8,-2.1 -2.7,-2.2 -1.9,-0.1 -2.1,0.2 -1.1,1.4 -0.1,1 -1,1 -1.1,0 -0.6,-0.5 -3.2,0.1 -0.7,-0.5 -0.2,-0.9 -0.5,-0.2 0.8,-0.2 1,-0.7 2.5,-2.8 0.1,-1.8 0.6,-1.2 0.8,-0.5 1.3,-0.1 0.6,-0.3 0.9,-1 5.5,-6.5 0.6,-1.4 0.2,-1.1 0.8,-1.1 1.2,-0.8 1.4,-0.4 2,-4.2 0.1,-0.6 0.3,-0.4 1.6,-0.9 1.6,-1.8 0.8,-1.1 0.5,-1.3 1.3,-2.1 0.9,-0.3 1.6,0.2 0.6,0.8 0.5,-1.3 -0.2,-0.6 -1.4,-0.8 -0.1,-0.4 0.3,-0.3 1.1,-0.4 0.8,-1 2.8,-0.9 1.1,-1.1 0.1,-0.9 0.8,-0.9 2.2,-1.1 2.5,-0.4 1.8,-1.8 0.1,-1.1 1.3,-2.4 0.3,-0 0.1,0.4 0.3,0.2 1.3,-0.2 2.4,-1.1 2.7,-0.6 1.2,-0.6 2.1,-2.4 0.5,0 0.7,-0.4 1,-1.4 2.3,-0.7 0.3,0.4 0,0 3.5,0.4 3.3,-1.1 0.6,-0.8 1.4,0.6 -0.1,0.9 3.1,-0 1.6,1 2.6,-0.4 1.9,1.1 2.6,-0.4 1.5,0.2 2.8,-0.2 2.3,0.9 2.5,1.4 1,2.4 1.6,0.2 0.1,-0.5 1.8,-0.3 5.6,3.5 1.4,1.6 0.7,-0 1.6,1 3,3.5 1.6,2.2 0.5,1.5 2.2,2.7 1.2,0.6 6.7,1.1 2.1,-0.4 3.4,0.3 0.9,2.3 -2.1,1.6 -1.3,0.4 -0.7,1.9 0.2,2.2 -0.4,1.6 -0.5,1.3 -1.2,0.2 -1.3,1.7 -0,1.4 1.8,1.2 0.3,-0.2 -0.3,-1 0,-1 1.5,-0.8 1.6,0.6 0.7,0.9 1.2,0.8 0.5,-0 0,0 -1.4,1.7 -3.9,7 -4.2,11.6 -6.3,10.5 -5.4,6.7 -6.5,6 -6.1,3.7 -3.1,4.3 -0.2,-0.4 0.7,-1.6 0.3,-2.2 -1.2,-1.7 0.1,-0.4 0.9,-0.2 1,0.4 0.6,0.6 1,0 2.6,-1.4 0.8,-0.7 2.9,-3.7 0.8,-0.7 0.5,0.2 1,-0.2 1.1,-0.8 0.9,-1.3 0.4,-1.5 0.2,-0.9 -0.2,-2.1 0.2,-1.4 1.6,-0.1 0.7,0.3 0.3,0.8 0.3,-0.3 -0.3,-1.4 0.5,-2.1 0.5,-0.6 2.7,-1.6 0.7,-1.1 0.5,-2.8 -0.2,-2.3 0.6,-0.7 0.5,0.8 0.4,0 0.4,-0.4 0.5,-3.1 -0.1,-0.4 -0.9,-1.2 -0.7,-0 -0.3,0.7 0.2,0.4 -0.1,0.6 -0.3,0.2 -1.5,-0 -2,0.4 -0.3,1.6 -0.5,0.1 -0.8,-0.4 0.1,-1.7 -0.8,-0.9 -1,0.3 -0.6,-0.5 -0.7,-1.3 -0.4,-1.4 0.1,-0.6 -0.6,-0.7 -0.6,2.7 0.4,2.2 1.2,2.1 -0.6,0.8 -0.7,2.5 0.4,3 -0.2,0.8 -0.5,-0.4 0.3,-0.2 -0,-0.7 -0.5,-1.3 -0.5,-0.4 -0.5,0.7 -0,1.4 -1.4,3.3 -0.1,1.9 0.2,0.5 -0.7,0.7 -1.6,0.6 -0.6,1.6 -4.1,1.6 -0.7,0.5 -0.5,1.6 -0.1,2.3 -1,2.3 -2.4,1.3 -0.1,1.8 0.5,0.8 0.2,1 -0.9,0.6 -0.2,1.5 0.4,0.6 0.7,-0.1 1.3,0.6 0.1,0.9 -2.1,1.6 -2.3,4.5 -1.9,6.9 -2,4.5 -1.7,2.5 -7.8,7.5 z", "RO": "m 187.6,291.2 -1.3,-1.4 -0.4,-1.9 -1.6,-0.5 -0.9,0.3 -1.8,0.1 -4.1,-1.8 -0,-0.4 -0.7,-0.6 -1.3,0.6 -2,-1.7 -1.5,-1 -0.9,-1.5 -0.3,-1.4 -1,-0.4 -1.8,1.1 -1.2,-0 -1.4,-0.8 -0.9,-1.3 -3.1,-1.6 -2,-0.2 -1.1,0.5 -0.9,0.8 -1.4,-0.2 -0.3,-0.3 -2.1,-0.5 -3.1,-0.3 -0.8,-0.4 -1.2,-1.2 -0.3,-2 -1.6,-0.5 -1.9,-1 -0.8,-1.7 -0.3,-0.2 -2.7,-0.3 -0.4,-0.3 -0.8,-3.7 -0.9,-0.9 -0.5,1.2 -0.7,-0.3 -0.3,-0.6 0.6,-1.5 -0.8,-1.5 -1.4,-0.4 -1.3,-3.5 -0.2,-1.7 1.6,-2.9 -0.2,-1.7 -1.2,-2 -0.8,-2.2 -0.1,-2.3 0.6,-0.5 0.4,-1.4 1,-1.1 0.4,-1.5 -0.2,-1.5 -0.4,-0.9 -0.1,-1.5 0.5,-1.6 -1.2,-2.2 -1,-0.4 -1.1,1 -0.1,0.5 -0.8,1 -0.6,0 -2.2,-1 -5.2,0.1 -5.6,1.8 -1.7,-0 -1.5,0.5 0,0 -3,-1.3 0,0 3.3,-2.6 1.9,-0.6 1.6,-1.8 0.1,-0.6 -0.2,-1.3 4,0.3 2.9,-0.3 0.7,0.4 2.3,2.3 0.4,-0 1.2,-0.8 0.1,-0.7 0.4,-0.5 1.1,-0.5 0.8,0.1 1.4,-0.4 1.3,-1.2 1.8,-1 0.4,0.1 0.6,2.3 0.7,0.5 0.7,-0.1 2.5,-3.2 -0.3,-1.8 0.5,-0.8 1.8,-1.3 0.5,0 0.8,0.6 1.8,0.1 1.2,-1.1 2.1,-0.4 3.9,0.5 -0.2,-1.5 0.1,-1.8 2.1,-1.2 0.8,-1.1 0.4,-1 -0.2,-0.5 -0.9,-0.7 0.1,-0.7 1.2,-1.6 2.5,-0.5 0.3,-0.2 -0.1,-1.2 1.7,-0.5 1.4,-2.6 10.8,-0.1 2.1,1.1 0.5,0.5 0.8,1.9 1.3,1.3 2.5,1 1.2,3.3 0.5,0.2 1,-0.1 0.6,0.2 0.7,2.9 3.2,1.5 0.7,-0.2 0.5,-1.7 1.9,-1.1 1.4,0.3 0.4,0.4 -0,0.7 0,0 1.4,1 0.6,1.2 -0.8,1.4 -1.3,5 0.1,0.3 0.8,0.5 0.3,0.6 0.1,1.4 0.8,2.3 -0.9,1.7 0.4,1.9 -1,3.5 -0,0.8 0.3,1.8 1.5,2.8 -0.9,9 17.2,0.1 -0.2,0.6 1.2,1.1 3.5,-0.1 1.1,0.1 1.1,0.4 1.4,3.6 -0.2,0.8 -1.4,1.8 -1.4,1.1 -0.1,1.3 0.4,3.2 0.6,0.5 0.9,-0 1.5,3.3 -0,2 0.6,1.5 -0.1,1.7 -0.6,2.2 -1.7,2 -0.5,2.2 -0.6,0.8 -0.4,0.4 -1.6,0.5 -0.9,1.1 -1.4,3.8 -0.5,2.5 -4.1,2.6 -1.5,1.4 0,0 -0.7,-0 -2.6,-1.6 -1.3,-1.4 -7.1,1 -1.3,-0.4 -0.2,-0.3 -3.4,0.7 -0.5,-0.2 -0.5,-1.4 z", "RR": "m 234.9,61.7 1.6,17 0,0 -18.5,-0.1 0,0.7 -2.3,3.3 -1.7,3 -0.1,1.1 -1.1,2.6 -0.1,0.7 0.2,0.7 1.1,1.4 -0,0.5 -0.4,0.4 -2,0.6 -1.4,1.4 -1.2,0.5 -1.8,-0.2 -0.9,-2.5 -1.9,-2 -2.8,-0.9 -1.6,0.1 -0.6,0.9 -2.1,0.7 -1.3,0.7 -1,1.3 -0.8,3 0.4,1.8 -0.2,1.7 -0.8,2.3 0.4,2.1 -2.4,-1 -1.3,0.4 -0.5,-0.1 -1,-2 -1.5,-1.6 -2,-1.3 -0.5,-0 -5,-4.4 0.1,-1.1 1.8,0.3 1.1,-1.3 0.1,-0.6 -1.1,-4.3 -0.6,-0.9 -1.2,-0.8 -0.9,-2.2 -0.3,-5 0.6,-1 0.8,-3 -0.7,-1.6 -0.4,-1.6 1.6,-1.5 -0.1,-0.5 -0.9,-1.1 -0.2,-2.3 -1.7,-4.8 -2.7,-3.7 0.7,-1.5 0.9,-3.3 -0.5,-0.7 -1.9,-0.9 -1.4,-0.1 -0.9,0.2 -1,-0.4 -1.2,-1.2 -0.1,-1 -0.6,-0.1 -1.1,0.4 -0.6,-0 -0.8,-0.3 -0.7,-0.8 0,0 0.3,-0.5 0.2,-2.3 -0.3,-0.2 -3.4,-0.2 -3.8,0.1 -3.3,-0.7 -0.2,-0.6 0.8,-1.8 0.1,-1.5 -0.7,-1.8 -1.9,-3.5 -0.7,-2.1 -0.5,-3.7 0.8,-1.5 -0.1,-1 -1.8,-2 -2.2,-1.1 -2.8,-2.8 -1.1,-1.8 -0.3,-1 -1.1,-0.7 -0.2,-0.4 0,-0.8 0.3,-0.3 0.9,0.1 1.1,0.7 0.9,1.7 0.6,0.1 3.4,-0.5 1.4,0.1 1.9,0.6 0.6,1.2 0.6,1.9 0.5,0.3 1,-0.1 0.7,-0.7 0.9,-0.4 3.2,0.2 0.5,0.1 1.3,1.2 0.6,0.1 0.5,-0.1 0.6,-1.6 1.3,0.1 1.4,0.9 3.9,4.6 1.1,0.6 0.7,0.1 1.5,-0.7 0.7,-1.1 0.1,-0.8 -0.8,-2.8 0.4,-1.7 0.5,-0.3 1.9,-0.1 1,-1.1 1.6,-1.1 0.8,0.1 3.9,1.3 0.6,-0.2 0.8,-0.7 1,-0.3 1.1,0.3 1,-0.2 1.3,-1.3 1,-0.2 1.1,0.2 1.1,-0.1 0.7,-0.8 0.1,-1.4 3,-1.8 2.3,0.2 2.8,-0.4 0.9,-1.1 0.1,-0.7 0.6,-1.1 0.8,-0.1 1.9,-0.9 1.1,-1 1.1,-1.7 -1.2,-3.6 -1.2,-0.4 0.6,-0.2 1.4,0.1 0.8,0.3 3.6,-0.1 1.1,-0.9 0.7,-0.2 1.4,0.4 0.5,1.3 1,0.8 0.5,1.4 -0.7,4.9 -0.7,1.4 -1.2,0.7 0.1,0.8 1.6,0.4 1.6,-0.2 2.4,0.8 1.8,1.1 -0.9,1.4 -0,1.1 2.3,3.4 0.2,1.6 -1.5,2.9 -1.9,1.4 -0.7,1.5 0.3,0.4 0.1,2.2 -1.5,2.4 -0.9,2.8 -0.3,2.6 -0.1,2.7 1,1.9 0.5,1.8 -0,1.4 1.6,1 0.9,0.2 0.1,0.7 -0.5,5.2 0.1,0.7 1.8,0.3 -0.7,1.2 0.5,0.5 2.1,0.7 1.5,1.9 2.7,2.7 z", "SC": "m 379.6,558.3 -0.5,0 -1.2,-0.8 -0.7,-0.9 -1.6,-0.6 -1.5,0.8 -0,1 0.3,1 -0.3,0.2 -1.8,-1.2 0,-1.4 1.3,-1.7 1.2,-0.2 0.5,-1.3 0.4,-1.6 -0.2,-2.2 0.7,-1.9 1.3,-0.4 2.1,-1.6 -0.9,-2.3 -3.4,-0.3 -2.1,0.4 -6.7,-1.1 -1.2,-0.5 -2.2,-2.7 -0.5,-1.5 -1.6,-2.2 -3,-3.5 -1.6,-1 -0.7,0 -1.4,-1.6 -5.6,-3.5 -1.8,0.3 -0.1,0.5 -1.6,-0.2 -1,-2.4 -2.5,-1.4 -2.3,-0.9 -2.8,0.2 -1.5,-0.2 -2.6,0.4 -1.9,-1.1 -2.6,0.4 -1.6,-1 -3.1,0 0.1,-0.9 -1.4,-0.6 -0.6,0.8 -3.3,1.2 -3.5,-0.4 0,0 1.4,-2.9 0.7,-2.1 -0.6,-3.2 0.4,-3.2 -0,-2.5 1,-1.8 0,0 3.6,0 0.7,-0.4 0.5,0 1.1,0.2 0.3,0.5 2,1.4 2.7,0 2.3,-0.6 5.3,1.7 4.3,0.4 1,0.6 0.2,0.4 1.6,1.2 3.8,0.4 4.2,-0.1 1.3,1.9 0.2,-0.5 0.7,-0.4 0.9,-0 0.9,-0.9 -0.8,-3 0.7,-1.6 0.7,-0.8 2,-1.1 3.6,0.4 1.9,-1 0.7,-0.9 0.6,-1.5 1.5,-0.7 1.1,-0.1 1.4,0.8 0.8,0 2.3,-0.2 2.8,-0.7 0.8,0 1,0.4 3.1,2.6 1.2,0.6 1.4,0.2 3.4,-2.1 1.4,-1.4 1.6,-0.6 0.1,0.4 0.8,0.1 1.7,-0.2 0.3,-0.4 5.2,0 0,0 -0.4,1.3 0.5,1.6 -0.1,0.4 -1.5,1.1 -1,-0.5 -0.8,-2.5 -0,1.1 0.6,2.7 1.7,1.7 0.6,0.9 -1,2.3 -0.2,2.3 0.1,0.4 0.8,0.7 0.3,5.9 0.3,0.6 0.4,0.2 0.8,-0.5 0.3,0.7 0.1,0.9 -0.5,0.1 -0.4,-0.3 -1.2,0.6 -0.3,3.8 0.6,2.6 -0.6,0.8 0.3,1.9 0.9,1.9 -0.9,2.3 -0.5,4 -1.7,4.7 -0.3,-0.1 -0.4,-0.8 0.2,-1 -0.9,-1.2 -0.3,0.3 0.2,2.4 1.2,0.8 -0.9,1.7 -1.6,0.7 -4.1,3 -2.8,2.6 -3.8,4.4 -1,1.9 z m 17.9,-26.6 -0.1,-0.5 0.2,-1.8 0.8,-2.4 -0.4,-1.2 0.2,-1 1.4,-0.8 0.2,0.1 0.7,0.9 -0.5,2.6 -0.8,0.9 -0.6,1.2 0.2,1.2 -1.1,0.8 z m -0.5,-24.4 -1.9,-2 2.5,-2.4 0.2,0 0.7,1.1 -0.9,1.3 -0.7,2 z", "SP": "m 404.8,488.2 -0.2,-1.3 -1.4,-0.6 -0.7,-3.3 0.4,-1.9 -2.1,-0.6 -0.8,0.2 -1.1,2.8 -0.7,0.8 -1.1,-0.5 -0.3,-0.8 0.7,-3.3 0.9,-0.7 0.1,-0.4 -1.6,-1.3 -1.6,-0.1 -1.6,0.2 -0.5,-0.4 -3.4,0.5 -2.4,0.1 -1,-0.2 -0.6,-0.4 -0.3,-2 1.3,-2.1 0.2,-1.1 -0.2,-0.4 -0.6,-0.3 -0.9,-2 0.1,-0.9 -0.5,-0.7 -0.7,-0.3 -1.2,-1.1 -1.5,-3 0.4,-0.6 0.1,-1.8 -1.3,-1.5 -0.4,-1.8 0.2,-0.8 0.4,-0.6 -0,-2.7 -0.9,-1.8 -3.6,-2.8 -1.1,-1.6 -3,0.9 -5.3,-0.1 -0.7,-0.5 -1.6,-0.1 -0.4,0.3 -1.7,-0.1 -0.7,-1.3 -0.6,-0.5 -3.5,-0.8 -1.8,-0.8 -0.8,-1 -2.6,0 -1.1,0.5 -1.3,-0.1 -2.6,-1.1 -2.5,-0.5 -1.5,-0.8 -1.2,-0.3 -0.7,0.4 -0.3,0.6 -1.2,0.6 -3.3,-0.3 -4,0.1 -3.8,-0.7 -3.2,2.3 0,0 0.8,-1.1 0.7,-1.5 1.3,-1.1 7.6,-4.5 1.9,-1.9 1.3,-2.4 1.7,-1.7 0.4,-1.2 1.4,-1 0.3,-1.2 -0.3,-0.8 2,-2.3 1.2,-2.3 0.1,-0.9 -0.3,-1.9 0.2,-0.4 1,-0.5 2.6,-3.6 0.2,-2.9 0.6,-1.7 1,-0.3 0.7,-0.6 2,-2.7 1.2,-1 0.5,-0.2 1.3,-0 1.5,-0.8 0.3,-0.4 0.4,-2.5 0,0 1.2,-1.1 2.1,-1.1 1.9,-0.4 1.4,-1.7 1.5,-0.6 0.8,0.1 1.7,1.6 2.5,0.1 4.3,1 1.7,-0.4 1.6,0.2 2,-0.6 2.2,1.4 1.7,0.8 -0.1,0.9 0.3,1.4 1.2,2.1 0.6,0 0.5,-0.3 0.7,-0.9 0.4,-1.1 0.3,-0.2 0.6,0.1 0.4,0.4 0.2,1 0,2.8 1.2,0.5 0.4,-0.5 -0.3,-2.5 0.5,-1.2 0.5,-0.5 8.2,-0.7 1,-1.2 1.5,1.5 1.1,0.4 2.8,-0.7 0.4,-1 -0.2,-0.5 0.3,-0.6 2.4,-0.1 1.7,0.8 0.8,-0.6 1.3,-0.3 3.3,3.4 0.2,1 -0.6,1 -0.3,2.4 0.6,0.6 1.9,1.2 0.4,1.6 -0.1,0.6 -1.5,2 -0.2,1.9 0.8,0.7 0.3,0.6 0.4,2.2 1.3,1.8 0.8,2 -0,0.8 1.6,-0.1 0.8,-0.3 0.3,-0.4 1,-0.1 3.7,1.3 0.2,0.4 -0.1,1.3 -0.7,2.2 -1.9,2.7 0.3,2.9 -0.2,3.5 -0.5,1.6 0.7,1.6 1.8,1.2 1.8,0.8 0.5,1.7 -1.2,0.7 2,3.3 1.1,0.2 2,-0.2 0.2,0.5 3.6,-1 0.6,0.4 1.3,-0.3 0.8,-1 0.1,-0.8 -0.2,-0.2 0.2,-2.3 1.2,-0.3 0.1,0.3 -0.3,0.5 0,0.5 2.3,0.1 2.4,-0.2 1.8,-0.7 1.2,-1.2 1.9,-1 2.2,-0.2 1.2,-0.7 0,0 1.3,0.5 0.6,1.2 1.2,1.6 1.8,0.4 3.1,-0.5 1.7,0 0.8,1.6 -1.6,2.1 -1.5,0.7 -2.8,0.4 -0.5,-0.1 -2.4,1 -1.1,1.1 -1.1,3.5 0.1,0.4 1.6,1.7 0.5,0.3 0,0 -0.1,0.2 -1.7,0.4 -1.1,-0.8 -1.5,1.1 -0.4,0.7 0.3,0.2 -0.8,0.6 -3.2,1.6 -2.2,0.7 -0.3,0.4 0,1 0.5,1.6 -0.3,0.4 -1.4,0.3 -0.7,-0.6 -1.3,-0.3 -3.1,-0.5 -0.9,0.1 -1.3,0.3 -1.7,0.8 -0.5,0.5 -1.2,2.1 -1.3,0.6 -0.5,-0.1 0.6,-0.5 -0.5,-1.2 -1.2,-0.8 -0.8,1.2 0.3,0.8 -0.3,0.6 -7.6,4.2 -0.9,0.8 -0.3,1.2 -3.3,3 -3.2,1.9 -1.9,0.5 -4.5,3.2 -2.3,2 -0.7,0.1 -0.4,0.6 0.9,0.4 0.7,0.1 0.9,-0.4 0,0.8 -0.6,1.3 -1.3,0.8 -1.1,1.5 z m 44.3,-23 -1.5,-0.7 -1.2,0.2 -0.5,-0.4 0.1,-0.8 0.9,-0.7 1.1,-1.9 0.7,0.2 0.7,0.7 0.1,2.9 -0.5,0.3 z", "SE": "m 570.2,262 -2.9,0.9 -1.6,-0.6 -0.5,-0.3 -0.5,-0.7 -1.9,-0.9 -0.6,-0.5 -0.1,-0.4 0.3,-0.4 0.1,-1.4 -0.1,-0.4 -1.4,-1.5 -0.5,-1.5 -1.1,-0.7 -1,-1.6 -0,-0.8 0.6,-1.6 0.3,-0.3 1.7,0 1.1,0.8 2.5,-1 0.7,-0.6 0.3,-0.6 -0.8,-2.8 0.1,-0.9 0.7,-1.6 0.1,-3.1 -0.8,-1.1 -2,-1.9 -1.3,-2.5 -0.2,-2.1 0.7,-1.1 0,0 6.5,3 3.7,0.9 5.4,3.1 1.3,2.5 1.8,1.4 1.7,0.8 0.5,0 3.6,2.2 0.6,1.3 0,0 -2.4,0.8 -4.6,2.9 -1,0.9 -1.6,2.2 -0.3,-0 0.1,-1.1 -1.1,-1.8 -1,0.2 0.3,1.2 1.2,0 0.2,0.2 -0.5,2 -1.3,2.1 -0.5,-0.3 -0.4,-0.7 -1,-0.2 0.2,0.7 1.1,0.6 -0.3,1.8 -0.9,1.1 -0.9,2 -0.8,0.1 -0.3,-0.5 0.5,-1.4 0.4,-0.1 0.3,-0.4 0.4,-1 -0.8,-0.4 0.1,0.7 -0.5,1.1 -0.5,0.5 -0.3,1.1 0.3,0.7 -0.3,0.5 z", "TO": "m 433.6,282.1 -5.4,1.4 -1.7,1.3 -2.6,1.1 -1.6,0 -4.5,1 -2.5,2.1 -1.8,0.9 -0.5,-0.2 -1.5,-2.6 -0.6,-0 -0.5,3.3 -0.7,0.1 -3.4,-0.7 -3.1,-1.5 0.6,-1.6 -0.2,-0.7 -4.5,0.5 -2.8,-0.3 -0.6,0.5 -0.3,1 -0.8,0.8 -1.1,-0.1 -0.6,-3.1 -1.1,-3.7 -1,-1.9 -1.1,-1.3 -1.2,1 -1.5,2.4 -1.6,5.9 -0.6,0.2 -4.1,-1.4 -3.1,-1.7 -3.9,-0.4 -2.2,-1 -2.4,-0.4 0.5,-2.3 1.2,-1.9 0,-1.7 -0.6,0.3 -1.8,2.1 -0.7,1.2 -0.2,1.9 -0.3,0.5 0,0 -0.8,-0 -1,-0.5 -1,-3.3 0.7,-2.8 -0.4,-3 -0.5,-0.6 -0,-1.6 0.5,-3.3 -1.1,-2.2 0.1,-0.5 0.8,-0.9 0.2,-0.9 -1.4,-1.3 -0.1,-0.9 1.9,-6 0,-3 0.5,-3 1.9,-5.3 0.4,-0.3 0.4,-0.8 0.4,-3.1 1.1,-1.2 0.6,-1.9 0.7,-1 0,0 1.6,-3.7 1.1,-4.5 1.1,-1.6 1.2,-1.1 1.2,-1.7 1,-1.9 1.4,-0.9 1.1,-0.2 0.7,-0.8 0.9,-1.5 0.2,-1 1.7,-3.2 1.1,-0.8 1.8,-5.2 0.7,-4 -0.1,-0.3 -0.7,-0.3 -1.7,-1.7 -0.6,-0.9 -0.2,-0.9 0.1,-0.6 1.4,-1.7 1.3,-2.1 -0.1,-2.7 -0.4,-2.2 0.2,-0.3 2.5,-1.8 3.4,-1.1 2.5,-1.2 0.2,-0.5 -0.1,-1.5 0.9,-1.3 1.5,-1.3 1.3,-0.1 0.2,-1.3 -0.3,-1.2 0.2,-0.5 1.5,-0.5 0.6,-0.5 0.9,-2.8 -1,-1.3 -0.1,-1.4 0.3,-0.3 1,-0.1 0.7,-0.4 0.4,-0.7 0,-0.6 -1.3,-1.2 -0.9,-0.1 -0.4,-0.3 -1,-1.7 -1.3,-0.1 -1.9,0.2 -2.3,-0.8 0,0 0.5,-0.6 2.6,-1.9 2,-0.5 0.9,0.1 2.8,1.5 1.4,0.1 0.9,-0.5 1.7,0.3 0.6,0.7 0.1,1 0.3,0.3 1.2,0 3.4,1.4 0.8,1 0.5,3.5 0.6,1.5 -0.2,3.7 0.2,1.1 0.7,1.1 -0,0.4 -1.8,6.2 -0.3,2.4 0.3,1 -0.2,1.6 -1.8,2 -1.8,0.7 -0.2,0.7 1.9,1.3 0.4,-0.3 1.4,0.2 0.2,0.3 0.1,0.9 -0.6,1.2 0.8,1.4 0.9,-0.1 3,4.2 0.9,0.8 2.3,3 2.1,-1.3 4.3,-0.9 1.8,1.2 0.1,1.8 -0.6,3.2 0.4,1.4 -3.4,0.3 -1.3,0.5 -0.6,0.6 -0.7,1.4 -0.7,2.7 0.4,1.3 -2.6,2.5 -0.3,0.7 0.2,0.4 2.1,0.3 0.9,0.7 0.7,1.6 0.1,1.7 0.6,1 3.9,1.9 0.1,0.5 -1.6,1.8 0.1,1.6 2.1,1.6 1,2.9 1.3,2 0.7,0.2 1.8,-0.2 1,0.3 0.8,0.4 0.6,0.8 1.3,0.7 0,0 2.9,0.2 0,0 -0.7,0.7 -0.2,1 -0.6,0.5 -3.8,2 -3.2,2.6 -0.2,0.4 1.3,1.8 -0.4,0.4 -1,0.3 -0.9,0.6 -1.5,3.5 -1,0.7 -0.5,1.2 0.2,0.9 1.9,1.9 3.6,0.7 1.9,1 0.1,0.8 -0.6,0.5 -2,0.8 -0.4,1 0.1,0.5 0.3,0.3 1,-0.2 0.9,0.3 0.6,0.5 0.3,0.6 -1,0.7 -1.1,0.4 -1.9,1.7 -0.2,0.8 -0.1,2.9 0.3,1.2 0.9,0.7 1.1,0.2 0.4,0.2 0.2,0.4 0.1,1.1 -1.4,2.4 z"};

const gNorm=v=>String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const UFK={};Object.keys(UFN).forEach(k=>{UFK[k]=k;UFK[gNorm(UFN[k])]=k});
const gFld=re=>(campos()||[]).find(c=>re.test(gNorm(c.nome))||re.test(gNorm(c.id)));
const GCH=[['map','Mapa'],['col','Colunas']];
const _gi=d=>`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const GI={map:_gi('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),col:_gi('<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="4" width="4" height="17" rx="1"/><rect x="17" y="8" width="4" height="13" rx="1"/>')};
const GPAL=['#4f8cff','#2fb59f','#f2c14e','#c4a5f5','#ff7a59','#7bd88f','#e86fa8','#8ea4cf','#5ad1e6','#d4a373'];
const gHex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
function gRamp(p){const gl=document.documentElement.dataset.skin==='glass',S=gl?['#3b82f6','#f3ecc8','#ef4444']:['#27407f','#e8a93a','#ff5a4d'],q=Math.max(0,Math.min(1,p))*2,i=q>=1?1:0,a=gHex(S[i]),b=gHex(S[i+1]),f=q-i;return'rgb('+a.map((x,k)=>Math.round(x+(b[k]-x)*f)).join(',')+')'}
const gTr=(s,n)=>{s=String(s);return s.length>n?s.slice(0,n-1)+'…':s};
function gSvgChart(k,C,ST){
  if(!C.length)return'<div class="empty">Nenhuma medição cadastrada.</div>';
  const W=600,H=300,cats=C.map(x=>x.m.nome),n=cats.length,SR=ST.map(([id,l,cl])=>({l,cl,v:C.map(x=>(x.c.find(y=>y.k===id)||{n:0}).n)})),mx=Math.max(1,...SR.flatMap(s=>s.v)),tt=C.map(x=>x.n);
  const leg=`<div class="gleg">${SR.map(s=>`<span style="--c:${s.cl}"><i></i>${s.l}</span>`).join('')}</div>`,T=(a,b)=>`<title>${esc(a)}: ${b}</title>`;
  let o='';
  if(k==='lin'){
    const L=36,R=14,Tp=14,B=64,pw=W-L-R,ph=H-Tp-B,X=i=>L+(n>1?pw*i/(n-1):pw/2),Y=v=>Tp+ph-ph*v/mx;
    for(let g=0;g<=4;g++){const y=Tp+ph*g/4;o+=`<line x1="${L}" x2="${W-R}" y1="${y}" y2="${y}" class="gsl"/><text x="${L-6}" y="${y+4}" text-anchor="end">${Math.round(mx*(4-g)/4)}</text>`}
    cats.forEach((c,i)=>o+=`<text transform="translate(${X(i)},${H-B+14}) rotate(-30)" text-anchor="end">${esc(gTr(c,16))}</text>`);
    SR.forEach(s=>{o+=`<polyline fill="none" stroke="${s.cl}" stroke-width="2.5" points="${s.v.map((v,i)=>X(i)+','+Y(v)).join(' ')}"/>`+s.v.map((v,i)=>`<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="${s.cl}">${T(cats[i]+' · '+s.l,v)}</circle>`).join('')});
  }else if(k==='bar'){
    const L=130,R=30,Tp=8,rh=Math.min(34,(H-Tp)/n),mt=Math.max(1,...tt),sc=(W-L-R)/mt;
    cats.forEach((c,i)=>{const y=Tp+i*rh;let x=L;o+=`<text x="${L-8}" y="${y+rh/2+4}" text-anchor="end">${esc(gTr(c,20))}</text>`;SR.forEach(s=>{const v=s.v[i];if(v){o+=`<rect x="${x}" y="${y+3}" width="${v*sc}" height="${rh-8}" rx="3" fill="${s.cl}">${T(c+' · '+s.l,v)}</rect>`;x+=v*sc}});o+=`<text x="${x+5}" y="${y+rh/2+4}">${tt[i]}</text>`});
    o+=`<line x1="${L}" x2="${L}" y1="${Tp}" y2="${Tp+rh*n}" class="gsl"/>`;
    return`<div class="gsw">${leg}<svg class="gsv" viewBox="0 0 ${W} ${Math.max(120,Tp+rh*n+8)}">${o}</svg></div>`;
  }else if(k==='rad'){
    const cx=W/2,cy=H/2+4,r=100,P=(i,v)=>{const a=-Math.PI/2+2*Math.PI*i/n;return[cx+Math.cos(a)*r*v/mx,cy+Math.sin(a)*r*v/mx]};
    for(let g=1;g<=4;g++)o+=`<polygon fill="none" class="gsl" points="${cats.map((_,i)=>P(i,mx*g/4).join(',')).join(' ')}"/>`;
    cats.forEach((c,i)=>{const[x,y]=P(i,mx),[lx,ly]=P(i,mx*1.14);o+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" class="gsl"/><text x="${lx}" y="${ly+4}" text-anchor="${Math.abs(lx-cx)<8?'middle':lx>cx?'start':'end'}">${esc(gTr(c,16))}</text>`});
    SR.forEach(s=>{const pt=s.v.map((v,i)=>P(i,v));o+=`<polygon points="${pt.map(p=>p.join(',')).join(' ')}" fill="${s.cl}" fill-opacity=".18" stroke="${s.cl}" stroke-width="2.5"/>`+pt.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="3.5" fill="${s.cl}">${T(cats[i]+' · '+s.l,s.v[i])}</circle>`).join('')});
  }else{
    const sum=tt.reduce((a,b)=>a+b,0),cx=150,cy=150,r=130,ri=k==='ros'?70:0;
    if(!sum)return'<div class="empty">Sem tarefas nos filtros atuais.</div>';
    let a0=-Math.PI/2;const pt=(a,rr)=>[cx+Math.cos(a)*rr,cy+Math.sin(a)*rr];
    tt.forEach((v,i)=>{if(!v)return;const cl=GPAL[i%GPAL.length],tip=T(cats[i],v+' ('+Math.round(v/sum*100)+'%)');if(v===sum){o+=`<path fill-rule="evenodd" fill="${cl}" d="M${cx-r},${cy}a${r},${r} 0 1,0 ${2*r},0a${r},${r} 0 1,0 ${-2*r},0${ri?`M${cx-ri},${cy}a${ri},${ri} 0 1,1 ${2*ri},0a${ri},${ri} 0 1,1 ${-2*ri},0`:''}">${tip}</path>`;return}
      const a1=a0+2*Math.PI*v/sum,lg=a1-a0>Math.PI?1:0,p1=pt(a0,r),p2=pt(a1,r),q1=pt(a1,ri),q2=pt(a0,ri);
      o+=`<path fill="${cl}" stroke="var(--s1)" stroke-width="1.5" d="M${p1}A${r},${r} 0 ${lg},1 ${p2}${ri?`L${q1}A${ri},${ri} 0 ${lg},0 ${q2}Z`:`L${cx},${cy}Z`}">${tip}</path>`;a0=a1});
    return`<div class="gpz"><svg class="gsv" viewBox="0 0 300 300" style="max-width:300px">${o}</svg><ul class="gpl">${cats.map((c,i)=>`<li style="--c:${GPAL[i%GPAL.length]}"><i></i>${esc(c)} <b>${tt[i]}</b></li>`).join('')}</ul></div>`;
  }
  return`<div class="gsw">${leg}<svg class="gsv" viewBox="0 0 ${W} ${H}">${o}</svg></div>`;
}
function gMapHtml(T0){
  gMapFl='';
  const fu=gFld(/^(UF|ESTADO)$/),fm=gFld(/MUNIC|CIDADE/);
  if(!fu)return'<div class="empty">Não encontrei o campo “UF” nas tarefas. Cadastre um campo chamado UF para ver o mapa.</div>';
  const G=T0.map(t=>({uf:UFK[gNorm(t[fu.id])]||'',mun:(fm?String(t[fm.id]||'').trim():'')||String(t.tarefa||'').trim(),t}));
  const ufs=[...new Set(G.filter(g=>!gMun||gHas(gMun,gNorm(g.mun))).map(g=>g.uf).filter(Boolean))].sort((a,b)=>UFN[a].localeCompare(UFN[b],'pt-BR'));
  if(gUf&&!gVals(gUf).some(u=>u===EMP||ufs.includes(u)))gUf='';
  const MM=new Map();G.filter(g=>g.mun&&(!gUf||gHas(gUf,g.uf))).forEach(g=>{const k=gNorm(g.mun);const e=MM.get(k)||{n:g.mun,c:0};e.c++;MM.set(k,e)});
  const muns=[...MM.entries()].sort((a,b)=>a[1].n.localeCompare(b[1].n,'pt-BR'));
  if(gMun&&!gVals(gMun).some(u=>u===EMP||MM.has(u)))gMun='';
  const F=G.filter(g=>!gMun||gHas(gMun,gNorm(g.mun))),cnt={};F.forEach(g=>{if(g.uf)cnt[g.uf]=(cnt[g.uf]||0)+1});
  const mx=Math.max(1,...Object.values(cnt)),semUf=F.filter(g=>!g.uf).length,tot=gUf?gVals(gUf).reduce((a,u)=>a+(cnt[u]||0),0):F.length-semUf;
  const op=(id,l,cur,o)=>{const a0=gVals(cur),emp=a0.includes(EMP),a=a0.filter(v=>v!==EMP),tx=emp&&!a.length?'Nenhum':!a.length?'Todos':a.length===1?(o.find(x=>x[0]===a[0])||[0,a[0]])[1]:a.length+' selecionados',open=gMfOpen===id,it=(v,t,c,all)=>`<label class="gmi"><input type="checkbox" value="${esc(v)}" ${all?'data-all="1" ':''}${c?'checked':''}><span>${esc(t)}</span></label>`;return `<div class="gfi gmf" data-mf="${id}"><span>${l}</span><button type="button" class="gmb" aria-haspopup="true" aria-expanded="${open}"><em>${esc(tx)}</em></button><div class="gmdp"${open?'':' hidden'}>${it('','Todos',!a.length&&!emp,true)}${o.map(([v,t])=>it(v,t,a.includes(v))).join('')}</div></div>`};
  gMapFl=op('gfuf','UF',gUf,ufs.map(u=>[u,u+' · '+UFN[u]]))+op('gfmun','Município',gMun,muns.map(([k,e])=>[k,e.n]));
  const bin=v=>v?Math.min(5,Math.ceil(v/mx*5)):0,col=v=>v?gRamp((bin(v)-1)/4):'#1c2740';
  const sv=`<svg class="gsv gmap${gUf?' hs':''}" data-mx="${mx}" data-tt="${Object.values(cnt).reduce((a,b)=>a+b,0)}" viewBox="${BRVB}" role="img" aria-label="Mapa do Brasil por UF">${Object.keys(BRMAP).map(u=>{const v=cnt[u]||0;return`<path data-guf="${u}" data-n="${v}" data-nm="${esc(UFN[u])}" class="${gHas(gUf,u)&&gUf?'on':''}" d="${BRMAP[u]}" fill="${col(v)}"></path>`}).join('')}<g class="gmlb"></g></svg>`;
  const lg=`<div class="gml2">${[1,2,3,4,5].map(b=>{const lo=Math.floor((b-1)*mx/5)+1,hi=Math.ceil(b*mx/5);return lo>hi?'':`<span><i style="background:${gRamp((b-1)/4)}"></i>${lo===hi?hi:lo+'–'+hi}</span>`}).join('')}<span><i style="background:#1c2740"></i>0</span></div>`;
  const U=Object.entries(cnt).sort((a,b)=>b[1]-a[1]),um=Math.max(1,...U.map(x=>x[1]));
  const ML=[...MM.values()].filter(e=>!gMun||gHas(gMun,gNorm(e.n))).sort((a,b)=>b.c-a.c).slice(0,gUf?80:12),mm=Math.max(1,...ML.map(e=>e.c));
  const row=(at,nm,c,m,bg)=>`<button type="button" class="gmrow" ${at}><span>${esc(nm)}</span><i><u style="--p:${Math.round(c/m*100)}%;background:${bg}"></u></i><b>${c}</b></button>`;
  const medNm=t=>{const i=medId(tipoOf(t)),m=(S.medicoes||[]).find(c=>c.id===i);return[m?i:'_',m?m.nome:'Sem medição']},grp=new Map();
  if(gUf)G.filter(g=>g.mun&&gHas(gUf,g.uf)).forEach(g=>{const[mi,mn]=medNm(g.t);let o=grp.get(mi);if(!o)grp.set(mi,o={n:mn,m:new Map()});const k=gNorm(g.mun);let e=o.m.get(k);if(!e)o.m.set(k,e={n:g.mun,c:0,id:g.t.id});e.c++});
  const gOrd=[...grp.entries()].sort((a,b)=>{const ix=i=>i==='_'?1e9:(S.medicoes||[]).findIndex(c=>c.id===i);return ix(a[0])-ix(b[0])}),mm2=Math.max(1,...gOrd.flatMap(([,o])=>[...o.m.values()].map(e=>e.c)));
  const mcol=i=>i==='_'?'var(--mu)':`var(--m${Math.max(0,(S.medicoes||[]).findIndex(c=>c.id===i))%6})`,srt=o=>[...o.m.values()].sort((a,b)=>a.n.localeCompare(b.n,'pt-BR'));
  const ov=gUf&&gOrd.length?`<div class="gmmun" aria-label="Municípios de ${esc(gVals(gUf).map(u=>UFN[u]||u).join(", "))} por medição">${gOrd.map(([mi,o])=>`<section style="--mc:${mcol(mi)}"><h5 class="gmmh">${esc(o.n)}</h5>${srt(o).map(e=>`<button type="button" class="gmmu${gHas(gMun,gNorm(e.n))&&gMun?' on':''}" data-gmun="${esc(gNorm(e.n))}" data-tid="${esc(e.id)}" title="1 clique filtra · 2 cliques abrem o card">${esc(e.n)}${e.c>1?` <small>×${e.c}</small>`:''}</button>`).join('')}</section>`).join('')}</div>`:'';
  const lst=gUf?(gOrd.length?gOrd.map(([mi,o])=>{const L=[...o.m.values()];return`<div class="gmgh" style="--mc:${mcol(mi)}"><span>${esc(o.n)}</span><em>${L.length} município(s) · ${L.reduce((a,e)=>a+e.c,0)} tarefa(s)</em></div>`}).join('')+'<p class="hint">Dê 2 cliques no nome do município (no mapa) para abrir o card.</p>':`<p class="hint">Nenhuma tarefa nesta UF.</p>`):U.map(([u,c])=>row(`data-guf="${u}" data-h="${u}" title="${esc(UFN[u])}"`,u,c,um,col(c))).join('');
  const top=U[0];
  const side=`<aside class="gmr2"><div class="gmhd"><small>${gUf?esc(gVals(gUf).map(u=>UFN[u]||u).join(', ')):'Brasil'}${gMun?' · '+esc(gVals(gMun).map(k=>(MM.get(k)||{}).n||k).join(', ')):''}</small>${gUf||gMun?'<button type="button" class="btn" id="gfx2">← Brasil</button>':''}</div><div class="gmbig"><b>${tot}</b><span>tarefa(s)</span></div><div class="gmst"><div><b>${gUf?gVals(gUf).length:U.length}</b><span>UF(s)</span></div><div><b>${gUf?MM.size:new Set(G.filter(g=>g.mun).map(g=>gNorm(g.mun))).size}</b><span>município(s)</span></div><div><b>${top?top[0]:'–'}</b><span>líder${top?' · '+top[1]:''}</span></div></div><h4>${gUf?'Medições nesta UF':'Estados'}</h4><div class="gmls${gUf?'':' g2'}">${lst}</div></aside>`;
  return`<div class="gme"><div class="gmp"><div class="gmtb"><button type="button" data-z="in" aria-label="Aproximar">+</button><button type="button" data-z="out" aria-label="Afastar">−</button><button type="button" data-z="0" aria-label="Centralizar">⟲</button></div>${sv}${ov}<div class="gmtip" hidden></div>${lg}</div><!--GFX--></div><p class="hint gmh2"><b>${tot}</b> com UF${semUf?` · ${semUf} sem UF`:''} · clique num estado: zoom e filtro · 2 cliques num município: abre o card · Esc: volta ao Brasil</p>`;
}
function gMapInit(){
  const sv=document.querySelector('svg.gmap');if(!sv)return;
  const pn=sv.closest('.gmp'),tip=pn.querySelector('.gmtip'),lb=sv.querySelector('.gmlb'),wrap=pn.parentNode,NS='http://www.w3.org/2000/svg';
  const v0=sv.viewBox.baseVal,B={x:v0.x,y:v0.y,w:v0.width,h:v0.height};
  const B0={...B},fitB=()=>{Object.assign(B,B0);const r0=sv.getBoundingClientRect();if(r0.width>20&&r0.height>20){const asp=Math.max(1.5,r0.width/r0.height);if(B.w/B.h<asp){const nw=B.h*asp;B.x-=(nw-B.w)/2;B.w=nw}else{const nh=B.w/asp;B.y-=(nh-B.h)/2;B.h=nh}}};fitB();
  let V={...B},drag=null,moved=0;
  const paths=[...sv.querySelectorAll('path')],bb=new Map();paths.forEach(p=>{try{bb.set(p,p.getBBox())}catch(e){}});
  const mk=(n,o)=>{const e=document.createElementNS(NS,n);for(const k in o)e.setAttribute(k,o[k]);return e};
  const inP=(p,x,y)=>{try{return p.isPointInFill(new DOMPoint(x,y))}catch(e){return false}};
  const SC=()=>{const r=sv.getBoundingClientRect();return Math.min(r.width/V.w,r.height/V.h)||.7};
  const lab=()=>{
    window._gPrev={...V};lb.innerHTML='';
    const sc=SC(),f=(V.w>=B.w*.5?10:12)/sc,sw=3/sc,pad=f*.7,placed=[],x0=V.x+(pn.querySelector('.gmmun')?V.w*.3:0),y0=V.y,x1=V.x+V.w,y1=V.y+V.h,far=V.w>B.w*.45,outs=[];let ux0=1e9,ux1=-1e9;
    const hit=r=>placed.some(q=>r.x<q.x+q.w&&r.x+r.w>q.x&&r.y<q.y+q.h&&r.y+r.h>q.y);
    const ord=paths.filter(p=>{const b=bb.get(p);return b&&b.x<x1&&b.x+b.width>x0&&b.y<y1&&b.y+b.height>y0}).sort((a,c)=>bb.get(c).width*bb.get(c).height-bb.get(a).width*bb.get(a).height);
    ord.forEach(p=>{
      const b=bb.get(p),n=+p.dataset.n,cls=(n?'':'z ')+(p.classList.contains('on')?'on':'');
      let ax=b.x+b.width/2,ay=b.y+b.height/2;
      if(!inP(p,ax,ay)){let best=1e9;for(let i=0;i<=10;i++)for(let j=0;j<=10;j++){const x=b.x+b.width*i/10,y=b.y+b.height*j/10,d=(x-ax)**2+(y-ay)**2;if(d<best&&inP(p,x,y)){best=d;ax=x;ay=y}}}
      if(ax<x0||ax>x1||ay<y0||ay>y1)return;/* fora do zoom atual: some */
      ux0=Math.min(ux0,b.x);ux1=Math.max(ux1,b.x+b.width);
      const t=mk('text',{x:0,y:0,'text-anchor':'middle',style:'font-size:'+f+'px;stroke-width:'+sw+'px'});
      t.innerHTML=p.dataset.guf+(n?'<tspan x="0" dy="1.1em">'+n+'</tspan>':'');lb.appendChild(t);
      let m=t.getBBox(),w=m.width,h=m.height,ox=-(m.x+w/2),oy=-(m.y+h/2);
      const r={x:ax-w/2,y:ay-h/2,w,h};
      if([[r.x,r.y],[r.x+w,r.y],[r.x,r.y+h],[r.x+w,r.y+h]].every(c=>inP(p,c[0],c[1]))&&!hit(r)){t.setAttribute('transform','translate('+(ax+ox)+','+(ay+oy)+')');t.setAttribute('class',cls);placed.push(r);return}
      if(!n&&far){t.remove();return}
      t.innerHTML=p.dataset.guf+(n?' '+n:'');m=t.getBBox();
      outs.push({p,t,ax,ay,w:m.width,h:m.height,ox:-(m.x+m.width/2),oy:-(m.y+m.height/2),cls,n});
    });
    if(!outs.length)return;
    const mw=Math.max(...outs.map(o=>o.w)),hh=Math.max(...outs.map(o=>o.h)),s=hh+f*.8,cap=Math.max(1,Math.floor((V.h-2*pad+f*.8)/s)),
      eL=Math.max(x0+pad+mw,ux0-f*3.5),eR=Math.min(x1-pad-mw,ux1+f*3.5),mid=(x0+x1)/2;
    [true,false].forEach(left=>{
      let L=outs.filter(o=>(o.ax<mid)===left).sort((a,c)=>c.n-a.n);L.slice(cap).forEach(o=>o.t.remove());L=L.slice(0,cap).sort((a,c)=>a.ay-c.ay);
      let y=L.map(o=>o.ay-o.h/2);
      for(let i=0;i<y.length;i++)y[i]=Math.max(y[i],i?y[i-1]+s:y0+pad);
      if(y.length&&y[y.length-1]+hh>y1-pad){y[y.length-1]=y1-pad-hh;for(let i=y.length-2;i>=0;i--)y[i]=Math.min(y[i],y[i+1]-s)}
      L.forEach((o,i)=>{const rx=left?eL-o.w:eR,ry=y[i],ex=left?rx+o.w:rx,ey=ry+o.h/2,on=o.p.classList.contains('on');
        lb.insertBefore(mk('line',{x1:o.ax,y1:o.ay,x2:ex,y2:ey,class:'gll'+(on?' on':''),'stroke-width':1.3/sc}),o.t);
        lb.insertBefore(mk('circle',{cx:o.ax,cy:o.ay,r:2.6/sc,class:'gld'}),o.t);
        o.t.setAttribute('transform','translate('+(rx+o.w/2+o.ox)+','+(ry+o.h/2+o.oy)+')');o.t.setAttribute('class',o.cls+' o')})
    });
  };
  window._gLab=lab;
  let lt=0;const set=now=>{sv.setAttribute('viewBox',[V.x,V.y,V.w,V.h].join(' '));clearTimeout(lt);if(now){lab();lb.style.opacity=1}else{lb.style.opacity=0;lt=setTimeout(()=>{if(sv.isConnected){lab();lb.style.opacity=1}},120)}};
  const zoom=(f,cx,cy)=>{const w=Math.max(B.w/10,Math.min(B.w,V.w*f)),r=w/V.w;cx=cx==null?V.x+V.w/2:cx;cy=cy==null?V.y+V.h/2:cy;V={x:cx-(cx-V.x)*r,y:cy-(cy-V.y)*r,w,h:V.h*r};if(w>=B.w)V={...B};set()};
  const pt=e=>{const r=sv.getBoundingClientRect(),sc=Math.min(r.width/V.w,r.height/V.h),ox=(r.width-V.w*sc)/2,oy=(r.height-V.h*sc)/2;return[V.x+(e.clientX-r.left-ox)/sc,V.y+(e.clientY-r.top-oy)/sc,sc]};
  pn.querySelectorAll('[data-z]').forEach(b=>b.onclick=e=>{e.stopPropagation();b.dataset.z==='0'?(V={...B},set()):zoom(b.dataset.z==='in'?.7:1.4)});
  sv.addEventListener('wheel',e=>{e.preventDefault();const[x,y]=pt(e);zoom(e.deltaY<0?.8:1.25,x,y)},{passive:false});
  sv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,v:{...V},sc:pt(e)[2]};moved=0});
  const mv=e=>{if(!drag||!sv.isConnected)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>5)moved=1;if(moved){V.x=drag.v.x-dx/drag.sc;V.y=drag.v.y-dy/drag.sc;sv.setAttribute('viewBox',[V.x,V.y,V.w,V.h].join(' '));tip.hidden=true}};
  if(window._gMv){removeEventListener('pointermove',window._gMv);removeEventListener('pointerup',window._gUp);removeEventListener('keydown',window._gEsc)}
  window._gMv=mv;window._gUp=()=>{const was=moved;drag=null;if(was&&sv.isConnected)lab();setTimeout(()=>moved=0,0)};window._gEsc=e=>{if(e.key==='Escape'&&sv.isConnected&&(gUf||gMun)&&!document.querySelector('dialog[open]'))gClr()};
  addEventListener('pointermove',mv,{passive:true});addEventListener('pointerup',window._gUp);addEventListener('keydown',window._gEsc);
  pn.addEventListener('click',e=>{if(moved){e.stopPropagation();e.preventDefault();return}if(!e.target.closest('path,button,.gmtip')&&(gUf||gMun)){gUf=gMun='';render()}},true);
  sv.addEventListener('click',e=>{if(moved){e.stopPropagation();e.preventDefault()}},true);
  const hl=u=>{wrap.querySelectorAll('.hv').forEach(x=>x.classList.remove('hv'));if(u)wrap.querySelectorAll('[data-guf="'+u+'"]').forEach(x=>x.classList.add('hv'))};
  paths.forEach(p=>{p.addEventListener('mousemove',e=>{if(moved)return;const r=pn.getBoundingClientRect(),n=+p.dataset.n,tt=+sv.dataset.tt;tip.innerHTML='<b>'+p.dataset.nm+'</b><span>'+n+' tarefa(s)</span>'+(n&&tt>0?'<em>Representa '+Math.round(n/tt*100)+'% do total</em>':'');tip.hidden=false;tip.style.left=Math.min(e.clientX-r.left+14,r.width-170)+'px';tip.style.top=Math.max(4,e.clientY-r.top-58)+'px';hl(p.dataset.guf)});p.addEventListener('mouseleave',()=>{tip.hidden=true;hl('')})});
  wrap.querySelectorAll('.gmrow[data-h]').forEach(r=>{r.addEventListener('mouseenter',()=>hl(r.dataset.h));r.addEventListener('mouseleave',()=>hl(''))});
  const tgt=()=>{const p=gVals(gUf).length===1&&paths.find(q=>q.dataset.guf===gVals(gUf)[0]),b=p&&bb.get(p);if(!b)return{...B};const asp=B.w/B.h,m=.2;let w=Math.max(B.w/10,b.width*(1+2*m)),h=Math.max(B.h/10,b.height*(1+2*m));if(w/h<asp)w=h*asp;else h=w/asp;if(pn.querySelector('.gmmun')){w*=1.18;h*=1.18;return{x:b.x+b.width/2-w*.6,y:b.y+b.height/2-h/2,w,h}}return{x:b.x+b.width/2-w/2,y:b.y+b.height/2-h/2,w,h}};
  const anim=T=>{const A={...V},t0=performance.now(),D=550,ez=u=>u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;lb.style.opacity=0;
    const step=now=>{if(!sv.isConnected)return;const u=Math.min(1,(now-t0)/D),e=ez(u);V={x:A.x+(T.x-A.x)*e,y:A.y+(T.y-A.y)*e,w:A.w+(T.w-A.w)*e,h:A.h+(T.h-A.h)*e};window._gPrev={...V};
      if(u<1){sv.setAttribute('viewBox',[V.x,V.y,V.w,V.h].join(' '));requestAnimationFrame(step)}else{V={...T};set(1)}};requestAnimationFrame(step)};
  window._gRe=()=>{if(!sv.isConnected)return;fitB();V=tgt();set(1)};
  {const T=tgt(),P0=window._gPrev;if(P0&&(Math.abs(P0.w-T.w)>.5||Math.abs(P0.x-T.x)>.5||Math.abs(P0.y-T.y)>.5)){V={...P0};sv.setAttribute('viewBox',[V.x,V.y,V.w,V.h].join(' '));anim(T)}else{V=T;set(1)}}
}
function gFit(){
  const p=document.querySelector('.gcp');if(!p)return;
  if(innerWidth<=820){p.style.height='';return}
  if(scrollY>0&&!gFit.nr){scrollTo(0,0)}const top=p.getBoundingClientRect().top,z=parseFloat(document.documentElement.style.getPropertyValue('--z'))||parseFloat(getComputedStyle(document.documentElement).zoom)||1;p.style.setProperty('--gt',top+'px');p.style.height='';
  const gb=p.querySelector('.gbd'),cs=p.querySelector('.gcols');
  if(gb&&cs){const mx=+cs.dataset.mx||1,lg=p.querySelector('.gleg'),hn=gb.querySelector('.hint'),nm=Math.max(0,...[...p.querySelectorAll('.gnm')].map(e=>e.offsetHeight)),
    PH=Math.max(80,Math.min(300,gb.clientHeight-(lg?lg.offsetHeight+12:0)-(hn?hn.offsetHeight+8:0)-nm-6-34));
    p.querySelectorAll('.gbs u[data-v]').forEach(u=>{const h=+u.dataset.v/mx*PH;u.style.setProperty('--h',h.toFixed(1)+'px');u.classList.toggle('sm',h<20)})}
}
if(!window._gFitE){window._gFitE=1;const rf=()=>[0,120,400].forEach(d=>setTimeout(()=>{try{setHH();gFit();window._gRe&&document.querySelector('svg.gmap')&&window._gRe()}catch(e){}},d));document.addEventListener('fullscreenchange',rf);document.addEventListener('webkitfullscreenchange',rf);if(window.visualViewport)visualViewport.addEventListener('resize',()=>{clearTimeout(window._gVT);window._gVT=setTimeout(rf,50)})}
if(!window._gFitR){window._gFitR=1;addEventListener('resize',()=>{clearTimeout(gFit.t);gFit.t=setTimeout(()=>{gFit();window._gRe&&document.querySelector('svg.gmap')&&window._gRe()},80)})}
const dias=(a,b)=>Math.round((new Date(a+'T12:00:00')-new Date(b+'T12:00:00'))/864e5);
function lastMove(t){const ts=[...(t.fluxo||[]).map(f=>f.ok||0),...(t.ev||[]).map(e=>e.t||0),...(t.notas||[]).map(n=>n.t||0),...(t.anot||[]).map(n=>n.t||0)],c=+String(t.id).replace(/\D/g,'');if(c>1e12)ts.push(c);return Math.max(0,...ts)}
const paradaDias=t=>{const l=lastMove(t);return l?Math.floor((Date.now()-l)/864e5):0};
const isCob=t=>!!t.cob&&new Date(t.cob).toDateString()===new Date().toDateString();
async function marcarCob(ids){let ch=0;ids.forEach(i=>{const t=S.tasks.find(x=>x.id===i);if(t){t.cob=Date.now();ch=1}});if(ch){await save();render()}}
document.addEventListener('click',e=>{const a=e.target.closest('a[data-cob]');if(a&&isAdm()){const ids=a.dataset.cob.split(',');setTimeout(()=>marcarCob(ids),500)}});
function gData(fl){
  const R=S.tasks.filter(t=>t.status!=='done'&&t.status!=='fixo'&&t.fluxo.length&&(!fl||gOk(t))).map(t=>({t,A:act(t),w:holder(t),d:t.final?dias(t.final,today()):null,p:paradaDias(t)}));
  const atr=R.filter(r=>r.d!==null&&r.d<0).sort((a,b)=>a.d-b.d),prox=R.filter(r=>r.d!==null&&r.d>=0&&r.d<=2).sort((a,b)=>a.d-b.d),
    par=R.filter(r=>r.p>=3&&!(r.d!==null&&r.d<0)).sort((a,b)=>b.p-a.p),sem=R.filter(r=>r.t.fluxo.some(f=>!f.pessoa||f.pessoa==='Sem responsável'));
  const cob=[...new Map([...atr,...prox,...par].filter(r=>isCob(r.t)).map(r=>[r.t.id,r])).values()],f=L=>L.filter(r=>!isCob(r.t)),A=f(atr),X=f(prox),Pp=f(par);
  return{R,atr:A,prox:X,par:Pp,sem,cob,n:new Set([...A,...X,...Pp,...sem].map(r=>r.t.id)).size};
}
const gBadge=()=>{if(!isAdm())return'';const n=gData().n;return n?` <em class="nb" aria-label="${n} pendências">${n}</em>`:''};
/* ---------- Resumo executivo da Gestão ---------- */
const ICO_BROOM='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.5v6.5"/><path d="M8.5 9h7l2.5 12h-12z"/><path d="M9.8 14l-.6 7M12 14v7M14.2 14l.6 7"/></svg>';
let gMore=false,gK='',gR={fu:'',st:'',pa:''};
const RKL={atr:'Atrasadas',prox:'Vencem em até 2 dias',par:'Paradas há 3+ dias',conc:'Concluídas na semana',pct:'Só concluídas',val:'Com valor em aberto'};
const rDs=D=>{const d=new Date(D);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const rBorn=t=>{const c=+String(t.id).replace(/\D/g,'');return c>1e12?c:0};
const rDone=t=>t.status==='done'?Math.max(0,...t.fluxo.map(f=>f.ok||0)):0;
const rTs=t=>[rBorn(t),...(t.fluxo||[]).map(f=>f.ok||0),...(t.ev||[]).map(e=>e.t||0),...(t.notas||[]).map(n=>n.t||0),...(t.anot||[]).map(n=>n.t||0)];
const rCap=()=>{try{return Math.max(1,+localStorage.getItem('fl_cap')||8)}catch(e){return 8}};
const rN=n=>String(Math.round(n*10)/10).replace('.',',');
const brlK=v=>'R$ '+(v>=1e6?rN(v/1e6)+' mi':v>=1e4?Math.round(v/1e3)+' mil':brl(v).replace(/^R\$\s?/,''));
function rAt(t,D){/* situação da tarefa na data D (ms): permite comparar com a semana anterior */
  if(rBorn(t)>D)return null;
  if(t.status==='done'&&rDone(t)<=D){const x=rDone(t);return{dn:1,w:x>D-6048e5}}
  const d=t.final?dias(t.final,rDs(D)):null,m=Math.max(0,...rTs(t).filter(x=>x<=D)),p=m?Math.floor((D-m)/864e5):0,a=d!==null&&d<0;
  return{op:1,atr:a,prox:d!==null&&d>=0&&d<=2,par:p>=3&&!a}}
function rKp(t){const a=rAt(t,Date.now())||{};if(gK==='pct')return!!a.dn;if(gK==='val')return!!a.op&&(campos().filter(c=>c.tipo==='valor').reduce((s,c)=>s+(parseFloat(t[c.id])||0),0))>0;return!!a[gK==='conc'?'w':gK]}
function rBase(skip,kp=1){const FU=gFld(/^(UF|ESTADO)$/),FM=gFld(/MUNIC|CIDADE/);
  return S.tasks.filter(t=>vis(t)&&tarOk(t)&&t.fluxo&&t.fluxo.length&&['todo','doing','wait','done'].includes(t.status)&&
    (skip==='med'||!gSel||gVals(gSel).some(v=>medMatch(t,v)))&&(skip==='log'||gMt(gLog,gLk(t)))&&(skip==='vt'||gMt(gVt,gVk(t)))&&
    (skip==='uf'||((!gUf||!FU||gHas(gUf,UFK[gNorm(t[FU.id])]))&&(!gMun||!FM||gHas(gMun,gNorm(String(t[FM.id]||'').trim())))))&&
    (skip==='fu'||!gR.fu||t.fluxo.some(f=>pkey(f.pessoa)===gR.fu))&&(skip==='pa'||!gR.pa||act(t).some(f=>f.etapa===gR.pa))&&
    (skip==='st'||!gR.st||(gR.st==='late'?late(t):t.status===gR.st))&&(!kp||!gK||rKp(t)))}
function gResumo(){
  const now=Date.now(),VC=campos().filter(c=>c.tipo==='valor'),vv=t=>VC.reduce((s,c)=>s+(parseFloat(t[c.id])||0),0),CAP=rCap(),
    ST=[['todo','○ A iniciar','#8ea4cf'],['doing','▶ Em andamento','#f2c14e'],['wait','⏸ Aguardando','#c4a5f5'],['done','✔ Concluída','#2fb59f']],
    lc=l=>['var(--okc)','var(--wrc)','var(--bdc)'][l],
    hd=(q,tip)=>`<h3>${q}<i class="rq" data-tip="${esc(tip)}">?</i></h3>`,em=m=>`<div class="empty">${m}</div>`,
    fill=(p,c,lim)=>`<i style="width:${Math.max(2,Math.min(100,p*100)).toFixed(1)}%;background:${c}"></i>${lim!=null?`<u style="left:${(lim*100).toFixed(1)}%"></u>`:''}`,
    rr=o=>`<button type="button" class="rr${o.on?' on':''}"${o.f?` data-rf="${esc(o.f)}"`:' tabindex="-1"'} data-tip="${esc(o.tip)}"><span class="rn">${o.n}</span><span class="rb">${o.bar}</span><b class="rv">${o.v}</b></button>`;
  /* --- indicadores (agora x semana anterior) --- */
  const B=rBase('',0),P0=B.map(t=>[t,rAt(t,now)]),P1=B.map(t=>[t,rAt(t,now-6048e5)]),
    c=(P,k)=>P.filter(x=>x[1]&&x[1][k]).length,pc=P=>{const n=P.filter(x=>x[1]).length;return n?Math.round(c(P,'dn')/n*100):0},
    sv=P=>P.reduce((s,[t,a])=>s+(a&&a.op?vv(t):0),0),op0=c(P0,'op');
  const K=[['atr','O que está atrasado?',c(P0,'atr'),c(P1,'atr'),'atrasadas',0,n=>n===0?0:n<=Math.max(2,op0*.1)?1:2,'Tarefas abertas com a data de entrega vencida. Verde = nenhuma.'],
    ['prox','O que vence logo?',c(P0,'prox'),c(P1,'prox'),'vencem em até 2 dias',0,n=>n===0?0:n<=5?1:2,'Entrega hoje, amanhã ou depois de amanhã.'],
    ['par','O que está parado?',c(P0,'par'),c(P1,'par'),'paradas há 3+ dias',0,n=>n===0?0:n<=3?1:2,'Sem passo concluído, nota ou anotação há 3 dias ou mais.'],
    ['conc','O que entregamos?',c(P0,'w'),c(P1,'w'),'concluídas na semana',1,(n,p)=>!p||n>=p?0:n>=p*.7?1:2,'Tarefas concluídas nos últimos 7 dias. Compara com os 7 dias anteriores.'],
    ['pct','Quanto já foi feito?',pc(P0),pc(P1),'% concluído',1,n=>n>=70?0:n>=40?1:2,'Concluídas ÷ todas as tarefas do filtro atual. Verde a partir de 70%.'],
    ['val','Quanto está em jogo?',sv(P0),sv(P1),'em aberto (R$)',0,(n,p)=>n<=p?0:1,VC.length?'Soma dos valores das tarefas ainda não concluídas.':'Cadastre um campo do tipo Valor para ver este número.']];
  const SL=[['✔','Em dia'],['⚠','Atenção'],['✖','Crítico']],
    kh=K.map(([k,q,n,p,u,up,lv,tip])=>{const L=lv(n,p),d=n-p,fm=x=>k==='val'?brlK(x):k==='pct'?x+' p.p.':x,
      dt=d===0?'＝ igual à semana passada':`${d>0?'▲ +':'▼ −'}${fm(Math.abs(d))} vs semana passada`,dc=d===0?'var(--mu)':(d>0)===!!up?'var(--okt)':'var(--bdt)';
      return `<button type="button" class="rk l${L}${gK===k?' on':''}" data-rk="${k}" aria-pressed="${gK===k}" data-tip="${esc(tip+' Clique para filtrar todos os gráficos.')}"><span class="q">${q}</span><b>${k==='val'?brlK(n):k==='pct'?n+'%':n}</b><span class="u">${u}</span><span class="d" style="--dc:${dc}"><em>${dt}</em></span><span class="s">${SL[L][0]} ${SL[L][1]}</span></button>`}).join('');
  /* --- 1. Gargalo por passo --- */
  const gm0=new Map();rBase('pa').forEach(t=>act(t).forEach(f=>{const o=gm0.get(f.etapa)||{s:0,n:0};o.s+=paradaDias(t);o.n++;gm0.set(f.etapa,o)}));
  const GA=[...gm0].map(([e,o])=>({e,n:o.n,a:o.s/o.n})).sort((a,b)=>b.a-a.a||b.n-a.n).slice(0,5),gmx=Math.max(1,...GA.map(x=>x.a));
  const c1=`<section class="rc">${hd('Onde o fluxo trava?','Tempo médio que as tarefas ficam paradas em cada passo liberado. O pior passo fica no topo. Clique para filtrar.')}<div class="rl">${GA.length?GA.map(x=>rr({on:gR.pa===x.e,f:'pa|'+x.e,n:(x.a>=5?'⚠ ':'')+esc(x.e),bar:fill(x.a/gmx,lc(x.a>=5?2:x.a>=3?1:0)),v:rN(x.a)+' d · '+x.n,tip:`${x.e}: ${rN(x.a)} dia(s) parado em média · ${x.n} tarefa(s) esperando este passo`})).join(''):em('Nenhum passo travado. Fluxo andando ✔')}</div></section>`;
  /* --- 2. Carga por funcionário --- */
  const pm=new Map();S.tasks.forEach(t=>(t.ev||[]).forEach(e=>{const k=pkey(e.p);let o=pm.get(k);if(!o)pm.set(k,o={f:0,neg:0,adm:0});if(e.k==='f')o.f++;else if(e.tp==='neg')o.neg++;else o.adm++}));
  const nota=k=>{const o=pm.get(k);if(!o)return null;const j=Math.max(o.f,o.neg+o.adm),q=Math.max(0,o.f-o.neg-o.adm);return j?Math.round((q-o.neg)/j*100):0};
  const Bf=rBase('fu'),CG=(S.contatos||[]).map(ct=>({k:'c:'+ct.id,nm:chipName(ct),n:Bf.filter(t=>act(t).some(f=>pkey(f.pessoa)==='c:'+ct.id)).length})).filter(x=>x.n).sort((a,b)=>b.n-a.n).slice(0,6),sc=Math.max(CAP*1.3,...CG.map(x=>x.n));
  const c2=`<section class="rc">${hd('Quem está sobrecarregado?','Tarefas com passo liberado para cada pessoa, comparadas com o limite (linha). Ao lado, a nota de desempenho. Clique para filtrar.')}<div class="rl">${CG.length?CG.map(x=>{const nt=nota(x.k);return rr({on:gR.fu===x.k,f:'fu|'+x.k,n:(x.n>CAP?'⚠ ':'')+esc(x.nm),bar:fill(x.n/sc,lc(x.n>CAP?2:x.n>=CAP*.8?1:0),CAP/sc),v:`${x.n}/${CAP} · ${nt===null?'–':pl({pct:nt})}`,tip:`${x.nm}: ${x.n} tarefa(s) com passo liberado · limite ${CAP} · nota ${nt===null?'sem dados':pl({pct:nt})}`})}).join(''):em('Ninguém com passo liberado agora.')}</div><div class="rf">Linha = limite de ${CAP} tarefas por pessoa · <button type="button" class="rcap" data-rcap>alterar limite</button></div></section>`;
  /* --- 3. Previsto x realizado por concessionária --- */
  const MC=(S.concessionarias||[]).map(m=>{const ci=concItens(m),tot=(m.itens||[]).length,d=ci.ok.filter(x=>x.t.every(t=>t.status==='done')).length;return{m,tot,d,dd:m.prazo?dias(m.prazo,today()):null}})
    .filter(x=>x.tot&&x.d<x.tot&&(!gSel||gHas(gSel,x.m.medicao||'_'))).sort((a,b)=>(a.m.prazo||'9999').localeCompare(b.m.prazo||'9999')).slice(0,3);
  const c3=`<section class="rc">${hd('Quanto falta entregar?','Itens concluídos ÷ itens previstos em cada concessionária, com a data de prazo. Ordenado pelo prazo mais próximo.')}<div class="rl">${MC.length?MC.map(({m,tot,d,dd})=>{const pp=d/tot,L=dd!==null&&dd<0?2:dd!==null&&dd<=7&&pp<.7?1:0,pz=dd===null?'sem prazo':dd<0?`⚠ prazo ${fmt(m.prazo)} · venceu há ${-dd} d`:dd===0?'prazo hoje':`prazo ${fmt(m.prazo)} · em ${dd} d`;
    return rr({on:!!m.medicao&&gHas(gSel,m.medicao)&&!!gSel,f:m.medicao?'med|'+m.medicao:'',n:`${esc(concLbl(m))}<small>${pz}</small>`,bar:fill(pp,lc(L)),v:`${d}/${tot} · ${Math.round(pp*100)}%`,tip:`${concLbl(m)}: ${d} de ${tot} itens concluídos · ${pz}`})}).join(''):em('Nenhuma concessionária pendente. Tudo entregue ✔')}</div></section>`;
  /* --- 4. Onde estão (UF) --- */
  const FU=gFld(/^(UF|ESTADO)$/),UC=new Map();if(FU)rBase('uf').filter(t=>t.status!=='done').forEach(t=>{const u=UFK[gNorm(t[FU.id])];if(u)UC.set(u,(UC.get(u)||0)+1)});
  const UL=[...UC].sort((a,b)=>b[1]-a[1]).slice(0,6),um=Math.max(1,...UL.map(x=>x[1]));
  const c4=`<section class="rc">${hd('Onde estão as tarefas?','Tarefas em aberto por estado. Clique para filtrar tudo; o mapa completo fica em “Mapa e medições”.')}<div class="rl">${UL.length?UL.map(([u,n])=>rr({on:gUf===u,f:'uf|'+u,n:esc(u),bar:fill(n/um,'var(--ac2)'),v:String(n),tip:`${UFN[u]||u}: ${n} tarefa(s) em aberto`})).join(''):em(FU?'Nenhuma tarefa em aberto com UF.':'Cadastre o campo UF para ver por estado.')}</div><div class="rf"><button type="button" class="btn" data-rmap>Abrir mapa completo</button></div></section>`;
  /* --- 5. Tendência (8 semanas) --- */
  const WK=[],BK=rBase('',1);for(let k=7;k>=0;k--){const D=now-k*6048e5;let w=0,o=0;BK.forEach(t=>{const a=rAt(t,D);if(!a)return;if(a.op)o++;const dd=rDone(t);if(t.status==='done'&&dd>D-6048e5&&dd<=D)w++});const dt=new Date(D);WK.push({w,o,l:dt.getDate()+'/'+(dt.getMonth()+1)})}
  const mT=Math.max(1,...WK.flatMap(x=>[x.w,x.o])),W=300,H=150,Lm=10,Rm=60,T0=14,Bm=22,X=i=>Lm+i*(W-Lm-Rm)/7,Y=v=>T0+(H-T0-Bm)*(1-v/mT),pt=k=>WK.map((x,i)=>X(i).toFixed(1)+','+Y(x[k]).toFixed(1)).join(' '),ls=WK[7],yw=Y(ls.w),yo=Y(ls.o),sep=Math.abs(yw-yo)<10;
  const svg=`<svg class="rsv" viewBox="0 0 ${W} ${H}" role="img" aria-label="Concluídas e em aberto nas últimas 8 semanas"><line class="ax" x1="${Lm}" x2="${W-Rm}" y1="${Y(0)}" y2="${Y(0)}"/><polyline class="lw" points="${pt('w')}"/><polyline class="lo" points="${pt('o')}"/>${WK.map((x,i)=>{const up=x.w>=x.o;return `<circle class="cw" cx="${X(i).toFixed(1)}" cy="${Y(x.w).toFixed(1)}" r="3.2" data-tip="Semana até ${x.l}: ${x.w} concluída(s) · ${x.o} em aberto"/><circle class="co" cx="${X(i).toFixed(1)}" cy="${Y(x.o).toFixed(1)}" r="3.2" data-tip="Semana até ${x.l}: ${x.w} concluída(s) · ${x.o} em aberto"/><text class="tw" x="${X(i).toFixed(1)}" y="${(Y(x.w)+(up?-6:12)).toFixed(1)}" text-anchor="middle">${x.w}</text><text class="to" x="${X(i).toFixed(1)}" y="${(Y(x.o)+(up?12:-6)).toFixed(1)}" text-anchor="middle">${x.o}</text><text x="${X(i).toFixed(1)}" y="${H-6}" text-anchor="middle">${x.l}</text>`}).join('')}<text class="tw" x="${W-Rm+8}" y="${(yw+(sep&&yw<=yo?-5:3)).toFixed(1)}">━ Concluídas</text><text class="to" x="${W-Rm+8}" y="${(yo+(sep&&yo<yw?-5:sep?11:3)).toFixed(1)}">┅ Em aberto</text></svg>`;
  const c5=`<section class="rc">${hd('Estamos entregando mais do que entra?','Últimas 8 semanas: tarefas concluídas em cada semana (linha cheia) e tarefas ainda em aberto no fim dela (tracejada). Se a tracejada sobe, o trabalho está acumulando.')}${WK.some(x=>x.w||x.o)?svg:em('Sem histórico nas últimas 8 semanas.')}</section>`;
  /* --- 6. Devoluções --- */
  const dv=(L,kf)=>{const m=new Map();L.forEach(t=>(t.ev||[]).filter(e=>e.k==='d').forEach(e=>{const k=kf(t,e);if(!k)return;const o=m.get(k[0])||{n:k[1],a:0,g:0};e.tp==='neg'?o.g++:o.a++;m.set(k[0],o)}));return[...m].map(([k,o])=>({k,...o})).sort((a,b)=>b.a+b.g-a.a-a.g).slice(0,3)};
  const DP=dv(rBase('pa'),(t,e)=>{const f=t.fluxo[e.i];return f?[f.etapa,esc(f.etapa)]:null}),DF=dv(rBase('fu'),(t,e)=>{const k=pkey(e.p),ct=(S.contatos||[]).find(x=>'c:'+x.id===k);return ct?[k,esc(chipName(ct))]:null}),
    dm=Math.max(1,...DP.concat(DF).map(x=>x.a+x.g));let tA=0,tG=0;BK.forEach(t=>(t.ev||[]).forEach(e=>{if(e.k==='d')e.tp==='neg'?tG++:tA++}));
  const dr=(L,pre)=>L.map(x=>rr({on:(pre==='pa'?gR.pa:gR.fu)===x.k,f:pre+'|'+x.k,n:x.n,bar:`<span class="sk" style="width:${((x.a+x.g)/dm*100).toFixed(1)}%"><i style="flex:${x.a};background:var(--dadm)"></i><i style="flex:${x.g};background:var(--bdc)"></i></span>`,v:`${x.a} adm · ${x.g} neg`,tip:`${x.n.replace(/&amp;/g,'&')}: ${x.a} devolução(ões) administrativa(s) · ${x.g} por negativa`})).join('');
  const c6=`<section class="rc">${hd('Onde estamos refazendo trabalho?','Devoluções de passo. Administrativa = erro de processo. Negativa = serviço com problema (reduz a nota). Clique para filtrar.')}${tA+tG?`<div class="rsub">${tA+tG} devolução(ões): ${tA} administrativa(s) · ${tG} por negativa</div><div class="rsub">Por passo</div><div class="rl">${dr(DP,'pa')||em('—')}</div><div class="rsub">Por funcionário</div><div class="rl">${dr(DF,'fu')||em('—')}</div>`:em('Nenhuma devolução. Trabalho fluindo sem retrabalho ✔')}</section>`;
  /* --- 7. Valor (R$) --- */
  const Bs=rBase('st'),VS=ST.map(([k,l,cl])=>({k,l,cl,v:Bs.filter(t=>t.status===k).reduce((s,t)=>s+vv(t),0),n:Bs.filter(t=>t.status===k).length})),vsm=Math.max(1,...VS.map(x=>x.v));
  const gl=(L,kf,lab,pre,cur)=>{const m=new Map();L.forEach(t=>{const k=kf(t),v=vv(t);if(k&&v)m.set(k,(m.get(k)||0)+v)});return[...m].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([k,v])=>({k,v,n:lab(k),f:pre+'|'+k,on:!!cur&&cur.split(GSEP).includes(k)}))};
  const ML=[...gl(rBase('log'),t=>/^\d{4}-\d{2}$/.test(String(t.vmc||'').slice(0,7))?String(t.vmc).slice(0,7):'',k=>'Logictel · '+fmtMes(k),'log',gLog),...gl(rBase('vt'),t=>String(t.vmg||'').trim(),k=>'V.tal · '+k,'vt',gVt)],mmx=Math.max(1,...ML.map(x=>x.v));
  const c7=`<section class="rc w2">${hd('Quanto vale o que está em jogo?','Soma dos valores (R$) por status e por medição Logictel / V.tal. Clique para filtrar.')}${VC.length?`<div class="rtw"><div><div class="rsub">Por status</div><div class="rl">${VS.map(x=>rr({on:gR.st===x.k,f:'st|'+x.k,n:x.l,bar:fill(x.v/vsm,x.cl),v:brlK(x.v),tip:`${x.l}: ${brl(x.v)} · ${x.n} tarefa(s)`})).join('')}</div></div><div><div class="rsub">Por medição</div><div class="rl">${ML.length?ML.map(x=>rr({on:x.on,f:x.f,n:esc(x.n),bar:fill(x.v/mmx,'var(--ac2)'),v:brlK(x.v),tip:`${x.n}: ${brl(x.v)}`})).join(''):em('Nenhum valor com medição preenchida.')}</div></div></div>`:em('Nenhum campo de valor cadastrado. Crie um campo do tipo Valor em Administração.')}</section>`;
  /* --- filtros ativos (chips) --- */
  const CH=[];if(gK)CH.push(['k','Indicador',RKL[gK]]);if(gSel)CH.push(['med','Medição',gVals(gSel).map(v=>v==='_'?'Sem medição':((S.medicoes||[]).find(m=>m.id===v)||{}).nome||v).join(', ')]);if(gLog)CH.push(['log','Logictel',gLb(gLog,fmtMes)]);if(gVt)CH.push(['vt','V.tal',gLb(gVt)]);
  if(gUf)CH.push(['uf','Estado',gVals(gUf).map(u=>UFN[u]||u).join(', ')]);if(gMun)CH.push(['mun','Município',gVals(gMun).join(', ')]);if(gR.fu){const ct=(S.contatos||[]).find(x=>'c:'+x.id===gR.fu);CH.push(['fu','Funcionário',ct?chipName(ct):gR.fu])}
  if(gR.pa)CH.push(['pa','Passo',gR.pa]);if(gR.st)CH.push(['st','Status',(ST.find(x=>x[0]===gR.st)||[0,gR.st])[1]]);
  const chips=CH.length?`<span>Filtros ativos:</span>${CH.map(([k,l,v])=>`<button type="button" class="rcp" data-rcx="${k}" aria-label="Remover filtro ${esc(l)}: ${esc(v)}">${esc(l)}: <b>${esc(v)}</b> ✕</button>`).join('')}<button type="button" class="btn clr" id="rx">${ICO_BROOM} Limpar filtros</button>`:'<span>Clique num indicador ou barra para filtrar.</span>';
  return `<div class="rs"><div class="rks">${kh}</div><div class="rch">${chips}<button type="button" class="btn rmore" data-rmore>${gMore?'← Voltar ao resumo':'Mais gráficos'}</button></div><div class="rg${gMore?' r1':''}">${gMore?c4+c6+c7:c1+c2+c3+c5}</div></div>`}

function gestaoView(){
  const G=gData(1);GP=new Map();
  const rowT=(r,tag,cls,txt)=>{const{t,A}=r;
    const wb=A.map(w=>{const ct=contactFor(w.pessoa),msg=`Olá ${fn1(w.pessoa)}, sobre a tarefa "${nome(t)}" (passo ${w.etapa}): ${txt}. Consegue me dar uma posição?`;return ct&&ct.whatsapp?`<a class="btn wa" target="_blank" rel="noopener" href="${waLink(ct.whatsapp,msg)}" data-cob="${t.id}">${WA_IMG} Cobrar${A.length>1?' '+esc(fn1(w.pessoa)):''}</a>`:''}).join('');
    return `<div class="gs-row" style="--c:${corOf(t)}"><button type="button" class="gm" data-gv="${t.id}"><b>${esc(nome(t))}</b><small>${A.length?A.map(w=>esc(w.etapa)+' · '+esc(w.pessoa)).join(' + '):'Sem passo liberado'}${t.final?' · entrega '+fmt(t.final):''}</small></button><span class="tag${cls?' '+cls:''}">${tag}</span>${wb}</div>`};
  const lst=(L,fn,max=40)=>L.length?L.slice(0,max).map(fn).join('')+(L.length>max?`<p class="hint">+ ${L.length-max} na aba Todas as tarefas.</p>`:''):'<div class="empty">Nada por aqui ✔</div>';
  const semR=r=>`<div class="gs-row" style="--c:${corOf(r.t)}"><button type="button" class="gm" data-gv="${r.t.id}"><b>${esc(nome(r.t))}</b><small>Defina quem faz cada passo (Editar)</small></button><span class="tag late">Sem responsável</span></div>`;
  const cobR=r=>`<div class="gs-row" style="--c:${corOf(r.t)}"><button type="button" class="gm" data-gv="${r.t.id}"><b>${esc(nome(r.t))}</b><small>${r.A.map(w=>esc(w.etapa)+' · '+esc(w.pessoa)).join(' + ')}${r.t.final?' · entrega '+fmt(r.t.final):''}</small></button><span class="tag ok">✓ Cobrado ${new Date(r.t.cob).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span></div>`;
  const SUBS=[['atr','Atrasadas',G.atr,r=>rowT(r,`⚠ ${-r.d} dia(s) de atraso`,'late',`está atrasada há ${-r.d} dia(s)`)],
    ['prox','Vencem em até 2 dias',G.prox,r=>rowT(r,r.d===0?'Vence hoje':r.d===1?'Vence amanhã':'Vence em 2 dias','',r.d===0?'vence hoje':r.d===1?'vence amanhã':'vence em 2 dias')],
    ['par','Paradas há 3+ dias',G.par,r=>rowT(r,`Parada há ${r.p} dias`,'',`está parada há ${r.p} dias`)],
    ['sem','Sem responsável',G.sem,semR],['cob','Cobrados hoje',G.cob,cobR]];
  const sb=SUBS.find(x=>x[0]===gSub)||SUBS.find(x=>x[2].length&&x[0]!=='cob')||SUBS.find(x=>x[2].length)||SUBS[0];
  const acao=`<div class="chips" role="group" aria-label="Tipo de pendência">${SUBS.map(([k,l,L])=>`<button type="button" class="chip${k===sb[0]?' on':''}" data-gsub="${k}">${l} <b>${L.length}</b></button>`).join('')}</div>
    <div class="gs-list">${sb[2].length?lst(sb[2],sb[3]):(G.n?'<div class="empty">Nada nesta lista ✔</div>':'<div class="empty">Nada pendente: tudo em dia ou já cobrado hoje ✔</div>')}</div>`;
  const P=(S.contatos||[]).map(c=>({c,L:G.R.filter(r=>r.A.some(w=>pkey(w.pessoa)==='c:'+c.id)).map(r=>r.t)}));
  const com=P.filter(x=>x.L.length).sort((a,b)=>b.L.filter(late).length-a.L.filter(late).length||b.L.length-a.L.length),livres=P.filter(x=>!x.L.length).map(x=>chipName(x.c));
  const pauta=`<div class="gs-pg">${com.map(({c,L})=>{const a=L.filter(late).length,S2=srt(L),
      txt=`Olá ${fn1(c.nome)}, sua pauta de hoje (${L.length}):\n`+S2.map((t,i)=>`${i+1}. ${nome(t)} — ${myE(t,c)}${t.final?' · entrega '+fmt(t.final):''}${late(t)?' (ATRASADA)':''}`).join('\n');GP.set(c.id,txt);
    return `<article class="gs-p"><div class="gs-ph"><b>${esc(chipName(c))}</b><span class="tag">${L.length} em aberto</span>${a?`<span class="tag late">${a} atrasada(s)</span>`:''}</div><ul>${S2.slice(0,5).map(t=>`<li><button type="button" data-gv="${t.id}">${esc(nome(t))}</button><small>${esc(myE(t,c))}${t.final?' · '+fmt(t.final):''}</small></li>`).join('')}</ul>${L.length>5?`<small>+ ${L.length-5} tarefa(s)</small>`:''}<div class="gs-pa"><button type="button" class="btn" data-gc="${c.id}">⧉ Copiar pauta</button>${c.whatsapp?`<a class="btn wa" target="_blank" rel="noopener" href="${waLink(c.whatsapp,txt)}" data-cob="${L.map(t=>t.id).join(',')}">${WA_IMG} Enviar pauta</a>`:''}</div></article>`}).join('')||'<div class="empty" style="grid-column:1/-1">Nenhum funcionário com tarefa em aberto.</div>'}</div>`
    +(livres.length?`<p class="hint"><b>Sem tarefas em aberto:</b> ${esc(livres.join(', '))}</p>`:'');
  const M=(S.concessionarias||[]).map(m=>{const{no}=concItens(m),tot=(m.itens||[]).length,d=concItens(m).ok.filter(x=>x.t.every(t=>t.status==='done')).length;return{m,no:no.length,d,tot,dd:m.prazo?dias(m.prazo,today()):null}})
    .filter(x=>x.tot&&x.d<x.tot&&(x.no||(x.dd!==null&&x.dd<=7))&&(!gSel||gHas(gSel,x.m.medicao||'_'))).sort((a,b)=>(a.m.prazo||'9999').localeCompare(b.m.prazo||'9999'));
  const med=`<div class="gs-list">${lst(M,({m,no,d,tot,dd})=>`<button type="button" class="gs-row" data-gm="${esc(m.id)}" style="--c:${corConc(m)}"><span><b>${esc(concLbl(m))}</b><small>${d} de ${tot} concluídos · ${no?no+' item(ns) sem tarefa':'todos cadastrados'}</small></span><span class="tag${dd!==null&&dd<0?' late':''}">${dd===null?'Sem prazo':dd<0?'Venceu há '+(-dd)+' d':dd===0?'Vence hoje':'Vence em '+dd+' d'}</span></button>`)}</div>`;
  const nmov=S.tasks.filter(movNew).length,mov=mvSec(40)||'<div class="empty">Nenhuma tarefa mudou de posto recentemente ✔</div>';
  const K=(n,l,hot,go)=>`<button type="button" class="gs-k${hot&&n?' hot':''}" data-gk="${go}"><b data-cu>${n}</b><span>${l}</span></button>`;
  const KP4=()=>K(G.atr.length,'atrasadas',1,'acao|atr')+K(G.prox.length,'vencem em até 2 dias',0,'acao|prox')+K(G.par.length,'paradas há 3+ dias',0,'acao|par')+K(M.reduce((a,x)=>a+x.no,0),'itens de concessionária sem tarefa',1,'med|');
  const GT=[['graf','Mapa e medições'],['res','Resumo'],['acao','Ação agora',G.n,1],['med','Concessionárias',M.length],['mov','Mudaram de posto',nmov,1],['hist','Histórico de atualizações',0]];
  if(!GT.some(x=>x[0]===gTab))gTab='graf';
  const gcp=(()=>{
    const ST=[['todo','A iniciar','#8ea4cf'],['doing','Em andamento','#f2c14e'],['wait','Aguardando','#c4a5f5'],['done','Concluídas','#2fb59f']],
      V=S.tasks.filter(vis),T00=V.filter(t=>ST.some(x=>x[0]===t.status)&&gOk(t,0)&&tarOk(t)),
      medBase=V.filter(t=>ST.some(x=>x[0]===t.status)),
      medOptBase=medBase.filter(t=>gMt(gLog,gLk(t))&&gMt(gVt,gVk(t))),medOpts=[...(S.medicoes||[])].filter(m=>medOptBase.some(t=>medMatch(t,m.id))).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(m=>({id:m.id,nome:m.nome})),
      medSem=medOptBase.some(t=>medMatch(t,'_')),
      logBase=medBase.filter(t=>(!gSel||gVals(gSel).some(v=>medMatch(t,v)))&&gMt(gVt,gVk(t))),
      vtBase=medBase.filter(t=>(!gSel||gVals(gSel).some(v=>medMatch(t,v)))&&gMt(gLog,gLk(t))),
      ufBase=vtBase.filter(t=>gMt(gVt,gVk(t))),
      MP=gMapHtml(T00.filter(t=>(!gSel||gVals(gSel).some(v=>medMatch(t,v)))&&(gMt(gLog,gLk(t)))&&(gMt(gVt,gVk(t))))),
      FU=gFld(/^(UF|ESTADO)$/),FM=gFld(/MUNIC|CIDADE/),
      T0=(gUf&&FU)||(gMun&&FM)?T00.filter(t=>(!gUf||!FU||gHas(gUf,UFK[gNorm(t[FU.id])]))&&(!gMun||!FM||gHas(gMun,gNorm(String(t[FM.id]||'').trim())))):T00,T=gSel?T0.filter(t=>gVals(gSel).some(v=>medMatch(t,v))):T0,
      ms=medOpts;
    if(medSem)ms.push({id:'_',nome:'Sem medição'});
    const C=ms.map(m=>{const L=T0.filter(t=>medMatch(t,m.id)),c=ST.map(([k,l,cl])=>({k,l,cl,n:L.filter(t=>t.status===k).length})).filter(x=>x.n);return{m,c,n:L.length}}),
      mx=Math.max(1,...C.map(x=>x.n&&Math.max(...x.c.map(y=>y.n)))),PH=190,tot=T.length,dn=T.filter(t=>t.status==='done').length,pct=tot?Math.round(dn/tot*100):0;
    const lo=[...new Set(logBase.map(t=>String(t.vmc||'').slice(0,7)).filter(k=>/^\d{4}-\d{2}$/.test(k)))].sort(),
      logSem=logBase.some(t=>!gLk(t)),vtSem=vtBase.some(t=>!gVk(t)),
      vo=[...new Set(vtBase.map(t=>String(t.vmg||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
    const fs=(id,l,cur,o)=>{const all=[['_','Sem medição'],...o],s0=gVals(cur),emp=s0.includes(EMP),sel=s0.filter(v=>v!==EMP),tx=emp&&!sel.length?'Nenhuma':!sel.length?'Todas':sel.length===1?(all.find(x=>x[0]===sel[0])||[0,sel[0]])[1]:sel.length+' selecionadas',open=gMfOpen===id,it=(v,t,c,a)=>`<label class="gmi"><input type="checkbox" value="${esc(v)}" ${a?'data-all="1" ':''}${c?'checked':''}><span>${esc(t)}</span></label>`;return `<div class="gfi gmf" data-mf="${id}"><span>${l}</span><button type="button" class="gmb" aria-haspopup="true" aria-expanded="${open}"><em>${esc(tx)}</em></button><div class="gmdp"${open?'':' hidden'}>${it('','Todas',!sel.length&&!emp,1)}${all.map(([v,t])=>it(v,t,emp?false:v==='__n'?sel.includes('__n'):(!sel.length||sel.includes(v)))).join('')}</div></div>`};
    const fm=(id,l,cur,o,sem)=>{const s0=gVals(cur),emp=s0.includes(EMP),sel=s0.filter(v=>v!==EMP),all=[['__n','Nenhuma'],...o],tx=emp&&!sel.length?'Nenhuma':sel.length?(sel.length===1?(all.find(x=>x[0]===sel[0])||[0,sel[0]])[1]:sel.length+' selecionadas'):'Todas',open=gMfOpen===id,it=(v,t,c,a)=>`<label class="gmi"><input type="checkbox" value="${esc(v)}" ${a?'data-all="1" ':''}${c?'checked':''}><span>${esc(t)}</span></label>`;return `<div class="gfi gmf" data-mf="${id}"><span>${l}</span><button type="button" class="gmb" aria-haspopup="true" aria-expanded="${open}"><em>${esc(tx)}</em></button><div class="gmdp"${open?'':' hidden'}>${it('','Todas',!sel.length&&!emp,1)}${all.map(([v,t])=>it(v,t,emp?false:v==='__n'?sel.includes('__n'):(!sel.length||sel.includes(v)))).join('')}</div></div>`};
    const leg=`<div class="gleg">${ST.map(([k,l,c])=>`<span style="--c:${c}"><i></i>${l} <b>${T.filter(t=>t.status===k).length}</b></span>`).join('')}</div>`;
    const cols=C.length?`<div class="gcols" data-mx="${mx}">${C.map(({m,c,n})=>`<div class="gg${gSel&&!gHas(gSel,m.id)?' dim':''}" style="flex-grow:${Math.max(1,c.length)}"><div class="gbs">${c.map(({l,cl,n:v})=>{const h=v/mx*PH;return `<u data-v="${v}" style="--c:${cl};--h:${h.toFixed(1)}px" class="${h<20?'sm':''}" title="${esc(m.nome)} · ${l}: ${v}"><b>${v}</b></u>`}).join('')||'<span class="gz">0</span>'}</div><button type="button" class="gnm${gHas(gSel,m.id)&&gSel?' on':''}" data-gmed="${esc(m.id)}" aria-pressed="${gHas(gSel,m.id)&&!!gSel}" title="Filtrar por ${esc(m.nome)} (${n} tarefas)">${esc(m.nome)}</button></div>`).join('')}</div>`:'<div class="empty">Nenhuma medição cadastrada.</div>';
    gRep={T,f:[['Medição',gSel?gVals(gSel).map(v=>v===EMP?'Nenhuma':v==='_'?'Sem medição':medNm(v)||v).join(', '):'Todas'],['Medição Logictel',gLog?gLb(gLog,fmtMes):'Todas'],['Medição V.tal',gVt?gLb(gVt):'Todas'],['UF',(gUf?gVals(gUf).map(v=>v===EMP?'Nenhum':v).join(', '):'Todos')],['Município',gMun?gVals(gMun).map(v=>v===EMP?'Nenhum':v).join(', '):'Todos'],['Tarefas',gTk?gVals(gTk).map(v=>v===EMP?'Nenhuma':v).join(', '):'Todas'],['Concessionária',gCn?gVals(gCn).map(v=>v===EMP?'Nenhuma':v).join(', '):'Todas']]};
    const chBar=`<div class="gch" role="group" aria-label="Tipo de gráfico">${GCH.map(([k,l])=>`<button type="button" class="btn${gCh===k?' pri':''}" data-gch="${k}" aria-pressed="${gCh===k}">${GI[k]||''}${l}</button>`).join('')}<button type="button" class="btn gxl" id="gxl" title="Baixar relatório em Excel (XLSX) conforme os filtros" aria-label="Baixar relatório XLSX">⬇ XLSX</button><button type="button" class="btn gxl" id="gimp" title="Atualizar os dados importando um relatório XLSX (mesmo modelo do baixado)" aria-label="Importar relatório XLSX">⬆ Importar</button><input type="file" id="gimpf" accept=".xlsx" hidden><button type="button" class="btn gbr" id="gfx" aria-label="Limpar filtros" title="Limpar filtros"${gSel||gLog||gVt||gUf||gMun||gK||gR.fu||gR.pa||gR.st||gTar||gTk||gCn?'':' disabled'}>${ICO_BROOM}</button><div class="gkr" role="group" aria-label="Segmentar por situação">${KP4()}</div></div>`;
    const gBody=gCh==='map'?MP:cols+'<p class="hint">Colunas por medição e status. Clique no nome da medição para filtrar a Gestão.</p>';
    const tkO=[...new Map(medBase.filter(t=>t.tarefa).map(t=>[nk(t.tarefa),String(t.tarefa)])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR',{numeric:true})),
      cnO=[...new Set(medBase.map(cnOf).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(v=>[v,v]);
    const gNf=[gSel,gLog,gVt,gUf,gMun,gTar,gTk,gCn].filter(Boolean).length;
    const flt=`<aside class="gfx" aria-label="Filtros"><div class="gxh"><h2>Filtros${gNf?`<em class="gxn">${gNf}</em>`:''}</h2><button type="button" class="btn" id="gfc"${gNf?'':' disabled'}>Limpar filtros</button></div><div class="gxb">
      <section class="gxs"><h4>Medições</h4><div class="gfl">${fs('gfmed','Medição',gSel,ms.map(m=>[m.id,m.nome]))}${fm('gflog','Medição Logictel',gLog,lo.map(k=>[k,fmtMes(k)]),logSem)}${fm('gfvt','Medição V.tal',gVt,vo.map(v=>[v,v]),vtSem)}</div></section>
      <section class="gxs"><h4>Localização</h4><div class="gfl">${gMapFl}</div></section>
      <section class="gxs"><h4>Tarefas e concessionárias</h4><div class="gfl">${fm('gftk','Tarefas',gTk,tkO,0)}${fm('gfcn','Concessionária',gCn,cnO,0)}<div class="gfi gfi-t"><label for="gftar">Tarefa / Concessionária</label><input type="search" id="gftar" class="gtar" placeholder="Digite o nome da tarefa ou da concessionária" autocomplete="off" value="${esc(gTar)}"></div></div></section>
      </div></aside>`;
    const gBody2=gCh==='map'?gBody.replace('<!--GFX-->',flt):`<div class="gme gme-c"><div class="gcm">${gBody}</div>${flt}</div>`;
    const valCampos=campos().filter(c=>c.tipo==='valor');
    const somaVP=T.reduce((acc,t)=>acc+valCampos.reduce((s,c)=>s+(parseFloat(t[c.id])||0),0),0);
    const vpTxt=somaVP>0?brl(somaVP):'',gsz=vpTxt?Math.max(30,Math.min(64,Math.floor(200/(vpTxt.length*.6)))):64;
    const vpHtml=vpTxt?`<b class="gv">${vpTxt}</b><span>valor total dos projetos${gSel||gLog||gVt||gUf||gMun?' (filtrado)':''}</span>`:'';
    const ST2=ST.map(([k,l,c])=>`<span style="--c:${c}"><i></i>${l} <b>${T.filter(t=>t.status===k).length}</b></span>`).join('');
    return `<section class="gcp gsx${gFOpen?' gfo':''}" aria-label="Gráficos">${chBar}<div class="gsy"><div class="gsc"><i>1</i><span>Quanto está em jogo</span>${vpTxt?`<b class="gv">${vpTxt}</b><small>valor total dos projetos${gSel||gLog||gVt||gUf||gMun||gTk||gCn||gTar?' (filtrado)':''}</small>`:'<b>—</b><small>sem valores cadastrados</small>'}</div><div class="gsc"><i>2</i><span>Quantas tarefas</span><b data-cu>${tot}</b><small>tarefas nas medições</small><div class="gst">${ST2}</div></div><div class="gsc"><i>3</i><span>Como estão andando</span><b>${pct}% <small>concluído</small></b><div class="gpb"><u style="width:${pct}%"></u></div><small>${tot-dn} em andamento ou a fazer · ${dn} concluída(s)</small></div></div><div class="gcc"><div class="gcap"><i>4</i>Onde estão as tarefas<small>${gCh==='map'?'clique num estado para detalhar · 2 cliques num município abrem o card':'colunas por medição e status'}</small></div><div class="gbd">${gCh==='map'?'':leg}${gBody2}</div></div></section>`})();
  return `<div class="admin"><div class="gs-k4"${gTab==='res'||gTab==='graf'?' hidden':''}>${KP4()}</div>
  <div class="tabs" role="tablist" aria-label="Gestão">${GT.map(([k,l,n,h])=>`<button type="button" role="tab" aria-selected="${gTab===k}" data-gt="${k}">${l}${n?` <em${h?' class="hot"':''}>${n}</em>`:''}</button>`).join('')}</div>
  <div role="tabpanel">${gTab==='res'?gResumo():gTab==='graf'?gcp:gTab==='acao'?acao:gTab==='med'?med:gTab==='hist'?gHist():mov}</div></div>`;
}

/* ---------- Aba Concessionárias: itens cadastrados x faltando ---------- */
function dbl(el,fn){let t=0,l=0;const go=e=>{const n=Date.now();if(n-l<600)return;l=n;t=0;fn(e)};el.addEventListener('click',e=>{const n=Date.now();if(n-t<450)go(e);else t=n});el.addEventListener('dblclick',go)}
const corConc=m=>m.cor||(tipoDe(m)||{}).cor||'var(--ac)';
const daConc=(y,m)=>!!y&&(y.conc===m.id||(!y.conc&&nk(y.nome)===nk(m.nome)));
const tipoDe=m=>S.tipos.find(y=>y.conc===m.id)||S.tipos.find(y=>daConc(y,m));
function concItens(m){
  const by=new Map();
  S.tasks.forEach(t=>{const y=tipoOf(t);if(daConc(y,m)){const k=nk(t.tarefa);if(!by.has(k))by.set(k,[]);by.get(k).push(t)}});
  const ok=[],no=[];
  (m.itens||[]).forEach(i=>{const L=by.get(nk(i));L&&L.length?ok.push({i,t:L}):no.push(i)});
  return{ok,no,y:tipoDe(m)};
}
function concView(){
  const M=[...(S.concessionarias||[])].sort((a,b)=>(a.prazo||'9999').localeCompare(b.prazo||'9999')||a.nome.localeCompare(b.nome,'pt-BR'));
  const cd=m=>{const {ok,no}=concItens(m),tot=(m.itens||[]).length,d=ok.filter(x=>x.t.every(t=>t.status==='done')).length,lt=!!m.prazo&&m.prazo<today()&&d<tot,pct=tot?Math.round(ok.length/tot*100):0;
    return `<button type="button" class="mcd${lt?' late':''}" data-mo="${esc(m.id)}" style="--c:${corConc(m)}" aria-label="Abrir concessionária ${esc(concLbl(m))}: ${ok.length} de ${tot} itens cadastrados"><h3>${esc(m.nome)}${lt?' ⚠':''}</h3><span class="mbar" aria-hidden="true"><i style="--w:${pct}%"></i></span><div class="mr"><span class="tag">${ok.length} de ${tot} cadastrados</span>${no.length?`<span class="tag late">Faltam ${no.length}</span>`:'<span class="tag">✔ Todos cadastrados</span>'}</div><p class="hint">${m.prazo?'Prazo de entrega '+fmt(m.prazo)+(lt?' ⚠':''):'Sem prazo de entrega'}</p></button>`};
  const G=byMed(M).filter(g=>g.L.length);
  return `<div class="admin"><div class="ahead"><div><h2>Concessionárias</h2><p class="hint">Organizadas por medição. Clique em uma concessionária para ver os itens já cadastrados e os que faltam.</p></div></div>
  ${G.map(g=>`<section class="mcs"><h3>${esc(g.c.nome)}</h3><div class="mgrid">${g.L.map(cd).join('')}</div></section>`).join('')||'<div class="empty">Nenhuma concessionária cadastrada. Cadastre em Administração › Medições e Concessionárias.</div>'}</div>`;
}
function openConcItens(id){
  const m=(S.concessionarias||[]).find(x=>x.id===id);if(!m)return;
  const {ok,no}=concItens(m),tot=(m.itens||[]).length;
  const ico=L=>L.every(t=>t.status==='done')?'✔ ':L.some(late)?'⚠ ':'';
  const [d,close]=dlg(`<div class="dh"><div><h2>${esc(m.nome)}</h2><p class="hint">${medNm(m.medicao)?'Medição '+esc(medNm(m.medicao))+' · ':''}${ok.length} de ${tot} itens cadastrados${m.prazo?' · prazo '+fmt(m.prazo):''}</p></div><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  <div class="vb"><div class="mi2">
    <section class="ok" aria-label="Itens cadastrados"><h3>Cadastrados <em>${ok.length}</em></h3><div class="mts">${ok.map(({i,t},k)=>`<button type="button" class="mt ok" data-ok="${k}" title="Abrir a tarefa">${ico(t)}${esc(i)}${t.length>1?` <small>×${t.length}</small>`:''}</button>`).join('')||'<div class="empty">Nenhum item cadastrado ainda.</div>'}</div></section>
    <section class="no" aria-label="Itens que faltam cadastrar"><h3>Faltam cadastrar <em>${no.length}</em></h3><div class="mts">${no.map((i,k)=>`<button type="button" class="mt no" data-no="${k}" title="Dois cliques para cadastrar a tarefa">${esc(i)}</button>`).join('')||'<div class="empty">✔ Todos os itens já foram cadastrados.</div>'}</div></section>
  </div><p class="hint">Dê <b>dois cliques</b> (ou Enter) em um item que falta para abrir o cadastro da tarefa já preenchido com ele. Clique em um item cadastrado para ver a tarefa.</p></div>
  <div class="df"><button type="button" class="btn" id="me">Editar itens da concessionária</button><span class="sp"></span><button type="button" class="btn pri" id="mf">Fechar</button></div>`,corConc(m));
  const then=fn=>{close();setTimeout(fn,190)};
  d.querySelectorAll('[data-no]').forEach(b=>{const go=()=>novaTarefaItem(m,no[+b.dataset.no],then);dbl(b,go);b.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go()}}});
  d.querySelectorAll('[data-ok]').forEach(b=>b.onclick=()=>then(()=>openView(ok[+b.dataset.ok].t[0].id)));
  d.querySelector('#mf').onclick=close;
  d.querySelector('#me').onclick=()=>then(()=>openConc(m.id));
}
function novaTarefaItem(m,item,then){
  const y=tipoDe(m);
  then(()=>{if(!y)toast('Escolha o tipo de fluxo desta tarefa');openTask(null,{tipo:y?y.id:'',tarefa:item},()=>openConcItens(m.id))});
}

function openTask(id,pre,after){
  const t=S.tasks.find(x=>x.id===id)||{tipo:S.tipos[0]?.id||'',tarefa:'',sub:'',protocolo:'',qtd:'',fluxo:[],status:'todo',repasse:today(),final:'',portal:'',obs:'',notas:[],...(pre||{})};
  const isNew=!id;let dirty=!isNew;
  const [d,close]=dlg(`<form method="dialog" id="tf"><div class="dh"><h2 id="dt">${isNew?'Nova tarefa':esc(t.tarefa)}</h2><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div>
  ${tabsH([['dados','Dados'],['fluxo','Fluxo'],['diagrama','Diagrama']],'dados','Seções da tarefa')}
  <div class="db tp" data-tp="dados">
  <div class="full"><label for="ft">Tipo de fluxo</label><select id="ft">${!t.tipo?'<option value="">Sem tipo</option>':''}${S.tipos.map(y=>`<option value="${y.id}" ${t.tipo===y.id?'selected':''}>${esc(tipoLbl(y))}</option>`).join('')}</select><div class="hint" id="mh"></div></div>
  <div class="full"><label for="f1">Título *</label><div id="f1w"></div><div class="hint" id="np"></div></div>
  ${campos().filter(c=>['texto','numero','valor','mes'].includes(c.tipo)).map(c=>fieldHtml(c,t)).join('')}
  ${campos().filter(c=>c.tipo==='data').map(c=>fieldHtml(c,t)).join('')}
  <div><label for="f7">Data estimada final</label><input type="date" id="f7" value="${t.final}"></div>
  <div><label for="f8">Status</label><select id="f8">${COLS.map(([k,l])=>`<option value="${k}" ${t.status===k?'selected':''}>${l}</option>`).join('')}</select></div>
  ${campos().filter(c=>c.tipo==='longo').map(c=>fieldHtml(c,t)).join('')}
  </div>
  <div class="db tp" data-tp="fluxo" hidden><div class="full"><div id="fed"></div></div></div>
  <div class="db tp" data-tp="diagrama" hidden><div class="full"><div class="fdw" id="fdv"></div><div class="fleg">Cada seta liga um passo ao que depende dele. Passo sem seta chegando é livre; passo sem seta saindo não bloqueia ninguém. Caixa tracejada = passos concomitantes.</div></div></div>
  <div class="df"><button class="btn pri">Salvar</button>
  ${isNew?'':`<span class="sp"></span><button type="button" class="btn dan" id="dl">Excluir</button>`}</div></form>`,corOf(t));
  const q=x=>d.querySelector(x),sel=q('#ft');bindTabs(d);
  const Y=()=>S.tipos.find(x=>x.id===sel.value)||{campos:campos().map(c=>c.id),meta:{v:0,u:'dias'}};
  const recalc=()=>{if(!dirty){const c=calc(Y(),q('#f6').value,q('#fq').value);if(c)q('#f7').value=c}};
  const apply=user=>{const y=Y();d.querySelectorAll('[data-f]').forEach(e=>e.hidden=!(y.campos.includes(e.dataset.f)||MEDF.includes(e.dataset.f)));
    q('#mh').textContent='Meta de entrega: '+metaTxt(y);
    if(y.cor)d.style.setProperty('--c',y.cor);recalc()};
  sel.onchange=()=>{apply(true);if(isNew)ed.setSteps(stepsOf(Y()));else ed.redraw();tf()};const pv=()=>q('#np').textContent=isNew||t.fx?'Nome da tarefa: '+((Y().nome||'')+' '+q('#f1').value).trim():'';const tf=()=>{const m=concOf(Y()),e=q('#f1'),v=e?e.value:t.tarefa;
    q('#f1w').innerHTML=m?`<select id="f1" required><option value="">— escolha o item —</option>${m.itens.map(i=>`<option ${i===v?'selected':''}>${esc(i)}</option>`).join('')}${!isNew&&v&&v===t.tarefa&&!m.itens.includes(v)?`<option selected>${esc(v)}</option>`:''}</select>`:`<input type="text" id="f1" required placeholder="Título" value="${esc(v)}">`;
    q('#f1').oninput=pv;q('#f1').onchange=pv;pv()};q('#f6').oninput=recalc;q('#fq').oninput=recalc;bindMasks(d);q('#f7').oninput=()=>dirty=true;
  apply(false);
  const ed=flowEd(q('#fed'),t,()=>sel.value,q('#fdv'));if(isNew)ed.setSteps(stepsOf(Y()));tf();
  const collect=()=>{
    t.tipo=sel.value;if(isNew)t.fx=1;t.tarefa=q('#f1').value.trim();campos().forEach(c=>{const e=q('#'+fid(c.id));if(e)t[c.id]=readVal(c,e)});
    {const r=ed.get();t.fluxo=r.fluxo;t.dag=1;delete t.passo}
    t.final=q('#f7').value;t.status=q('#f8').value;
  };
  q('#tf').onsubmit=async e=>{e.preventDefault();const r=ed.get();if(!r.fluxo.length){toast('Defina os passos do fluxo');return}if(cyc(r.fluxo)){toast('Há uma dependência circular no fluxo. Revise as dependências dos passos.');return}const a0=isNew?null:snap(t);collect();
    if(a0){const a1=snap(t);if(a0.k!==a1.k)t.mov={t:Date.now(),tp:'e',de:a0.e||'—',dp:a0.p||'—',para:a1.e,pp:a1.p,fim:a1.k===''?1:0,por:user}}
    if(isNew){t.id='t'+Date.now();S.tasks.push(t)}await save();close();render();if(after)setTimeout(after,200)};
  if(!isNew){
    
    q('#dl').onclick=async()=>{if(await fxAsk({t:'Excluir tarefa',m:'Excluir esta tarefa definitivamente?',ok:'Excluir',dan:1})){S.tasks=S.tasks.filter(x=>x.id!==id);await save();close();render()}};
  }
  q('#f1').focus();
}

try{const u=JSON.parse(sessionStorage.getItem('ui')||'{}');if(ASEC.some(a=>a[0]===u.adminSec))adminSec=u.adminSec;if(Number.isInteger(u.gStep)&&u.gStep>=0&&u.gStep<GUIA.length)gStep=u.gStep}catch(e){}
document.addEventListener('keydown',e=>{
  if(!user||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||e.target.closest('input,select,textarea,[contenteditable]'))return;
  const k=e.key.toLowerCase(),V=['gestao','painel','tarefa','equipe','med','admin','guia'];
  if(view==='guia'&&(k==='arrowright'||k==='arrowleft')){const b=$(k==='arrowright'?'#gn':'#gp');if(b&&!b.disabled)b.click();return}
  if(k==='n'){if(isAdm()){e.preventDefault();openTask()}}else if(k==='/'){const q=$('#fq');if(q){e.preventDefault();q.focus();q.select()}}else if(k==='t'){cycTheme()}else if(/^[1-7]$/.test(k)){if(allowed(V[k-1])){view=V[k-1];render()}}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-fin]');if(b){e.stopPropagation();e.preventDefault();avancar(b.dataset.fin,1,{sid:b.dataset.fs})}const g=e.target.closest('[data-dir]');if(g){e.stopPropagation();e.preventDefault();abrirDir(g.dataset.dir)}},true);
load().then(()=>{ensureTipos();if(ME&&!ME.adm&&!meC())ME=user=null;render()});
async function sbReconnect(){if(!SB.on||SB.ok||SB.busy)return;SB.busy=true;try{const o=await sbPull();
  if(TB.every(([k])=>!o[k].length)){SB.ok=true;LAST={};await sbPush();toast('Conectado ao banco: dados enviados')}
  else{applyRemote(o);ensureTipos();SB.ok=true;toast('Conectado ao banco')}
  lastSave=new Date();stUpd();if(user)render()}catch(e){console.error(e)}SB.busy=false}
setInterval(sbPoll,10000);setInterval(sbRetry,12000);setInterval(sbReconnect,8000);
addEventListener('online',()=>{sbRetry();sbPoll()});addEventListener('offline',()=>toast('Sem internet — as alterações serão enviadas quando voltar'));
addEventListener('error',e=>{if(/ResizeObserver|Script error/.test(e.message||'')||!e.error)return;if(e.filename&&e.filename.split(/[?#]/)[0]!==location.href.split(/[?#]/)[0])return;console.error(e.error);const _n=Date.now();if(_n-(window._eT||0)<15000)return;window._eT=_n;toast('Ocorreu um erro inesperado. Recarregue a página se algo não responder.')});
addEventListener('unhandledrejection',e=>{console.error(e.reason);toast('Falha na operação. Tente novamente.')});
let _act=Date.now();['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>_act=Date.now(),true));
setInterval(()=>{if(user&&Date.now()-_act>120*60*1000){sessionStorage.removeItem('me');ME=user=null;render();toast('Sessão encerrada por inatividade')}},60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sbPoll()});

/* ===== Tela cheia + ajuste automático ao tamanho da janela (portado do UltraClínica) =====
   Aviso no topo e entrada automática no primeiro clique/Enter; botão ⛶ no cabeçalho.
   Em janelas menores que 1280×720 tudo reduz na mesma proporção (o zoom manual A continua como máximo). */
(()=>{const de=document.documentElement,req=de.requestFullscreen||de.webkitRequestFullscreen,ex=document.exitFullscreen||document.webkitExitFullscreen;
 const inFs=()=>!!(document.fullscreenElement||document.webkitFullscreenElement),isFs=()=>inFs()||(innerHeight>=screen.height-2&&innerWidth>=screen.width-2);
 const go=()=>{try{const r=req&&req.call(de);r&&r.catch&&r.catch(()=>{})}catch(e){}};
 const H0=720,W0=1280,MIN=.62;
 window.fitZ=()=>{const Z=ZOOMS[PREF.z||0]||1,e=innerWidth>860?Math.max(MIN,Math.min(Z,innerHeight/H0,innerWidth/W0)):Z;de.style.setProperty('--z',e)};
 let t;addEventListener('resize',()=>{clearTimeout(t);t=setTimeout(fitZ,80)});
 ['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,()=>setTimeout(fitZ,120)));fitZ();
 document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#bf'))inFs()?ex&&ex.call(document):go()});
 if(!req)return;
 let no=false;try{no=sessionStorage.getItem('fluxo-fs-no')==='1'}catch(e){}
 const b=document.createElement('div');b.id='fsb';b.setAttribute('role','region');b.setAttribute('aria-label','Tela cheia');
 b.innerHTML='<span>Para aproveitar melhor a tela, use o modo tela cheia.</span><button type="button" class="btn pri" id="fsy">Entrar em tela cheia</button><button type="button" class="btn" id="fsn">Agora não</button>';
 document.body.appendChild(b);
 const sync=()=>{b.hidden=no||isFs()};
 b.querySelector('#fsy').onclick=go;
 b.querySelector('#fsn').onclick=()=>{no=true;try{sessionStorage.setItem('fluxo-fs-no','1')}catch(e){}sync()};
 const first=e=>{if(e.type==='keydown'&&e.key!=='Enter')return;if(e.target.closest&&e.target.closest('#fsb'))return;document.removeEventListener('click',first,true);document.removeEventListener('keydown',first,true);if(!no&&!isFs())go()};
 document.addEventListener('click',first,true);document.addEventListener('keydown',first,true);
 ['fullscreenchange','webkitfullscreenchange','resize'].forEach(ev=>addEventListener(ev,sync));sync()})();

/* Menu lateral: sempre recolhido; expande/recolhe com o botão direito (ou tecla Menu) sobre ele. Fecha ao clicar fora, Esc ou escolher uma tela. Em toque: tocar no logo */
(function(){const hd=()=>document.querySelector('header.sb');
 document.addEventListener('contextmenu',e=>{const h=e.target.closest&&e.target.closest('header.sb');if(!h||innerWidth<761)return;e.preventDefault();window._xpLock=false;h.classList.toggle('xp')});
 document.addEventListener('click',e=>{const h=hd();if(!h||!e.target.closest)return;const dentro=e.target.closest('header.sb');
  if(matchMedia('(hover:none)').matches&&e.target.closest('header.sb .logo')){h.classList.toggle('xp');return}
  if(h.classList.contains('xp')&&(!dentro||e.target.closest('nav button')))h.classList.remove('xp')});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!MEDOPEN){const h=document.querySelector('header.sb.xp');if(h)h.classList.remove('xp')}});
})();

/* Esc fecha a lista de filtro aberta */
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&(gMfOpen||gFOpen)&&!document.querySelector('dialog[open]')){if(gMfOpen)gMfOpen='';else gFOpen=false;render()}});


/* ---------- Janela de aviso/confirmação do programa (substitui confirm/prompt do navegador) ---------- */
function fxAsk(o){return new Promise(res=>{let r=false;
  const [d,close]=dlg(`<div class="dh"><div><h2>${esc(o.t||'Aviso')}</h2></div><button type="button" class="btn" id="x" aria-label="Fechar">✕</button></div><div class="vb fxmb">${o.h||`<p class="fxmsg">${esc(o.m||'')}</p>`}${o.inp?`<input type="text" id="fxin" value="${esc(o.v==null?'':o.v)}" autocomplete="off">`:''}</div><div class="df"><span class="sp"></span>${o.no===false?'':'<button type="button" class="btn" id="fxn">Cancelar</button>'}<button type="button" class="btn ${o.dan?'dan':'pri'}" id="fxy">${esc(o.ok||'OK')}</button></div>`,o.dan?'#ef4444':'#f2c14e');
  d._oc=()=>res(r?(o.inp?d.querySelector('#fxin').value:true):(o.inp?null:false));
  const y=d.querySelector('#fxy'),n=d.querySelector('#fxn'),i=d.querySelector('#fxin');
  y.onclick=()=>{r=true;close()};if(n)n.onclick=close;
  if(i){i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();y.click()}};i.focus();i.select()}else y.focus()})}

/* ---------- Filtros: botão + histórico de importações ---------- */
/* Listas dos filtros: flutuam sobre o painel e abrem para cima quando não há espaço embaixo */
function gFloat(){const p=document.querySelector('.gfx');if(!p)return;p.querySelectorAll('.gmdp:not([hidden])').forEach(d=>{const a=(d.closest('.gfi')||d.parentElement).querySelector('.gmb');if(!a)return;
  d.classList.remove('gup');d.style.maxHeight='none';const r=a.getBoundingClientRect(),pr=p.getBoundingClientRect(),hd=p.querySelector('.gxh'),full=d.scrollHeight+2,dn=innerHeight-r.bottom-12,up=r.top-pr.top-(hd?hd.offsetHeight:0)-8,goUp=dn<Math.min(full,180)&&up>dn;
  d.classList.toggle('gup',goUp);d.style.maxHeight=Math.max(120,Math.min(280,goUp?up:dn))+'px'})}
window.addEventListener('resize',gFloat);
function gFbtn(){const n=[gSel,gLog,gVt,gUf,gMun,gTar,gTk,gCn].filter(Boolean).length;return `<button type="button" class="btn gfb${gFOpen||n?' pri':''}" id="gfb" aria-expanded="${gFOpen}" title="Abrir os filtros">⚙ Filtros${n?` <em>${n}</em>`:''}</button>`}
function gHist(){
  const H=S.imports||[];
  if(!H.length)return '<div class="empty">Nenhuma atualização por Excel registrada ainda. Use <b>⬆ Importar</b> na aba “Mapa e medições”.</div>';
  const dt=x=>new Date(x).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),L=H[0],nc=r=>r.ms.reduce((a,m)=>a+m.cs.length,0);
  const vl=(id,v)=>{const c=campos().find(x=>x.id===id);return v===''||v==null?'vazio':c?fmtVal(c,v):String(v)};
  const rec=(r,i)=>`<details class="hs-rec${r.rev?' rv':''}"${i===0?' open':''}><summary><b>${esc(r.arq)}</b><span class="tag">${dt(r.t)}</span>${r.por?`<span class="hint">por ${esc(r.por)}</span>`:''}<span class="tag">${r.ms.length} tarefa(s) · ${nc(r)} campo(s)</span>${r.rev?`<span class="tag late">Revertida em ${dt(r.rev)}</span>`:''}</summary>
    <div class="hs-w"><table class="hs-tb"><thead><tr><th>Tarefa</th><th>Concessionária</th><th>UF</th><th>Município</th><th>Campo(s) atualizado(s)</th></tr></thead><tbody>${r.ms.map((m,j)=>`<tr><td><button type="button" class="hs-tk" data-hv="${esc(r.id)}|${j}" title="Abrir a tarefa e mostrar o que mudou">${esc(m.tarefa)}</button></td><td>${esc(m.conc)||'—'}</td><td>${esc(m.uf)||'—'}</td><td>${esc(m.mun)||'—'}</td><td>${m.cs.map(c=>`<span class="hs-ch"><b>${esc(c.nome)}</b> <small>${esc(vl(c.id,c.de))} → ${esc(vl(c.id,c.para))}</small></span>`).join('')}</td></tr>`).join('')}</tbody></table></div></details>`;
  return `<div class="hs"><div class="hs-top"><div style="flex:1;min-width:220px"><small>Último arquivo importado</small><b>${esc(L.arq)}</b><small>${dt(L.t)}${L.por?' · por '+esc(L.por):''} · ${L.ms.length} tarefa(s) atualizada(s) · ${L.iguais} já iguais · ${L.sem} sem correspondência</small></div><button type="button" class="btn dan" id="hrev"${L.rev?' disabled':''} title="Devolve os campos da última importação aos valores anteriores">↶ Reverter última atualização</button></div>${H.map(rec).join('')}<p class="hint">Clique no nome da tarefa para abri-la: os campos atualizados piscam em verde. Guardamos as últimas 15 importações.</p></div>`;
}
async function gRevert(){
  const r=(S.imports||[])[0];if(!r||r.rev)return;
  const ok=await fxAsk({t:'Reverter última atualização?',h:`<p><b>${esc(r.arq)}</b></p><p>${r.ms.length} tarefa(s) voltam aos valores de antes da importação (${r.ms.reduce((a,m)=>a+m.cs.length,0)} campo(s)).</p><p class="hint">Se algum desses campos foi editado depois da importação, ele também volta ao valor anterior.</p>`,ok:'Reverter',dan:1});
  if(!ok)return;
  let n=0,gone=0;r.ms.forEach(m=>{const t=S.tasks.find(x=>x.id===m.tid);if(!t){gone++;return}m.cs.forEach(c=>{t[c.id]=c.de;n++})});
  r.rev=Date.now();await save();render();
  fxAsk({t:'Atualização revertida',m:n+' campo(s) restaurado(s)'+(gone?' · '+gone+' tarefa(s) não existem mais.':'.'),ok:'OK',no:false})}

/* Abrir a tarefa pelo histórico: campos atualizados piscam em verde */
{const _ov=openView;openView=function(id,tab0,hl){const r=_ov(id,tab0);if(hl&&hl.length){const d=[...document.querySelectorAll('dialog')].pop();if(d)hl.forEach(f=>{const c=campos().find(x=>x.id===f);if(!c)return;d.querySelectorAll('label').forEach(l=>{if(l.textContent.trim()===c.nome&&l.parentElement)l.parentElement.classList.add('fxhl')})})}return r}}

document.addEventListener('click',e=>{if(gFOpen&&e.target.isConnected&&!e.target.closest('.gfp,#gfb,.gmf,dialog')&&!document.querySelector('dialog[open]')){gFOpen=false;gMfOpen='';render()}});
