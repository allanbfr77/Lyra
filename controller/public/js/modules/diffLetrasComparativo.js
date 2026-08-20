/**
 * Diferenças entre duas letras — motor do Modo Comparativo.
 *
 * Módulo puro: sem DOM, sem `localStorage`, sem estado global. Tudo entra por
 * parâmetro, o que o torna testável com `node --test` (ver
 * `diffLetrasComparativo.test.mjs`).
 *
 * COMO COMPARA (duas passagens)
 *   1. LCS sobre as LINHAS — descobre o que é igual e o que só existe de um lado;
 *   2. dentro de cada bloco divergente, as linhas são emparelhadas pela ordem e,
 *      quando parecidas o bastante, comparadas PALAVRA a palavra. Assim uma
 *      troca de uma só palavra aparece como uma palavra marcada, e não como duas
 *      linhas inteiras acesas.
 *
 * REGRA DE OURO: textos exactamente iguais devolvem `iguais: true` e **nenhuma**
 * marca — nada deve ser destacado nesse caso.
 *
 * As marcas devolvidas descrevem a linha inteira (`texto`), pelo que a
 * reconstrução `partes.map((p) => p.txt).join('')` é sempre idêntica a `texto`.
 * É isso que permite pintá-las numa camada por baixo do textarea sem
 * desalinhamento (ver `realcesComparativo` em `controllerAppCore.js`).
 */

/**
 * Tecto de células da matriz LCS de linhas.
 *
 * Letras de música têm dezenas de linhas; este limite só existe para que um
 * texto colado absurdamente grande não congele o painel. Acima dele, a
 * comparação cai para o alinhamento posicional (linha `i` com linha `i`), que é
 * pior mas instantâneo.
 */
export const LIMITE_CELULAS_LCS = 250000;

/**
 * Fracção mínima de palavras em comum para duas linhas serem consideradas «a
 * mesma linha, alterada» em vez de duas linhas distintas.
 *
 * Abaixo disto, marcar palavra a palavra produziria ruído — nesse caso as duas
 * linhas são apresentadas como exclusivas de cada lado.
 */
export const LIMIAR_LINHA_ALTERADA = 0.34;

/** Normaliza fins de linha (o resto do texto é comparado tal e qual). */
export function normalizarTextoComparativo(texto) {
  return String(texto ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

export function separarLinhasComparativo(texto) {
  return normalizarTextoComparativo(texto).split('\n');
}

/**
 * Parte a linha em palavras e espaços, preservando ambos.
 *
 * Os espaços entram como tokens próprios de propósito: sem eles não seria
 * possível recompor a linha exactamente como o utilizador a escreveu.
 */
export function tokenizarLinhaComparativo(linha) {
  return String(linha ?? '').match(/\s+|\S+/g) || [];
}

function ehEspacos(token) {
  return /^\s+$/.test(token);
}

/**
 * Pares `[i, j]` da maior subsequência comum entre duas listas.
 * @returns {Array<[number, number]>}
 */
function paresSubsequenciaComum(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n || !m) return [];

  /* Texto grande demais: alinhamento posicional, sem matriz. */
  if (n * m > LIMITE_CELULAS_LCS) {
    const pares = [];
    const limite = Math.min(n, m);
    for (let i = 0; i < limite; i++) if (a[i] === b[i]) pares.push([i, i]);
    return pares;
  }

  const larg = m + 1;
  const dp = new Uint32Array((n + 1) * larg);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * larg + j] =
        a[i] === b[j]
          ? dp[(i + 1) * larg + (j + 1)] + 1
          : Math.max(dp[(i + 1) * larg + j], dp[i * larg + (j + 1)]);
    }
  }

  const pares = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pares.push([i, j]);
      i++;
      j++;
    } else if (dp[(i + 1) * larg + j] >= dp[i * larg + (j + 1)]) {
      i++;
    } else {
      j++;
    }
  }
  return pares;
}

function marcaIgual(texto) {
  return { texto, tipo: 'igual', partes: [{ txt: texto, mudou: false }] };
}

function marcaExclusiva(texto) {
  return { texto, tipo: 'exclusiva', partes: [{ txt: texto, mudou: true }] };
}

/** Junta tokens vizinhos com a mesma marcação, para não gerar spans a mais. */
function compactarPartes(partes) {
  const out = [];
  for (const p of partes) {
    if (!p.txt) continue;
    const ult = out[out.length - 1];
    if (ult && ult.mudou === p.mudou) ult.txt += p.txt;
    else out.push({ txt: p.txt, mudou: p.mudou });
  }
  return out.length ? out : [{ txt: '', mudou: false }];
}

/**
 * Diferença palavra a palavra entre duas linhas.
 *
 * Só palavras entram marcadas: espaços que mudam ficam neutros, porque um
 * realce sobre espaço em branco não diz nada a quem olha. A linha inteira já
 * fica assinalada como alterada de qualquer forma.
 *
 * @returns {{ a: Array<{txt:string,mudou:boolean}>, b: Array<{txt:string,mudou:boolean}> }}
 */
