/**
 * DOCS: biblioteca de documentos importados (PPT/PDF/DOC), faixa de páginas, prévia central e
 * projeção das páginas. Também a entrada e a saída do modo (abrirModoDocs/fecharModoDocs).
 *
 * Extraído de controllerAppCore.js sem mudar o comportamento. O estado do DOCS (biblioteca,
 * documento aberto, páginas, projeção, timers) é privado deste módulo; o núcleo só enxerga as
 * funções exportadas e os poucos pontos de leitura no fim do arquivo. As dependências do núcleo
 * entram por `registrarDependenciasDocs`, chamado no topo do núcleo. O armazenamento dos arquivos
 * e o PDF já têm módulos próprios (docsArquivosIdb.js e docsPdfPaginas.js).
 */
import { LS_DOCS_BIBLIOTECA } from '../modules/chavesArmazenamentoLocal.js';
import { abrirDocumentoPdf, ehDocumentoQuePrecisaConversao, ehDocumentoRenderizavel } from '../modules/docsPdfPaginas.js';
import { apagarArquivoDoc, guardarArquivoDoc, lerArquivoDoc } from '../modules/docsArquivosIdb.js';
import { appAlert, appConfirm } from './appDialog.js';
import { deltaScrollGrelhaSlidesAntecipado } from '../modules/scrollGrelhaSlides.js';
import { lembrarMonitorLigado } from '../modules/monitorLembrado.js';
import { limparOrdemNaoExibirUnificado } from '../modules/ordemNaoExibirUnificado.js';
import { svgIconeTipoMidiaApresentacao } from '../modules/midiaApresentacao.js';
import { estadoPainel } from './estadoPainel.js';
import { apLibFecharMenus } from './bibliotecaMidiasApresentacao.js';
import { aplicarMonitorLembradoAoEntrarNoModo, hayProjecaoMidiaApresentacaoAtiva, hostChaveMonitores, normalizarRota, rotaDesativada, sincronizarCheckboxLembrarMonitor } from './rotasMonitores.js';
import { aplicarRotaDoModoAtualNaUiEServidor } from './roteamentoTelasUi.js';
import { atualizarBtnTelaInicial } from './menuApresentacaoModo.js';
import { canaisParaEncerrarConteudoApresentacao, emitirApresentacao, encerrarCanaisApresentacaoNoServidor, obterAlvoProjecaoDeRota } from './conteudoUnificadoAviso.js';
import { definirEstadoBtnModoCabecalho, ehModoApresentacaoOperador, ehModoBibliaOperador, ehModoDocsOperador, ehModoSlidesOperador, executarComTransicaoUi, executarSemTransicaoUi, irParaTelaInicial } from './modosUi.js';
import { getControllerApiBase } from './servidorAlvo.js';
import { salvarRoteamentoTelasNoServidor } from './roteamentoTelas.js';

export function atualizarBtnModoDocs() {
  definirEstadoBtnModoCabecalho(
    'btn-modo-docs',
    ehModoDocsOperador(),
    'DOCS (ativo) — voltar à tela inicial',
    'Abrir DOCS',
  );
}

/**
 * DOCS — só a estrutura: entra no modo, mostra a área (vazia) e nada mais.
 * A saída de qualquer outro modo passa pelos caminhos já existentes, para não
 * duplicar aqui o que cada um faz com projeção e rotas.
 */
export function abrirModoDocs() {
  if (ehModoDocsOperador()) return;
  /* A new visit must push the route on the first projection. Other modes may have
     written the shared channel while DOCS was closed. */
  docsSyncedRouteKey = null;
  /*
   * Entrada sem cross-fade, e por isso sem ecrã intermédio.
   *
   * O painel do DOCS está vazio: numa View Transition não há nada a cobrir o instantâneo
   * do ecrã anterior, e o que se via era a Home (ou o modo de onde se vinha) a desvanecer
   * sobre o vazio — o «pisca» relatado. Vindo de outro modo eram mesmo duas transições
   * seguidas, a primeira delas a terminar na Home.
   *
   * Aqui a saída do modo anterior e a entrada no DOCS correm com as transições desligadas,
   * na mesma tarefa: o ecrã é pintado uma vez, já no DOCS. As transições dos outros modos
   * não mudam — o supressor só vale dentro desta chamada.
   */
  executarSemTransicaoUi(() => {
    if (ehModoApresentacaoOperador() || ehModoBibliaOperador() || ehModoSlidesOperador()) {
      irParaTelaInicial();
    }
    executarComTransicaoUi(() => {
      document.body.classList.add('app-mod-docs');
      document.title = 'Lyra — DOCS';
      atualizarBtnModoDocs();
      atualizarBtnTelaInicial();
      /* Seletor do cabeçalho: mesma sequência de Mídias e Bíblia, com a chave `docs`. */
      /* Entrar num modo não é escolher «Não exibir»: a ordem do operador não sobrevive à
         troca de ecrã. Ver `modules/ordemNaoExibirUnificado.js`. */
      limparOrdemNaoExibirUnificado();
      aplicarMonitorLembradoAoEntrarNoModo('docs');
      sincronizarCheckboxLembrarMonitor();
      void aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
      /* A faixa e a prévia só existem com o modo aberto: é aqui que o documento
         escolhido é lido e desenhado. */
      if (docsDocumentoAbertoId !== docsSelecionadoId) void abrirDocumentoSelecionadoNoDocs();
    });
  });
}

