/**
 * Biblioteca de músicas do painel: carregamento, lista local/internet, busca, seleção em lote,
 * navegador alfabético, âncora de scroll, importação de letras e «nova música manual».
 * Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasBibliotecaMusicas`.
 */
import { BANCO_FONTE_OPCOES, fonteEnvioImportarLetras, normalizarFonteLetrasSite } from '../modules/fonteLetrasSite.js';
import { LETRAS_NAVEGADOR_BIBLIOTECA, letraAtualDoScrollBiblioteca, letraNavegavelMaisProxima, letraSobPosicaoNavegador } from '../modules/navegadorAlfabeticoBiblioteca.js';
import { LS_BANCO_SQLITE_LISTA_ABERTA, LS_FILTRO_ARTISTA, LS_FILTRO_LETRA, LS_FILTRO_TITULO } from '../modules/chavesArmazenamentoLocal.js';
import { alternarSelecao, ativarSelecao, cancelarSelecao, chaveSelecao, chavesSelecionadas, criarEstadoSelecao, estaSelecionada, idDaChaveSelecao, podeSelecionarFonte, rotuloContagemSelecao, sincronizarSelecaoComLista, totalSelecionadas } from '../modules/selecaoMultiplaBiblioteca.js';
import { appAlert, appEscolherOpcao } from './appDialog.js';
import { capturarAncoraScrollBiblioteca, clamparScrollTopBiblioteca, escolherChaveRestauroBiblioteca, scrollTopParaAncoraBiblioteca } from '../modules/ancoraScrollBiblioteca.js';
import { criarMenuFlutuante } from '../modules/menuFlutuante.js';
import { ehMarcadorTemaPlaylist, fonteBancoNormalizada } from '../modules/playlistVersaoMusica.js';
import { escapeHtml } from './textoHtmlSeguro.js';
import { rotuloArtistaLista } from '../modules/playlistMinistranteTom.js';
import { estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasBibliotecaMusicas(d) {
  dep = d || {};
}
const abrirModalPreviewLetras = (...a) => dep.abrirModalPreviewLetras(...a);
const abrirModalPreviewLetrasOffline = (...a) => dep.abrirModalPreviewLetrasOffline(...a);
const addMusicaNaPlaylist = (...a) => dep.addMusicaNaPlaylist(...a);
const aplicarPlaceholderBuscaLetras = (...a) => dep.aplicarPlaceholderBuscaLetras(...a);
const atualizarUiToggleListaBancoSqlite = (...a) => dep.atualizarUiToggleListaBancoSqlite(...a);
const entrarModoEdicao = (...a) => dep.entrarModoEdicao(...a);
const garantirCopiaPadraoServidor = (...a) => dep.garantirCopiaPadraoServidor(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const getLetrasSiteFonteAtual = (...a) => dep.getLetrasSiteFonteAtual(...a);
const getPlaylist = (...a) => dep.getPlaylist(...a);
const renderEstrofesEditor = (...a) => dep.renderEstrofesEditor(...a);
const renderItensLyraSelectDropdown = (...a) => dep.renderItensLyraSelectDropdown(...a);
const selecionarMusicaDoBanco = (...a) => dep.selecionarMusicaDoBanco(...a);
const setupLyraSelectDropdownWrap = (...a) => dep.setupLyraSelectDropdownWrap(...a);
const solicitarRemoverMusicaDoBancoServidor = (...a) => dep.solicitarRemoverMusicaDoBancoServidor(...a);
const solicitarRemoverMusicasDoBancoServidorEmLote = (...a) => dep.solicitarRemoverMusicasDoBancoServidorEmLote(...a);
const splitTextoEmEstrofesPorLinhaVaziaStrict = (...a) => dep.splitTextoEmEstrofesPorLinhaVaziaStrict(...a);

let filtrarLocalTimer = null;
/** Gerações da busca da Biblioteca: descartar resultado/trabalho de uma tecla já ultrapassada. */
let filtrarBibliotecaGeracao = 0;
/** Pedido HTTP da busca por trecho de letra ainda em voo (abortado ao digitar de novo). */
let filtrarBibliotecaAbort = null;
/** Revisão de `todasMusicas` vs. o DOM completo já montado — evita reconstruir a cada tecla. */
let bibDadosRev = 0;
let bibDomRev = -1;
/** Último texto de busca aplicado à visibilidade (para só resetar o scroll quando o filtro muda). */
let bibFiltroQAplicado = null;
/**
 * Posição de navegação a devolver à lista no próximo render — ver
 * `modules/ancoraScrollBiblioteca.js`. Só a exclusão a arma; qualquer outro render
 * continua a decidir o scroll exactamente como decidia antes.
 */
let bibAncoraScrollPendente = null;
let resultadosLetrasCache = [];
let letrasBuscaGeracao = 0;
let letrasBuscaAbort = null;

let listaLocalRenderizada = [];

const SVG_MENU_DUPLICAR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>';

const SVG_MENU_SELECIONAR_VARIAS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="m3.5 16 2 2 4-4"/><path d="M13 7h8"/></svg>';

export async function carregarMusicas() {
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas`);
    estadoPainel.todasMusicas = await res.json();
    bibDadosRev += 1;
    atualizarContagemTotalBiblioteca();
    filtrar();
  } catch (e) {
    console.error('Erro ao carregar músicas', e);
  }
}

/**
 * Quantidade total da Biblioteca local — o acervo inteiro, não o resultado de
 * um filtro em curso.
 *
 * `todasMusicas` já é exatamente isto: `GET /api/musicas` só traz
 * `WHERE parent_id IS NULL` (uma linha por música, nunca por versão/cópia —
 * ver `server/../rotas/musicas.js`), e é o mesmo array por trás de
 * `renderizarListaLocal`. Contar por ele é contar o que o operador vê e usa
 * na Biblioteca — nunca `SELECT COUNT(*) FROM musicas`, que incluiria as
 * versões. Buscar/filtrar apenas esconde linhas (`aplicarVisibilidadeBiblioteca`)
 * sem tocar em `todasMusicas`, então esta contagem nunca muda com o filtro.
 */
function atualizarContagemTotalBiblioteca() {
  const el = document.getElementById('bib-total-contagem');
  if (!el) return;
  const qtd = estadoPainel.todasMusicas.length;
  el.textContent = qtd === 1 ? '1 música' : `${qtd} músicas`;
}

export function initBancoPainelFromStorage() {
  const hid = document.getElementById('banco-fonte-select');
  const wrap = document.getElementById('banco-fonte-dd');
  if (!hid || !wrap) return;

  setupLyraSelectDropdownWrap(wrap);

  // Padrão ao abrir o controlador: banco online do Lyra (não restaura Cifra Club / Letras da sessão anterior).
  estadoPainel.letrasSiteFonte = 'lyra-online';
  renderItensLyraSelectDropdown(wrap, BANCO_FONTE_OPCOES, {
    valorAtual: 'lyra-online',
    aoSelecionar: () => onBancoFonteChange(),
  });
  aplicarPlaceholderBuscaLetras();

  const ft = localStorage.getItem(LS_FILTRO_TITULO);
  if (ft !== null) document.getElementById('filtro-busca-titulo').checked = ft === '1';
  const fa = localStorage.getItem(LS_FILTRO_ARTISTA);
  if (fa !== null) document.getElementById('filtro-busca-artista').checked = fa === '1';
  const fl = localStorage.getItem(LS_FILTRO_LETRA);
  if (fl !== null) document.getElementById('filtro-busca-letra').checked = fl === '1';

  const gravadoLista = localStorage.getItem(LS_BANCO_SQLITE_LISTA_ABERTA);
  estadoPainel.bancoSqliteListaExpandida = gravadoLista !== '0';
  atualizarUiToggleListaBancoSqlite();
}

export function onBancoFonteChange() {
  const sel = document.getElementById('banco-fonte-select');
  estadoPainel.letrasSiteFonte = normalizarFonteLetrasSite(sel?.value);
  aplicarPlaceholderBuscaLetras();
  garantirBuscaLetrasEditavel();
  cancelarBuscaLetrasEmVoo();
  limparResultadosBuscaLetras();
  atualizarBotaoLimparBuscaLetras();
  setTimeout(() => document.getElementById('busca-letras-q')?.focus(), 0);
}

export function garantirBuscaLocalEditavel() {
  const busca = document.getElementById('busca');
  if (!busca) return;
  // Mantém o campo utilizável mesmo após trocas de modo/fonte e estados de UI.
  busca.disabled = false;
  busca.readOnly = false;
  busca.removeAttribute('disabled');
}

export function garantirBuscaLetrasEditavel() {
  const busca = document.getElementById('busca-letras-q');
  if (!busca) return;
  busca.disabled = false;
  busca.readOnly = false;
  busca.removeAttribute('disabled');
}

/* ── Limpeza da busca de letras (vale para todas as fontes) ───────────────── */

/** O «x» dentro do campo só aparece havendo texto. */
function atualizarBotaoLimparBuscaLetras() {
  const inp = document.getElementById('busca-letras-q');
  const btn = document.getElementById('busca-letras-limpar');
  if (!inp || !btn) return;
  btn.hidden = !String(inp.value || '').trim();
}

/** Zera só os resultados exibidos (cache + lista + contagem), preservando o texto. */
function limparResultadosBuscaLetras() {
  resultadosLetrasCache = [];
  renderizarListaInternet([]);
}

/** Limpa campo e resultados de uma vez: botão «x» e fim de uma importação. */
export function limparBuscaLetras({ focar = false } = {}) {
  const inp = document.getElementById('busca-letras-q');
  if (inp) inp.value = '';
  atualizarBotaoLimparBuscaLetras();
  limparResultadosBuscaLetras();
  if (focar && inp) {
    try {
      inp.focus();
    } catch (_) {
      // intencional — erro ignorado
    }
  }
}

/**
 * Digitação no campo. Esvaziando-o à mão, os resultados anteriores deixam de
 * ter termo associado e são descartados — antes ficavam presos na tela.
 */
function cancelarBuscaLetrasEmVoo() {
  if (letrasBuscaAbort) {
    letrasBuscaAbort.abort();
    letrasBuscaAbort = null;
  }
  letrasBuscaGeracao += 1;
}

export function onBuscaLetrasInput() {
  atualizarBotaoLimparBuscaLetras();
  const inp = document.getElementById('busca-letras-q');
  if (inp && !String(inp.value || '').trim()) {
    cancelarBuscaLetrasEmVoo();
    limparResultadosBuscaLetras();
  }
}

export function onFiltroBuscaChange() {
  localStorage.setItem(LS_FILTRO_TITULO, document.getElementById('filtro-busca-titulo').checked ? '1' : '0');
  localStorage.setItem(LS_FILTRO_ARTISTA, document.getElementById('filtro-busca-artista').checked ? '1' : '0');
  localStorage.setItem(LS_FILTRO_LETRA, document.getElementById('filtro-busca-letra').checked ? '1' : '0');
  filtrar();
}

export function refreshListaBanco() {
  filtrar();
}

let renderOcultasModoSlidesAgendado = false;

/**
 * Adia a reconstrução dos painéis que o Modo Slides mantém escondidos (biblioteca e
 * editor de estrofes). Não é «não fazer»: é fazer depois do quadro que interessa —
 * o da grelha de slides — para o clique em «Próxima música» não pagar por DOM que
 * ninguém está a ver. Coalescido: vários pedidos seguidos rendem um só trabalho.
 */
export function agendarRenderizacoesOcultasDoModoSlides() {
  if (renderOcultasModoSlidesAgendado) return;
  renderOcultasModoSlidesAgendado = true;
  const correr = () => {
    renderOcultasModoSlidesAgendado = false;
    try {
      refreshListaBanco();
      renderEstrofesEditor();
    } catch (_) {
      // intencional — painéis ocultos nunca podem derrubar a projeção
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(correr, { timeout: 400 });
  } else {
    setTimeout(correr, 60);
  }
}

/**
 * Atualiza a linha de contexto acima da lista de resultados da pesquisa.
 * A fonte já está indicada no seletor acima, então aqui mostramos apenas
 * a contagem ("X resultados encontrados"). Some quando não há lista.
 */
function atualizarContagemListaInternet(qtd) {
  const el = document.getElementById('lista-internet-contagem');
  if (!el) return;
  if (!qtd) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = qtd === 1 ? '1 resultado encontrado' : `${qtd} resultados encontrados`;
}

/**
 * Faz o texto cortado por `text-overflow: ellipsis` revelar-se por inteiro num
 * tooltip nativo ao repousar o rato — sem mexer no corte, que é o que segura o
 * layout dos cartões.
 *
 * O `title` é decidido no `mouseover`, não na renderização, por duas razões: a
 * largura útil da linha muda com o painel, logo só medindo na hora se sabe se
 * aquele título ainda cabe; e um `title` posto sempre encheria de tooltip
 * redundante os títulos curtos — na biblioteca ainda taparia o tooltip de
 * instruções que a própria linha (`.item`) já carrega.
 *
 * A escuta é delegada no container porque as linhas são recriadas a cada busca;
 * `dataset` marca o container para não empilhar escutas em cada render.
 *
 * @param {string} idContainer id do elemento que contém as linhas
 * @param {string} [seletor] textos truncáveis dentro de cada linha
 */
function ativarTooltipTextoTruncado(idContainer, seletor = '.titulo, .sub') {
  const cont = document.getElementById(idContainer);
  if (!cont || cont.dataset.tooltipTruncado === '1') return;
  cont.dataset.tooltipTruncado = '1';
  cont.addEventListener('mouseover', (ev) => {
    const alvo = ev.target instanceof Element ? ev.target.closest(seletor) : null;
    if (!alvo || !cont.contains(alvo)) return;
    const texto = String(alvo.textContent || '').trim();
    /* 1px de folga: arredondamento de subpixel dá `scrollWidth` maior que
       `clientWidth` mesmo em texto que cabe todo. */
    const cortado = alvo.scrollWidth - alvo.clientWidth > 1;
    if (cortado && texto) alvo.title = texto;
    else alvo.removeAttribute('title');
  });
}

function renderizarListaInternet(lista) {
  const el = document.getElementById('lista-internet');
  if (!el) return;
  el.innerHTML = '';
  ativarTooltipTextoTruncado('lista-internet');

  atualizarContagemListaInternet(Array.isArray(lista) ? lista.length : 0);

  lista.forEach((m) => {
    const div = document.createElement('div');
    div.className = 'item item--letras';
    const meta = document.createElement('div');
    meta.className = 'item-letras-meta';
    meta.innerHTML = `
      <div class="titulo">${escapeHtml(m.titulo || '')}</div>
      ${m.artista ? `<div class="sub">${escapeHtml(m.artista)}</div>` : ''}
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn sm primary btn-import-letras';
    btn.textContent = 'Ver letra';
    btn.title = 'Ver a letra completa antes de importar para o banco deste servidor';
    btn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setTimeout(() => {
        if (m.fonte === 'banco-local' && m.id != null) {
          abrirModalPreviewLetrasOffline(m.id, m.origem === 'user' ? 'user' : 'catalog');
        } else abrirModalPreviewLetras(m.path, m.fonte);
      }, 0);
    };
    div.appendChild(meta);
    div.appendChild(btn);
    el.appendChild(div);
  });
}

