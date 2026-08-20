/**
 * publicProjectionRender.js — Renderização e controle de exibição da projeção pública.
 *
 * Módulo responsável por:
 *  - Renderizar slides de letras, avisos e mídias (imagem, vídeo, iframe) na tela de projeção.
 *  - Aplicar configurações visuais (fundo, alinhamento, fontes da letra) ao telão.
 *  - Controlar o estado da tela (blackout, slide preto final, tela limpa, idle).
 *  - Relógio apenas na tela ministrante, nunca no telão público.
 *
 * Injetado via `attachPublicProjectionRender(ctx)`, estendendo o contexto com
 * as funções `aplicarConfig` e `exibir`.
 *
 * @param {Object} ctx - Contexto compartilhado com referências aos elementos DOM
 *                       e helpers de renderização (elTela, elLetras, elTitulo, etc.).
 */
/* O desenho da contagem é partilhado com `display-operator.html`, para o telão e o monitor
   do ministrante nunca discordarem sobre que segundo estão a mostrar. Este módulo só corre
   sob Node (o `attach` só é chamado quando `safeRequire` devolve algo), por isso o require
   é seguro. */
const { criarRenderContagem } = require('./contagemRender');

function attachPublicProjectionRender(ctx) {
  const BIBLIA_FADE_MS = 150;
  let bibliaFadeTimer = null;
  let bibliaUltimoConteudo = '';

  /**
   * Crossfade curto só no texto/referência da Bíblia (fundo permanece — sem flash branco/preto).
   * @param {() => void} renderizar
   */
  function comFadeBibliaSeNecessario(renderizar) {
    const st = getEstadoAtual();
    if (st.tipo !== 'biblia') {
      bibliaUltimoConteudo = '';
      renderizar();
      return;
    }
    const linhas = Array.isArray(st.linhas) ? st.linhas.join('\n') : '';
    const chave = `${linhas}\n${st.titulo || ''}`;
    if (!bibliaUltimoConteudo || chave === bibliaUltimoConteudo) {
      bibliaUltimoConteudo = chave;
      renderizar();
      return;
    }
    clearTimeout(bibliaFadeTimer);
    const alvos = [ctx.elLetras, ctx.elRefBiblica].filter(Boolean);
    const reduzido =
      typeof ctx.matchMedia === 'function' &&
      ctx.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!alvos.length || reduzido) {
      bibliaUltimoConteudo = chave;
      renderizar();
      return;
    }
    alvos.forEach((el) => {
      el.style.transition = `opacity ${BIBLIA_FADE_MS}ms ease`;
      el.style.opacity = '0';
    });
    bibliaFadeTimer = setTimeout(() => {
      bibliaUltimoConteudo = chave;
      renderizar();
      if (typeof ctx.requestAnimationFrame === 'function') {
        ctx.requestAnimationFrame(() => {
          alvos.forEach((el) => {
            el.style.opacity = '1';
          });
        });
      } else {
        alvos.forEach((el) => {
          el.style.opacity = '1';
        });
      }
    }, BIBLIA_FADE_MS);
  }

  // ─── Contagem regressiva ────────────────────────────────────────────────

  /*
   * O desenho vive em `contagemRender.js`, partilhado com o monitor do ministrante. Aqui
   * fica só a ligação aos elementos desta tela.
   */
  const contagemRender = criarRenderContagem({
    document: ctx.document,
    performance: ctx.performance,
    elBox: ctx.elContagemBox,
    elDigitos: ctx.elContagemDigitos,
    elMsgTopo: ctx.elContagemMsgTopo,
    elMsgRodape: ctx.elContagemMsgRodape,
  });
  const renderizarContagem = (dados) => contagemRender.mostrar(dados);
  const limparContagem = () => contagemRender.limpar();

  /** Telão: relógio é exclusivo do ministrante. */
  function ocultarRelogioTelao() {
    if (ctx.elClockOverlay) {
      ctx.elClockOverlay.classList.remove('visivel');
      ctx.elClockOverlay.style.display = 'none';
    }
    if (typeof ctx.pararRelogio === 'function') ctx.pararRelogio();
  }

  function deveRevelarRelogioTelao(cfg) {
    const clk = (cfg && cfg.clock) || {};
    if (clk.showClock === false) return false;
    const alvo = String(clk.monitorRelogio || 'ministrante').toLowerCase();
    return alvo === 'publico' || alvo === 'ambos';
  }

  function aplicarTransparenciaOciosaTelao(ocioso, cfg) {
    const revelar = ocioso && deveRevelarRelogioTelao(cfg);
    /* Janela de projeção é opaca (vídeo quebrava com transparent:true no monitor físico).
       O relógio ocioso é revelado no main ao esconder a BrowserWindow — não via CSS. */
    ctx.document.body.classList.toggle('idle-sem-projecao', ocioso && !revelar);
    ctx.document.body.style.background = '';
    if (ctx.elTela) ctx.elTela.style.background = '';
  }

  function normalizarCorHexAviso(valor, fallback) {
    const s = String(valor || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
  }

  function normalizarCfgAviso(raw) {
    const cfg = raw && typeof raw === 'object' ? raw : {};
    const fontSize = Number(cfg.fontSize);
    return {
      fontSize: Number.isFinite(fontSize) ? Math.min(15, Math.max(2.2, fontSize)) : 5.5,
      textColor: normalizarCorHexAviso(cfg.textColor, '#ffffff'),
      backgroundColor: normalizarCorHexAviso(cfg.backgroundColor, '#000000'),
      transparentBackground: cfg.transparentBackground === true,
      wrapLongLines: cfg.wrapLongLines !== false,
      italic: cfg.italic === true,
      verticalPosition:
        cfg.verticalPosition === 'top' || cfg.verticalPosition === 'bottom'
          ? cfg.verticalPosition
          : 'center',
    };
  }

  function resolverCfgDisplayParaAviso(baseCfg, rawAvisoCfg) {
    const base = baseCfg && typeof baseCfg === 'object' ? baseCfg : {};
    const publico = base.publico && typeof base.publico === 'object' ? base.publico : {};
    const aviso = normalizarCfgAviso(rawAvisoCfg);
    return {
      ...base,
      posX: 'center',
      posY: aviso.verticalPosition,
      publico: {
        ...publico,
        fontFamily: 'CMG Sans, sans-serif',
        fontSize: aviso.fontSize,
        /* Teto do Aviso (Ajustes › Aviso); slides/bíblia continuam no padrão 9. */
        fontSizeMaxVh: 15,
        negrito: true,
        italico: aviso.italic,
        maiusculo: false,
        textColor: aviso.textColor,
        wrapLongLines: aviso.wrapLongLines,
        textAlign: 'center',
      },
    };
  }

  function aplicarFundoAvisoPublico(rawAvisoCfg) {
    const aviso = normalizarCfgAviso(rawAvisoCfg);
    const fundoCss = aviso.transparentBackground ? 'var(--bg-projecao)' : aviso.backgroundColor;
    ctx.document.documentElement.style.setProperty('--bg-aviso-projecao', fundoCss);
    return aviso;
  }

  // ─── Renderização de Mídia de Apresentação ───────────────────────────────

  /**
   * Limpa o container de mídia da apresentação, escondendo-o e removendo seu conteúdo.
   * Chamado ao sair do modo apresentação ou ao exibir outro tipo de slide.
   */
  function limparApresentacaoMedia() {
    const host = ctx.elApresentacaoMedia;
    if (!host) return;
    const video = host.querySelector('video.lyra-ap-video-proj');
    if (video) {
      try {
        video.pause();
      } catch (_) {}
    }
    host.hidden = true;
    host.innerHTML = '';
  }

  /**
   * Sincroniza play/pause/seek/volume do vídeo projetado (card 5) com o player do controlador.
   * @param {Object} st
   * @param {boolean} [st.playing]
   * @param {number} [st.currentTime]
   * @param {number} [st.volume]
   */
  function aplicarSyncVideoApresentacao(st) {
    const payload = st && typeof st === 'object' ? st : {};

    const host = ctx.elApresentacaoMedia;
    if (!host || host.hidden) {
      return;
    }

    const video = host.querySelector('video.lyra-ap-video-proj');
    if (!video || !video.src) {
      return;
    }

    const vol = Number(payload.volume);
    if (Number.isFinite(vol)) {
      video.volume = Math.max(0, Math.min(1, vol));
    }
    if (payload.syncTime === true) {
      const t = Number(payload.currentTime);
      if (Number.isFinite(t)) {
        try {
          video.currentTime = Math.max(0, t);
        } catch (_) {}
      }
    }

    const playing = !!payload.playing;
    const condPlay = playing && video.paused;
    const condPause = !playing && !video.paused;

    if (condPlay) {
      const volDesejado = Number.isFinite(vol)
        ? Math.max(0, Math.min(1, vol))
        : Math.max(0, Math.min(1, Number(video.volume) || 1));
      const tentarPlay = () => {
        const p = video.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            /* Telão público precisa de áudio — desmuta só depois do play aceito. */
            video.muted = false;
            video.volume = volDesejado;
          }).catch(() => {
            video.muted = true;
            const p2 = video.play();
            if (p2 && typeof p2.then === 'function') {
              p2
                .then(() => {
                  video.muted = false;
                  video.volume = volDesejado;
                })
                .catch(() => {});
            }
          });
        }
      };
      tentarPlay();
      return;
    }
    if (condPause) {
      try {
        video.pause();
      } catch (_) {}
    }
  }

  /**
   * Renderiza a mídia de uma apresentação no container correspondente.
   * Suporta três tipos de mídia: imagem, vídeo e iframe (padrão).
   *
   * Exibe uma mensagem de fallback caso nenhuma URL de fonte seja fornecida.
   *
   * @param {Object} ap - Objeto de apresentação com as propriedades:
   *   @param {string} ap.kind  - Tipo de mídia: 'image', 'video' ou 'iframe' (padrão).
   *   @param {string} ap.src   - URL da mídia a ser exibida.
   *   @param {string} [ap.title] - Título/alt da mídia (usado no atributo alt de imagens).
   */
  function renderizarApresentacaoMedia(ap) {
    const host = ctx.elApresentacaoMedia;
    if (!host) return;

    // Limpa o conteúdo anterior e torna o container visível
    host.innerHTML = '';
    host.hidden = false;

    const p = ap || {};
    const kind = String(p.kind || 'iframe').toLowerCase();
    const src = String(p.src || '').trim();

    // Sem URL: exibe mensagem informativa no lugar da mídia
    if (!src) {
      const msg = ctx.document.createElement('div');
      msg.className = 'apresentacao-media-msg';
      msg.textContent = 'Sem mídia para apresentação.';
      host.appendChild(msg);
      return;
    }

    // Renderiza uma imagem estática
    if (kind === 'image') {
      const img = ctx.document.createElement('img');
      img.src = src;
      img.alt = p.title ? String(p.title) : 'Imagem da apresentação';
      host.appendChild(img);
      return;
    }

    // Vídeo do card 5: sem autoplay — reprodução só via player do controlador.
    // muted inicial: autoplay policy + evita falha de play; desmuta após play ok.
    if (kind === 'video') {
      const video = ctx.document.createElement('video');
      video.className = 'lyra-ap-video-proj';
      video.src = src;
      video.autoplay = false;
      video.loop = false;
      video.muted = true;
      video.controls = false;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('playsinline', 'true');
      video.style.background = '#000';
      host.style.background = '#000';
      host.appendChild(video);
      return;
    }

    // Padrão: renderiza um iframe (YouTube, Google Slides, etc.)
    const iframe = ctx.document.createElement('iframe');
    iframe.src = src;
    iframe.allow = 'autoplay; fullscreen';
    iframe.referrerPolicy = 'no-referrer';
    iframe.setAttribute('allowfullscreen', 'true');
    host.appendChild(iframe);
  }

  // ─── Acesso ao Estado e Configuração ────────────────────────────────────

  /**
   * Retorna a configuração de display atual.
   * Usa getter do contexto se disponível; caso contrário, acessa diretamente.
   *
   * @returns {Object} Objeto de configuração de display.
   */
  function getDisplayConfig() {
    if (typeof ctx.getDisplayConfig === 'function') return ctx.getDisplayConfig();
    return ctx.displayConfig || {};
  }

  /**
   * Persiste a configuração de display no contexto.
   *
   * @param {Object} next - Nova configuração de display.
   */
  function setDisplayConfig(next) {
    if (typeof ctx.setDisplayConfig === 'function') ctx.setDisplayConfig(next);
    else ctx.displayConfig = next;
  }

  /**
   * Retorna o estado atual da projeção (slide ativo, blackout, tipo, linhas, etc.).
   *
   * @returns {Object} Estado atual da projeção.
   */
  function getEstadoAtual() {
    if (typeof ctx.getEstadoAtual === 'function') return ctx.getEstadoAtual();
    return ctx.estadoAtual || {};
  }

  /**
   * Persiste o estado atual da projeção no contexto.
   *
   * @param {Object} next - Novo estado da projeção.
   */
  function setEstadoAtual(next) {
    if (typeof ctx.setEstadoAtual === 'function') ctx.setEstadoAtual(next);
    else ctx.estadoAtual = next;
  }

  function normalizarReferenciaBiblica(valor) {
    if (valor == null) return '';
    const ref = String(valor).trim();
    if (!ref) return '';
    const lower = ref.toLowerCase();
    return lower === 'null' || lower === 'undefined' ? '' : ref;
  }

  function montarReferenciaBiblica(st) {
    const livro = normalizarReferenciaBiblica(st && st.livro);
    const capitulo = normalizarReferenciaBiblica(st && st.capitulo);
    const versiculo = normalizarReferenciaBiblica(st && st.versiculo);
    if (livro || capitulo || versiculo) {
      return livro && capitulo && versiculo ? `${livro} ${capitulo}:${versiculo}` : '';
    }
    return normalizarReferenciaBiblica(st && st.titulo);
  }

  /**
   * Aplica estilo e visibilidade da referência bíblica (livro cap:versículo) no telão público.
   *
   * @param {Object} st  - Estado do slide.
   * @param {Object} cfg - Configuração de display.
   */
  function aplicarReferenciaBiblica(st, cfg) {
    const elRef = ctx.elRefBiblica;
    if (!elRef) return;
    const pb = (cfg && cfg.publico) || {};
    const ehBiblia = st.tipo === 'biblia';
    const ref = montarReferenciaBiblica(st);
    const mostrar = ehBiblia && pb.refMostrar !== false && !!ref;

    if (!mostrar) {
      elRef.textContent = '';
      elRef.classList.add('oculta');
      return;
    }

    elRef.classList.remove('oculta');
    elRef.textContent = ref;
    elRef.style.color = pb.refColor || '#fbf904';
    const refVw = Number(pb.refFontSize);
    elRef.style.fontSize = `${Number.isFinite(refVw) && refVw > 0 ? refVw : 1.8}vw`;
    elRef.style.fontWeight = '600';
    elRef.style.textTransform = 'none';
    elRef.style.letterSpacing = '0.02em';
    elRef.style.display = '';
  }

  // ─── Aplicação de Alinhamento no Telão ──────────────────────────────────

  // ─── Aplica alinhamento vertical via flexbox no .tela ────────────
  /**
   * Define o alinhamento vertical do conteúdo na tela de projeção
   * usando flexbox (justifyContent no eixo principal vertical).
   *
   * @param {string} posY - Posição vertical: 'top', 'bottom' ou qualquer outro valor para centro.
   */
  function aplicarAlinhamentoVertical(posY) {
    const elTela = ctx.elTela;
    if (!elTela) return;
    if (posY === 'top') {
      elTela.style.justifyContent = 'flex-start';
    } else if (posY === 'bottom') {
      elTela.style.justifyContent = 'flex-end';
    } else {
      // Qualquer valor diferente de 'top' ou 'bottom' centraliza o conteúdo
      elTela.style.justifyContent = 'center';
    }
  }

  // ─── Aplica alinhamento horizontal via flexbox no .tela ──────────
  /**
   * Define o alinhamento horizontal do conteúdo na tela de projeção
   * usando flexbox (alignItems no eixo cruzado horizontal).
   *
   * @param {string} posX     - Posição horizontal: 'left', 'right' ou qualquer outro valor para centro.
   * @param {string} textAlign - Alinhamento de texto (não utilizado diretamente aqui, mas recebido para futura extensão).
   */
  function aplicarAlinhamentoHorizontal(posX, textAlign) {
    const elTela = ctx.elTela;
    if (!elTela) return;
    if (posX === 'left') {
      elTela.style.alignItems = 'flex-start';
    } else if (posX === 'right') {
      elTela.style.alignItems = 'flex-end';
    } else {
      // Qualquer valor diferente de 'left' ou 'right' centraliza horizontalmente
      elTela.style.alignItems = 'center';
    }
  }

  // ─── Aplicação Completa de Configuração no Telão ────────────────────────

  // ─── Aplica toda a config no telão ───────────────────────────────
  /**
   * Recebe um objeto de configuração parcial ou completo, faz merge com a
   * configuração atual e aplica todos os estilos visuais ao telão:
   * fundo, alinhamento e re-renderização do slide ativo se necessário.
   *
   * @param {Object} cfg - Configuração a ser aplicada (pode ser parcial).
   *   Suporta sub-objeto `publico` (slide público).
   */
  function substituirCamadaDisplay(atual, camada) {
    if (!camada || typeof camada !== 'object') return atual || {};
    const base = atual && typeof atual === 'object' ? { ...atual } : {};
    const bgType = camada.bgType != null ? camada.bgType : base.bgType || 'solid';
    const merged = { ...base, ...camada, bgType };
    merged.bgColor = camada.bgColor != null ? camada.bgColor : base.bgColor;
    merged.bgGradient = camada.bgGradient != null ? camada.bgGradient : base.bgGradient;
    if (bgType === 'image') {
      const imgPatch = camada.bgImage;
      const imgBase = base.bgImage;
      if (imgPatch != null && String(imgPatch).length > 0) {
        merged.bgImage = String(imgPatch);
      } else if (imgBase != null && String(imgBase).length > 0) {
        merged.bgImage = String(imgBase);
      } else {
        merged.bgImage = '';
      }
    } else {
      merged.bgImage = '';
    }
    return merged;
  }

  function aplicarConfig(cfg) {
    if (!cfg) return;

    const atual = getDisplayConfig();

    /** Substituição total das camadas visuais — sem herdar bgImage/bgType de modo anterior. */
    const merged = {
      ...atual,
      ...cfg,
      publico:
        cfg.publico !== undefined
          ? substituirCamadaDisplay(atual.publico, cfg.publico)
          : { ...(atual.publico || {}) },
      ministrante:
        cfg.ministrante !== undefined
          ? substituirCamadaDisplay(atual.ministrante, cfg.ministrante)
          : { ...(atual.ministrante || {}) },
      clock: { ...(atual.clock || {}), ...(cfg.clock || {}) },
    };
    setDisplayConfig(merged);

    const pb = merged.publico || {};

    // ── Fundo da projeção ──────────────────────────────────────────
    if (pb.bgType === 'gradient') {
      ctx.document.documentElement.style.setProperty('--bg-projecao', pb.bgGradient || '#000000');
    } else if (pb.bgType === 'image' && pb.bgImage) {
      ctx.document.documentElement.style.setProperty('--bg-projecao', `url('${pb.bgImage}') center/cover no-repeat`);
    } else {
      ctx.document.documentElement.style.setProperty('--bg-projecao', pb.bgColor || '#000000');
    }

    // ── Alinhamento do conteúdo na tela ───────────────────────────
    const st = getEstadoAtual() || {};
    const ehBiblia = st.tipo === 'biblia';
    const posY = ehBiblia ? pb.posY || merged.posY || 'center' : merged.posY || 'center';
    const posX = ehBiblia ? pb.posX || merged.posX || 'center' : merged.posX || 'center';
    aplicarAlinhamentoVertical(posY);
    aplicarAlinhamentoHorizontal(posX);

    ocultarRelogioTelao();

    /**
     * Reusa `exibir` quando há conteúdo activo. Em telão ocioso (ex.: ao activar monitor
     * no modo Bíblia antes do 1.º versículo), só actualiza fundo/alinhamento — evita flash.
     */
    const ehApresentacao =
      st.tipo === 'apresentacao' &&
      !st.telaLimpa &&
      !st.blackout &&
      !st.slidePretoFinal;
    const ehAviso =
      st.tipo === 'aviso' &&
      !st.telaLimpa &&
      !st.blackout &&
      !st.slidePretoFinal &&
      Array.isArray(st.linhas) &&
      st.linhas.length > 0;
    const ehContagem = st.tipo === 'contagem' && !st.telaLimpa && !st.blackout && !!st.contagem;
    const telaoOcioso =
      !st.blackout &&
      !st.slidePretoFinal &&
      !ehApresentacao &&
      !ehAviso &&
      !ehContagem &&
      (st.telaLimpa || !st.linhas || st.linhas.length === 0);

    /*
     * A contagem sai deste caminho de propósito.
     *
     * `ctx.exibir(st)` reconstrói a partir do estado GUARDADO, e o `restanteMs` desse
     * estado é o do instante em que o host o enviou. Redesenhar daqui — a meio de uma
     * contagem, porque o operador mexeu num slider de Slides — reancoraria os dígitos num
     * tempo já vencido e o telão saltaria para trás. Nada em `displayConfig` afeta a
     * contagem, que tem config própria; não há o que reaplicar.
     */
    if (ehContagem) return;

    if (!telaoOcioso && typeof ctx.exibir === 'function') {
      ctx.exibir(st);
    } else if (telaoOcioso) {
      aplicarTransparenciaOciosaTelao(true, merged);
    }
  }

  // ─── Exibição de Slides ──────────────────────────────────────────────────

  // ─── Exibe um slide ───────────────────────────────────────────────
  /**
   * Atualiza o estado da projeção e renderiza o conteúdo adequado na tela.
   *
   * Avalia o tipo e os flags do estado recebido para determinar o que exibir:
   *  - blackout / slidePretoFinal / telaLimpa: tela preta ou vazia.
   *  - tipo === 'apresentacao': exibe mídia (imagem, vídeo, iframe).
   *  - tipo === 'aviso': exibe texto de aviso sem título/referência.
   *  - tipo === 'musica' / 'biblia': exibe linhas de letra ou versículo.
   *
   * Gerencia as classes CSS do body para controle visual de cada modo.
   *
   * @param {Object} estado - Estado completo da projeção recebido do servidor.
   *   @param {string}   estado.tipo           - Tipo do slide: 'musica', 'biblia', 'aviso', 'apresentacao'.
   *   @param {string[]} [estado.linhas]        - Linhas de texto a exibir.
   *   @param {boolean}  [estado.blackout]      - Se true, tela completamente preta.
   *   @param {boolean}  [estado.slidePretoFinal] - Slide preto de encerramento.
   *   @param {boolean}  [estado.telaLimpa]     - Tela limpa (sem letras; telão sem relógio).
   *   @param {string}   [estado.titulo]        - Título do slide (bíblia).
   *   @param {Object}   [estado.apresentacao]  - Dados da mídia de apresentação.
   */
  function exibir(estado) {
    setEstadoAtual(estado || {});
    const st = getEstadoAtual();
    const cfg = getDisplayConfig();

    // ── Avaliação do modo de exibição ──────────────────────────────

    // Modo apresentação: exibe mídia sem blackout/tela limpa
    const ehApresentacao =
      st.tipo === 'apresentacao' &&
      !st.telaLimpa &&
      !st.blackout &&
      !st.slidePretoFinal;

    // Modo aviso: exibe texto de aviso se houver linhas e sem blackout
    const ehAviso =
      st.tipo === 'aviso' &&
      !st.telaLimpa &&
      !st.blackout &&
      !st.slidePretoFinal &&
      Array.isArray(st.linhas) &&
      st.linhas.length > 0;

    /* Contagem regressiva: os dígitos nascem aqui, não vêm em `linhas` — por isso a
       verificação é sobre `st.contagem` e não sobre o conteúdo de texto. */
    const ehContagem =
      st.tipo === 'contagem' &&
      !st.telaLimpa &&
      !st.blackout &&
      !st.slidePretoFinal &&
      !!st.contagem;

    // Modo idle: sem projeção ativa (tela limpa ou sem linhas, sem blackout)
    const idleSemProjecao =
      !st.blackout &&
      !st.slidePretoFinal &&
      !ehApresentacao &&
      !ehAviso &&
      !ehContagem &&
      (st.telaLimpa || !st.linhas || st.linhas.length === 0);

    // ── Atualiza as classes CSS do body para controle visual ───────
    ctx.document.body.classList.toggle('blackout-ativo', !!st.blackout);
    ctx.document.body.classList.toggle('slide-preto-final', !!(st.slidePretoFinal && !st.blackout));
    ctx.document.body.classList.toggle('modo-aviso-projecao', !!ehAviso);
    ctx.document.body.classList.toggle('modo-contagem-projecao', !!ehContagem);
    aplicarTransparenciaOciosaTelao(idleSemProjecao, cfg);

    // ── Blackout / Slide preto: fundo/preto sem relógio ───────────────
    if (st.blackout || st.slidePretoFinal) {
      limparApresentacaoMedia();
      /* O blackout apaga a contagem na tela mas não a encerra no host: o estado continua
         lá e a contagem reaparece — com o tempo certo — assim que o telão voltar. */
      limparContagem();
      ctx.elLetras.textContent = '';
      ctx.elTitulo.textContent = '';
      aplicarReferenciaBiblica({ tipo: null, titulo: '' }, cfg);
      ocultarRelogioTelao();
      return;
    }

    // ── Tela limpa: apenas fundo (relógio só no ministrante) ───────
    if (st.telaLimpa) {
      limparApresentacaoMedia();
      limparContagem();
      ctx.elLetras.textContent = '';
      ctx.elTitulo.textContent = '';
      aplicarReferenciaBiblica({ tipo: null, titulo: '' }, cfg);
      ocultarRelogioTelao();
      return;
    }

    // ── Modo contagem: dígitos calculados na própria tela ──────────
    if (ehContagem) {
      limparApresentacaoMedia();
      ctx.elLetras.textContent = '';
      ctx.elTitulo.textContent = '';
      aplicarReferenciaBiblica({ tipo: null, titulo: '' }, cfg);
      ocultarRelogioTelao();
      renderizarContagem(st.contagem);
      return;
    }

    // ── Modo apresentação: exibe mídia e limpa texto ───────────────
    if (ehApresentacao) {
      limparContagem();
      ctx.elLetras.textContent = '';
      ctx.elTitulo.textContent = '';
      aplicarReferenciaBiblica({ tipo: null, titulo: '' }, cfg);
      ocultarRelogioTelao();
      renderizarApresentacaoMedia(st.apresentacao || {});
      return;
    }

    // ── Modo aviso: exibe texto unificado sem título ou referência ─
    if (ehAviso) {
      limparApresentacaoMedia();
      limparContagem();
      ctx.elTitulo.textContent = '';
      aplicarReferenciaBiblica({ tipo: null, titulo: '' }, cfg);
      ocultarRelogioTelao();
      const aviso = aplicarFundoAvisoPublico(st.avisoConfig);
      const cfgAviso = resolverCfgDisplayParaAviso(cfg, aviso);
      aplicarAlinhamentoVertical(aviso.verticalPosition);
      aplicarAlinhamentoHorizontal('center');
      ctx.renderizarLinhas(st.linhas, cfgAviso);
      ctx.aplicarFontSize(cfgAviso);
      return;
    }

    // ── Sem linhas para exibir: limpa a tela ──────────────────────
    limparApresentacaoMedia();
    limparContagem();

    if (!st.linhas || st.linhas.length === 0) {
      ctx.elLetras.textContent = '';
      ctx.elTitulo.textContent = '';
      aplicarReferenciaBiblica({ tipo: null, titulo: '' }, cfg);
      ocultarRelogioTelao();
      return;
    }

    // ── Renderização normal de slide (música ou bíblia) ───────────
    ocultarRelogioTelao();

    const renderizarSlide = () => {
      ctx.renderizarLinhas(st.linhas, cfg);
      ctx.aplicarFontSize(cfg);
      if (st.tipo === 'musica') {
        ctx.elTitulo.textContent = '';
        aplicarReferenciaBiblica({ tipo: null, titulo: '' }, cfg);
      } else if (st.tipo === 'biblia') {
        ctx.elTitulo.textContent = '';
        aplicarReferenciaBiblica(st, cfg);
      } else {
        ctx.elTitulo.textContent = '';
        aplicarReferenciaBiblica({ tipo: null, titulo: '' }, cfg);
      }
    };

    if (st.tipo === 'biblia') {
      comFadeBibliaSeNecessario(renderizarSlide);
    } else {
      renderizarSlide();
    }
  }

  // ─── Exportação para o contexto compartilhado ────────────────────────────

  ctx.aplicarConfig = aplicarConfig;
  ctx.exibir = exibir;
  ctx.aplicarSyncVideoApresentacao = aplicarSyncVideoApresentacao;
  /* Expostos para a janela poder parar o tick ao fechar e para inspecção no DevTools. */
  ctx.renderizarContagem = renderizarContagem;
  ctx.limparContagem = limparContagem;
}

module.exports = { attachPublicProjectionRender };