/* ─── DOCS — importação de ficheiros ───────────────────────────────────────
   Mesmo molde do seletor de arquivos/áudio do modo Mídias: lista suspensa com o
   que já foi importado e um «+» que abre o seletor do sistema. Por agora fica-se
   por aqui: nada abre, exibe ou projeta os documentos. */

/** Extensões aceites na importação — PowerPoint, PDF e Word. */
export const DOCS_EXTENSOES_ACEITES = ['.ppt', '.pptx', '.pdf', '.doc', '.docx'];

/** Documentos importados nesta instalação (só a ficha de cada ficheiro). */
let docsBiblioteca = [];
/** Linha escolhida na lista suspensa — por enquanto só destaque e rótulo do botão. */
let docsSelecionadoId = null;
/**
 * A escolha só vale nesta janela do controlador: fechar o Lyra deve deixar o DOCS
 * sem documento aberto, como a tradução do modo Bíblia. A lista de importados e os
 * bytes no IndexedDB ficam onde estão — muda só o que está selecionado.
 */
const SS_DOCS_SELECIONADO = 'lyra_docs_selecionado_sessao_v1';

export function extensaoDoNomeDeArquivo(nome) {
  const n = String(nome || '');
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(i).toLowerCase() : '';
}

/**
 * O `accept` do input é uma sugestão: o seletor do sistema deixa escolher «Todos os
 * ficheiros», e ficheiros arrastados nem por lá passam. A extensão manda.
 */
export function ehArquivoDocumentoAceite(nome) {
  return DOCS_EXTENSOES_ACEITES.includes(extensaoDoNomeDeArquivo(nome));
}

/** Rótulo do tipo, para a linha da lista. */
export function rotuloTipoDocumento(nome) {
  const ext = extensaoDoNomeDeArquivo(nome);
  if (ext === '.pdf') return 'PDF';
  if (ext === '.ppt' || ext === '.pptx') return 'PowerPoint';
  if (ext === '.doc' || ext === '.docx') return 'Word';
  return 'documento';
}

export function carregarDocsBibliotecaDoStorage() {
  try {
    const raw = localStorage.getItem(LS_DOCS_BIBLIOTECA);
    if (!raw) return;
    const p = JSON.parse(raw);
    const itens = Array.isArray(p?.itens) ? p.itens : [];
    docsBiblioteca = itens
      .filter((x) => x && typeof x === 'object' && String(x.name || '').trim())
      .map((x) => ({
        id: String(x.id || ''),
        name: String(x.name || ''),
        title: String(x.title || x.name || ''),
        mime: String(x.mime || ''),
        size: Number(x.size) || 0,
        filePath: String(x.filePath || ''),
      }));
    const selSessao = String(sessionStorage.getItem(SS_DOCS_SELECIONADO) || '');
    docsSelecionadoId = docsBiblioteca.some((x) => x.id === selSessao) ? selSessao : null;
  } catch (_) {
  // intencional — lista corrompida equivale a lista vazia
}
}

function salvarDocsBibliotecaNoStorage() {
  try {
    localStorage.setItem(
      LS_DOCS_BIBLIOTECA,
      JSON.stringify({ version: 1, itens: docsBiblioteca })
    );
    if (docsSelecionadoId) sessionStorage.setItem(SS_DOCS_SELECIONADO, docsSelecionadoId);
    else sessionStorage.removeItem(SS_DOCS_SELECIONADO);
  } catch (_) {
  // intencional — quota cheia não pode derrubar o painel
}
}

let docsBusca = '';