const menuContextoMusicaBanco = criarMenuFlutuante({
  id: 'musica-banco-ctx-menu',
  rotuloAria: 'Ações da música',
});

/**
 * Título livre para a duplicata, a partir do da música original.
 *
 * O sufixo não é enfeite: o banco recusa (409) uma música nova cujo título e artista
 * batam com uma existente, e é ele que faz a duplicata passar essa checagem. Duplicar
 * duas vezes a mesma música dá «(cópia)» e depois «(cópia 2)» — sem o contador, a segunda
 * colidiria com a primeira.
 *
 * @param {string} tituloOriginal
 */
function tituloParaDuplicataMusica(tituloOriginal) {
  const base = String(tituloOriginal || '').trim() || 'Música';
  const jaExiste = (t) => {
    const alvo = t.toLocaleLowerCase('pt-BR');
    return estadoPainel.todasMusicas.some(
      (m) => String(m.titulo || '').trim().toLocaleLowerCase('pt-BR') === alvo
    );
  };
  const candidato = `${base} (cópia)`;
  if (!jaExiste(candidato)) return candidato;
  for (let n = 2; n <= 99; n++) {
    const t = `${base} (cópia ${n})`;
    if (!jaExiste(t)) return t;
  }
  return `${base} (cópia ${Date.now()})`;
}

/**
 * Duplica a música como **entrada independente** na lista do banco, e abre-a.
 *
 * Não confundir com «nova versão» (chip da barra de versões): essa nasce dentro da mesma
 * família `root_id` e não aparece na lista. Aqui o operador quer partir de um arranjo
 * existente para montar outro sem mexer no primeiro, logo o que serve é uma música nova.
 *
 * O conteúdo copiado é o da **cópia editável**, não o do original imutável: é a cópia que
 * a lista abre ao clique e onde as edições do operador estão — duplicar o original
 * devolveria a letra de antes das alterações dele.
 *
 * @param {{id: number, titulo: string, artista?: string}} musica
 */
async function duplicarMusicaDoBanco(musica) {
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${musica.id}`);
    if (!res.ok) throw new Error(`Falha ao ler a música (HTTP ${res.status}).`);
    let base = await res.json();

    if (Number(base.is_immutable) === 1) {
      const copiaId = await garantirCopiaPadraoServidor(base.id ?? musica.id);
      if (Number.isFinite(copiaId)) {
        const resCopia = await fetch(`${getControllerApiBase()}/api/musicas/${copiaId}`);
        if (resCopia.ok) base = await resCopia.json();
      }
    }

    const estrofes = (Array.isArray(base.estrofes) ? base.estrofes : [])
      .map((s) => String(s ?? ''))
      .filter((s) => s.trim().length > 0);
    if (!estrofes.length) {
      appAlert('Esta música não tem estrofes para duplicar.', 'Duplicar música');
      return;
    }

    const titulo = tituloParaDuplicataMusica(base.titulo || musica.titulo);
    const resNova = await fetch(`${getControllerApiBase()}/api/musicas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, artista: base.artista || '', estrofes }),
    });
    const data = await resNova.json().catch(() => ({}));
    /* 409 aqui significa que o título escolhido bateu com uma música existente apesar do
       sufixo. Sem `decisaoDuplicidade` o banco não gravou nada, então é só avisar. */
    if (resNova.status === 409 && data.duplicado) {
      appAlert(
        `Já existe uma música chamada «${titulo}» no banco. Renomeie-a e duplique outra vez.`,
        'Duplicar música'
      );
      return;
    }
    if (!resNova.ok) throw new Error(data.erro || `Erro HTTP ${resNova.status}`);

    await carregarMusicas();
    await selecionarMusicaDoBanco(data.id, { preferirCopia: true, origemUi: 'biblioteca' });
  } catch (e) {
    appAlert(e?.message || 'Não foi possível duplicar a música.', 'Duplicar música');
  }
}

/**
 * Ações de uma música do banco, no ponto do clique direito.
 *
 * Só para músicas do utilizador (`fonte: 'user'`) — daí o `'user'` fixo nas chamadas.
 * Editar, duplicar e excluir não têm sentido no catálogo, que é só-leitura, e por isso as
 * linhas de catálogo não chegam a abrir este menu.
 *
 * Excluir vive aqui, e não num botão na linha, porque é destrutivo e raro: uma lixeira em
 * cada linha, ao lado do «+» que se usa a toda a hora, é um clique errado à espera de
 * acontecer no meio de um culto. A confirmação continua a ser o modal de sempre.
 *
 * @param {number} clientX
 * @param {number} clientY
 * @param {{id: number, titulo: string, artista?: string}} musica
 * @param {HTMLElement} linhaEl Linha a realçar enquanto o modal de exclusão está aberto.
 */