export function compararPalavrasDaLinha(linhaA, linhaB) {
  const ta = tokenizarLinhaComparativo(linhaA);
  const tb = tokenizarLinhaComparativo(linhaB);
  const pares = paresSubsequenciaComum(ta, tb);
  const comunsA = new Set(pares.map(([i]) => i));
  const comunsB = new Set(pares.map(([, j]) => j));
  const montar = (tokens, comuns) =>
    compactarPartes(
      tokens.map((txt, idx) => ({ txt, mudou: !comuns.has(idx) && !ehEspacos(txt) }))
    );
  return { a: montar(ta, comunsA), b: montar(tb, comunsB) };
}

/** Fracção de palavras (ignorando espaços) que as duas linhas têm em comum. */
export function similaridadeLinhas(linhaA, linhaB) {
  const ta = tokenizarLinhaComparativo(linhaA).filter((t) => !ehEspacos(t));
  const tb = tokenizarLinhaComparativo(linhaB).filter((t) => !ehEspacos(t));
  if (!ta.length && !tb.length) return 1;
  if (!ta.length || !tb.length) return 0;
  const comuns = paresSubsequenciaComum(ta, tb).length;
  return (2 * comuns) / (ta.length + tb.length);
}

/**
 * Compara duas letras completas.
 *
 * @param {string} textoA
 * @param {string} textoB
 * @returns {{
 *   iguais: boolean,
 *   linhasA: Array<{texto:string,tipo:'igual'|'alterada'|'exclusiva',partes:Array<{txt:string,mudou:boolean}>}>,
 *   linhasB: Array<{texto:string,tipo:'igual'|'alterada'|'exclusiva',partes:Array<{txt:string,mudou:boolean}>}>,
 *   totais: { alteradas:number, exclusivasA:number, exclusivasB:number }
 * }}
 */
export function compararLetras(textoA, textoB) {
  const linhasA = separarLinhasComparativo(textoA);
  const linhasB = separarLinhasComparativo(textoB);
  const marcasA = linhasA.map(marcaIgual);
  const marcasB = linhasB.map(marcaIgual);
  const totais = { alteradas: 0, exclusivasA: 0, exclusivasB: 0 };

  /* Iguais ao caractere: sai já, sem nenhuma marca. */
  if (normalizarTextoComparativo(textoA) === normalizarTextoComparativo(textoB)) {
    return { iguais: true, linhasA: marcasA, linhasB: marcasB, totais };
  }

  const processarBloco = (idxA, idxB) => {
    if (!idxA.length && !idxB.length) return;
    const emparelhadas = Math.min(idxA.length, idxB.length);
    for (let k = 0; k < emparelhadas; k++) {
      const ia = idxA[k];
      const ib = idxB[k];
      const ta = linhasA[ia];
      const tb = linhasB[ib];
      if (similaridadeLinhas(ta, tb) >= LIMIAR_LINHA_ALTERADA) {
        const palavras = compararPalavrasDaLinha(ta, tb);
        marcasA[ia] = { texto: ta, tipo: 'alterada', partes: palavras.a };
        marcasB[ib] = { texto: tb, tipo: 'alterada', partes: palavras.b };
        totais.alteradas++;
      } else {
        marcasA[ia] = marcaExclusiva(ta);
        marcasB[ib] = marcaExclusiva(tb);
        totais.exclusivasA++;
        totais.exclusivasB++;
      }
    }
    for (let k = emparelhadas; k < idxA.length; k++) {
      marcasA[idxA[k]] = marcaExclusiva(linhasA[idxA[k]]);
      totais.exclusivasA++;
    }
    for (let k = emparelhadas; k < idxB.length; k++) {
      marcasB[idxB[k]] = marcaExclusiva(linhasB[idxB[k]]);
      totais.exclusivasB++;
    }
  };

  const pares = paresSubsequenciaComum(linhasA, linhasB);
  let ia = 0;
  let ib = 0;
  const faixa = (de, ate) => {
    const out = [];
    for (let k = de; k < ate; k++) out.push(k);
    return out;
  };
  for (const [pa, pb] of pares) {
    processarBloco(faixa(ia, pa), faixa(ib, pb));
    ia = pa + 1;
    ib = pb + 1;
  }
  processarBloco(faixa(ia, linhasA.length), faixa(ib, linhasB.length));

  return { iguais: false, linhasA: marcasA, linhasB: marcasB, totais };
}

/** Resumo curto para o rodapé do painel («3 linhas alteradas», etc.). */
export function resumirComparacao(resultado) {
  if (!resultado || resultado.iguais) return 'As duas versões são idênticas.';
  const { alteradas, exclusivasA, exclusivasB } = resultado.totais;
  const partes = [];
  if (alteradas) partes.push(`${alteradas} ${alteradas === 1 ? 'linha alterada' : 'linhas alteradas'}`);
  if (exclusivasA) partes.push(`${exclusivasA} só à esquerda`);
  if (exclusivasB) partes.push(`${exclusivasB} só à direita`);
  return partes.length ? partes.join(' · ') : 'Diferenças apenas em espaços.';
}