export function renderListaDocsImportados() {
  const list = document.getElementById('docs-lib-list');
  if (!list) return;
  document.querySelectorAll('body > .ap-lib-menu').forEach((m) => m.remove());
  list.innerHTML = '';
  const q = docsBusca.trim().toLowerCase();
  const itens = q ? docsBiblioteca.filter((x) => String(x.name || '').toLowerCase().includes(q)) : docsBiblioteca;
  if (!itens.length) {
    const vazio = document.createElement('div');
    vazio.className = 'placeholder-msg ap-lib-empty';
    vazio.textContent = q ? 'Nenhum documento encontrado.' : 'Nenhum documento. Use + Importar.';
    list.appendChild(vazio);
    return;
  }
  itens.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ap-lib-item';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', docsSelecionadoId && item.id === docsSelecionadoId ? 'true' : 'false');
    row.tabIndex = 0;

    const thumb = document.createElement('div');
    thumb.className = 'ap-lib-thumb';
    thumb.innerHTML = svgIconeTipoMidiaApresentacao('pdf');
    const main = document.createElement('div');
    main.className = 'ap-lib-main';
    const nome = document.createElement('div');
    nome.className = 'ap-lib-name';
    nome.textContent = String(item.name || 'documento');
    nome.title = String(item.name || '');
    const meta = document.createElement('div');
    meta.className = 'ap-lib-meta';
    meta.textContent = rotuloTipoDocumento(item.name);
    main.append(nome, meta);

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ap-lib-more';
    more.setAttribute('aria-label', `Mais ações para ${item.name || 'documento'}`);
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.textContent = '⋯';
    const menu = document.createElement('div');
    menu.className = 'ap-lib-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const bDel = document.createElement('button');
    bDel.type = 'button';
    bDel.setAttribute('role', 'menuitem');
    bDel.className = 'is-danger';
    bDel.textContent = 'Remover da lista';
    menu.append(bDel);
    more.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const abrir = menu.hidden;
      apLibFecharMenus();
      menu.hidden = !abrir;
      more.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      if (abrir) {
        if (menu.parentElement !== document.body) document.body.appendChild(menu);
        menu.hidden = false;
        const r = more.getBoundingClientRect();
        const h = menu.offsetHeight || 56;
        const w = menu.offsetWidth || 140;
        const abaixo = r.bottom + 4 + h <= window.innerHeight - 8;
        menu.style.top = `${Math.max(8, abaixo ? r.bottom + 4 : r.top - h - 4)}px`;
        menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
      }
    });
    bDel.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      apLibFecharMenus();
      const ok = await appConfirm(`Remover "${item.name}" da lista de documentos?`, 'DOCS');
      if (!ok) return;
      const eraOAberto = docsDocumentoAbertoId === item.id;
      docsBiblioteca = docsBiblioteca.filter((x) => x && x.id !== item.id);
      void apagarArquivoDoc(item.id);
      void apagarArquivoDoc(docsChavePdfInterno(item.id));
      if (docsSelecionadoId === item.id) docsSelecionadoId = null;
      salvarDocsBibliotecaNoStorage();
      renderListaDocsImportados();
      if (eraOAberto) void abrirDocumentoSelecionadoNoDocs();
    });

    const escolher = () => {
      docsSelecionadoId = item.id;
      salvarDocsBibliotecaNoStorage();
      renderListaDocsImportados();
      void abrirDocumentoSelecionadoNoDocs();
    };
    row.addEventListener('click', (ev) => {
      if (ev.target instanceof HTMLElement && ev.target.closest('.ap-lib-more, .ap-lib-menu')) return;
      escolher();
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.target !== row) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        escolher();
      }
    });
    row.append(thumb, main, more);
    list.appendChild(row);
  });
}

export function configurarBuscaDocsImportados() {
  document.getElementById('docs-lib-search')?.addEventListener('input', (e) => {
    docsBusca = String(e.target.value || '');
    renderListaDocsImportados();
  });
  document.getElementById('docs-lib-list')?.addEventListener('scroll', apLibFecharMenus, { passive: true });
}

/**
 * Importa os ficheiros escolhidos.
 *
 * Guarda-se a ficha do ficheiro — nome, tipo, tamanho e o caminho em disco quando o
 * Electron o dá. O conteúdo não é lido: nada o consome ainda, e um .pptx em Base64 no
 * localStorage repetiria o problema de quota que os áudios do modo Mídias já tiveram.
 */
export function adicionarArquivosAosDocs(files) {
  const lista = Array.from(files || []);
  if (!lista.length) return;
  const recusados = [];
  let importados = 0;
  lista.forEach((file) => {
    const nome = String(file?.name || '').trim();
    if (!nome) return;
    if (!ehArquivoDocumentoAceite(nome)) {
      recusados.push(nome);
      return;
    }
    const item = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: nome,
      title: nome,
      mime: String(file.type || ''),
      size: Number(file.size) || 0,
      filePath: String(file.path || '').trim(),
    };
    docsBiblioteca.push(item);
    docsSelecionadoId = item.id;
    importados += 1;
    /* Os bytes ficam no IndexedDB: é deles que saem as páginas, agora e depois de
       recarregar o painel. Ver `modules/docsArquivosIdb.js`. */
    void guardarArquivoDoc(item.id, file);
  });
  if (importados) {
    salvarDocsBibliotecaNoStorage();
    renderListaDocsImportados();
    void abrirDocumentoSelecionadoNoDocs();
  }
  if (recusados.length) {
    void appAlert(
      `Só entram PowerPoint (.ppt, .pptx), PDF (.pdf) e Word (.doc, .docx).\n\nFicou de fora: ${recusados.join(', ')}`,
      'DOCS'
    );
  }
}

export function escolherArquivoModoDocs() {
  const input = document.getElementById('docs-add-input');
  if (!input) return;
  input.value = '';
  input.click();
}

/* ─── DOCS — faixa de páginas, prévia e projeção ───────────────────────────
   Uma página de cada vez: a faixa da esquerda mostra todas, a prévia central
   mostra a escolhida, e o duplo clique põe-na no ar. A distinção entre «em
   prévia» e «no ar» é de leitura imediata — dourado contra vermelho. */

