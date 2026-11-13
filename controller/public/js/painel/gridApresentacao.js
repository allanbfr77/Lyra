/**
 * Mídias: grelha de cards da apresentação — seleção, card de quatro imagens, render dos cards e adição
 * de arquivos. Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasGridApresentacao`.
 */
import { escapeHtml } from './textoHtmlSeguro.js';
import { obterThumbVideoApresentacao, rotuloTipoMidiaApresentacao, srcImagemApresentacaoSeguro, svgIconeTipoMidiaApresentacao } from '../modules/midiaApresentacao.js';
import { atualizarPreviewVideoAoVivo } from './playerLocalMidia.js';
import { criarItemApresentacaoDeArquivo, renderMenuApresentacao } from './bibliotecaMidiasApresentacao.js';
import { garantirThumbnailVideoItem, garantirVideoSrcHttp, projetarItemApresentacao, videoProjetadoAtivoNoPlayer } from './videoApresentacao.js';
import { APRESENTACAO_IDX_CARD4, APRESENTACAO_IDX_CARD5, estadoPainel } from './estadoPainel.js';
import { agendarSalvarEstadoAposDigitarAviso, flushSalvarEstadoAposDigitarAviso, salvarEstadoModoApresentacaoNoStorage } from './estadoApresentacao.js';
import { aplicarEstiloTextareaAvisoCard6, atualizarFeedbackProjecaoApresentacaoUi, criarSeletorMonitorAvisoCard6, emitirEncerrarApresentacaoPublicoAoServidor, getApresentacaoAvisoCard6Ativo, projetarAvisoCard6 } from './conteudoUnificadoAviso.js';
import { ehModoApresentacaoOperador } from './modosUi.js';
import { encerrarAvisoCard6NoControlador } from './menuApresentacaoModo.js';

/**
 * URL segura para `<img>` nos cards: só conteúdo **imagem** (`data:image/…`, `blob:` ou
 * `http(s)://…/api/apresentacao/media/id`). PDF/vídeo/áudio usam o mesmo endpoint no servidor
 * mas não são renderizáveis em `<img>` — sem o filtro por tipo aparecia ícone de imagem partida.
 */
/** Índice do card destacado na grelha (0–5) ou null — igual «slide seleccionado» na faixa do modo slide. */
let apresentacaoCardSelecionadoIdx = null;
/** Debounce entre clique simples e duplo na grelha de apresentação (padrão playlist). */
let apresentacaoCardUiClickTimer = null;

function aplicarClasseSelecaoCardsApresentacaoNoDom() {
  const grid = document.getElementById('apresentacao-grid');
  if (!grid) return;
  grid.querySelectorAll('.ap-card[data-ap-card-idx]').forEach((el) => {
    const idx = parseInt(el.dataset.apCardIdx, 10);
    const sel =
      Number.isFinite(idx) &&
      apresentacaoCardSelecionadoIdx !== null &&
      idx === apresentacaoCardSelecionadoIdx;
    el.classList.toggle('ap-card--selecionado', sel);
  });
}

function definirSelecaoCardApresentacao(idx) {
  if (idx === null || idx === undefined) {
    apresentacaoCardSelecionadoIdx = null;
  } else {
    const n = Number(idx);
    apresentacaoCardSelecionadoIdx = Number.isFinite(n) && n >= 0 && n <= 5 ? n : null;
  }
  /* Seleccionar outro card larga a área destacada dentro do card 4. */
  if (apresentacaoCardSelecionadoIdx !== APRESENTACAO_IDX_CARD4) {
    apresentacaoCard4SubSelecionadoIdx = null;
  }
  aplicarClasseSelecaoCardsApresentacaoNoDom();
}

/**
 * Card 4 — quatro áreas de imagem numa grelha 2×2 dentro do mesmo cartão.
 *
 * Ocupa a célula da grelha que sempre ocupou e mantém a moldura, o número e o
 * comportamento dos outros cards; o que muda é o interior, dividido por uma linha
 * vertical e uma horizontal em quatro áreas que se enchem e projetam uma a uma.
 *
 * O cartão em si nunca fica com o desenho de «vazio»: quem está vazia, ou não, é cada
 * uma das áreas lá dentro.
 */
