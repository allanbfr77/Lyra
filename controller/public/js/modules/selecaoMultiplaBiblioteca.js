/**
 * =============================================================================
 * Lyra — Modo de seleção múltipla da Biblioteca
 * =============================================================================
 *
 * ## O que resolve
 *
 * Preparar um culto é, muitas vezes, mexer em várias músicas de uma vez: mandar seis
 * títulos para a playlist, limpar uma dúzia de importações duplicadas. Uma a uma, isso
 * são dezenas de cliques e o menu de contexto aberto outras tantas vezes.
 *
 * ## Porquê um modo, e não checkboxes sempre à vista
 *
 * A Biblioteca é uma lista de varredura: o operador percorre-a a preparar o culto e, por
 * vezes, ao vivo no meio dele. O que conta é quantos títulos cabem sem rolar e com que
 * rapidez o olho encontra um. Uma coluna de caixas em todas as linhas rouba essa largura
 * e esse sossego para servir uma tarefa que é ocasional. Por isso a seleção é um MODO:
 * entra-se nele de propósito, faz-se o lote, sai-se. Fora dele a lista é exactamente o
 * que sempre foi — um clique abre a música, o «+» adiciona à playlist.
 *
 * ## Porquê só a fonte `user`
 *
 * A Biblioteca mistura duas origens. As da fonte `user` vivem no banco deste PC: podem
 * ser editadas, duplicadas e excluídas. As da fonte `catalog` vêm do catálogo embutido no
 * instalador — são só de leitura, e por isso nem sequer abrem menu de contexto hoje.
 * Deixá-las entrar num lote criaria um lote que só funciona pela metade: a exclusão
 * ignorava-as em silêncio e a contagem mentiria sobre o que vai acontecer. Fica de fora
 * quem não pode ser tratado por igual — ver `podeSelecionarFonte`.
 *
 * ## Porquê `Set` e não array
 *
 * Marcar e desmarcar é a operação central e acontece a cada clique; num array seria uma
 * varredura por clique. O `Set` ainda preserva a ordem de inserção, que é a ordem em que
 * o operador escolheu — é essa que as ações em lote seguem, para o resultado na playlist
 * espelhar a intenção dele e não a ordem alfabética da lista.
 *
 * ## Porquê chave composta
 *
 * O `id` sozinho não identifica uma linha: o mesmo número pode existir no banco local e
 * no catálogo. A chave junta fonte e id — a mesma composição que o resto da Biblioteca já
 * usa para saber se uma música está na playlist.
 *
 * Módulo puro de propósito: não toca no DOM nem em `localStorage`. Quem desenha é o
 * `controllerAppCore.js`; aqui só vive o estado do lote, que é o que se pode testar.
 */

/** Única fonte cujas músicas podem entrar num lote. Ver o cabeçalho. */
export const FONTE_SELECIONAVEL = 'user';

/**
 * A seleção morre com a sessão do modo — nunca é persistida.
 * @returns {{ ativo: boolean, chaves: Set<string> }}
 */
export function criarEstadoSelecao() {
  return { ativo: false, chaves: new Set() };
}

/**
 * @param {string} fonte
 * @returns {boolean}
 */
export function podeSelecionarFonte(fonte) {
  return String(fonte || '') === FONTE_SELECIONAVEL;
}

/**
 * Chave composta de uma linha da Biblioteca.
 * @param {number|string} id
 * @param {string} fonte
 * @returns {string}
 */
export function chaveSelecao(id, fonte) {
  return `${String(fonte || '')}:${String(id)}`;
}

