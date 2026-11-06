'use strict';

/**
 * Elo interprocessos no processo principal do Controlador (Entrega 1).
 *
 *  - guarda as chaves (userData/elo-pareamentos.json) e assina as chamadas c→s (salto do 3001 e
 *    chamadas internas ao Servidor) SÓ quando existe pareamento ativo para aquele Servidor;
 *  - observa as chamadas s→c que chegam ao 3001 (proxies do Servidor);
 *  - conduz o pareamento (a pedido do operador): detecta se o Servidor suporta o elo, mostra o
 *    código de confirmação e espera a aprovação no Servidor.
 *
 * A chave nunca vai ao renderer, a log nem a respostas HTTP. Sem pareamento nada muda: um Servidor
 * antigo (sem `capacidades.elo`) nunca recebe cabeçalho novo e o pareamento nem é tentado.
 */

const crypto = require('crypto');
const http = require('http');
const { elo: eloCore, eloPareamento, politicaRotas } = require('@lyra/projection-core');

const MAX_RESPOSTA = 64 * 1024;

const origemDe = (base) => new URL(String(base)).origin;

/** Cliente HTTP mínimo (JSON) para o pareamento; resolve com o corpo, qualquer que seja o status. */
function requisicaoJson(base, metodo, caminho, corpo, { timeoutMs = 5000, headers = {} } = {}) {
  const url = new URL(caminho, String(base));
  const payload = corpo === undefined ? null : Buffer.from(JSON.stringify(corpo));
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname.replace(/^\[|\]$/g, ''), port: url.port, path: `${url.pathname}${url.search}`, method: metodo,
      headers: payload || Object.keys(headers).length
        ? { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...headers }
        : undefined,
    }, (res) => {
      const partes = [];
      let total = 0;
      res.on('data', (c) => {
        total += c.length;
        if (total > MAX_RESPOSTA) { req.destroy(new Error('resposta grande demais')); return; }
        partes.push(c);
      });
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch (_) { resolve({}); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('tempo esgotado')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function transporteHttp(base) {
  return {
    identidade: () => requisicaoJson(base, 'GET', '/api/identity'),
    solicitar: (corpo) => requisicaoJson(base, 'POST', '/api/elo/parear', corpo),
    consultar: (id) => requisicaoJson(base, 'GET', `/api/elo/parear/${encodeURIComponent(id)}`),
    cancelar: (id, token) => requisicaoJson(base, 'POST', `/api/elo/parear/${encodeURIComponent(id)}/cancelar`, { token }),
    verificarDispositivo: (corpo, via) => requisicaoJson(base, 'POST', '/api/elo/verificar-dispositivo', corpo, { headers: via ? { 'X-Lyra-Via': via } : {} }),
  };
}

/**
 * @param {object} p
 * @param {string|null} p.caminho arquivo das chaves
 * @param {string} p.nomePc nome mostrado ao operador do Servidor
 * @param {() => (URL|string)} p.obterBase Servidor de projeção configurado
 * @param {(evento: object) => void} [p.registrar]
 * @param {(base: string) => object} [p.criarTransporte] só para teste
 */
function criarEloControlador({ caminho, nomePc, obterBase, registrar = null, agora = Date.now, criarTransporte = transporteHttp }) {
  const elo = eloCore.criarElo({ papel: 'controlador', caminho, avaliarRota: politicaRotas.avaliarRota, registrar, agora });
  let ativo = null;

  /* Verificação DELEGADA de dispositivo (Entrega 1): o 3001 de um PC sem a allowlist pergunta ao Servidor pareado.
     O middleware é síncrono: devolve o veredito em cache (ou null = «não verificável») e atualiza em segundo plano. */
  const TTL_VEREDITO_MS = 30000;
  const MAX_VEREDITOS = 200;
  /** hash(deviceId+secret) -> {ok, classe, ate} (o segredo nunca fica em claro na memória do cache) */
  const veredictos = new Map();
  const emVoo = new Set();

  function verificarDelegado(auth) {
    try {
      const deviceId = String((auth && auth.deviceId) || '').trim();
      const secret = String((auth && auth.secret) || '').trim();
      if (!deviceId || !secret) return null;
      const base = origemDe(obterBase());
      if (!elo.armazem.ativaPara(base)) return null; // sem pareamento: nada é delegado (comportamento de antes)
      const chave = crypto.createHash('sha256').update(`${base}\n${deviceId}\n${secret}`).digest('base64url');
      const c = veredictos.get(chave);
      const fresco = c && c.ate > agora();
      if (!fresco && !emVoo.has(chave)) {
        emVoo.add(chave);
        const corpo = { deviceId, secret };
        const via = assinarParaServidor({ base, metodo: 'POST', caminho: '/api/elo/verificar-dispositivo', corpo: Buffer.from(JSON.stringify(corpo)) });
        Promise.resolve()
          .then(() => (via ? criarTransporte(base).verificarDispositivo(corpo, via) : null))
          .then((r) => {
            if (r && typeof r.ok === 'boolean' && typeof r.classe === 'string') {
              if (veredictos.size >= MAX_VEREDITOS) veredictos.delete(veredictos.keys().next().value);
              veredictos.set(chave, { ok: r.ok, classe: r.classe, ate: agora() + TTL_VEREDITO_MS });
            }
          })
          .catch(() => {})
          .finally(() => emVoo.delete(chave));
      }
      return c ? { ok: c.ok, classe: c.classe } : null;
    } catch (_) {
      return null; // nunca derruba a requisição observada
    }
  }

  /** `X-Lyra-Via` para uma chamada ao Servidor em `base`, ou `null` (sem pareamento ativo: nada muda). */
  function assinarParaServidor({ base, metodo, caminho: alvo, corpo }) {
    try {
      return elo.assinarSaida({ base: origemDe(base), metodo, caminho: alvo, corpo });
    } catch (_) {
      return null; // assinar nunca pode derrubar a chamada original
    }
  }

  /**
   * Pareia com o Servidor configurado. Resultado: `{estado, ...}` com estado em
   * aprovado | negado | cancelado | expirado | recusado | erro | confirmacao-invalida | sem-suporte.
   */
  async function parear({ aoCodigo = () => {}, timeoutMs } = {}) {
    const base = origemDe(obterBase());
    const transporte = criarTransporte(base);
    let identidade = null;
    try { identidade = await transporte.identidade(); } catch (_) { return { estado: 'erro', motivo: 'rede', base }; }
    if (!identidade || !identidade.capacidades || identidade.capacidades.elo !== 1) return { estado: 'sem-suporte', base };
    const cliente = eloPareamento.criarClientePareamento({
      armazem: elo.armazem, idControlador: elo.armazem.idLocal(), nome: nomePc, base, transporte, aoCodigo, agora,
      ...(timeoutMs ? { timeoutMs } : {}),
    });
    ativo = cliente;
    try {
      return { ...(await cliente.parear()), base };
    } finally {
      ativo = null;
    }
  }

  return Object.freeze({
    elo,
    assinarParaServidor,
    verificarDelegado,
    parear,
    cancelarPareamento: async () => { if (ativo) await ativo.cancelar(); },
    pareamentoEmAndamento: () => ativo !== null,
    /** Chaves conhecidas (sem as chaves), para diagnóstico. */
    chaves: () => elo.armazem.listar(),
  });
}

/* ───────────────────────── fluxo do operador (diálogos nativos) ───────────────────────── */

const TEXTO_RESULTADO = {
  aprovado: ['info', 'Pareamento concluído.', 'A comunicação entre este Controlador e o Servidor agora pode ser autenticada. Nada mudou para quem usa o Lyra.'],
  negado: ['warning', 'Pareamento negado no Servidor.', 'Nenhuma chave foi criada.'],
  cancelado: ['info', 'Pareamento cancelado.', 'Nenhuma chave foi criada.'],
  expirado: ['warning', 'O pedido de pareamento expirou.', 'Ninguém aprovou no Servidor a tempo. Tente de novo e peça para aprovar no PC do Servidor.'],
  recusado: ['warning', 'O Servidor recusou o pedido.', 'Aguarde alguns segundos e tente de novo (há um limite de pedidos).'],
  erro: ['error', 'Não foi possível falar com o Servidor.', 'Confira se o Servidor está ligado e acessível na rede.'],
  'confirmacao-invalida': ['error', 'A confirmação do Servidor não confere.', 'Por segurança nenhuma chave foi guardada. Se isto se repetir, a rede pode estar sendo interceptada.'],
  'sem-suporte': ['info', 'Este Servidor ainda não suporta o pareamento.', 'Atualize o Servidor para uma versão com o elo de segurança. Nada foi alterado.'],
};

/**
 * Fluxo completo com diálogos nativos. `dialog` e `janela` são injetados (testável sem Electron).
 * @returns {Promise<object>} o resultado de `parear` (ou `{estado: 'abortado'}` se o operador desistiu antes)
 */
async function executarPareamentoInterativo({ eloControlador, dialog, janela, obterBase }) {
  const abrir = (opcoes) => (janela ? dialog.showMessageBox(janela, opcoes) : dialog.showMessageBox(opcoes));
  const base = origemDe(obterBase());

  const inicio = await abrir({
    type: 'question', buttons: ['Cancelar', 'Continuar'], defaultId: 0, cancelId: 0, noLink: true, title: 'Lyra — Parear com o Servidor',
    message: `Parear este Controlador com o Servidor em ${base}?`,
    detail: 'Um código será mostrado aqui e no Servidor. Alguém precisa APROVAR no PC do Servidor, depois de conferir que os códigos são iguais. Nada muda para quem já usa o Lyra.',
  });
  if (!inicio || inicio.response !== 1) return { estado: 'abortado', base };

  const resultado = await eloControlador.parear({
    aoCodigo: (codigo) => {
      // Aviso NÃO bloqueante: o fluxo segue enquanto o operador compara os códigos.
      Promise.resolve(abrir({
        type: 'info', buttons: ['Cancelar pareamento', 'Fechar'], defaultId: 1, cancelId: 1, noLink: true, title: 'Lyra — Código de confirmação',
        message: `Código: ${codigo}`,
        detail: 'Confira que o MESMO código aparece no Servidor e aprove lá. Se os códigos forem diferentes, NÃO aprove.',
      })).then((r) => { if (r && r.response === 0) return eloControlador.cancelarPareamento(); return undefined; }).catch(() => {});
    },
  });

  const [type, message, detail] = TEXTO_RESULTADO[resultado.estado] || ['error', 'Pareamento não concluído.', String(resultado.estado)];
  await abrir({ type, buttons: ['Ok'], noLink: true, title: 'Lyra — Pareamento', message, detail });
  return resultado;
}

module.exports = { criarEloControlador, executarPareamentoInterativo, transporteHttp, requisicaoJson, TEXTO_RESULTADO };