/** Documento aberto agora (punho do pdf.js) e a que item da lista pertence. */
let docsDocumentoAberto = null;
let docsDocumentoAbertoId = null;
/** Páginas: uma entrada por página, com a miniatura já desenhada (ou `null`). */
let docsPaginas = [];
let docsPaginaSelecionada = -1;
/** `"<id do documento>#<índice>"` do que está no telão, ou `null`. */
let docsPaginaProjetadaChave = null;
/** Corrida entre aberturas: só a última manda no que aparece no ecrã. */
let docsAberturaSeq = 0;
/*
 * Corrida entre projeções: só a última manda no telão.
 *
 * Cada projeção renderiza a página a 1920px e envia-a por POST — com o teclado a repetir,
 * várias ficam em voo ao mesmo tempo e a que acabasse mais tarde não era necessariamente
 * a página mais recente. O painel ficava numa página e o telão noutra.
 */
let docsProjecaoSeq = 0;
/*
 * Tecla segura (auto-repeat): navega-se a cada passo, o telão só recebe quando a
 * sequência assenta. Sem isto, correr páginas com a seta disparava dezenas de renders a
 * 1920px e outros tantos POSTs por segundo, em cima do culto.
 */
const DOCS_REPETICAO_PROJECAO_MS = 200;
let docsProjecaoRepeticaoTimer = null;

/* Acompanha a largura da faixa: desenhar a 150 e esticar para ~280 dava miniatura desfocada. */
const DOCS_LARGURA_MINIATURA = 280;
const DOCS_LARGURA_PREVIA = 1100;
const DOCS_LARGURA_PROJECAO = 1920;

/**
 * Chave do PDF de renderização de um documento do Office.
 *
 * O ficheiro original continua guardado na chave do item — é ele que dá nome e formato ao
 * documento na lista. Este é o PDF equivalente, gerado uma vez pelo Office e reutilizado
 * nas aberturas seguintes; representação interna, nunca o ficheiro do utilizador.
 */
export function docsChavePdfInterno(docId) {
  return `${String(docId || '')}:pdf`;
}

/**
 * Pede ao controlador que converta o documento pelo Office instalado.
 *
 * @returns {Promise<{ok: true, pdf: Blob}|{ok: false, erro: string}>}
 */
