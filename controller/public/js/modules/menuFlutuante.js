/**
 * Menu flutuante — base única dos menus de contexto do painel do Controlador.
 *
 * ## Porquê um módulo, e não um menu escrito à mão por caso de uso
 *
 * O painel tinha dois menus flutuantes redigidos separadamente — ações do tema da playlist
 * e faixa de slides — cada um com o seu markup no `controller.html`, o seu bloco de CSS
 * quase igual ao do vizinho e a sua própria cópia dos listeners que fecham o menu. E o
 * que era acidental divergia: só o dos temas fechava ao perder o foco da janela.
 *
 * Aqui o markup é gerado a partir da lista de itens, a aparência vem de um só bloco CSS
 * (`.menu-flutuante`, em `controller.html`) e o fecho é resolvido por listeners globais
 * instalados uma única vez. Acrescentar um menu passa a ser descrever os seus itens.
 *
 * ## Um menu aberto por vez
 *
 * «Qual menu está aberto» é estado do módulo, não de cada instância: abrir um fecha o
 * outro. É o que se espera de um menu de contexto, e é o que permite os listeners globais
 * — sem esse registo central cada instância teria de escutar o documento por conta própria,
 * que é exactamente a duplicação que este módulo existe para eliminar.
 *
 * ## Duas ancoragens, porque as duas listas são lidas de maneiras diferentes
 *
 * `abrirNoPonto` faz o menu nascer onde o rato está — é o que se espera do botão direito
 * numa lista longa e rolável, como a Biblioteca de Músicas: o menu aparece junto da linha
 * clicada e o operador não perde a referência visual.
 *
 * `abrirNaAncora` prende o menu a um elemento fixo do painel, sempre no mesmo lugar. É o
 * caso dos temas da playlist: a lista abre num dropdown que fecha ao escolher, e um menu
 * a saltar pelo ecrã conforme o item clicado obrigava o operador a reprocurá-lo a cada
 * abertura. Aqui o alvo é sempre o botão «TEMA NA PLAYLIST», e só o conteúdo muda.
 *
 * Nos dois casos o menu recua apenas o suficiente para não ser cortado pela borda.
 *
 * ## `svg` é markup confiável; `rotulo` e `titulo` não são
 *
 * `svg` entra por `innerHTML`, logo só aceita constantes escritas no próprio código —
 * nunca dados que venham do servidor ou do utilizador. `rotulo` e `titulo` vão por
 * `textContent` e por isso podem conter nome de tema ou título de música à vontade.
 */

/** Folga mínima entre o menu e a borda da janela, para nunca aparecer cortado. */
const FOLGA_BORDA_PX = 8;

/** Respiro entre a âncora e o menu, para não parecerem um bloco só. */
const FOLGA_ANCORA_PX = 10;

/** Instância aberta neste momento, ou `null`. Ver «Um menu aberto por vez». */
let menuAbertoAtual = null;

let listenersGlobaisInstalados = false;

function fecharMenuAbertoSeForaDe(alvo) {
  if (!menuAbertoAtual) return;
  if (alvo instanceof Node && menuAbertoAtual.node.contains(alvo)) return;
  menuAbertoAtual.fechar();
}

function instalarListenersGlobais() {
  if (listenersGlobaisInstalados) return;
  listenersGlobaisInstalados = true;

  document.addEventListener('click', (e) => fecharMenuAbertoSeForaDe(e.target));
  /* Botão direito noutro sítio fecha o que estava aberto; se o novo sítio também tiver
     menu, o handler dele reabre em seguida, já na posição nova. */
  document.addEventListener('contextmenu', (e) => fecharMenuAbertoSeForaDe(e.target));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharMenuFlutuanteAberto();
  });
  window.addEventListener('resize', () => fecharMenuFlutuanteAberto());
  window.addEventListener('blur', () => fecharMenuFlutuanteAberto());
}

/**
 * Coloca o canto superior esquerdo do menu em (x, y), recuando só o necessário para caber
 * na janela.
 *
 * A medição é feita com o menu já visível mas fora do ecrã: o tamanho depende dos itens,
 * que mudam a cada abertura, logo não há como saber a largura antes de o montar.
 *
 * @param {HTMLElement} node
 * @param {number} x
 * @param {number} y
 */
function colocarMenu(node, x, y) {
  node.hidden = false;
  node.style.left = '-9999px';
  node.style.top = '0';

  const { width, height } = node.getBoundingClientRect();
  const xMax = Math.max(FOLGA_BORDA_PX, window.innerWidth - width - FOLGA_BORDA_PX);
  const yMax = Math.max(FOLGA_BORDA_PX, window.innerHeight - height - FOLGA_BORDA_PX);

  node.style.left = `${Math.min(Math.max(x, FOLGA_BORDA_PX), xMax)}px`;
  node.style.top = `${Math.min(Math.max(y, FOLGA_BORDA_PX), yMax)}px`;
}

