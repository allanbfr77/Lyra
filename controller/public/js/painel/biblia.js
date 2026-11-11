/**
 * Modo Bíblia do controlador: seleção de tradução, livros, capítulos e versículos, busca rápida (BNP),
 * projeção do versículo, navegação por teclado, aparência (público e ministrante) e a entrada/saída do modo.
 *
 * Extraído de controllerAppCore.js sem mudar o comportamento. O estado do modo (livro/capítulo/versículo
 * selecionados, parte projetada, cache de capítulos, etapas da busca rápida, configurações de exibição)
 * é privado deste módulo; o núcleo só enxerga as funções exportadas e os pontos de contato no fim do
 * arquivo. As dependências do núcleo (rotas, prévia, projeção, estado do servidor) entram por
 * `registrarDependenciasBiblia`, chamado no topo do núcleo. A regra de envio, a divisão de versículos,
 * o reconhecimento de voz e a rolagem já têm módulos próprios em modules/.
 */
import { LIMITE_DIVISAO_PADRAO, dividirVersiculos, indiceDaParteEquivalente, indicePrimeiraParteDoVersiculo, normalizarLimiteDivisao } from '../modules/dividirVersiculos.js';
import { LS_BIBLIA_CFG, LS_UI_MODO_SLIDES } from '../modules/chavesArmazenamentoLocal.js';
import { appAlert, appEscolherOpcao } from './appDialog.js';
import { bnpNumeroEntradaCompleta } from '../modules/bnpNumeroEntradaCompleta.js';
import { criarReconhecimentoVozBiblia } from '../modules/reconhecimentoVozBiblia.js';
import { deltaScrollListaVersiculos } from '../modules/scrollListaVersiculos.js';
import { escapeHtml } from './textoHtmlSeguro.js';
import { limparOrdemNaoExibirUnificado } from '../modules/ordemNaoExibirUnificado.js';
import { resolverEnvioBiblia } from '../modules/rotaEnvioBiblia.js';
import { enviarPreviewDisplayConfig, getChkVal, salvarSlideCfgNoStorage, setChkVal, setInputVal, setSelVal, setSpanText, slidesAplicarCfgArmazenada } from './configExibicao.js';
import { estadoPainel, projecao } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasBiblia(d) {
  dep = d || {};
}
const aplicarMonitorLembradoAoEntrarNoModo = (...a) => dep.aplicarMonitorLembradoAoEntrarNoModo(...a);
const aplicarRotaDoModoAtualNaUiEServidor = (...a) => dep.aplicarRotaDoModoAtualNaUiEServidor(...a);
const atualizarBtnModoApresentacao = (...a) => dep.atualizarBtnModoApresentacao(...a);
const atualizarBtnTelaInicial = (...a) => dep.atualizarBtnTelaInicial(...a);
const atualizarBtnToggleModoSlides = (...a) => dep.atualizarBtnToggleModoSlides(...a);
const atualizarPreviewOperador = (...a) => dep.atualizarPreviewOperador(...a);
const carregarTraducoes = (...a) => dep.carregarTraducoes(...a);
const definirEstadoBtnModoCabecalho = (...a) => dep.definirEstadoBtnModoCabecalho(...a);
const desativarRotasModosTransitorios = (...a) => dep.desativarRotasModosTransitorios(...a);
const ehModoBibliaOperador = (...a) => dep.ehModoBibliaOperador(...a);
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const executarComTransicaoUi = (...a) => dep.executarComTransicaoUi(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const hayProjecaoApresentacaoModoAtiva = (...a) => dep.hayProjecaoApresentacaoModoAtiva(...a);
const hayProjecaoAtivaModoBibliaOuApresentacao = (...a) => dep.hayProjecaoAtivaModoBibliaOuApresentacao(...a);
const hayProjecaoMidiaApresentacaoAtiva = (...a) => dep.hayProjecaoMidiaApresentacaoAtiva(...a);
const liberarBloqueioUiModos = (...a) => dep.liberarBloqueioUiModos(...a);
const limparUiAoSairDoModoSlides = (...a) => dep.limparUiAoSairDoModoSlides(...a);
const marcarRotaLiveNoDom = (...a) => dep.marcarRotaLiveNoDom(...a);
const mensagemAlvoInvalidoBiblia = (...a) => dep.mensagemAlvoInvalidoBiblia(...a);
const normalizarRota = (...a) => dep.normalizarRota(...a);
const preferenciaMovimentoReduzido = (...a) => dep.preferenciaMovimentoReduzido(...a);
const renderSlidesStrip = (...a) => dep.renderSlidesStrip(...a);
const rotaDesativada = (...a) => dep.rotaDesativada(...a);
const rotaSelecionadaNaUi = (...a) => dep.rotaSelecionadaNaUi(...a);
const salvarRotasPorModoNoStorage = (...a) => dep.salvarRotasPorModoNoStorage(...a);
const salvarRoteamentoTelasNoServidor = (...a) => dep.salvarRoteamentoTelasNoServidor(...a);
const sincronizarCheckboxLembrarMonitor = (...a) => dep.sincronizarCheckboxLembrarMonitor(...a);

/** Tradução escolhida ao entrar no modo Bíblia; só vale nesta janela do controlador (não persiste ao fechar o app). */
let bibliaTraducaoSessao = null;
const SS_BIBLIA_TRADUCAO_SESSAO = 'lyra_biblia_traducao_sessao_v1';

export function obterBibliaTraducaoSessao() {
  if (bibliaTraducaoSessao) return bibliaTraducaoSessao;
  try {
    const codigo = String(sessionStorage.getItem(SS_BIBLIA_TRADUCAO_SESSAO) || '').trim();
    if (codigo) bibliaTraducaoSessao = codigo;
  } catch (_) {
  // intencional — erro ignorado
}
  return bibliaTraducaoSessao;
}

function definirBibliaTraducaoSessao(codigo) {
  const traducao = String(codigo || '').trim();
  bibliaTraducaoSessao = traducao || null;
  try {
    if (bibliaTraducaoSessao) {
      sessionStorage.setItem(SS_BIBLIA_TRADUCAO_SESSAO, bibliaTraducaoSessao);
    } else {
      sessionStorage.removeItem(SS_BIBLIA_TRADUCAO_SESSAO);
    }
  } catch (_) {
  // intencional — erro ignorado
}
  return bibliaTraducaoSessao;
}

export async function fetchListaTraducoesBiblia() {
  const res = await fetch(`${getControllerApiBase()}/api/biblia/traducoes`);
  if (!res.ok) throw new Error('Falha ao carregar traduções da Bíblia');
  return res.json();
}

async function perguntarTraducaoBibliaSeNecessario() {
  const traducaoSessao = obterBibliaTraducaoSessao();
  if (traducaoSessao) return traducaoSessao;
  let lista;
  try {
    lista = await fetchListaTraducoesBiblia();
  } catch (e) {
    console.error('Erro ao carregar traduções', e);
    await appAlert('Não foi possível carregar as traduções da Bíblia.', 'Modo Bíblia');
    return null;
  }
  if (!Array.isArray(lista) || !lista.length) {
    await appAlert('Nenhuma tradução da Bíblia disponível neste servidor.', 'Modo Bíblia');
    return null;
  }
  const escolha = await appEscolherOpcao(
    'Versão da Bíblia',
    lista.map((t) => ({
      label: `${t.traducao} — ${t.nome}`,
      value: t.traducao,
    })),
    'Escolha a tradução para projetar nesta sessão do controlador.\nAo fechar e abrir o app de novo, será perguntado outra vez.',
    { itensEmLista: true }
  );
  if (!escolha) return null;
  return definirBibliaTraducaoSessao(escolha);
}

export function aplicarTraducaoBibliaNoSelect(codigo) {
  const hid = document.getElementById('traducao-sel');
  const wrap = document.getElementById('traducao-sel-dd');
  if (!codigo) return;
  bibliaTraducaoAtual = codigo;
  if (!hid || !wrap) return;
  const item = wrap.querySelector(`.playlist-tema-dd-item[data-value="${CSS.escape(codigo)}"]`);
  if (!item) return;
  hid.value = codigo;
  const label = wrap.querySelector('.playlist-tema-dd-label');
  if (label) label.textContent = item.textContent;
  wrap.querySelectorAll('.playlist-tema-dd-item').forEach((ib) => {
    ib.setAttribute('aria-selected', ib.dataset.value === codigo ? 'true' : 'false');
  });
}

/**
 * Troca da tradução no seletor do modo Bíblia.
 *
 * Trocar de versão é pedir o MESMO texto noutras palavras — não é recomeçar. Antes isto
 * largava livro, capítulo e versículo e devolvia o operador à grade dos 66 livros: a meio
 * de uma leitura em João 10, comparar duas versões custava refazer toda a navegação.
 * Agora fica-se onde se estava e só o conteúdo muda.
 *
 * Com um versículo no ar, a projecção acompanha: quem trocou a versão quer o mesmo
 * versículo na versão nova, e deixar o têão na anterior seria mostrar uma coisa enquanto o
 * painel diz outra.
 *
 * Sem livro ou capítulo escolhidos não há nada a preservar, e o caminho é o de sempre.
 */
export async function onTraducaoBibliaChange() {
  const cod = (document.getElementById('traducao-sel')?.value || '').trim();
  if (!cod) return;
  definirBibliaTraducaoSessao(cod);
  bibliaTraducaoAtual = cod;
  bibliaCapsRequestSeq++;
  bibliaVersiculosRequestSeq++;
  bibliaPrefetchCapJob++;
  /* O cache é por tradução na chave, mas os capítulos vizinhos já lá dentro são da versão
     que se acabou de deixar: sem utilidade e a ocupar memória. */
  bibliaCapituloCache.clear();

  const livro = bibliaSelecionadoLivro;
  const livroDb = bibliaSelecionadoLivroDb;
  const cap = bibliaSelecionadoCap;

  /* Nada aberto: caminho de sempre — os 66 livros e o painel limpo. */
  if (!livro) {
    bibliaSelecionadoLivro = null;
    bibliaSelecionadoLivroDb = null;
    bibliaSelecionadoCap = null;
    popularGradeLivros();
    bibliaReporPainelNavegacao();
    return;
  }

  /* Livro aberto mas ainda sem capítulo: também é navegação em curso. O livro fica, a
     lista de capítulos é a da versão nova. */
  if (!cap) {
    popularGradeLivros();
    await bibliaCarregarCaps(livroDb || livro);
    return;
  }

  /* Lido ANTES de recarregar: `bibliaCarregarVersiculos` zera os dois e substitui a lista. */
  const selecionadoAntes = bibliaVersiculosCapitulo[bibliaVersiculoSelecionadoIdx] || null;
  const projetadoAntes =
    bibliaParteProjetadaChave != null
      ? bibliaVersiculosCapitulo.find((v) => v?.chave === bibliaParteProjetadaChave) || null
      : null;

  /* Duas trocas em sequência rápida: o pedido antigo não pode restaurar seleção nem
     projetar por cima do novo. As funções de carregamento já se protegem por sequência;
     isto protege o que corre entre elas, aqui. */
  const aindaNesta = () => bibliaTraducaoAtual === cod;

  popularGradeLivros();
  await bibliaCarregarCaps(livroDb || livro);
  if (!aindaNesta()) return;

  /* A grade de capítulos é redesenhada do zero e o realce vive no botão; sem isto o
     capítulo continuava carregado mas sem ninguém marcado na coluna. */
  const btnCap = document.querySelector(`.biblia-cap-btn[data-cap="${cap}"]`);
  document.querySelectorAll('.biblia-cap-btn').forEach((b) => {
    b.classList.toggle('selecionado', b === btnCap);
  });
  if (!btnCap) {
    /* A versão nova não tem este capítulo: fica no livro, sem inventar uma leitura que
       não existe ali. */
    bibliaSelecionadoCap = null;
    const colVers = document.getElementById('biblia-col-versiculos');
    if (colVers) colVers.innerHTML = '<div class="biblia-placeholder">← Selecione um capítulo</div>';
    return;
  }
  if (btnCap.scrollIntoView) btnCap.scrollIntoView({ block: 'nearest' });

  await bibliaCarregarVersiculos();
  if (!aindaNesta()) return;

  const idxSelecionado = selecionadoAntes
    ? indiceDaParteEquivalente(
        bibliaVersiculosCapitulo,
        selecionadoAntes.versiculo,
        selecionadoAntes.parteIndice
      )
    : -1;
  if (idxSelecionado >= 0) {
    bibliaVersiculoSelecionadoIdx = idxSelecionado;
    const card = document.querySelector(`.biblia-v-card[data-indice="${idxSelecionado}"]`);
    if (card) {
      card.classList.add('selecionado');
      bibliaRolarListaParaContextoDoFoco(card);
    }
  }

  if (!projetadoAntes) return;
  const idxProjetado = indiceDaParteEquivalente(
    bibliaVersiculosCapitulo,
    projetadoAntes.versiculo,
    projetadoAntes.parteIndice
  );
  if (idxProjetado < 0) return;
  const parteNova = bibliaVersiculosCapitulo[idxProjetado];
  const cardProjetado = document.querySelector(`.biblia-v-card[data-indice="${idxProjetado}"]`);
  await bibliaProjetarVersiculo(parteNova, cardProjetado);
}

export async function alternarModoBiblia() {
  const ativo = document.body.classList.contains('app-mod-biblia');
  /* Slide → Bíblia: só troca de aba. A projeção de slides, se existir, permanece. */
  const vinhaDoModoSlides = !ativo && ehModoSlidesOperador();
  if (!ativo) {
    /* Estado da sessão (livro/cap/versículo) sobrevive à saída do modo — inclusive sem projeção. */
    const preservarNav = !!bibliaSelecionadoLivro;
    /* Sem estado a preservar: abre sempre com os 66 livros e painel vazio. */
    if (!preservarNav) {
      bibliaFiltroTestamento = null;
    }
    const trad = await perguntarTraducaoBibliaSeNecessario();
    if (!trad) return;
    await carregarTraducoes();
    aplicarTraducaoBibliaNoSelect(trad);
    if (preservarNav) {
      /* DOM de caps/versículos sobrevive à troca de modo; só re-sincroniza o destaque. */
      bibliaAtualizarDestaqueGradeLivros();
    } else {
      bibliaReporPainelNavegacao();
    }
  }
  executarComTransicaoUi(() => {
    document.body.classList.remove('app-mod-slides', 'app-mod-apresentacao', 'app-mod-docs');
    if (!ativo) {
      salvarSlideCfgNoStorage();
      document.body.classList.add('app-mod-biblia');
      document.title = 'Lyra — Modo Bíblia';
      if (vinhaDoModoSlides) {
        try { localStorage.setItem(LS_UI_MODO_SLIDES, '0'); } catch (_) {
          // intencional — erro ignorado
        }
        limparUiAoSairDoModoSlides();
        renderSlidesStrip();
        atualizarPreviewOperador();
      }
      carregarBibliaCfgDoStorage();
      if (hayProjecaoMidiaApresentacaoAtiva()) {
        /* Canal partilhado: adopta monitores da mídia ainda no ar — não os desativa. */
        estadoPainel.rotasPorModo.biblia = { ...normalizarRota(estadoPainel.rotasPorModo.apresentacao) };
      } else if (!hayProjecaoAtivaModoBibliaOuApresentacao()) {
        estadoPainel.rotasPorModo.biblia = rotaDesativada();
        marcarRotaLiveNoDom(false);
        /* Slides no ar: limpar rota partilhada residual para o merge do servidor não
           preferir `apresentacao` vazio e apagar a letra nos monitores. */
        if (estadoPainel.projecaoMusicaEmitidaNoServidor && !hayProjecaoApresentacaoModoAtiva()) {
          estadoPainel.rotasPorModo.apresentacao = rotaDesativada();
        }
      }
      /* Entrar num modo não é escolher «Não exibir»: a ordem do operador não sobrevive à
         troca de ecrã. Ver `modules/ordemNaoExibirUnificado.js`. */
      limparOrdemNaoExibirUnificado();
      aplicarMonitorLembradoAoEntrarNoModo('biblia');
      sincronizarCheckboxLembrarMonitor();
      bibliaAplicarCfgExibicao();
      bibliaRotaSyncServidorChave = null;
      aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: true });
      bibliaRotaSyncServidorChave = bibliaChaveRotaAtual();
    } else {
      document.body.classList.remove('app-mod-biblia');
      document.title = 'Lyra — Controlador';
      bibliaSairModo();
      liberarBloqueioUiModos();
      /* Navegação não encerra projeção: sem `forcar`, rotas com Bíblia/mídia no ar ficam. */
      void desativarRotasModosTransitorios({ sincronizarServidor: true });
      aplicarRotaDoModoAtualNaUiEServidor({ sincronizarServidor: false });
    }
    atualizarBtnModoBiblia();
    atualizarBtnToggleModoSlides();
    atualizarBtnModoApresentacao();
    if (!ativo) {
      dep.getReconhecimentoVozSlides().aoSairModoSlides();
      reconhecimentoVozBiblia.aoEntrarModoBiblia();
    } else {
      reconhecimentoVozBiblia.aoSairModoBiblia();
      dep.getReconhecimentoVozSlides().atualizarUi();
    }
  });
}

