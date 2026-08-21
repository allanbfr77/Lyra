/**
 * Pré-voo — o que se verifica antes de o culto começar.
 *
 * ## O problema
 *
 * A playlist monta-se na quinta e projeta-se no domingo, e entre uma coisa e outra o mundo
 * mexe-se: o Windows renumera os monitores, outro operador apaga uma música, o pen drive
 * com o vídeo sai da máquina. Nada disto avisa. Tudo isto aparece no primeiro slide, à
 * frente da congregação inteira.
 *
 * O que este módulo faz é antecipar essas descobertas para cinco minutos antes, quando
 * ainda são um ajuste e não um problema.
 *
 * ## Regras que valem para tudo o que está aqui
 *
 * **Nada é corrigido automaticamente.** Um pré-voo que arranja as coisas sozinho ensina o
 * operador a não olhar — e no dia em que arranjar mal, ninguém percebe. Aqui só se relata.
 *
 * **Cada achado diz o que fazer.** «Sem tom» não ajuda; «Sem tom para a Ana — defina na
 * playlist» ajuda. O operador está com pressa e não vai investigar.
 *
 * **O silêncio tem de ser fiável.** Uma lista vazia significa mesmo «pode começar». Por
 * isso não há avisos decorativos nem verificações que disparem por dá cá aquela palha: se
 * isto começar a mostrar ruído, deixa de ser lido — e passa a ser pior do que não existir.
 */

/** Impede projetar, ou dá tela preta. Vermelho. */
export const GRAVIDADE_IMPEDE = 'impede';
/** Vai funcionar, mas alguém vai reparar. Amarelo. */
export const GRAVIDADE_ATENCAO = 'atencao';

/**
 * Linhas a mais num slide.
 *
 * Acima disto o auto-ajuste do telão encolhe a letra até ficar difícil de ler do fundo do
 * salão. Não é um erro — é uma estrofe que ficou por partir em duas.
 */
export const MAX_LINHAS_SLIDE = 8;

/** Caracteres a mais numa linha, pelo mesmo motivo. */
export const MAX_CHARS_LINHA = 60;

function achado(gravidade, categoria, titulo, detalhe, extra = {}) {
  return { gravidade, categoria, titulo, detalhe, ...extra };
}

/**
 * Telas: para onde a projeção vai sair.
 *
 * A verificação mais importante das quatro, e a mais barata — os dados já estão na
 * memória do painel. É esta que apanha a tela preta no primeiro louvor.
 *
 * @param {object} rota `{publicoIndex, ministranteIndex, live}` em vigor.
 * @param {object[]} monitores Lista de monitores que o servidor reporta agora.
 * @param {string[]} [nomesEmFalta] Monitores guardados que já não existem.
 */
export function verificarTelas(rota, monitores, nomesEmFalta = []) {
  const out = [];
  const r = rota && typeof rota === 'object' ? rota : {};
  const lista = Array.isArray(monitores) ? monitores : [];
  const secundarios = lista.filter((m) => m && !m.primary);

  if (!secundarios.length) {
    out.push(
      achado(
        GRAVIDADE_IMPEDE,
        'telas',
        'Nenhum monitor de projeção ligado',
        'O Lyra só vê o ecrã principal, e a projeção nunca abre nele. Ligue o telão ou o ' +
          'projetor e verifique se o Windows o reconhece.'
      )
    );
    return out;
  }

  if (r.live) {
    /* Não é defeito: é uma escolha legítima para transmissão. Mas é a escolha que faz o
       salão não ver nada, e vale a pena ser dita em voz alta antes de começar. */
    out.push(
      achado(
        GRAVIDADE_ATENCAO,
        'telas',
        'A saída está em «Live — OBS»',
        'Nada aparece em monitor físico: quem está no salão não vê a letra. Se o culto é ' +
          'presencial, escolha um monitor no seletor do cabeçalho.'
      )
    );
  } else if (!(Number(r.publicoIndex) >= 0)) {
    out.push(
      achado(
        GRAVIDADE_IMPEDE,
        'telas',
        'Nenhum monitor a receber o telão',
        'O canal público está desativado. Escolha o monitor do telão em «Público», no ' +
          'cabeçalho — sem isso a congregação não vê a letra.'
      )
    );
  }

  const faltam = [...new Set((Array.isArray(nomesEmFalta) ? nomesEmFalta : []).filter(Boolean))];
  if (faltam.length) {
    out.push(
      achado(
        GRAVIDADE_ATENCAO,
        'telas',
        faltam.length === 1 ? 'Um monitor guardado desapareceu' : 'Monitores guardados desapareceram',
        `${faltam.join(', ')} — o canal afetado ficou em «Desativado». Costuma acontecer ` +
          'quando o Windows renumera os ecrãs. Volte a escolher o monitor no cabeçalho.'
      )
    );
  }

  return out;
}