function abrirMenuContextoMusicaBanco(clientX, clientY, musica, linhaEl) {
  menuContextoMusicaBanco.abrirNoPonto(clientX, clientY, {
    titulo: musica.titulo || '',
    itens: [
      {
        rotulo: 'Editar música',
        svg: dep.getSVG_MENU_EDITAR(),
        /* Carregar primeiro: o modo de edição opera sobre `musicaAtiva`, e entrar nele
           sem a música carregada não faria nada. */
        aoEscolher: async () => {
          const ok = await selecionarMusicaDoBanco(musica.id, {
            fonte: 'user',
            preferirCopia: true,
            origemUi: 'biblioteca',
          });
          if (ok) entrarModoEdicao();
        },
      },
      {
        rotulo: 'Adicionar à playlist',
        svg: dep.getSVG_MENU_INSERIR(),
        aoEscolher: () =>
          addMusicaNaPlaylist({
            id: musica.id,
            titulo: musica.titulo,
            artista: musica.artista,
            bancoFonte: 'user',
          }),
      },
      {
        rotulo: 'Duplicar música',
        svg: SVG_MENU_DUPLICAR,
        aoEscolher: () => duplicarMusicaDoBanco(musica),
      },
      {
        /* Entra no modo já com esta música marcada: quem abriu o menu sobre ela
           não teria por que a marcar outra vez a seguir. */
        rotulo: 'Selecionar várias',
        svg: SVG_MENU_SELECIONAR_VARIAS,
        separadorAntes: true,
        aoEscolher: () => bibSelEntrarModo(bibSelChaveDaLinha(linhaEl)),
      },
      {
        rotulo: 'Excluir música',
        svg: dep.getSVG_MENU_EXCLUIR(),
        variante: 'perigo',
        separadorAntes: true,
        aoEscolher: () => {
          linhaEl.classList.add('confirmando-exclusao');
          solicitarRemoverMusicaDoBancoServidor(musica.id, musica.titulo);
        },
      },
    ],
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   BIBLIOTECA DE MÚSICAS — lista do banco SQLite (painel esquerdo)

   Lista de varredura. O operador percorre-a a preparar o culto e, por vezes,
   ao vivo no meio dele: conta quantos títulos cabem sem rolar e com que
   rapidez o olho encontra um.

   O que mudou no desenho, e porquê:

   · Em repouso a linha não tem nada à direita. O disco dourado que existia em
     cada linha desenhava uma coluna de peso à direita dos títulos, obrigava a
     linha a ter a altura do botão e, por estar em todas as linhas, não
     distinguia nenhuma. Sobra um «+» simples, que nasce só na linha sob o
     cursor ou com o foco de teclado, e aí diz alguma coisa.

   · O que a linha FAZ não mudou. Clicar continua a abrir a música no centro;
     adicionar à playlist continua a ser o «+» e continua a passar por
     `addMusicaNaPlaylist`, com os mesmos argumentos de sempre. Isto é uma
     mudança de apresentação.

   · Enter adiciona a linha ATIVA, e ativa é tanto a que tem o foco de teclado
     como a que está sob o cursor — as duas mostram o «+», por isso as duas têm
     de responder ao Enter. Ctrl+Enter abre, que é o equivalente ao clique; sem
     ele o teclado não chegaria a uma acção que o rato tem.
   ═══════════════════════════════════════════════════════════════════════════ */

const BIB_SVG_MAIS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const BIB_SVG_VISTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>';

/**
 * Letra do separador alfabético de um título.
 *
 * Acentos são dobrados para a letra base — «Águas» pertence ao grupo A, e não a
 * um grupo «Á» com uma música lá dentro. Números e símbolos caem todos em «#».
 *
 * Artigos iniciais («A», «O», «Uma»…) NÃO são ignorados: o banco ordena por
 * `titulo COLLATE NOCASE` e mostra «A Ele a Glória» em A. Saltar o artigo aqui
 * poria a música debaixo de G com o «A» à vista, que é pior do que a ordem
 * simples. Se um dia o banco passar a ordenar sem artigos, é aqui que se muda.
 */
function bibLetraDeAgrupamento(titulo) {
  const c = String(titulo || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .charAt(0)
    .toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}

/** Chave de identidade de uma música na playlist: mesmo id E mesma origem. */
function bibChaveMusica(id, bancoFonte) {
  return `${fonteBancoNormalizada(bancoFonte)}:${Number(id)}`;
}

/**
 * Músicas do culto atual, para esmaecer as linhas correspondentes.
 *
 * Ignora a versão de propósito: a linha da biblioteca representa a música, e o
 * operador quer saber «esta já entrou?», não «esta versão exacta já entrou?».
 * A verificação fina (mesma versão) continua onde sempre esteve, dentro de
 * `addMusicaNaPlaylist` — o esmaecido é um aviso, não um bloqueio.
 */
function bibConjuntoMusicasNaPlaylist() {
  const set = new Set();
  if (!estadoPainel.cultoId) return set;
  for (const it of getPlaylist(estadoPainel.cultoId)) {
    if (ehMarcadorTemaPlaylist(it)) continue;
    set.add(bibChaveMusica(it.id, it.bancoFonte));
  }
  return set;
}

/** Rótulo lido em voz alta pelo leitor de ecrã. O estado nunca depende só da cor. */
function bibRotuloAcessivel(m, jaAdicionada) {
  const partes = [String(m.titulo || 'Sem título')];
  const artista = String(m.artista || '').trim();
  partes.push(artista ? `de ${artista}` : 'sem artista');
  if (jaAdicionada) partes.push('já na playlist deste culto');
  return partes.join(', ') + '.';
}

/**
 * Passa o foco (e o tabindex móvel) para uma linha.
 *
 * `tabindex` móvel e não `0` em todas: com o Tab, a biblioteca é UMA paragem,
 * não uma paragem por música. Dentro dela navega-se com as setas.
 */
function bibFocarLinha(linha) {
  if (!linha) return;
  const el = document.getElementById('lista');
  if (el) el.querySelectorAll('.item').forEach((x) => x.setAttribute('tabindex', '-1'));
  linha.setAttribute('tabindex', '0');
  linha.focus({ preventScroll: true });
  linha.scrollIntoView({ block: 'nearest' });
}

/** Música (do último render) que a linha representa. */
function bibMusicaDaLinha(linha) {
  const i = Number(linha?.dataset?.bibIdx);
  return Number.isInteger(i) ? listaLocalRenderizada[i] : null;
}

/** Adiciona à playlist do culto. Mesma API de sempre — só o gatilho é novo. */
function bibAdicionarLinha(linha) {
  const m = bibMusicaDaLinha(linha);
  if (!m) return;
  return addMusicaNaPlaylist({
    id: m.id,
    titulo: m.titulo,
    artista: m.artista,
    bancoFonte: fonteBancoNormalizada(linha.dataset.bibFonte),
  });
}

function bibLimparBusca() {
  const busca = document.getElementById('busca');
  if (!busca || !busca.value) return false;
  busca.value = '';
  filtrar();
  return true;
}

/**
 * Teclado da lista, delegado no contentor (sobrevive a cada re-render).
 *
 * ↑/↓ movem a seleção e rolam o item para a área visível; Enter adiciona;
 * Ctrl/⌘+Enter abre; Esc limpa a busca; qualquer carácter atira o foco para a
 * busca e escreve-o lá — quem começa a escrever quer filtrar, não navegar.
 */
function bibLinhasVisiveis(el) {
  return Array.from((el || document.getElementById('lista'))?.querySelectorAll('.item:not([hidden])') || []);
}

function bibTeclasLista(ev) {
  const el = document.getElementById('lista');
  if (!el) return;
  const linhas = bibLinhasVisiveis(el);
  const atual = ev.target instanceof Element ? ev.target.closest('.item') : null;
  const i = atual ? linhas.indexOf(atual) : -1;

  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    if (!linhas.length) return;
    ev.preventDefault();
    const passo = ev.key === 'ArrowDown' ? 1 : -1;
    const alvo = i === -1 ? (passo === 1 ? 0 : linhas.length - 1) : i + passo;
    bibFocarLinha(linhas[Math.max(0, Math.min(linhas.length - 1, alvo))]);
    return;
  }
  if (ev.key === 'Home' || ev.key === 'End') {
    if (!linhas.length) return;
    ev.preventDefault();
    bibFocarLinha(ev.key === 'Home' ? linhas[0] : linhas[linhas.length - 1]);
    return;
  }
  if (bibSelAtivo() && (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar')) {
    if (!atual) return;
    ev.preventDefault();
    bibSelAlternarLinha(atual);
    return;
  }
  if (bibSelAtivo() && ev.key === 'Escape') {
    ev.preventDefault();
    bibSelCancelarModo();
    return;
  }
  if (ev.key === 'Enter') {
    if (!atual) return;
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) {
      selecionarMusicaDoBanco(bibMusicaDaLinha(atual)?.id, {
        fonte: fonteBancoNormalizada(atual.dataset.bibFonte),
        preferirCopia: true,
        origemUi: 'biblioteca',
        abrirEmLetraCompleta: true,
      });
    } else {
      bibAdicionarLinha(atual);
    }
    return;
  }
  if (ev.key === 'Escape') {
    if (bibLimparBusca()) ev.preventDefault();
    return;
  }
  if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
    const busca = document.getElementById('busca');
    if (!busca) return;
    ev.preventDefault();
    busca.focus();
    busca.value += ev.key;
    filtrar();
  }
}

/** Esc na busca limpa-a; ↓ na busca entra na lista (caminho de volta do atalho acima). */
function bibTeclasBusca(ev) {
  if (ev.key === 'Escape') {
    if (bibLimparBusca()) ev.preventDefault();
    return;
  }
  if (ev.key === 'ArrowDown') {
    const primeira = document.querySelector('#lista .item:not([hidden])');
    if (!primeira) return;
    ev.preventDefault();
    bibFocarLinha(primeira);
  }
}

/**
 * Linha sobre a qual o rato está pousado, ou `null`.
 *
 * O «+» aparece no HOVER, mas o Enter só chegava a quem tivesse o FOCO de
 * teclado — e pousar o rato numa linha não lhe dá foco. Resultado: a linha
 * mostrava o «+» e prometia o Enter, e o Enter não fazia nada. Guardar aqui a
 * linha sob o cursor é o que faz o Enter valer para o que o operador está a ver.
 */
let bibLinhaSobCursor = null;

/**
 * Enter fora da lista: age sobre a linha sob o cursor.
 *
 * Vive no `document` porque o rato não dá foco a nada — não há elemento onde
 * pendurar o ouvinte. Daí as guardas serem generosas: só age se ninguém estiver
 * a escrever, se não houver modal aberto, se nenhum outro tratador já tiver
 * consumido a tecla, e se o foco não estiver dentro da própria lista (nesse caso
 * é `bibTeclasLista` que manda, e agir aqui adicionaria duas vezes).
 */
function bibEnterGlobal(ev) {
  if (ev.key !== 'Enter' || ev.altKey || ev.shiftKey) return;
  if (ev.defaultPrevented) return;
  if (!bibLinhaSobCursor || !bibLinhaSobCursor.isConnected) return;

  const alvo = ev.target;
  if (alvo instanceof Element) {
    if (alvo.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    if (alvo.closest('#lista')) return;
  }
  if (document.activeElement instanceof Element && document.activeElement.closest('#lista')) return;
  if (document.querySelector('.cfg-modal-overlay.aberto, .lyra-menu-modal-overlay.aberto')) return;

  ev.preventDefault();
  if (bibSelAtivo()) {
    bibSelAlternarLinha(bibLinhaSobCursor);
    return;
  }
  if (ev.ctrlKey || ev.metaKey) {
    selecionarMusicaDoBanco(bibMusicaDaLinha(bibLinhaSobCursor)?.id, {
      fonte: fonteBancoNormalizada(bibLinhaSobCursor.dataset.bibFonte),
      preferirCopia: true,
      origemUi: 'biblioteca',
      abrirEmLetraCompleta: true,
    });
  } else {
    bibAdicionarLinha(bibLinhaSobCursor);
  }
}

/** Liga os ouvintes uma única vez (os contentores não são recriados). */
function bibGarantirTeclado() {
  const el = document.getElementById('lista');
  if (el && !el.dataset.bibTeclado) {
    el.dataset.bibTeclado = '1';
    el.addEventListener('keydown', bibTeclasLista);
    /* Delegado no contentor: as linhas são recriadas a cada render. */
    el.addEventListener('mouseover', (ev) => {
      const linha = ev.target instanceof Element ? ev.target.closest('.item') : null;
      bibLinhaSobCursor = linha && !linha.hidden ? linha : null;
    });
    el.addEventListener('mouseleave', () => {
      bibLinhaSobCursor = null;
    });
    el.addEventListener('click', (ev) => {
      const t = ev.target instanceof Element ? ev.target : null;
      if (!t) return;
      const linha = t.closest('.item');
      if (!linha || !el.contains(linha) || linha.hidden) return;
      /* Modo de seleção: o clique marca. Nada abaixo daqui corre. */
      if (bibSelAtivo()) {
        ev.preventDefault();
        ev.stopPropagation();
        bibSelAlternarLinha(linha);
        return;
      }
      if (t.closest('.bib-add')) {
        ev.preventDefault();
        ev.stopPropagation();
        void bibAdicionarLinha(linha);
        return;
      }
      if (t.closest('.item-acoes-banco')) return;
      const m = bibMusicaDaLinha(linha);
      if (!m) return;
      selecionarMusicaDoBanco(m.id, {
        fonte: fonteBancoNormalizada(linha.dataset.bibFonte),
        preferirCopia: true,
        origemUi: 'biblioteca',
        abrirEmLetraCompleta: true,
      });
    });
    el.addEventListener('contextmenu', (ev) => {
      const linha = ev.target instanceof Element ? ev.target.closest('.item') : null;
      if (!linha || !el.contains(linha) || linha.hidden) return;
      if (linha.dataset.bibFonte !== 'user') return;
      /* Durante o lote as ações são as da barra; um segundo menu por linha só
         confundiria sobre o que a próxima escolha ia atingir. */
      if (bibSelAtivo()) {
        ev.preventDefault();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const m = bibMusicaDaLinha(linha);
      if (!m) return;
      abrirMenuContextoMusicaBanco(ev.clientX, ev.clientY, m, linha);
    });
    el.addEventListener('mousedown', (ev) => {
      const div = ev.target instanceof Element ? ev.target.closest('.item') : null;
      if (!div || !el.contains(div) || div.hidden) return;
      const prev = el.querySelector('.item[tabindex="0"]');
      if (prev && prev !== div) prev.setAttribute('tabindex', '-1');
      div.setAttribute('tabindex', '0');
    });
    document.addEventListener('keydown', bibEnterGlobal);
  }
  const busca = document.getElementById('busca');
  if (busca && !busca.dataset.bibTeclado) {
    busca.dataset.bibTeclado = '1';
    busca.addEventListener('keydown', bibTeclasBusca);
  }
}

/**
 * Reaplica o estado «já adicionada» sem reconstruir a lista.
 *
 * Reconstruir a cada mexida na playlist perderia o foco de teclado a meio de
 * uma varredura — e é precisamente durante a montagem da playlist que a lista
 * está a ser varrida.
 */
export function atualizarEstadoAdicionadasListaLocal() {
  const el = document.getElementById('lista');
  if (!el) return;
  const naPlaylist = bibConjuntoMusicasNaPlaylist();
  el.querySelectorAll('.item').forEach((linha) => {
    const m = bibMusicaDaLinha(linha);
    if (!m) return;
    const ja = naPlaylist.has(bibChaveMusica(m.id, linha.dataset.bibFonte));
    linha.classList.toggle('bib-ja-add', ja);
    linha.setAttribute('aria-selected', ja ? 'true' : 'false');
    linha.setAttribute('aria-label', bibRotuloAcessivel(m, ja));
  });
}

/** Origem de importação na Biblioteca — bolinha no hover + legenda. */
export const BIB_ORIGEM_META = Object.freeze({
  'banco-local': Object.freeze({ classe: 'bib-origem--hlyrcs', tooltip: 'HLYRCS', legenda: 'HLYRCS' }),
  'lyra-online': Object.freeze({
    classe: 'bib-origem--lyra',
    tooltip: 'LYRA',
    legenda: 'LYRA',
  }),
  cifraclub: Object.freeze({
    classe: 'bib-origem--cifra',
    tooltip: 'CIFRA CLUB',
    legenda: 'CIFRA CLUB',
  }),
  'letras-mus-br': Object.freeze({
    classe: 'bib-origem--letras',
    tooltip: 'LETRAS.MUS',
    legenda: 'LETRAS.MUS',
  }),
  manual: Object.freeze({
    classe: 'bib-origem--manual',
    tooltip: 'ADICIONADA MANUALMENTE',
    legenda: 'MANUAL',
  }),
});

function bibMetaOrigemImportacao(origem) {
  const key = String(origem || '').trim().toLowerCase();
  if (key === 'lyra-songbank') return BIB_ORIGEM_META['lyra-online'];
  if (key === 'letrasmusbr') return BIB_ORIGEM_META['letras-mus-br'];
  return BIB_ORIGEM_META[key] || null;
}

function bibCriarBolinhaOrigem(origem) {
  const meta = bibMetaOrigemImportacao(origem);
  if (!meta) return null;
  const el = document.createElement('span');
  el.className = `bib-origem ${meta.classe}`;
  el.title = meta.tooltip;
  el.setAttribute('aria-hidden', 'true');
  return el;
}

/* ═══════════════════════════════════════════════════════════════════════════
   BIBLIOTECA — MODO DE SELEÇÃO MÚLTIPLA

   O estado do lote vive em `modules/selecaoMultiplaBiblioteca.js` (puro, testado).
   Aqui está só o que toca no DOM: pôr e tirar as caixas, pintar o marcado e
   correr as ações em lote.

   Três decisões que este bloco tem de defender:

   · **Fora do modo nada muda.** As caixas não existem no DOM enquanto o modo
     estiver desligado — não são escondidas com CSS, são criadas ao entrar e
     destruídas ao sair. Os ouvintes da lista já estavam registados e continuam
     os mesmos; o que se acrescentou foi um desvio na primeira linha de cada um,
     que só dispara com o modo ativo.

   · **Catálogo fica de fora.** Só linhas da fonte `user` recebem caixa. A
     marca no DOM é o atributo `data-bib-sel`, que o CSS usa para esmaecer as
     outras enquanto o modo dura.

   · **A lista pode ser reconstruída debaixo dos pés.** Excluir músicas chama
     `carregarMusicas()` e a lista nasce de novo, sem caixas. Por isso
     `renderizarListaLocal` termina a chamar `bibSelAposRender`, que repõe as
     caixas e deixa cair do lote quem já não existe.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Morre com a sessão do modo: nunca é persistido. */
export const bibSelecao = criarEstadoSelecao();

const BIB_SEL_SVG_VISTO =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 6-11 11-5-5"/></svg>';

function bibSelAtivo() {
  return !!bibSelecao.ativo;
}

/** Chave do lote para uma linha, ou `null` se a linha não puder ser selecionada. */
export function bibSelChaveDaLinha(linha) {
  const m = bibMusicaDaLinha(linha);
  if (!m) return null;
  const fonte = fonteBancoNormalizada(linha?.dataset?.bibFonte);
  if (!podeSelecionarFonte(fonte)) return null;
  return chaveSelecao(m.id, fonte);
}

/** Todas as linhas selecionáveis do render atual — inclui as escondidas pelo filtro. */
export function bibSelLinhas() {
  const el = document.getElementById('lista');
  return el ? Array.from(el.querySelectorAll('.item')) : [];
}

/**
 * Cria (ou remove) a caixa de seleção de cada linha.
 *
 * O `title` de repouso da linha explica o clique normal — no modo ele mentiria, por
 * isso é guardado em `dataset` e reposto à saída.
 */
function bibSelAplicarDom() {
  const el = document.getElementById('lista');
  if (!el) return;
  const ativo = bibSelAtivo();
  el.classList.toggle('lista-sqlite--selecao', ativo);
  for (const linha of bibSelLinhas()) {
    const chave = bibSelChaveDaLinha(linha);
    let caixa = linha.querySelector(':scope > .bib-sel-box');
    if (ativo && chave) {
      if (!caixa) {
        caixa = document.createElement('span');
        caixa.className = 'bib-sel-box';
        caixa.setAttribute('aria-hidden', 'true');
        caixa.innerHTML = BIB_SEL_SVG_VISTO;
        linha.insertBefore(caixa, linha.firstChild);
      }
      linha.dataset.bibSel = '1';
      if (linha.title && !linha.dataset.bibTitleNormal) linha.dataset.bibTitleNormal = linha.title;
      linha.title = 'Clique para marcar ou desmarcar esta música.';
      linha.setAttribute('aria-checked', estaSelecionada(bibSelecao, chave) ? 'true' : 'false');
    } else {
      if (caixa) caixa.remove();
      delete linha.dataset.bibSel;
      linha.removeAttribute('aria-checked');
      if (linha.dataset.bibTitleNormal) {
        linha.title = linha.dataset.bibTitleNormal;
        delete linha.dataset.bibTitleNormal;
      }
    }
  }
}

/** Repinta só o marcado/desmarcado, sem mexer na estrutura. */
function bibSelPintarMarcadas() {
  if (!bibSelAtivo()) return;
  for (const linha of bibSelLinhas()) {
    const chave = bibSelChaveDaLinha(linha);
    if (!chave) continue;
    linha.setAttribute('aria-checked', estaSelecionada(bibSelecao, chave) ? 'true' : 'false');
  }
}

function bibSelAtualizarBarra() {
  const barra = document.getElementById('bib-selecao-barra');
  if (!barra) return;
  const ativo = bibSelAtivo();
  barra.hidden = !ativo;
  if (!ativo) return;
  const n = totalSelecionadas(bibSelecao);
  const contagem = document.getElementById('bib-selecao-contagem');
  if (contagem) contagem.textContent = rotuloContagemSelecao(n);
  const btnAdd = document.getElementById('bib-selecao-add-playlist');
  const btnDel = document.getElementById('bib-selecao-excluir');
  if (btnAdd) btnAdd.disabled = n === 0;
  if (btnDel) btnDel.disabled = n === 0;
}

function bibSelAtualizarTudo() {
  bibSelAplicarDom();
  bibSelAtualizarBarra();
}

/**
 * Chamado no fim de cada render da lista. Sem isto, excluir um lote deixava o modo
 * ligado numa lista sem caixas e com chaves a apontar para músicas que já não existem.
 */
function bibSelAposRender() {
  if (!bibSelAtivo()) return;
  const vivas = new Set();
  for (const linha of bibSelLinhas()) {
    const chave = bibSelChaveDaLinha(linha);
    if (chave) vivas.add(chave);
  }
  sincronizarSelecaoComLista(bibSelecao, vivas);
  bibSelAtualizarTudo();
}

/** Entra no modo a partir do menu de contexto, já com a música clicada marcada. */
function bibSelEntrarModo(chaveInicial = null) {
  ativarSelecao(bibSelecao, chaveInicial);
  bibSelAtualizarTudo();
}

export function bibSelCancelarModo() {
  cancelarSelecao(bibSelecao);
  bibSelAtualizarTudo();
}

/** Marca/desmarca a linha. Devolve `true` se o clique foi consumido pelo modo. */
function bibSelAlternarLinha(linha) {
  if (!bibSelAtivo()) return false;
  const chave = bibSelChaveDaLinha(linha);
  /* Linha do catálogo dentro do modo: o clique morre aqui de propósito — abrir a
     música a meio de uma marcação seria trocar o ecrã sem o operador pedir. */
  if (!chave) return true;
  alternarSelecao(bibSelecao, chave);
  bibSelPintarMarcadas();
  bibSelAtualizarBarra();
  return true;
}

/** Músicas do lote, na ordem em que foram marcadas, com os dados do render atual. */
function bibSelMusicasDoLote() {
  const porChave = new Map();
  for (const linha of bibSelLinhas()) {
    const chave = bibSelChaveDaLinha(linha);
    if (chave && !porChave.has(chave)) porChave.set(chave, bibMusicaDaLinha(linha));
  }
  const out = [];
  for (const chave of chavesSelecionadas(bibSelecao)) {
    const m = porChave.get(chave);
    if (m) out.push({ chave, id: idDaChaveSelecao(chave), titulo: m.titulo || '', artista: m.artista || '' });
  }
  return out;
}

/**
 * Adiciona o lote à playlist do culto.
 *
 * Reusa `addMusicaNaPlaylist` uma música de cada vez, de propósito: é essa função que
 * sabe escolher versão, escolher tema e recusar repetidas. Duplicar essas regras aqui
 * criava um segundo caminho para a playlist, que mais cedo ou mais tarde divergia do
 * primeiro. O preço é que as perguntas dela aparecem uma vez por música — o que é
 * honesto, porque as respostas são mesmo por música.
 */
async function bibSelAdicionarLoteNaPlaylist() {
  if (!bibSelAtivo()) return;
  const lote = bibSelMusicasDoLote();
  if (!lote.length) return;
  /* `addMusicaNaPlaylist` avisa sobre isto sozinha, mas uma vez por música: com um lote
     de doze seriam doze avisos iguais para dizer a mesma coisa. */
  if (!estadoPainel.cultoId) {
    alert('Selecione primeiro o dia do culto.');
    return;
  }
  const btn = document.getElementById('bib-selecao-add-playlist');
  if (btn) btn.disabled = true;
  try {
    for (const m of lote) {
      // eslint-disable-next-line no-await-in-loop
      await addMusicaNaPlaylist({
        id: m.id,
        titulo: m.titulo,
        artista: m.artista,
        bancoFonte: 'user',
      });
    }
  } finally {
    bibSelCancelarModo();
  }
}

/** Abre a confirmação já existente, adaptada para dizer quantas músicas vão embora. */
function bibSelPedirExclusaoDoLote() {
  if (!bibSelAtivo()) return;
  const lote = bibSelMusicasDoLote();
  if (!lote.length) return;
  if (lote.length === 1) {
    solicitarRemoverMusicaDoBancoServidor(lote[0].id, lote[0].titulo);
    return;
  }
  solicitarRemoverMusicasDoBancoServidorEmLote(lote);
}

export function configurarBarraSelecaoBiblioteca() {
  document
    .getElementById('bib-selecao-add-playlist')
    ?.addEventListener('click', () => void bibSelAdicionarLoteNaPlaylist());
  document
    .getElementById('bib-selecao-excluir')
    ?.addEventListener('click', () => bibSelPedirExclusaoDoLote());
  document
    .getElementById('bib-selecao-cancelar')
    ?.addEventListener('click', () => bibSelCancelarModo());
}

/* ═══════════════════════════════════════════════════════════════════════
   NAVEGADOR ALFABÉTICO DA BIBLIOTECA — régua lateral de atalho por letra

   A lógica pura (que letra cai mais perto, qual está no topo do scroll, qual
   letra o rato está sobrevoando ao arrastar) vive em
   `modules/navegadorAlfabeticoBiblioteca.js`, testável sem DOM nenhum — igual
   ao acordo já feito com `ancoraScrollBiblioteca.js`. Aqui só se mede
   geometria, se mexe no `scrollTop` de `#lista` e se liga/desliga a
   opacidade da régua. Nunca chama `renderizarListaLocal`: saltar de letra é
   só rolagem, a lista já está toda montada.
   ═══════════════════════════════════════════════════════════════════════ */

/** Enquanto verdadeiro (rato ou foco em cima da régua), o temporizador de ocultar não corre. */
let bibNavAlfabetoInteragindo = false;
let bibNavAlfabetoOcultarTimer = null;
let bibNavAlfabetoScrollAgendado = false;
/** Evita repetir o mesmo salto a cada pixel de um arrasto contínuo sobre a mesma letra. */
let bibNavAlfabetoUltimaLetraArrastada = null;

/** Letras (A–Z) que têm pelo menos um grupo visível agora — respeita o filtro em curso. */
function bibNavAlfabetoLetrasDisponiveis() {
  const set = new Set();
  const el = document.getElementById('lista');
  if (!el) return set;
  el.querySelectorAll('.bib-grupo:not([hidden])').forEach((g) => {
    if (g.dataset.bibLetra) set.add(g.dataset.bibLetra);
  });
  return set;
}

/** Cabeçalhos de grupo à mostra, medidos como a âncora de scroll: topo relativo ao topo visível de `#lista`. */
function bibNavAlfabetoCabecalhosMedidos(el) {
  const base = el.getBoundingClientRect().top;
  const cabecalhos = [];
  el.querySelectorAll('.bib-grupo:not([hidden])').forEach((g) => {
    const letra = g.dataset.bibLetra;
    const cab = g.querySelector('.bib-grupo-letra');
    if (!letra || !cab) return;
    const r = cab.getBoundingClientRect();
    cabecalhos.push({ letra, top: r.top - base });
  });
  return cabecalhos;
}

/** Acende, na régua, a letra da região que está no topo da área visível agora. */
function bibNavAlfabetoAtualizarLetraAtual() {
  const el = document.getElementById('lista');
  const nav = document.getElementById('bib-nav-alfabeto');
  if (!el || !nav) return;
  const letra = letraAtualDoScrollBiblioteca({ cabecalhos: bibNavAlfabetoCabecalhosMedidos(el) });
  nav.querySelectorAll('.bib-nav-letra').forEach((btn) => {
    btn.classList.toggle('bib-nav-letra--atual', !!letra && btn.dataset.letra === letra);
  });
}

/**
 * Chamado depois de todo render/filtro da Biblioteca: algumas letras podem ter
 * passado a existir (ou a sumir, com o filtro) desde a última vez.
 */
function bibNavAlfabetoRecalcularDisponibilidade() {
  const nav = document.getElementById('bib-nav-alfabeto');
  if (!nav) return;
  const disponiveis = bibNavAlfabetoLetrasDisponiveis();
  nav.querySelectorAll('.bib-nav-letra').forEach((btn) => {
    btn.classList.toggle('bib-nav-letra--indisponivel', !disponiveis.has(btn.dataset.letra));
  });
  bibNavAlfabetoAtualizarLetraAtual();
}

/** Mostra a régua e adia a sua ocultação — chamado a cada sinal de "o operador está aqui". */
function bibNavAlfabetoMostrar() {
  const nav = document.getElementById('bib-nav-alfabeto');
  if (!nav) return;
  nav.classList.add('bib-nav-alfabeto--visivel');
  clearTimeout(bibNavAlfabetoOcultarTimer);
  bibNavAlfabetoOcultarTimer = setTimeout(() => {
    if (!bibNavAlfabetoInteragindo) nav.classList.remove('bib-nav-alfabeto--visivel');
  }, 1000);
}

/** Rolagem manual: mantém a régua visível e, no máximo uma vez por frame, atualiza a letra acesa. */
function bibNavAlfabetoAoRolar() {
  bibNavAlfabetoMostrar();
  if (bibNavAlfabetoScrollAgendado) return;
  bibNavAlfabetoScrollAgendado = true;
  requestAnimationFrame(() => {
    bibNavAlfabetoScrollAgendado = false;
    bibNavAlfabetoAtualizarLetraAtual();
  });
}

/**
 * Salta a lista até a letra pedida (ou a mais próxima que sobrar dela, se a
 * pedida não tiver música nenhuma agora). Só mexe no `scrollTop` de `#lista`
 * — nunca recarrega nem re-renderiza a Biblioteca.
 *
 * @param {string} letraClicada
 * @param {{ suave?: boolean }} [opts] `suave: false` no arrastar contínuo, para não
 *   empilhar animações a cada pixel — só o clique isolado anima.
 */
function bibNavAlfabetoIrParaLetra(letraClicada, opts) {
  const el = document.getElementById('lista');
  if (!el) return;
  const disponiveis = bibNavAlfabetoLetrasDisponiveis();
  const letra = letraNavegavelMaisProxima({ letra: letraClicada, disponiveis });
  /* Biblioteca vazia ou filtro sem nenhum resultado: não há para onde ir — a régua
     continua ali, só não faz nada, sem quebrar a navegação. */
  if (!letra) return;
  const grupo = el.querySelector(`.bib-grupo[data-bib-letra="${letra}"]:not([hidden])`);
  if (!grupo) return;
  grupo.scrollIntoView({ block: 'start', behavior: opts && opts.suave === false ? 'auto' : 'smooth' });

  const nav = document.getElementById('bib-nav-alfabeto');
  const btn = nav ? nav.querySelector(`.bib-nav-letra[data-letra="${letra}"]`) : null;
  if (btn) {
    btn.classList.add('bib-nav-letra--pressionada');
    setTimeout(() => btn.classList.remove('bib-nav-letra--pressionada'), 260);
  }
  bibNavAlfabetoMostrar();
}

/**
 * Move o único `tabindex="0"` da régua para a letra ativada por rato/toque, para
 * que uma seta de teclado logo a seguir continue dali — o mesmo tabindex móvel
 * já usado na lista principal (ver `bibFocarLinha`), sincronizado aqui porque o
 * clique/arrasto não passa pelo `keydown` que o atualiza nas setas.
 */
function bibNavAlfabetoMoverTabindexPara(nav, letra) {
  nav.querySelectorAll('.bib-nav-letra').forEach((b) => {
    b.tabIndex = b.dataset.letra === letra ? 0 : -1;
  });
}

/** Letra sob uma posição Y da tela, a partir dos retângulos atuais dos botões da régua. */
function bibNavAlfabetoLetraNaPosicaoY(nav, clientY) {
  const botoes = Array.from(nav.querySelectorAll('.bib-nav-letra')).map((b) => {
    const r = b.getBoundingClientRect();
    return { letra: b.dataset.letra, top: r.top, bottom: r.bottom };
  });
  return letraSobPosicaoNavegador({ y: clientY, botoes });
}

export function configurarNavegadorAlfabeticoBiblioteca() {
  const nav = document.getElementById('bib-nav-alfabeto');
  const el = document.getElementById('lista');
  if (!nav || !el) return;

  nav.setAttribute('role', 'toolbar');
  nav.setAttribute('aria-orientation', 'vertical');
  nav.setAttribute('aria-label', 'Navegação alfabética da biblioteca');

  LETRAS_NAVEGADOR_BIBLIOTECA.forEach((letra, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bib-nav-letra';
    btn.dataset.letra = letra;
    btn.textContent = letra;
    /* Tabindex móvel (uma parada só no Tab, setas para percorrer): o mesmo padrão
       já usado na lista principal, ver `bibFocarLinha`. */
    btn.tabIndex = i === 0 ? 0 : -1;
    btn.setAttribute('aria-label', `Ir para músicas com ${letra}`);
    btn.addEventListener('click', () => {
      bibNavAlfabetoMoverTabindexPara(nav, letra);
      bibNavAlfabetoIrParaLetra(letra);
    });
    nav.appendChild(btn);
  });

  const agendarOcultar = () => {
    bibNavAlfabetoInteragindo = false;
    clearTimeout(bibNavAlfabetoOcultarTimer);
    bibNavAlfabetoOcultarTimer = setTimeout(() => nav.classList.remove('bib-nav-alfabeto--visivel'), 400);
  };
  nav.addEventListener('mouseenter', () => {
    bibNavAlfabetoInteragindo = true;
    bibNavAlfabetoMostrar();
  });
  nav.addEventListener('mouseleave', agendarOcultar);
  nav.addEventListener('focusin', () => {
    bibNavAlfabetoInteragindo = true;
    bibNavAlfabetoMostrar();
  });
  nav.addEventListener('focusout', agendarOcultar);

  /* Aproximar o rato da lista já é "estar navegando" — é o gatilho que permite clicar
     numa letra sem ter de rolar primeiro (a régua nasce transparente e sem
     `pointer-events` até este ou o `scroll` a acenderem). */
  el.addEventListener('mousemove', () => bibNavAlfabetoMostrar(), { passive: true });
  el.addEventListener('scroll', bibNavAlfabetoAoRolar, { passive: true });

  /* Arrastar contínuo (rato/toque) sobre a régua: "varre" as letras sem soltar,
     como um índice alfabético de agenda de telefone. */
  let arrastando = false;
  nav.addEventListener('pointerdown', (ev) => {
    arrastando = true;
    bibNavAlfabetoInteragindo = true;
    bibNavAlfabetoUltimaLetraArrastada = null;
    const letra = bibNavAlfabetoLetraNaPosicaoY(nav, ev.clientY);
    if (letra) {
      bibNavAlfabetoUltimaLetraArrastada = letra;
      bibNavAlfabetoMoverTabindexPara(nav, letra);
      bibNavAlfabetoIrParaLetra(letra, { suave: false });
    }
  });
  window.addEventListener('pointermove', (ev) => {
    if (!arrastando) return;
    const letra = bibNavAlfabetoLetraNaPosicaoY(nav, ev.clientY);
    if (!letra || letra === bibNavAlfabetoUltimaLetraArrastada) return;
    bibNavAlfabetoUltimaLetraArrastada = letra;
    bibNavAlfabetoMoverTabindexPara(nav, letra);
    bibNavAlfabetoIrParaLetra(letra, { suave: false });
  });
  window.addEventListener('pointerup', () => {
    if (!arrastando) return;
    arrastando = false;
    agendarOcultar();
  });

  /* Setas percorrem as letras (roving tabindex); Enter/Espaço já vêm de graça do `<button>`. */
  nav.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp' && ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const atual = document.activeElement;
    if (!(atual instanceof HTMLElement) || !atual.classList.contains('bib-nav-letra')) return;
    const botoes = Array.from(nav.querySelectorAll('.bib-nav-letra'));
    const i = botoes.indexOf(atual);
    if (i === -1) return;
    ev.preventDefault();
    const avancar = ev.key === 'ArrowDown' || ev.key === 'ArrowRight';
    const proximo = botoes[Math.max(0, Math.min(botoes.length - 1, i + (avancar ? 1 : -1)))];
    if (proximo === atual) return;
    atual.tabIndex = -1;
    proximo.tabIndex = 0;
    proximo.focus();
  });

  bibNavAlfabetoRecalcularDisponibilidade();
}

/**
 * Linhas visíveis medidas para a âncora: chave e posição de cada uma em relação ao
 * topo visível da lista (mesmo referencial no captar e no restaurar, para as bordas
 * e o padding do contentor se anularem).
 *
 * @param {HTMLElement} el contentor `#lista`
 */
function bibLinhasMedidasParaAncora(el) {
  const base = el.getBoundingClientRect().top;
  const medidas = [];
  for (const linha of bibLinhasVisiveis(el)) {
    const m = bibMusicaDaLinha(linha);
    if (!m) continue;
    const r = linha.getBoundingClientRect();
    medidas.push({
      chave: bibChaveMusica(m.id, linha.dataset.bibFonte),
      top: r.top - base,
      bottom: r.bottom - base,
    });
  }
  return medidas;
}

/**
 * Guarda onde o operador está para o render seguinte lhe devolver a mesma vista.
 *
 * Chamada apenas antes de uma exclusão: é a única operação que reconstrói a lista
 * sem o operador ter pedido para mudar de sítio. Buscar, filtrar ou abrir uma música
 * continuam a mandar no scroll como sempre mandaram.
 */
export function bibGuardarAncoraScrollParaProximoRender() {
  bibAncoraScrollPendente = null;
  const el = document.getElementById('lista');
  /* Painel escondido (Modo Slides): sem geometria não há âncora a medir — e o scroll
     dele também não saiu de zero, logo não há posição nenhuma a devolver. */
  if (!el || !el.clientHeight) return;
  bibAncoraScrollPendente = capturarAncoraScrollBiblioteca({
    scrollTop: el.scrollTop,
    linhas: bibLinhasMedidasParaAncora(el),
  });
}

/**
 * Consome a âncora guardada, se houver.
 *
 * Corre no fim do render — depois de a visibilidade estar aplicada, porque linha
 * escondida não ocupa altura e mediria outro sítio. Sem âncora pendente não toca no
 * scroll, e a âncora vale uma vez só: quem a armou foi uma exclusão concreta.
 */
function bibRestaurarAncoraScrollPendente() {
  const ancora = bibAncoraScrollPendente;
  bibAncoraScrollPendente = null;
  if (!ancora) return;
  const el = document.getElementById('lista');
  if (!el) return;

  const porChave = new Map();
  for (const linha of bibLinhasVisiveis(el)) {
    const m = bibMusicaDaLinha(linha);
    if (!m) continue;
    const chave = bibChaveMusica(m.id, linha.dataset.bibFonte);
    if (!porChave.has(chave)) porChave.set(chave, linha);
  }

  const scrollMaximo = el.scrollHeight - el.clientHeight;
  const chave = escolherChaveRestauroBiblioteca({
    ancora,
    existeChave: (k) => porChave.has(k),
  });
  /* Nem a âncora nem vizinha nenhuma sobrou (um lote levou tudo o que estava à
     mostra): resta o scroll de antes, limitado ao que a lista nova permite. */
  if (!chave) {
    el.scrollTop = clamparScrollTopBiblioteca(ancora.scrollTop, scrollMaximo);
    return;
  }
  const base = el.getBoundingClientRect().top;
  el.scrollTop = scrollTopParaAncoraBiblioteca({
    scrollTop: el.scrollTop,
    topoLinha: porChave.get(chave).getBoundingClientRect().top - base,
    deslocamento: ancora.deslocamento,
    scrollMaximo,
  });
}

function renderizarListaLocal(lista) {
  const el = document.getElementById('lista');
  if (!el) return;

  /* Ordenação no cliente para que os grupos fiquem contíguos: o banco ordena por
     `titulo COLLATE NOCASE`, que só dobra ASCII e atira «Águas» para depois de
     «Zelo» — com separadores, isso abriria um segundo grupo «A» no fim da lista.
     `localeCompare` em pt-BR com `sensitivity: 'base'` põe A e Á lado a lado. */
  listaLocalRenderizada = (Array.isArray(lista) ? lista.slice() : []).sort((a, b) =>
    String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR', {
      sensitivity: 'base',
      numeric: true,
    })
  );

  /* Quem tinha o foco antes de reconstruir. `selecionarMusicaDoBanco` chama
     `refreshListaBanco()`, que passa por aqui: sem isto, clicar numa música
     apagava a linha focada e o Enter a seguir não encontrava linha nenhuma. */
  const focoAnterior = document.activeElement;
  const linhaFocada = focoAnterior instanceof Element ? focoAnterior.closest('#lista .item') : null;
  const chaveFocada = linhaFocada
    ? bibChaveMusica(bibMusicaDaLinha(linhaFocada)?.id, linhaFocada.dataset.bibFonte)
    : null;

  el.innerHTML = '';
  ativarTooltipTextoTruncado('lista');
  const naPlaylist = bibConjuntoMusicasNaPlaylist();
  const frag = document.createDocumentFragment();
  const tplMais = document.createElement('template');
  tplMais.innerHTML = BIB_SVG_MAIS;
  const svgMais = tplMais.content.firstElementChild;
  const tplVisto = document.createElement('template');
  tplVisto.innerHTML = BIB_SVG_VISTO;
  const svgVisto = tplVisto.content.firstElementChild;
  let grupoAtual = null;
  let letraAtual = null;
  let primeiraLinha = null;
  let linhaAtiva = null;

  listaLocalRenderizada.forEach((m, idx) => {
    const rowFonte = fonteBancoNormalizada(m.fonte);

    const letra = bibLetraDeAgrupamento(m.titulo);
    if (letra !== letraAtual) {
      letraAtual = letra;
      grupoAtual = document.createElement('div');
      grupoAtual.className = 'bib-grupo';
      grupoAtual.dataset.bibLetra = letra;
      grupoAtual.setAttribute('role', 'group');
      grupoAtual.setAttribute('aria-label', `Músicas com ${letra}`);
      const cab = document.createElement('div');
      cab.className = 'bib-grupo-letra';
      cab.setAttribute('aria-hidden', 'true');
      cab.textContent = letra;
      grupoAtual.appendChild(cab);
      frag.appendChild(grupoAtual);
    }

    /* Destaque só desta coluna: seleção na Playlist zera `selecaoUiBiblioteca`. */
    const ativo =
      !!estadoPainel.selecaoUiBiblioteca &&
      Number(estadoPainel.selecaoUiBiblioteca.id) === Number(m.id) &&
      estadoPainel.selecaoUiBiblioteca.fonte === rowFonte;
    const jaAdicionada = naPlaylist.has(bibChaveMusica(m.id, rowFonte));

    const div = document.createElement('div');
    div.className = 'item' + (ativo ? ' ativo' : '') + (jaAdicionada ? ' bib-ja-add' : '');
    div.dataset.bibIdx = String(idx);
    div.dataset.bibFonte = rowFonte;
    /* `option` dentro de um `listbox` multi-selecionável: «selecionado» aqui quer
       dizer «está na playlist deste culto». O cursor do teclado não é o
       `aria-selected` — é o foco real, que o leitor de ecrã já anuncia. */
    div.setAttribute('role', 'option');
    div.setAttribute('tabindex', '-1');
    div.setAttribute('aria-selected', jaAdicionada ? 'true' : 'false');
    div.setAttribute('aria-label', bibRotuloAcessivel(m, jaAdicionada));
    div.title =
      'Clique para abrir a música. Pressione Enter ou clique em + para adicionar à playlist.';

    const meta = document.createElement('div');
    const titLinha = document.createElement('div');
    titLinha.className = 'bib-titulo-linha';
    const tit = document.createElement('div');
    tit.className = 'titulo';
    tit.textContent = m.titulo || '';
    titLinha.appendChild(tit);
    const bolinha = bibCriarBolinhaOrigem(m.origem_importacao);
    if (bolinha) titLinha.appendChild(bolinha);
    meta.appendChild(titLinha);
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = rotuloArtistaLista(m.artista);
    meta.appendChild(sub);

    const acoes = document.createElement('div');
    acoes.className = 'item-acoes-banco';
    /* Sem `<button>`: um `option` não pode conter controlos focáveis sem partir a
       semântica do listbox. Para o rato é um alvo de clique; para o teclado o
       equivalente é o Enter. */
    const add = document.createElement('span');
    add.className = 'bib-add';
    add.setAttribute('aria-hidden', 'true');
    if (svgMais) add.appendChild(svgMais.cloneNode(true));
    const visto = document.createElement('span');
    visto.className = 'bib-check';
    visto.setAttribute('aria-hidden', 'true');
    if (svgVisto) visto.appendChild(svgVisto.cloneNode(true));
    acoes.appendChild(add);
    acoes.appendChild(visto);

    div.appendChild(meta);
    div.appendChild(acoes);

    grupoAtual.appendChild(div);
    if (!primeiraLinha) primeiraLinha = div;
    if (ativo && !linhaAtiva) linhaAtiva = div;
  });

  el.appendChild(frag);

  /* Uma única linha entra no Tab: a carregada, se estiver à vista; senão a primeira. */
  const entrada = linhaAtiva || primeiraLinha;
  if (entrada) entrada.setAttribute('tabindex', '0');

  /* Devolve o foco à mesma música, se ela sobreviveu ao filtro. */
  if (chaveFocada) {
    const volta = bibLinhasVisiveis(el).find(
      (l) => bibChaveMusica(bibMusicaDaLinha(l)?.id, l.dataset.bibFonte) === chaveFocada
    );
    if (volta) bibFocarLinha(volta);
  }

  bibGarantirTeclado();
  /* A lista acabou de nascer de novo: sem isto, o modo ficava ligado numa lista sem
     caixas e com chaves a apontar para músicas que já não existem. */
  bibSelAposRender();
  /* Grupos novos = letras novas (ou a mesma lista com outra sorte de filtro):
     o navegador lateral precisa saber outra vez quais existem. */
  bibNavAlfabetoRecalcularDisponibilidade();
}

