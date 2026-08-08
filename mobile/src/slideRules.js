/**
 * Regras de divisão/junção de texto em slides para o projetor Lyra.
 *
 * Mantido alinhado ao controlador web (`splitTextoEmEstrofesPorLinhaVaziaStrict`
 * e `juntarEstrofesParaLetraCompleta` em controllerAppCore.js). Qualquer alteração
 * aqui deve ser refletida no controlador.
 */

/**
 * Junta os slides num texto único para o modo «letra completa» (mesmo join do PC).
 * Cada slide é separado por uma linha totalmente vazia (`\n\n`).
 *
 * @param {string[]|null|undefined} estrofes
 * @returns {string}
 */
export function juntarEstrofesParaLetraCompleta(estrofes) {
  if (!Array.isArray(estrofes) || estrofes.length === 0) return '';
  return estrofes
    .map((s) => String(s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+$/, ''))
    .join('\n\n');
}

/**
 * Divide um texto em estrofes (slides) usando apenas linhas **totalmente vazias** como separador.
 *
 * Regra idêntica à do controlador web:
 * - Linha totalmente vazia (sem nenhum caractere) → cria um novo slide
 * - Linha com apenas espaços → NÃO separa slides (é um "respiro" visual dentro do mesmo slide)
 *
 * Exemplos:
 * ```
 * "Verso 1\nVerso 2\n\nVerso 3" → ["Verso 1\nVerso 2", "Verso 3"]
 * "Verso 1\n \nVerso 2"         → ["Verso 1\n \nVerso 2"]  (linha com espaço = mesmo slide)
 * ```
 *
 * @param {string} texto - Texto completo com quebras de linha (pode ser `null`/`undefined`)
 * @returns {string[]} Array de estrofes; nunca vazio — retorna `['']` se a entrada for vazia
 */
export function splitTextoEmEstrofesPorLinhaVaziaStrict(texto) {
  // Normaliza quebras de linha para \n independente do sistema operacional
  const t = String(texto ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Texto vazio → um slide vazio (necessário para o editor não quebrar)
  if (t === '') return [''];

  const lines = t.split('\n');
  const estrofes = [];
  let cur = []; // Acumula linhas do slide atual

  for (const line of lines) {
    if (line === '') {
      // Linha totalmente vazia → finaliza o slide atual e inicia um novo
      if (cur.length) {
        estrofes.push(cur.join('\n'));
        cur = [];
      }
      // Linhas vazias consecutivas são ignoradas (não criam slides em branco)
    } else {
      // Linha com conteúdo (inclusive só espaços) → adiciona ao slide atual
      cur.push(line);
    }
  }

  // Adiciona o último slide se houver conteúdo pendente (texto sem linha vazia no fim)
  if (cur.length) estrofes.push(cur.join('\n'));

  return estrofes.length ? estrofes : [''];
}

/**
 * Gera um identificador único para um novo slide no editor local.
 * Usado como `key` no FlatList para evitar re-renders desnecessários.
 *
 * @returns {string} ID no formato "s-{timestamp}-{aleatório}"
 */
export function novoIdSlide() {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
