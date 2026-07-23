/**
 * Roteamento de monitores (M2/M3) e alvo de projeção no modo Bíblia.
 */

import { urlApiProjecao } from './lyraEndpoints';
import { INDICE_MONITOR_M2, INDICE_MONITOR_M3 } from './bibliaLivros';
import { payloadDisplayConfigBiblia } from './bibliaExibicao';

/**
 * @param {'m2'|'m3'} monitor
 * @returns {'publico'|'ministrante'}
 */
export function alvoProjecaoDeMonitor(monitor) {
  return monitor === 'm3' ? 'ministrante' : 'publico';
}

/**
 * Consulta monitores do servidor (:5510) e devolve índices M2/M3 válidos.
 *
 * @param {string} host
 * @returns {Promise<{ m2: number, m3: number }>}
 */
export async function resolverIndicesMonitoresLyra(host) {
  let m2 = INDICE_MONITOR_M2;
  let m3 = INDICE_MONITOR_M3;
  const base = urlApiProjecao(host);
  if (!base) return { m2, m3 };

  try {
    const res = await fetch(`${base}/api/monitores`);
    if (!res.ok) return { m2, m3 };
    const lista = await res.json();
    const indices = (Array.isArray(lista) ? lista : [])
      .map((m) => m?.index)
      .filter((i) => Number.isInteger(i) && i >= 0);
    const tem = (idx) => indices.includes(idx);

    if (!tem(m2) && indices.length >= 2) {
      m2 = indices.find((i) => i !== 0) ?? indices[1] ?? 0;
    } else if (!tem(m2) && indices.length === 1) {
      m2 = indices[0];
    }

    if (!tem(m3) && indices.length >= 2) {
      m3 = indices[indices.length - 1];
    } else if (!tem(m3) && indices.length === 1) {
      m3 = indices[0];
    }
  } catch (_) {}

  return { m2, m3 };
}

/**
 * Espelha `salvarRoteamentoTelasNoServidor` do controlador (modo Bíblia):
 * limpa índices em `slides` para o merge no servidor não reabrir o telão errado.
 *
 * @param {{ publicoIndex: number, ministranteIndex: number }} slides
 * @param {{ publicoIndex: number, ministranteIndex: number }} apresentacao
 */
function limparSlidesParaCanalApresentacao(slides, apresentacao) {
  let s = {
    publicoIndex: slides.publicoIndex ?? -1,
    ministranteIndex: slides.ministranteIndex ?? -1,
  };
  const a = apresentacao;

  if (a.publicoIndex >= 0) s = { ...s, publicoIndex: -1 };
  if (a.ministranteIndex >= 0) s = { ...s, ministranteIndex: -1 };
  if (a.publicoIndex < 0) s = { ...s, publicoIndex: -1 };
  if (a.ministranteIndex < 0) s = { ...s, ministranteIndex: -1 };

  return s;
}

/**
 * Ativa overlay visual Bíblia nas janelas de projeção (servidor :5510).
 *
 * @param {string} host
 * @param {import('./bibliaExibicao').BibliaExibicaoCfg} [cfgExibicao]
 */
export async function ativarModoVisualBiblia(host, cfgExibicao) {
  const base = urlApiProjecao(host);
  if (!base) return;
  const body = cfgExibicao
    ? payloadDisplayConfigBiblia(cfgExibicao)
    : { forcarModo: 'biblia', modoConfig: 'biblia' };
  try {
    await fetch(`${base}/api/display-config/preview`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_) {}
}

/**
 * Aplica rota de projeção no servidor (canal `apresentacao` no payload dual v2).
 *
 * @param {string} host
 * @param {'m2'|'m3'} monitor
 * @param {import('./bibliaExibicao').BibliaExibicaoCfg} [cfgExibicao]
 */
export async function aplicarRotaMonitorBiblia(host, monitor, cfgExibicao) {
  const base = urlApiProjecao(host);
  if (!base) throw new Error('IP inválido');

  const { m2, m3 } = await resolverIndicesMonitoresLyra(host);

  let slides = { publicoIndex: -1, ministranteIndex: -1 };

  try {
    const res = await fetch(`${base}/api/display-routing`);
    if (res.ok) {
      const data = await res.json();
      if (data?.slides && typeof data.slides === 'object') {
        slides = {
          publicoIndex: data.slides.publicoIndex ?? -1,
          ministranteIndex: data.slides.ministranteIndex ?? -1,
        };
      }
    }
  } catch (_) {}

  const apresentacao =
    monitor === 'm3'
      ? { publicoIndex: -1, ministranteIndex: m3 }
      : { publicoIndex: m2, ministranteIndex: -1 };

  slides = limparSlidesParaCanalApresentacao(slides, apresentacao);

  const put = await fetch(`${base}/api/display-routing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 2,
      slides,
      apresentacao,
    }),
  });

  if (!put.ok) {
    const err = await put.json().catch(() => ({}));
    throw new Error(err.erro || `Falha ao definir monitor (HTTP ${put.status})`);
  }

  await ativarModoVisualBiblia(host, cfgExibicao);

  /** Janelas fullscreen demoram a abrir após PUT — evita 1.º versículo no monitor antigo. */
  await new Promise((r) => setTimeout(r, 180));
}

/** @type {{ ultimoMonitor: string, pronto: boolean }} */
const sessaoRota = { ultimoMonitor: '', pronto: false };

/**
 * Prepara rota + modo visual antes da projeção Bíblia.
 *
 * @param {string} host
 * @param {'m2'|'m3'} monitor
 * @param {boolean} [forcar=false]
 * @param {import('./bibliaExibicao').BibliaExibicaoCfg} [cfgExibicao]
 */
export async function prepararProjecaoBiblia(host, monitor, forcar = false, cfgExibicao) {
  const mudouMonitor = sessaoRota.ultimoMonitor !== monitor;
  if (!forcar && !mudouMonitor && sessaoRota.pronto) return;
  await aplicarRotaMonitorBiblia(host, monitor, cfgExibicao);
  sessaoRota.ultimoMonitor = monitor;
  sessaoRota.pronto = true;
}

/** Reinicia cache de rota (ex.: ao desconectar). */
export function resetarSessaoRotaBiblia() {
  sessaoRota.ultimoMonitor = '';
  sessaoRota.pronto = false;
}

