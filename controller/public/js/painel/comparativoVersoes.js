/**
 * Modo comparativo: duas versões da mesma música lado a lado, com realces de diferenças, edição e
 * gravação direta por id de versão. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo
 * ainda possui entra por `registrarDependenciasComparativoVersoes`.
 */
import { VALOR_OPCAO_VERSAO_ORIGINAL, opcoesVersaoDistintasPorConteudo } from '../modules/playlistVersaoMusica.js';
import { appAlert, appDialogEstado } from './appDialog.js';
import { carregarMusicas } from './bibliotecaMusicas.js';
import { compararLetras } from '../modules/diffLetrasComparativo.js';
import { aplicarLayoutModoLetraCompleta, confirmarProsseguirDescartandoEdicaoPendente, estrofesArraysIguaisParaEdicao, splitTextoLetraCompletaEmEstrofes } from './letraCompleta.js';
import { estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasComparativoVersoes(d) {
  dep = d || {};
}
const atualizarBotoesSalvarCancelarBarraPadrao = (...a) => dep.atualizarBotoesSalvarCancelarBarraPadrao(...a);
const atualizarPreviewOperador = (...a) => dep.atualizarPreviewOperador(...a);
const atualizarToolbarModoEdicao = (...a) => dep.atualizarToolbarModoEdicao(...a);
const cancelarModoComparativoCentral = (...a) => dep.cancelarModoComparativoCentral(...a);
const carregarVersoesMusicaServidor = (...a) => dep.carregarVersoesMusicaServidor(...a);
const formatarRotuloVersaoExibicao = (...a) => dep.formatarRotuloVersaoExibicao(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const marcacaoEstrofeEditor = (...a) => dep.marcacaoEstrofeEditor(...a);
const obterRootIdMusicaAtiva = (...a) => dep.obterRootIdMusicaAtiva(...a);
const renderSlidesStrip = (...a) => dep.renderSlidesStrip(...a);
const renderEstrofesEditor = (...a) => dep.renderEstrofesEditor(...a);

/* ==========================================================================
 * MODO COMPARATIVO — duas versões da mesma música lado a lado
 * ==========================================================================
 * Painel próprio (`#centro-comparativo-wrap`), estado próprio
 * (`modoComparativoCentral` / `comparativoLados` / `snapshotComparativo`) e
 * gravação própria, por `id` de versão. Nada aqui escreve em `musicaAtiva`
 * durante a edição: os outros modos da coluna central continuam exactamente
 * como eram.
 *
 * O visual segue o MODO LETRA COMPLETA — mesma caixa, mesma tipografia — e os
 * realces usam o mesmo truque das divisórias daquele modo: como um `<textarea>`
 * só desenha texto puro, os fundos coloridos vivem numa camada por baixo, num
 * espelho que copia as métricas tipográficas do textarea em tempo de execução.
 * ========================================================================== */

/** Rótulo de exibição de uma versão na coluna e no seletor. */
function rotuloVersaoComparativo(v, rootId) {
  if (!v) return '';
  const ehOriginal = v.parent_id == null && Number(v.id) === Number(rootId);
  if (ehOriginal) return 'Original';
  const rotulo = String(v.rotulo || '').trim();
  return formatarRotuloVersaoExibicao(rotulo, v.origem_importacao);
}

function comparativoTextarea(lado) {
  return document.getElementById(`comparativo-ta-${lado}`);
}

/**
 * Camada de realces das duas colunas.
 *
 * Estritamente decorativa: lê o texto dos dois textareas, calcula as diferenças
 * com `compararLetras` e pinta os fundos. Não escreve em lado nenhum do estado
 * da aplicação.
 */
const realcesComparativo = (() => {
  /**
   * Propriedades que afectam a disposição do texto e têm de ser idênticas no
   * espelho. As larguras de borda ficam de fora de propósito — a camada
   * `.centro-comparativo-realces` já tem uma borda transparente da mesma
   * espessura, e contá-las aqui duplicaria o desvio.
   */
  const PROPS_METRICA = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'textIndent', 'textTransform',
    'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  ];

  const LADOS = ['a', 'b'];
  const partes = { a: null, b: null };
  let agendado = false;

  function elementos(lado) {
    const ta = comparativoTextarea(lado);
    const camada = document.getElementById(`comparativo-realces-${lado}`);
    if (!ta || !camada) return null;
    let ref = partes[lado];
    if (!ref || ref.desloca.parentNode !== camada) {
      camada.innerHTML = '';
      const desloca = document.createElement('div');
      desloca.className = 'centro-comparativo-realces-desloca';
      const espelho = document.createElement('div');
      espelho.className = 'centro-comparativo-espelho';
      desloca.appendChild(espelho);
      camada.appendChild(desloca);
      ref = { desloca, espelho };
      partes[lado] = ref;
    }
    return { ta, camada, ...ref };
  }

  /**
   * Reproduz as marcas de uma coluna no espelho, uma LINHA por bloco. Cada linha do textarea
   * vira um <div>: assim o fundo da linha ocupa a largura inteira (a barra lateral fica na
   * borda do painel) sem mudar a posição do texto — o recuo é compensado com margem negativa
   * + padding iguais (variáveis --cmp-pl/--cmp-pr, copiadas do textarea em `desenhar`).
   */
  function pintar(espelho, marcas) {
    espelho.textContent = '';
    marcas.forEach((m) => {
      const linha = document.createElement('div');
      linha.className = 'cmp-row';
      if (m.tipo === 'igual') {
        /* NBSP na linha vazia: sem caractere o bloco colapsaria e as linhas desalinhariam. */
        linha.textContent = m.texto ? m.texto : '\u00a0';
        espelho.appendChild(linha);
        return;
      }
      linha.classList.add('cmp-linha', m.tipo === 'exclusiva' ? 'cmp-linha--exclusiva' : 'cmp-linha--alterada');
      if (!m.texto) {
        linha.textContent = '\u00a0';
      } else if (m.tipo === 'alterada') {
        m.partes.forEach((p) => {
          if (!p.txt) return;
          if (!p.mudou) {
            linha.appendChild(document.createTextNode(p.txt));
            return;
          }
          const palavra = document.createElement('span');
          palavra.className = 'cmp-palavra';
          palavra.textContent = p.txt;
          linha.appendChild(palavra);
        });
      } else {
        linha.textContent = m.texto;
      }
      espelho.appendChild(linha);
    });
  }

  /** Resumo em chips (uma contagem por chip, sem chip com zero) + legenda só quando há diferenças. */
  function atualizarRodape(resultado) {
    const resumo = document.getElementById('comparativo-resumo');
    const legenda = document.getElementById('comparativo-legenda');
    if (resumo) {
      resumo.classList.toggle('igual', !!resultado.iguais);
      resumo.textContent = '';
      const chip = (texto, check) => {
        const el = document.createElement('span');
        el.className = 'cmp-chip';
        if (check) {
          el.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
        }
        el.appendChild(document.createTextNode(texto));
        resumo.appendChild(el);
      };
      if (resultado.iguais) {
        chip('Versões idênticas', true);
      } else {
        const { alteradas, exclusivasA, exclusivasB } = resultado.totais;
        if (alteradas) chip(`${alteradas} ${alteradas === 1 ? 'linha alterada' : 'linhas alteradas'}`);
        if (exclusivasA) chip(`${exclusivasA} só à esquerda`);
        if (exclusivasB) chip(`${exclusivasB} só à direita`);
        if (!alteradas && !exclusivasA && !exclusivasB) chip('Diferenças apenas em espaços');
      }
    }
    if (legenda) legenda.hidden = !!resultado.iguais;
  }

  function desenhar() {
    agendado = false;
    const refA = elementos('a');
    const refB = elementos('b');
    if (!refA || !refB) return;

    if (!estadoPainel.modoComparativoCentral || refA.camada.offsetParent === null) {
      refA.espelho.textContent = '';
      refB.espelho.textContent = '';
      return;
    }

    const resultado = compararLetras(refA.ta.value, refB.ta.value);
    const marcas = { a: resultado.linhasA, b: resultado.linhasB };

    for (const lado of LADOS) {
      const ref = lado === 'a' ? refA : refB;
      const cs = getComputedStyle(ref.ta);
      PROPS_METRICA.forEach((p) => {
        ref.espelho.style[p] = cs[p];
      });
      /* `clientWidth` já exclui a barra de deslocamento — largura útil certa. */
      ref.espelho.style.width = `${ref.ta.clientWidth}px`;
      ref.espelho.style.border = '0';
      /* As linhas do espelho são blocos que sangram até as bordas do painel. */
      ref.espelho.style.setProperty('--cmp-pl', cs.paddingLeft);
      ref.espelho.style.setProperty('--cmp-pr', cs.paddingRight);
      ref.desloca.style.width = `${ref.ta.clientWidth}px`;
      /* Iguais: espelho vazio. É o requisito de não marcar nada nesse caso. */
      pintar(ref.espelho, resultado.iguais ? [] : marcas[lado]);
      ref.desloca.style.transform = `translateY(${-ref.ta.scrollTop}px)`;
    }

    atualizarRodape(resultado);
  }

  function sincronizarDeslocamento(lado) {
    const ref = partes[lado];
    const ta = comparativoTextarea(lado);
    if (!ref || !ta) return;
    ref.desloca.style.transform = `translateY(${-ta.scrollTop}px)`;
  }

  /** Recalcula na próxima pintura (agrupa rajadas de `input`). */
  function agendar() {
    if (agendado) return;
    agendado = true;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(desenhar);
    else setTimeout(desenhar, 0);
  }

  function ligar() {
    for (const lado of LADOS) {
      const ref = elementos(lado);
      if (!ref) continue;
      const { ta } = ref;
      if (ta.dataset.realcesLigados === '1') continue;
      ta.dataset.realcesLigados = '1';
      ta.addEventListener('input', agendar);
      /* «Salvar alterações» da barra padrão precisa saber, a cada tecla, se algum
         dos lados já diverge do snapshot — não só quando o modo abre/fecha. */
      ta.addEventListener('input', atualizarBotoesSalvarCancelarBarraPadrao);
      ta.addEventListener('scroll', () => sincronizarDeslocamento(lado), { passive: true });
      if (typeof ResizeObserver === 'function') new ResizeObserver(agendar).observe(ta);
    }
    window.addEventListener('resize', agendar);
    /* A métrica muda quando a fonte da letra termina de carregar: remede os realces. */
    if (document.fonts && !ligar._fonts) {
      ligar._fonts = true;
      document.fonts.addEventListener('loadingdone', agendar);
      document.fonts.ready.then(agendar);
    }
    agendar();
  }

  function limpar() {
    for (const lado of LADOS) {
      const ref = partes[lado];
      if (ref) ref.espelho.textContent = '';
    }
    const resumo = document.getElementById('comparativo-resumo');
    if (resumo) resumo.textContent = '';
    const legenda = document.getElementById('comparativo-legenda');
    if (legenda) legenda.hidden = true;
  }

  return { ligar, agendar, limpar };
})();

/**
 * Reduz a lista de versões do Comparativo ao mesmo critério já usado em
 * Versões (`opcoesVersaoDistintasPorConteudo`, em `playlistVersaoMusica.js`):
 * quando a Original e uma Cópia têm conteúdo rigorosamente idêntico, só a
 * Cópia fica na lista — ela toma o lugar da Original (mesma posição). Não
 * recria o critério aqui; só adapta as versões cruas do servidor para o
 * formato `{ value, conteudo }` que aquela função espera e devolve o mesmo
 * objeto de versão de volta.
 */
function versoesDistintasParaComparativo(versoes, rootId) {
  const lista = Array.isArray(versoes) ? versoes : [];
  const opcoes = lista.map((v) => {
    const ehOriginal = !!v && v.parent_id == null && Number(v.id) === Number(rootId);
    return {
      value: ehOriginal ? VALOR_OPCAO_VERSAO_ORIGINAL : String(v.id),
      conteudo: v,
      _versao: v,
    };
  });
  return opcoesVersaoDistintasPorConteudo(opcoes).map((op) => op._versao);
}

/**
 * Versões do servidor comparáveis (original + cópias) da música carregada.
 *
 * `totalVersoesBrutas` é a contagem ANTES da redução por conteúdo (quantas
 * versões existem mesmo no banco) — quem chama precisa dela para distinguir
 * «só existe uma versão» de «existem várias, mas todas idênticas entre si».
 */
async function carregarVersoesParaComparativo() {
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) return { rootId: null, versoes: [], totalVersoesBrutas: 0 };
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${rootId}/versoes`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const rootIdResolvido = Number(data.rootId) || rootId;
    const versoesBrutas = Array.isArray(data.versoes) ? data.versoes : [];
    const versoes = versoesDistintasParaComparativo(versoesBrutas, rootIdResolvido);
    return { rootId: rootIdResolvido, versoes, totalVersoesBrutas: versoesBrutas.length };
  } catch (_) {
    return { rootId, versoes: [], totalVersoesBrutas: 0 };
  }
}

/**
 * Pergunta que duas versões comparar.
 *
 * Reutiliza o `app-dialog` padrão (e o `appEscolhaResolver`, para que Escape
 * continue a cancelar). Clique no escuro não fecha. Resolve `{ idA, idB }` ou `null`.
 */
function escolherVersoesParaComparar(versoes, rootId) {
  const ov = document.getElementById('app-dialog-overlay');
  const body = document.getElementById('app-dialog-body');
  const head = document.getElementById('app-dialog-head');
  const ok = document.getElementById('app-dialog-ok');
  const cancel = document.getElementById('app-dialog-cancel');
  const dialog = ov?.querySelector('.app-dialog');
  if (!ov || !body || !head || !ok || !cancel) return Promise.resolve(null);

  return new Promise((resolve) => {
    appDialogEstado.escolhaResolver = resolve;
    head.textContent = 'Comparar versões';
    body.innerHTML = '';
    dialog?.classList.add('app-dialog--cmp-escolha');

    const wrap = document.createElement('div');
    wrap.className = 'cmp-escolha-form';

    const det = document.createElement('p');
    det.className = 'cmp-escolha-intro';
    det.textContent = 'Escolha as duas versões que quer ver lado a lado.';
    wrap.appendChild(det);

    /**
     * A coluna avisa a OUTRA (via `aoSelecionar`) sempre que o usuário escolhe
     * uma versão; a outra reage cinzando/desabilitando o botão da mesma versão
     * na sua própria lista (`atualizarIndisponivel`), para impedir comparar uma
     * versão com ela mesma. Nunca mexe na própria seleção da coluna — só na
     * disponibilidade dos botões que representam a versão escolhida do lado de lá.
     */
    const criarColuna = (rotulo) => {
      let selecionado = null;
      let notificarOutraColuna = () => {};
      const botoesPorId = new Map();
      const col = document.createElement('div');
      col.className = 'cmp-escolha-col';

      const titulo = document.createElement('div');
      titulo.className = 'cmp-escolha-col-titulo';
      titulo.textContent = versoes.length > 1 ? `${rotulo} (${versoes.length})` : rotulo;

      const hint = document.createElement('p');
      hint.className = 'cmp-escolha-col-hint';
      hint.textContent = 'Nenhuma versão selecionada';

      const lista = document.createElement('div');
      lista.className = 'cmp-escolha-lista';
      lista.setAttribute('role', 'listbox');

      versoes.forEach((v) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cmp-escolha-opcao';
        btn.setAttribute('role', 'option');
        btn.textContent = rotuloVersaoComparativo(v, rootId);
        btn.onclick = () => {
          lista.querySelectorAll('.cmp-escolha-opcao').forEach((b) => {
            b.classList.remove('ativo');
            b.setAttribute('aria-selected', 'false');
          });
          btn.classList.add('ativo');
          btn.setAttribute('aria-selected', 'true');
          selecionado = Number(v.id);
          col.classList.remove('cmp-escolha-col--pendente');
          hint.textContent = `Selecionada: ${rotuloVersaoComparativo(v, rootId)}`;
          hint.classList.add('cmp-escolha-col-hint--ok');
          erro.textContent = '';
          btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          notificarOutraColuna(selecionado);
        };
        botoesPorId.set(Number(v.id), btn);
        lista.appendChild(btn);
      });

      col.appendChild(titulo);
      if (versoes.length > 4) {
        const nota = document.createElement('p');
        nota.className = 'cmp-escolha-col-nota';
        nota.textContent = 'Role a lista para ver todas as versões.';
        col.appendChild(nota);
      }
      col.appendChild(hint);
      col.appendChild(lista);
      return {
        col,
        getId: () => selecionado,
        marcarPendente: () => col.classList.add('cmp-escolha-col--pendente'),
        /** Chamado pela OUTRA coluna quando sua seleção muda (ou é `null`). */
        atualizarIndisponivel(idUsadoNaOutraColuna) {
          botoesPorId.forEach((btn, id) => {
            const indisponivel = idUsadoNaOutraColuna != null && id === idUsadoNaOutraColuna;
            btn.disabled = indisponivel;
            btn.classList.toggle('cmp-escolha-opcao--indisponivel', indisponivel);
          });
        },
        /** Define quem avisar quando o usuário escolher algo nesta coluna. */
        aoSelecionar(fn) {
          notificarOutraColuna = fn;
        },
      };
    };

    const colA = criarColuna('Versão à esquerda');
    const colB = criarColuna('Versão à direita');
    colA.aoSelecionar((id) => colB.atualizarIndisponivel(id));
    colB.aoSelecionar((id) => colA.atualizarIndisponivel(id));
    wrap.appendChild(colA.col);
    wrap.appendChild(colB.col);

    const erro = document.createElement('div');
    erro.className = 'cmp-escolha-erro';
    wrap.appendChild(erro);
    body.appendChild(wrap);

    const finish = (v) => {
      if (!appDialogEstado.escolhaResolver) return;
      const r = appDialogEstado.escolhaResolver;
      appDialogEstado.escolhaResolver = null;
      body.innerHTML = '';
      dialog?.classList.remove('app-dialog--cmp-escolha');
      ok.style.display = '';
      ov.classList.remove('aberto');
      ov.hidden = true;
      r(v);
    };

    ok.style.display = '';
    ok.textContent = 'Comparar';
    ok.onclick = () => {
      let pendente = false;
      const idA = colA.getId();
      const idB = colB.getId();
      if (!Number.isFinite(idA)) {
        colA.marcarPendente();
        pendente = true;
      }
      if (!Number.isFinite(idB)) {
        colB.marcarPendente();
        pendente = true;
      }
      if (pendente) {
        erro.textContent = 'Escolha as duas versões.';
        return;
      }
      if (idA === idB) {
        erro.textContent = 'Escolha duas versões diferentes.';
        return;
      }
      finish({ idA, idB });
    };
    cancel.style.display = '';
    cancel.textContent = 'Cancelar';
    cancel.onclick = () => finish(null);

    ov.hidden = false;
    ov.classList.add('aberto');
    appDialogEstado.fecharNoBackdrop = true;
  });
}

/** Carrega uma versão do servidor no formato usado pelas colunas. */
async function carregarLadoComparativo(id) {
  const res = await fetch(`${getControllerApiBase()}/api/musicas/${Number(id)}`);
  if (!res.ok) throw new Error(`Falha ao carregar a versão (HTTP ${res.status}).`);
  const v = await res.json();
  if (!v || !Array.isArray(v.estrofes)) throw new Error('Resposta inválida do controlador.');
  return {
    id: Number(v.id),
    titulo: String(v.titulo || ''),
    artista: String(v.artista || ''),
    estrofes: v.estrofes.map((s) => String(s ?? '')),
    rootId: Number(v.root_id ?? v.id),
    imutavel: Number(v.is_immutable) === 1,
    rotulo: String(v.rotulo || ''),
  };
}

/** Junta estrofes num texto único, com a mesma regra do modo letra completa. */
function juntarEstrofesParaComparativo(estrofes) {
  return (estrofes || [])
    .map((s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, ''))
    .join('\n\n');
}

function preencherPainelComparativo() {
  if (!estadoPainel.comparativoLados) return;
  for (const lado of ['a', 'b']) {
    const dados = estadoPainel.comparativoLados[lado];
    const ta = comparativoTextarea(lado);
    const rotulo = document.getElementById(`comparativo-rotulo-${lado}`);
    const selo = document.getElementById(`comparativo-selo-${lado}`);
    if (ta) ta.value = juntarEstrofesParaComparativo(dados.estrofes);
    if (rotulo) rotulo.textContent = dados.rotuloExibicao;
    if (selo) {
      selo.hidden = !dados.imutavel;
      selo.title = dados.imutavel
        ? 'O ORIGINAL nunca é alterado: gravar mudanças deste lado cria uma cópia nova.'
        : '';
    }
  }
}

/** Estrofes actuais de um lado, lidas do textarea. */
function estrofesLadoComparativo(lado) {
  const ta = comparativoTextarea(lado);
  if (!ta) return [];
  return splitTextoLetraCompletaEmEstrofes(ta.value);
}

export function comparativoSujoVsSnapshot() {
  if (!estadoPainel.modoComparativoCentral || !estadoPainel.snapshotComparativo) return false;
  return ['a', 'b'].some(
    (lado) => !estrofesArraysIguaisParaEdicao(estrofesLadoComparativo(lado), estadoPainel.snapshotComparativo[lado])
  );
}

/**
 * Visibilidade do painel comparativo.
 *
 * Enquanto está activo manda no layout da coluna central: esconde tanto os
 * cartões por slide como o painel de letra completa.
 */
export function aplicarLayoutModoComparativo() {
  const wrap = document.getElementById('centro-comparativo-wrap');
  if (!wrap) return;
  if (!estadoPainel.musicaAtiva) {
    estadoPainel.modoComparativoCentral = false;
    estadoPainel.comparativoLados = null;
    estadoPainel.snapshotComparativo = null;
  }
  const on = estadoPainel.modoComparativoCentral;
  wrap.hidden = !on;
  if (on) {
    const ed = document.getElementById('estrofes-slide-editor');
    const full = document.getElementById('centro-letra-completa-wrap');
    if (ed) ed.style.display = 'none';
    if (full) full.hidden = true;
    realcesComparativo.ligar();
  } else {
    realcesComparativo.limpar();
  }
}

/** Abre o modo, perguntando antes que duas versões comparar. */
async function abrirModoComparativo() {
  if (!estadoPainel.musicaAtiva) return;
  if (estadoPainel.musicaBancoFonte === 'catalog') {
    await appAlert(
      'Música do catálogo: não há versões para comparar. Importe-a para o seu banco primeiro.',
      'Modo comparativo'
    );
    return;
  }
  if (
    !(await confirmarProsseguirDescartandoEdicaoPendente(
      'Há alterações não gravadas nesta sessão. Descartar e abrir o modo comparativo?',
      'Alterações não gravadas'
    ))
  ) {
    return;
  }

  const { rootId, versoes, totalVersoesBrutas } = await carregarVersoesParaComparativo();
  if (versoes.length < 2) {
    /* Só uma versão no banco: falta o que criar para comparar. Duas ou mais,
       mas reduzidas a uma só por serem rigorosamente idênticas (mesmo critério
       de `opcoesVersaoDistintasPorConteudo`): já existem versões — só não há
       diferença entre elas. */
    await appAlert(
      totalVersoesBrutas > 1
        ? 'Todas as versões desta música são idênticas. Não há diferenças para comparar.'
        : 'Esta música tem só uma versão no banco. Crie uma cópia (chip «Nova versão») para poder comparar.',
      'Modo comparativo'
    );
    return;
  }

  const escolha = await escolherVersoesParaComparar(versoes, rootId);
  if (!escolha) return;

  try {
    const [a, b] = await Promise.all([
      carregarLadoComparativo(escolha.idA),
      carregarLadoComparativo(escolha.idB),
    ]);
    const acharVersao = (id) => versoes.find((v) => Number(v.id) === Number(id)) || null;
    a.rotuloExibicao = rotuloVersaoComparativo(acharVersao(a.id) || { ...a, parent_id: a.imutavel ? null : 1 }, rootId);
    b.rotuloExibicao = rotuloVersaoComparativo(acharVersao(b.id) || { ...b, parent_id: b.imutavel ? null : 1 }, rootId);
    estadoPainel.comparativoLados = { a, b };
    estadoPainel.snapshotComparativo = {
      a: a.estrofes.map((s) => String(s)),
      b: b.estrofes.map((s) => String(s)),
    };
    estadoPainel.modoComparativoCentral = true;
    aplicarLayoutModoComparativo();
    preencherPainelComparativo();
    realcesComparativo.agendar();
    atualizarToolbarModoEdicao();
  } catch (e) {
    estadoPainel.comparativoLados = null;
    estadoPainel.snapshotComparativo = null;
    estadoPainel.modoComparativoCentral = false;
    aplicarLayoutModoComparativo();
    await appAlert(e?.message || 'Não foi possível abrir o modo comparativo.', 'Modo comparativo');
  }
}

/** Fecha o painel e devolve a coluna central ao estado anterior. */
export function fecharModoComparativo() {
  estadoPainel.modoComparativoCentral = false;
  estadoPainel.comparativoLados = null;
  estadoPainel.snapshotComparativo = null;
  aplicarLayoutModoComparativo();
  /* Devolve os cartões por slide (ou o painel de letra completa, se estivesse aberto). */
  aplicarLayoutModoLetraCompleta();
  atualizarToolbarModoEdicao();
}

/**
 * Grava os lados que mudaram, um pedido por versão.
 *
 * Gravar sobre o ORIGINAL não o altera: o servidor bifurca e cria uma cópia
 * nova (`forked`), que é exactamente a protecção que se quer. O utilizador é
 * avisado quando isso acontece.
 */
export async function salvarComparativoNoServidor() {
  if (!estadoPainel.modoComparativoCentral || !estadoPainel.comparativoLados || !estadoPainel.snapshotComparativo) return false;
  const api = getControllerApiBase();
  const bifurcados = [];
  const gravados = [];

  for (const lado of ['a', 'b']) {
    const dados = estadoPainel.comparativoLados[lado];
    const estrofes = estrofesLadoComparativo(lado);
    if (estrofesArraysIguaisParaEdicao(estrofes, estadoPainel.snapshotComparativo[lado])) continue;
    if (!estrofes.length || estrofes.every((s) => !String(s).trim())) {
      await appAlert(
        `A versão «${dados.rotuloExibicao}» ficou sem nenhuma estrofe. Escreva ao menos uma linha antes de gravar.`,
        'Modo comparativo'
      );
      return false;
    }
    try {
      const res = await fetch(`${api}/api/musicas/${dados.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: dados.titulo, artista: dados.artista, estrofes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.erro || `Erro HTTP ${res.status}`);
      gravados.push(dados.id);
      if (data.forked) bifurcados.push({ rotulo: dados.rotuloExibicao, id: Number(data.id) });
    } catch (e) {
      await appAlert(
        `Não foi possível gravar a versão «${dados.rotuloExibicao}»: ${e?.message || e}`,
        'Modo comparativo'
      );
      return false;
    }
  }

  if (!gravados.length) return true;

  await carregarMusicas();
  const rootId = obterRootIdMusicaAtiva();
  if (Number.isFinite(rootId)) await carregarVersoesMusicaServidor(rootId);
  /* Se um dos lados era a versão aberta no editor, recarrega-a para os cartões
     e a pré-visualização mostrarem o texto novo. */
  if (estadoPainel.musicaAtiva && gravados.some((id) => Number(id) === Number(estadoPainel.musicaAtiva.id))) {
    await recarregarMusicaAtivaDoServidor();
  }

  if (bifurcados.length) {
    const lista = bifurcados.map((b) => `«${b.rotulo}»`).join(' e ');
    await appAlert(
      `O ORIGINAL não é alterado: as mudanças em ${lista} foram gravadas numa cópia nova, visível na barra de versões.`,
      'Original preservado'
    );
  }
  return true;
}