export function atualizarBtnModoBiblia() {
  definirEstadoBtnModoCabecalho(
    'btn-modo-biblia',
    document.body.classList.contains('app-mod-biblia'),
    'MODO BÍBLIA (ativo) — voltar à tela inicial',
    'Entrar no MODO BÍBLIA',
  );
  atualizarBtnTelaInicial();
}

/* ═══════════════════════════════════════════════
   MODO BÍBLIA — dados
   ═══════════════════════════════════════════════ */
/** Nove grupos canônicos (índice final inclusivo em `LIVROS`). */
export const BIBLIA_GRUPOS = [
  { id: 'pent', label: 'Pentateuco', cor: '#3F2F13', textoClaro: true, fim: 4 },
  { id: 'hist', label: 'Históricos', cor: '#BE532D', textoClaro: true, fim: 16 },
  { id: 'poet', label: 'Poéticos', cor: '#B81450', textoClaro: true, fim: 21 },
  { id: 'pmay', label: 'Prof. maiores', cor: '#522182', textoClaro: true, fim: 26 },
  { id: 'pmen', label: 'Prof. menores', cor: '#AF1DA6', textoClaro: true, fim: 38 },
  { id: 'evan', label: 'Evangelhos + Atos', cor: '#0C60DF', textoClaro: true, fim: 43 },
  { id: 'paul', label: 'Epístolas de Paulo', cor: '#085E41', textoClaro: true, fim: 57 },
  { id: 'gera', label: 'Epístolas gerais', cor: '#096771', textoClaro: true, fim: 64 },
  { id: 'apoc', label: 'Apocalipse', cor: '#2A5408', textoClaro: true, fim: 65 },
];

export function bibliaGrupoPorIndiceLivro(idx) {
  const i = Math.max(0, Math.min(idx, LIVROS.length - 1));
  return BIBLIA_GRUPOS.find((g) => i <= g.fim) || BIBLIA_GRUPOS[BIBLIA_GRUPOS.length - 1];
}

export function bibliaGrupoPorLivro(livro) {
  const idx = LIVROS.findIndex((l) => l.nome === livro.nome);
  return bibliaGrupoPorIndiceLivro(idx >= 0 ? idx : 0);
}

export function bibliaCorTextoGrupo(grupo) {
  return grupo.textoClaro ? '#ffffff' : '#1a1a1a';
}

function bibliaAplicarEstiloGrupoNoElemento(el, grupo) {
  if (!el || !grupo) return;
  el.style.backgroundColor = grupo.cor;
  el.style.color = bibliaCorTextoGrupo(grupo);
}

export const LIVROS = [
  { nome: 'Gênesis', sigla: 'Gn', nt: false }, { nome: 'Êxodo', sigla: 'Ex', nt: false },
  { nome: 'Levítico', sigla: 'Lv', nt: false }, { nome: 'Números', sigla: 'Nm', nt: false },
  { nome: 'Deuteronômio', sigla: 'Dt', nt: false }, { nome: 'Josué', sigla: 'Js', nt: false },
  { nome: 'Juízes', sigla: 'Jz', nt: false }, { nome: 'Rute', sigla: 'Rt', nt: false },
  { nome: '1 Samuel', sigla: '1Sm', nt: false }, { nome: '2 Samuel', sigla: '2Sm', nt: false },
  { nome: '1 Reis', sigla: '1Rs', nt: false }, { nome: '2 Reis', sigla: '2Rs', nt: false },
  { nome: '1 Crônicas', sigla: '1Cr', nt: false }, { nome: '2 Crônicas', sigla: '2Cr', nt: false },
  { nome: 'Esdras', sigla: 'Ed', nt: false }, { nome: 'Neemias', sigla: 'Ne', nt: false },
  { nome: 'Ester', sigla: 'Et', nt: false }, { nome: 'Jó', sigla: 'Jó', nt: false },
  { nome: 'Salmos', sigla: 'Sl', nt: false }, { nome: 'Provérbios', sigla: 'Pv', nt: false },
  { nome: 'Eclesiastes', sigla: 'Ec', nt: false }, { nome: 'Cantares', dbNome: 'Cânticos', sigla: 'Ct', nt: false },
  { nome: 'Isaías', sigla: 'Is', nt: false }, { nome: 'Jeremias', sigla: 'Jr', nt: false },
  { nome: 'Lamentações', sigla: 'Lm', nt: false }, { nome: 'Ezequiel', sigla: 'Ez', nt: false },
  { nome: 'Daniel', sigla: 'Dn', nt: false }, { nome: 'Oséias', sigla: 'Os', nt: false },
  { nome: 'Joel', sigla: 'Jl', nt: false }, { nome: 'Amós', sigla: 'Am', nt: false },
  { nome: 'Obadias', sigla: 'Ob', nt: false }, { nome: 'Jonas', sigla: 'Jn', nt: false },
  { nome: 'Miquéias', sigla: 'Mq', nt: false }, { nome: 'Naum', sigla: 'Na', nt: false },
  { nome: 'Habacuque', sigla: 'Hc', nt: false }, { nome: 'Sofonias', sigla: 'Sf', nt: false },
  { nome: 'Ageu', sigla: 'Ag', nt: false }, { nome: 'Zacarias', sigla: 'Zc', nt: false },
  { nome: 'Malaquias', sigla: 'Ml', nt: false },
  { nome: 'Mateus', sigla: 'Mt', nt: true }, { nome: 'Marcos', sigla: 'Mc', nt: true },
  { nome: 'Lucas', sigla: 'Lc', nt: true }, { nome: 'João', sigla: 'Jo', nt: true },
  { nome: 'Atos', dbNome: 'Atos dos Apóstolos', sigla: 'At', nt: true }, { nome: 'Romanos', sigla: 'Rm', nt: true },
  { nome: '1 Coríntios', sigla: '1Co', nt: true }, { nome: '2 Coríntios', sigla: '2Co', nt: true },
  { nome: 'Gálatas', sigla: 'Gl', nt: true }, { nome: 'Efésios', sigla: 'Ef', nt: true },
  { nome: 'Filipenses', sigla: 'Fp', nt: true }, { nome: 'Colossenses', sigla: 'Cl', nt: true },
  { nome: '1 Tessalonicenses', sigla: '1Ts', nt: true }, { nome: '2 Tessalonicenses', sigla: '2Ts', nt: true },
  { nome: '1 Timóteo', sigla: '1Tm', nt: true }, { nome: '2 Timóteo', sigla: '2Tm', nt: true },
  { nome: 'Tito', sigla: 'Tt', nt: true }, { nome: 'Filemom', sigla: 'Fm', nt: true },
  { nome: 'Hebreus', sigla: 'Hb', nt: true }, { nome: 'Tiago', sigla: 'Tg', nt: true },
  { nome: '1 Pedro', sigla: '1Pe', nt: true }, { nome: '2 Pedro', sigla: '2Pe', nt: true },
  { nome: '1 João', sigla: '1Jo', nt: true }, { nome: '2 João', sigla: '2Jo', nt: true },
  { nome: '3 João', sigla: '3Jo', nt: true }, { nome: 'Judas', sigla: 'Jd', nt: true },
  { nome: 'Apocalipse', sigla: 'Ap', nt: true },
];

