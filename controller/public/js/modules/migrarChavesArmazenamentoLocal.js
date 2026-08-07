/**
 * Migra chaves `localStorage` de branding legado (invblyrics / churchdisplay) para Lyra,
 * e apaga as que deixaram de existir.
 * Executar uma vez no arranque do painel, antes de qualquer leitura de preferências.
 */

/**
 * Chaves que nenhuma parte do painel lê hoje — apagadas, não renomeadas.
 *
 * `lyra_projetar_nesta_maquina` guardava o modo de operação (local ou Servidor remoto)
 * entre aberturas. Deixou de o fazer: a ligação ao Servidor vale só para a sessão, e o
 * arranque é sempre «projetar nesta máquina». Sem esta limpeza a chave ficava para sempre
 * no armazenamento de quem já usou uma versão anterior — inerte, mas a sugerir a quem
 * inspecionasse que o modo ainda se persiste algures.
 */
const CHAVES_OBSOLETAS = ['lyra_projetar_nesta_maquina'];

const PARES_CHAVES = [
  ['invblyrics_ui_modo_slides_v2', 'lyra_ui_modo_slides_v2'],
  ['invblyrics_preview_paineis_ocultos', 'lyra_preview_paineis_ocultos'],
  ['invblyrics_playlist_preview_slide_oculto', 'lyra_playlist_preview_slide_oculto'],
  ['invblyrics_modo_apresentacao_ativo', 'lyra_modo_apresentacao_ativo'],
  ['invblyrics_rotas_por_modo_v1', 'lyra_rotas_por_modo_v1'],
  ['invblyrics_apresentacao_state_v1', 'lyra_apresentacao_state_v1'],
  ['invblyrics_playlists_v1', 'lyra_playlists_v1'],
  ['churchdisplay_playlists_v1', 'lyra_playlists_v1'],
  ['invblyrics_culto', 'lyra_culto'],
  ['churchdisplay_culto', 'lyra_culto'],
  ['invblyrics_playlist_tema_sel_v1', 'lyra_playlist_tema_sel_v1'],
  ['invblyrics_playlist_temas_v1', 'lyra_playlist_temas_v1'],
  ['invblyrics_playlist_secoes_tema_recolhidas_v1', 'lyra_playlist_secoes_tema_recolhidas_v1'],
  ['invblyrics_copias_locais_v1', 'lyra_copias_locais_v1'],
  ['invblyrics_ip', 'lyra_ip'],
  ['churchdisplay_ip', 'lyra_ip'],
  ['invblyrics_slides_rail_px', 'lyra_slides_rail_px'],
  ['invblyrics_slides_chip_zoom', 'lyra_slides_chip_zoom'],
  ['invblyrics_banco_fonte', 'lyra_banco_fonte'],
  ['invblyrics_filtro_busca_titulo', 'lyra_filtro_busca_titulo'],
  ['invblyrics_filtro_busca_artista', 'lyra_filtro_busca_artista'],
  ['invblyrics_filtro_busca_letra', 'lyra_filtro_busca_letra'],
];

/**
 * @returns {boolean} `true` se alguma chave foi migrada ou apagada
 */
export function migrarChavesLegadoLocalStorage() {
  let alterou = false;
  try {
    for (const [antiga, nova] of PARES_CHAVES) {
      const valor = localStorage.getItem(antiga);
      if (valor == null) continue;
      if (localStorage.getItem(nova) == null) {
        localStorage.setItem(nova, valor);
        alterou = true;
      }
      localStorage.removeItem(antiga);
      alterou = true;
    }
    for (const obsoleta of CHAVES_OBSOLETAS) {
      /* `=== null` e não `== null`: `getItem` devolve `string | null`, nunca `undefined`. */
      if (localStorage.getItem(obsoleta) === null) continue;
      localStorage.removeItem(obsoleta);
      alterou = true;
    }
  } catch (_) {
  // intencional — erro ignorado
}
  return alterou;
}
