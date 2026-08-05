/**
 * Divisão automática de versículos longos.
 *
 * Módulo puro: sem DOM, sem `localStorage`, sem estado global. Tudo entra por parâmetro,
 * o que o torna testável com `node --test` (ver `dividirVersiculos.test.mjs`).
 *
 * REGRA DE OURO (ver `docs/architecture/divisao-automatica-versiculos.md`, §6):
 * este módulo é chamado num único ponto do painel — `bibliaRederivarPartesCapitulo()`
 * em `controllerAppCore.js`. Nem o render do seletor nem a projeção dividem seja o que
 * for: os dois consomem `bibliaVersiculosCapitulo`, que já vem dividido. Se
 * `dividirTextoVersiculo` aparecer importado noutro sítio, a mudança está errada.
 *
 * Com a opção desligada, `dividirVersiculos` é a função identidade — uma parte por
 * versículo, texto intacto. É isso que dispensa qualquer `if (divisaoAtiva)` nos
 * consumidores.
 */

/** Limites oferecidos na configuração do modo Bíblia. */
export const LIMITES_DIVISAO_VERSICULO = [100, 150, 200, 250];

/** Limite assumido quando não há preferência guardada (ou ela é inválida). */
export const LIMITE_DIVISAO_PADRAO = 150;

/** Reticências de emenda entre partes (U+2026, um só caractere). */
export const MARCA_CONTINUACAO = '…';

/* Pontuação que fecha uma frase — o corte preferido. */
const FIM_DE_FRASE = new Set(['.', '!', '?', ';', ':']);

/* Pontuação que fecha uma oração — segunda escolha. */
const FIM_DE_ORACAO = new Set([',', '—', '–']);

/* Aspas e parênteses que podem vir DEPOIS da pontuação e antes do espaço. */
const FECHAMENTOS = new Set(['"', "'", '”', '’', '»', '›', ')', ']', '}']);

/** Fração do limite abaixo da qual não se corta (evita partes minúsculas). */
const FRACAO_PISO = 0.5;

/** Folga sobre o tamanho-alvo, para o corte poder procurar pontuação um pouco à frente. */
const FOLGA_ALVO = 1.15;

/**
 * Ajusta um limite vindo da UI ou do `localStorage` para um dos valores permitidos.
 *
 * Ausente, vazio ou não-numérico → `LIMITE_DIVISAO_PADRAO`. Numérico fora da lista →
 * o permitido mais próximo (empate resolve para o menor, pela ordem da lista).
 */
export function normalizarLimiteDivisao(valor) {
  if (valor == null || valor === '') return LIMITE_DIVISAO_PADRAO;
  const n = Number(valor);
  if (!Number.isFinite(n)) return LIMITE_DIVISAO_PADRAO;
  let melhor = LIMITES_DIVISAO_VERSICULO[0];
  let menorDistancia = Infinity;
  for (const limite of LIMITES_DIVISAO_VERSICULO) {
    const distancia = Math.abs(limite - n);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      melhor = limite;
    }
  }
  return melhor;
}

/**
 * Colapsa espaços e quebras internas num único espaço.
 *
 * Algumas traduções em SQLite trazem espaços duplos e `\n` no meio do versículo; sem
 * isto o cálculo de comprimento mente e o corte cai em sítios estranhos.
 */
export function normalizarTextoVersiculo(texto) {
  return String(texto == null ? '' : texto)
    .replace(/\s+/g, ' ')
    .trim();
}

/** `true` se o corte em `c` vem logo a seguir a pontuação do conjunto dado. */
function terminaEmPontuacao(texto, c, conjunto) {
  let i = c - 1;
  while (i >= 0 && FECHAMENTOS.has(texto[i])) i--;
  return i >= 0 && conjunto.has(texto[i]);
}

const ehFimDeFrase = (texto, c) => terminaEmPontuacao(texto, c, FIM_DE_FRASE);
const ehFimDeOracao = (texto, c) => terminaEmPontuacao(texto, c, FIM_DE_ORACAO);
const ehFimDePalavra = () => true;

/**
 * Maior corte em `[piso, teto]` que caia num limite de token e satisfaça `aceitar`.
 * Devolve 0 quando não há candidato.
 */
function melhorCorte(texto, piso, teto, aceitar) {
  for (let c = teto; c >= piso; c--) {
    if (texto[c] !== ' ') continue;
    if (aceitar(texto, c)) return c;
  }
  return 0;
}

/**
 * Onde cortar o próximo pedaço, pela cascata de preferência:
 * fim de frase → fim de oração → fim de palavra → corte seco.
 *
 * Garantidamente `>= 1`, o que impede laço infinito em `dividirTextoVersiculo`.
 */
