'use strict';

/**
 * Diálogos NATIVOS do operador para inscrever/aprovar dispositivos (Entrega 2). Sem eles, trocar
 * o TOFU permanente pela janela de inscrição deixaria o operador sem como autorizar o primeiro
 * aparelho. `dialog` é injetado (Electron ou falso nos testes), e vale para o Servidor e para o
 * Controlador em modo local (cada um com a sua `acesso`).
 *
 * Regra de ouro: fechar o diálogo, Esc, erro ou qualquer resposta estranha = NEGAR.
 */

const COOLDOWN_PADRAO_MS = 10 * 60 * 1000;
const idCurto = (id) => String(id || '').slice(0, 8);

/**
 * @param {object} p
 * @param {object} p.acesso instância de `criarControleAcesso`
 * @param {{showMessageBox: Function}} p.dialog
 * @param {() => (object|undefined)} [p.obterJanela] janela-mãe dos diálogos
 * @param {() => number} [p.agora]
 * @param {number} [p.cooldownMs] depois de NEGAR (ou fechar), não pergunta de novo por este tempo
 */
function criarDialogosDispositivos({ acesso, dialog, obterJanela = () => undefined, agora = Date.now, cooldownMs = COOLDOWN_PADRAO_MS }) {
  /** Fila: um diálogo por vez. */
  let fila = Promise.resolve();
  const naFila = (fn) => {
    const p = fila.then(fn, fn);
    fila = p.catch(() => {});
    return p;
  };
  const emAberto = new Set();
  /** deviceId -> até quando não perguntar de novo */
  const silenciados = new Map();

  async function mostrar(opcoes) {
    try {
      const janela = obterJanela();
      const ok = janela && typeof janela.isDestroyed === 'function' && !janela.isDestroyed();
      return (await (ok ? dialog.showMessageBox(janela, opcoes) : dialog.showMessageBox(opcoes))) || {};
    } catch (_) {
      return {};
    }
  }

  async function perguntar({ deviceId, nome }) {
    const r = await mostrar({
      type: 'question', buttons: ['Negar', 'Autorizar'], defaultId: 0, cancelId: 0, noLink: true, title: 'Lyra — Novo dispositivo',
      message: `O dispositivo «${nome || 'sem nome'}» quer se conectar a este Lyra.`,
      detail: `Identificador: ${idCurto(deviceId)}…\n\nSó autorize se for um aparelho da sua equipe e se foi você quem acabou de abrir o Lyra nele. Na dúvida, negue: quem já usa o Lyra não é afetado.`,
    });
    return r.response === 1;
  }

  /** Chamada quando um dispositivo fica PENDENTE. Deduplicada, em fila e com cooldown após negar. */
  function aoPendente({ deviceId, nome }) {
    const id = String(deviceId || '');
    if (!id || emAberto.has(id)) return Promise.resolve();
    const ate = silenciados.get(id);
    if (ate && ate > agora()) return Promise.resolve();
    emAberto.add(id);
    return naFila(async () => {
      let aprovado = false;
      try {
        aprovado = await perguntar({ deviceId: id, nome });
        if (aprovado) acesso.aprovarDispositivo(id);
        else { acesso.negarDispositivo(id); silenciados.set(id, agora() + cooldownMs); }
      } catch (_) {
        silenciados.set(id, agora() + cooldownMs);
      } finally {
        emAberto.delete(id);
      }
    });
  }

  async function abrirJanela() {
    const j = acesso.abrirJanelaInscricao();
    if (!j.aberta) {
      await mostrar({
        type: 'info', buttons: ['Ok'], noLink: true, title: 'Lyra — Inscrição de dispositivos',
        message: j.motivo === 'travada' ? 'A lista de dispositivos está travada.' : 'A inscrição por janela não está disponível neste modo.',
        detail: 'Destrave a lista para abrir a janela, ou aprove cada dispositivo pendente individualmente.',
      });
      return j;
    }
    const fim = new Date(j.expiraEm);
    const hora = `${String(fim.getHours()).padStart(2, '0')}:${String(fim.getMinutes()).padStart(2, '0')}`;
    await mostrar({
      type: 'info', buttons: ['Ok'], noLink: true, title: 'Lyra — Inscrição de dispositivos',
      message: 'Janela de inscrição aberta.',
      detail: `Durante 5 minutos (até ${hora}) os dispositivos novos que se conectarem serão autorizados automaticamente. Depois disso cada novo dispositivo precisará da sua aprovação. Abra o Lyra no aparelho agora.`,
    });
    return j;
  }

  async function fecharJanela() {
    return { fechada: acesso.fecharJanelaInscricao() };
  }

  async function aprovarPendentes() {
    const lista = acesso.listarPendentes();
    if (!lista.length) {
      await mostrar({ type: 'info', buttons: ['Ok'], noLink: true, title: 'Lyra — Dispositivos', message: 'Nenhum dispositivo aguardando aprovação.' });
      return { total: 0, aprovados: 0, negados: 0 };
    }
    let aprovados = 0;
    let negados = 0;
    for (const p of lista) {
      const ok = await naFila(() => perguntar(p));
      if (ok && acesso.aprovarDispositivo(p.deviceId)) aprovados += 1;
      else { acesso.negarDispositivo(p.deviceId); negados += 1; }
    }
    return { total: lista.length, aprovados, negados };
  }

  return Object.freeze({ aoPendente, abrirJanela, fecharJanela, aprovarPendentes });
}

module.exports = { criarDialogosDispositivos };
