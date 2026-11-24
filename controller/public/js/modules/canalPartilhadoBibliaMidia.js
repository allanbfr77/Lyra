'use strict';

/**
 * Rota do canal `apresentacao` do servidor quando Bíblia e Mídias estão ambas em jogo.
 *
 * O servidor só conhece duas rotas — `slides` e `apresentacao` — e a Bíblia não tem
 * canal próprio: partilha o `apresentacao` com as Mídias. Antes, enquanto houvesse mídia
 * no ar, a Bíblia adoptava a rota da mídia e a escolha do operador era descartada; um
 * versículo nunca podia ir para outro monitor.
 *
 * Agora as duas escolhas juntam-se canal a canal, como Mídias e Slides já faziam: o
 * canal que a mídia ocupa fica da mídia, o outro fica com o que a Bíblia escolheu. Os
 * presets do seletor unificado têm canal fixo (Igreja = público, Ministrante = ministrante),
 * por isso «o mesmo canal» é sempre «o mesmo monitor» — aí vence o último projetado, e é o
 * servidor que decide isso, não esta rota.
 *
 * @param {object} rotaMidia  Rota das Mídias (já fundida com o aviso).
 * @param {object} rotaBiblia Rota do Modo Bíblia.
 * @returns {{ publicoIndex: number, ministranteIndex: number, live: boolean }}
 */
export function rotaCanalPartilhadoBibliaMidia(rotaMidia, rotaBiblia) {
  const m = normalizar(rotaMidia);
  const b = normalizar(rotaBiblia);
  /* «Live — OBS» não ocupa monitor: quem o escolheu não abre janela nenhuma. */
  if (b.live) return m;
  if (m.live) return { ...b, live: false };
  return {
    publicoIndex: m.publicoIndex >= 0 ? m.publicoIndex : b.publicoIndex,
    ministranteIndex: m.ministranteIndex >= 0 ? m.ministranteIndex : b.ministranteIndex,
    live: false,
  };
}

function normalizar(obj) {
  const live = !!(obj && obj.live);
  const pub = parseInt(obj?.publicoIndex, 10);
  const min = parseInt(obj?.ministranteIndex, 10);
  return {
    publicoIndex: live ? -1 : Number.isFinite(pub) ? pub : -1,
    ministranteIndex: live ? -1 : Number.isFinite(min) ? min : -1,
    live,
  };
}