/** Recarrega `musicaAtiva` do servidor mantendo o slide seleccionado. */
async function recarregarMusicaAtivaDoServidor() {
  if (!estadoPainel.musicaAtiva || estadoPainel.musicaAtiva.id == null) return;
  try {
    const res = await fetch(`${getControllerApiBase()}/api/musicas/${Number(estadoPainel.musicaAtiva.id)}`);
    if (!res.ok) return;
    const nova = await res.json();
    if (!nova || !Array.isArray(nova.estrofes)) return;
    estadoPainel.musicaAtiva = nova;
    estadoPainel.musicaRootId = Number(nova.root_id ?? nova.id);
    const n = estadoPainel.musicaAtiva.estrofes.length;
    if (estadoPainel.estrofeAtiva > n) estadoPainel.estrofeAtiva = n;
    if (estadoPainel.estrofeAtiva < -1) estadoPainel.estrofeAtiva = -1;
    renderSlidesStrip();
    renderEstrofesEditor();
    atualizarPreviewOperador();
    marcacaoEstrofeEditor();
  } catch (_) {
    // intencional — a gravação já foi feita; o painel recarrega na próxima seleção
  }
}

/**
 * Botão da barra: abre o modo (escolher as duas versões a comparar).
 *
 * Puramente navegação, como o toggle da letra completa — enquanto o modo está
 * activo o botão fica desabilitado (ver `atualizarToolbarModoComparativo`) e
 * quem grava ou descarta é sempre «Salvar alterações» / «Cancelar» da barra
 * padrão (`acionarSalvarAlteracoesBarraPadrao` / `acionarCancelarBarraPadrao`).
 */
export async function alternarModoComparativoCentral() {
  if (!estadoPainel.musicaAtiva) return;
  if (estadoPainel.modoComparativoCentral) {
    await cancelarModoComparativoCentral();
    return;
  }
  await abrirModoComparativo();
}

/**
 * Sai do comparativo antes de trocar para outro modo (pede confirmação se houver
 * alterações). Devolve true quando o comparativo já não está activo.
 */
export async function sairModoComparativoParaTrocarModo() {
  if (!estadoPainel.modoComparativoCentral) return true;
  await cancelarModoComparativoCentral();
  return !estadoPainel.modoComparativoCentral;
}