async function converterDocumentoParaPdfNoControlador(item, arquivo) {
  try {
    const r = await fetch(
      `${getControllerApiBase()}/api/docs/converter-pdf?nome=${encodeURIComponent(item.name)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: arquivo }
    );
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return { ok: false, erro: String(j.erro || `Falha na conversão (HTTP ${r.status}).`) };
    }
    const pdf = await r.blob();
    if (!pdf || !pdf.size) return { ok: false, erro: 'A conversão devolveu um PDF vazio.' };
    return { ok: true, pdf };
  } catch (e) {
    console.error('[Lyra] converter documento do modo DOCS', e);
    return {
      ok: false,
      erro: 'Não foi possível falar com o Lyra Controlador para converter o documento.',
    };
  }
}

export function docsChavePagina(docId, indice) {
  return `${String(docId || '')}#${Number(indice)}`;
}

/** Há alguma página deste modo no telão agora? */
function docsProjecaoNoAr() {
  return !!docsPaginaProjetadaChave;
}

function docsItemSelecionado() {
  return docsBiblioteca.find((x) => x && x.id === docsSelecionadoId) || null;
}

function docsMensagemPreviewVazio(texto) {
  const vazio = document.getElementById('docs-preview-vazio');
  const img = document.getElementById('docs-preview-img');
  const preview = document.getElementById('docs-preview');
  if (img) {
    img.hidden = true;
    img.removeAttribute('src');
  }
  docsEncerrarSaidaPrevia();
  if (vazio) {
    vazio.hidden = false;
    vazio.textContent = texto;
  }
  if (preview) {
    preview.classList.remove('selecionada', 'no-ar');
  }
  const selo = document.getElementById('docs-preview-selo');
  if (selo) selo.hidden = true;
}

/** Fecha o documento aberto e limpa faixa, prévia e contador. */
function docsFecharDocumentoAberto() {
  docsCancelarProjecaoAdiada();
  if (docsDocumentoAberto) {
    try { docsDocumentoAberto.destruir(); } catch (_) {
  // intencional — erro ignorado
}
  }
  docsDocumentoAberto = null;
  docsDocumentoAbertoId = null;
  docsPaginas = [];
  docsPaginaSelecionada = -1;
  const faixa = document.getElementById('docs-faixa');
  if (faixa) faixa.innerHTML = '';
  atualizarNavegacaoDocs();
}

/**
 * Abre o documento escolhido na lista: lê os bytes, conta as páginas e desenha.
 *
 * O PDF é o único formato que o painel sabe desenhar hoje (ver `docsPdfPaginas.js`);
 * PowerPoint e Word ficam na lista, com o motivo escrito na área central.
 */
async function abrirDocumentoSelecionadoNoDocs() {
  const item = docsItemSelecionado();
  const seq = ++docsAberturaSeq;
  docsFecharDocumentoAberto();
  if (!item) {
    docsMensagemPreviewVazio('Importe um documento para começar.');
    return;
  }
  const precisaConversao = ehDocumentoQuePrecisaConversao(item.name);
  if (!ehDocumentoRenderizavel(item.name) && !precisaConversao) {
    docsMensagemPreviewVazio(`${item.name}\n\nEste formato não é suportado no modo DOCS.`);
    return;
  }
  docsMensagemPreviewVazio(`A abrir ${item.name}…`);
  let blob = null;
  try {
    blob = await lerArquivoDoc(item.id);
  } catch (_) {
  // intencional — tratado a seguir como ficheiro em falta
}
  if (seq !== docsAberturaSeq) return;
  if (!blob) {
    docsMensagemPreviewVazio(
      `${item.name}\n\nO ficheiro não está guardado nesta instalação. Importe-o outra vez com o «+».`
    );
    return;
  }
  if (precisaConversao) {
    /*
     * PowerPoint e Word: o Office converte uma vez, o PDF fica guardado e as aberturas
     * seguintes são tão rápidas como as de um PDF importado à mão. Daqui para baixo o
     * caminho é exactamente o mesmo — nada de renderização duplicada.
     */
    let pdf = null;
    try {
      pdf = await lerArquivoDoc(docsChavePdfInterno(item.id));
    } catch (_) {
  // intencional — sem cache, converte-se agora
}
    if (seq !== docsAberturaSeq) return;
    if (!pdf) {
      docsMensagemPreviewVazio(`A converter ${item.name} com o Office…`);
      const r = await converterDocumentoParaPdfNoControlador(item, blob);
      if (seq !== docsAberturaSeq) return;
      if (!r.ok) {
        /* Sem miniaturas nem páginas a meio: o documento simplesmente não abre, e diz-se
           porquê. Os outros da lista continuam a funcionar. */
        docsMensagemPreviewVazio(`${item.name}\n\n${r.erro}`);
        return;
      }
      pdf = r.pdf;
      void guardarArquivoDoc(docsChavePdfInterno(item.id), pdf);
    }
    blob = pdf;
  }
  let doc = null;
  try {
    doc = await abrirDocumentoPdf(blob);
  } catch (e) {
    console.error('[Lyra] abrir PDF do modo DOCS', e);
    if (seq === docsAberturaSeq) docsMensagemPreviewVazio(`Não foi possível abrir ${item.name}.`);
    return;
  }
  if (seq !== docsAberturaSeq) {
    try { doc.destruir(); } catch (_) {
  // intencional — erro ignorado
}
    return;
  }
  docsDocumentoAberto = doc;
  docsDocumentoAbertoId = item.id;
  docsPaginas = Array.from({ length: doc.numPaginas }, () => ({ thumb: null }));
  renderFaixaPaginasDocs();
  await selecionarPaginaDocs(0, { rolarFaixa: false });
  void desenharMiniaturasDocs(seq);
}

/** Desenha as miniaturas uma a uma — um documento grande não pode travar o painel. */
async function desenharMiniaturasDocs(seq) {
  for (let i = 0; i < docsPaginas.length; i += 1) {
    if (seq !== docsAberturaSeq || !docsDocumentoAberto) return;
    if (docsPaginas[i].thumb) continue;
    let render = null;
    try {
      render = await docsDocumentoAberto.renderizarPagina(i + 1, DOCS_LARGURA_MINIATURA, 0.7);
    } catch (_) {
  // intencional — uma miniatura que falha fica com o marcador vazio
}
    if (seq !== docsAberturaSeq) return;
    if (!render) continue;
    docsPaginas[i].thumb = render.src;
    const alvo = document.querySelector(`.docs-miniatura[data-indice="${i}"]`);
    const vazio = alvo?.querySelector('.docs-miniatura-vazia');
    if (alvo && vazio) {
      const img = document.createElement('img');
      img.src = render.src;
      img.alt = `Página ${i + 1}`;
      vazio.replaceWith(img);
    }
  }
}

function renderFaixaPaginasDocs() {
  const faixa = document.getElementById('docs-faixa');
  if (!faixa) return;
  faixa.innerHTML = '';
  docsPaginas.forEach((pag, i) => {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'docs-miniatura';
    botao.dataset.indice = String(i);
    botao.setAttribute('role', 'option');
    botao.setAttribute('aria-selected', 'false');
    botao.title = `Página ${i + 1}`;
    if (pag.thumb) {
      const img = document.createElement('img');
      img.src = pag.thumb;
      img.alt = `Página ${i + 1}`;
      botao.appendChild(img);
    } else {
      const vazio = document.createElement('div');
      vazio.className = 'docs-miniatura-vazia';
      botao.appendChild(vazio);
    }
    const num = document.createElement('span');
    num.className = 'docs-miniatura-num';
    num.textContent = String(i + 1);
    botao.appendChild(num);
    /*
     * Parado: um clique escolhe, dois projetam — o par de gestos da grelha de slides.
     * No ar: um clique já projeta.
     *
     * A troca é o que separa preparar de conduzir. Antes da primeira projeção, clicar é
     * espreitar, e o duplo clique é a decisão de pôr no telão; depois disso o operador
     * está a passar páginas ao vivo, e exigir-lhe dois cliques por página era pedir-lhe
     * o dobro do trabalho no pior momento para o ter.
     */
    botao.addEventListener('click', () => {
      if (docsProjecaoNoAr()) void projetarPaginaDocs(i);
      else void selecionarPaginaDocs(i);
    });
    botao.addEventListener('dblclick', () => {
      void projetarPaginaDocs(i);
    });
    faixa.appendChild(botao);
  });
  aplicarEstadoVisualPaginasDocs();
}

/** Contorno dourado no que está escolhido, vermelho no que está no ar. */
function aplicarEstadoVisualPaginasDocs() {
  const chaveNoAr = docsPaginaProjetadaChave;
  document.querySelectorAll('#docs-faixa .docs-miniatura').forEach((el) => {
    const i = Number(el.dataset.indice);
    const selecionada = i === docsPaginaSelecionada;
    const noAr = chaveNoAr === docsChavePagina(docsDocumentoAbertoId, i);
    el.classList.toggle('selecionada', selecionada);
    el.classList.toggle('no-ar', noAr);
    el.setAttribute('aria-selected', selecionada ? 'true' : 'false');
  });
  const preview = document.getElementById('docs-preview');
  const selo = document.getElementById('docs-preview-selo');
  const noArAqui =
    docsPaginaSelecionada >= 0 &&
    chaveNoAr === docsChavePagina(docsDocumentoAbertoId, docsPaginaSelecionada);
  if (preview) {
    preview.classList.toggle('selecionada', docsPaginaSelecionada >= 0 && !noArAqui);
    preview.classList.toggle('no-ar', noArAqui);
  }
  if (selo) selo.hidden = !noArAqui;
}

/**
 * Faixa a acompanhar o conteúdo: a página actual fica sempre visível e a seguinte
 * entra na conta. Mesmo cálculo da grelha do modo Slides (`scrollGrelhaSlides.js`),
 * aqui com uma coluna só.
 */
function rolarFaixaParaPaginaDocs(indice) {
  const faixa = document.getElementById('docs-faixa');
  if (!faixa) return;
  const atual = faixa.querySelector(`.docs-miniatura[data-indice="${indice}"]`);
  if (!atual) return;
  const seguinte = faixa.querySelector(`.docs-miniatura[data-indice="${indice + 1}"]`);
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height };
  };
  const rv = faixa.getBoundingClientRect();
  const delta = deltaScrollGrelhaSlidesAntecipado({
    viewport: { top: rv.top, bottom: rv.bottom, height: rv.height },
    chip: rect(atual),
    lookahead: rect(seguinte),
  });
  if (Math.abs(delta) > 0.5) faixa.scrollTop += delta;
}