function camposBuscaBiblioteca(m) {
  if (!m) return { titulo: '', artista: '' };
  if (!m._bibBusca) {
    m._bibBusca = {
      titulo: String(m.titulo || '').toLowerCase(),
      artista: String(m.artista || '').toLowerCase(),
    };
  }
  return m._bibBusca;
}

/** Monta o DOM completo uma vez por revisão de dados — a digitação só esconde linhas. */
function garantirDomBibliotecaCompleto() {
  const el = document.getElementById('lista');
  if (!el) return;
  const domOk =
    bibDomRev === bibDadosRev && (estadoPainel.todasMusicas.length === 0 || el.querySelector('.item'));
  if (domOk) return;
  renderizarListaLocal(estadoPainel.todasMusicas);
  bibDomRev = bibDadosRev;
  bibFiltroQAplicado = null;
}

/**
 * Mostra/esconde linhas já montadas. Recriar a lista a cada tecla era o que
 * congelava o campo: `innerHTML = ''` + N nós + N ouvintes no mesmo turno do `input`.
 */
function aplicarVisibilidadeBiblioteca(predicado, qAplicada) {
  const el = document.getElementById('lista');
  if (!el) return;
  el.querySelectorAll('.bib-grupo').forEach((grupo) => {
    let algum = false;
    grupo.querySelectorAll('.item').forEach((linha) => {
      const m = bibMusicaDaLinha(linha);
      const show = !!(m && predicado(m, linha));
      linha.hidden = !show;
      if (show) algum = true;
    });
    grupo.hidden = !algum;
  });
  const q = qAplicada == null ? '' : String(qAplicada);
  if (q !== bibFiltroQAplicado) {
    el.scrollTop = 0;
    bibFiltroQAplicado = q;
  }
  atualizarEstadoAdicionadasListaLocal();
  el.querySelectorAll('.item').forEach((linha) => {
    const m = bibMusicaDaLinha(linha);
    if (!m) return;
    const rowFonte = fonteBancoNormalizada(linha.dataset.bibFonte);
    const ativo =
      !!estadoPainel.selecaoUiBiblioteca &&
      Number(estadoPainel.selecaoUiBiblioteca.id) === Number(m.id) &&
      estadoPainel.selecaoUiBiblioteca.fonte === rowFonte;
    linha.classList.toggle('ativo', ativo);
  });
  /* Último passo de propósito: as alturas já são as definitivas, e o reset de scroll
     acima (mudança de filtro) já aconteceu — a âncora de uma exclusão vem depois. */
  bibRestaurarAncoraScrollPendente();
  /* O filtro pode ter escondido grupos inteiros (`grupo.hidden` acima): letras que
     tinham música deixam de ter, e o navegador lateral precisa refletir isso. */
  bibNavAlfabetoRecalcularDisponibilidade();
}