/** Navega na UI do modo Bíblia e projeta o versículo (voz / referência). */
async function bibliaNavegarEProjetarPorReferencia(livroNome, capitulo, versiculo) {
  const livro = LIVROS.find((l) => l.nome === livroNome);
  if (!livro || !ehModoBibliaOperador()) return false;
  const traducao = document.getElementById('traducao-sel')?.value;
  if (!traducao) return false;
  const livroDbRef = bibliaLivroNomeDb(livro);
  try {
    const resCap = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroDbRef)}/caps`
    );
    if (!resCap.ok) return false;
    const { total: totalCaps } = await resCap.json();
    if (capitulo < 1 || capitulo > totalCaps) return false;

    /* Este fetch só confirma que a referência existe. O que se projeta vem sempre de
       `bibliaVersiculosCapitulo` — que já está dividido em partes; projetar o resultado
       deste fetch mandaria o versículo inteiro enquanto o seletor mostra as partes. */
    const resVer = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroDbRef)}/${capitulo}`
    );
    if (!resVer.ok) return false;
    const versiculos = await resVer.json();
    if (!versiculos.some((item) => item.versiculo === versiculo)) return false;

    await bibliaEscolherLivro(livro);
    const capBtn = document.querySelector(`.biblia-cap-btn[data-cap="${capitulo}"]`);
    if (!capBtn) return false;
    await bibliaEscolherCap(capitulo, capBtn);
    /* Voz e referência levam sempre à primeira parte do versículo. */
    const idx = indicePrimeiraParteDoVersiculo(bibliaVersiculosCapitulo, versiculo);
    const v = idx >= 0 ? bibliaVersiculosCapitulo[idx] : null;
    if (!v) return false;
    const card = bibliaMarcarVersiculoNaUi(v, idx);
    await bibliaProjetarVersiculo(v, card);
    return true;
  } catch (_) {
    return false;
  }
}

export const reconhecimentoVozBiblia = criarReconhecimentoVozBiblia({
  ehModoBiblia: ehModoBibliaOperador,
  livros: LIVROS,
  navegarEProjetarVersiculo: (ref) =>
    bibliaNavegarEProjetarPorReferencia(ref.livro, ref.capitulo, ref.versiculo),
});

/**
 * Filtro de testamento da grade de livros: `null` (todos), `'at'` ou `'nt'`.
 *
 * Nasce e volta sempre a `null` ao sair (e de novo ao entrar) do modo: o filtro é
 * um gesto do operador para aquele momento, não uma preferência. Guardá-lo entre
 * visitas abriria o modo Bíblia com metade dos livros escondidos sem ninguém ter
 * pedido — e a leitura que se procura durante um culto tanto pode estar num
 * testamento como no outro.
 *
 * A separação já existe em `LIVROS` (o campo `nt` de cada livro, 39 contra 27), por
 * isso não há aqui uma segunda lista de nomes a divergir da primeira.
 */
let bibliaFiltroTestamento = null;

let bibliaSelecionadoLivro = null;
let bibliaSelecionadoLivroDb = null;
let bibliaSelecionadoCap = null;
let bibliaTraducaoAtual = null;
/**
 * `chave` da parte que está no ar (ver `modules/dividirVersiculos.js`), ou `null`.
 *
 * Guarda a chave da **parte**, não o número do versículo: com a divisão ligada, duas
 * partes do mesmo versículo têm o mesmo número, e comparar números faria o controlador
 * julgar que nada mudou ao passar da parte 1 para a parte 2 — reenviando a configuração
 * de exibição inteira (com `bgImage` em base64) a cada parte.
 */
let bibliaParteProjetadaChave = null;
let bibliaVersiculoSelecionadoIdx = null;
let bnpEtapa = 'livro';
let bnpLivroSelecionado = null;
let bnpCapSelecionado = null;
let bnpDigitando = '';
let bnpFocoIndex = -1;
let bnpTotalCaps = 0;
let bnpTotalVers = 0;
/** Evita PUT /api/display-routing (reabria janelas) em cada versículo projetado. */
let bibliaRotaSyncServidorChave = null;
/**
 * **Partes** do capítulo actual (memória — navegação por setas sem novo fetch).
 *
 * Fonte única do seletor E da projeção. Já vem dividido por
 * `bibliaRederivarPartesCapitulo()`; com a opção de divisão desligada há exactamente uma
 * parte por versículo. Nem o render nem `bibliaProjetarVersiculo` dividem seja o que for.
 */
let bibliaVersiculosCapitulo = [];
/** Versículos inteiros do capítulo actual, como vieram da API — origem da re-derivação. */
let bibliaVersiculosBrutosCapitulo = [];
/** Cache de capítulos adjacentes pré-carregados: `${trad}|${livro}|${cap}` → versículos[]. */
const bibliaCapituloCache = new Map();
let bibliaPrefetchCapJob = 0;
let bibliaCapsRequestSeq = 0;
let bibliaVersiculosRequestSeq = 0;

export function bibliaNormalizarCampoReferencia(valor) {
  if (valor == null) return '';
  const texto = String(valor).trim();
  if (!texto) return '';
  const lower = texto.toLowerCase();
  return lower === 'null' || lower === 'undefined' ? '' : texto;
}

export function bibliaLivroNomeDb(livro) {
  if (livro && typeof livro === 'object' && !Array.isArray(livro)) {
    return String(livro.dbNome || livro.nome || '').trim();
  }
  const nome = String(livro || '').trim();
  if (!nome) return '';
  const meta = LIVROS.find((item) => item.nome === nome);
  return String(meta?.dbNome || meta?.nome || nome).trim();
}

function bibliaAnexarReferenciaVersiculos(versiculos, livro, capitulo) {
  if (!Array.isArray(versiculos)) return [];
  const livroRef = bibliaNormalizarCampoReferencia(livro);
  const capRef = bibliaNormalizarCampoReferencia(capitulo);
  return versiculos.map((item) => ({
    ...(item && typeof item === 'object' ? item : {}),
    livro: livroRef || bibliaNormalizarCampoReferencia(item?.livro),
    capitulo: bibliaNormalizarCampoReferencia(item?.capitulo) || capRef,
    versiculo: bibliaNormalizarCampoReferencia(item?.versiculo),
    texto: item?.texto != null ? String(item.texto) : '',
  }));
}

const BIBLIA_CFG_EXIBICAO_PADRAO = {
  fontSize: 5.5,
  fontFamily: 'CMG Sans, sans-serif',
  lineSpacing: 1.4,
  wrapLongLines: true,
  bgType: 'solid',
  bgColor: '#000000',
  bgGradientFrom: '#000000',
  bgGradientTo: '#161616',
  bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
  bgImage: '',
  textColor: '#ffffff',
  negrito: true,
  maiusculo: false,
  textAlign: 'center',
  posX: 'center',
  posY: 'center',
  refMostrar: true,
  refFontSize: 1.8,
  refColor: '#fbf904',
};

let bibliaCfgExibicao = { ...BIBLIA_CFG_EXIBICAO_PADRAO };

const BIBLIA_CFG_MINISTRANTE_PADRAO = {
  fontSize: 4.1,
  fontFamily: 'CMG Sans, sans-serif',
  lineSpacing: 1.35,
  wrapLongLines: true,
  negrito: true,
  maiusculo: false,
  autoFitLongLines: false,
  bgType: 'solid',
  bgColor: '#000000',
  bgGradientFrom: '#000000',
  bgGradientTo: '#161616',
  bgGradient: 'linear-gradient(135deg, #000000 0%, #161616 100%)',
  bgImage: '',
  textColorAtual: '#ffffff',
  textColorProximo: '#f3c15a',
  posX: 'center',
  posY: 'center',
  refMostrar: true,
  refFontSize: 1.7,
  refColor: '#fbf904',
};

let bibliaCfgMinistrante = { ...BIBLIA_CFG_MINISTRANTE_PADRAO };

/**
 * Leitura — opções que não são de um canal, mas do modo Bíblia inteiro.
 *
 * A divisão de versículos longos afeta o telão, o ministrante e o seletor do operador ao
 * mesmo tempo; por isso não cabe em `exibicao` nem em `ministrante`. Nasce desligada: JSON
 * antigo sem `leitura` cai nos padrões e nenhuma instalação muda de comportamento.
 */
const BIBLIA_CFG_LEITURA_PADRAO = {
  dividirVersiculosLongos: false,
  limiteCaracteres: LIMITE_DIVISAO_PADRAO,
};

let bibliaCfgLeitura = { ...BIBLIA_CFG_LEITURA_PADRAO };

function bibliaMesclarCfgSalva(salva) {
  if (!salva || typeof salva !== 'object') return;
  if (salva.exibicao && typeof salva.exibicao === 'object') {
    bibliaCfgExibicao = { ...BIBLIA_CFG_EXIBICAO_PADRAO, ...salva.exibicao };
  }
  if (salva.ministrante && typeof salva.ministrante === 'object') {
    bibliaCfgMinistrante = { ...BIBLIA_CFG_MINISTRANTE_PADRAO, ...salva.ministrante };
  }
  if (salva.leitura && typeof salva.leitura === 'object') {
    bibliaCfgLeitura = { ...BIBLIA_CFG_LEITURA_PADRAO, ...salva.leitura };
  }
  bibliaCfgLeitura.dividirVersiculosLongos = bibliaCfgLeitura.dividirVersiculosLongos === true;
  bibliaCfgLeitura.limiteCaracteres = normalizarLimiteDivisao(bibliaCfgLeitura.limiteCaracteres);
}

export function carregarBibliaCfgDoStorage() {
  try {
    const raw = localStorage.getItem(LS_BIBLIA_CFG);
    if (!raw) return;
    bibliaMesclarCfgSalva(JSON.parse(raw));
    bibliaMesclarGradienteSalvo(bibliaCfgExibicao, BIBLIA_CFG_EXIBICAO_PADRAO);
    bibliaMesclarGradienteSalvo(bibliaCfgMinistrante, BIBLIA_CFG_MINISTRANTE_PADRAO);
  } catch (_) {
  // intencional — erro ignorado
}
}

export function salvarBibliaCfgNoStorage() {
  try {
    localStorage.setItem(
      LS_BIBLIA_CFG,
      JSON.stringify({
        exibicao: bibliaCfgExibicao,
        ministrante: bibliaCfgMinistrante,
        leitura: bibliaCfgLeitura,
      })
    );
  } catch (_) {
  // intencional — erro ignorado
}
}

