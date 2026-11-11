/**
 * Estado compartilhado do painel (Controlador).
 *
 * Reúne, num só lugar, as variáveis que mais de um módulo de `painel/` lê ou escreve — a música ativa, o
 * culto e as playlists, as rotas por modo, o estado das mídias, o último estado recebido do servidor e a
 * porta de projeção. Antes elas eram `let` do núcleo (`controllerAppCore.js`) e cada módulo as recebia por
 * getters/setters injetados; agora o núcleo e os módulos importam o mesmo objeto `estadoPainel`.
 *
 * Regras: leia e atribua por `estadoPainel.nome` (nunca guarde cópia da referência para usar depois — o valor
 * é reatribuído); este módulo não importa módulos do painel (evita ciclos) e não tem lógica.
 */
import { criarPortaProjecao } from '../modules/projecaoPorta.js';
import { clonarCfgAvisoCard6Padrao } from '../modules/midiaApresentacao.js';
import { COR_COMENTARIO_MINISTRANTE_PADRAO } from '../modules/comentariosSlide.js';

export const estadoPainel = {
  lyraAssinaturaEstadoProjecaoRecebido: null,
  letrasSiteFonte: 'lyra-online',
  /** Lista de músicas SQLite visível (padrão) ou recolhida. */
  bancoSqliteListaExpandida: true,
  cultosDoMesCache: [],
  cultosManuaisCache: [],
  socket: null,
  companionHandoffEmCurso: false,
  autoConectarAoIniciarEmCurso: false,
  reassumirLocalEmCurso: false,
  // Write-lock: papel deste controlador conforme o servidor (null = ainda desconhecido).
  // { primario: boolean, podeEscrever: boolean, donoAtual: string|null }
  papelControladorLocal: null,
  // Último display_config autoritativo recebido do servidor — base do "pull" quando somente-leitura.
  ultimaDisplayConfigServidor: null,
  apresentacaoBiblioteca: [],
  apresentacaoCards: Array(6).fill(null),
  /** As quatro imagens do card 4, por posição na grelha (0 = cima-esquerda … 3 = baixo-direita). */
  apresentacaoCard4Imagens: Array(4).fill(null),
  /** Área do card 4 à espera do ficheiro escolhido no seletor, ou `null`. */
  apresentacaoCard4InputTarget: null,
  /** Texto editável do card 6 (avisos); não usa ficheiro. */
  apresentacaoCard6Texto: '',
  /** Configuração global do card 6 — aplicada igualmente ao público e ministrante. */
  apresentacaoCard6AvisoCfg: clonarCfgAvisoCard6Padrao(),
  apresentacaoAudios: [],
  apresentacaoArquivoSelecionadoId: null,
  /** Id do item de vídeo/imagem/PDF/web projetado no telão público (não áudio) — destaque no card e roda-pé. */
  apresentacaoMidiaProjetadaId: null,
  apresentacaoAudioAtualId: null,
  audioStateRemoto: {
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    name: '',
    /** 'audio' | 'video' — qual elemento `<audio>` / `<video>` o player universal controla. */
    mediaKind: '',
  },
  audioLoopAtivo: false,
  audioLoopReinicioPendente: false,
  /** ─── Playlist de vídeos (modo Mídias) — camada sobre o motor de vídeo único ─── */
  apresentacaoVideoPlaylist: [],
  /** Índice do item atualmente carregado/reproduzido na playlist (-1 = nenhum). */
  playlistVideoIndice: -1,
  /** 'manual' (padrão) | 'auto' — comportamento ao terminar um vídeo. */
  playlistVideoModo: 'manual',
  /** Segundos de intervalo antes de iniciar o próximo no modo automático (0,1,2,3,5). */
  playlistVideoAtrasoAuto: 0,
  /** true quando a playlist é o contexto que controla o player de vídeo. */
  playlistVideoAtiva: false,
  /** Guarda: reaproveita projetarItemApresentacao sem desativar a playlist. */
  _playlistProjetando: false,
  /** Cache do estado tocando/pausado para atualizar a UI só em transições. */
  _playlistUiTocandoCache: null,
  audioSeekDragging: false,
  apresentacaoCardInputTarget: null,
  rotasPorModo: {
    completo: { publicoIndex: -1, ministranteIndex: -1 },
    slides: { publicoIndex: -1, ministranteIndex: -1 },
    apresentacao: { publicoIndex: -1, ministranteIndex: -1 },
    apresentacaoAviso: { publicoIndex: -1, ministranteIndex: -1 },
    biblia: { publicoIndex: -1, ministranteIndex: -1 },
    /* Rota só do DOCS — estado próprio, nunca espelhado em `apresentacao` nem em `biblia`. */
    docs: { publicoIndex: -1, ministranteIndex: -1 },
    /* Pin exclusivo do Contador — nunca partilha com o seletor do cabeçalho. */
    contagem: { publicoIndex: -1, ministranteIndex: -1 },
  },
  musicaAtiva: null,
  /**
   * Destaque visual da Biblioteca — exclusivo em relação à Playlist.
   * `{ id, fonte }` da linha clicada; `null` se nada estiver marcado à esquerda.
   */
  selecaoUiBiblioteca: null,
  /**
   * Destaque visual da Playlist — exclusivo em relação à Biblioteca.
   * `{ id, versaoLocalId, fonte }` do item clicado; `null` se nada estiver marcado à direita.
   */
  selecaoUiPlaylist: null,
  /** `user` — SQLite do servidor · `catalog` — `catalog.db` somente leitura (mesmo `id` pode existir nos dois). */
  musicaBancoFonte: 'user',
  /** `null` = letra do servidor (original ou cópia com id próprio); id `c_*` = cópia legada em localStorage. */
  musicaVersaoLocalId: null,
  /** Âncora da família de versões no SQLite (`root_id`). */
  musicaRootId: null,
  /** Cache de `GET /api/musicas/:id/versoes` para a barra de versões. */
  versoesMusicaServidorCache: { rootId: null, versoes: [] },
  estrofeAtiva: -1,
  todasMusicas: [],
  estadoServidor: null,
  /** Composição visual da Home; música, versões e edição continuam neste núcleo. */
  homeLayout: null,
  cultoId: '',
  playlists: {},
  temaSelecionadoPorCulto: {},
  temasPorCulto: {},
  /** Só permite editar/apagar estrofes após «Editar letra». */
  modoEdicaoEstrofes: false,
  /** true = TODAS MAIÚSCULAS na edição; false = 1.ª maiúscula + resto minúsculas (por linha). */
  caixaLetrasEdicaoMaiuscula: false,
  /** Coluna central: ver letra inteira num só bloco (cópia), em vez dos cartões por slide. */
  modoLetraCompletaCentral: false,
  /** Letra completa tem dois modos: visualização (somente leitura) e edição (depois de «Editar»). */
  letraCompletaEditando: false,
  /** Cópia ao entrar no modo letra completa — «Cancelar» restaura isto (não aplica o textarea). */
  snapshotLetraCompleta: null,
  /**
   * MODO COMPARATIVO — duas versões da mesma música lado a lado.
   *
   * Vive à parte dos outros dois modos da coluna central (cartões por slide e
   * letra completa): tem painel próprio, guarda o seu próprio par de versões e
   * grava directamente por `id` de versão, sem passar por `musicaAtiva`. É por
   * isso que não mexe em nada do fluxo de edição existente.
   */
  modoComparativoCentral: false,
  /** `{ a: LadoComparativo, b: LadoComparativo }` das versões carregadas. */
  comparativoLados: null,
  /** Estrofes de cada lado ao abrir — «Cancelar» descarta contra isto. */
  snapshotComparativo: null,
  /** Cópia ao entrar em edição — «Encerrar edição» restaura isto (não grava). */
  snapshotEdicaoEstrofes: null,
  /**
   * Faixa inferior de slides: no modo controlador só após duplo clique num slide central.
   * No modo slides fica visível ao escolher música na playlist (sem projetar até duplo clique na lista).
   */
  slidesDockVisivel: false,
  /** Modo slides: após ESC a música é desmarcada; ao escolher outra na playlist a faixa volta a abrir. */
  slidesRailUserRecolhido: false,
  /**
   * Modo slides: a grelha de chips só aparece após escolher música na playlist (não ao carregar do banco na coluna esquerda).
   * Ao entrar no modo slides fica sempre false até clique/dupro na playlist ou «Próxima música».
   */
  faixaSlidesHabilitadaPorPlaylistNoModoSlides: false,
  /**
   * Quando false, mudanças de estrofe só atualizam o painel (sem enviar às telas) até o primeiro duplo clique
   * na faixa de slides ou no cartão central — ou até «Próxima música», sincronização do servidor, etc.
   */
  projecaoMusicaEmitidaNoServidor: false,
  /**
   * Após escolher música no painel (playlist/banco), não aplicar estado «estado» do socket como se fosse projeção
   * até este cliente emitir `exibir_musica` — senão o servidor continua com a mesma música e os previews voltavam a mostrar letra só com um clique.
   */
  bloqueioSincronizarEstrofeDoServidor: false,
  slidesRailDrag: { active: false, alvo: 'faixa', startY: 0, startH: 520 },
  monitoresServidorCache: [],
  /**
   * Cor efectiva dos comentários na prévia do painel — fonte única para o `style` inline do
   * render E para a var CSS de reforço. Nunca é rebaixada para o padrão: uma config parcial
   * (sem `commentColor`) mantém a cor já aplicada em vez de piscar para o azul de fábrica.
   *
   * Declarada aqui, e não junto de `aplicarCorComentarioMinistranteNoPainel`, porque
   * `carregarSlideCfgInicialDoStorage()` corre no topo do módulo e já aplica a cor.
   */
  corComentarioMinistrantePainel: COR_COMENTARIO_MINISTRANTE_PADRAO,
};

/**
 * Porta de projeção — ver `modules/projecaoPorta.js`.
 *
 * Todo comando destinado às telas passa por aqui, e todo retorno sobre o que está
 * projetado entra por aqui. Nasce sem transporte: `iniciarSocket()` liga-lhe o socket.
 * Enquanto não houver transporte, `pronta()` é `false` e nada é enviado — o mesmo que
 * acontecia antes com `socket` ainda `null`.
 */
export const projecao = criarPortaProjecao();

/** Índice do card 5 na grelha (0-based = 4); único slot que aceita vídeo. */
export const APRESENTACAO_IDX_CARD5 = 4;

/**
 * Índice do card 4 na grelha (0-based = 3).
 *
 * Ao contrário dos outros, este card não guarda uma mídia: é o recipiente de quatro áreas
 * de imagem independentes, numa grelha 2×2. O slot correspondente em `apresentacaoCards`
 * fica sempre vazio — quem guarda o conteúdo é `apresentacaoCard4Imagens`.
 */
export const APRESENTACAO_IDX_CARD4 = 3;
