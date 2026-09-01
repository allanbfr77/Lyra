/**
 * Chaves `localStorage`, URLs e fragmentos SVG estáticos usados pelo painel do controlador.
 * Centralizados aqui para o núcleo (`controllerAppCore.js`) poder ser um ES module.
 */

export const LS_UI_MODO_SLIDES = 'lyra_ui_modo_slides_v2';
export const LS_VOZ_SLIDES_ATIVO = 'lyra_voz_slides_ativo_v1';
/** Preferência do microfone no modo Bíblia (independente do modo Slides). */
export const LS_VOZ_BIBLIA_ATIVO = 'lyra_voz_biblia_ativo_v1';
export const LS_PREVIEW_PAINEL_OCULTO = 'lyra_preview_paineis_ocultos';
export const LS_PLAYLIST_PREVIEW_SLIDE_OCULTO = 'lyra_playlist_preview_slide_oculto';
export const LS_MODO_APRESENTACAO_ATIVO = 'lyra_modo_apresentacao_ativo';
export const LS_ROTAS_POR_MODO = 'lyra_rotas_por_modo_v1';
/**
 * Monitores escolhidos por IDENTIDADE (nome + resolução + escala), não por índice.
 * Complementa `LS_ROTAS_POR_MODO`: os índices continuam a ser o que a UI e o servidor
 * usam em runtime, mas quem manda no arranque é este mapa — é o que sobrevive à
 * renumeração de monitores do Windows. Ver `modules/identidadeMonitores.js`.
 */
export const LS_IDENTIDADE_MONITORES = 'lyra_identidade_monitores_v1';
/**
 * Modos cuja rota de monitores o operador escolheu à mão (`{ slides: true, … }`).
 *
 * «Não exibir» é uma escolha como outra qualquer, mas é indistinguível de «ainda não
 * configurado» olhando só para os índices: os dois são -1. Sem esta marca, entrar no modo
 * Slides com o telão em «Não exibir» fazia o painel preencher a rota sozinho com M2/M3 —
 * a escolha do operador desaparecia entre uma troca de modo e outra.
 */
export const LS_ROTAS_DEFINIDAS_PELO_OPERADOR = 'lyra_rotas_definidas_operador_v1';
export const LS_APRESENTACAO_STATE = 'lyra_apresentacao_state_v1';
/** Configuração de exibição exclusiva do modo Bíblia (fundo, referência, etc.). */
export const LS_BIBLIA_CFG = 'lyra_biblia_cfg_v1';
/** Configuração de exibição do modo Slides (telão + ministrante + relógio). */
export const LS_SLIDE_CFG = 'lyra_slide_cfg_v1';
/** Notas por slide do controlador (modo Slide; só painel, nunca projeção). */
export const LS_NOTAS_SLIDE_CTRL = 'lyra_notas_slide_ctrl_v1';

/** Ícone lápis/nota — botão de nota do slide no controlador. */
export const SVG_NOTA_LAPIS =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

/** Ícones SVG: olho visível / olho cortado — só para ocultar cartão de pré-visualização no painel. */
export const SVG_OLHO_ABERTO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
export const SVG_OLHO_CORTADO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

export const LS_PLAYLISTS = 'lyra_playlists_v1';
export const LS_PLAYLISTS_LEGACY = 'churchdisplay_playlists_v1';
export const LS_CULTO = 'lyra_culto';
export const LS_CULTO_LEGACY = 'churchdisplay_culto';
/** Cultos inseridos manualmente pelo operador (além dos gerados automaticamente no mês). */
export const LS_CULTOS_MANUAIS = 'lyra_cultos_manuais_v1';
export const LS_PLAYLIST_TEMA_SEL = 'lyra_playlist_tema_sel_v1';
export const LS_PLAYLIST_TEMAS = 'lyra_playlist_temas_v1';
export const LS_PLAYLIST_SECOES_TEMA_RECOLHIDAS = 'lyra_playlist_secoes_tema_recolhidas_v1';
/** Cultos em que o usuário removeu ABERTURA da playlist (não reinserir automaticamente). */
export const LS_PLAYLIST_ABERTURA_REMOVIDA = 'lyra_playlist_abertura_removida_v1';
/** Ministrante padrão por culto (herdado por músicas novas na playlist). */
export const LS_PLAYLIST_MINISTRANTE_PADRAO = 'lyra_playlist_ministrante_padrao_v1';

export const PLAYLIST_TIPO_MARCADOR_TEMA = 'marcador_tema';

/** Tema inicial padrão em todo culto (primeiro bloco da playlist). */
export const TEMA_PADRAO_ABERTURA = 'ABERTURA';

export const LS_COPIAS_LOCAIS = 'lyra_copias_locais_v1';
export const MAX_COPIAS_LOCAIS_POR_MUSICA = 5;

export const LS_IP_KEY = 'lyra_ip';
export const LS_IP_LEGACY = 'churchdisplay_ip';
/** Preferência: gravar o IP do Servidor entre sessões (`1`/`0`; omissão = lembrar). */
export const LS_IP_LEMBRAR = 'lyra_ip_lembrar';
/** Preferência: ao iniciar, ligar sozinho se houver IP guardado e o Servidor estiver disponível (`1`/`0`; omissão = não). */
export const LS_AUTO_CONECTAR = 'lyra_auto_conectar';
export const LS_SLIDES_RAIL_PX = 'lyra_slides_rail_px';
/** Modo slides: altura (px) da faixa de prévias TELÃO/TV — ajustada arrastando a divisória. */
export const LS_SLIDES_PREVIEW_H_PX = 'lyra_slides_preview_h_px';
export const LS_SLIDES_CHIP_ZOOM = 'lyra_slides_chip_zoom';
export const LS_BANCO_FONTE = 'lyra_banco_fonte';
export const CLOUD_SHARE_URL = 'https://invb-share-api.onrender.com';
/**
 * Base da API webhook Tom Louvores (após deploy do `services/invb-webhook-api`).
 * Vazio = o Controlador sincroniza direto do Supabase.
 */
export const CLOUD_INVB_TONS_SYNC_URL = '';
/** Último `updatedAt` aplicado no sync de tons do site. */
export const LS_INVB_TONS_SYNC_AT = 'lyra_invb_tons_sync_at';
export const LS_FILTRO_TITULO = 'lyra_filtro_busca_titulo';
export const LS_FILTRO_ARTISTA = 'lyra_filtro_busca_artista';
export const LS_FILTRO_LETRA = 'lyra_filtro_busca_letra';
/** Fonte da busca de letras: `banco-local`, `cifraclub` ou `letras-mus-br`. */
export const LS_LETRAS_SITE_FONTE = 'lyra_letras_site_fonte';
/** Lista SQLite expandida (`1`, padrão) ou recolhida (`0`). */
export const LS_BANCO_SQLITE_LISTA_ABERTA = 'lyra_banco_sqlite_lista_aberta';

/** Zoom mínimo automático da grelha de slides (modo slides, Chromium). */
export const SLIDES_GRID_AUTO_ZOOM_MIN = 0.38;

/** Id sintético do cartão 6 «aviso» no modo apresentação. */
export const ID_PROJECAO_AVISO_CARD6 = '__ap_aviso_card6__';

/** Setas do acordeão de secções por tema na playlist. */
export const SVG_PLAYLIST_SECAO_EXPANDIR =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
export const SVG_PLAYLIST_SECAO_RECOLHER =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>';

/** Mesma chave que o <script> no <head> de controller.html (anti-flash tema escuro). */
export const LS_DARK_CTRL = 'holyrics-ctrl-dark';