export function bibliaGradienteCss(camada) {
  const a = camada.bgGradientFrom || '#000000';
  const b = camada.bgGradientTo || '#161616';
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function bibliaMesclarGradienteSalvo(camada, padrao) {
  if (camada.bgGradientFrom && camada.bgGradientTo) return;
  const m = String(camada.bgGradient || '').match(/#[0-9a-fA-F]{3,8}/g);
  if (m && m.length >= 2) {
    camada.bgGradientFrom = m[0];
    camada.bgGradientTo = m[1];
  } else {
    camada.bgGradientFrom = padrao.bgGradientFrom;
    camada.bgGradientTo = padrao.bgGradientTo;
  }
}

export function bibliaSanitizarCamada(camada) {
  const out = { ...camada };
  if (out.bgType !== 'image') out.bgImage = '';
  if (out.bgType === 'gradient') out.bgGradient = bibliaGradienteCss(out);
  return out;
}

/** Fundo no payload: só envia bgImage quando há data URL — evita apagar imagem no servidor. */
function bibliaFundoParaPayload(camada) {
  const c = bibliaSanitizarCamada(camada);
  const fundo = {
    bgType: c.bgType || 'solid',
    bgColor: c.bgColor,
    bgGradient: c.bgGradient,
  };
  if (c.bgType === 'image') {
    if (c.bgImage && String(c.bgImage).length > 0) fundo.bgImage = c.bgImage;
  } else {
    fundo.bgImage = '';
  }
  return fundo;
}

function bibliaAtualizarPreviewFundo(alvo) {
  const prefix = alvo === 'ministrante' ? 'cfg-biblia-min' : 'cfg-biblia-pub';
  const cfg = alvo === 'ministrante' ? bibliaCfgMinistrante : bibliaCfgExibicao;
  const prev = document.getElementById(`${prefix}-bg-preview-ctrl`);
  if (!prev) return;
  const tipo = cfg.bgType || 'solid';
  prev.style.backgroundImage = '';
  prev.style.backgroundColor = '';
  if (tipo === 'image' && cfg.bgImage) {
    prev.style.backgroundImage = `url(${cfg.bgImage})`;
    prev.style.backgroundColor = 'var(--surface2)';
  } else if (tipo === 'gradient') {
    const from = cfg.bgGradientFrom || '#000000';
    const to = cfg.bgGradientTo || '#161616';
    prev.style.backgroundImage = `linear-gradient(135deg, ${from}, ${to})`;
  } else {
    prev.style.backgroundColor = cfg.bgColor || '#000000';
  }
}

function bibliaAtualizarVisibilidadeFundo(alvo) {
  const prefix = alvo === 'ministrante' ? 'cfg-biblia-min' : 'cfg-biblia-pub';
  const cfg = alvo === 'ministrante' ? bibliaCfgMinistrante : bibliaCfgExibicao;
  const val = cfg.bgType || 'solid';
  const solid = document.getElementById(`${prefix}-bg-solid-ctrl`);
  const grad = document.getElementById(`${prefix}-bg-gradient-wrap-ctrl`);
  const img = document.getElementById(`${prefix}-bg-image-wrap-ctrl`);
  if (solid) solid.style.display = val === 'solid' ? '' : 'none';
  if (grad) grad.style.display = val === 'gradient' ? '' : 'none';
  if (img) img.style.display = val === 'image' ? '' : 'none';
  bibliaAtualizarPreviewFundo(alvo);
}

function setBibliaPosCtrlBtn(alvo, axis, val) {
  const prefix = alvo === 'ministrante' ? 'cfg-biblia-min' : 'cfg-biblia-pub';
  const groupId = axis === 'posX' ? `${prefix}-posx-ctrl-group` : `${prefix}-posy-ctrl-group`;
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.cfg-btn-pos').forEach((b) => {
    b.classList.toggle('ativo', b.dataset.val === val);
  });
}

export function setBibliaPosCtrl(alvo, axis, val) {
  const cfg = alvo === 'ministrante' ? bibliaCfgMinistrante : bibliaCfgExibicao;
  cfg[axis] = val;
  setBibliaPosCtrlBtn(alvo, axis, val);
  bibliaAplicarCfgExibicao();
}

export function onBibliaPublicoBgTypeCtrlChange() {
  const val = document.getElementById('cfg-biblia-pub-bg-type-ctrl')?.value || 'solid';
  bibliaCfgExibicao.bgType = val;
  if (val !== 'image') bibliaCfgExibicao.bgImage = '';
  bibliaAtualizarVisibilidadeFundo('publico');
  bibliaAplicarCfgExibicao();
}

export function onBibliaMinistranteBgTypeCtrlChange() {
  const val = document.getElementById('cfg-biblia-min-bg-type-ctrl')?.value || 'solid';
  bibliaCfgMinistrante.bgType = val;
  if (val !== 'image') bibliaCfgMinistrante.bgImage = '';
  bibliaAtualizarVisibilidadeFundo('ministrante');
  bibliaAplicarCfgExibicao();
}

export function lerBibliaCfgDoFormularioPublico() {
  const pub = bibliaCfgExibicao;
  pub.bgType = document.getElementById('cfg-biblia-pub-bg-type-ctrl')?.value || pub.bgType || 'solid';
  pub.bgColor = document.getElementById('cfg-biblia-pub-bg-color-ctrl')?.value || pub.bgColor;
  pub.bgGradientFrom =
    document.getElementById('cfg-biblia-pub-bg-gradient-from-ctrl')?.value || pub.bgGradientFrom;
  pub.bgGradientTo =
    document.getElementById('cfg-biblia-pub-bg-gradient-to-ctrl')?.value || pub.bgGradientTo;
  pub.fontFamily = document.getElementById('cfg-biblia-pub-fontfamily-ctrl')?.value || pub.fontFamily;
  pub.fontSize = parseFloat(document.getElementById('cfg-biblia-pub-fontsize-ctrl')?.value) || pub.fontSize;
  pub.textColor = document.getElementById('cfg-biblia-pub-text-color-ctrl')?.value || pub.textColor;
  pub.maiusculo = getChkVal('cfg-biblia-pub-maiusculo-ctrl');
  pub.negrito = getChkVal('cfg-biblia-pub-negrito-ctrl');
  pub.wrapLongLines = getChkVal('cfg-biblia-pub-wrap-ctrl');
  pub.refMostrar = getChkVal('cfg-biblia-pub-ref-mostrar-ctrl');
  pub.refFontSize =
    parseFloat(document.getElementById('cfg-biblia-pub-ref-size-ctrl')?.value) ||
    BIBLIA_CFG_EXIBICAO_PADRAO.refFontSize;
  pub.refColor =
    document.getElementById('cfg-biblia-pub-ref-color-ctrl')?.value || BIBLIA_CFG_EXIBICAO_PADRAO.refColor;
  if (pub.bgType === 'gradient') pub.bgGradient = bibliaGradienteCss(pub);
}

export function lerBibliaCfgDoFormularioMinistrante() {
  const mon = bibliaCfgMinistrante;
  mon.bgType = document.getElementById('cfg-biblia-min-bg-type-ctrl')?.value || mon.bgType || 'solid';
  mon.bgColor = document.getElementById('cfg-biblia-min-bg-color-ctrl')?.value || mon.bgColor;
  mon.bgGradientFrom =
    document.getElementById('cfg-biblia-min-bg-gradient-from-ctrl')?.value || mon.bgGradientFrom;
  mon.bgGradientTo =
    document.getElementById('cfg-biblia-min-bg-gradient-to-ctrl')?.value || mon.bgGradientTo;
  mon.fontFamily = document.getElementById('cfg-biblia-min-fontfamily-ctrl')?.value || mon.fontFamily;
  mon.fontSize = parseFloat(document.getElementById('cfg-biblia-min-fontsize-ctrl')?.value) || mon.fontSize;
  mon.textColorAtual =
    document.getElementById('cfg-biblia-min-text-color-ctrl')?.value || mon.textColorAtual;
  mon.maiusculo = getChkVal('cfg-biblia-min-maiusculo-ctrl');
  mon.negrito = getChkVal('cfg-biblia-min-negrito-ctrl');
  mon.wrapLongLines = getChkVal('cfg-biblia-min-wrap-ctrl');
  mon.refMostrar = getChkVal('cfg-biblia-min-ref-mostrar-ctrl');
  mon.refFontSize =
    parseFloat(document.getElementById('cfg-biblia-min-ref-size-ctrl')?.value) ||
    BIBLIA_CFG_MINISTRANTE_PADRAO.refFontSize;
  mon.refColor =
    document.getElementById('cfg-biblia-min-ref-color-ctrl')?.value || BIBLIA_CFG_MINISTRANTE_PADRAO.refColor;
  if (mon.bgType === 'gradient') mon.bgGradient = bibliaGradienteCss(mon);
}

export function onBibliaPublicoCfgChange() {
  lerBibliaCfgDoFormularioPublico();
  setSpanText('cfg-biblia-pub-fontsize-val-ctrl', String(bibliaCfgExibicao.fontSize));
  setSpanText('cfg-biblia-pub-ref-size-val-ctrl', String(bibliaCfgExibicao.refFontSize));
  bibliaAtualizarPreviewFundo('publico');
  bibliaAplicarCfgExibicao();
}

export function onBibliaMinistranteCfgChange() {
  lerBibliaCfgDoFormularioMinistrante();
  setSpanText('cfg-biblia-min-fontsize-val-ctrl', String(bibliaCfgMinistrante.fontSize));
  setSpanText('cfg-biblia-min-ref-size-val-ctrl', String(bibliaCfgMinistrante.refFontSize));
  bibliaAtualizarPreviewFundo('ministrante');
  bibliaAplicarCfgExibicao();
}

/**
 * Divisão de versículos longos — a única opção do modo Bíblia que não é de um canal.
 *
 * Re-deriva as partes e redesenha o seletor, mas **não reprojeta**: mexer nas
 * configurações durante o culto não deve trocar o que está no telão. O realce
 * `.projetado` some (os índices mudaram) e volta na próxima projeção.
 */
export function onBibliaDivisaoCfgChange() {
  bibliaCfgLeitura.dividirVersiculosLongos =
    getChkVal('cfg-biblia-divisao-ativa-ctrl');
  bibliaCfgLeitura.limiteCaracteres = normalizarLimiteDivisao(
    document.getElementById('cfg-biblia-divisao-limite-ctrl')?.value
  );
  salvarBibliaCfgNoStorage();
  bibliaPopularFormularioCfgLeitura();
  bibliaRederivarPartesCapitulo();
  bibliaVersiculoSelecionadoIdx = null;
  bibliaRenderizarSeletorVersiculos();
}

function bibliaPopularFormularioCfgLeitura() {
  const ativo = bibliaCfgLeitura.dividirVersiculosLongos === true;
  setChkVal('cfg-biblia-divisao-ativa-ctrl', ativo);
  setSelVal(
    'cfg-biblia-divisao-limite-ctrl',
    String(normalizarLimiteDivisao(bibliaCfgLeitura.limiteCaracteres))
  );
  const sel = document.getElementById('cfg-biblia-divisao-limite-ctrl');
  if (sel) sel.disabled = !ativo;
}

