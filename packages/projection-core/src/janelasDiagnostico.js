'use strict';

const fs = require('fs');
const path = require('path');

/**
 * **Diário de bordo das janelas de projeção.**
 *
 * ## Porque existe
 *
 * Os defeitos que restam nas telas M2/M3 são todos de *timing*: uma janela mostrada um
 * quadro cedo demais, uma sincronização que apanha outra a meio, uma ordem de z-order que
 * se inverte durante o handshake do projetor. Nenhum deles se reproduz sob demanda, e
 * nenhum deles se reproduz num monitor virtual — dependem do driver, do cabo, do tempo que
 * aquele projetor leva a responder. O que os apanha é estar a gravar quando acontecem, na
 * máquina onde acontecem.
 *
 * Por isso isto grava **sempre**, sem flag e sem modo de depuração: um defeito intermitente
 * que só é registado quando alguém se lembra de ligar o registo é um defeito que nunca é
 * registado.
 *
 * ## O que grava, e o que não grava
 *
 * Só **ciclo de vida de janela** — nascer, carregar, receber o primeiro quadro, aparecer,
 * esconder, mudar de sítio, mudar de nível de topo, fechar — mais as fronteiras das
 * sincronizações. São dezenas de linhas por culto, não milhares.
 *
 * Fica **de fora** de propósito: o conteúdo dos payloads (letra, versículo, base64 de
 * mídia), o `display_config` (que carrega imagens em base64) e o `moveTop()` do ciclo de
 * *reclaim*, que corre a cada 2 s para sempre. Gravar qualquer um deles trocaria um
 * ficheiro legível por um ficheiro que ninguém abre.
 *
 * ## Escrita síncrona, de propósito
 *
 * `appendFileSync` por linha. Num caminho quente isso seria inaceitável; aqui o volume é
 * de dezenas de linhas por culto e o que se ganha é decisivo: se o processo morrer — ou se
 * o operador arrancar o cabo do PC a meio do defeito — a última linha escrita já está no
 * disco. Um *buffer* em memória perderia exactamente o instante que interessa.
 *
 * ## Nunca derruba nada
 *
 * Todos os caminhos estão em `try/catch` e a falha é silenciosa. Depois de
 * `FALHAS_ATE_DESISTIR` escritas falhadas seguidas o diário desiste até ao fim da sessão:
 * disco cheio ou pasta sem permissão não podem virar um `logError` por evento de janela,
 * que é como um problema de registo se transforma num problema de projeção.
 */

/** Acima disto o ficheiro roda. 2 MB dá muitos cultos e ainda abre num editor comum. */
const LIMITE_BYTES_PADRAO = 2 * 1024 * 1024;

/** Quantos ficheiros ficam: o actual e um anterior. */
const SUFIXO_ANTERIOR = '.1';

/** Escritas falhadas seguidas antes de desistir da sessão. */
const FALHAS_ATE_DESISTIR = 5;

/** Largura das colunas — alinhamento é o que torna o ficheiro legível a olho. */
const COLUNA_EVENTO = 17;
const COLUNA_ALVO = 14;

/**
 * Valor pronto para uma coluna `chave=valor`.
 *
 * Booleanos viram `1`/`0` porque a coluna fica com uma largura só e `true`/`false` desalinha
 * tudo. `bounds` vira `LxA+X+Y`, a notação do X11 e do próprio Windows nas ferramentas de
 * ecrã — é a forma mais curta que ainda diz as quatro coisas.
 */
function valorLegivel(v) {
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '-';
  if (Array.isArray(v)) return v.length ? v.join(',') : '-';
  if (typeof v === 'object') {
    const { x, y, width, height } = v;
    if ([x, y, width, height].every((n) => typeof n === 'number')) {
      return `${width}x${height}+${x}+${y}`;
    }
    try {
      return JSON.stringify(v);
    } catch (_) {
      return '?';
    }
  }
  const s = String(v);
  return /\s/.test(s) ? `"${s}"` : s;
}

/**
 * Uma linha do diário.
 *
 * O delta face à linha anterior é a coluna que mais trabalho poupa a quem lê: um
 * `mostrar` a `+00002ms` de um `abrir` é o defeito à vista, e sem o delta seria preciso
 * subtrair dois carimbos ISO à mão.
 *
 * @param {number} agoraMs
 * @param {number} deltaMs
 * @param {string} evento
 * @param {object} dados `papel` e `indice` viram a coluna do alvo; o resto vira `chave=valor`.
 */
function formatarLinha(agoraMs, deltaMs, evento, dados) {
  const d = dados && typeof dados === 'object' ? dados : {};
  const carimbo = new Date(agoraMs).toISOString();
  const delta = `+${String(Math.max(0, Math.min(deltaMs, 99999))).padStart(5, '0')}ms`;
  const alvo = d.papel ? `${d.papel}@${d.indice === undefined || d.indice === null ? '?' : d.indice}` : '-';
  const resto = Object.keys(d)
    .filter((k) => k !== 'papel' && k !== 'indice' && d[k] !== undefined)
    .map((k) => `${k}=${valorLegivel(d[k])}`)
    .join(' ');
  const base = `${carimbo} ${delta} ${String(evento).padEnd(COLUNA_EVENTO)}${alvo.padEnd(COLUNA_ALVO)}${resto}`;
  return `${base.replace(/\s+$/, '')}\n`;
}

