/**
 * =============================================================================
 * Lyra — Navegador alfabético lateral da Biblioteca de músicas
 * =============================================================================
 *
 * Complementa `ancoraScrollBiblioteca.js`: aquele guarda o lugar do operador
 * entre um render e o seguinte; este decide para onde ir quando ele pede —
 * clicando ou arrastando o dedo/rato por uma letra — e qual letra acender
 * enquanto ele rola manualmente. As duas coisas só falam em letras e números,
 * nunca em elementos: quem mede e quem mexe no `scrollTop` é o
 * `controllerAppCore.js`.
 */

/** As 26 letras do navegador, na ordem em que aparecem na lateral. */
export const LETRAS_NAVEGADOR_BIBLIOTECA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Letra a abrir quando a clicada não tem música nenhuma (ou o filtro escondeu
 * o grupo todo): primeiro procura-se dali em diante — é o comportamento mais
 * previsível para quem lê o alfabeto da esquerda para a direita, «a próxima
 * que existe» — e só se procura para trás quando não sobra nada depois dela
 * (ex.: clicou em «Z» e a última música é «Já»). `null` só quando a
 * Biblioteca (ou o filtro em vigor) não deixou letra nenhuma disponível.
 *
 * @param {{ letra: string, disponiveis: Set<string> | string[] }} opts
 * @returns {string | null}
 */
export function letraNavegavelMaisProxima({ letra, disponiveis }) {
  const set = disponiveis instanceof Set ? disponiveis : new Set(disponiveis || []);
  if (!set.size) return null;

  const idx = LETRAS_NAVEGADOR_BIBLIOTECA.indexOf(letra);
  if (idx === -1) return set.has(letra) ? letra : null;

  for (let i = idx; i < LETRAS_NAVEGADOR_BIBLIOTECA.length; i++) {
    if (set.has(LETRAS_NAVEGADOR_BIBLIOTECA[i])) return LETRAS_NAVEGADOR_BIBLIOTECA[i];
  }
  for (let i = idx - 1; i >= 0; i--) {
    if (set.has(LETRAS_NAVEGADOR_BIBLIOTECA[i])) return LETRAS_NAVEGADOR_BIBLIOTECA[i];
  }
  return null;
}

/**
 * Letra "atual" da lista a partir dos cabeçalhos à mostra, medidos como no
 * `ancoraScrollBiblioteca` — `top` é a distância do cabeçalho ao topo visível
 * do contentor (negativo = já rolou para cima da dobra). É a letra do último
 * cabeçalho que já cruzou o topo; se a lista ainda não rolou até nenhum
 * (está no início de tudo), fica a do primeiro cabeçalho que existir.
 *
 * @param {{ cabecalhos: Array<{ letra: string, top: number }> }} opts
 * @returns {string | null}
 */
export function letraAtualDoScrollBiblioteca({ cabecalhos }) {
  const lista = (Array.isArray(cabecalhos) ? cabecalhos : []).filter(
    (c) => c && c.letra && Number.isFinite(c.top)
  );
  if (!lista.length) return null;

  let atual = lista[0].letra;
  for (const c of lista) {
    if (c.top <= 0) atual = c.letra;
    else break;
  }
  return atual;
}

/**
 * Letra sob uma posição vertical do rato/dedo, a partir dos retângulos dos
 * botões do navegador (topo a baixo, mesma ordem do alfabeto). Usado no
 * arrastar contínuo: o ponteiro pode estar um pixel fora do botão exato (a
 * folga do toque, ou a régua encolhida numa janela baixa) e ainda assim
 * corresponde à letra mais próxima. Fora dos dois extremos, gruda no mais
 * perto em vez de devolver `null` — arrastar para baixo do «Z» continua em
 * «Z», não larga a régua.
 *
 * @param {{ y: number, botoes: Array<{ letra: string, top: number, bottom: number }> }} opts
 * @returns {string | null}
 */
export function letraSobPosicaoNavegador({ y, botoes }) {
  const lista = (Array.isArray(botoes) ? botoes : []).filter(
    (b) => b && b.letra && Number.isFinite(b.top) && Number.isFinite(b.bottom)
  );
  if (!lista.length || !Number.isFinite(y)) return null;

  for (const b of lista) {
    if (y >= b.top && y <= b.bottom) return b.letra;
  }
  if (y < lista[0].top) return lista[0].letra;
  return lista[lista.length - 1].letra;
}