export function bibliaPopularFormularioCfg() {
  const pub = bibliaCfgExibicao;
  const mon = bibliaCfgMinistrante;
  bibliaPopularFormularioCfgLeitura();
  bibliaMesclarGradienteSalvo(pub, BIBLIA_CFG_EXIBICAO_PADRAO);
  bibliaMesclarGradienteSalvo(mon, BIBLIA_CFG_MINISTRANTE_PADRAO);

  setSelVal('cfg-biblia-pub-bg-type-ctrl', pub.bgType || 'solid');
  setInputVal('cfg-biblia-pub-bg-color-ctrl', pub.bgColor || '#000000');
  setInputVal('cfg-biblia-pub-bg-gradient-from-ctrl', pub.bgGradientFrom || '#000000');
  setInputVal('cfg-biblia-pub-bg-gradient-to-ctrl', pub.bgGradientTo || '#161616');
  setSelVal('cfg-biblia-pub-fontfamily-ctrl', pub.fontFamily || BIBLIA_CFG_EXIBICAO_PADRAO.fontFamily);
  setInputVal('cfg-biblia-pub-fontsize-ctrl', pub.fontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.fontSize);
  setSpanText('cfg-biblia-pub-fontsize-val-ctrl', String(pub.fontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.fontSize));
  setInputVal('cfg-biblia-pub-text-color-ctrl', pub.textColor || '#ffffff');
  setChkVal('cfg-biblia-pub-maiusculo-ctrl', pub.maiusculo === true);
  setChkVal('cfg-biblia-pub-negrito-ctrl', pub.negrito !== false);
  setChkVal('cfg-biblia-pub-wrap-ctrl', pub.wrapLongLines !== false);
  setChkVal('cfg-biblia-pub-ref-mostrar-ctrl', pub.refMostrar !== false);
  setInputVal('cfg-biblia-pub-ref-size-ctrl', pub.refFontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.refFontSize);
  setSpanText('cfg-biblia-pub-ref-size-val-ctrl', String(pub.refFontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.refFontSize));
  setInputVal('cfg-biblia-pub-ref-color-ctrl', pub.refColor || BIBLIA_CFG_EXIBICAO_PADRAO.refColor);
  setBibliaPosCtrlBtn('publico', 'posX', pub.posX || 'center');
  setBibliaPosCtrlBtn('publico', 'posY', pub.posY || 'center');
  bibliaAtualizarVisibilidadeFundo('publico');

  setSelVal('cfg-biblia-min-bg-type-ctrl', mon.bgType || 'solid');
  setInputVal('cfg-biblia-min-bg-color-ctrl', mon.bgColor || '#000000');
  setInputVal('cfg-biblia-min-bg-gradient-from-ctrl', mon.bgGradientFrom || '#000000');
  setInputVal('cfg-biblia-min-bg-gradient-to-ctrl', mon.bgGradientTo || '#161616');
  setSelVal('cfg-biblia-min-fontfamily-ctrl', mon.fontFamily || BIBLIA_CFG_MINISTRANTE_PADRAO.fontFamily);
  setInputVal('cfg-biblia-min-fontsize-ctrl', mon.fontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.fontSize);
  setSpanText('cfg-biblia-min-fontsize-val-ctrl', String(mon.fontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.fontSize));
  setInputVal('cfg-biblia-min-text-color-ctrl', mon.textColorAtual || '#ffffff');
  setChkVal('cfg-biblia-min-maiusculo-ctrl', mon.maiusculo === true);
  setChkVal('cfg-biblia-min-negrito-ctrl', mon.negrito !== false);
  setChkVal('cfg-biblia-min-wrap-ctrl', mon.wrapLongLines !== false);
  setChkVal('cfg-biblia-min-ref-mostrar-ctrl', mon.refMostrar !== false);
  setInputVal('cfg-biblia-min-ref-size-ctrl', mon.refFontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.refFontSize);
  setSpanText('cfg-biblia-min-ref-size-val-ctrl', String(mon.refFontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.refFontSize));
  setInputVal('cfg-biblia-min-ref-color-ctrl', mon.refColor || BIBLIA_CFG_MINISTRANTE_PADRAO.refColor);
  setBibliaPosCtrlBtn('ministrante', 'posX', mon.posX || 'center');
  setBibliaPosCtrlBtn('ministrante', 'posY', mon.posY || 'center');
  bibliaAtualizarVisibilidadeFundo('ministrante');
}

export function bibliaCacheChaveCapitulo(traducao, livro, cap) {
  return `${traducao}|${livro}|${cap}`;
}

/**
 * **O ponto único de aplicação da divisão** (ver
 * `docs/architecture/divisao-automatica-versiculos.md`, §6).
 *
 * Deriva `bibliaVersiculosCapitulo` (partes) a partir de `bibliaVersiculosBrutosCapitulo`
 * (versículos inteiros). É a única função do painel que lê `bibliaCfgLeitura` — todos os
 * consumidores a jusante (seletor, setas, projeção, prefetch) veem sempre a mesma
 * estrutura, com a divisão ligada ou desligada.
 */
function bibliaRederivarPartesCapitulo() {
  bibliaVersiculosCapitulo = dividirVersiculos(bibliaVersiculosBrutosCapitulo, {
    ativo: bibliaCfgLeitura.dividirVersiculosLongos === true,
    limite: bibliaCfgLeitura.limiteCaracteres,
  });
}

function bibliaGuardarVersiculosCapitulo(versiculos, traducao, livro, cap) {
  bibliaVersiculosBrutosCapitulo = bibliaAnexarReferenciaVersiculos(versiculos, livro, cap);
  if (traducao && livro && cap) {
    /* O cache guarda o BRUTO, não as partes: assim mudar o limite nas configurações é só
       re-derivar, sem invalidar os capítulos vizinhos já pré-carregados. */
    bibliaCapituloCache.set(
      bibliaCacheChaveCapitulo(traducao, livro, cap),
      bibliaVersiculosBrutosCapitulo
    );
  }
  bibliaRederivarPartesCapitulo();
  bibliaPrefetchCapitulosVizinhos();
}

function bibliaPrefetchCapitulosVizinhos() {
  const traducao = bibliaTraducaoAtual || document.getElementById('traducao-sel')?.value;
  const livro = bibliaSelecionadoLivro;
  const livroDb = bibliaSelecionadoLivroDb || livro;
  const cap = bibliaSelecionadoCap;
  if (!traducao || !livro || !livroDb || !cap || !bibliaVersiculosCapitulo.length) return;
  const idx = bibliaVersiculoSelecionadoIdx ?? 0;
  const caps = [];
  if (idx >= bibliaVersiculosCapitulo.length - 2 && cap > 1) caps.push(cap - 1);
  if (idx <= 1) caps.push(cap + 1);
  if (!caps.length) return;
  const job = ++bibliaPrefetchCapJob;
  caps.forEach((capNum) => {
    const chave = bibliaCacheChaveCapitulo(traducao, livro, capNum);
    if (bibliaCapituloCache.has(chave)) return;
    fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroDb)}/${capNum}`
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (job !== bibliaPrefetchCapJob || !Array.isArray(data)) return;
        bibliaCapituloCache.set(chave, bibliaAnexarReferenciaVersiculos(data, livro, capNum));
      })
      .catch(() => {});
  });
}

/**
 * Tira só o que está no ar (marcadores de projeção/seleção de versículo).
 * Mantém livro, capítulo e lista — o operador continua a navegar após ESC/encerrar.
 */
export function bibliaLimparProjecaoOperador() {
  bibliaParteProjetadaChave = null;
  if (dep.getUltimoConteudoProjetadoModoUnificado()?.tipo === 'biblia') {
    dep.setUltimoConteudoProjetadoModoUnificado(null);
  }
  bibliaVersiculoSelecionadoIdx = null;
  document.querySelectorAll('.biblia-v-card').forEach((c) => {
    c.classList.remove('projetado', 'selecionado');
  });
}

/**
 * Recoloca o painel de navegação no estado de primeira abertura: capítulos e
 * versículos vazios, busca rápida limpa, colunas no topo. Não mexe na tradução.
 */
function bibliaReporPainelNavegacao() {
  const colCaps = document.getElementById('biblia-col-caps');
  if (colCaps) {
    colCaps.innerHTML = '<div class="biblia-placeholder">← Selecione um livro</div>';
    colCaps.scrollTop = 0;
  }
  const colVers = document.getElementById('biblia-col-versiculos');
  if (colVers) {
    colVers.innerHTML = '<div class="biblia-placeholder">← Selecione um capítulo</div>';
    colVers.scrollTop = 0;
  }
  const colLivros = document.getElementById('biblia-col-livros');
  if (colLivros) colLivros.scrollTop = 0;
  const busca = document.getElementById('biblia-busca-rapida');
  if (busca) busca.value = '';
}

function bibliaReporEstadoBuscaRapida() {
  bnpEtapa = 'livro';
  bnpLivroSelecionado = null;
  bnpCapSelecionado = null;
  bnpDigitando = '';
  bnpFocoIndex = -1;
  bnpTotalCaps = 0;
  bnpTotalVers = 0;
}

/**
 * Limpa navegação local (livro/capítulo/versículos/filtro/busca).
 * A tradução da sessão (`bibliaTraducaoSessao`) não se toca.
 */
function bibliaLimparEstadoOperador() {
  bibliaLimparProjecaoOperador();
  bibliaVersiculosCapitulo = [];
  bibliaVersiculosBrutosCapitulo = [];
  bibliaCapituloCache.clear();
  bibliaPrefetchCapJob++;
  bibliaCapsRequestSeq++;
  bibliaVersiculosRequestSeq++;
  bibliaSelecionadoLivro = null;
  bibliaSelecionadoLivroDb = null;
  bibliaSelecionadoCap = null;
  bibliaFiltroTestamento = null;
  bibliaReporEstadoBuscaRapida();
  bibliaNavPopupFechar();
  popularGradeLivros();
  bibliaReporPainelNavegacao();
}

/**
 * Encerra a camada Bíblia no servidor.
 * @param {{ limparNavegacao?: boolean }} [opts]
 *   `limparNavegacao: false` — só tira a projeção; livro/capítulo ficam activos.
 *   Por omissão limpa também a navegação local.
 */
function encerrarCamadaBibliaNoControlador(opts = {}) {
  if (opts.limparNavegacao === false) {
    bibliaLimparProjecaoOperador();
  } else {
    bibliaLimparEstadoOperador();
  }
  if (estadoPainel.estadoServidor && estadoPainel.estadoServidor.tipo === 'biblia') {
    estadoPainel.estadoServidor = {
      tipo: null,
      titulo: '',
      linhas: [],
      estrofeIndex: 0,
      totalEstrofes: 0,
      telaLimpa: true,
      blackout: false,
      slidePretoFinal: false,
    };
  }
  projecao.enviar('encerrar_projecao_biblia');
}

/** Encerra apenas a projeção da Bíblia (botão «Encerrar projeção» / ESC no modo Bíblia). */
export function encerrarProjecaoModoBiblia() {
  if (!ehModoBibliaOperador()) return;
  encerrarCamadaBibliaNoControlador({ limparNavegacao: false });
  atualizarPreviewOperador();
}

/**
 * Há versículo da Bíblia activo no telão (ou marcado como projetado neste painel).
 */
function hayProjecaoBibliaAtivaParaPreservarEstado() {
  if (bibliaParteProjetadaChave != null) return true;
  const e = estadoPainel.estadoServidor;
  return !!(
    e &&
    e.tipo === 'biblia' &&
    !e.telaLimpa &&
    Array.isArray(e.linhas) &&
    e.linhas.length
  );
}

/**
 * Ao sair do modo Bíblia.
 * Preserva livro/capítulo/versículo e a navegação para retomar ao voltar
 * (com ou sem projeção activa). A projeção, se existir, não é encerrada aqui.
 * Sem projeção: repõe só a cfg de slides do preview (Home / outros modos).
 */
export function bibliaSairModo() {
  if (!hayProjecaoBibliaAtivaParaPreservarEstado()) {
    slidesAplicarCfgArmazenada();
  }
  try {
    atualizarPreviewOperador();
  } catch (_) {
    // intencional — erro ignorado
  }
}

/** Um livro passa o filtro actual? Sem filtro, passam todos. */
function livroVisivelNoFiltroTestamento(livro) {
  if (bibliaFiltroTestamento === 'at') return !livro.nt;
  if (bibliaFiltroTestamento === 'nt') return !!livro.nt;
  return true;
}

/**
 * Liga, troca ou desliga o filtro.
 *
 * Clicar no filtro que já está ligado desliga-o — é como se volta a «todos os livros»
 * sem precisar de um terceiro botão a dizer «Tudo», que só existiria para desfazer os
 * outros dois.
 *
 * A selecção de livro, capítulo e versículo não é tocada: filtrar é mudar o que se vê
 * na grade, não largar a passagem que já se estava a preparar. Se o livro escolhido
 * ficar do lado escondido, ele volta assim que o filtro sair.
 */
export function definirFiltroTestamentoBiblia(filtro) {
  bibliaFiltroTestamento = bibliaFiltroTestamento === filtro ? null : filtro;
  atualizarBotoesFiltroTestamentoBiblia();
  popularGradeLivros();
}

function atualizarBotoesFiltroTestamentoBiblia() {
  [['biblia-filtro-at', 'at'], ['biblia-filtro-nt', 'nt']].forEach(([id, valor]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const ligado = bibliaFiltroTestamento === valor;
    btn.classList.toggle('ativo', ligado);
    btn.setAttribute('aria-pressed', ligado ? 'true' : 'false');
  });
}

/**
 * Só os grupos que têm livros à vista.
 *
 * Uma legenda com «Evangelhos + Atos» por cima de uma grade só com o Antigo Testamento
 * estaria a descrever uma lista que não está no ecrã.
 */
function popularLegendaBiblia() {
  const el = document.getElementById('biblia-legenda');
  if (!el) return;
  const visiveis = new Set();
  LIVROS.forEach((l, idx) => {
    if (livroVisivelNoFiltroTestamento(l)) visiveis.add(bibliaGrupoPorIndiceLivro(idx).id);
  });
  el.innerHTML = BIBLIA_GRUPOS.filter((g) => visiveis.has(g.id))
    .map(
      (g) =>
        `<span class="biblia-legenda-item">` +
        `<span class="biblia-legenda-swatch" style="background:${g.cor}"></span>` +
        `<span>${escapeHtml(g.label)}</span></span>`
    )
    .join('');
}

export function popularGradeLivros() {
  const col = document.getElementById('biblia-col-livros');
  if (!col) return;
  popularLegendaBiblia();
  atualizarBotoesFiltroTestamentoBiblia();
  col.innerHTML = '';
  LIVROS.forEach((l, idx) => {
    /* `idx` continua a ser o índice em `LIVROS`, e não na lista filtrada: é dele que
       sai a cor do grupo, que tem de ser a mesma com filtro ou sem ele. */
    if (!livroVisivelNoFiltroTestamento(l)) return;
    const grupo = bibliaGrupoPorIndiceLivro(idx);
    const btn = document.createElement('button');
    btn.className =
      'biblia-livro-btn' + (grupo.textoClaro ? '' : ' biblia-livro-btn--texto-escuro');
    btn.dataset.nome = l.nome;
    btn.dataset.grupo = grupo.id;
    bibliaAplicarEstiloGrupoNoElemento(btn, grupo);
    btn.innerHTML = `<span class="livro-sigla">${escapeHtml(l.sigla)}</span><span class="livro-nome">${escapeHtml(l.nome)}</span>`;
    btn.onclick = () => bibliaEscolherLivro(l);
    col.appendChild(btn);
  });
  bibliaAtualizarDestaqueGradeLivros();
}

/**
 * Põe a grade de livros a condizer com `bibliaSelecionadoLivro`.
 *
 * É o único sítio que mexe no realce: marca o livro escolhido e assinala na coluna
 * que há uma selecção activa (é dessa classe que vem o escurecimento dos outros).
 * Sem livro escolhido, tudo volta ao normal — inclusive depois de repopular a grade,
 * que é o que acontece ao filtrar por testamento.
 */
function bibliaAtualizarDestaqueGradeLivros() {
  const col = document.getElementById('biblia-col-livros');
  const nome = bibliaSelecionadoLivro;
  document.querySelectorAll('.biblia-livro-btn').forEach((b) => {
    b.classList.toggle('selecionado', Boolean(nome) && b.dataset.nome === nome);
  });
  if (col) col.classList.toggle('tem-selecao', Boolean(nome));
}

function bibliaEscolherLivro(livro) {
  bibliaSelecionadoLivro = livro.nome;
  bibliaSelecionadoLivroDb = bibliaLivroNomeDb(livro);
  bibliaSelecionadoCap = null;
  bibliaAtualizarDestaqueGradeLivros();
  const btn = document.querySelector(
    `.biblia-livro-btn[data-nome="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(livro.nome) : livro.nome}"]`
  );
  if (btn) btn.scrollIntoView({ block: 'nearest' });
  const carregamentoCaps = bibliaCarregarCaps(bibliaSelecionadoLivroDb || livro.nome);
  const colVers = document.getElementById('biblia-col-versiculos');
  if (colVers) {
    colVers.innerHTML = '<div class="biblia-placeholder">← Selecione um capítulo</div>';
  }
  bibliaNavPopupFechar();
  const busca = document.getElementById('biblia-busca-rapida');
  if (busca) busca.value = '';
  return carregamentoCaps;
}

async function bibliaCarregarCaps(livro) {
  const traducao = document.getElementById('traducao-sel')?.value;
  const col = document.getElementById('biblia-col-caps');
  const livroRef = String(livro || '').trim();
  if (!col || !traducao || !livroRef) return;
  const requestSeq = ++bibliaCapsRequestSeq;
  col.innerHTML = '<div class="biblia-placeholder">…</div>';
  try {
    const res = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroRef)}/caps`
    );
    const { total } = await res.json();
    if (requestSeq !== bibliaCapsRequestSeq) return;
    col.innerHTML = '';
    for (let i = 1; i <= total; i++) {
      const btn = document.createElement('button');
      btn.className = 'biblia-cap-btn';
      btn.textContent = i;
      btn.dataset.cap = i;
      btn.onclick = () => bibliaEscolherCap(i, btn);
      col.appendChild(btn);
    }
  } catch (_) {
    if (requestSeq !== bibliaCapsRequestSeq) return;
    col.innerHTML = '<div class="biblia-placeholder">Erro ao carregar</div>';
  }
}

