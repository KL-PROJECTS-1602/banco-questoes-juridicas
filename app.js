/* Banco de Questões – plataforma local (sem servidor). Dados: data/questoes.js · Regras: config/banca.js */
(function(){
"use strict";
// Só entram questões com texto completo: ME com 5 alternativas ou certo/errado.
const BANCO = (window.BANCO||[]).filter(q => (q.tipo==='multipla_escolha' && (q.alternativas||[]).length===5) || (q.tipo==='certo_errado' && (q.alternativas||[]).length===2));
// Comentários e gabaritos resolvidos (data/comentarios.js) — separados do banco para sobreviver a reconstruções
const COM = window.COMENTARIOS||{};
BANCO.forEach(q=>{ const c=COM[q.id]; if(!c) return;
  if(c.comentario) q.comentario=c.comentario; if(c.base_legal) q.base_legal=c.base_legal;
  q.fontes=c.fontes||[]; q.diverge=!!c.diverge; q.verificar=!!c.verificar;
  if(c.disciplina_real){ q.bloco=q.bloco||q.disciplina; q.disciplina=c.disciplina_real; }
  if(!q.gabarito && !q.anulada && c.gabarito_claude){ q.gabarito_nao_oficial=c.gabarito_claude; q.confianca=c.confianca||''; }
});
const CFG = window.CONFIG;
const $ = (s,el=document) => el.querySelector(s);
const app = $('#app');
const LET = ['A','B','C','D','E'];
const PDF_BASE = '../'; // a plataforma fica dentro de ESTUDOS - CONCURSOS

/* ---------- armazenamento (localStorage, com proteção) ---------- */
const KEY='banco_questoes_lucas_v1';
let DB = {hist:{}, sessoes:[]};
try{ const s=localStorage.getItem(KEY); if(s) DB=JSON.parse(s); }catch(e){}
function salvar(){ try{ localStorage.setItem(KEY, JSON.stringify(DB)); }catch(e){} }
function registrar(q, resp, ok){ (DB.hist[q.id]=DB.hist[q.id]||[]).push({t:Date.now(), r:resp, ok}); salvar(); }
function ultimo(qid){ const h=DB.hist[qid]; return h&&h.length?h[h.length-1]:null; }

/* ---------- utilidades ---------- */
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const embaralhar = a => { a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; };
const uniq = a => [...new Set(a)];
const corrigivel = q => !!q.gabarito || q.anulada;                 // gabarito OFICIAL (simulados)
const corrigivelEstudo = q => corrigivel(q) || !!q.gabarito_nao_oficial; // inclui resolvidas pelo Claude (estudo)
const gab = q => q.gabarito || q.gabarito_nao_oficial || null;
// os PDFs originais ficam na pasta ESTUDOS - CONCURSOS; o link só existe quando a plataforma roda do disco
const LOCAL = location.protocol === 'file:';
const pdfLink = q => (LOCAL && q.arquivo) ? `${PDF_BASE}${encodeURI(q.arquivo).replace(/#/g,'%23')}#page=${q.page||1}` : null;
const fontes = ['ENAM','FGV','Apostila','Autoral'];
const NOME_FONTE = {ENAM:'Provas ENAM', FGV:'Provas FGV (carreiras jurídicas)', Apostila:'Questões de bancas nas apostilas', Autoral:'Questões autorais'};
const discsTodas = uniq(BANCO.map(q=>q.disciplina)).sort((a,b)=>a.localeCompare(b,'pt'));

/* ---------- navegação ---------- */
let viewAtual='inicio', sessao=null, timerId=null;
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{ if(sessao && sessao.modo==='prova' && !sessao.fim && !confirmarSaida()) return; ir(b.dataset.v); });
function confirmarSaida(){ return window.confirm('Há uma prova em andamento. Sair e descartar?'); }
function ir(v){ viewAtual=v; if(timerId){clearInterval(timerId); timerId=null;} sessao=null;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('ativo', b.dataset.v===v));
  ({inicio:vInicio, treino:()=>vFiltros('treino'), rodada:()=>vFiltros('rodada'), prova:vProvaMenu, desempenho:vDesempenho})[v](); window.scrollTo(0,0); }