function atualizarNavegacaoDocs() {
  const contador = document.getElementById('docs-nav-contador');
  const anterior = document.getElementById('docs-nav-anterior');
  const proxima = document.getElementById('docs-nav-proxima');
  const total = docsPaginas.length;
  if (contador) {
    contador.textContent = total ? `${docsPaginaSelecionada + 1} / ${total}` : '—';
  }
  if (anterior) anterior.disabled = !total || docsPaginaSelecionada <= 0;
  if (proxima) proxima.disabled = !total || docsPaginaSelecionada >= total - 1;
}

/* Troca de página na prévia: a nova só aparece descodificada e a antiga sai por cima,
   a desvanecer. Mesma duração do fade da Bíblia no monitor do ministrante. */
const DOCS_FADE_PREVIA_MS = 160;
let docsSaidaPreviaTimer = null;

/** Descodifica a página fora do ecrã: trocar o `src` sem isto pisca um quadro vazio. */
async function docsPrepararImagemPrevia(src) {
  const pronta = new Image();
  pronta.src = src;
  try {
    if (pronta.decode) await pronta.decode();
  } catch (_) {
  // intencional — imagem que não descodifica segue pelo caminho normal
}
}

/** Esconde a camada de saída — troca terminada, documento fechado ou prévia vazia. */
function docsEncerrarSaidaPrevia() {
  if (docsSaidaPreviaTimer) {
    clearTimeout(docsSaidaPreviaTimer);
    docsSaidaPreviaTimer = null;
  }
  const saida = document.getElementById('docs-preview-img-saida');
  if (!saida) return;
  saida.hidden = true;
  saida.classList.remove('a-sair');
  saida.removeAttribute('src');
}

/** Copia a página que está no lugar para a camada de saída e manda-a desvanecer. */
function docsIniciarSaidaPrevia(img) {
  const saida = document.getElementById('docs-preview-img-saida');
  const preview = document.getElementById('docs-preview');
  if (!saida || !preview || !img || img.hidden || !img.getAttribute('src')) return;
  const r = img.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const rp = preview.getBoundingClientRect();
  if (docsSaidaPreviaTimer) clearTimeout(docsSaidaPreviaTimer);
  saida.classList.remove('a-sair');
  saida.style.left = `${r.left - rp.left - preview.clientLeft}px`;
  saida.style.top = `${r.top - rp.top - preview.clientTop}px`;
  saida.style.width = `${r.width}px`;
  saida.style.height = `${r.height}px`;
  saida.src = img.src;
  saida.hidden = false;
  requestAnimationFrame(() => saida.classList.add('a-sair'));
  docsSaidaPreviaTimer = setTimeout(docsEncerrarSaidaPrevia, DOCS_FADE_PREVIA_MS + 60);
}