function bibliaEscolherCap(cap, btnEl) {
  bibliaSelecionadoCap = cap;
  bibliaVersiculoSelecionadoIdx = null;
  bibliaParteProjetadaChave = null;
  document.querySelectorAll('.biblia-cap-btn').forEach((b) => b.classList.remove('selecionado'));
  btnEl.classList.add('selecionado');
  return bibliaCarregarVersiculos();
}

async function bibliaCarregarVersiculos() {
  if (!bibliaSelecionadoLivro || !bibliaSelecionadoCap) return;
  const livroRef = String(bibliaSelecionadoLivro || '').trim();
  const livroDbRef = String(bibliaSelecionadoLivroDb || livroRef).trim();
  const capRef = bibliaSelecionadoCap;
  const traducao = document.getElementById('traducao-sel')?.value;
  bibliaTraducaoAtual = traducao;
  const col = document.getElementById('biblia-col-versiculos');
  if (!col || !traducao || !livroDbRef) return;
  const requestSeq = ++bibliaVersiculosRequestSeq;
  bibliaVersiculoSelecionadoIdx = null;
  bibliaParteProjetadaChave = null;
  col.innerHTML = '<div class="biblia-placeholder">Carregando…</div>';
  try {
    const res = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livroDbRef)}/${capRef}`
    );
    const versiculos = await res.json();
    if (requestSeq !== bibliaVersiculosRequestSeq) return;
    bibliaGuardarVersiculosCapitulo(versiculos, traducao, livroRef, capRef);
    bibliaRenderizarSeletorVersiculos();
  } catch (_) {
    if (requestSeq !== bibliaVersiculosRequestSeq) return;
    col.innerHTML = '<div class="biblia-placeholder">Erro ao carregar versículos</div>';
  }
}

/**
 * Redesenha a coluna de versículos a partir de `bibliaVersiculosCapitulo`.
 *
 * Um card por **parte**: com a divisão ligada, o versículo 12 pode aparecer em dois cards,
 * ambos numerados «12». Por isso `data-versiculo` deixou de ser único e a seleção passou a
 * usar `data-indice`.
 *
 * Dois chamadores — o carregamento do capítulo e a mudança da opção de divisão — e uma só
 * cópia do render.
 */
function bibliaRenderizarSeletorVersiculos() {
  const col = document.getElementById('biblia-col-versiculos');
  if (!col) return;
  col.innerHTML = '';
  bibliaVersiculosCapitulo.forEach((v, index) => {
    const card = document.createElement('div');
    card.className = 'biblia-v-card' + (v.parteTotal > 1 ? ' biblia-v-parte' : '');
    card.dataset.versiculo = v.versiculo;
    card.dataset.indice = index;
    card.dataset.parte = v.parteIndice ?? 0;
    if (v.parteTotal > 1) {
      card.title = `${v.livro} ${v.capitulo}:${v.versiculo} — parte ${(v.parteIndice ?? 0) + 1} de ${v.parteTotal}`;
    }
    card.innerHTML = `
      <div class="biblia-v-num">${v.versiculo}</div>
      <div class="biblia-v-texto">${escapeHtml(v.texto)}</div>
    `;
    card.onclick = () => bibliaClicarVersiculo(v, card, index);
    col.appendChild(card);
  });
}

function bibliaClicarVersiculo(v, cardEl, index) {
  const jaSelecionado = cardEl.classList.contains('selecionado');
  document.querySelectorAll('.biblia-v-card').forEach((c) => c.classList.remove('selecionado'));
  cardEl.classList.add('selecionado');
  bibliaVersiculoSelecionadoIdx = index;
  bibliaRolarListaParaContextoDoFoco(cardEl);
  if (jaSelecionado || bibliaParteProjetadaChave !== null) {
    bibliaProjetarVersiculo(v, cardEl);
  }
}

function bibliaChaveRotaAtual() {
  const r = normalizarRota(estadoPainel.rotasPorModo.biblia);
  return `${r.publicoIndex},${r.ministranteIndex},${r.live ? 1 : 0}`;
}

async function bibliaSincronizarRotaComServidorSeMudou() {
  const fromUi = rotaSelecionadaNaUi();
  if (fromUi) estadoPainel.rotasPorModo.biblia = normalizarRota(fromUi);
  salvarRotasPorModoNoStorage();
  const chave = bibliaChaveRotaAtual();
  if (chave === bibliaRotaSyncServidorChave) return;
  await salvarRoteamentoTelasNoServidor({ usarValoresDaUi: false });
}

async function bibliaProjetarVersiculo(v, cardEl, opts = {}) {
  if (!projecao.ligada()) return;
  const livroRef = bibliaNormalizarCampoReferencia(v?.livro) || bibliaNormalizarCampoReferencia(bibliaSelecionadoLivro);
  const capituloRef =
    bibliaNormalizarCampoReferencia(v?.capitulo) || bibliaNormalizarCampoReferencia(bibliaSelecionadoCap);
  const versiculoRef = bibliaNormalizarCampoReferencia(v?.versiculo);
  /* Chave da parte, não o número: duas partes do mesmo versículo têm o mesmo número e
     seriam tomadas por «o mesmo conteúdo», forçando o reenvio da config a cada parte. */
  const chaveParte = v?.chave ?? `${livroRef}|${capituloRef}|${versiculoRef}|0`;
  const navegacaoRapida =
    opts.navegacaoRapida === true ||
    (bibliaParteProjetadaChave != null && bibliaParteProjetadaChave !== chaveParte);

  /*
   * Sincronizar primeiro, ler o alvo depois — a ordem é a correcção, e está em
   * `modules/rotaEnvioBiblia.js` (com o histórico do defeito) para poder ser testada.
   *
   * Sincroniza-se só na primeira projeção: evita um PUT /api/display-routing por versículo
   * durante a navegação rápida, onde a rota já foi alinhada.
   */
  const { alvo, alvoEnvio, enviar } = await resolverEnvioBiblia({
    sincronizarRota: navegacaoRapida ? null : bibliaSincronizarRotaComServidorSeMudou,
    lerRota: () => estadoPainel.rotasPorModo.biblia,
  });
  if (!enviar) {
    /* Único motivo legítimo para não enviar: «Não exibir» é o operador a dizer que não
       quer projetar. Ausência de monitor físico não é — o OBS não precisa de nenhum. */
    if (!navegacaoRapida) alert(mensagemAlvoInvalidoBiblia(alvo));
    return;
  }
  document.querySelectorAll('.biblia-v-card').forEach((c) => c.classList.remove('projetado'));
  if (cardEl && cardEl.classList) cardEl.classList.add('projetado');
  bibliaParteProjetadaChave = chaveParte;
  const payloadVersiculo = {
    livro: livroRef,
    capitulo: capituloRef,
    versiculo: versiculoRef,
    texto: v?.texto != null ? String(v.texto) : '',
    traducao: bibliaTraducaoAtual,
    alvoProjecao: alvoEnvio,
    somenteTexto: navegacaoRapida,
  };
  projecao.enfileirar('exibir_versiculo', payloadVersiculo);
  dep.setUltimoConteudoProjetadoModoUnificado({ tipo: 'biblia', payload: payloadVersiculo });
  bibliaPrefetchCapitulosVizinhos();
}

export function bibliaPayloadCfgExibicao() {
  const pub = { ...bibliaCfgExibicao };
  const mon = { ...bibliaCfgMinistrante };
  const fundoPub = bibliaFundoParaPayload(pub);
  const fundoMon = bibliaFundoParaPayload(mon);
  return {
    publico: {
      fontSize: pub.fontSize,
      fontFamily: pub.fontFamily,
      lineSpacing: pub.lineSpacing,
      wrapLongLines: pub.wrapLongLines !== false,
      textColor: pub.textColor,
      negrito: pub.negrito,
      maiusculo: pub.maiusculo === true,
      textAlign: pub.textAlign,
      posX: pub.posX || 'center',
      posY: pub.posY || 'center',
      ...fundoPub,
      refMostrar: pub.refMostrar !== false,
      refFontSize: pub.refFontSize ?? BIBLIA_CFG_EXIBICAO_PADRAO.refFontSize,
      refColor: pub.refColor || BIBLIA_CFG_EXIBICAO_PADRAO.refColor,
    },
    ministrante: {
      fontSize: mon.fontSize,
      fontSizeAtual: mon.fontSize,
      fontSizeProximo: mon.fontSize,
      fontFamily: mon.fontFamily,
      lineSpacing: mon.lineSpacing,
      wrapLongLines: mon.wrapLongLines !== false,
      autoFitLongLines: mon.autoFitLongLines,
      negrito: mon.negrito !== false,
      maiusculo: mon.maiusculo === true,
      textColorAtual: mon.textColorAtual,
      textColorProximo: mon.textColorProximo,
      posX: mon.posX || 'center',
      posY: mon.posY || 'center',
      ...fundoMon,
      refMostrar: mon.refMostrar !== false,
      refFontSize: mon.refFontSize ?? BIBLIA_CFG_MINISTRANTE_PADRAO.refFontSize,
      refColor: mon.refColor || BIBLIA_CFG_MINISTRANTE_PADRAO.refColor,
    },
  };
}

let bibliaPreviewTimer = null;
const BIBLIA_PREVIEW_DEBOUNCE_MS = 140;

export function bibliaAplicarCfgExibicao() {
  clearTimeout(bibliaPreviewTimer);
  bibliaPreviewTimer = setTimeout(() => {
    bibliaPreviewTimer = null;
    salvarBibliaCfgNoStorage();
    enviarPreviewDisplayConfig(null, {
      modoConfig: 'biblia',
      forcarModo: 'biblia',
    });
  }, BIBLIA_PREVIEW_DEBOUNCE_MS);
}

export function bibliaNavPopupAberto() {
  const popup = document.getElementById('biblia-nav-popup');
  return popup && !popup.classList.contains('oculto');
}

export function bibliaNavPopupAbrir() {
  bnpEtapa = 'livro';
  bnpLivroSelecionado = null;
  bnpCapSelecionado = null;
  bnpDigitando = '';
  bnpFocoIndex = -1;
  const livroDisp = document.getElementById('bnp-livro-display');
  const capDisp = document.getElementById('bnp-cap-display');
  const verDisp = document.getElementById('bnp-ver-display');
  const linhaCap = document.getElementById('bnp-linha-cap');
  const linhaVer = document.getElementById('bnp-linha-ver');
  if (livroDisp) livroDisp.textContent = '—';
  if (capDisp) {
    capDisp.textContent = '—';
    capDisp.style.color = 'var(--text, #fff)';
  }
  if (verDisp) {
    verDisp.textContent = '—';
    verDisp.style.color = 'var(--text, #fff)';
  }
  if (linhaCap) linhaCap.style.display = 'none';
  if (linhaVer) linhaVer.style.display = 'none';
  const popup = document.getElementById('biblia-nav-popup');
  if (popup) popup.classList.remove('oculto');
  const inp = document.getElementById('biblia-busca-rapida');
  if (inp) {
    inp.value = '';
    setTimeout(() => inp.focus(), 30);
  }
}

export function bibliaNavPopupFechar() {
  const popup = document.getElementById('biblia-nav-popup');
  if (popup) popup.classList.add('oculto');
  const lista = document.getElementById('bnp-livro-lista');
  if (lista) lista.innerHTML = '';
  bnpDigitando = '';
  bnpFocoIndex = -1;
  const inp = document.getElementById('biblia-busca-rapida');
  if (inp) inp.blur();
}

export function bnpLivroPorSiglaExata(q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return null;
  const matches = LIVROS.filter((l) => l.sigla.toLowerCase() === t);
  return matches.length === 1 ? matches[0] : null;
}

export function bibliaBuscaRapida(val) {
  bnpDigitando = val;
  bnpFocoIndex = -1;

  if (bnpEtapa === 'livro') {
    const lista = document.getElementById('bnp-livro-lista');
    const livroDisp = document.getElementById('bnp-livro-display');
    if (!lista || !livroDisp) return;
    const q = val.trim().toLowerCase();
    livroDisp.textContent = val || '—';
    if (!q) {
      lista.innerHTML = '';
      return;
    }
    const exato = bnpLivroPorSiglaExata(val);
    if (exato) {
      bnpSelecionarLivro(exato);
      return;
    }
    const encontrados = LIVROS.filter((l) =>
      l.sigla.toLowerCase().startsWith(q) ||
      l.nome.toLowerCase().startsWith(q) ||
      l.nome.toLowerCase().includes(q)
    ).slice(0, 8);
    lista.innerHTML = '';
    encontrados.forEach((l) => {
      const grupo = bibliaGrupoPorLivro(l);
      const item = document.createElement('div');
      item.className = 'bnp-item';
      item.innerHTML =
        `<span class="bnp-sigla" style="background:${grupo.cor};color:${bibliaCorTextoGrupo(grupo)}">` +
        `${escapeHtml(l.sigla)}</span><span>${escapeHtml(l.nome)}</span>`;
      item.onclick = () => bnpSelecionarLivro(l);
      lista.appendChild(item);
    });
    lista._resultados = encontrados;
  } else if (bnpEtapa === 'cap') {
    const capDisp = document.getElementById('bnp-cap-display');
    if (!capDisp) return;
    capDisp.textContent = val || '—';
    const num = parseInt(val, 10);
    if (num >= 1 && num <= bnpTotalCaps) {
      capDisp.style.color = 'var(--accent, #c49a3a)';
      if (bnpNumeroEntradaCompleta(val, bnpTotalCaps)) {
        bnpConfirmarCap(val);
      }
    } else {
      capDisp.style.color = 'var(--text, #fff)';
    }
  } else if (bnpEtapa === 'ver') {
    const verDisp = document.getElementById('bnp-ver-display');
    if (!verDisp) return;
    verDisp.textContent = val || '—';
    const num = parseInt(val, 10);
    if (num >= 1 && num <= bnpTotalVers) {
      verDisp.style.color = 'var(--accent, #c49a3a)';
      if (bnpNumeroEntradaCompleta(val, bnpTotalVers)) {
        bnpConfirmarVer(val);
      }
    } else {
      verDisp.style.color = 'var(--text, #fff)';
    }
  }
}

export async function bnpSelecionarLivro(livro) {
  bnpLivroSelecionado = livro;
  bnpEtapa = 'cap';
  bnpDigitando = '';
  const inp = document.getElementById('biblia-busca-rapida');
  if (inp) inp.value = '';
  const livroDisp = document.getElementById('bnp-livro-display');
  const lista = document.getElementById('bnp-livro-lista');
  if (livroDisp) livroDisp.textContent = `${livro.sigla} — ${livro.nome}`;
  if (lista) lista.innerHTML = '';
  const traducao = document.getElementById('traducao-sel')?.value;
  try {
    const res = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(livro.nome)}/caps`
    );
    const { total } = await res.json();
    bnpTotalCaps = total;
  } catch (_) {
    bnpTotalCaps = 150;
  }
  const linhaCap = document.getElementById('bnp-linha-cap');
  const capDisp = document.getElementById('bnp-cap-display');
  if (linhaCap) linhaCap.style.display = 'flex';
  if (capDisp) {
    capDisp.textContent = '—';
    capDisp.style.color = 'var(--text, #fff)';
  }
  setTimeout(() => document.getElementById('biblia-busca-rapida')?.focus(), 30);
}