function montarCardQuatroImagensApresentacao() {
  const card = document.createElement('div');
  card.dataset.apCardIdx = String(APRESENTACAO_IDX_CARD4);
  card.className = 'ap-card ap-card--quad';

  const num = document.createElement('span');
  num.className = 'ap-card-num';
  num.textContent = `CARD ${APRESENTACAO_IDX_CARD4 + 1}`;

  const body = document.createElement('div');
  body.className = 'ap-card-body ap-card-body--quad';
  body.dataset.cardIdx = String(APRESENTACAO_IDX_CARD4);
  for (let sub = 0; sub < 4; sub++) {
    body.appendChild(montarAreaImagemCard4(sub));
  }

  card.appendChild(num);
  card.appendChild(body);
  return card;
}

/**
 * Uma das quatro áreas do card 4.
 *
 * Cada área é independente: recebe o seu ficheiro, mostra a sua imagem, tem o seu «X» e
 * responde ao clique (selecionar) e ao duplo clique (projetar) como qualquer card da
 * grelha — é o mesmo `projetarItemApresentacao` de sempre, que não precisa de saber de
 * onde veio a imagem.
 *
 * Aqui só entram imagens. Vídeo continua a ser exclusivo do card 5, e PDF/apresentação
 * não teriam como se mostrar numa área deste tamanho.
 *
 * @param {number} sub 0 = cima-esquerda, 1 = cima-direita, 2 = baixo-esquerda, 3 = baixo-direita
 */
function montarAreaImagemCard4(sub) {
  const item = estadoPainel.apresentacaoCard4Imagens[sub] || null;
  const slot = document.createElement('div');
  slot.className = 'ap-quad-slot' + (item ? '' : ' ap-quad-slot--vazio');
  slot.dataset.card4Sub = String(sub);
  if (apresentacaoCard4SubSelecionadoIdx === sub) slot.classList.add('ap-quad-slot--selecionado');

  if (!item) {
    slot.title = `Imagem ${sub + 1} do card 4 — clique para escolher um ficheiro`;
    const mais = document.createElement('div');
    mais.className = 'ap-quad-plus';
    mais.textContent = '+';
    mais.setAttribute('aria-hidden', 'true');
    slot.appendChild(mais);
    slot.addEventListener('click', () => {
      estadoPainel.apresentacaoCard4InputTarget = sub;
      estadoPainel.apresentacaoCardInputTarget = null;
      const input = document.getElementById('apresentacao-add-card-input');
      if (!input) return;
      input.accept = 'image/*';
      input.value = '';
      input.click();
    });
  } else {
    slot.title = `${String(item.name || 'imagem')} — clique para selecionar · duplo clique para projetar`;
    const src = srcImagemApresentacaoSeguro(item.src, item);
    if (src) {
      const img = document.createElement('img');
      img.className = 'ap-quad-img';
      img.alt = String(item.name || 'imagem');
      img.src = src;
      slot.appendChild(img);
    }
    if (item.id && item.id === estadoPainel.apresentacaoMidiaProjetadaId) {
      slot.classList.add('ap-quad-slot--projetando');
      const live = document.createElement('div');
      live.className = 'ap-quad-live';
      live.textContent = 'AO VIVO';
      live.setAttribute('aria-hidden', 'true');
      slot.appendChild(live);
    }

    slot.draggable = true;
    slot.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', item.id || '');
      ev.dataTransfer.setData('application/x-ap-card4-sub-idx', String(sub));
      ev.dataTransfer.effectAllowed = 'copyMove';
    });
    slot.addEventListener('click', (ev) => {
      if (ev.target.closest('.ap-quad-remove')) return;
      if (ev.detail >= 2) return;
      clearTimeout(apresentacaoCardUiClickTimer);
      apresentacaoCardUiClickTimer = setTimeout(() => {
        apresentacaoCardUiClickTimer = null;
        apresentacaoCard4SubSelecionadoIdx = sub;
        definirSelecaoCardApresentacao(APRESENTACAO_IDX_CARD4);
        /* Troca a classe nas quatro áreas em vez de redesenhar a grelha: um clique não
           deve fazer as imagens piscarem enquanto voltam a carregar. */
        slot.parentElement?.querySelectorAll('.ap-quad-slot').forEach((el) => {
          el.classList.toggle('ap-quad-slot--selecionado', el === slot);
        });
      }, 300);
    });
    slot.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.ap-quad-remove')) return;
      ev.preventDefault();
      clearTimeout(apresentacaoCardUiClickTimer);
      apresentacaoCardUiClickTimer = null;
      projetarItemApresentacao(item);
    });

    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.className = 'ap-quad-remove';
    btnRemove.title = 'Remover esta imagem';
    btnRemove.setAttribute('aria-label', `Remover a imagem ${sub + 1} do card 4`);
    btnRemove.textContent = 'X';
    btnRemove.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (item.id && estadoPainel.apresentacaoMidiaProjetadaId === item.id) {
        estadoPainel.apresentacaoMidiaProjetadaId = null;
        void emitirEncerrarApresentacaoPublicoAoServidor();
      }
      if (apresentacaoCard4SubSelecionadoIdx === sub) apresentacaoCard4SubSelecionadoIdx = null;
      estadoPainel.apresentacaoCard4Imagens[sub] = null;
      salvarEstadoModoApresentacaoNoStorage();
      renderGridApresentacao();
      atualizarFeedbackProjecaoApresentacaoUi({
        mensagemIdle: `Imagem ${sub + 1} do card 4 removida.`,
      });
    });
    slot.appendChild(btnRemove);
  }

  slot.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    slot.classList.add('drag-over');
    ev.dataTransfer.dropEffect = 'copy';
  });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    slot.classList.remove('drag-over');
    const id = String(ev.dataTransfer.getData('text/plain') || '');
    const subDe = parseInt(String(ev.dataTransfer.getData('application/x-ap-card4-sub-idx') || ''), 10);
    const cardDe = parseInt(String(ev.dataTransfer.getData('application/x-ap-card-idx') || ''), 10);
    const veioDeArea = Number.isInteger(subDe) && subDe >= 0 && subDe < 4;
    const veioDeCard = !veioDeArea && Number.isInteger(cardDe) && cardDe >= 0 && cardDe < 5;

    let it = null;
    if (id) it = estadoPainel.apresentacaoBiblioteca.find((x) => x.id === id) || null;
    if (!it && veioDeArea) it = estadoPainel.apresentacaoCard4Imagens[subDe] || null;
    if (!it && veioDeCard) it = estadoPainel.apresentacaoCards[cardDe] || null;
    if (!it) return;
    if (!ehItemImagemApresentacao(it)) {
      alert('As quatro áreas do card 4 exibem apenas imagens.');
      return;
    }
    /* Arrastar é mover, como entre os outros cards: a origem fica livre. */
    if (veioDeArea) {
      if (subDe === sub) return;
      estadoPainel.apresentacaoCard4Imagens[subDe] = null;
    } else if (veioDeCard) {
      estadoPainel.apresentacaoCards[cardDe] = null;
    }
    estadoPainel.apresentacaoCard4Imagens[sub] = it;
    salvarEstadoModoApresentacaoNoStorage();
    renderGridApresentacao();
  });

  return slot;
}