/* ---------- INÍCIO ---------- */
function vInicio(){
  const tot=BANCO.length, corr=BANCO.filter(corrigivel).length;
  const resp=Object.keys(DB.hist).length;
  const k = f => BANCO.filter(q=>q.fonte===f).length;
  app.innerHTML = `
  <div class="card"><h1>Banco de questões</h1>
    <div class="grid">
      <div class="kpi"><b>${tot.toLocaleString('pt-BR')}</b><span class="muted">questões no banco</span></div>
      <div class="kpi"><b>${corr.toLocaleString('pt-BR')}</b><span class="muted">com gabarito para correção automática</span></div>
      <div class="kpi"><b>${resp.toLocaleString('pt-BR')}</b><span class="muted">questões já respondidas</span></div>
    </div>
    <h3>Fontes</h3>
    <table><tr><th>Fonte</th><th>Questões</th></tr>
    ${fontes.map(f=>`<tr><td>${NOME_FONTE[f]}</td><td>${k(f).toLocaleString('pt-BR')}</td></tr>`).join('')}</table>
  </div>
  <div class="card"><h2>Por onde começar</h2>
    <div class="linha">
      <button class="btn prim" id="i-prova">Simulado ENAM (80 questões, 5h)</button>
      <button class="btn" id="i-treino">Treino por disciplina</button>
      <button class="btn" id="i-erros">Revisar meus erros</button>
    </div>
    <p class="muted">O histórico fica salvo neste navegador. Em <b>Desempenho</b> você pode exportar e importar o histórico para usar em outro computador.</p>
  </div>`;
  $('#i-prova').onclick=()=>ir('prova'); $('#i-treino').onclick=()=>ir('treino');
  $('#i-erros').onclick=()=>{ const e=BANCO.filter(q=>{const u=ultimo(q.id); return u&&u.ok===false;}); if(!e.length){alert('Nenhum erro registrado ainda.');return;} iniciar(embaralhar(e),{modo:'estudo',titulo:'Revisão de erros'}); };
}

/* ---------- FILTROS (Treino e Rodada) ---------- */
function vFiltros(tipo){
  const titulo = tipo==='rodada' ? `Rodada (${CFG.rodada_percentual}% do conjunto)` : 'Treino por disciplina';
  app.innerHTML = `<div class="card"><h1>${titulo}</h1>
  <p class="muted">${tipo==='rodada' ? 'Escolha um conjunto; a rodada sorteia metade dele. Com “só não acertadas”, ficam de fora as que você acertou na última vez.' : 'Monte um treino com as fontes, disciplinas e temas que quiser.'}</p>
  <div class="filtros">
    <div><h3>Fontes</h3>${fontes.map(f=>`<label class="chk"><input type="checkbox" name="fonte" value="${f}" ${f!=='Apostila'||tipo==='treino'?'checked':''}> ${NOME_FONTE[f]}</label>`).join('<br>')}</div>
    <div><h3>Disciplinas <a href="#" id="f-todas" class="muted">(todas / nenhuma)</a></h3><div class="lista-disc" id="f-discs"></div></div>
    <div><h3>Tema</h3><select id="f-tema"><option value="">Todos</option></select>
      <h3>Opções</h3>
      <label class="chk"><input type="checkbox" id="f-gab" checked> só com gabarito</label><br>
      <label class="chk"><input type="checkbox" id="f-ined"> só não acertadas (inéditas ou erradas)</label><br>
      <label class="chk"><input type="checkbox" id="f-anul"> incluir anuladas</label>
      ${tipo==='treino'?`<h3>Correção</h3><label class="chk"><input type="radio" name="modo" value="estudo" checked> na hora (modo estudo)</label><br><label class="chk"><input type="radio" name="modo" value="bloco"> só no fim</label>
      <h3>Quantidade</h3><input type="number" id="f-qtd" min="1" value="20">`:''}
      <h3>Dificuldade (só autorais)</h3><select id="f-dif"><option value="">Qualquer</option><option>facil</option><option>medio</option><option>dificil</option></select>
    </div>
  </div>
  <p id="f-cont" class="muted"></p>
  <button class="btn prim" id="f-ir">Começar</button></div>`;
  const discBox=$('#f-discs');
  const marcadas=new Set(['Constitucional','Administrativo','Civil','Processo Civil','Penal','Empresarial','Direitos Humanos','Formação Humanística']);
  discBox.innerHTML = discsTodas.map(d=>`<label class="chk"><input type="checkbox" name="disc" value="${esc(d)}" ${marcadas.has(d)?'checked':''}> ${esc(d)}</label>`).join('<br>');
  $('#f-todas').onclick=e=>{e.preventDefault(); const cs=[...document.querySelectorAll('input[name=disc]')]; const all=cs.every(c=>c.checked); cs.forEach(c=>c.checked=!all); atualiza();};
  app.querySelectorAll('input,select').forEach(el=>el.addEventListener('change',atualiza));
  function filtrar(semTema){
    const fs=[...document.querySelectorAll('input[name=fonte]:checked')].map(i=>i.value);
    const ds=new Set([...document.querySelectorAll('input[name=disc]:checked')].map(i=>i.value));
    const tema=$('#f-tema').value, dif=$('#f-dif').value;
    return BANCO.filter(q=> fs.includes(q.fonte) && ds.has(q.disciplina)
      && (semTema||!tema||q.tema===tema)
      && (!dif || q.dificuldade===dif)
      && (!$('#f-gab').checked || corrigivelEstudo(q))
      && ($('#f-anul').checked || !q.anulada)
      && (!$('#f-ined').checked || !(ultimo(q.id)&&ultimo(q.id).ok)));
  }
  function atualiza(e){
    if(!e || e.target.id!=='f-tema'){ const sel=$('#f-tema').value; const temas=uniq(filtrar(true).map(q=>q.tema).filter(Boolean)).sort((a,b)=>a.localeCompare(b,'pt'));
      $('#f-tema').innerHTML='<option value="">Todos</option>'+temas.map(t=>`<option ${t===sel?'selected':''}>${esc(t)}</option>`).join(''); }
    const n=filtrar().length; $('#f-cont').textContent = `${n.toLocaleString('pt-BR')} questões no conjunto` + (tipo==='rodada'?` → a rodada terá ${Math.ceil(n*CFG.rodada_percentual/100)}`:'');
  }
  atualiza();
  $('#f-ir').onclick=()=>{
    let qs=embaralhar(filtrar()); if(!qs.length){alert('Nenhuma questão com esses filtros.');return;}
    if(tipo==='rodada'){ qs=qs.slice(0,Math.ceil(qs.length*CFG.rodada_percentual/100)); iniciar(qs,{modo:'bloco',titulo:'Rodada'}); }
    else { const n=Math.max(1,parseInt($('#f-qtd').value)||20); iniciar(qs.slice(0,n),{modo:document.querySelector('input[name=modo]:checked').value,titulo:'Treino'}); }
  };
}