/** Um clique: escolhe a página e mostra-a no centro. Não projeta. */
async function selecionarPaginaDocs(indice, opts = {}) {
  const i = Number(indice);
  if (!docsDocumentoAberto || !Number.isInteger(i) || i < 0 || i >= docsPaginas.length) return;
  docsPaginaSelecionada = i;
  atualizarNavegacaoDocs();
  aplicarEstadoVisualPaginasDocs();
  if (opts.rolarFaixa !== false) rolarFaixaParaPaginaDocs(i);
  const seq = docsAberturaSeq;
  let render = null;
  try {
    render = await docsDocumentoAberto.renderizarPagina(i + 1, DOCS_LARGURA_PREVIA, 0.88);
  } catch (e) {
    console.error('[Lyra] prévia da página do modo DOCS', e);
  }
  if (seq !== docsAberturaSeq || docsPaginaSelecionada !== i || !render) return;
  const img = document.getElementById('docs-preview-img');
  const vazio = document.getElementById('docs-preview-vazio');
  if (img) {
    await docsPrepararImagemPrevia(render.src);
    if (seq !== docsAberturaSeq || docsPaginaSelecionada !== i) return;
    docsIniciarSaidaPrevia(img);
    img.src = render.src;
    img.alt = `Página ${i + 1}`;
    img.hidden = false;
  }
  if (vazio) vazio.hidden = true;
  aplicarEstadoVisualPaginasDocs();
}

/** Cancela a projeção adiada de uma sequência de teclas repetidas. */
function docsCancelarProjecaoAdiada() {
  if (!docsProjecaoRepeticaoTimer) return;
  clearTimeout(docsProjecaoRepeticaoTimer);
  docsProjecaoRepeticaoTimer = null;
}

export function navegarPaginaDocs(passo, opts = {}) {
  if (!docsPaginas.length) return;
  const destino = docsPaginaSelecionada + Number(passo);
  if (destino < 0 || destino >= docsPaginas.length) return;
  docsCancelarProjecaoAdiada();
  /*
   * `projetarSeNoAr`: com projeção no ar a página nova vai já ao telão, a mesma regra do
   * clique na miniatura — depois de iniciada a projeção não se pede outro duplo clique.
   */
  if (opts.projetarSeNoAr && docsProjecaoNoAr()) {
    /* Passo de tecla repetida: o painel acompanha, o telão espera o fim da corrida. */
    if (opts.repetir) {
      void selecionarPaginaDocs(destino);
      docsProjecaoRepeticaoTimer = setTimeout(() => {
        docsProjecaoRepeticaoTimer = null;
        void projetarPaginaDocs(docsPaginaSelecionada);
      }, DOCS_REPETICAO_PROJECAO_MS);
      return;
    }
    void projetarPaginaDocs(destino);
    return;
  }
  void selecionarPaginaDocs(destino);
}

/**
 * Last DOCS route successfully pushed to the server during this visit.
 * `null` forces the next projection to write. Page changes with the same route skip
 * `PUT /api/display-routing` — the same idea as `bibliaRotaSyncServidorChave`.
 */
let docsSyncedRouteKey = null;

function docsRouteKey() {
  const r = normalizarRota(estadoPainel.rotasPorModo.docs);
  return `${r.publicoIndex},${r.ministranteIndex},${r.live ? 1 : 0}`;
}

/**
 * Leva a rota escolhida no seletor do DOCS até ao servidor.
 *
 * O DOCS não tem canal próprio no motor — a Bíblia também não: espelha a rota dela no
 * canal `apresentacao` enquanto é o modo activo, e é isso que se faz aqui. Com mídia no
 * ar o canal não se toca (fechá-lo-ia), exactamente como no ramo da Bíblia.
 *
 * Grava na primeira projeção da visita e quando o monitor muda. Navegar de página com
 * a mesma rota não repete o PUT — esse PUT é o que realinha as janelas do projetor.
 */
async function sincronizarRotaDocsNoServidor() {
  if (hayProjecaoMidiaApresentacaoAtiva()) {
    /* The shared channel belongs to the media. The next docs page must write again. */
    docsSyncedRouteKey = null;
    return;
  }
  const chave = docsRouteKey();
  if (chave === docsSyncedRouteKey) return;
  estadoPainel.rotasPorModo.apresentacao = { ...normalizarRota(estadoPainel.rotasPorModo.docs) };
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
}

