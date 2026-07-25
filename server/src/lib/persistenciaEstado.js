'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Persistência do estado autoritativo do servidor.
 *
 * Regras de projeto (ver docs/arquitetura-controle-estado-acesso.md):
 *  - O estado em memória (`ctx.estadoAtual`, `ctx.displayConfig`, etc.) é a VERDADE.
 *    Este módulo só faz um snapshot em disco para sobreviver a reinício do servidor.
 *  - Escrita é DEBOUNCED: no meio de um culto, trocar de slide não pode disparar I/O
 *    síncrono a cada comando (micro-freeze perceptível). Agrupamos as gravações.
 *  - Escrita é ATÔMICA: grava em `<arquivo>.tmp`, faz `fsync`, e só então `rename`.
 *    Assim, se o processo cair no meio da escrita, o arquivo final nunca fica corrompido.
 *
 * Uso típico:
 *   const store = criarStoreEstado(paths.estadoAutoritativoPath, { debounceMs: 1500, logError });
 *   const salvo = store.carregar();              // no boot, hidrata ctx a partir disto
 *   store.agendarGravacao(() => snapshotDoCtx()); // após cada comando aplicado
 *   store.flushSync();                            // no 'before-quit' do app
 */

/**
 * @param {() => string} caminhoFn  Função que retorna o caminho absoluto do arquivo (padrão do projeto).
 * @param {{ debounceMs?: number, logError?: Function }} [opts]
 */
function criarStoreEstado(caminhoFn, opts = {}) {
  const debounceMs = Number.isFinite(opts.debounceMs) ? opts.debounceMs : 1500;
  const logError = typeof opts.logError === 'function' ? opts.logError : () => {};

  let timer = null;
  /** Última função-fábrica de snapshot pendente de gravação. */
  let snapshotPendente = null;

  /** Lê e faz o parse do snapshot salvo. Retorna `null` se não existir / estiver ilegível. */
  function carregar() {
    try {
      const raw = fs.readFileSync(caminhoFn(), 'utf8');
      const dados = JSON.parse(raw);
      return dados && typeof dados === 'object' ? dados : null;
    } catch (_) {
      // Arquivo ausente na primeira execução ou snapshot ilegível — o chamador usa o default.
      return null;
    }
  }

  /** Grava `obj` no disco de forma atômica (tmp -> fsync -> rename). Síncrono. */
  function gravarAtomico(obj) {
    const destino = caminhoFn();
    const tmp = `${destino}.tmp`;
    const json = JSON.stringify(obj, null, 2);

    // Garante que a pasta existe (userData sempre existe, mas subpastas podem não).
    try {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
    } catch (_) {
      // intencional — pasta provavelmente já existe
    }

    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, json);
      // fsync: garante que os bytes chegaram ao disco antes do rename — evita
      // "arquivo renomeado mas vazio" se a máquina desligar logo após.
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // rename é atômico no mesmo volume: o leitor vê o arquivo antigo OU o novo, nunca um meio-termo.
    fs.renameSync(tmp, destino);
  }

  /**
   * Agenda uma gravação. `fabricaSnapshot` é chamada NO MOMENTO da gravação
   * (não agora), para capturar o estado mais recente e descartar snapshots intermediários.
   * @param {() => object} fabricaSnapshot
   */
  function agendarGravacao(fabricaSnapshot) {
    if (typeof fabricaSnapshot !== 'function') return;
    snapshotPendente = fabricaSnapshot;
    if (timer) return; // já há uma gravação agendada; ela pegará o snapshot mais recente
    timer = setTimeout(() => {
      timer = null;
      const fab = snapshotPendente;
      snapshotPendente = null;
      if (!fab) return;
      try {
        gravarAtomico(fab());
      } catch (e) {
        logError('persistencia-estado-gravar', e);
      }
    }, debounceMs);
    // Não segura o event loop do Electron ao encerrar.
    if (typeof timer.unref === 'function') timer.unref();
  }

  /** Força a gravação pendente imediatamente (chamar em `before-quit`). Síncrono. */
  function flushSync() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const fab = snapshotPendente;
    snapshotPendente = null;
    if (!fab) return;
    try {
      gravarAtomico(fab());
    } catch (e) {
      logError('persistencia-estado-flush', e);
    }
  }

  return { carregar, agendarGravacao, flushSync };
}

module.exports = { criarStoreEstado };