/* ---------- PROVA COMPLETA ---------- */
function vProvaMenu(){
  const edicoes = uniq(BANCO.filter(q=>q.fonte==='ENAM').map(q=>q.prova)).sort();
  const fgv = uniq(BANCO.filter(q=>q.fonte==='FGV').map(q=>q.prova+' ¦ '+q.cargo)).sort();
  app.innerHTML = `<div class="card"><h1>Prova completa</h1>
   <p class="muted">${esc(CFG.exame)}: ${CFG.total_questoes} questões, ${CFG.tempo_minutos/60}h, sem gabarito durante a prova. Habilitação com ${CFG.corte_acertos} acertos (${CFG.corte_acertos_cotas} para cotas). Anuladas contam como acerto.</p>
   <h3>1. Simulado montado (distribuição do edital)</h3>
   <p class="muted">Sorteia ${CFG.total_questoes} questões nas proporções do edital, das provas ENAM e FGV com gabarito, priorizando as que você ainda não acertou.</p>
   <label class="chk"><input type="checkbox" id="p-aut" checked> incluir questões autorais</label>
   <button class="btn prim" id="p-montado">Iniciar simulado</button>
   <h3>2. Prova ENAM real</h3>
   <select id="p-ed">${edicoes.map(e=>`<option>${esc(e)}</option>`).join('')}</select> <button class="btn" id="p-real">Iniciar</button>
   <h3>3. Prova FGV real (outros concursos)</h3>
   <select id="p-fgv" style="max-width:100%">${fgv.map(e=>`<option value="${esc(e)}">${esc(e.replace(' ¦ ',' — '))}</option>`).join('')}</select>
   <p class="muted">Tempo: <input type="number" id="p-min" value="300" min="10" style="width:80px"> min</p>
   <button class="btn" id="p-fgv-ir">Iniciar</button></div>`;
  $('#p-montado').onclick=()=>{
    const out=[]; const aut=$('#p-aut').checked;
    for(const [d,n] of Object.entries(CFG.distribuicao)){
      let pool=BANCO.filter(q=>q.disciplina===d && corrigivel(q) && !q.anulada && q.alternativas.length===5 && (q.fonte==='ENAM'||q.fonte==='FGV'||(aut&&q.fonte==='Autoral')));
      const nunca=pool.filter(q=>!(ultimo(q.id)&&ultimo(q.id).ok));
      const esc1=embaralhar(nunca).slice(0,n); if(esc1.length<n) esc1.push(...embaralhar(pool.filter(q=>!esc1.includes(q))).slice(0,n-esc1.length));
      out.push(...esc1);
    }
    iniciar(out,{modo:'prova',titulo:'Simulado ENAM montado',tempo:CFG.tempo_minutos,corte:true});
  };
  $('#p-real').onclick=()=>{ const e=$('#p-ed').value; const qs=BANCO.filter(q=>q.fonte==='ENAM'&&q.prova===e).sort((a,b)=>a.n-b.n); iniciar(qs,{modo:'prova',titulo:e,tempo:CFG.tempo_minutos,corte:true}); };
  $('#p-fgv-ir').onclick=()=>{ const [p,c]=$('#p-fgv').value.split(' ¦ '); const qs=BANCO.filter(q=>q.fonte==='FGV'&&q.prova===p&&q.cargo===c).sort((a,b)=>a.n-b.n);
    iniciar(qs,{modo:'prova',titulo:p+' — '+c,tempo:parseInt($('#p-min').value)||300,corte:false}); };
}