/** Id numérico de volta a partir da chave. `null` se a chave não trouxer um número. */
export function idDaChaveSelecao(chave) {
  const n = Number(String(chave || '').split(':').slice(1).join(':'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Entra no modo. Aceita uma chave inicial porque o gatilho é o menu de contexto de uma
 * linha: quem escolheu «Selecionar várias» sobre a música X já disse que X entra no lote.
 *
 * @param {{ ativo: boolean, chaves: Set<string> }} estado
 * @param {string|null} [chaveInicial]
 * @returns {boolean} `true` se o estado mudou.
 */
export function ativarSelecao(estado, chaveInicial = null) {
  if (!estado) return false;
  const jaAtivo = estado.ativo;
  estado.ativo = true;
  if (!jaAtivo) estado.chaves.clear();
  if (chaveInicial) estado.chaves.add(String(chaveInicial));
  return !jaAtivo || !!chaveInicial;
}

/**
 * Sai do modo e esquece o lote. Cancelar é sempre uma saída limpa: um lote meio marcado
 * que sobrevivesse à saída voltaria a aparecer marcado na próxima entrada, e ninguém se
 * lembra do que marcou há dez minutos.
 *
 * @param {{ ativo: boolean, chaves: Set<string> }} estado
 * @returns {boolean} `true` se o estado mudou.
 */
export function cancelarSelecao(estado) {
  if (!estado) return false;
  const mudou = estado.ativo || estado.chaves.size > 0;
  estado.ativo = false;
  estado.chaves.clear();
  return mudou;
}

/**
 * Marca/desmarca uma linha. Fora do modo não faz nada — é a garantia de que nenhum
 * caminho do uso normal da Biblioteca consegue começar um lote por acidente.
 *
 * @param {{ ativo: boolean, chaves: Set<string> }} estado
 * @param {string} chave
 * @returns {boolean} `true` se a linha ficou marcada.
 */
export function alternarSelecao(estado, chave) {
  if (!estado || !estado.ativo || !chave) return false;
  const k = String(chave);
  if (estado.chaves.has(k)) {
    estado.chaves.delete(k);
    return false;
  }
  estado.chaves.add(k);
  return true;
}

/**
 * @param {{ chaves: Set<string> }} estado
 * @param {string} chave
 * @returns {boolean}
 */
export function estaSelecionada(estado, chave) {
  return !!estado && !!chave && estado.chaves.has(String(chave));
}

/**
 * @param {{ chaves: Set<string> }} estado
 * @returns {number}
 */
export function totalSelecionadas(estado) {
  return estado ? estado.chaves.size : 0;
}

/**
 * Chaves na ordem em que foram marcadas. Ver o cabeçalho.
 * @param {{ chaves: Set<string> }} estado
 * @returns {string[]}
 */
export function chavesSelecionadas(estado) {
  return estado ? Array.from(estado.chaves) : [];
}

/**
 * Deixa cair as chaves que já não existem na lista.
 *
 * A Biblioteca é reconstruída quando o banco muda — importar, duplicar, excluir. Uma
 * chave órfã no lote seria uma exclusão a pedir um id que já não existe e uma contagem
 * a prometer mais do que há.
 *
 * @param {{ chaves: Set<string> }} estado
 * @param {Iterable<string>} chavesExistentes
 * @returns {number} Quantas chaves foram descartadas.
 */
export function sincronizarSelecaoComLista(estado, chavesExistentes) {
  if (!estado) return 0;
  const vivas = chavesExistentes instanceof Set ? chavesExistentes : new Set(chavesExistentes || []);
  let removidas = 0;
  for (const k of Array.from(estado.chaves)) {
    if (!vivas.has(k)) {
      estado.chaves.delete(k);
      removidas += 1;
    }
  }
  return removidas;
}

/**
 * Texto da contagem. Em português a concordância muda com o número, e «1 selecionadas»
 * num painel que o operador lê de relance é ruído — daí as três formas.
 *
 * @param {number} n
 * @returns {string}
 */
export function rotuloContagemSelecao(n) {
  const q = Number(n) || 0;
  if (q <= 0) return 'Nenhuma selecionada';
  if (q === 1) return '1 selecionada';
  return `${q} selecionadas`;
}

/**
 * Texto do modal de exclusão adaptado ao lote. O modal de uma música mostra o título;
 * com várias, o título deixa de caber e o que importa é o número — dizer «vão ser
 * removidas 12 músicas» antes de uma ação sem volta.
 *
 * @param {number} n
 * @returns {string}
 */
export function rotuloConfirmacaoExclusaoLote(n) {
  const q = Number(n) || 0;
  if (q === 1) return '1 música selecionada';
  return `${q} músicas selecionadas`;
}