/** Aceita caminho fixo ou função — as `paths` deste projecto são funções. */
function resolverCaminho(caminhoArquivo) {
  const bruto = typeof caminhoArquivo === 'function' ? caminhoArquivo() : caminhoArquivo;
  return typeof bruto === 'string' && bruto.trim() ? bruto : null;
}

/**
 * Diário que não grava nada.
 *
 * É o valor por omissão do motor: um host que não injecte diário nenhum — os testes, o
 * modo de desenvolvimento sem `userData` — continua a funcionar sem uma única guarda
 * `if (diagnostico)` espalhada pelo motor.
 */
function criarDiagnosticoNulo() {
  return {
    registar() {},
    caminho() {
      return null;
    },
    bytes() {
      return 0;
    },
  };
}

/**
 * @param {{
 *   caminhoArquivo: string | (() => string),
 *   limiteBytes?: number,
 *   agora?: () => number,
 *   fsImpl?: object,
 *   rotulo?: string
 * }} opts
 *   `rotulo` — o que aparece no cabeçalho de sessão (ex.: `Controlador 1.7.5`).
 */
function criarDiagnosticoJanelas(opts = {}) {
  const caminho = resolverCaminho(opts.caminhoArquivo);
  if (!caminho) return criarDiagnosticoNulo();

  const sistema = opts.fsImpl || fs;
  const agora = typeof opts.agora === 'function' ? opts.agora : () => Date.now();
  const limiteBytes = Number.isFinite(opts.limiteBytes) && opts.limiteBytes > 0
    ? opts.limiteBytes
    : LIMITE_BYTES_PADRAO;
  const rotulo = String(opts.rotulo || '').trim();

  let bytes = 0;
  let iniciado = false;
  let cabecalhoEscrito = false;
  let falhasSeguidas = 0;
  let desistiu = false;
  let ultimoMs = 0;

  function caminhoAnterior() {
    const ext = path.extname(caminho);
    return ext
      ? `${caminho.slice(0, -ext.length)}${SUFIXO_ANTERIOR}${ext}`
      : `${caminho}${SUFIXO_ANTERIOR}`;
  }

  /**
   * Abre o diário: garante a pasta e lê o tamanho **uma vez**.
   *
   * O tamanho passa a ser contado em memória. Um `statSync` por linha seria um syscall a
   * mais em cada evento de janela, e o número que ele traria é o mesmo que já sabemos.
   */
  function iniciar() {
    iniciado = true;
    try {
      sistema.mkdirSync(path.dirname(caminho), { recursive: true });
    } catch (_) {
      // intencional — a pasta pode já existir; se não existir, a escrita falha e desiste
    }
    try {
      bytes = sistema.statSync(caminho).size;
    } catch (_) {
      bytes = 0;
    }
  }

  /** Roda quando passa do tecto. Um ficheiro anterior, e o mais velho vai-se. */
  function rodarSePreciso(proximaLinhaBytes) {
    if (bytes + proximaLinhaBytes <= limiteBytes) return;
    const anterior = caminhoAnterior();
    try {
      sistema.rmSync(anterior, { force: true });
    } catch (_) {
      // intencional — não havia ficheiro anterior
    }
    try {
      sistema.renameSync(caminho, anterior);
      bytes = 0;
    } catch (_) {
      // intencional — sem rotação o ficheiro cresce; é melhor do que perder o registo
    }
  }

  /**
   * Cabeçalho de sessão.
   *
   * Um mesmo ficheiro atravessa vários arranques do app. Sem esta linha, ler o diário de
   * um culto obrigava a adivinhar onde é que o anterior acabou — e é precisamente no
   * arranque que estão metade dos defeitos que isto existe para apanhar.
   */
  function cabecalhoSessao(ms) {
    const partes = ['pid=' + process.pid, 'plataforma=' + process.platform];
    if (rotulo) partes.unshift(rotulo);
    return `\n=== sessão ${new Date(ms).toISOString()} · ${partes.join(' · ')} ===\n`;
  }

  return {
    /**
     * Grava um evento. Nunca lança, nunca bloqueia mais do que um `appendFileSync`.
     *
     * @param {string} evento nome curto e estável — é por ele que se faz `grep`
     * @param {object} [dados] `papel` e `indice` identificam a janela; o resto é contexto
     */
    registar(evento, dados) {
      if (desistiu) return;
      try {
        if (!iniciado) iniciar();
        const ms = agora();
        const delta = ultimoMs ? ms - ultimoMs : 0;
        ultimoMs = ms;

        let texto = formatarLinha(ms, cabecalhoEscrito ? delta : 0, evento, dados);
        if (!cabecalhoEscrito) {
          texto = cabecalhoSessao(ms) + texto;
          cabecalhoEscrito = true;
        }

        const tamanho = Buffer.byteLength(texto, 'utf8');
        rodarSePreciso(tamanho);
        sistema.appendFileSync(caminho, texto, 'utf8');
        bytes += tamanho;
        falhasSeguidas = 0;
      } catch (_) {
        falhasSeguidas += 1;
        if (falhasSeguidas >= FALHAS_ATE_DESISTIR) desistiu = true;
      }
    },

    /** Caminho do ficheiro — é o que o item de menu abre. */
    caminho() {
      return caminho;
    },

    /** Tamanho actual, para diagnóstico do próprio diagnóstico. */
    bytes() {
      return bytes;
    },
  };
}

module.exports = {
  LIMITE_BYTES_PADRAO,
  criarDiagnosticoJanelas,
  criarDiagnosticoNulo,
  formatarLinha,
  valorLegivel,
};