/** Dois cliques: a página vai para o telão. */
export async function projetarPaginaDocs(indice) {
  const i = Number(indice);
  if (!docsDocumentoAberto || !Number.isInteger(i) || i < 0 || i >= docsPaginas.length) return;
  /*
   * Já está no ar: não se reenvia.
   *
   * Com o clique a projetar, um duplo clique dispara clique + clique + duplo clique, e
   * sem esta guarda a mesma página seguia três vezes para o servidor.
   */
  if (docsPaginaProjetadaChave === docsChavePagina(docsDocumentoAbertoId, i)) {
    if (docsPaginaSelecionada !== i) await selecionarPaginaDocs(i);
    return;
  }
  const seqProj = ++docsProjecaoSeq;
  if (docsPaginaSelecionada !== i) await selecionarPaginaDocs(i);
  const rota = normalizarRota(estadoPainel.rotasPorModo.docs);
  if (!rota.live && rota.publicoIndex < 0 && rota.ministranteIndex < 0) {
    await appAlert('Escolha primeiro um monitor no seletor do cabeçalho.', 'DOCS');
    return;
  }
  await sincronizarRotaDocsNoServidor();
  const alvoProjecao = obterAlvoProjecaoDeRota(estadoPainel.rotasPorModo.docs);
  const item = docsItemSelecionado();
  let render = null;
  try {
    render = await docsDocumentoAberto.renderizarPagina(i + 1, DOCS_LARGURA_PROJECAO, 0.9);
  } catch (e) {
    console.error('[Lyra] renderizar página para projeção', e);
  }
  if (!render) {
    await appAlert('Não foi possível preparar esta página para projeção.', 'DOCS');
    return;
  }
  /* Já há uma projeção mais recente a caminho: esta morre aqui, sem tocar no telão. */
  if (seqProj !== docsProjecaoSeq) return;
  const ok = await emitirApresentacao({
    kind: 'image',
    src: render.src,
    mime: 'image/jpeg',
    name: item ? item.name : 'Documento',
    title: item ? `${item.name} — página ${i + 1}` : `Página ${i + 1}`,
    /* Só o DOCS pede o fade: a página nova entra por cima da que está no ar, em vez de
       o telão ficar um instante preto entre uma e outra. O Mídias continua sem ele. */
    transicao: 'fade',
    alvoProjecao,
  });
  if (!ok || seqProj !== docsProjecaoSeq) return;
  docsPaginaProjetadaChave = docsChavePagina(docsDocumentoAbertoId, i);
  aplicarEstadoVisualPaginasDocs();
}

/** Tira do ar o que o DOCS projetou, sem mexer no que os outros modos tenham. */
async function encerrarProjecaoPaginaDocs() {
  /* Encerrar ganha sempre à tecla: uma projeção adiada não pode reacender o telão. */
  docsCancelarProjecaoAdiada();
  if (!docsPaginaProjetadaChave) return;
  const alvo = obterAlvoProjecaoDeRota(estadoPainel.rotasPorModo.docs);
  const canais = canaisParaEncerrarConteudoApresentacao(alvo, null);
  docsPaginaProjetadaChave = null;
  aplicarEstadoVisualPaginasDocs();
  if (canais.length) await encerrarCanaisApresentacaoNoServidor(canais);
}

/**
 * «Encerrar» do cabeçalho em modo DOCS.
 *
 * Não há projeção de documentos para encerrar; o que o botão faz é largar o monitor
 * escolhido aqui, sem tocar no que a Bíblia, as Mídias ou os Slides tenham no ar.
 */
export function encerrarRotaModoDocs() {
  if (!ehModoDocsOperador()) return;
  /* O alvo dos canais é lido aqui dentro, antes de qualquer espera — por isso a rota pode
     ser largada logo a seguir sem apanhar o encerramento a meio. */
  void encerrarProjecaoPaginaDocs();
  /*
   * «Lembrar monitor» ligado: encerrar tira o que está no ar e mais nada.
   *
   * Largar a rota punha o seletor em «Não exibir» — ou seja, a caixa prometia guardar a
   * escolha e o botão ao lado dela apagava-a. A memória continua a valer só à entrada no
   * modo; o que muda aqui é a rota em vigor deixar de ser limpa quando o operador disse
   * que quer aquele monitor.
   */
  if (!lembrarMonitorLigado(hostChaveMonitores(), 'docs')) {
    estadoPainel.rotasPorModo.docs = rotaDesativada();
  }
  void aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
}

export function fecharModoDocs() {
  if (!ehModoDocsOperador()) return;
  executarComTransicaoUi(() => {
    document.body.classList.remove('app-mod-docs');
    document.title = 'Lyra — Controlador';
    atualizarBtnModoDocs();
    atualizarBtnTelaInicial();
    /* A rota do DOCS fica como está — o que se repõe é o seletor do modo que passa a valer. */
    sincronizarCheckboxLembrarMonitor();
    void aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
  });
}

/* ─── Pontos de contato com o núcleo (o estado acima é privado) ──────────────────── */

/** Rota do DOCS aceita pelo servidor: a próxima página não precisa empurrá-la de novo. */
export function marcarRotaDocsSincronizada() {
  docsSyncedRouteKey = docsRouteKey();
}

/** Há uma página do DOCS no ar? (o ESC do núcleo só encerra se houver) */
export function docsHaPaginaProjetada() {
  return !!docsPaginaProjetadaChave;
}

/** Índice da página selecionada na prévia (−1 se nenhuma). */
export function docsPaginaSelecionadaAtual() {
  return docsPaginaSelecionada;
}