/**
 * Tons e ministrantes das músicas do culto.
 *
 * O tom só é «obrigatório» quando há ministrante: sem ninguém atribuído, não há tom que
 * faça sentido exigir, e avisar sobre isso seria exactamente o ruído que faz o pré-voo
 * deixar de ser lido.
 *
 * @param {object[]} itens Músicas da playlist (sem marcadores de tema).
 */
export function verificarTonsEMinistrantes(itens) {
  const lista = Array.isArray(itens) ? itens : [];
  const semMinistrante = [];
  const semTom = [];

  lista.forEach((it) => {
    if (!it) return;
    const titulo = String(it.titulo || it.nome || '').trim() || `Música ${it.id}`;
    const temMinistrante = it.ministranteId != null && String(it.ministranteId).trim() !== '';
    const temTom = String(it.tom || '').trim() !== '';
    if (!temMinistrante) semMinistrante.push(titulo);
    else if (!temTom) semTom.push({ titulo, ministrante: String(it.ministranteNome || '').trim() });
  });

  const out = [];

  if (semTom.length) {
    const nomes = [...new Set(semTom.map((x) => x.ministrante).filter(Boolean))];
    out.push(
      achado(
        GRAVIDADE_ATENCAO,
        'tons',
        `${semTom.length} música(s) sem tom definido`,
        `${semTom.map((x) => x.titulo).join(', ')}. ` +
          (nomes.length
            ? `Quem vai ministrar (${nomes.join(', ')}) chega ao palco sem o tom no monitor. `
            : '') +
          'Defina o tom na coluna da playlist.',
        { itens: semTom.map((x) => x.titulo) }
      )
    );
  }

  if (semMinistrante.length) {
    out.push(
      achado(
        GRAVIDADE_ATENCAO,
        'tons',
        `${semMinistrante.length} música(s) sem ministrante`,
        `${semMinistrante.join(', ')}. Sem ministrante não há tom guardado para reutilizar ` +
          'no próximo culto.',
        { itens: semMinistrante }
      )
    );
  }

  return out;
}

/**
 * Conteúdo das músicas do culto.
 *
 * A única verificação que precisa de ir buscar dados — daí receber as letras já carregadas
 * em vez de as ir buscar sozinha: quem chama sabe fazer isso em paralelo, e este módulo
 * mantém-se testável sem rede.
 *
 * @param {Array<{item: object, musica: object|null, erro?: boolean}>} carregadas
 */