export function filtrar() {
  /* Sair do turno do `input` antes de qualquer trabalho: a tecla tem de pintar
     primeiro. Debounce extra só na busca por letra, que vai ao SQLite. */
  const letra = document.getElementById('filtro-busca-letra')?.checked;
  const q = (document.getElementById('busca')?.value || '').trim();
  clearTimeout(filtrarLocalTimer);
  if (filtrarBibliotecaAbort) {
    filtrarBibliotecaAbort.abort();
    filtrarBibliotecaAbort = null;
  }
  const geracao = ++filtrarBibliotecaGeracao;
  const delay = letra && q.length >= 1 ? 220 : 0;
  filtrarLocalTimer = setTimeout(() => {
    void aplicarFiltroBiblioteca(geracao);
  }, delay);
}

async function aplicarFiltroBiblioteca(geracao) {
  if (geracao !== filtrarBibliotecaGeracao) return;
  const titulo = document.getElementById('filtro-busca-titulo').checked;
  const artista = document.getElementById('filtro-busca-artista').checked;
  const letra = document.getElementById('filtro-busca-letra').checked;
  const q = (document.getElementById('busca').value || '').trim();

  garantirDomBibliotecaCompleto();
  if (geracao !== filtrarBibliotecaGeracao) return;

  if (!titulo && !artista && !letra) {
    aplicarVisibilidadeBiblioteca(() => false, q);
    return;
  }

  if (!q) {
    aplicarVisibilidadeBiblioteca(() => true, '');
    return;
  }

  if (!letra) {
    const ql = q.toLowerCase();
    aplicarVisibilidadeBiblioteca((m) => {
      const c = camposBuscaBiblioteca(m);
      return (titulo && c.titulo.includes(ql)) || (artista && c.artista.includes(ql));
    }, q);
    return;
  }

  try {
    const ctl = new AbortController();
    filtrarBibliotecaAbort = ctl;
    const qs = new URLSearchParams({
      q,
      titulo: titulo ? '1' : '0',
      artista: artista ? '1' : '0',
      letra: letra ? '1' : '0',
    });
    const res = await fetch(`${getControllerApiBase()}/api/musicas/buscar?${qs}`, {
      signal: ctl.signal,
    });
    if (geracao !== filtrarBibliotecaGeracao) return;
    const lista = await res.json();
    if (geracao !== filtrarBibliotecaGeracao) return;
    if (!Array.isArray(lista)) {
      aplicarVisibilidadeBiblioteca(() => false, q);
      return;
    }
    const ids = new Set();
    for (const m of lista) {
      if (m && (!m.fonte || m.fonte === 'user')) ids.add(Number(m.id));
    }
    aplicarVisibilidadeBiblioteca((m, linha) => {
      const fonte = fonteBancoNormalizada(linha.dataset.bibFonte);
      return fonte === 'user' && ids.has(Number(m.id));
    }, q);
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.error(e);
    if (geracao === filtrarBibliotecaGeracao) aplicarVisibilidadeBiblioteca(() => false, q);
  } finally {
    if (filtrarBibliotecaAbort && geracao === filtrarBibliotecaGeracao) filtrarBibliotecaAbort = null;
  }
}

