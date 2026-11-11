/* Somente teste: renderer de produção com fetch simulado, sem preload/IPC/banco.
   O servidor só serve a árvore public e injeta a ponte de teste em memória. */
const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.LYRA_HOME_TEST_OUT;
app.setPath('userData', path.join(out, 'profile'));
app.disableHardwareAcceleration();
const root = path.resolve(__dirname, '../public');
const checks = []; const failures = []; const errors = [];
const fixture = `
window.__requests = [];
window.__songs = [
 {id:1,root_id:1,parent_id:null,titulo:'1000 Graus',artista:'Renascer Praise',estrofes:['Primeira linha\\nSegunda linha\\nTerceira linha\\nQuarta linha','Segundo slide','Terceiro slide','Quarto slide','Quinto slide','Sexto slide','Sétimo slide']},
 {id:2,root_id:1,parent_id:1,rotulo:'Cópia',titulo:'1000 Graus',artista:'Renascer Praise',estrofes:['Primeira linha\\nSegunda linha\\nTerceira linha\\nQuarta linha','Segundo slide','Terceiro slide','Quarto slide','Quinto slide','Sexto slide','Sétimo slide']},
 {id:3,root_id:1,parent_id:1,rotulo:'Acústica',titulo:'1000 Graus',artista:'Renascer Praise',estrofes:['Versão acústica','Final']}
];
window.__fixtureFetch = async (url, opts = {}) => {
 const u = new URL(String(url), location.href); const p=u.pathname;
 window.__requests.push({path:p,search:u.search,method:opts.method||'GET'});
 if(p.endsWith('/api/comando/exibir_apresentacao')&&opts.body){try{(window.__apresentacoes ||= []).push(JSON.parse(opts.body))}catch(_){}}
 if(window.__saveFail && opts.method==='PUT') return new Response(JSON.stringify({erro:'Falha simulada'}),{status:500});
 let data={};
 if(p==='/api/musicas') data=window.__bibFix||[window.__songs[0]];
 else if(/\\/api\\/musicas\\/\\d+\\/versoes/.test(p)) data={root_id:1,versoes:window.__songs};
 else if(/\\/api\\/musicas\\/\\d+/.test(p)) {
  const id=Number(p.split('/')[3]);
  if(opts.method==='PUT') Object.assign(window.__songs.find(s=>s.id===id),JSON.parse(opts.body));
  data=window.__songs.find(s=>s.id===id)||window.__songs[0];
 }
 else if(p.includes('/letras/buscar')) data={sucesso:true,resultados:[{titulo:'Resultado de teste',artista:'Artista de teste',path:'/teste',id:10}]};
 else if(/\\/api\\/biblia\\/[^/]+\\/[^/]+\\/caps$/.test(p)) data={total:3};
 else if(/\\/api\\/biblia\\/[^/]+\\/[^/]+\\/\\d+$/.test(p)) data=[{versiculo:1,texto:'No princípio, criou Deus os céus e a terra.'},{versiculo:2,texto:'A terra, porém, estava sem forma e vazia.'},{versiculo:3,texto:'Disse Deus: Haja luz; e houve luz.'}];
 else if(p.includes('/biblia/traducoes')) data=[{traducao:'ARA',nome:'Almeida Revista e Atualizada'}];
 else if(p.includes('/monitores')) data={monitores:window.__monitoresFixture||[]};
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
window.fetch=window.__fixtureFetch;
window.alert=(message)=>{window.__lastAlert=String(message)};
window.addEventListener('error',e=>{(window.__errors ||= []).push(e.message)});
window.addEventListener('unhandledrejection',e=>{(window.__errors ||= []).push(String(e.reason))});
`;
const bridge = `
window.__homeTest = {
 async seed() {
  const lc=await import('./painel/letraCompleta.js'), ee=await import('./painel/editorEstrofes.js');
  lc.limparFlagsModoEdicaoMusica();
  musicaBancoFonte='user'; musicaRootId=1; musicaVersaoLocalId=null;
  musicaAtiva=structuredClone(window.__songs[1]); estrofeAtiva=0;
  versoesMusicaServidorCache={rootId:1,versoes:structuredClone(window.__songs)};
  ee.renderEstrofesEditor();renderMusicaVersoesBar();atualizarPreviewPlaylistCentral();
 },
 state:()=>({id:musicaAtiva?.id, title:musicaAtiva?.titulo, slides:musicaAtiva?.estrofes, index:estrofeAtiva, full:modoLetraCompletaCentral, editing:modoEdicaoEstrofes}),
 preview:atualizarPreviewPlaylistCentral,
 filter:()=>import('./painel/bibliotecaMusicas.js').then(m=>m.filtrar()),
 versaoBase:{aplicar:(b,i,v)=>aplicarBaseMusicaSelecionada(b,i,v),local:()=>musicaVersaoLocalId,raiz:()=>musicaRootId},
 comparativo:()=>modoComparativoCentral,
 culto:{id:()=>cultoId,playlists:()=>playlists},
 bibliotecaCarregar:()=>import('./painel/bibliotecaMusicas.js').then(m=>m.carregarMusicas()),
 openContagem:abrirPainelContagem,
 closeContagem:()=>import('./painel/contagemRegressiva.js').then(m=>m.fecharPainelContagem()),
 setMonitores:(m)=>{monitoresServidorCache=m},
 rotas:()=>rotasPorModo,
 renderRotas:(m,r)=>renderRoteamentoTelas(m,r),
 espiarBiblia:()=>{const o={p:projecao.pronta,l:projecao.ligada,e:projecao.enfileirar,s:projecao.enviar};window.__enfileirados=[];window.__enviados=[];projecao.ligada=()=>true;projecao.pronta=()=>true;projecao.enfileirar=(ev,p)=>{window.__enfileirados.push([ev,p]);return true};projecao.enviar=(ev,p)=>{window.__enviados.push([ev,p]);return true};window.__restaurarBiblia=()=>{projecao.pronta=o.p;projecao.ligada=o.l;projecao.enfileirar=o.e;projecao.enviar=o.s}},
 biblia:{haParte:bibliaHaParteProjetada},
 ultimo:()=>ultimoConteudoProjetadoModoUnificado,
 estado:()=>estadoServidor,
 setEstado:(e)=>{estadoServidor=e},
 cor:(c)=>aplicarCorComentarioMinistranteNoPainel(c),
 espiarProjecao:()=>{const orig=projecao.enviar;window.__enviados=[];projecao.enviar=(ev,p)=>{window.__enviados.push([ev,p]);return true};window.__restaurarEnviar=()=>{projecao.enviar=orig}},
 contagem:{renderSeletor:renderSeletorMonitorContagem,setPos:setPosContagemCtrl,cfgChange:onContagemCfgChange,popularForm:()=>import('./painel/contagemRegressiva.js').then(m=>m.popularFormCfgContagem()),rota:rotaContagemParaServidor},
 docs:{carregar:carregarDocsBibliotecaDoStorage,render:renderListaDocsImportados,paginaProjetada:docsHaPaginaProjetada,paginaSel:docsPaginaSelecionadaAtual,adicionar:adicionarArquivosAosDocs},
 lyra:{comando:tratarComandoMenuLyra,fechar:fecharLyraMenuModal,status:atualizarModalStatusReinicioServidor},
 banner:{disponivel:mostrarBannerAtualizacaoDisponivel,progressoCompanion:mostrarBannerCompanionProgresso,esconder:esconderBannerAtualizacao,estado:lyraUpdaterUiState},
 dialogo:{confirm:appConfirm,prompt:appPrompt,fechar:fecharAppDialog,estado:appDialogEstado},
 normTema:normalizarTemaPlaylist,
 fluxos:{compartilhar:abrirModalCompartilharPlaylist,codigo:modalCompartilharMostrarCodigo,importar:importarPlaylist,impLoading:modalImportarPlaylistLoading,impErro:modalImportarPlaylistErro,impSucesso:modalImportarPlaylistSucesso,sincronizar:abrirModalSincronizarBanco,sincSucesso:modalSincronizarSucesso,sincAviso:modalSincronizarAviso,sincErro:modalSincronizarErro},
 handoff:()=>companionHandoffEmCurso,
 handoffReset:()=>{companionHandoffEmCurso=false},
};`;
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    let data = fs.readFileSync(file);
    if (name === '/controller.html') data = data.toString().replace(/<head>\r?\n/, '<head>\n<script>' + fixture + '</script>');
    if (name === '/js/controllerAppCore.js') data = data.toString() + '\n' + bridge;
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (_) { res.writeHead(404).end(); }
});
const pause = (ms=100) => new Promise(r=>setTimeout(r,ms));
/* PDF mínimo e válido (xref correto) com N páginas de texto — o DOCS renderiza com o pdf.js vendorizado. */
function gerarPdfBase64(paginas) {
  const objs = []; const add = (o) => { objs.push(o); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add('PAGES'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  for (let i = 0; i < paginas; i++) {
    const conteudo = 'BT /F1 48 Tf 72 700 Td (Pagina ' + (i + 1) + ') Tj ET';
    const pg = add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ' + (objs.length + 2) + ' 0 R /Resources << /Font << /F1 3 0 R >> >> >>');
    add('<< /Length ' + conteudo.length + ' >>\nstream\n' + conteudo + '\nendstream'); kids.push(pg + ' 0 R');
  }
  objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + paginas + ' >>';
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = out.length;
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(out, 'latin1').toString('base64');
}

let win;
async function run() {
  await app.whenReady();
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  session.defaultSession.webRequest.onBeforeRequest((details, callback)=>callback({cancel:!details.url.startsWith(origin+'/') && !details.url.startsWith('data:')}));
  win=new BrowserWindow({show:false,width:1366,height:768,useContentSize:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_e,level,message)=>{ if(level>=3) errors.push(message); });
  const js=(code)=>win.webContents.executeJavaScript(code);
  const check=async(name,code)=>{ const ok=await js(code);checks.push(name);if(!ok)failures.push(name); };
  await win.loadURL(origin+'/controller.html');
  for(let i=0;i<100;i++){if(await js('!!window.__homeTest'))break;await pause();}
  if(!await js('!!window.__homeTest'))throw Error('Renderer não inicializou: '+errors.join('\n')+' '+JSON.stringify(await js('window.__errors')));
  await win.webContents.insertCSS('* { transition: none !important; animation: none !important; }');
  await js('__homeTest.seed()');
  await check('IDs únicos',`(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return new Set(ids).size===ids.length})()`);
  await check('prévia desligada por padrão',`document.getElementById('playlist-preview-card').hidden`);
  await check('sem painel de prévia na direita',`!document.querySelector('.panel-playlist #playlist-preview-card')`);
  await check('título e versão ativos',`document.querySelector('.home-song-title').textContent==='1000 Graus' && document.querySelector('.versao-musica-ativa').textContent.toUpperCase().includes('CÓPIA')`);
  await js(`document.getElementById('busca').value='Graus'; document.getElementById('home-busca-online').click();document.getElementById('busca-letras-q').value='Teste';`);
  await check('campo único online e fonte preservada',`document.getElementById('banco-busca-local-wrap').hidden && !document.getElementById('busca-letras-panel').hidden && document.getElementById('banco-fonte-select').value==='lyra-online'`);
  await js(`document.getElementById('busca-letras-q').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
  await pause();
  await check('Enter online usa busca existente e filtros',`__requests.some(r=>r.path==='/api/letras/buscar' && r.search.includes('fonte=lyra-online') && r.search.includes('q=Teste') && r.search.includes('titulo=1'))`);
  await js(`document.getElementById('home-busca-biblioteca').click();`);
  await check('troca preserva termos e resultados',`document.getElementById('busca').value==='Graus' && document.getElementById('busca-letras-q').value==='Teste' && document.getElementById('lista-internet').textContent.includes('Resultado de teste')`);
  await js(`document.getElementById('busca').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
  await check('Enter biblioteca não navega slides',`__homeTest.state().index===0`);
  await js(`document.getElementById('btn-editar-letra').click()`); await pause();
  await check('Editar letra abre a edição por slides e mostra Cancelar/Salvar no lugar de Editar/Adicionar (sem alterações: Salvar desabilitado)',`__homeTest.state().editing && !__homeTest.state().full && !document.querySelector('.home-song-edit-actions').hidden && document.querySelector('.home-song-actions').hidden && document.querySelector('.home-dirty').hidden && document.getElementById('btn-salvar-musica').disabled`);
  await js(`document.getElementById('btn-cancelar-padrao').click()`); await pause();
  await check('Cancelar sem edição volta aos cartões',`!__homeTest.state().full && document.getElementById('centro-toolbar-acoes').hidden`);
  await check('título/artista não são editáveis fora do modo Editar',`getComputedStyle(document.getElementById('edit-titulo')).display==='none'`);
  await js(`document.getElementById('btn-editar-letra').click()`); await pause();
  await check('Editar torna título e artista editáveis no cabeçalho',`getComputedStyle(document.getElementById('edit-titulo')).display!=='none' && getComputedStyle(document.getElementById('edit-artista')).display!=='none' && !document.getElementById('edit-titulo').disabled`);
  await js(`document.getElementById('edit-titulo').value='Novo título';document.getElementById('edit-titulo').dispatchEvent(new Event('input',{bubbles:true}));`); await pause();
  await check('alterar só o título habilita Salvar',`!document.getElementById('btn-salvar-musica').disabled`);
  await check('Editar mostra o nome da versão (cópia selecionada)',`getComputedStyle(document.getElementById('home-nome-versao')).display!=='none' && document.getElementById('home-nome-versao').value.length>0`);
  await js(`(()=>{const i=document.getElementById('home-nome-versao');i.focus();i.value='Tag nova';i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))})()`); await pause(250);
  await check('renomear pelo cabeçalho usa a rota existente de rótulo',`__requests.some(r=>r.path.includes('/rotulo') && ['PATCH','POST'].includes(r.method))`);
  await js(`document.getElementById('btn-cancelar-padrao').click()`); await pause();
  await js(`document.querySelector('#app-dialog-overlay:not([hidden]) #app-dialog-ok')?.click()`); await pause();
  await check('Cancelar restaura título',`document.getElementById('edit-titulo').value==='1000 Graus'`);
  await js(`document.getElementById('btn-modo-letra-completa').click()`); await pause();
  await check('letra completa sem alteração não mostra a faixa',`__homeTest.state().full && document.querySelector('.home-song-edit-actions').hidden && !document.querySelector('.home-song-actions').hidden`);
  await check('letra completa abre em visualização (somente leitura)',`document.getElementById('centro-letra-completa-ta').readOnly===true`);
  await js(`document.getElementById('btn-editar-letra').click()`); await pause(300);
  await check('Editar na letra completa libera o texto e mostra Cancelar/Salvar (continua na letra completa)',`__homeTest.state().full && document.getElementById('centro-letra-completa-ta').readOnly===false && !document.querySelector('.home-song-edit-actions').hidden`);
  await js(`document.getElementById('btn-cancelar-padrao').click()`); await pause(300);
  await check('Cancelar volta à visualização da letra completa',`__homeTest.state().full && document.getElementById('centro-letra-completa-ta').readOnly===true && document.querySelector('.home-song-edit-actions').hidden`);
  await js(`(()=>{const t=document.getElementById('centro-letra-completa-ta');t.value=t.value+' x';t.dispatchEvent(new Event('input',{bubbles:true}))})()`); await pause();
  await check('alterar a letra completa mostra a faixa com aviso',`!document.querySelector('.home-song-edit-actions').hidden && !document.querySelector('.home-dirty').hidden && document.querySelector('.home-dirty').textContent.includes('não salvas') && !document.getElementById('btn-salvar-musica').disabled`);
  await js(`document.getElementById('centro-letra-completa-ta').value='Letra alterada';document.getElementById('centro-letra-completa-ta').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('btn-editar-nome-versao').click()`); await pause();
  await check('Editar tag preserva editor integral',`__homeTest.state().full && document.getElementById('centro-letra-completa-ta').value==='Letra alterada' && !document.getElementById('app-dialog-overlay').hidden`);
  await js(`document.getElementById('app-dialog-cancel').click();document.querySelector('[data-versao-id="3"]').click()`);await pause();
  await check('trocar versão pede confirmação de alterações',`__homeTest.state().id===2 && !document.getElementById('app-dialog-overlay').hidden`);
  await js(`document.getElementById('app-dialog-cancel').click()`);await pause();
  await check('cancelar troca preserva versão e texto',`__homeTest.state().id===2 && document.getElementById('centro-letra-completa-ta').value==='Letra alterada'`);
  await js(`window.__saveFail=true;document.getElementById('btn-salvar-musica').click()`);await pause();
  await check('falha ao salvar mantém editor aberto',`__homeTest.state().full && document.getElementById('centro-letra-completa-ta').value==='Letra alterada'`);
  await js(`window.__saveFail=false;document.getElementById('btn-salvar-musica').click()`);await pause(250);
  await check('salvar grava pelo handler existente e volta à visualização da letra completa',`__homeTest.state().full && document.getElementById('centro-letra-completa-ta').readOnly===true && __homeTest.state().slides[0]==='Letra alterada'`);
  await js(`document.querySelector('[data-versao-id="3"]').click()`);await pause();
  await check('dropdown identifica versão ativa e atualiza prévia',`__homeTest.state().id===3 && document.querySelector('.home-other-versions summary').textContent.toUpperCase().includes('ACÚSTICA') && document.getElementById('pl-pv-slide').textContent.includes('VERSÃO ACÚSTICA')`);
  await js(`__homeTest.versaoBase.aplicar({root_id:7},7,'copia-teste')`);
  await check('Versões: aplicar a base da música grava raiz e versão local no estado do núcleo (setters)',`__homeTest.versaoBase.raiz()===7 && __homeTest.versaoBase.local()==='copia-teste'`);
  await js(`__homeTest.versaoBase.aplicar({root_id:1},3,null)`);
  await check('Versões: sem versão local o estado volta a nulo',`__homeTest.versaoBase.raiz()===1 && __homeTest.versaoBase.local()===null`);
  await js(`document.getElementById('btn-apagar-copia-versao').click()`);await pause();
  await check('apagar versão mantém confirmação',`!document.getElementById('app-dialog-overlay').hidden && !__requests.some(r=>r.method==='DELETE')`);
  await js(`document.getElementById('app-dialog-cancel').click();__songs[1].estrofes=structuredClone(__songs[0].estrofes);__homeTest.seed()`);await pause();
  await js(`document.getElementById('home-novo-slide').click()`); await pause();
  await check('Novo slide usa edição existente',`__homeTest.state().editing && __homeTest.state().slides.length===8 && document.querySelectorAll('.estrofe-slide-ta').length===8`);
  await js('(async()=>{await __homeTest.seed();document.getElementById("btn-toggle-playlist-preview").click()})()');
  await check('prévia reutiliza renderer',`!document.getElementById('playlist-preview-card').hidden && document.getElementById('pl-pv-slide').textContent.includes('PRIMEIRA LINHA')`);
  // Comparativo de versões (painel/comparativoVersoes.js)
  await js("(async()=>{await __homeTest.seed();window.alternarModoComparativoCentral()})()");
  await js("window.__cmpDialogo=null;void 0");await pause(400);
  await check('Comparativo: com várias versões pergunta quais comparar (diálogo do app)',`!document.getElementById('app-dialog-overlay').hidden && document.querySelectorAll('.cmp-escolha-col').length===2`);
  await js("document.querySelectorAll('.cmp-escolha-col')[0].querySelectorAll('.cmp-escolha-opcao')[0].click();document.querySelectorAll('.cmp-escolha-col')[1].querySelectorAll('.cmp-escolha-opcao')[1].click();document.getElementById('app-dialog-ok').click();void 0");
  for(let i=0;i<60&&!await js("document.getElementById('comparativo-ta-a').value.length>0 && document.getElementById('comparativo-ta-b').value.length>0");i++)await pause(100);
  await check('Comparativo: abrir carrega as duas versões lado a lado e liga o modo no núcleo',`__homeTest.comparativo()===true && document.getElementById('comparativo-ta-a').value!==document.getElementById('comparativo-ta-b').value && document.getElementById('comparativo-ta-a').value.startsWith('Primeira linha') && document.getElementById('comparativo-ta-b').value.startsWith('Versão acústica')`);
  await js("window.alternarModoComparativoCentral();void 0");await pause(400);
  await check('Comparativo: sem alterações, alternar de novo sai do modo',`__homeTest.comparativo()===false`);
  await js("__homeTest.seed()");await pause(150);
  // Culto do dia (painel/cultoDoDia.js): seletor lista os cultos e a escolha chega ao estado do núcleo
  await check('Culto do dia: o seletor lista os cultos do mês (ids e rótulos do módulo)',`document.querySelectorAll('#culto-dd-menu .culto-dd-item').length>=1`);
  await js("(()=>{const it=[...document.querySelectorAll('#culto-dd-menu .culto-dd-item')].find(b=>b.dataset.value);window.__cultoEsc=it.dataset.value;it.click()})()");await pause(250);
  await check('Culto do dia: escolher um culto grava o id no estado do núcleo e na interface',`__homeTest.culto.id()===window.__cultoEsc && document.getElementById('culto-sel').value===window.__cultoEsc && document.getElementById('culto-dd-data').textContent!=='--/--'`);

  await js(`document.getElementById('btn-seta-proxima').click();__homeTest.preview()`);
  await check('próximo mantém slide e contador sincronizados',`__homeTest.state().index===1 && document.querySelector('.home-preview-count').textContent==='2 de 7'`);
  await js(`document.getElementById('home-preview-close').click()`);
  await check('fechar sincroniza toggle',`document.getElementById('btn-toggle-playlist-preview').getAttribute('aria-pressed')==='false'`);
  await js(`document.getElementById('btn-toggle-playlist-preview').click()`);
  await js(`document.getElementById('home-preview-move').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));`);
  await check('mover por teclado não navega slide',`__homeTest.state().index===1`);
  await check('geometria e abertura persistidas',`JSON.parse(localStorage.getItem('lyra_home_preview_v2')).open===true && Number.isFinite(JSON.parse(localStorage.getItem('lyra_home_preview_v2')).x)`);
  /* Mouse real via sendInputEvent: sem 'leftButtonDown' nos eventos o pointerdown chega, mas o Chromium recusa
     setPointerCapture (botão não ativo) e o arraste nunca começa — falha do teste, não do app. */
  const initial = await js(`(()=>{const r=document.getElementById('playlist-preview-card').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width}})()`);
  const movePoint=await js(`(()=>{const r=document.getElementById('home-preview-move').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  win.webContents.sendInputEvent({type:'mouseMove',...movePoint});
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,modifiers:['leftButtonDown'],...movePoint});
  win.webContents.sendInputEvent({type:'mouseMove',x:movePoint.x+40,y:movePoint.y-40,modifiers:['leftButtonDown']});
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:movePoint.x+40,y:movePoint.y-40});await pause();
  await check('arraste real move a prévia',`document.getElementById('playlist-preview-card').getBoundingClientRect().x > ${initial.x+20}`);
  const resizePoint=await js(`(()=>{const r=document.getElementById('home-preview-resize').getBoundingClientRect();return {x:Math.round(r.x+10),y:Math.round(r.y+10)}})()`);
  win.webContents.sendInputEvent({type:'mouseMove',...resizePoint});
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,modifiers:['leftButtonDown'],...resizePoint});
  win.webContents.sendInputEvent({type:'mouseMove',x:resizePoint.x+60,y:resizePoint.y+30,modifiers:['leftButtonDown']});
  win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:resizePoint.x+60,y:resizePoint.y+30});await pause();
  await check('redimensionamento real altera largura',`document.getElementById('playlist-preview-card').getBoundingClientRect().width > ${initial.w+30}`);
  await js(`document.documentElement.classList.add('dark')`);await pause(200);
  await win.webContents.capturePage();await pause();
  fs.writeFileSync(path.join(out,'home-preview.png'),(await win.webContents.capturePage()).toPNG());
  await js(`document.getElementById('home-preview-close').click();document.getElementById('btn-banco-sqlite-toggle-lista').click()`);
  await check('legenda persiste com lista recolhida',`!document.getElementById('bib-origem-legenda').hidden`);
  await js(`document.getElementById('btn-banco-sqlite-toggle-lista').click()`);
  for(const [w,h] of [[1024,640],[1120,800],[1280,800],[1366,768],[1920,1080]]) {
    win.setContentSize(w,h); await pause(120);
    for(const dark of [true,false]) {
      await js(`document.documentElement.classList.toggle('dark',${dark});`);
      await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      await win.webContents.capturePage();
      await pause(150);
      await check(`sem overflow externo ${w}x${h} ${dark?'escuro':'claro'}`,`document.documentElement.scrollWidth<=innerWidth`);
      await check(`rodapé visível ${w}x${h}`,`(()=>{const r=document.querySelector('.home-library-footer').getBoundingClientRect();return r.top>0 && r.bottom<=innerHeight+1})()`);
      await check(`editor utilizável ${w}x${h}`,`document.querySelector('.panel-centro').getBoundingClientRect().width>=320`);
      /* Cabeçalho: nenhum item (logo, 8 botões do dock, status de conexão) pode cobrir outro. Com espaço o dock fica no
         centro exato da janela; sem espaço (≤~1175px) ele se desloca para a esquerda em vez de o status cobrir o «Ajustes». */
      await check(`cabeçalho sem sobreposição ${w}x${h}`,`(()=>{const itens=['.logo-img','#btn-tela-inicial','#btn-modo-contagem','#btn-modo-biblia','#btn-toggle-modo-slides','#btn-modo-apresentacao','#btn-modo-docs','#btn-voz-slides-toggle','#btn-cfg-geral','.status-conn-wrap'].map(q=>document.querySelector(q)).filter(Boolean).map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height);if(itens.length<10)return false;for(let i=0;i<itens.length;i++)for(let j=i+1;j<itens.length;j++){const a=itens[i],b=itens[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)return false}return itens.every(r=>r.left>=0&&r.right<=innerWidth)})()`);
      if(w>=1280) await check(`dock centralizado na janela ${w}x${h}`,`(()=>{const r=document.querySelector('.hdr-icons-bar').getBoundingClientRect();return Math.abs((r.left+r.right)/2-innerWidth/2)<=1})()`);
      await check(`ícones contidos ${w}x${h}`,`[...document.querySelectorAll('.home-song-heading svg')].every(e=>e.getBoundingClientRect().width<=20)`);
      await check(`ações e visualização contidas na coluna central ${w}x${h}`,`(()=>{const c=document.querySelector('.centro-col-letras').getBoundingClientRect();return ['.home-song-actions','.home-view-segment'].every(q=>{const r=document.querySelector(q).getBoundingClientRect();return r.left>=c.left-1&&r.right<=c.right+1})})()`);
      const overflow = await js(`(()=>{const p=document.querySelector('.centro-col-letras');return [...p.querySelectorAll('button,summary')].filter(e=>e.getBoundingClientRect().width && e.getBoundingClientRect().right>p.getBoundingClientRect().right+1).map(e=>e.id||e.className)})()`);
      if(overflow.length) failures.push('Controles fora do editor '+w+': '+overflow.join(','));
      fs.writeFileSync(path.join(out,`home-${w}-${h}-${dark?'dark':'light'}.png`),(await win.webContents.capturePage()).toPNG());
    }
  }
  await js(`localStorage.setItem('lyra_home_preview_v2',JSON.stringify({open:true,x:9000,y:-200,width:9999}));`);
  win.setContentSize(1024,640);
  await win.loadURL(origin+'/controller.html');await pause(300);
  await check('restauração limitada à viewport',`(()=>{const r=document.getElementById('playlist-preview-card').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`);
  /* Contagem (redesenhada): o aviso de rota virou o estado do seletor — vermelho e «Nenhum monitor selecionado». */
  await js('__homeTest.openContagem()');await pause(150);
  await check('Contagem: sem monitor, o seletor sinaliza a ausência',`(()=>{const s=document.getElementById('contagem-monitor-select');return !!s && s.classList.contains('sem-monitor') && s.options[s.selectedIndex].textContent==='Nenhum monitor selecionado'
    && s.getAttribute('aria-labelledby')==='contagem-monitor-rotulo' && !document.getElementById('contagem-alerta-rota')})()`);
  await js("document.getElementById('contagem-btn-principal').click()");await pause(150);
  await check('Contagem: Iniciar sem monitor avisa e não inicia',`!document.getElementById('app-dialog-overlay').hidden && document.getElementById('app-dialog-body').textContent.includes('Escolha um monitor') && document.getElementById('contagem-btn-encerrar').disabled`);
  await js("document.getElementById('app-dialog-ok').click()");await pause(100);
  await js('__homeTest.closeContagem()');await pause(100);
  /* Extração de appDialog / menuLyra / bannerAtualizacao do núcleo: integração no renderer real (dependências registradas,
     estado partilhado do diálogo e o Escape do núcleo). */
  await js("__homeTest.lyra.comando({command:'help-open-about'})");await pause(150);
  await check('Menu Lyra: Sobre abre a janela',`(()=>{const o=document.getElementById('lyra-menu-modal-overlay');return !o.hidden && o.classList.contains('aberto') && document.getElementById('lyra-menu-modal-title').textContent==='Lyra' && !!document.querySelector('#lyra-menu-modal-body .lyra-about-card') && document.getElementById('lyra-menu-modal').classList.contains('lyra-menu-modal--about')})()`);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(100);
  await check('Menu Lyra: Escape fecha a janela (listener do núcleo)',`document.getElementById('lyra-menu-modal-overlay').hidden && document.getElementById('lyra-menu-modal-body').innerHTML===''`);
  await js("__homeTest.lyra.comando({command:'help-open-manual'})");await pause(100);
  await check('Menu Lyra: Manual',`document.getElementById('lyra-menu-modal-title').textContent==='Manual básico do Lyra' && document.querySelectorAll('#lyra-menu-modal-body .lyra-doc-section').length>0`);
  await js("__homeTest.lyra.comando({command:'help-open-shortcuts'})");await pause(100);
  await check('Menu Lyra: Atalhos',`document.getElementById('lyra-menu-modal-title').textContent==='Atalhos de teclado' && document.querySelectorAll('#lyra-menu-modal-body .lyra-shortcuts-table').length>0`);
  await js("document.getElementById('lyra-menu-modal-close').click()");await pause(100);
  await check('Menu Lyra: botão Fechar',`document.getElementById('lyra-menu-modal-overlay').hidden`);
  await js("__homeTest.lyra.status('starting','Reiniciando…')");await pause(100);
  await check('Menu Lyra: reinício em andamento não deixa fechar',`document.getElementById('lyra-menu-modal').classList.contains('lyra-menu-modal--status') && document.getElementById('lyra-menu-modal-close').disabled && !!document.querySelector('.lyra-status-indicator--progress')`);
  await js("__homeTest.lyra.status('error','Falhou')");await pause(100);
  await check('Menu Lyra: erro libera o Fechar',`!document.getElementById('lyra-menu-modal-close').disabled && !!document.querySelector('.lyra-status-indicator--error')`);
  await js("__homeTest.lyra.fechar(true)");await pause(50);
  await js("__homeTest.banner.disponivel({version:'9.9.9'})");await pause(100);
  await check('Banner de atualização: aparece com título e ações',`(()=>{const h=document.getElementById('lyra-update-banner');return !!h && !h.hidden && document.getElementById('lyra-update-banner-title').textContent.length>0 && h.querySelectorAll('button').length>0})()`);
  await js("__homeTest.banner.esconder()");await pause(50);
  await check('Banner de atualização: esconder',`document.getElementById('lyra-update-banner').hidden`);
  await js("__homeTest.banner.progressoCompanion({stage:'handoff',percent:100})");await pause(50);
  await check('Banner dos componentes: handoff atualiza a flag do núcleo',`__homeTest.handoff()===true && document.getElementById('lyra-update-banner-title').textContent==='A instalar componentes'`);
  await js("__homeTest.handoffReset();__homeTest.banner.esconder()");
  await js("window.__dlg='pendente';__homeTest.dialogo.confirm('Teste?').then(v=>{window.__dlg=v});void 0");await pause(50);
  await check('Diálogo: confirmação abre e marca o estado partilhado',`!document.getElementById('app-dialog-overlay').hidden && document.getElementById('app-dialog-cancel').style.display==='' && __homeTest.dialogo.estado.fecharNoBackdrop===true`);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(100);
  await check('Diálogo: Escape do núcleo cancela (lê o estado do módulo)',`window.__dlg===false && document.getElementById('app-dialog-overlay').hidden && __homeTest.dialogo.estado.fecharNoBackdrop===false`);
  await js("window.__dlg='pendente';__homeTest.dialogo.confirm('De novo?').then(v=>{window.__dlg=v});void 0");await pause(50);
  await js("document.getElementById('app-dialog-ok').click()");await pause(50);
  await check('Diálogo: OK confirma',`window.__dlg===true && document.getElementById('app-dialog-overlay').hidden`);

  /* Fluxos que partilham o #app-dialog (compartilhar, importar e sincronizar): só estados de interface, sem rede nem gravação.
     Cobrem o estado partilhado (appDialogEstado), o Escape do núcleo, o bloqueio durante o spinner e os timers de auto-fechar. */
  await js("window.__t2600=[];window.__clears=[];(()=>{const st=window.setTimeout.bind(window),ct=window.clearTimeout.bind(window);window.setTimeout=(f,ms,...a)=>{const id=st(f,ms,...a);if(ms===2600)window.__t2600.push(id);return id};window.clearTimeout=(id)=>{window.__clears.push(id);return ct(id)}})()");
  const dlgAberto = "!document.getElementById('app-dialog-overlay').hidden";
  const esc = "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))";
  await check('Callbacks do HTML: todo onclick/onchange resolve em window',`(()=>{const nomes=new Set();document.querySelectorAll('*').forEach(e=>{for(const a of e.attributes){if(/^on/.test(a.name)){const m=a.value.match(/^\\s*(?:return\\s+)?([A-Za-z_]\\w*)\\s*\\(/);if(m)nomes.add(m[1])}}});const ignorar=['if','this','document','window','confirm','alert'];const faltam=[...nomes].filter(n=>!ignorar.includes(n)&&typeof window[n]!=='function');window.__faltam=faltam;return nomes.size>40&&faltam.length===0})()`);
  // Compartilhar
  await js("window.__w=__homeTest.fluxos.compartilhar();void 0");await pause(50);
  await check('Compartilhar: modal abre em carregamento e reserva o estado partilhado',`${dlgAberto} && document.getElementById('app-dialog-head').textContent==='Compartilhar Playlist' && document.getElementById('app-dialog-ok').style.display==='none' && document.getElementById('app-dialog-cancel').textContent==='Fechar' && __homeTest.dialogo.estado.fecharNoBackdrop===true && typeof __homeTest.dialogo.estado.compartilharResolver==='function' && !!document.querySelector('.share-modal-loading')`);
  await js("__homeTest.fluxos.codigo(window.__w,'ABCD-1234','31/12/2099')");
  await check('Compartilhar: mostra o código gerado',`document.querySelector('.share-modal-code').textContent==='ABCD-1234' && document.querySelector('.share-modal-exp').textContent.includes('31/12/2099')`);
  await js(esc);await pause(80);
  await check('Compartilhar: Escape fecha e limpa o estado',`!(${dlgAberto}) && __homeTest.dialogo.estado.compartilharResolver===null && document.getElementById('app-dialog-body').innerHTML===''`);
  await js("window.__w=__homeTest.fluxos.compartilhar();void 0");await pause(50);
  await js("document.getElementById('app-dialog-cancel').click()");await pause(50);
  await check('Compartilhar: botão Fechar fecha e limpa o estado',`!(${dlgAberto}) && __homeTest.dialogo.estado.compartilharResolver===null`);
  // Importar
  await js("__homeTest.fluxos.importar()");await pause(80);
  await check('Importar: abre o campo de código com o estado reservado',`${dlgAberto} && document.getElementById('app-dialog-head').textContent==='Importar Playlist' && !!document.querySelector('.share-modal-input') && document.getElementById('app-dialog-ok').textContent==='OK' && typeof __homeTest.dialogo.estado.importarResolver==='function' && __homeTest.dialogo.estado.fecharNoBackdrop===true`);
  await js("document.getElementById('app-dialog-ok').click()");await pause(50);
  await check('Importar: código vazio mostra o erro e continua no campo',`${dlgAberto} && !document.querySelector('.share-modal-erro').hidden && document.querySelector('.share-modal-erro').textContent.includes('Digite o código') && !!document.querySelector('.share-modal-input')`);
  await js("window.__w=document.querySelector('#app-dialog-body .share-modal');__homeTest.fluxos.impLoading(window.__w);void 0");
  await js(esc);await pause(80);
  await check('Importar: com o spinner, Escape não dispensa o modal',`${dlgAberto} && __homeTest.dialogo.estado.fecharNoBackdrop===false && document.getElementById('app-dialog-ok').style.display==='none' && document.getElementById('app-dialog-cancel').style.display==='none' && !!document.querySelector('.share-modal-loading')`);
  await js("__homeTest.fluxos.impErro(window.__w,'Código inválido','COD')");
  await check('Importar: erro libera o fechamento e oferece «Tentar de novo»',`document.getElementById('app-dialog-ok').textContent==='Tentar de novo' && document.getElementById('app-dialog-cancel').textContent==='Fechar' && __homeTest.dialogo.estado.fecharNoBackdrop===true && document.querySelector('.share-modal-erro').textContent==='Código inválido'`);
  await js(esc);await pause(80);
  await check('Importar: Escape após o erro fecha e limpa o estado',`!(${dlgAberto}) && __homeTest.dialogo.estado.importarResolver===null`);
  await js("__homeTest.fluxos.importar()");await pause(80);
  await js("window.__w=document.querySelector('#app-dialog-body .share-modal');__homeTest.fluxos.impLoading(window.__w);void 0");
  await js("__homeTest.dialogo.fechar(false)");await pause(50);
  await js("window.__dlg='pendente';__homeTest.dialogo.confirm('Depois do spinner?').then(v=>{window.__dlg=v});void 0");await pause(50);
  await js(esc);await pause(80);
  await check('Importar: fechar durante o spinner libera o bloqueio (Escape volta a funcionar no diálogo seguinte)',`!(${dlgAberto}) && window.__dlg===false`);
  await js("__homeTest.fluxos.importar()");await pause(80);
  await js("window.__w=document.querySelector('#app-dialog-body .share-modal');__homeTest.fluxos.impSucesso(window.__w,'Importada',true);void 0");
  await check('Importar: sucesso sem OK e com Fechar',`document.getElementById('app-dialog-ok').style.display==='none' && document.getElementById('app-dialog-cancel').textContent==='Fechar' && document.querySelector('.share-modal-sucesso').textContent==='Importada'`);
  await js("window.__clears.length=0;document.getElementById('app-dialog-cancel').click()");await pause(50);
  await check('Importar: fechar à mão limpa o timer de auto-fechar do sucesso (via dependência do núcleo)',`window.__t2600.length>=1 && window.__clears.includes(window.__t2600[window.__t2600.length-1])`);
  await js("window.__dlg='pendente';__homeTest.dialogo.confirm('Outro diálogo?').then(v=>{window.__dlg=v});void 0");
  await pause(3000);
  await check('Importar: fechar à mão cancela o auto-fechar (timer não derruba o diálogo seguinte)',`${dlgAberto} && window.__dlg==='pendente' && document.getElementById('app-dialog-body').textContent==='Outro diálogo?'`);
  await js("document.getElementById('app-dialog-cancel').click()");await pause(50);
  // Texto (appPrompt): normalizador padrão vem do núcleo
  await js("window.__r='pendente';__homeTest.dialogo.prompt('Nome do tema',{defaultValue:'  Louvor  '}).then(v=>{window.__r=v});void 0");await pause(80);
  await js("document.getElementById('app-dialog-ok').click()");await pause(80);
  await check('Texto: o normalizador padrão do núcleo valida o nome do tema',`typeof window.__r==='string' && window.__r.length>0 && window.__r===__homeTest.normTema('  Louvor  ') && !(${dlgAberto})`);
  // Sincronizar
  await js("window.__w=__homeTest.fluxos.sincronizar();void 0");await pause(50);
  await check('Sincronizar: abre em carregamento, sem botões, com o estado reservado',`${dlgAberto} && document.getElementById('app-dialog-head').textContent==='Sincronizar banco' && document.getElementById('app-dialog-ok').style.display==='none' && document.getElementById('app-dialog-cancel').style.display==='none' && typeof __homeTest.dialogo.estado.sincronizarResolver==='function' && __homeTest.dialogo.estado.fecharNoBackdrop===true && !!document.querySelector('.share-modal-loading')`);
  await js(esc);await pause(80);
  await check('Sincronizar: Escape durante o carregamento fecha e limpa o estado',`!(${dlgAberto}) && __homeTest.dialogo.estado.sincronizarResolver===null`);
  await js("window.__w=__homeTest.fluxos.sincronizar();__homeTest.fluxos.sincSucesso(window.__w,'Banco enviado.');void 0");await pause(50);
  await check('Sincronizar: sucesso mostra a mensagem e o Fechar',`document.querySelector('.share-modal-sucesso').textContent==='Banco enviado.' && document.getElementById('app-dialog-cancel').textContent==='Fechar'`);
  await js("window.__clears.length=0;window.__antes=window.__t2600.length;document.getElementById('app-dialog-cancel').click()");await pause(50);
  await check('Sincronizar: fechar à mão limpa o timer de auto-fechar do sucesso (via dependência do núcleo)',`window.__t2600.length>=1 && window.__clears.includes(window.__t2600[window.__t2600.length-1])`);
  await js("window.__dlg='pendente';__homeTest.dialogo.confirm('Diálogo seguinte?').then(v=>{window.__dlg=v});void 0");
  await pause(3000);
  await check('Sincronizar: fechar à mão cancela o auto-fechar (timer não derruba o diálogo seguinte)',`${dlgAberto} && window.__dlg==='pendente' && document.getElementById('app-dialog-body').textContent==='Diálogo seguinte?'`);
  await js("document.getElementById('app-dialog-cancel').click()");await pause(50);
  await js("window.__w=__homeTest.fluxos.sincronizar();__homeTest.fluxos.sincAviso(window.__w,'Sem destinatário');void 0");await pause(50);
  await check('Sincronizar: aviso (amarelo) com Fechar',`!!document.querySelector('.share-modal-aviso') && document.getElementById('app-dialog-cancel').textContent==='Fechar'`);
  await js("window.__acao=0;__homeTest.fluxos.sincErro(window.__w,'Falhou',{label:'Corrigir',onClick:()=>{window.__acao=1}})");await pause(50);
  await check('Sincronizar: erro com ação de correção à mão',`document.querySelector('.share-modal-erro').textContent==='Falhou' && document.getElementById('app-dialog-ok').textContent==='Corrigir' && document.getElementById('app-dialog-ok').style.display===''`);
  await js("document.getElementById('app-dialog-ok').click()");await pause(50);
  await check('Sincronizar: a ação de correção fecha o modal e é executada',`!(${dlgAberto}) && window.__acao===1 && __homeTest.dialogo.estado.sincronizarResolver===null`);
  /* DOCS e Contagem extraídos do núcleo (painel/docs.js e painel/contagemRegressiva.js): fluxos no renderer real, sem rede
     (fetch simulado). Cobrem o estado privado dos módulos, os callbacks do HTML, o Escape do núcleo e a ordem de inicialização. */
  const ctgPosts = "__requests.filter(r=>r.path==='/api/comando/exibir_contagem'&&r.method==='POST').length";
  await js('__homeTest.openContagem()');await pause(300);
  await js("__homeTest.setMonitores([{index:0,primary:true,label:'Monitor 1',size:{width:1920,height:1080}},{index:1,label:'Projetor',size:{width:1920,height:1080}},{index:2,label:'TV',size:{width:1280,height:720}}]);__homeTest.contagem.renderSeletor()");await pause(100);
  await check('Contagem: o seletor lista os monitores de projeção (sem o principal) e segue sem monitor',`(()=>{const s=document.getElementById('contagem-monitor-select');const t=[...s.options].map(o=>o.textContent);return s.classList.contains('sem-monitor') && t.includes('Projetor') && t.includes('TV') && !t.some(x=>x.includes('Monitor 1'))})()`);
  await js("(()=>{const s=document.getElementById('contagem-monitor-select');s.value='1';s.dispatchEvent(new Event('change'))})()");await pause(250);
  await check('Contagem: escolher o monitor sai do estado «sem monitor» e grava a escolha',`(()=>{const s=document.getElementById('contagem-monitor-select');const p=JSON.parse(localStorage.getItem('lyra_contagem_monitor_v1')||'{}');return !s.classList.contains('sem-monitor') && s.value==='1' && p.publicoIndex===1})()`);
  await js("document.querySelectorAll('#contagem-presets .contagem-preset')[1].click()");await pause(50);
  await check('Contagem: o preset define os minutos e zera os segundos',`document.getElementById('contagem-minutos').value==='10' && document.getElementById('contagem-segundos').value==='0'`);
  await js("window.__c0="+ctgPosts);
  await js("document.getElementById('contagem-btn-principal').click()");await pause(400);
  await check('Contagem: Iniciar envia o comando ao servidor e entra no ar',`${ctgPosts}===window.__c0+1 && !document.getElementById('contagem-btn-encerrar').disabled && !document.getElementById('contagem-btn-menos').disabled && /^\\d{1,2}:\\d{2}/.test(document.getElementById('contagem-mostrador-valor').textContent.trim())`);
  await check('Contagem: no ar, o pin enviado ao servidor é o monitor escolhido',`__homeTest.contagem.rota().publicoIndex===1 && __homeTest.contagem.rota().ministranteIndex===-1`);
  await js("window.__c1="+ctgPosts+";document.getElementById('contagem-btn-mais').click()");await pause(300);
  await check('Contagem: «+1 min» ajusta sem parar e fala com o servidor',`${ctgPosts}===window.__c1+1`);
  await js("document.getElementById('contagem-btn-encerrar').click()");await pause(300);
  await check('Contagem: Encerrar avisa o servidor, volta ao estado parado e liberta o pin',`__requests.some(r=>r.path==='/api/comando/encerrar_contagem'&&r.method==='POST') && document.getElementById('contagem-btn-encerrar').disabled && document.getElementById('contagem-btn-principal').textContent==='Iniciar' && __homeTest.contagem.rota().publicoIndex===-1`);
  await js("document.getElementById('contagem-como-btn').click()");await pause(50);
  await check('Contagem: «Como funciona» abre e fecha',`!document.getElementById('contagem-como').hidden && document.getElementById('contagem-como-btn').getAttribute('aria-expanded')==='true'`);
  await js("document.getElementById('contagem-como-btn').click()");
  await js("document.getElementById('contagem-retrair').click()");await pause(80);
  await check('Contagem: retrair deixa só a barra compacta',`document.querySelector('#contagem-backdrop .contagem-painel').classList.contains('retraido') && document.getElementById('contagem-retrair').getAttribute('aria-expanded')==='false'`);
  await js("document.getElementById('contagem-retrair').click()");await pause(80);
  await check('Contagem: expandir volta ao painel completo',`!document.querySelector('#contagem-backdrop .contagem-painel').classList.contains('retraido') && document.getElementById('contagem-retrair').getAttribute('aria-expanded')==='true'`);
  await js("__homeTest.contagem.setPos('top')");await pause(80);
  await check('Contagem: a posição vertical é gravada e refletida no formulário de Ajustes',`JSON.parse(localStorage.getItem('lyra_contagem_cfg_v1')||'{}').verticalPosition==='top' && document.querySelector('#cfg-contagem-posy-group .cfg-btn-pos.ativo')?.dataset.val==='top'`);
  await js("document.getElementById('cfg-contagem-fontsize').value='20';document.getElementById('cfg-contagem-fontsize').dispatchEvent(new Event('input',{bubbles:true}));__homeTest.contagem.cfgChange()");await pause(300);
  await check('Contagem: alterar a aparência (callback do HTML) persiste no armazenamento',`Number(JSON.parse(localStorage.getItem('lyra_contagem_cfg_v1')||'{}').fontSize)===20`);
  await js("document.getElementById('btn-modo-contagem').click()");await pause(150);
  await check('Contagem: o botão do cabeçalho (callback do HTML) fecha o painel aberto',`!document.getElementById('contagem-backdrop').classList.contains('aberto')`);
  await js("document.getElementById('btn-modo-contagem').click()");await pause(150);
  await check('Contagem: o botão do cabeçalho reabre o painel',`document.getElementById('contagem-backdrop').classList.contains('aberto')`);
  await js('__homeTest.closeContagem()');await pause(100);
  await js("localStorage.setItem('lyra_docs_biblioteca_v1',JSON.stringify({version:1,itens:[{id:'d1',name:'Aviso.pdf',title:'Aviso.pdf',mime:'application/pdf',size:10,filePath:''},{id:'d2',name:'Culto.pptx',title:'Culto.pptx',mime:'',size:20,filePath:''}]}));sessionStorage.removeItem('lyra_docs_selecionado_sessao_v1')");
  // Ordem de inicialização: depois de recarregar, a escolha e a aparência voltam do armazenamento
  await win.loadURL(origin+'/controller.html');
  for(let i=0;i<100;i++){if(await js('!!window.__homeTest'))break;await pause();}
  await js('__homeTest.openContagem()');await pause(300);
  await js("__homeTest.setMonitores([{index:0,primary:true,label:'Monitor 1'},{index:1,label:'Projetor'},{index:2,label:'TV'}]);__homeTest.contagem.renderSeletor();__homeTest.contagem.popularForm()");await pause(100);
  await check('Contagem: após recarregar, o monitor escolhido e a aparência voltam do armazenamento (ordem de inicialização)',`document.getElementById('contagem-monitor-select').value==='1' && document.querySelector('#cfg-contagem-posy-group .cfg-btn-pos.ativo')?.dataset.val==='top' && document.getElementById('cfg-contagem-fontsize').value==='20'`);
  // Contagem depois de recarregar: os controles continuam funcionando (Iniciar, Encerrar)
  await js("window.__c0="+ctgPosts+";document.getElementById('contagem-btn-principal').click()");await pause(450);
  await check('Contagem: após recarregar, Iniciar envia o comando e entra no ar',`${ctgPosts}===window.__c0+1 && !document.getElementById('contagem-btn-encerrar').disabled`);
  await js("document.getElementById('contagem-btn-encerrar').click()");await pause(350);
  await check('Contagem: após recarregar, Encerrar volta ao estado parado',`__requests.some(r=>r.path==='/api/comando/encerrar_contagem'&&r.method==='POST') && document.getElementById('contagem-btn-encerrar').disabled && document.getElementById('contagem-btn-principal').textContent==='Iniciar'`);
  await js('__homeTest.closeContagem()');await pause(100);
  // DOCS
  await check('DOCS: a biblioteca carregada do armazenamento no arranque aparece (ordem de inicialização) na lista com o tipo de cada arquivo',`(()=>{const it=[...document.querySelectorAll('#docs-lib-list .ap-lib-item')];return it.length===2 && it[0].querySelector('.ap-lib-name').textContent==='Aviso.pdf' && it[0].querySelector('.ap-lib-meta').textContent==='PDF' && it[1].querySelector('.ap-lib-meta').textContent==='PowerPoint'})()`);
  await js("(()=>{const i=document.getElementById('docs-lib-search');i.value='culto';i.dispatchEvent(new Event('input',{bubbles:true}))})()");await pause(60);
  await check('DOCS: a busca filtra a lista',`document.querySelectorAll('#docs-lib-list .ap-lib-item').length===1 && document.querySelector('#docs-lib-list .ap-lib-name').textContent==='Culto.pptx'`);
  await js("(()=>{const i=document.getElementById('docs-lib-search');i.value='zzz';i.dispatchEvent(new Event('input',{bubbles:true}))})()");await pause(60);
  await check('DOCS: busca sem resultado mostra a mensagem',`document.querySelector('#docs-lib-list .ap-lib-empty')?.textContent==='Nenhum documento encontrado.'`);
  await js("(()=>{const i=document.getElementById('docs-lib-search');i.value='';i.dispatchEvent(new Event('input',{bubbles:true}))})()");await pause(60);
  await js("document.querySelectorAll('#docs-lib-list .ap-lib-item')[1].click()");await pause(120);
  await check('DOCS: clicar numa linha seleciona o documento',`document.querySelectorAll('#docs-lib-list .ap-lib-item')[1].getAttribute('aria-selected')==='true' && document.querySelectorAll('#docs-lib-list .ap-lib-item')[0].getAttribute('aria-selected')==='false'`);
  await js("document.getElementById('btn-modo-docs').click()");await pause(400);
  await check('DOCS: o botão do cabeçalho (callback do HTML) entra no modo e abre o documento selecionado',`document.body.classList.contains('app-mod-docs') && document.title==='Lyra — DOCS' && document.getElementById('btn-modo-docs').getAttribute('aria-pressed')==='true' && !document.getElementById('docs-preview-vazio').hidden`);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(100);
  await check('DOCS: Escape sem nada no ar não faz nada (o modo continua aberto)',`document.body.classList.contains('app-mod-docs') && __homeTest.docs.paginaProjetada()===false`);
  await check('DOCS: sem páginas, a navegação fica desabilitada',`document.getElementById('docs-nav-anterior').disabled && document.getElementById('docs-nav-proxima').disabled && document.getElementById('docs-nav-contador').textContent==='—' && __homeTest.docs.paginaSel()===-1`);
  await js("__homeTest.docs.adicionar([{name:'foto.png',size:5}])");await pause(120);
  await check('DOCS: arquivo de formato não aceito é recusado com aviso e a lista não muda',`!document.getElementById('app-dialog-overlay').hidden && document.getElementById('app-dialog-body').textContent.includes('Só entram PowerPoint') && document.getElementById('app-dialog-body').textContent.includes('foto.png') && JSON.parse(localStorage.getItem('lyra_docs_biblioteca_v1')).itens.length===2`);
  await js("document.getElementById('app-dialog-ok').click()");await pause(60);
  // DOCS com um PDF real (pdf.js vendorizado): faixa, prévia, navegação e projeção até o limite da rede (o monitor físico não é simulado)
  const aguardar = async (expr, ms = 12000) => { for (let t = 0; t < ms / 100; t++) { if (await js(expr)) return true; await pause(100); } return false; };
  const pdfB64 = gerarPdfBase64(3);
  await js("(()=>{const b=atob('" + pdfB64 + "');const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);window.__docsPdf=new File([u],'Teste.pdf',{type:'application/pdf'})})()");
  await js("__homeTest.docs.adicionar([window.__docsPdf]);void 0");
  await aguardar("document.getElementById('docs-nav-contador').textContent==='1 / 3' && !document.getElementById('docs-preview-img').hidden");
  await check('DOCS (PDF real): faixa com uma miniatura por página e prévia central na primeira página',`document.querySelectorAll('#docs-faixa .docs-miniatura').length===3 && !document.getElementById('docs-preview-img').hidden && document.getElementById('docs-preview-img').src.startsWith('data:image/jpeg') && document.getElementById('docs-nav-contador').textContent==='1 / 3' && document.getElementById('docs-nav-anterior').disabled && !document.getElementById('docs-nav-proxima').disabled && JSON.parse(localStorage.getItem('lyra_docs_biblioteca_v1')).itens.length===3`);
  await js("document.getElementById('docs-nav-proxima').click()");
  await aguardar("document.getElementById('docs-nav-contador').textContent==='2 / 3'");
  await check('DOCS (PDF real): «próxima» avança a página',`document.getElementById('docs-nav-contador').textContent==='2 / 3' && __homeTest.docs.paginaSel()===1`);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  await aguardar("document.getElementById('docs-nav-contador').textContent==='3 / 3'");
  await check('DOCS (PDF real): a seta → do teclado (núcleo) chega à última página e desabilita «próxima»',`document.getElementById('docs-nav-contador').textContent==='3 / 3' && document.getElementById('docs-nav-proxima').disabled`);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))");
  await aguardar("document.getElementById('docs-nav-contador').textContent==='2 / 3'");
  await check('DOCS (PDF real): a seta ← do teclado volta uma página',`document.getElementById('docs-nav-contador').textContent==='2 / 3'`);
  await js("document.querySelectorAll('#docs-faixa .docs-miniatura')[0].click()");
  await aguardar("document.getElementById('docs-nav-contador').textContent==='1 / 3'");
  await check('DOCS (PDF real): clicar numa miniatura seleciona a página sem projetar',`document.getElementById('docs-nav-contador').textContent==='1 / 3' && document.querySelectorAll('#docs-faixa .docs-miniatura')[0].classList.contains('selecionada') && !(window.__apresentacoes||[]).length && __homeTest.docs.paginaProjetada()===false`);
  // Projeção: a rota escolhida e a página renderizada seguem para o servidor (POST simulado)
  await js("__homeTest.setMonitores([{index:0,primary:true,label:'Monitor 1'},{index:1,label:'Projetor'}]);__homeTest.rotas().docs={publicoIndex:1,ministranteIndex:-1,live:false};window.__apresentacoes=[]");
  await js("document.querySelectorAll('#docs-faixa .docs-miniatura')[1].click()");
  await aguardar("document.getElementById('docs-nav-contador').textContent==='2 / 3'");
  await js("document.getElementById('docs-preview').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");
  await aguardar("window.__apresentacoes.length>=1", 15000);
  await aguardar("(()=>{const m=document.querySelectorAll('#docs-faixa .docs-miniatura')[1];return !!m && m.classList.contains('no-ar')})()", 5000);
  await check('DOCS (PDF real): duplo clique na prévia projeta a página escolhida (corpo enviado ao servidor)',`(()=>{const a=window.__apresentacoes||[];const p=a[0]||{};return a.length===1 && p.kind==='image' && String(p.src).startsWith('data:image/jpeg') && p.name==='Teste.pdf' && p.title==='Teste.pdf — página 2' && p.transicao==='fade' && !!p.alvoProjecao && __homeTest.docs.paginaProjetada()===true && document.querySelectorAll('#docs-faixa .docs-miniatura')[1].classList.contains('no-ar')})()`);
  await js("document.getElementById('docs-preview').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");await pause(2500); /* renderizar a página em 1920px leva mais que 700ms: sem a guarda, o 2º envio chegaria depois */
  await check('DOCS (PDF real): a mesma página já no ar não é reenviada',`window.__apresentacoes.length===1`);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}))");
  await aguardar("window.__apresentacoes.length>=2", 15000);
  await check('DOCS (PDF real): com projeção no ar, a seta → leva a página seguinte ao servidor',`window.__apresentacoes.length===2 && window.__apresentacoes[1].title==='Teste.pdf — página 3' && document.getElementById('docs-nav-contador').textContent==='3 / 3'`);
  await js("__homeTest.espiarProjecao();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(500);
  await check('DOCS (PDF real): Escape (núcleo) encerra a projeção, avisa o servidor e solta a rota',`__homeTest.docs.paginaProjetada()===false && window.__enviados.some(e=>e[0]==='encerrar_apresentacao_publico'&&e[1]&&e[1].alvoProjecao==='publico') && __homeTest.rotas().docs.publicoIndex===-1 && document.body.classList.contains('app-mod-docs') && !document.querySelector('#docs-faixa .docs-miniatura.no-ar')`);
  await js("window.__restaurarEnviar()");
  await js("__homeTest.rotas().docs={publicoIndex:1,ministranteIndex:-1,live:false}");
  await js("document.getElementById('hdr-encerrar-projecao').click()");await pause(250);
  await check('DOCS: «Encerrar projeção» do cabeçalho desativa a rota do DOCS (estado de rotas do núcleo)',`__homeTest.rotas().docs.publicoIndex===-1 && __homeTest.docs.paginaProjetada()===false`);
  await js("document.getElementById('btn-tela-inicial').click()");
  for(let i=0;i<40&&await js("document.body.classList.contains('app-mod-docs')");i++) await pause(100); /* a transição de visualização leva mais que 300ms na janela oculta */
  await check('DOCS: voltar à tela inicial fecha o modo e restaura o título',`!document.body.classList.contains('app-mod-docs') && document.title==='Lyra — Controlador' && document.getElementById('btn-modo-docs').getAttribute('aria-pressed')==='false'`);
  // Depois de recarregar o painel: o PDF volta do IndexedDB e as páginas reaparecem
  await win.loadURL(origin+'/controller.html');
  for(let i=0;i<100;i++){if(await js('!!window.__homeTest'))break;await pause();}
  await js("document.getElementById('btn-modo-docs').click()");
  await aguardar("document.getElementById('docs-nav-contador').textContent==='1 / 3' && !document.getElementById('docs-preview-img').hidden", 15000);
  await check('DOCS (PDF real): após recarregar, o documento volta do armazenamento e as páginas reaparecem',`document.body.classList.contains('app-mod-docs') && document.querySelectorAll('#docs-faixa .docs-miniatura').length===3 && !document.getElementById('docs-preview-img').hidden && document.getElementById('docs-nav-contador').textContent==='1 / 3'`);
  await js("document.getElementById('btn-tela-inicial').click()");
  for(let i=0;i<40&&await js("document.body.classList.contains('app-mod-docs')");i++) await pause(100);
  /* Bíblia e Exibição extraídas do núcleo (painel/biblia.js e painel/configExibicao.js): fluxos no renderer real, sem rede.
     A projeção é espiada (projecao.ligada/enfileirar/enviar): o teste vai até o que seria enviado ao servidor. */
  const livrosBtn = "document.querySelectorAll('#biblia-col-livros .biblia-livro-btn')";
  await js("document.getElementById('btn-modo-biblia').click()");
  await aguardar("!document.getElementById('app-dialog-overlay').hidden && [...document.querySelectorAll('#app-dialog-body button')].some(b=>b.textContent.includes('ARA'))", 8000);
  await check('Bíblia: entrar no modo pergunta a tradução da sessão',`!document.getElementById('app-dialog-overlay').hidden && document.getElementById('app-dialog-head').textContent==='Versão da Bíblia' && [...document.querySelectorAll('#app-dialog-body button')].some(b=>b.textContent.includes('ARA — Almeida'))`);
  await js("[...document.querySelectorAll('#app-dialog-body button')].find(b=>b.textContent.includes('ARA')).click()");
  await aguardar("document.body.classList.contains('app-mod-biblia')", 10000);
  await check('Bíblia: o modo abre com a tradução escolhida, o botão do cabeçalho ativo e os 66 livros',`document.body.classList.contains('app-mod-biblia') && document.title==='Lyra — Modo Bíblia' && document.getElementById('traducao-sel').value==='ARA' && ${livrosBtn}.length===66 && document.getElementById('btn-modo-biblia').getAttribute('aria-pressed')==='true' && sessionStorage.getItem('lyra_biblia_traducao_sessao_v1')==='ARA'`);
  await js("document.getElementById('biblia-filtro-nt').click()");await pause(150);
  await check('Bíblia: o filtro Novo Testamento reduz a grade a 27 livros',`${livrosBtn}.length===27 && document.getElementById('biblia-filtro-nt').getAttribute('aria-pressed')==='true'`);
  await js("document.getElementById('biblia-filtro-at').click()");await pause(150);
  await check('Bíblia: o filtro Antigo Testamento troca para 39 livros',`${livrosBtn}.length===39 && document.getElementById('biblia-filtro-at').getAttribute('aria-pressed')==='true' && document.getElementById('biblia-filtro-nt').getAttribute('aria-pressed')==='false'`);
  await js("document.getElementById('biblia-filtro-at').click()");await pause(150);
  await check('Bíblia: clicar de novo no filtro ativo volta aos 66 livros',`${livrosBtn}.length===66`);
  await js("[...document.querySelectorAll('#biblia-col-livros .biblia-livro-btn')].find(b=>b.dataset.nome==='Gênesis').click()");
  await aguardar("document.querySelectorAll('#biblia-col-caps .biblia-cap-btn').length===3", 8000);
  await check('Bíblia: escolher o livro carrega os capítulos e destaca o livro',`document.querySelectorAll('#biblia-col-caps .biblia-cap-btn').length===3 && document.querySelector('.biblia-livro-btn.selecionado')?.dataset.nome==='Gênesis'`);
  await js("document.querySelector('#biblia-col-caps .biblia-cap-btn').click()");
  await aguardar("document.querySelectorAll('#biblia-col-versiculos .biblia-v-card').length===3", 8000);
  await check('Bíblia: escolher o capítulo carrega e desenha os versículos',`(()=>{const c=[...document.querySelectorAll('#biblia-col-versiculos .biblia-v-card')];return c.length===3 && c[0].querySelector('.biblia-v-num').textContent==='1' && c[2].querySelector('.biblia-v-texto').textContent.includes('Haja luz') && document.querySelector('.biblia-cap-btn.selecionado')?.textContent==='1'})()`);
  await js("document.querySelectorAll('#biblia-col-versiculos .biblia-v-card')[1].click()");await pause(150);
  await check('Bíblia: clicar no versículo só o seleciona (sem projetar)',`document.querySelectorAll('#biblia-col-versiculos .biblia-v-card')[1].classList.contains('selecionado') && !document.querySelector('.biblia-v-card.projetado') && __homeTest.biblia.haParte()===false`);
  // Projeção até o limite da rede: a rota escolhida e o versículo seguem para o servidor (espiados)
  /* O servidor simulado passa a devolver estes monitores: a rota é «sanitizada» contra a lista do servidor, e sem o monitor 1 ela voltaria a «Não exibir». */
  await js("window.__monitoresFixture=[{index:0,primary:true,label:'Monitor 1'},{index:1,label:'Projetor'}];__homeTest.setMonitores(window.__monitoresFixture);__homeTest.renderRotas(window.__monitoresFixture,{publicoIndex:-1,ministranteIndex:-1,live:false});__homeTest.espiarBiblia()");await pause(150);
  // A escolha do monitor é feita no seletor do cabeçalho (a Bíblia sincroniza a rota a partir dele)
  await js("document.getElementById('route-publico-btn').click()");await pause(150);
  await js("[...document.querySelectorAll('#route-publico-menu .route-dd-item')].find(b=>b.textContent.includes('Monitor 2')).click()");await pause(400);
  await check('Bíblia: escolher o monitor no seletor do cabeçalho grava a rota do modo',`__homeTest.rotas().biblia.publicoIndex===1 && document.getElementById('route-publico-display').textContent.includes('Monitor 2')`);
  await js("document.querySelectorAll('#biblia-col-versiculos .biblia-v-card')[1].click()");
  await aguardar("(window.__enfileirados||[]).length>=1", 8000);
  await check('Bíblia: clicar de novo no versículo selecionado o projeta (payload enviado ao servidor)',`(()=>{const e=window.__enfileirados||[];const p=(e[0]||[])[1]||{};return e.length===1 && e[0][0]==='exibir_versiculo' && String(p.livro)==='Gênesis' && String(p.capitulo)==='1' && String(p.versiculo)==='2' && String(p.texto).includes('sem forma') && p.traducao==='ARA' && p.somenteTexto===false && !!p.alvoProjecao && document.querySelectorAll('#biblia-col-versiculos .biblia-v-card')[1].classList.contains('projetado') && __homeTest.biblia.haParte()===true && __homeTest.ultimo()?.tipo==='biblia' && String(__homeTest.ultimo().payload.versiculo)==='2'})()`);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))");
  await aguardar("window.__enfileirados.length>=2", 8000);
  await check('Bíblia: com projeção no ar, a seta ↓ (teclado do núcleo) leva o versículo seguinte (só texto)',`(()=>{const e=window.__enfileirados;const p=(e[1]||[])[1]||{};return e.length===2 && String(p.versiculo)==='3' && p.somenteTexto===true && document.querySelectorAll('#biblia-col-versiculos .biblia-v-card')[2].classList.contains('projetado') && !document.querySelectorAll('#biblia-col-versiculos .biblia-v-card')[1].classList.contains('projetado')})()`);
  await js("__homeTest.setEstado({tipo:'biblia',titulo:'Gênesis 1',linhas:['x'],telaLimpa:false})");
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(300);
  await check('Bíblia: Escape (estado do núcleo via setter) zera o estado do servidor e o último conteúdo',`__homeTest.estado().tipo===null && __homeTest.estado().telaLimpa===true && __homeTest.ultimo()==null`);
  await check('Bíblia: Escape (núcleo) encerra a projeção, avisa o servidor e limpa a marca do versículo',`window.__enviados.some(e=>e[0]==='encerrar_projecao_biblia') && __homeTest.biblia.haParte()===false && !document.querySelector('.biblia-v-card.projetado')`);
  await js("window.__restaurarBiblia()");
  // Busca rápida (teclado): abre o popup, reconhece a sigla e avança de etapa; Escape fecha
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'g',bubbles:true}))");await pause(200);
  await check('Bíblia: digitar uma letra abre a busca rápida e mostra o que foi digitado',`!document.getElementById('biblia-nav-popup').classList.contains('oculto') && document.getElementById('bnp-livro-display').textContent==='g'`);
  await js("(()=>{const i=document.getElementById('biblia-busca-rapida');i.value='Gn';i.dispatchEvent(new Event('input',{bubbles:true}))})()");await pause(300);
  await check('Bíblia: a sigla exata («Gn») escolhe o livro e passa à etapa do capítulo',`document.getElementById('bnp-linha-cap').style.display!=='none' && document.getElementById('bnp-livro-display').textContent.length>0`);
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(150);
  await check('Bíblia: Escape fecha a busca rápida',`document.getElementById('biblia-nav-popup').classList.contains('oculto')`);
  // Exibição (Ajustes): modal, abas, busca, formulário da Bíblia, avisos, tema escuro
  await js("document.getElementById('btn-cfg-geral').click()");await pause(500);
  await check('Exibição: a inicialização publicou em window os atalhos usados por outros scripts',`['setInputVal','setSelVal','setChkVal','getChkVal','toggleCfgSwitch','lerNumeroInput','debounceSalvarCfg','aplicarWrapImediato','getCurrentCfgCtrl','setCurrentCfgCtrl','getElLetras'].every(n=>typeof window[n]==='function') && typeof window.bibliaCfgExibicao==='object' && window.bibliaCfgExibicao!==null && window.bibliaCfgExibicao.fontSize>0 && typeof window.bibliaCfgMinistrante==='object'`);
  await check('Exibição: o botão Ajustes (callback do HTML) abre o modal',`document.getElementById('cfg-modal-overlay-ctrl').classList.contains('aberto')`);
  await js("document.getElementById('cfg-tab-ctrl-biblia').click()");await pause(200);
  await check('Exibição: a aba Bíblia fica ativa e as outras apagam',`document.getElementById('cfg-tab-ctrl-biblia').classList.contains('ativo') && document.getElementById('cfg-panel-ctrl-biblia').classList.contains('ativo') && !document.getElementById('cfg-tab-ctrl-slides').classList.contains('ativo')`);
  await js("__homeTest.espiarBiblia()");
  await js("(()=>{const f=document.getElementById('cfg-biblia-pub-fontsize-ctrl');f.value='7';f.dispatchEvent(new Event('input',{bubbles:true}));f.dispatchEvent(new Event('change',{bubbles:true}))})()");await pause(500);
  await check('Exibição: alterar a fonte do público (callback do HTML) grava a aparência da Bíblia',`Number(JSON.parse(localStorage.getItem('lyra_biblia_cfg_v1')||'{}').exibicao?.fontSize)===7`);
  await check('Exibição: a aparência alterada é enviada ao servidor (projeção espiada)',`window.__enviados.some(e=>e[0]==='set_display_config'||e[0]==='preview_display_config')`);
  await js("window.__restaurarBiblia()");
  await js("document.getElementById('cfg-tab-ctrl-avisos').click()");await pause(200);
  await js("window.setPosAvisoCard6Ctrl('top')");await pause(200);
  await check('Exibição: a posição do aviso (estado do núcleo via setter/getter) volta ao formulário',`document.querySelector('#cfg-card6-posy-ctrl-group .cfg-btn-pos.ativo')?.dataset.val==='top'`);
  await js("window.setPosAvisoCard6Ctrl('bottom')");await pause(200);
  await check('Exibição: trocar a posição do aviso atualiza o botão ativo',`document.querySelector('#cfg-card6-posy-ctrl-group .cfg-btn-pos.ativo')?.dataset.val==='bottom'`);
  await js("(()=>{const i=document.getElementById('cfg-busca-ctrl');i.value='zzzz-nada-assim';i.dispatchEvent(new Event('input',{bubbles:true}))})()");await pause(200);
  await check('Exibição: a busca sem resultado esconde as linhas e mostra a mensagem de vazio',`document.getElementById('cfg-modal-body-ctrl').classList.contains('buscando') && !document.getElementById('cfg-busca-vazio-ctrl').hidden && [...document.querySelectorAll('#cfg-modal-body-ctrl .cfg-row[data-busca]')].every(r=>r.hidden)`);
  await js("document.getElementById('cfg-busca-limpar-ctrl').click()");await pause(200);
  await check('Exibição: limpar a busca devolve as linhas',`!document.getElementById('cfg-modal-body-ctrl').classList.contains('buscando') && document.getElementById('cfg-busca-vazio-ctrl').hidden`);
  await js("window.toggleDarkCtrl()");
  await check('Exibição: o tema escuro alterna e persiste',`document.documentElement.classList.contains('dark')===(localStorage.getItem('holyrics-ctrl-dark')==='1')`);
  await js("window.toggleDarkCtrl()");
  await check('Exibição: cor do comentário do ministrante usa o estado do núcleo e mantém a última válida',`__homeTest.cor('#ff0000')==='#ff0000' && __homeTest.cor('lixo-invalido')==='#ff0000'`);
  /* Com o foco num campo de texto o Escape não fecha o modal (é do campo, por projeto): tira o foco antes. */
  await js("document.activeElement&&document.activeElement.blur&&document.activeElement.blur()");
  await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");await pause(300);
  await check('Exibição: Escape (núcleo) fecha o modal de Ajustes',`!document.getElementById('cfg-modal-overlay-ctrl').classList.contains('aberto')`);
  // Sair do modo Bíblia pelo botão do cabeçalho
  await js("document.getElementById('btn-modo-biblia').click()");
  for (let i = 0; i < 40 && await js("document.body.classList.contains('app-mod-biblia')"); i++) await pause(100);
  await check('Bíblia: o botão do cabeçalho sai do modo e restaura o título',`!document.body.classList.contains('app-mod-biblia') && document.title==='Lyra — Controlador' && document.getElementById('btn-modo-biblia').getAttribute('aria-pressed')==='false'`);
  // Biblioteca de músicas (painel/bibliotecaMusicas.js): lista, busca, seleção, alfabeto e «nova música manual»
  await js("window.__bibFix=[{id:12,root_id:12,parent_id:null,titulo:'Bondade',artista:'João'},{id:11,root_id:11,parent_id:null,titulo:'Alegria',artista:'Maria'},{id:13,root_id:13,parent_id:null,titulo:'Cantarei',artista:'Maria'}];window.__requests.length=0;__homeTest.bibliotecaCarregar();void 0");
  await aguardar("document.querySelectorAll('#lista .item').length===3");
  await check('Biblioteca: carrega do servidor, conta o acervo e ordena por título',`document.getElementById('bib-total-contagem').textContent==='3 músicas' && [...document.querySelectorAll('#lista .item .titulo')].map(e=>e.textContent).join(',')==='Alegria,Bondade,Cantarei'`);
  const visiveis = "[...document.querySelectorAll('#lista .item:not([hidden]) .titulo')].map(e=>e.textContent).join(',')";
  await js("(()=>{const b=document.getElementById('busca');b.value='bond';b.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await aguardar(`${visiveis}==='Bondade'`);
  await check('Biblioteca: a busca (oninput do HTML) esconde as linhas que não casam',`${visiveis}==='Bondade' && document.getElementById('bib-total-contagem').textContent==='3 músicas'`);
  await js("(()=>{const b=document.getElementById('busca');b.value='maria';b.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await aguardar(`${visiveis}==='Alegria,Cantarei'`);
  await check('Biblioteca: a busca também casa o artista',`${visiveis}==='Alegria,Cantarei'`);
  await js("(()=>{const b=document.getElementById('busca');b.value='';b.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await aguardar(`${visiveis}==='Alegria,Bondade,Cantarei'`);
  await check('Biblioteca: limpar a busca devolve todas as linhas',`${visiveis}==='Alegria,Bondade,Cantarei'`);
  await check('Biblioteca: o navegador alfabético lista as letras do acervo',`document.querySelectorAll('#bib-nav-alfabeto button, #bib-nav-alfabeto [data-letra]').length>=3`);
  await js("window.__requests.length=0;document.querySelectorAll('#lista .item')[1].click()");
  await aguardar("window.__requests.some(r=>r.path==='/api/musicas/12')");
  await check('Biblioteca: clicar numa linha abre a música (pedido ao servidor)',`window.__requests.some(r=>r.path==='/api/musicas/12')`);
  await js("document.querySelectorAll('#lista .item')[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:40,clientY:40}))");await pause(150);
  await check('Biblioteca: o menu de contexto da linha oferece as ações da música',`['Adicionar à playlist','Duplicar música','Selecionar várias','Excluir música'].every(t=>[...document.querySelectorAll('.menu-flutuante [role=menuitem]')].some(i=>i.textContent.includes(t)))`);
  await js("[...document.querySelectorAll('.menu-flutuante [role=menuitem]')].find(i=>i.textContent.includes('Selecionar várias')).click()");await pause(150);
  await check('Biblioteca: «Selecionar várias» entra no modo já com a linha marcada',`!document.getElementById('bib-selecao-barra').hidden && document.getElementById('bib-selecao-contagem').textContent.includes('1') && document.querySelectorAll('#lista .item[aria-checked=true]').length===1`);
  await js("document.getElementById('bib-selecao-cancelar').click()");await pause(150);
  await check('Biblioteca: cancelar a seleção sai do modo e limpa as marcas',`document.getElementById('bib-selecao-barra').hidden && document.querySelectorAll('#lista .item[aria-checked=true]').length===0`);
  await js("window.__lastAlert='';window.__requests.length=0;document.querySelector('.btn-nova-manual').click()");await pause(100);
  await check('Biblioteca: «Nova música manual» abre o modal',`!document.getElementById('nova-musica-manual-backdrop').hidden`);
  await js("document.getElementById('nova-musica-manual-salvar').click()");await pause(100);
  await check('Biblioteca: salvar sem título avisa e não chama o servidor',`!document.getElementById('app-dialog-overlay').hidden && document.getElementById('app-dialog-body').textContent.includes('Informe o título da música') && !window.__requests.some(r=>r.method==='POST')`);
  await js("document.getElementById('app-dialog-ok').click()");await pause(150);
  await js("document.getElementById('nova-musica-manual-titulo').value='Nova de teste';document.getElementById('nova-musica-manual-artista').value='Alguém';document.getElementById('nova-musica-manual-estrofes').value='Linha A\\nLinha B\\n\\nLinha C';document.getElementById('nova-musica-manual-salvar').click()");
  await aguardar("window.__requests.some(r=>r.method==='POST'&&r.path==='/api/musicas')");await pause(300);
  await check('Biblioteca: salvar envia a música (POST) e fecha o modal',`window.__requests.some(r=>r.method==='POST'&&r.path==='/api/musicas') && document.getElementById('nova-musica-manual-backdrop').hidden`);
  await js("window.__bibFix=null;void 0");
  await js(`document.body.classList.add('app-mod-biblia')`);await pause();
  await check('prévia não invade Bíblia',`document.getElementById('playlist-preview-card').hidden`);
  await check('sem erros de execução',`!(window.__errors||[]).length`);
  checks.push('sem erros de console no renderer (inicialização e fluxos)'); if(errors.length) failures.push('Erros de console: '+errors.slice(0,5).join(' | '));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({complete:true,checks,failures,errors},null,2));
  if(failures.length) throw Error(failures.join('\n'));
}
run().then(()=>{win?.destroy();server.close();app.exit(0)}).catch(e=>{
  console.error(e.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.stack,checks,failures,errors},null,2));
  win?.destroy();server.close();app.exit(1);
});