/**
 * Um item do menu.
 *
 * @typedef {object} ItemMenuFlutuante
 * @property {string} rotulo Texto visível. Vai por `textContent`.
 * @property {string} [svg] Ícone. Markup estático do código — ver nota no topo.
 * @property {'perigo'} [variante] Ações destrutivas, realçadas a vermelho.
 * @property {boolean} [separadorAntes] Traço acima do item, para afastar do que vem antes.
 * @property {() => void|Promise<void>} aoEscolher Corre depois de o menu fechar.
 */

/**
 * @typedef {object} ConteudoMenuFlutuante
 * @property {string} [titulo]
 * @property {ItemMenuFlutuante[]} itens
 */

/**
 * @typedef {object} MenuFlutuante
 * @property {HTMLElement} node
 * @property {(clientX: number, clientY: number, conteudo: ConteudoMenuFlutuante) => void} abrirNoPonto
 * @property {(ancora: Element, conteudo: ConteudoMenuFlutuante) => void} abrirNaAncora
 * @property {() => void} fechar
 * @property {() => boolean} estaAberto
 */

/**
 * Cria um menu flutuante. Chamar uma vez por menu, no carregamento — o nó vive no
 * `<body>` e é reaproveitado em todas as aberturas.
 *
 * @param {{id: string, rotuloAria?: string}} opcoes
 * @returns {MenuFlutuante}
 */
export function criarMenuFlutuante({ id, rotuloAria }) {
  instalarListenersGlobais();

  let node = null;

  function garantirNode() {
    if (node) return node;
    node = document.createElement('div');
    node.id = id;
    node.className = 'menu-flutuante';
    node.setAttribute('role', 'menu');
    if (rotuloAria) node.setAttribute('aria-label', rotuloAria);
    node.hidden = true;
    document.body.appendChild(node);
    return node;
  }

  const menu = {
    get node() {
      return garantirNode();
    },

    estaAberto() {
      return menuAbertoAtual === menu;
    },

    fechar() {
      if (menuAbertoAtual === menu) menuAbertoAtual = null;
      if (node) node.hidden = true;
    },

    abrirNoPonto(clientX, clientY, conteudo) {
      const el = montarConteudo(conteudo);
      if (!el) return;
      colocarMenu(el, clientX, clientY);
      menuAbertoAtual = menu;
    },

    /** Sempre abaixo da âncora e alinhado à esquerda dela — ver «Duas ancoragens». */
    abrirNaAncora(ancora, conteudo) {
      if (!ancora) return;
      const el = montarConteudo(conteudo);
      if (!el) return;
      const r = ancora.getBoundingClientRect();
      colocarMenu(el, r.left, r.bottom + FOLGA_ANCORA_PX);
      menuAbertoAtual = menu;
    },
  };

  /**
   * Monta o markup dos itens e devolve o nó pronto a posicionar (ainda oculto), ou `null`
   * se não houver nada para mostrar.
   *
   * @param {ConteudoMenuFlutuante} [conteudo]
   * @returns {HTMLElement|null}
   */
  function montarConteudo({ titulo, itens } = {}) {
    const lista = Array.isArray(itens) ? itens.filter(Boolean) : [];
    if (!lista.length) return null;

    fecharMenuFlutuanteAberto();

    const el = garantirNode();
    el.innerHTML = '';

    if (titulo) {
      const h = document.createElement('p');
      h.className = 'menu-flutuante-titulo';
      h.textContent = titulo;
      el.appendChild(h);
    }

    lista.forEach((item, i) => {
      /* Separador só entre itens: um traço no topo do menu não separaria nada. */
      if (item.separadorAntes && i > 0) {
        const hr = document.createElement('div');
        hr.className = 'menu-flutuante-separador';
        hr.setAttribute('role', 'separator');
        el.appendChild(hr);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'menuitem');
      btn.className =
        'menu-flutuante-item' +
        (item.variante === 'perigo' ? ' menu-flutuante-item--perigo' : '');
      if (item.svg) btn.innerHTML = item.svg;
      btn.appendChild(document.createTextNode(item.rotulo || ''));
      /* `await` para que uma acção assíncrona que rejeite caia neste catch, e não num
         unhandled rejection que só apareceria no console do DevTools. */
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.fechar();
        try {
          await item.aoEscolher?.();
        } catch (err) {
          console.error('[Lyra] menuFlutuante', err);
        }
      });
      el.appendChild(btn);
    });

    return el;
  }

  return menu;
}

/**
 * Fecha o menu que estiver aberto, se houver.
 *
 * Existe para quem precisa de limpar a UI sem saber qual menu está no ar — por exemplo o
 * painel a trocar de modo, que antes escondia o nó pelo `id` e deixava o registo interno
 * a acreditar que ainda havia menu aberto.
 */
export function fecharMenuFlutuanteAberto() {
  menuAbertoAtual?.fechar();
}