/* ---------- SESSÃO DE QUESTÕES ---------- */
function iniciar(qs,op){
  sessao={qs, i:0, resp:{}, duv:{}, risc:{}, conf:{}, modo:op.modo, titulo:op.titulo, inicio:Date.now(), fim:null, tempo:op.tempo, corte:op.corte};
  if(op.modo==='prova' && op.tempo){ sessao.limite=Date.now()+op.tempo*60000; timerId=setInterval(()=>{ const r=sessao.limite-Date.now(); const el=$('#timer'); if(el) el.textContent=fmt(r); if(r<=0){ clearInterval(timerId); timerId=null; entregar(true);} },1000); }
  render();
}
const fmt = ms => { ms=Math.max(0,ms); const h=Math.floor(ms/3600000), m=Math.floor(ms%3600000/60000), s=Math.floor(ms%60000/1000); return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; };

function render(){
  const S=sessao, q=S.qs[S.i], n=S.qs.length, r=S.resp[q.id];
  const mostrar = S.fim || (S.modo==='estudo' && S.conf[q.id]);
  const pdf=pdfLink(q);
  const alts = q.alternativas;
  const letras = q.tipo==='certo_errado' ? ['C','E'] : LET;
  app.innerHTML = `<div class="card">
   <div class="linha" style="justify-content:space-between"><b>${esc(S.titulo)}</b>
     <span class="muted">Questão ${S.i+1} de ${n}${S.modo==='prova'&&!S.fim&&S.limite?` · <span class="timer" id="timer">${fmt(S.limite-Date.now())}</span>`:''}</span></div>
   <div class="meta" style="margin-top:8px">
     <span class="tag">${esc(q.disciplina)}</span>${q.tema?`<span class="tag">${esc(q.tema)}</span>`:''}
     <span class="tag">${esc(q.fonte==='Apostila'?q.prova:(q.fonte==='Autoral'?'Autoral':q.prova+' · q.'+q.n))}</span>
     ${q.anulada?'<span class="tag w">anulada</span>':''}${q.fonte==='Autoral'&&q.revisada===false?'<span class="tag w">autoral – não revisada</span>':''}
   </div>
   <div class="enun">${esc(q.enunciado)||'<span class="muted">Texto não extraído — abra o PDF.</span>'}</div>
   <div id="alts">${alts.map((a,k)=>{ const L=letras[k]; let c=''; if(r===L) c='sel';
      if(mostrar&&gab(q)){ if(L===gab(q)) c='ok'; else if(r===L) c='er'; }
      if(S.risc[q.id+L]) c+=' riscada';
      return `<button class="alt ${c}" data-l="${L}"><span class="l">${L}</span><span class="t">${esc(a)}</span></button>`; }).join('')}</div>
   ${pdf?`<p class="muted" style="margin-top:6px"><a href="${pdf}" target="_blank" rel="noopener">Abrir no PDF original (p. ${q.page})</a> · clique com o botão direito numa alternativa para riscá-la</p>`:'<p class="muted">Clique com o botão direito numa alternativa para riscá-la.</p>'}
   ${S.modo!=='prova'&&!S.fim&&!S.conf[q.id]?`<button class="btn prim" id="conf" ${r?'':'disabled'}>${S.modo==='estudo'?'Responder':'Confirmar e seguir'}</button>`:''}
   ${S.modo==='prova'&&!S.fim?`<label class="chk"><input type="checkbox" id="duv" ${S.duv[q.id]?'checked':''}> marcar dúvida</label>`:''}
   <div id="fb">${mostrar?feedback(q,r):''}</div>
   <div class="nav-q">
     <button class="btn" id="ant" ${S.i?'':'disabled'}>← Anterior</button>
     ${!S.fim&&(S.modo!=='estudo')?`<button class="btn" id="entregar">${S.modo==='prova'?'Entregar prova':'Encerrar e ver resultado'}</button>`:''}
     ${S.fim?`<button class="btn" id="voltar-res">Ver resultado</button>`:(S.modo==='estudo'?`<button class="btn" id="encerrar">Encerrar</button>`:'')}
     <button class="btn" id="prox" ${S.i<n-1?'':'disabled'}>Próxima →</button>
   </div>
   ${S.modo!=='estudo'?`<div class="mapa">${S.qs.map((x,k)=>{ let c=''; if(S.resp[x.id]) c='resp'; if(S.fim&&corrigivel(x)) c=acertou(x,S.resp[x.id])?'ok':'er'; return `<button data-k="${k}" class="${c} ${S.duv[x.id]?'duv':''} ${k===S.i?'atual':''}">${k+1}</button>`; }).join('')}</div>`:''}
  </div>`;
  app.querySelectorAll('.alt').forEach(b=>{
    b.onclick=()=>{ if(S.fim||S.conf[q.id]) return; S.resp[q.id]=b.dataset.l; render(); };
    b.oncontextmenu=e=>{ e.preventDefault(); const k=q.id+b.dataset.l; S.risc[k]=!S.risc[k]; render(); };
  });
  const on=(id,f)=>{const el=$('#'+id); if(el) el.onclick=f;};
  on('conf',()=>{ const ok=acertou(q,S.resp[q.id]); if(corrigivelEstudo(q)) registrar(q,S.resp[q.id],ok); S.conf[q.id]=true;
    if(S.modo==='bloco'){ if(S.i<n-1){S.i++;} } render(); });
  on('ant',()=>{S.i--; render();}); on('prox',()=>{S.i++; render();});
  on('entregar',()=>{ const nr=S.qs.filter(x=>!S.resp[x.id]).length; if(nr && !confirm(`${nr} questões em branco. Entregar mesmo assim?`)) return; entregar(false); });
  on('encerrar',()=>resultado()); on('voltar-res',()=>resultado());
  const d=$('#duv'); if(d) d.onchange=()=>{S.duv[q.id]=d.checked; render();};
  app.querySelectorAll('.mapa button').forEach(b=>b.onclick=()=>{S.i=+b.dataset.k; render();});
}
function acertou(q,r){ if(q.anulada) return CFG.anulada_conta_como_acerto; if(r==='✓') return true; return !!r && r===gab(q); }
function feedback(q,r){
  const g=gab(q);
  if(!g && !q.anulada) return `<div class="res nt">Sem gabarito nesta questão (ainda não resolvida).</div>${q.comentario?`<div class="coment">${esc(q.comentario)}</div>`:''}`;
  const ok=acertou(q,r);
  const bn = q.banca && q.banca!=='não informada' ? q.banca : (q.fonte==='Apostila' ? 'conforme a apostila' : 'banca');
  const origem = q.anulada ? '' : (q.gabarito ? (q.fonte==='Autoral'?'Gabarito da questão autoral':`Gabarito oficial (${esc(bn)})${q.gab_tipo&&q.gab_tipo!=='definitivo'?' – '+esc(q.gab_tipo):''}`) : `Gabarito <b>não oficial</b>, resolvido pelo Claude${q.confianca?` (confiança ${esc(q.confianca)})`:''}`);
  return `<div class="res ${ok?'ok':(r?'er':'nt')}">${q.anulada?'Questão anulada pela banca (conta como acerto).':(ok?'Correto!':(r?`Errado. Resposta: ${g}`:`Em branco. Resposta: ${g}`))}${origem?`<div style="font-size:13px;margin-top:2px">${origem}</div>`:''}</div>
   ${q.diverge?`<div class="res nt"><b>Atenção:</b> lei ou jurisprudência posterior à prova pode alterar esta resposta — veja o comentário.</div>`:''}
   ${q.comentario?`<div class="coment"><b>Comentário:</b> ${esc(q.comentario)}${q.base_legal?`<br><b>Base legal:</b> ${esc(q.base_legal)}`:''}${(q.fontes&&q.fontes.length)?`<br><b>Fontes:</b> ${q.fontes.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//,'').slice(0,60))}</a>`).join(' · ')}`:''}</div>`:''}
   ${q.verificar?`<div class="coment muted">⚠ Este comentário cita jurisprudência ou norma ainda não conferida em fonte oficial.</div>`:''}
   ${q.subtema?`<div class="coment muted">Assunto: ${esc(q.subtema)}</div>`:''}`;
}
function entregar(porTempo){
  const S=sessao; if(timerId){clearInterval(timerId); timerId=null;}
  S.fim=Date.now();
  if(S.modo!=='estudo') S.qs.forEach(q=>{ if(corrigivel(q) && S.resp[q.id] && !S.conf[q.id]) registrar(q,S.resp[q.id],acertou(q,S.resp[q.id])); });
  if(porTempo) alert('Tempo esgotado. A prova foi entregue.');
  resultado();
}
function resultado(){
  const S=sessao; if(!S.fim){ S.fim=Date.now(); if(timerId){clearInterval(timerId);timerId=null;} }
  const corr=S.qs.filter(S.modo==='prova'?corrigivel:corrigivelEstudo); const ac=corr.filter(q=>acertou(q,S.resp[q.id])).length;
  const porD={}; corr.forEach(q=>{ const d=porD[q.disciplina]=porD[q.disciplina]||{t:0,a:0}; d.t++; if(acertou(q,S.resp[q.id])) d.a++; });
  const pts=ac*CFG.pontuacao.acerto;
  DB.sessoes.push({t:S.inicio, fim:S.fim, titulo:S.titulo, modo:S.modo, total:S.qs.length, corrigiveis:corr.length, acertos:ac}); salvar();
  const habil = S.corte ? (ac>=CFG.corte_acertos?'<b style="color:var(--ok)">Habilitado</b> (ampla concorrência)':(ac>=CFG.corte_acertos_cotas?'Habilitado só pela regra de cotas (≥ '+CFG.corte_acertos_cotas+')':'<b style="color:var(--er)">Abaixo do corte</b>')) : '';
  app.innerHTML=`<div class="card"><h1>Resultado – ${esc(S.titulo)}</h1>
   <div class="grid">
    <div class="kpi"><b>${ac} / ${corr.length}</b><span class="muted">acertos (${corr.length?Math.round(100*ac/corr.length):0}%)</span></div>
    ${S.corte?`<div class="kpi"><b>${CFG.corte_acertos}</b><span class="muted">corte (${CFG.corte_acertos_cotas} cotas)</span></div>`:''}
    <div class="kpi"><b>${fmt(S.fim-S.inicio)}</b><span class="muted">tempo usado</span></div>
   </div>
   ${habil?`<p>${habil}</p>`:''}
   <h3>Por disciplina</h3>
   <table><tr><th>Disciplina</th><th>Acertos</th><th></th></tr>${Object.entries(porD).sort((a,b)=>a[1].a/a[1].t-b[1].a/b[1].t).map(([d,v])=>`<tr><td>${esc(d)}</td><td>${v.a}/${v.t}</td><td><div class="barra"><i style="width:${100*v.a/v.t}%"></i></div></td></tr>`).join('')}</table>
   <div class="linha" style="margin-top:12px"><button class="btn prim" id="rev">Revisar questão a questão</button><button class="btn" id="rev-er">Treinar só as que errei</button></div></div>`;
  $('#rev').onclick=()=>{ sessao.i=0; render(); };
  $('#rev-er').onclick=()=>{ const e=S.qs.filter(q=>corrigivel(q)&&!acertou(q,S.resp[q.id])); if(!e.length){alert('Nenhum erro!');return;} iniciar(e,{modo:'estudo',titulo:'Revisão dos erros'}); };
}

/* ---------- DESEMPENHO ---------- */
function vDesempenho(){
  const ids=Object.keys(DB.hist); const byId=Object.fromEntries(BANCO.map(q=>[q.id,q]));
  const porD={}; let tot=0, ac=0;
  ids.forEach(id=>{ const q=byId[id]; if(!q) return; const u=ultimo(id); const d=porD[q.disciplina]=porD[q.disciplina]||{t:0,a:0,temas:{}}; d.t++; tot++; if(u.ok){d.a++; ac++;}
    if(q.tema){ const t=d.temas[q.tema]=d.temas[q.tema]||{t:0,a:0}; t.t++; if(u.ok) t.a++; } });
  const erros=ids.filter(id=>byId[id]&&ultimo(id).ok===false).length;
  const sess=DB.sessoes.slice(-15).reverse();
  app.innerHTML=`<div class="card"><h1>Desempenho</h1>
   <div class="grid"><div class="kpi"><b>${tot}</b><span class="muted">questões respondidas</span></div>
   <div class="kpi"><b>${tot?Math.round(100*ac/tot):0}%</b><span class="muted">acerto (última resposta)</span></div>
   <div class="kpi"><b>${erros}</b><span class="muted">questões para revisar</span></div></div>
   <h3>Por disciplina (piores primeiro)</h3>
   ${tot?`<table><tr><th>Disciplina</th><th>Acertos</th><th>%</th><th></th></tr>${Object.entries(porD).sort((a,b)=>a[1].a/a[1].t-b[1].a/b[1].t).map(([d,v])=>`<tr><td><details><summary>${esc(d)}</summary>${Object.entries(v.temas).sort((a,b)=>a[1].a/a[1].t-b[1].a/b[1].t).map(([t,x])=>`<div class="muted">${esc(t)}: ${x.a}/${x.t}</div>`).join('')}</details></td><td>${v.a}/${v.t}</td><td>${Math.round(100*v.a/v.t)}%</td><td><div class="barra"><i style="width:${100*v.a/v.t}%"></i></div></td></tr>`).join('')}</table>`:'<p class="muted">Responda algumas questões para ver o relatório.</p>'}
   <h3>Últimas sessões</h3>
   ${sess.length?`<table><tr><th>Data</th><th>Sessão</th><th>Acertos</th></tr>${sess.map(s=>`<tr><td>${new Date(s.t).toLocaleString('pt-BR')}</td><td>${esc(s.titulo)}</td><td>${s.acertos}/${s.corrigiveis}</td></tr>`).join('')}</table>`:'<p class="muted">Nenhuma sessão ainda.</p>'}
   <div class="linha" style="margin-top:12px">
     <button class="btn prim" id="d-erros" ${erros?'':'disabled'}>Treinar meus erros (${erros})</button>
     <button class="btn" id="d-exp">Exportar histórico</button>
     <label class="btn">Importar histórico<input type="file" id="d-imp" accept=".json" hidden></label>
     <button class="btn" id="d-zerar">Zerar histórico</button>
   </div></div>`;
  $('#d-erros').onclick=()=>{ const e=ids.filter(id=>byId[id]&&ultimo(id).ok===false).map(id=>byId[id]); iniciar(embaralhar(e),{modo:'estudo',titulo:'Revisão de erros'}); };
  $('#d-exp').onclick=()=>{ const b=new Blob([JSON.stringify(DB)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='historico-banco-questoes.json'; a.click(); };
  $('#d-imp').onchange=e=>{ const f=e.target.files[0]; if(!f) return; f.text().then(t=>{ try{ const x=JSON.parse(t); if(x.hist){ for(const [k,v] of Object.entries(x.hist)) DB.hist[k]=(DB.hist[k]||[]).concat(v).sort((a,b)=>a.t-b.t); DB.sessoes=(DB.sessoes||[]).concat(x.sessoes||[]); salvar(); vDesempenho(); } }catch(err){ alert('Arquivo inválido.'); } }); };
  $('#d-zerar').onclick=()=>{ if(confirm('Apagar todo o histórico deste navegador?')){ DB={hist:{},sessoes:[]}; salvar(); vDesempenho(); } };
}

ir('inicio');
})();