function escolherCorte(texto, limite, alvo) {
  const teto = Math.max(1, Math.min(limite, Math.ceil(alvo * FOLGA_ALVO)));
  const piso = Math.max(1, Math.min(teto, Math.floor(limite * FRACAO_PISO)));
  return (
    melhorCorte(texto, piso, teto, ehFimDeFrase) ||
    melhorCorte(texto, piso, teto, ehFimDeOracao) ||
    melhorCorte(texto, piso, teto, ehFimDePalavra) ||
    /* Rede: nenhuma emenda na janela ideal — aceita qualquer espaço até ao limite. */
    melhorCorte(texto, 1, limite, ehFimDePalavra) ||
    /* Palavra única maior que o limite: corte seco, sem hífen. Hifenizar em português
       exigiria dicionário, e um hífen errado é pior que um corte seco. */
    limite
  );
}

/**
 * Quebra um texto em pedaços de até `limite` caracteres. Devolve sempre pelo menos um
 * pedaço, **sem** reticências — a decoração é aplicada por `dividirVersiculos`.
 *
 * O tamanho-alvo de cada pedaço é recalculado a cada volta a partir do que resta
 * (`ceil(resto / ceil(resto / limite))`). Sem isso, 260 caracteres com limite 250 dariam
 * `250 + 10` — um card com uma linha órfã; com o alvo, dão `~130 + ~130`. Recalcular a
 * cada volta (em vez de fixar o alvo no início) mantém o equilíbrio mesmo quando um corte
 * cai longe do ideal por falta de pontuação.
 */
export function dividirTextoVersiculo(texto, limite) {
  const lim = normalizarLimiteDivisao(limite);
  const base = normalizarTextoVersiculo(texto);
  if (!base || base.length <= lim) return [base];

  const pedacos = [];
  let resto = base;
  while (resto.length > lim) {
    const alvo = Math.ceil(resto.length / Math.ceil(resto.length / lim));
    const corte = escolherCorte(resto, lim, alvo);
    pedacos.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) pedacos.push(resto);
  return pedacos;
}

/**
 * Converte versículos em **partes** prontas para o seletor e para a projeção.
 *
 * Cada parte preserva os campos do versículo original (`livro`, `capitulo`, `versiculo`,
 * `traducao`…) e acrescenta:
 *   `texto`         — o texto da parte, já com as reticências de emenda;
 *   `textoOriginal` — o versículo inteiro, sem cortes nem decoração;
 *   `parteIndice`   — 0-based;
 *   `parteTotal`    — 1 quando não houve divisão;
 *   `chave`         — identificador estável da parte.
 *
 * A referência **não** muda entre partes: as duas metades de Gênesis 1:12 continuam a ser
 * «Gênesis 1:12» no telão. A divisão é apresentação, não renumeração do texto bíblico.
 *
 * @param {object[]} versiculos Linhas de `/api/biblia/:traducao/:livro/:cap`, já anotadas.
 * @param {{ativo?: boolean, limite?: number|string}} opcoes
 * @returns {object[]} Partes, na ordem de leitura.
 */
export function dividirVersiculos(versiculos, opcoes = {}) {
  if (!Array.isArray(versiculos)) return [];
  const ativo = opcoes.ativo === true;
  const limite = normalizarLimiteDivisao(opcoes.limite);

  const partes = [];
  for (const item of versiculos) {
    const versiculo = item && typeof item === 'object' ? item : {};
    const textoOriginal = versiculo.texto != null ? String(versiculo.texto) : '';
    const precisaDividir =
      ativo && normalizarTextoVersiculo(textoOriginal).length > limite;
    /* Sem divisão o texto sai intacto — nem sequer normalizado. Identidade a sério. */
    const pedacos = precisaDividir
      ? dividirTextoVersiculo(textoOriginal, limite)
      : [textoOriginal];

    const parteTotal = pedacos.length;
    pedacos.forEach((pedaco, parteIndice) => {
      const temAnterior = parteIndice > 0;
      const temSeguinte = parteIndice < parteTotal - 1;
      partes.push({
        ...versiculo,
        texto:
          (temAnterior ? MARCA_CONTINUACAO : '') +
          pedaco +
          (temSeguinte ? ` ${MARCA_CONTINUACAO}` : ''),
        textoOriginal,
        parteIndice,
        parteTotal,
        chave: chaveDaParte(versiculo, parteIndice),
      });
    });
  }
  return partes;
}

/** Identificador estável de uma parte — substitui a comparação por número de versículo. */
export function chaveDaParte(versiculo, parteIndice) {
  const v = versiculo && typeof versiculo === 'object' ? versiculo : {};
  return `${v.livro ?? ''}|${v.capitulo ?? ''}|${v.versiculo ?? ''}|${parteIndice}`;
}

/**
 * Índice, na lista de partes, da **primeira** parte de um versículo.
 *
 * Usado por «ir para o versículo N» e pela navegação por voz: uma referência aponta
 * sempre para o início do versículo, nunca para o meio. Devolve -1 se não existir.
 */
export function indicePrimeiraParteDoVersiculo(partes, numeroVersiculo) {
  if (!Array.isArray(partes)) return -1;
  const alvo = String(numeroVersiculo == null ? '' : numeroVersiculo).trim();
  if (!alvo) return -1;
  return partes.findIndex(
    (p) => String(p?.versiculo ?? '').trim() === alvo && (p?.parteIndice ?? 0) === 0
  );
}