export async function buscarLetrasExterno() {
  const q = document.getElementById('busca-letras-q').value.trim();
  const titulo = document.getElementById('filtro-busca-titulo').checked;
  const artista = document.getElementById('filtro-busca-artista').checked;
  const letra = document.getElementById('filtro-busca-letra').checked;
  const fonteAtual = getLetrasSiteFonteAtual();
  const fonteLocal = fonteAtual === 'banco-local';
  const fonteLyraOnline = fonteAtual === 'lyra-online';

  if (!q) {
    return alert(
      fonteLocal || fonteLyraOnline
        ? 'Digite o nome da música/artista ou um trecho da letra'
        : 'Digite o nome da música/artista'
    );
  }
  if (!titulo && !artista && !letra) return alert('Marque pelo menos um critério de busca.');

  if (letrasBuscaAbort) {
    letrasBuscaAbort.abort();
    letrasBuscaAbort = null;
  }
  const geracao = ++letrasBuscaGeracao;
  const ctl = new AbortController();
  letrasBuscaAbort = ctl;
  const vigente = () => geracao === letrasBuscaGeracao;

  if (fonteLocal) {
    const elLista = document.getElementById('lista-internet');
    if (elLista) elLista.innerHTML = '<div class="placeholder-msg">Buscando no banco offline…</div>';
    try {
      const params = new URLSearchParams({
        q,
        titulo: titulo ? '1' : '0',
        artista: artista ? '1' : '0',
        letra: letra ? '1' : '0',
      });
      const res = await fetch(`${getControllerApiBase()}/api/letras/buscar-local?${params}`, {
        signal: ctl.signal,
      });
      if (!vigente()) return;
      const data = await res.json().catch(() => ({}));
      if (!vigente()) return;

      if (!data.sucesso) {
        alert(data.erro || 'Erro ao buscar no banco local');
        resultadosLetrasCache = [];
        renderizarListaInternet([]);
        return;
      }

      if (!data.resultados || data.resultados.length === 0) {
        alert('Nenhuma música encontrada no catálogo offline.');
        resultadosLetrasCache = [];
        renderizarListaInternet([]);
        return;
      }

      resultadosLetrasCache = data.resultados.map((r) => ({
        titulo: r.titulo,
        artista: r.artista,
        path: r.path,
        id: r.id,
        fonte: 'banco-local',
        origem: r.origem === 'user' ? 'user' : 'catalog',
      }));
      renderizarListaInternet(resultadosLetrasCache);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (!vigente()) return;
      alert('Erro de conexão com o banco offline.');
      resultadosLetrasCache = [];
      renderizarListaInternet([]);
    } finally {
      if (letrasBuscaAbort === ctl) letrasBuscaAbort = null;
    }
    return;
  }

  if (fonteLyraOnline) {
    const elLista = document.getElementById('lista-internet');
    if (elLista) elLista.innerHTML = '<div class="placeholder-msg">Buscando no banco online do Lyra…</div>';
    try {
      const params = new URLSearchParams({
        q,
        titulo: titulo ? '1' : '0',
        artista: artista ? '1' : '0',
        letra: letra ? '1' : '0',
        fonte: 'lyra-online',
      });
      const res = await fetch(`${getControllerApiBase()}/api/letras/buscar?${params}`, {
        signal: ctl.signal,
      });
      if (!vigente()) return;
      const data = await res.json().catch(() => ({}));
      if (!vigente()) return;

      if (!res.ok) {
        alert(data.erro || `Erro HTTP ${res.status}`);
        resultadosLetrasCache = [];
        renderizarListaInternet([]);
        return;
      }

      if (data.sucesso && data.resultados && data.resultados.length > 0) {
        resultadosLetrasCache = data.resultados.map((r) => ({
          ...r,
          fonte: 'lyra-online',
        }));
        renderizarListaInternet(resultadosLetrasCache);
      } else {
        alert(data.erro || 'Nenhum resultado encontrado');
        resultadosLetrasCache = [];
        renderizarListaInternet([]);
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (!vigente()) return;
      console.error('Erro na busca:', e);
      alert('Erro ao buscar no banco online do Lyra: ' + e.message);
      resultadosLetrasCache = [];
      renderizarListaInternet([]);
    } finally {
      if (letrasBuscaAbort === ctl) letrasBuscaAbort = null;
    }
    return;
  }

  try {
    const params = new URLSearchParams({
      titulo: q,
      artista: artista ? '1' : '',
      fonte: getLetrasSiteFonteAtual(),
    });
    const res = await fetch(`${getControllerApiBase()}/api/letras/buscar?${params}`, {
      signal: ctl.signal,
    });
    if (!vigente()) return;
    const data = await res.json().catch(() => ({}));
    if (!vigente()) return;

    if (!res.ok) {
      alert(data.erro || `Erro HTTP ${res.status}`);
      resultadosLetrasCache = [];
      renderizarListaInternet([]);
      return;
    }

    if (data.sucesso && data.resultados && data.resultados.length > 0) {
      resultadosLetrasCache = data.resultados;
      renderizarListaInternet(resultadosLetrasCache);
    } else {
      alert(data.erro || 'Nenhum resultado encontrado');
      resultadosLetrasCache = [];
      renderizarListaInternet([]);
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (!vigente()) return;
    console.error('Erro na busca:', e);
    alert('Erro ao buscar letra. Verifique se o Controller está rodando (porta 3001): ' + e.message);
  } finally {
    if (letrasBuscaAbort === ctl) letrasBuscaAbort = null;
  }
}

/**
 * Diálogo de decisão quando o backend responde 409 (música equivalente já
 * existe no banco do usuário). Nada foi gravado até aqui — a escolha do usuário
 * é que define o fluxo.
 *
 * @param {{ existente?: object, titulo?: string, artista?: string }} data Corpo do 409.
 * @returns {Promise<'usar'|'criar'|null>} `null` = cancelar.
 */
async function decidirDuplicidadeMusica(data) {
  const existente = (data && data.existente) || {};
  const tituloExistente = String(existente.titulo || data?.titulo || 'Sem título').trim();
  const artistaExistente = String(existente.artista || '').trim();
  const tituloNovo = String(data?.titulo || '').trim();
  const artistaNovo = String(data?.artista || '').trim();

  const descreve = (t, a) => (a ? `«${t}» — ${a}` : `«${t}»`);
  const linhas = [`Já existe no seu banco: ${descreve(tituloExistente, artistaExistente)}.`];
  // Só mostra o "a importar" quando a grafia difere — é justamente o caso que
  // a comparação normalizada passou a reconhecer.
  if (tituloNovo && (tituloNovo !== tituloExistente || artistaNovo !== artistaExistente)) {
    linhas.push(`A adicionar: ${descreve(tituloNovo, artistaNovo)}.`);
  }
  linhas.push(
    '',
    'Usar a existente: abre a música já salva, sem gravar nada.',
    'Criar mesmo assim: grava uma nova versão ligada à existente; o original não é alterado.'
  );

  return appEscolherOpcao(
    'Música já existe no banco',
    [
      { label: 'Usar a música existente', value: 'usar' },
      { label: 'Criar mesmo assim como nova versão', value: 'criar' },
    ],
    linhas.join('\n'),
    { cancelLabel: 'Cancelar' }
  );
}

/** Abre no editor a música já existente apontada pelo 409, sem gravar nada. */
async function usarMusicaExistenteDoBanco(data) {
  const idExistente = Number(data?.existente?.id);
  if (!Number.isFinite(idExistente)) {
    alert('Não foi possível localizar a música existente no banco.');
    return;
  }
  await carregarMusicas();
  await selecionarMusicaDoBanco(idExistente, {
    fonte: 'user',
    preferirCopia: true,
    origemUi: 'biblioteca',
    abrirEmLetraCompleta: true,
  });
  limparBuscaLetras();
}

export async function importarLetrasParaBanco(path, maxLinhasPorSlide = 4, fonte, decisaoDuplicidade = '') {
  const fonteEnvio = fonteEnvioImportarLetras(fonte);
  try {
    const res = await fetch(`${getControllerApiBase()}/api/letras/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, maxLinhasPorSlide, fonte: fonteEnvio, decisaoDuplicidade }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.duplicado) {
      const escolha = await decidirDuplicidadeMusica(data);
      if (escolha === 'usar') return usarMusicaExistenteDoBanco(data);
      if (escolha === 'criar')
        return importarLetrasParaBanco(path, maxLinhasPorSlide, fonte, 'criar');
      return;
    }
    if (!res.ok) {
      alert(
        res.status === 404
          ? 'API de importação Letras indisponível (HTTP 404). Verifique se o Controlador está em execução (porta 3001).'
          : data.erro || `Erro HTTP ${res.status}`
      );
      return;
    }
    await carregarMusicas();
    await selecionarMusicaDoBanco(data.id, {
      preferirCopia: true,
      origemUi: 'biblioteca',
      abrirEmLetraCompleta: true,
    });
    limparBuscaLetras();
  } catch (e) {
    alert(e.message || 'Falha ao importar.');
  }
}

export async function importarLetrasDoCatalogoParaBanco(catalogId, maxLinhasPorSlide = 4, decisaoDuplicidade = '') {
  try {
    const res = await fetch(`${getControllerApiBase()}/api/letras/importar-do-catalogo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: catalogId, maxLinhasPorSlide, decisaoDuplicidade }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.duplicado) {
      const escolha = await decidirDuplicidadeMusica(data);
      if (escolha === 'usar') return usarMusicaExistenteDoBanco(data);
      if (escolha === 'criar')
        return importarLetrasDoCatalogoParaBanco(catalogId, maxLinhasPorSlide, 'criar');
      return;
    }
    if (!res.ok) {
      alert(data.erro || `Erro HTTP ${res.status}`);
      return;
    }
    await carregarMusicas();
    await selecionarMusicaDoBanco(data.id, {
      preferirCopia: true,
      origemUi: 'biblioteca',
      abrirEmLetraCompleta: true,
    });
    limparBuscaLetras();
  } catch (e) {
    alert(e.message || 'Falha ao importar do catálogo.');
  }
}

export function abrirModalNovaMusicaManual() {
  const tit = document.getElementById('nova-musica-manual-titulo');
  const art = document.getElementById('nova-musica-manual-artista');
  const est = document.getElementById('nova-musica-manual-estrofes');
  if (tit) tit.value = '';
  if (art) art.value = '';
  if (est) est.value = '';
  const bd = document.getElementById('nova-musica-manual-backdrop');
  if (bd) {
    bd.hidden = false;
    bd.setAttribute('aria-hidden', 'false');
  }
  setTimeout(() => tit?.focus(), 30);
}

export function fecharModalNovaMusicaManual() {
  const bd = document.getElementById('nova-musica-manual-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
}

/** Reabre o modal preservando o que já foi digitado (usado ao cancelar o
 *  diálogo de duplicidade — o modal precisa sair da frente porque o
 *  `app-dialog-overlay` fica numa camada abaixo dele). */
function reabrirModalNovaMusicaManual() {
  const bd = document.getElementById('nova-musica-manual-backdrop');
  if (bd) {
    bd.hidden = false;
    bd.setAttribute('aria-hidden', 'false');
  }
}

async function salvarNovaMusicaManualNoServidor(decisaoDuplicidade = '') {
  const titulo = document.getElementById('nova-musica-manual-titulo')?.value.trim() || '';
  const artista = document.getElementById('nova-musica-manual-artista')?.value.trim() || '';
  const raw = document.getElementById('nova-musica-manual-estrofes')?.value || '';
  if (!titulo) return alert('Informe o título da música.');
  const estrofes = splitTextoEmEstrofesPorLinhaVaziaStrict(raw)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (estrofes.length === 0) {
    return alert('Informe pelo menos uma estrofe. Slides separados só com linha totalmente vazia (Enter duplo, sem espaço na linha do meio).');
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titulo, artista, estrofes, decisaoDuplicidade }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.duplicado) {
      fecharModalNovaMusicaManual();
      const escolha = await decidirDuplicidadeMusica(data);
      if (escolha === 'usar') return usarMusicaExistenteDoBanco(data);
      if (escolha === 'criar') return salvarNovaMusicaManualNoServidor('criar');
      // Cancelou: devolve o formulário com o texto preservado.
      reabrirModalNovaMusicaManual();
      return;
    }
    if (!res.ok) {
      alert(data.erro || `Erro HTTP ${res.status}`);
      return;
    }
    fecharModalNovaMusicaManual();
    await carregarMusicas();
    await selecionarMusicaDoBanco(data.id, { preferirCopia: true, origemUi: 'biblioteca' });
  } catch (e) {
    alert(e.message || 'Erro ao criar a música no banco local.');
  }
}

export function configurarModalNovaMusicaManual() {
  const bd = document.getElementById('nova-musica-manual-backdrop');
  if (bd) {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) fecharModalNovaMusicaManual();
    });
  }
  document.getElementById('nova-musica-manual-cancel')?.addEventListener('click', fecharModalNovaMusicaManual);
  document.getElementById('nova-musica-manual-salvar')?.addEventListener('click', () => salvarNovaMusicaManualNoServidor());
}