/**
 * Ficheiro escolhido no seletor para uma das quatro áreas do card 4.
 *
 * Espelha `adicionarArquivoDiretoNoCard` — cria o item, junta-o à biblioteca se ainda lá
 * não estiver e grava — mudando só onde o item fica e o que é aceite.
 */
export function adicionarImagemNaAreaCard4(file, sub) {
  const s = Number(sub);
  if (!Number.isInteger(s) || s < 0 || s > 3) return;
  criarItemApresentacaoDeArquivo(file, (item) => {
    if (!ehItemImagemApresentacao(item)) {
      alert('As quatro áreas do card 4 aceitam apenas imagens.');
      return;
    }
    estadoPainel.apresentacaoCard4Imagens[s] = item;
    const ja = estadoPainel.apresentacaoBiblioteca.some((x) => x.src === item.src && x.name === item.name);
    if (!ja) estadoPainel.apresentacaoBiblioteca.push(item);
    salvarEstadoModoApresentacaoNoStorage();
    renderMenuApresentacao();
    renderGridApresentacao();
    atualizarFeedbackProjecaoApresentacaoUi({
      mensagemIdle: `Imagem ${s + 1} do card 4: ${item.name}`,
    });
  });
}

export function renderGridApresentacao() {
  const grid = document.getElementById('apresentacao-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (let i = 0; i < 5; i++) {
    /* O card 4 não guarda uma mídia: é o recipiente das quatro áreas de imagem. */
    if (i === APRESENTACAO_IDX_CARD4) {
      grid.appendChild(montarCardQuatroImagensApresentacao());
      continue;
    }
    const card = document.createElement('div');
    const item = estadoPainel.apresentacaoCards[i];
    card.dataset.apCardIdx = String(i);
    card.className = item ? 'ap-card' : 'ap-card ap-card--vazio';
    const num = document.createElement('span');
    num.className = 'ap-card-num';
    num.textContent = i === APRESENTACAO_IDX_CARD5 ? 'CARD 5 — (APENAS VÍDEO)' : `CARD ${i + 1}`;
    const body = document.createElement('div');
    body.className = 'ap-card-body';
    body.dataset.cardIdx = String(i);
    if (!item) {
      body.innerHTML = '<div class="ap-card-plus">+</div>';
      body.addEventListener('click', () => {
        estadoPainel.apresentacaoCardInputTarget = i;
        estadoPainel.apresentacaoCard4InputTarget = null;
        const input = document.getElementById('apresentacao-add-card-input');
        if (!input) return;
        input.accept =
          i === APRESENTACAO_IDX_CARD5
            ? 'video/*'
            : 'image/*,application/pdf,.ppt,.pptx,.odp';
        input.value = '';
        input.click();
      });
    } else {
      const srcRaw = String(item.src || '');
      const kItem = String(item.kind || '').toLowerCase();
      const mimeItem = String(item.mime || '').toLowerCase();
      const ehCard5Video = i === APRESENTACAO_IDX_CARD5 && kItem === 'video';
      if (ehCard5Video) {
        card.classList.add('ap-card--video');
        body.className = 'ap-card-body ap-card-body--video';
      }
      const ehImg =
        !ehCard5Video &&
        (/^data:image\//i.test(srcRaw) ||
          (kItem === 'image' || mimeItem.startsWith('image/')));
      const srcImg = ehImg ? srcImagemApresentacaoSeguro(item.src, item) : '';
      const metaLinha = `${svgIconeTipoMidiaApresentacao(item.kind)}<span>${escapeHtml(rotuloTipoMidiaApresentacao(item.kind))}</span>`;
      const wrap = document.createElement('div');
      wrap.className = ehCard5Video ? 'ap-card5-video-wrap' : 'ap-card-file';
      const card5VideoAoVivo =
        ehCard5Video &&
        item.id === estadoPainel.apresentacaoMidiaProjetadaId &&
        estadoPainel.audioStateRemoto.mediaKind === 'video' &&
        !!estadoPainel.audioStateRemoto.playing;
      if (ehCard5Video && card5VideoAoVivo) {
        /* Slot placeholder com id estável; o overlay de vídeo ao vivo o cobre. */
        const slot = document.createElement('div');
        slot.className = 'ap-card5-video-player';
        slot.id = 'ap-card5-video-live-slot';
        slot.setAttribute('aria-hidden', 'true');
        wrap.appendChild(slot);
      } else if (ehCard5Video) {
        const thumbSrc = obterThumbVideoApresentacao(item);
        if (thumbSrc) {
          const img = document.createElement('img');
          img.className = 'ap-card5-video-player ap-card5-video-thumb';
          img.alt = '';
          img.src = thumbSrc;
          wrap.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'ap-card5-video-player ap-card5-video-thumb-placeholder';
          ph.setAttribute('aria-hidden', 'true');
          wrap.appendChild(ph);
          void garantirThumbnailVideoItem(item).then((it) => {
            if (videoProjetadoAtivoNoPlayer() && estadoPainel.audioStateRemoto.playing) return;
            if (!it?.thumb) return;
            estadoPainel.apresentacaoCards[APRESENTACAO_IDX_CARD5] = it;
            const bibIdx = estadoPainel.apresentacaoBiblioteca.findIndex((x) => x && x.id === it.id);
            if (bibIdx >= 0) estadoPainel.apresentacaoBiblioteca[bibIdx] = it;
            salvarEstadoModoApresentacaoNoStorage();
            if (ehModoApresentacaoOperador()) renderGridApresentacao();
          });
        }
      } else if (srcImg) {
        const img = document.createElement('img');
        img.className = 'ap-card-preview-image';
        img.alt = String(item.name || 'imagem');
        img.src = srcImg;
        wrap.appendChild(img);
      }
      const nomeEl = document.createElement('div');
      nomeEl.className = ehCard5Video ? 'ap-card5-video-name' : 'ap-card-file-name';
      nomeEl.title = String(item.name || '');
      nomeEl.textContent = String(item.name || 'Arquivo');
      wrap.appendChild(nomeEl);
      if (!ehCard5Video) {
        const metaEl = document.createElement('div');
        metaEl.className = 'ap-card-file-meta';
        metaEl.title = String(item.name || '');
        metaEl.innerHTML = metaLinha;
        wrap.appendChild(metaEl);
      }
      if (item.id && item.id === estadoPainel.apresentacaoMidiaProjetadaId && item.kind !== 'audio') {
        card.classList.add('ap-card--projetando');
        const live = document.createElement('div');
        live.className = 'ap-card-live-pill';
        live.textContent = 'AO VIVO';
        live.setAttribute('aria-hidden', 'true');
        wrap.insertBefore(live, wrap.firstChild);
      }
      body.appendChild(wrap);
      body.draggable = true;
      body.title = 'Clique para selecionar · duplo clique para projetar';
      body.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', item.id || '');
        ev.dataTransfer.setData('application/x-ap-card-idx', String(i));
        ev.dataTransfer.effectAllowed = 'copyMove';
      });
      body.addEventListener('click', (ev) => {
        if (ev.target.closest('.ap-card-remove')) return;
        if (ev.detail >= 2) return;
        clearTimeout(apresentacaoCardUiClickTimer);
        apresentacaoCardUiClickTimer = setTimeout(() => {
          apresentacaoCardUiClickTimer = null;
          definirSelecaoCardApresentacao(i);
        }, 300);
      });
      body.addEventListener('dblclick', (ev) => {
        if (ev.target.closest('.ap-card-remove')) return;
        ev.preventDefault();
        clearTimeout(apresentacaoCardUiClickTimer);
        apresentacaoCardUiClickTimer = null;
        projetarItemApresentacao(item);
      });

      const btnRemove = document.createElement('button');
      btnRemove.type = 'button';
      btnRemove.className = 'ap-card-remove';
      btnRemove.title = 'Remover arquivo do card';
      btnRemove.setAttribute('aria-label', `Remover arquivo do card ${i + 1}`);
      btnRemove.innerHTML =
        '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>';
      btnRemove.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (item.id && estadoPainel.apresentacaoMidiaProjetadaId === item.id) {
          estadoPainel.apresentacaoMidiaProjetadaId = null;
          void emitirEncerrarApresentacaoPublicoAoServidor();
        }
        if (apresentacaoCardSelecionadoIdx === i) definirSelecaoCardApresentacao(null);
        estadoPainel.apresentacaoCards[i] = null;
        salvarEstadoModoApresentacaoNoStorage();
        atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: `Card ${i + 1} limpo.` });
      });
      card.appendChild(btnRemove);
    }
    body.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      body.classList.add('drag-over');
      ev.dataTransfer.dropEffect = 'copy';
    });
    body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
    body.addEventListener('drop', (ev) => {
      ev.preventDefault();
      body.classList.remove('drag-over');
      const id = String(ev.dataTransfer.getData('text/plain') || '');
      const fromIdxRaw = ev.dataTransfer.getData('application/x-ap-card-idx');
      const fromIdx = parseInt(String(fromIdxRaw || ''), 10);
      let it = null;
      if (id) it = estadoPainel.apresentacaoBiblioteca.find((x) => x.id === id) || null;
      if (!it && Number.isInteger(fromIdx) && fromIdx >= 0 && fromIdx < 5) {
        it = estadoPainel.apresentacaoCards[fromIdx] || null;
      }
      if (!it) return;
      if (it.kind === 'video' && i !== APRESENTACAO_IDX_CARD5) {
        alert('Use o card 5 para ficheiros de vídeo.');
        return;
      }
      if (it.kind !== 'video' && i === APRESENTACAO_IDX_CARD5) {
        alert('O card 5 aceita apenas vídeos.');
        return;
      }
      if (Number.isInteger(fromIdx) && fromIdx >= 0 && fromIdx < 5) {
        if (fromIdx === i) return;
        estadoPainel.apresentacaoCards[fromIdx] = null;
      }
      if (it.kind === 'video') {
        void (async () => {
          const itemHttp = await garantirVideoSrcHttp(it);
          await garantirThumbnailVideoItem(itemHttp);
          estadoPainel.apresentacaoCards[i] = itemHttp;
          salvarEstadoModoApresentacaoNoStorage();
          renderGridApresentacao();
        })();
        return;
      }
      estadoPainel.apresentacaoCards[i] = it;
      salvarEstadoModoApresentacaoNoStorage();
      renderGridApresentacao();
    });
    card.appendChild(num);
    card.appendChild(body);
    grid.appendChild(card);
  }

  /* Card 6: avisos em texto (sem ficheiro) */
  const card6 = document.createElement('div');
  card6.dataset.apCardIdx = '5';
  card6.className = 'ap-card ap-card--aviso';
  card6.title = 'Clique para selecionar o card · duplo clique fora do texto para projetar';
  if (getApresentacaoAvisoCard6Ativo()) card6.classList.add('ap-card--projetando');
  const num6 = document.createElement('span');
  num6.className = 'ap-card-num';
  num6.textContent = 'CARD 6 — AVISOS';
  const body6 = document.createElement('div');
  body6.className = 'ap-card-body ap-card-body--aviso';
  body6.dataset.cardIdx = '5';
  const ta = document.createElement('textarea');
  ta.className = 'ap-card6-aviso-textarea';
  ta.dataset.apCard6CfgField = '1';
  ta.setAttribute('aria-label', 'Texto de avisos para projetar no card 6');
  ta.placeholder = 'Digite o aviso… (duplo clique projeta)';
  ta.value = estadoPainel.apresentacaoCard6Texto;
  aplicarEstiloTextareaAvisoCard6(ta, estadoPainel.apresentacaoCard6AvisoCfg);
  ta.addEventListener('click', (ev) => ev.stopPropagation());
  ta.addEventListener('input', () => {
    // Atualização em memória é instantânea; a gravação pesada é adiada (debounce) para não travar a digitação.
    estadoPainel.apresentacaoCard6Texto = ta.value;
    agendarSalvarEstadoAposDigitarAviso();
  });
  ta.addEventListener('blur', flushSalvarEstadoAposDigitarAviso);
  ta.addEventListener('dblclick', (ev) => {
    ev.stopPropagation();
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = null;
    projetarAvisoCard6();
  });
  card6.addEventListener('click', (ev) => {
    if (ev.target === ta || (ta && ta.contains(ev.target))) return;
    if (ev.target.closest('.ap-card6-footer')) return;
    if (ev.target.closest('button')) return;
    if (ev.detail >= 2) return;
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = setTimeout(() => {
      apresentacaoCardUiClickTimer = null;
      definirSelecaoCardApresentacao(5);
    }, 300);
  });
  card6.addEventListener('dblclick', (ev) => {
    if (ev.target === ta || (ta && ta.contains(ev.target))) return;
    if (ev.target.closest('.ap-card6-footer')) return;
    if (ev.target.closest('button')) return;
    ev.preventDefault();
    ev.stopPropagation();
    clearTimeout(apresentacaoCardUiClickTimer);
    apresentacaoCardUiClickTimer = null;
    projetarAvisoCard6();
  });
  if (getApresentacaoAvisoCard6Ativo()) {
    const live = document.createElement('div');
    live.className = 'ap-card-live-pill';
    live.textContent = 'AO VIVO';
    live.setAttribute('aria-hidden', 'true');
    body6.appendChild(live);
  }
  const footer6 = document.createElement('div');
  footer6.className = 'ap-card6-footer';
  footer6.appendChild(criarSeletorMonitorAvisoCard6());
  const btnProjCard6 = document.createElement('button');
  btnProjCard6.type = 'button';
  btnProjCard6.className = 'btn sm primary ap-card6-btn-projetar';
  /* Visual: ▶ + «Projetar»; com o aviso no ar, pontinho verde + «Projetando». */
  btnProjCard6.innerHTML = getApresentacaoAvisoCard6Ativo()
    ? '<span class="ap-card6-dot" aria-hidden="true"></span><span>Projetando</span>'
    : '<svg class="ap-card6-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" fill="currentColor"/></svg><span>Projetar</span>';
  btnProjCard6.title = 'Projeta o aviso no monitor escolhido ao lado (independente das mídias)';
  btnProjCard6.addEventListener('click', (ev) => {
    ev.stopPropagation();
    projetarAvisoCard6();
  });
  const btnEncerrarAviso = document.createElement('button');
  btnEncerrarAviso.type = 'button';
  btnEncerrarAviso.className = 'btn sm danger ap-card6-btn-icone ap-card6-btn-encerrar';
  btnEncerrarAviso.innerHTML =
    '<svg class="ap-card6-ico" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="1.2" fill="currentColor"/></svg>';
  btnEncerrarAviso.title = 'Encerrar';
  btnEncerrarAviso.setAttribute('aria-label', 'Encerrar');
  btnEncerrarAviso.disabled = !getApresentacaoAvisoCard6Ativo();
  btnEncerrarAviso.addEventListener('click', (ev) => {
    ev.stopPropagation();
    void encerrarAvisoCard6NoControlador();
  });
  const btnLimparTxt = document.createElement('button');
  btnLimparTxt.type = 'button';
  btnLimparTxt.className = 'btn sm ap-card6-btn-limpar';
  /* Ícone (borracha/backspace) + rótulo «Limpar»; em card estreito o rótulo some (CSS) e fica o ícone. */
  btnLimparTxt.innerHTML =
    '<svg class="ap-card6-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h7.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6L1.8 8z"/><path d="M8.5 6l3 4M11.5 6l-3 4"/></svg><span class="ap-card6-btn-rotulo">Limpar</span>';
  btnLimparTxt.title = 'Limpar texto';
  btnLimparTxt.setAttribute('aria-label', 'Limpar texto');
  btnLimparTxt.addEventListener('click', (ev) => {
    ev.stopPropagation();
    estadoPainel.apresentacaoCard6Texto = '';
    salvarEstadoModoApresentacaoNoStorage();
    renderGridApresentacao();
  });
  footer6.appendChild(btnProjCard6);
  footer6.appendChild(btnEncerrarAviso);
  footer6.appendChild(btnLimparTxt);
  body6.appendChild(footer6);
  body6.appendChild(ta);
  card6.appendChild(num6);
  card6.appendChild(body6);
  grid.appendChild(card6);

  aplicarClasseSelecaoCardsApresentacaoNoDom();
  atualizarPreviewVideoAoVivo();
}