export async function bnpConfirmarCap(val) {
  const num = parseInt(val, 10);
  if (!num || num < 1 || num > bnpTotalCaps) return;
  bnpCapSelecionado = num;
  bnpEtapa = 'ver';
  bnpDigitando = '';
  const inp = document.getElementById('biblia-busca-rapida');
  if (inp) inp.value = '';
  const capDisp = document.getElementById('bnp-cap-display');
  if (capDisp) capDisp.textContent = String(num);
  const traducao = document.getElementById('traducao-sel')?.value;
  try {
    const res = await fetch(
      `${getControllerApiBase()}/api/biblia/${traducao}/${encodeURIComponent(bnpLivroSelecionado.nome)}/${num}`
    );
    const vers = await res.json();
    bnpTotalVers = vers.length;
  } catch (_) {
    bnpTotalVers = 200;
  }
  const linhaVer = document.getElementById('bnp-linha-ver');
  const verDisp = document.getElementById('bnp-ver-display');
  if (linhaVer) linhaVer.style.display = 'flex';
  if (verDisp) {
    verDisp.textContent = '—';
    verDisp.style.color = 'var(--text, #fff)';
  }
  setTimeout(() => document.getElementById('biblia-busca-rapida')?.focus(), 30);
}

export async function bnpConfirmarVer(val) {
  const num = parseInt(val, 10);
  if (!num || num < 1 || num > bnpTotalVers || !bnpLivroSelecionado) return;
  bibliaNavPopupFechar();
  await bibliaEscolherLivro(bnpLivroSelecionado);
  await new Promise((r) => setTimeout(r, 200));
  const capBtn = document.querySelector(`.biblia-cap-btn[data-cap="${bnpCapSelecionado}"]`);
  if (capBtn) bibliaEscolherCap(bnpCapSelecionado, capBtn);
  await new Promise((r) => setTimeout(r, 300));
  /* Uma referência aponta sempre para o início do versículo — nunca para o meio. */
  const idx = indicePrimeiraParteDoVersiculo(bibliaVersiculosCapitulo, num);
  const v = idx >= 0 ? bibliaVersiculosCapitulo[idx] : null;
  if (!v) return;
  /* O objeto projetado sai da lista, não do DOM: ler o texto do card traria as reticências
     decorativas para dentro da projeção e perderia `livro`/`capitulo` (referência vazia). */
  const card = bibliaMarcarVersiculoNaUi(v, idx);
  await bibliaProjetarVersiculo(v, card);
}

/**
 * Backspace num campo vazio volta uma etapa (verso → capítulo → livro) devolvendo o valor
 * já confirmado menos o último caractere, para que o operador o corrija em vez de ficar
 * preso a um número que avançou sozinho.
 */
