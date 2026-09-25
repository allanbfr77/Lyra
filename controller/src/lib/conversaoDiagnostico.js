'use strict';

/**
 * Diário técnico da conversão de documentos (aba DOCS).
 *
 * O painel só mostra uma frase curta quando a conversão falha (`mensagemFalhaConversao`,
 * em `officeParaPdf.js`) — de propósito, para não assustar o operador com códigos COM.
 * Mas quem for investigar precisa de mais: qual Office foi encontrado, que método correu,
 * quanto tempo levou, o que o próprio script devolveu. É isso que fica aqui, nunca na UI.
 *
 * Mesma forma que `janelasDiagnostico.js` (packages/projection-core): escrita síncrona
 * (`appendFileSync`), rotação por tamanho, nunca deita nada abaixo — se o disco estiver
 * cheio ou a pasta sem permissão, a conversão continua, só o registo é que falha calado.
 */

const fs = require('fs');
const path = require('path');

/** Acima disto o ficheiro roda. Cada linha é uma conversão; 1 MB dá muitas. */
const LIMITE_BYTES_PADRAO = 1 * 1024 * 1024;

/** Quantos ficheiros ficam: o actual e um anterior. */
const SUFIXO_ANTERIOR = '.1';

function criarDiagnosticoNulo() {
  return {
    registar() {},
    caminho() {
      return null;
    },
  };
}

/** Aceita caminho fixo ou função — as `paths` deste projecto são funções. */
function resolverCaminho(caminhoArquivo) {
  const bruto = typeof caminhoArquivo === 'function' ? caminhoArquivo() : caminhoArquivo;
  return typeof bruto === 'string' && bruto.trim() ? bruto : null;
}

function valorLegivel(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return /[\s="]/.test(s) ? JSON.stringify(s) : s;
}

function formatarLinha(dados) {
  const d = dados && typeof dados === 'object' ? dados : {};
  const carimbo = new Date().toISOString();
  const resto = Object.keys(d)
    .map((k) => [k, valorLegivel(d[k])])
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return `${carimbo} ${resto}`.replace(/\s+$/, '') + '\n';
}

/**
 * @param {{caminhoArquivo: string|(() => string), limiteBytes?: number, fsImpl?: object}} opts
 */
function criarDiagnosticoConversao(opts = {}) {
  const caminho = resolverCaminho(opts.caminhoArquivo);
  if (!caminho) return criarDiagnosticoNulo();

  const sistema = opts.fsImpl || fs;
  const limiteBytes =
    Number.isFinite(opts.limiteBytes) && opts.limiteBytes > 0 ? opts.limiteBytes : LIMITE_BYTES_PADRAO;

  function caminhoAnterior() {
    const ext = path.extname(caminho);
    return ext ? `${caminho.slice(0, -ext.length)}${SUFIXO_ANTERIOR}${ext}` : `${caminho}${SUFIXO_ANTERIOR}`;
  }

  function rodarSePreciso(proximaLinhaBytes) {
    let atual = 0;
    try {
      atual = sistema.statSync(caminho).size;
    } catch (_) {
      return;
    }
    if (atual + proximaLinhaBytes <= limiteBytes) return;
    try {
      sistema.rmSync(caminhoAnterior(), { force: true });
    } catch (_) {
      // intencional — pode não haver ficheiro anterior
    }
    try {
      sistema.renameSync(caminho, caminhoAnterior());
    } catch (_) {
      // intencional — sem rotação o ficheiro cresce; melhor que perder o registo
    }
  }

  return {
    registar(dados) {
      try {
        const linha = formatarLinha(dados);
        sistema.mkdirSync(path.dirname(caminho), { recursive: true });
        rodarSePreciso(Buffer.byteLength(linha, 'utf8'));
        sistema.appendFileSync(caminho, linha, 'utf8');
      } catch (_) {
        // intencional — falhar a registar não pode derrubar a conversão
      }
    },
    caminho() {
      return caminho;
    },
  };
}

module.exports = { criarDiagnosticoConversao, criarDiagnosticoNulo };
