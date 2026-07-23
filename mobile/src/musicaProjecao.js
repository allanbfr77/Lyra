/**
 * Roteamento M2 (público) + M3 (ministrante) para projeção de músicas/slides.
 */

import { urlApiProjecao } from './lyraEndpoints';
import { resolverIndicesMonitoresLyra } from './bibliaProjecao';

/** @type {{ pronto: boolean, host: string }} */
const sessaoRota = { pronto: false, host: '' };

/**
 * Define canal `slides` com telão + ministrante e limpa `apresentacao`
 * (evita herdar rota da Bíblia só no M3).
 *
 * @param {string} host
 * @param {boolean} [forcar=false]
 */
export async function prepararProjecaoMusica(host, forcar = false) {
  const h = String(host || '').trim();
  if (!h) throw new Error('IP inválido');

  if (!forcar && sessaoRota.pronto && sessaoRota.host === h) return;

  const base = urlApiProjecao(h);
  const { m2, m3 } = await resolverIndicesMonitoresLyra(h);

  const slides = { publicoIndex: m2, ministranteIndex: m3 };
  const apresentacao = { publicoIndex: -1, ministranteIndex: -1 };

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
    throw new Error(err.erro || `Falha ao definir monitores (HTTP ${put.status})`);
  }

  try {
    await fetch(`${base}/api/display-config/preview`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forcarModo: 'slides', modoConfig: 'slides' }),
    });
  } catch (_) {}

  await new Promise((r) => setTimeout(r, 180));

  sessaoRota.host = h;
  sessaoRota.pronto = true;
}

/** Reinicia cache de rota (ex.: ao sair da tela de estrofes). */
export function resetarSessaoRotaMusica() {
  sessaoRota.host = '';
  sessaoRota.pronto = false;
}
