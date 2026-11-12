'use strict';

/**
 * Mapa das 11 unidades reais do boot do Controlador nos 9 rótulos exibidos.
 * A barra anda por unidade (1/11); só o texto é agrupado.
 */
const TOTAL_UNIDADES = 11;

const GRUPOS = {
  1: { rotulo: 'Iniciando', detalhe: 'permissões e telas' },
  2: { rotulo: 'Dados do usuário', detalhe: 'migrando arquivos' },
  3: { rotulo: 'Banco de dados', detalhe: 'abrindo lyra.db' },
  4: { rotulo: 'Bíblias', detalhe: null },
  5: { rotulo: 'Catálogo', detalhe: 'catálogo offline' },
  6: { rotulo: 'Estrutura do banco', detalhe: 'tabelas e migrations' },
  7: { rotulo: 'Servidor local', detalhe: 'porta 3001' },
  8: { rotulo: 'Projeção', detalhe: 'telas M2/M3 · porta 5510' },
  9: { rotulo: 'Interface', detalhe: null },
};

/** Cada grupo é contíguo no boot e nenhum rótulo se repete. */
const UNIDADE_GRUPO = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 9 };

/** Lançada quando uma unidade crítica falha e o erro já foi mostrado na splash. */
class BootInterrompido extends Error {
  constructor(causa) {
    super('Boot interrompido por erro crítico');
    this.name = 'BootInterrompido';
    this.causa = causa;
  }
}

function descreverErro(unidade, err) {
  const code = err && err.code ? String(err.code) : undefined;
  const bruto = (err && err.message) || String(err);
  if (unidade === 8 && code === 'EADDRINUSE') {
    return {
      message: 'A porta 3001 já está em uso. Feche a outra instância do Lyra e tente novamente.',
      code,
      detail: '127.0.0.1:3001',
    };
  }
  const mensagens = {
    1: 'Não foi possível preparar a credencial interna do painel.',
    3: 'Não foi possível migrar os dados do usuário.',
    4: 'Não foi possível abrir o banco de dados.',
    7: 'Não foi possível preparar as tabelas do banco de dados.',
    8: 'Não foi possível iniciar o servidor local.',
    10: 'Não foi possível criar a janela do Lyra.',
    11: 'Não foi possível carregar a interface.',
  };
  return { message: mensagens[unidade] || 'Falha ao iniciar o Lyra.', code, detail: bruto.slice(0, 160) };
}

/**
 * `splash` pode ser null (splash não carregou em 3 s): nesse caso nada é reportado e erros
 * críticos propagam como antes — a splash nunca é motivo de o app não abrir.
 */
function criarOrquestrador({ splash, ceder = () => new Promise((r) => setImmediate(r)), log = () => {} }) {
  function emitirProgresso(unidade, extra = {}) {
    const grupo = UNIDADE_GRUPO[unidade];
    const g = GRUPOS[grupo];
    if (!splash) return;
    splash.progresso({
      unit: unidade,
      totalUnits: TOTAL_UNIDADES,
      group: grupo,
      label: g.rotulo,
      detail: extra.detail !== undefined ? extra.detail : g.detalhe || undefined,
      ...(typeof extra.value === 'number' ? { value: extra.value, max: extra.max } : {}),
    });
  }

  /** Emite o progresso e cede a thread: sem isso o evento fica na fila durante trabalho síncrono. */
  async function progresso(unidade, extra) {
    emitirProgresso(unidade, extra);
    await ceder();
  }

  function avisar(unidade, message, detail) {
    log(`[boot] aviso (unidade ${unidade}): ${message}${detail ? ` — ${detail}` : ''}`);
    if (splash) splash.aviso({ group: UNIDADE_GRUPO[unidade], message, detail });
  }

  /**
   * Roda uma unidade real. critica: erro para o boot e aparece na splash.
   * secundaria: vira aviso e o boot segue (o fallback é de quem chama).
   */
  async function unidade(n, { critica }, fn) {
    await progresso(n);
    try {
      return await fn({ progresso: (extra) => progresso(n, extra), avisar: (m, d) => avisar(n, m, d) });
    } catch (err) {
      if (!critica) {
        avisar(n, (err && err.message) || String(err));
        return undefined;
      }
      if (!splash) throw err;
      splash.erro({ group: UNIDADE_GRUPO[n], ...descreverErro(n, err) });
      throw new BootInterrompido(err);
    }
  }

  return { progresso, avisar, unidade };
}

module.exports = { TOTAL_UNIDADES, GRUPOS, UNIDADE_GRUPO, BootInterrompido, descreverErro, criarOrquestrador };