export function adicionarArquivosAoMenu(files) {
  Array.from(files || []).forEach((file) => {
    criarItemApresentacaoDeArquivo(file, (item) => {
      estadoPainel.apresentacaoBiblioteca.push(item);
      salvarEstadoModoApresentacaoNoStorage();
      renderMenuApresentacao();
    });
  });
}

export function adicionarArquivoDiretoNoCard(file, cardIdx) {
  const idx = Number(cardIdx);
  if (!Number.isInteger(idx) || idx < 0 || idx > 5) return;
  if (idx === 5) return;
  criarItemApresentacaoDeArquivo(file, async (item) => {
    if (item.kind === 'video' && idx !== APRESENTACAO_IDX_CARD5) {
      alert('Vídeos devem ser adicionados no card 5.');
      return;
    }
    if (item.kind !== 'video' && idx === APRESENTACAO_IDX_CARD5) {
      alert('O card 5 aceita apenas vídeos.');
      return;
    }
    if (item.kind === 'video') {
      await garantirVideoSrcHttp(item);
      await garantirThumbnailVideoItem(item);
    }
    estadoPainel.apresentacaoCards[idx] = item;
    const ja = estadoPainel.apresentacaoBiblioteca.some((x) => x.src === item.src && x.name === item.name);
    if (!ja) estadoPainel.apresentacaoBiblioteca.push(item);
    salvarEstadoModoApresentacaoNoStorage();
    renderMenuApresentacao();
    if (estadoPainel.apresentacaoMidiaProjetadaId) {
      renderGridApresentacao();
    } else {
      atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: `Arquivo no card ${idx + 1}: ${item.name}` });
    }
  });
}

/** Área do card 4 destacada por clique (0–3) ou `null` — só realce, como nos outros cards. */
let apresentacaoCard4SubSelecionadoIdx = null;

/* ─── Pontos de contato com o núcleo e com outros módulos (o estado acima é privado) ─── */

export function setApresentacaoCardSelecionadoIdx(valor) {
  apresentacaoCardSelecionadoIdx = valor;
}

export function getApresentacaoCardUiClickTimer() {
  return apresentacaoCardUiClickTimer;
}

export function setApresentacaoCardUiClickTimer(valor) {
  apresentacaoCardUiClickTimer = valor;
}

/** As quatro áreas exibem imagens; o mesmo critério que a prévia dos outros cards usa. */
export function ehItemImagemApresentacao(it) {
  const kind = String(it?.kind || '').toLowerCase();
  const mime = String(it?.mime || '').toLowerCase();
  return kind === 'image' || mime.startsWith('image/') || /^data:image\//i.test(String(it?.src || ''));
}