export function verificarLetras(carregadas) {
  const lista = Array.isArray(carregadas) ? carregadas : [];
  const sumiram = [];
  const vazias = [];
  const slidesLongos = [];
  const linhasLongas = [];

  lista.forEach((c) => {
    if (!c) return;
    const titulo =
      String(c.item?.titulo || c.item?.nome || c.musica?.titulo || '').trim() ||
      `Música ${c.item?.id ?? '?'}`;

    if (c.erro || !c.musica) {
      sumiram.push(titulo);
      return;
    }

    const estrofes = Array.isArray(c.musica.estrofes) ? c.musica.estrofes : [];
    const comConteudo = estrofes.filter((e) => String(e ?? '').trim() !== '');
    if (!comConteudo.length) {
      vazias.push(titulo);
      return;
    }

    estrofes.forEach((e, i) => {
      const texto = String(e ?? '');
      /* Comentários do ministrante (`//`) não vão ao telão: contá-los daria falsos
         positivos em músicas cheias de indicações de palco. */
      const linhas = texto.split(/\r\n|\r|\n/).filter((l) => !/^\s*\/\//.test(l));
      const comTexto = linhas.filter((l) => l.trim() !== '');
      if (comTexto.length > MAX_LINHAS_SLIDE) {
        slidesLongos.push(`${titulo} (slide ${i + 1}: ${comTexto.length} linhas)`);
      }
      const maior = comTexto.reduce((m, l) => Math.max(m, l.trim().length), 0);
      if (maior > MAX_CHARS_LINHA) {
        linhasLongas.push(`${titulo} (slide ${i + 1}: ${maior} caracteres)`);
      }
    });
  });

  const out = [];

  if (sumiram.length) {
    out.push(
      achado(
        GRAVIDADE_IMPEDE,
        'letras',
        `${sumiram.length} música(s) da playlist já não existem`,
        `${sumiram.join(', ')}. Foram apagadas do banco depois de entrarem no culto — ao ` +
          'clicar nelas não vai abrir nada. Remova-as da playlist ou volte a adicioná-las.',
        { itens: sumiram }
      )
    );
  }

  if (vazias.length) {
    out.push(
      achado(
        GRAVIDADE_IMPEDE,
        'letras',
        `${vazias.length} música(s) sem letra`,
        `${vazias.join(', ')}. Não têm nenhuma estrofe com texto — projetam tela vazia.`,
        { itens: vazias }
      )
    );
  }

  if (slidesLongos.length) {
    out.push(
      achado(
        GRAVIDADE_ATENCAO,
        'letras',
        `${slidesLongos.length} slide(s) com muitas linhas`,
        `${slidesLongos.join(', ')}. Acima de ${MAX_LINHAS_SLIDE} linhas a letra encolhe ` +
          'para caber e fica difícil de ler do fundo do salão. Costuma ser uma estrofe que ' +
          'ficou por partir em duas.',
        { itens: slidesLongos }
      )
    );
  }

  if (linhasLongas.length) {
    out.push(
      achado(
        GRAVIDADE_ATENCAO,
        'letras',
        `${linhasLongas.length} linha(s) muito compridas`,
        `${linhasLongas.join(', ')}. Linhas com mais de ${MAX_CHARS_LINHA} caracteres ` +
          'partem-se sozinhas no telão, em sítios que nem sempre acompanham a música.',
        { itens: linhasLongas }
      )
    );
  }

  return out;
}

/**
 * Ficheiros do modo Mídias.
 *
 * Só olha para itens com `filePath` — os vídeos. Imagens e PDF viajam embutidos no próprio
 * estado (`data:`), e por isso não têm como desaparecer do disco.
 *
 * @param {Array<{name: string, filePath: string, existe: boolean}>} verificados
 */
export function verificarMidias(verificados) {
  const lista = Array.isArray(verificados) ? verificados : [];
  const sumiram = lista.filter((v) => v && v.filePath && v.existe === false);
  if (!sumiram.length) return [];

  return [
    achado(
      GRAVIDADE_IMPEDE,
      'midias',
      `${sumiram.length} ficheiro(s) de mídia não foram encontrados`,
      `${sumiram.map((v) => v.name || v.filePath).join(', ')}. O ficheiro saiu do sítio ` +
        '(pen drive removido, pasta movida ou renomeada) — ao projetar aparece ecrã preto. ' +
        'Volte a adicioná-los no modo Mídias.',
      { itens: sumiram.map((v) => v.filePath) }
    ),
  ];
}

/** Playlist vazia — nada mais faz sentido verificar a seguir. */
export function verificarPlaylistVazia(itens) {
  const n = Array.isArray(itens) ? itens.length : 0;
  if (n > 0) return [];
  return [
    achado(
      GRAVIDADE_ATENCAO,
      'playlist',
      'O culto não tem nenhuma música',
      'Adicione músicas à playlist, ou escolha outro culto no seletor.'
    ),
  ];
}

/**
 * Junta os achados e resume o estado.
 *
 * A ordem é deliberada: o que impede vem primeiro, e dentro de cada gravidade mantém-se a
 * ordem em que as verificações correram — telas antes de letras, porque é essa a ordem em
 * que as coisas falham no culto.
 *
 * @param {object[][]} grupos
 * @returns {{achados: object[], impedem: number, atencao: number, tudoBem: boolean}}
 */
export function consolidar(grupos) {
  const todos = (Array.isArray(grupos) ? grupos : []).flat().filter(Boolean);
  const impedem = todos.filter((a) => a.gravidade === GRAVIDADE_IMPEDE);
  const atencao = todos.filter((a) => a.gravidade === GRAVIDADE_ATENCAO);
  return {
    achados: [...impedem, ...atencao],
    impedem: impedem.length,
    atencao: atencao.length,
    tudoBem: todos.length === 0,
  };
}

/**
 * Frase de resumo.
 *
 * @param {{impedem: number, atencao: number, tudoBem: boolean}} r
 */
export function resumoPreVoo(r) {
  if (!r || r.tudoBem) return 'Tudo pronto — nada a corrigir.';
  const partes = [];
  if (r.impedem) partes.push(`${r.impedem} ${r.impedem === 1 ? 'problema' : 'problemas'}`);
  if (r.atencao) partes.push(`${r.atencao} ${r.atencao === 1 ? 'aviso' : 'avisos'}`);
  return partes.join(' e ');
}
