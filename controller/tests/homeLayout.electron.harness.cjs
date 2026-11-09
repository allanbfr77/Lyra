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
 if(window.__saveFail && opts.method==='PUT') return new Response(JSON.stringify({erro:'Falha simulada'}),{status:500});
 let data={};
 if(p==='/api/musicas') data=[window.__songs[0]];
 else if(/\\/api\\/musicas\\/\\d+\\/versoes/.test(p)) data={root_id:1,versoes:window.__songs};
 else if(/\\/api\\/musicas\\/\\d+/.test(p)) {
  const id=Number(p.split('/')[3]);
  if(opts.method==='PUT') Object.assign(window.__songs.find(s=>s.id===id),JSON.parse(opts.body));
  data=window.__songs.find(s=>s.id===id)||window.__songs[0];
 }
 else if(p.includes('/letras/buscar')) data={sucesso:true,resultados:[{titulo:'Resultado de teste',artista:'Artista de teste',path:'/teste',id:10}]};
 else if(p.includes('/biblia/traducoes')) data=[];
 else if(p.includes('/monitores')) data={monitores:[]};
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
window.fetch=window.__fixtureFetch;
window.alert=(message)=>{window.__lastAlert=String(message)};
window.addEventListener('error',e=>{(window.__errors ||= []).push(e.message)});
window.addEventListener('unhandledrejection',e=>{(window.__errors ||= []).push(String(e.reason))});
`;
const bridge = `
window.__homeTest = {
 seed() {
  limparFlagsModoEdicaoMusica();
  musicaBancoFonte='user'; musicaRootId=1; musicaVersaoLocalId=null;
  musicaAtiva=structuredClone(window.__songs[1]); estrofeAtiva=0;
  versoesMusicaServidorCache={rootId:1,versoes:structuredClone(window.__songs)};
  renderEstrofesEditor();renderMusicaVersoesBar();atualizarPreviewPlaylistCentral();
 },
 state:()=>({id:musicaAtiva?.id, title:musicaAtiva?.titulo, slides:musicaAtiva?.estrofes, index:estrofeAtiva, full:modoLetraCompletaCentral, editing:modoEdicaoEstrofes}),
 preview:atualizarPreviewPlaylistCentral,
 filter:()=>aplicarFiltroBiblioteca(++filtrarBibliotecaGeracao),
 openContagem:abrirPainelContagem,
 closeContagem:fecharPainelContagem,
 lyra:{comando:tratarComandoMenuLyra,fechar:fecharLyraMenuModal,status:atualizarModalStatusReinicioServidor},
 banner:{disponivel:mostrarBannerAtualizacaoDisponivel,progressoCompanion:mostrarBannerCompanionProgresso,esconder:esconderBannerAtualizacao,estado:lyraUpdaterUiState},
 dialogo:{confirm:appConfirm,estado:appDialogEstado},
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
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (_) { res.writeHead(404).end(); }
});
const pause = (ms=100) => new Promise(r=>setTimeout(r,ms));
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
  await js(`document.getElementById('btn-apagar-copia-versao').click()`);await pause();
  await check('apagar versão mantém confirmação',`!document.getElementById('app-dialog-overlay').hidden && !__requests.some(r=>r.method==='DELETE')`);
  await js(`document.getElementById('app-dialog-cancel').click();__songs[1].estrofes=structuredClone(__songs[0].estrofes);__homeTest.seed()`);await pause();
  await js(`document.getElementById('home-novo-slide').click()`); await pause();
  await check('Novo slide usa edição existente',`__homeTest.state().editing && __homeTest.state().slides.length===8 && document.querySelectorAll('.estrofe-slide-ta').length===8`);
  await js('__homeTest.seed();document.getElementById("btn-toggle-playlist-preview").click()');
  await check('prévia reutiliza renderer',`!document.getElementById('playlist-preview-card').hidden && document.getElementById('pl-pv-slide').textContent.includes('PRIMEIRA LINHA')`);
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

  await js(`document.body.classList.add('app-mod-biblia')`);await pause();
  await check('prévia não invade Bíblia',`document.getElementById('playlist-preview-card').hidden`);
  await check('sem erros de execução',`!(window.__errors||[]).length`);
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({complete:true,checks,failures,errors},null,2));
  if(failures.length) throw Error(failures.join('\n'));
}
run().then(()=>{win?.destroy();server.close();app.exit(0)}).catch(e=>{
  console.error(e.stack);fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.stack,checks,failures,errors},null,2));
  win?.destroy();server.close();app.exit(1);
});