function bnpVoltarEtapa() {
  const inp = document.getElementById('biblia-busca-rapida');
  if (!inp) return;
  let valor = '';
  if (bnpEtapa === 'ver') {
    valor = String(bnpCapSelecionado ?? '').slice(0, -1);
    bnpEtapa = 'cap';
    bnpCapSelecionado = null;
    const linhaVer = document.getElementById('bnp-linha-ver');
    const verDisp = document.getElementById('bnp-ver-display');
    if (linhaVer) linhaVer.style.display = 'none';
    if (verDisp) verDisp.textContent = '—';
  } else if (bnpEtapa === 'cap') {
    valor = String(bnpLivroSelecionado?.sigla ?? '').slice(0, -1);
    bnpEtapa = 'livro';
    bnpLivroSelecionado = null;
    const linhaCap = document.getElementById('bnp-linha-cap');
    const capDisp = document.getElementById('bnp-cap-display');
    if (linhaCap) linhaCap.style.display = 'none';
    if (capDisp) capDisp.textContent = '—';
  } else {
    return;
  }
  inp.value = valor;
  bibliaBuscaRapida(valor);
  inp.focus();
}

export function bibliaBuscaRapidaTecla(e) {
  if (
    bibliaNavPopupAberto() &&
    (bnpEtapa === 'cap' || bnpEtapa === 'ver') &&
    e.key === 'Backspace' &&
    !(e.target?.value || '')
  ) {
    e.preventDefault();
    bnpVoltarEtapa();
    return;
  }
  if (!bibliaNavPopupAberto()) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      bibliaNavegarVersiculosComSeta(e.key);
    }
    return;
  }

  if (bnpEtapa === 'livro') {
    const lista = document.getElementById('bnp-livro-lista');
    if (!lista) return;
    const items = lista.querySelectorAll('.bnp-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      bnpFocoIndex = Math.min(bnpFocoIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('focado', i === bnpFocoIndex));
      if (items[bnpFocoIndex]) items[bnpFocoIndex].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      bnpFocoIndex = Math.max(bnpFocoIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('focado', i === bnpFocoIndex));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = bnpFocoIndex >= 0 ? bnpFocoIndex : 0;
      if (lista._resultados && lista._resultados[idx]) {
        bnpSelecionarLivro(lista._resultados[idx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      bibliaNavPopupFechar();
    }
  } else if (bnpEtapa === 'cap') {
    if (e.key === 'Enter') {
      e.preventDefault();
      bnpConfirmarCap(document.getElementById('biblia-busca-rapida')?.value || '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      bibliaNavPopupFechar();
    }
  } else if (bnpEtapa === 'ver') {
    if (e.key === 'Enter') {
      e.preventDefault();
      bnpConfirmarVer(document.getElementById('biblia-busca-rapida')?.value || '');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      bibliaNavPopupFechar();
    }
  }
}

function bibliaIndicePorTeclaNavegacao(key, idxAtual, total) {
  let idx = idxAtual ?? -1;
  if (key === 'ArrowDown' || key === 'ArrowRight') idx = Math.min(idx + 1, total - 1);
  else if (key === 'ArrowUp' || key === 'ArrowLeft') idx = Math.max(idx - 1, 0);
  return idx;
}

/**
 * Rola a coluna para o versículo focado + 1 (ou 2, se couber) seguintes visíveis.
 * Suave na projeção ao vivo; instantâneo se o sistema pede menos movimento.
 */
function bibliaRolarListaParaContextoDoFoco(card) {
  const col = document.getElementById('biblia-col-versiculos');
  if (!col || !card || !col.contains(card)) return;
  const cards = [...col.querySelectorAll('.biblia-v-card')];
  const idx = cards.indexOf(card);
  if (idx < 0) return;

  const colRect = col.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const seguintes = [];
  for (let k = 1; k <= 2; k++) {
    const el = cards[idx + k];
    if (!el) break;
    const r = el.getBoundingClientRect();
    seguintes.push({ top: r.top, bottom: r.bottom, height: r.height });
  }

  const delta = deltaScrollListaVersiculos({
    viewport: { top: colRect.top, bottom: colRect.bottom, height: colRect.height },
    foco: { top: cardRect.top, bottom: cardRect.bottom, height: cardRect.height },
    seguintes,
  });
  if (Math.abs(delta) < 1) return;

  col.scrollTo({
    top: col.scrollTop + delta,
    behavior: preferenciaMovimentoReduzido() ? 'auto' : 'smooth',
  });
}

/**
 * Marca a parte de índice `idx` como selecionada.
 *
 * Procura por `data-indice` e não por `data-versiculo`: com a divisão ligada o número do
 * versículo repete-se entre partes e a consulta antiga acertaria sempre na primeira.
 */
function bibliaMarcarVersiculoNaUi(v, idx) {
  const card = document.querySelector(`.biblia-v-card[data-indice="${idx}"]`);
  document.querySelectorAll('.biblia-v-card').forEach((c) => c.classList.remove('selecionado'));
  if (card) {
    card.classList.add('selecionado');
    bibliaRolarListaParaContextoDoFoco(card);
  }
  bibliaVersiculoSelecionadoIdx = idx;
  return card;
}

export function bibliaNavegarVersiculosComSeta(key) {
  if (bibliaNavPopupAberto()) return;
  const total = bibliaVersiculosCapitulo.length;
  if (!total) {
    const cards = document.querySelectorAll('.biblia-v-card');
    if (!cards.length) return;
    let idx = bibliaVersiculoSelecionadoIdx ?? -1;
    idx = bibliaIndicePorTeclaNavegacao(key, idx, cards.length);
    if (idx === bibliaVersiculoSelecionadoIdx && bibliaParteProjetadaChave != null) return;
    bibliaVersiculoSelecionadoIdx = idx;
    cards[idx].click();
    return;
  }
  let idx = bibliaVersiculoSelecionadoIdx ?? -1;
  const prox = bibliaIndicePorTeclaNavegacao(key, idx, total);
  if (prox === idx && bibliaParteProjetadaChave != null) return;
  const v = bibliaVersiculosCapitulo[prox];
  if (!v) return;
  const card = bibliaMarcarVersiculoNaUi(v, prox);
  if (bibliaParteProjetadaChave != null) {
    void bibliaProjetarVersiculo(v, card, { navegacaoRapida: true });
  }
}

/** Teclado no modo Bíblia: retorna true se o evento foi consumido. */
export function bibliaTratarKeydownModo(e) {
  if (!ehModoBibliaOperador()) return false;

  const inpNav = document.getElementById('biblia-busca-rapida');
  const tag = document.activeElement?.tagName?.toLowerCase();
  const isField =
    (tag === 'input' || tag === 'select' || tag === 'textarea') &&
    document.activeElement !== inpNav;
  if (isField) return false;

  if (e.ctrlKey || e.altKey || e.metaKey) return false;

  if (e.key === 'Escape') {
    if (bibliaNavPopupAberto()) {
      e.preventDefault();
      bibliaNavPopupFechar();
      return true;
    }
    return false;
  }

  if (bibliaNavPopupAberto()) {
    if (document.activeElement === inpNav) return false;
    return false;
  }

  if (
    e.key === 'ArrowDown' ||
    e.key === 'ArrowUp' ||
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight'
  ) {
    e.preventDefault();
    bibliaNavegarVersiculosComSeta(e.key);
    return true;
  }

  if (e.key.length === 1 || e.key === 'Backspace') {
    e.preventDefault();
    bibliaNavPopupAbrir();
    setTimeout(() => {
      if (!inpNav) return;
      inpNav.focus();
      if (e.key === 'Backspace') {
        inpNav.value = '';
      } else {
        inpNav.value = e.key;
      }
      bibliaBuscaRapida(inpNav.value);
    }, 0);
    return true;
  }

  return false;
}

/**
 * Lê a imagem de fundo já reduzida ao que o monitor consegue mostrar.
 *
 * O fundo era guardado como veio da câmara ou do banco de imagens. Um JPEG 4K de 5 MB
 * vira 6,7 MB de Base64 — que vai para o localStorage (síncrono), para o payload de
 * configuração e, dentro dele, por um `JSON.parse(JSON.stringify(...))` por janela de
 * projeção. Medido, isso custava 67 ms por aplicação de configuração; a 1920px de
 * largura, 4,7 ms.
 *
 * Imagem que já cabe na largura alvo passa intacta, no formato original — reduzir só
 * quando há o que reduzir. Acima disso vai a JPEG: um fundo de projeção ocupa o ecrã
 * inteiro e não tem o que fazer com transparência.
 *
 * @param {File} file
 * @param {number} [larguraMax] Largura alvo em pixels (padrão: 1920, um telão comum).
 * @returns {Promise<string>} data URL, ou '' se não deu para ler.
 */
function lerImagemFundoReduzida(file, larguraMax = 1920) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve('');
    reader.onload = () => {
      const original = String(reader.result || '');
      if (!original) return resolve('');
      const img = new Image();
      img.onerror = () => resolve(original);
      img.onload = () => {
        try {
          const w = img.naturalWidth || 0;
          const h = img.naturalHeight || 0;
          if (w < 2 || h < 2 || w <= larguraMax) return resolve(original);
          const escala = larguraMax / w;
          const c = document.createElement('canvas');
          c.width = Math.max(2, Math.round(w * escala));
          c.height = Math.max(2, Math.round(h * escala));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const reduzida = c.toDataURL('image/jpeg', 0.85);
          /* Só troca se realmente encolheu — imagens muito comprimidas podem crescer. */
          resolve(reduzida && reduzida.length < original.length ? reduzida : original);
        } catch (_) {
          resolve(original);
        }
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}

export async function bibliaEscolherFundo(input) {
  const file = input.files?.[0];
  if (!file) return;
  const id = input.id || '';
  const alvo = id.includes('biblia-min') ? 'ministrante' : 'publico';
  input.value = '';
  const dataUrl = await lerImagemFundoReduzida(file);
  if (dataUrl) {
    if (alvo === 'ministrante') {
      bibliaCfgMinistrante.bgType = 'image';
      bibliaCfgMinistrante.bgImage = dataUrl;
      setSelVal('cfg-biblia-min-bg-type-ctrl', 'image');
      bibliaAtualizarVisibilidadeFundo('ministrante');
    } else {
      bibliaCfgExibicao.bgType = 'image';
      bibliaCfgExibicao.bgImage = dataUrl;
      setSelVal('cfg-biblia-pub-bg-type-ctrl', 'image');
      bibliaAtualizarVisibilidadeFundo('publico');
    }
    salvarBibliaCfgNoStorage();
    bibliaAplicarCfgExibicao();
  }
}

/* ─── Pontos de contato com o núcleo (o estado acima é privado) ──────────────────── */

/** Há uma parte de versículo da Bíblia no ar? */
export function bibliaHaParteProjetada() {
  return bibliaParteProjetadaChave != null;
}

/** Zera a marca da parte projetada (o núcleo limpa o operador ao sair do modo). */
export function bibliaZerarParteProjetada() {
  bibliaParteProjetadaChave = null;
}

/** Zera o versículo selecionado na grade. */
export function bibliaZerarVersiculoSelecionado() {
  bibliaVersiculoSelecionadoIdx = null;
}

/** Marca a rota da Bíblia como aceita pelo servidor (a próxima projeção não a reenvia). */
export function marcarRotaBibliaSincronizada() {
  bibliaRotaSyncServidorChave = bibliaChaveRotaAtual();
}

/** Aparência do público e do ministrante, lidas pela Exibição (Ajustes). */
export function getBibliaCfgExibicao() {
  return bibliaCfgExibicao;
}
export function getBibliaCfgMinistrante() {
  return bibliaCfgMinistrante;
}
