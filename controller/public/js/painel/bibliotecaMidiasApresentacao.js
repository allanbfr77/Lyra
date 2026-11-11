/**
 * Mídias: criação de itens da apresentação a partir de arquivos e biblioteca de arquivos (abas, busca,
 * renomear, excluir, importar). Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda
 * possui entra por `registrarDependenciasBibliotecaMidiasApresentacao`.
 */
import { appConfirm } from './appDialog.js';
import { detectarKindApresentacaoPorMimeOuNome, ehArquivoPowerPointLocal, fmtTempoAudio, obterThumbVideoApresentacao, rotuloTipoMidiaApresentacao, srcImagemApresentacaoSeguro, svgIconeTipoMidiaApresentacao } from '../modules/midiaApresentacao.js';
import { atualizarUiPlayerAudioRemoto, pararAudioServidorPlayback } from './playerLocalMidia.js';
import { importarMidiaApresentacaoPorCaminho, projetarItemApresentacao } from './videoApresentacao.js';
import { estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasBibliotecaMidiasApresentacao(d) {
  dep = d || {};
}
const atualizarFeedbackProjecaoApresentacaoUi = (...a) => dep.atualizarFeedbackProjecaoApresentacaoUi(...a);
const emitirEncerrarApresentacaoPublicoAoServidor = (...a) => dep.emitirEncerrarApresentacaoPublicoAoServidor(...a);
const escolherArquivoModoApresentacao = (...a) => dep.escolherArquivoModoApresentacao(...a);
const salvarEstadoModoApresentacaoNoStorage = (...a) => dep.salvarEstadoModoApresentacaoNoStorage(...a);
const sincronizarPillProjecaoNav = (...a) => dep.sincronizarPillProjecaoNav(...a);
const adicionarArquivosAoMenu = (...a) => dep.adicionarArquivosAoMenu(...a);
const renderGridApresentacao = (...a) => dep.renderGridApresentacao(...a);

export function criarItemApresentacaoDeArquivo(file, onDone) {
  if (!file) return;
  const mime = String(file.type || '');
  const nome = String(file.name || 'arquivo');
  const isPowerPoint = ehArquivoPowerPointLocal(mime, nome);
  if (isPowerPoint) {
    alert('PowerPoint local ainda não abre direto no telão. Exporte para PDF ou use URL de apresentação online (Google Slides / Office Online).');
    return;
  }
  const kind = detectarKindApresentacaoPorMimeOuNome(mime, nome);
  const id = `ap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fp = String(file.path || '').trim();

  /** O caminho antigo: o ficheiro inteiro em Base64, dentro do item. */
  const entregarPorDataUrl = () => {
    const reader = new FileReader();
    reader.onerror = () => alert('Não foi possível ler o arquivo selecionado.');
    reader.onload = () => {
      const src = String(reader.result || '');
      if (!src) return;
      const itemNovo = { id, kind, src, mime, name: nome, title: nome };
      if (fp) itemNovo.filePath = fp;
      onDone(itemNovo);
    };
    reader.readAsDataURL(file);
  };

  /*
   * Áudio e vídeo entram por caminho de ficheiro; o controlador copia-os para a pasta do
   * aplicativo e devolve uma URL.
   *
   * Antes vinham em Base64 e ficavam assim: no item, no estado gravado e em cada comando
   * que os mandava tocar. Um MP3 de 7 MB ocupava ~47 MB de heap e o estado do modo Mídias
   * passava dos 5 MB de quota do localStorage logo no primeiro áudio — não gravava, em
   * silêncio, e pagava o custo à mesma. Com a URL, o que viaja são duzentos bytes.
   *
   * Sem caminho de ficheiro (arrastado do navegador, por exemplo) ou se a cópia falhar,
   * o caminho antigo continua a servir — pior, mas funciona.
   */
  if ((kind === 'audio' || kind === 'video') && fp) {
    const itemNovo = { id, kind, src: '', mime, name: nome, title: nome, filePath: fp };
    void importarMidiaApresentacaoPorCaminho(itemNovo).then((ok) => {
      if (ok) return onDone(itemNovo);
      entregarPorDataUrl();
    });
    return;
  }

  entregarPorDataUrl();
}

/* ═══════════════════════════════════════════════════════════════════════════
   Biblioteca de arquivos (modo Mídias)
   Substitui os dois seletores antigos ("Arquivos no menu" e "Player"). Os dados são os
   mesmos: `apresentacaoBiblioteca` (imagem, vídeo, PDF…) e `apresentacaoAudios`. Clique
   seleciona (id próprio de cada lista), duplo clique projeta — exatamente como antes.
   ═══════════════════════════════════════════════════════════════════════════ */
const SS_AP_LIB_ABA = 'lyra.apLibAba';
let apLibBusca = '';
let apLibAba = (() => {
  try {
    const v = sessionStorage.getItem(SS_AP_LIB_ABA);
    return v === 'video' || v === 'audio' ? v : 'image';
  } catch (_) {
    return 'image';
  }
})();

function apLibDefinirAba(aba, { render = true } = {}) {
  apLibAba = aba === 'video' || aba === 'audio' ? aba : 'image';
  try {
    sessionStorage.setItem(SS_AP_LIB_ABA, apLibAba);
  } catch (_) {
    /* sem sessionStorage: a aba só não é lembrada */
  }
  if (render) renderBibliotecaMidiasApresentacao();
}

function apLibAbaDoItem(item, origem) {
  if (origem === 'audio') return 'audio';
  const k = String(item?.kind || '').toLowerCase();
  if (k === 'video' || k === 'audio') return k;
  return 'image';
}

export function apLibFecharMenus() {
  document.querySelectorAll('.ap-lib-menu').forEach((m) => {
    m.hidden = true;
  });
  document.querySelectorAll('#ap-lib-list .ap-lib-more[aria-expanded="true"]').forEach((b) => {
    b.setAttribute('aria-expanded', 'false');
  });
}

function apLibRenomear(entry, nameEl) {
  const { item, origem } = entry;
  const main = nameEl?.parentElement;
  if (!nameEl || !main || main.querySelector('input.ap-menu-edit-input')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ap-menu-edit-input';
  input.value = String(item.name || '').trim();
  input.maxLength = 140;
  input.setAttribute('aria-label', 'Novo nome do arquivo');
  nameEl.replaceWith(input);
  ['click', 'mousedown', 'dblclick', 'dragstart'].forEach((t) => input.addEventListener(t, (e) => e.stopPropagation()));
  input.focus();
  input.select();
  let feito = false;
  const salvar = () => {
    if (feito) return;
    feito = true;
    const novo = String(input.value || '').trim();
    if (!novo) {
      renderBibliotecaMidiasApresentacao();
      return;
    }
    if (origem === 'audio') {
      const alvo = estadoPainel.apresentacaoAudios.find((x) => x && x.id === item.id);
      if (alvo) {
        alvo.name = novo;
        alvo.title = novo;
      }
      if (estadoPainel.apresentacaoAudioAtualId === item.id && estadoPainel.audioStateRemoto.name) {
        estadoPainel.audioStateRemoto = { ...estadoPainel.audioStateRemoto, name: novo };
        atualizarUiPlayerAudioRemoto();
      }
    } else {
      const atualizar = (obj) => {
        if (!obj || obj.id !== item.id) return;
        obj.name = novo;
        obj.title = novo;
      };
      estadoPainel.apresentacaoBiblioteca.forEach(atualizar);
      estadoPainel.apresentacaoCards.forEach(atualizar);
    }
    salvarEstadoModoApresentacaoNoStorage();
    renderBibliotecaMidiasApresentacao();
    if (origem !== 'audio') renderGridApresentacao();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      salvar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      feito = true;
      renderBibliotecaMidiasApresentacao();
    }
  });
  input.addEventListener('blur', salvar);
}

async function apLibExcluir(entry) {
  const { item, origem } = entry;
  if (origem === 'audio') {
    const ok = await appConfirm(`Excluir "${item.name}" da lista de áudios?`, 'Modo apresentação');
    if (!ok) return;
    const eraAtual = estadoPainel.apresentacaoAudioAtualId === item.id;
    estadoPainel.apresentacaoAudios = (estadoPainel.apresentacaoAudios || []).filter((x) => x && x.id !== item.id);
    if (eraAtual) {
      estadoPainel.apresentacaoAudioAtualId = null;
      pararAudioServidorPlayback();
      atualizarUiPlayerAudioRemoto();
      sincronizarPillProjecaoNav();
    }
    salvarEstadoModoApresentacaoNoStorage();
    renderBibliotecaMidiasApresentacao();
    return;
  }
  const ok = await appConfirm(`Excluir "${item.name}" do menu de arquivos?`, 'Modo apresentação');
  if (!ok) return;
  estadoPainel.apresentacaoBiblioteca = (estadoPainel.apresentacaoBiblioteca || []).filter((x) => x && x.id !== item.id);
  estadoPainel.apresentacaoCards = (estadoPainel.apresentacaoCards || []).map((x) => (x && x.id === item.id ? null : x));
  estadoPainel.apresentacaoCard4Imagens = (estadoPainel.apresentacaoCard4Imagens || []).map((x) => (x && x.id === item.id ? null : x));
  if (estadoPainel.apresentacaoArquivoSelecionadoId === item.id) estadoPainel.apresentacaoArquivoSelecionadoId = null;
  if (estadoPainel.apresentacaoMidiaProjetadaId === item.id) {
    estadoPainel.apresentacaoMidiaProjetadaId = null;
    void emitirEncerrarApresentacaoPublicoAoServidor();
  }
  salvarEstadoModoApresentacaoNoStorage();
  renderBibliotecaMidiasApresentacao();
  atualizarFeedbackProjecaoApresentacaoUi({ mensagemIdle: 'Arquivo removido do menu.' });
}

function renderBibliotecaMidiasApresentacao() {
  const list = document.getElementById('ap-lib-list');
  if (!list) return;
  document.querySelectorAll('#painel-modo-apresentacao .ap-lib-tab').forEach((t) => {
    t.setAttribute('aria-selected', t.dataset.tab === apLibAba ? 'true' : 'false');
  });
  const entradas = [
    ...estadoPainel.apresentacaoBiblioteca.map((item) => ({ item, origem: 'bib' })),
    ...estadoPainel.apresentacaoAudios.map((item) => ({ item, origem: 'audio' })),
  ].filter((e) => e.item && apLibAbaDoItem(e.item, e.origem) === apLibAba);
  const q = apLibBusca.trim().toLowerCase();
  const filtradas = q ? entradas.filter((e) => String(e.item.name || '').toLowerCase().includes(q)) : entradas;

  document.querySelectorAll('body > .ap-lib-menu').forEach((m) => m.remove());
  list.innerHTML = '';
  if (!filtradas.length) {
    const vazio = document.createElement('div');
    vazio.className = 'placeholder-msg ap-lib-empty';
    const nomes = { image: 'imagem', video: 'vídeo', audio: 'áudio' };
    vazio.textContent = q
      ? 'Nenhum arquivo encontrado.'
      : `Nenhum${apLibAba === 'image' ? 'a' : ''} ${nomes[apLibAba]}. Use + Importar.`;
    list.appendChild(vazio);
    return;
  }
  filtradas.forEach((entry) => {
    const { item, origem } = entry;
    const selecionado = origem === 'audio' ? estadoPainel.apresentacaoAudioAtualId === item.id : estadoPainel.apresentacaoArquivoSelecionadoId === item.id;
    const row = document.createElement('div');
    row.className = 'ap-lib-item';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', selecionado ? 'true' : 'false');
    row.tabIndex = 0;
    if (origem === 'bib') {
      row.draggable = true;
      row.dataset.itemId = item.id;
      row.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', item.id);
        ev.dataTransfer.effectAllowed = 'copyMove';
      });
    }
    const thumb = document.createElement('div');
    thumb.className = 'ap-lib-thumb';
    const kind = String(item.kind || (origem === 'audio' ? 'audio' : '')).toLowerCase();
    const imgSrc =
      kind === 'image' ? srcImagemApresentacaoSeguro(item.src, item) : kind === 'video' ? obterThumbVideoApresentacao(item) : '';
    if (imgSrc) {
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = '';
      img.loading = 'lazy';
      img.draggable = false;
      thumb.appendChild(img);
    } else {
      thumb.innerHTML = svgIconeTipoMidiaApresentacao(kind);
    }
    const main = document.createElement('div');
    main.className = 'ap-lib-main';
    const nome = document.createElement('div');
    nome.className = 'ap-lib-name';
    nome.textContent = String(item.name || 'arquivo');
    nome.title = String(item.name || '');
    const meta = document.createElement('div');
    meta.className = 'ap-lib-meta';
    const dur = Number(item.duration) > 0 ? ` · ${fmtTempoAudio(item.duration)}` : '';
    meta.textContent = rotuloTipoMidiaApresentacao(kind) + dur;
    main.append(nome, meta);

    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'ap-lib-more';
    more.setAttribute('aria-label', `Mais ações para ${item.name || 'arquivo'}`);
    more.setAttribute('aria-haspopup', 'menu');
    more.setAttribute('aria-expanded', 'false');
    more.textContent = '⋯';
    const menu = document.createElement('div');
    menu.className = 'ap-lib-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const bRen = document.createElement('button');
    bRen.type = 'button';
    bRen.setAttribute('role', 'menuitem');
    bRen.textContent = 'Renomear';
    const bDel = document.createElement('button');
    bDel.type = 'button';
    bDel.setAttribute('role', 'menuitem');
    bDel.className = 'is-danger';
    bDel.textContent = 'Excluir';
    menu.append(bRen, bDel);
    more.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const abrir = menu.hidden;
      apLibFecharMenus();
      menu.hidden = !abrir;
      more.setAttribute('aria-expanded', abrir ? 'true' : 'false');
      if (abrir) {
        /* No <body> e position: fixed — a lista rola e o container do painel contém o layout, e ambos cortariam o menu. */
        if (menu.parentElement !== document.body) document.body.appendChild(menu);
        menu.hidden = false;
        const r = more.getBoundingClientRect();
        const h = menu.offsetHeight || 96;
        const w = menu.offsetWidth || 140;
        const abaixo = r.bottom + 4 + h <= window.innerHeight - 8;
        menu.style.top = `${Math.max(8, abaixo ? r.bottom + 4 : r.top - h - 4)}px`;
        menu.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
      }
    });
    bRen.addEventListener('click', (ev) => {
      ev.stopPropagation();
      apLibFecharMenus();
      apLibRenomear(entry, nome);
    });
    bDel.addEventListener('click', (ev) => {
      ev.stopPropagation();
      apLibFecharMenus();
      void apLibExcluir(entry);
    });

    const escolher = () => {
      if (origem === 'audio') estadoPainel.apresentacaoAudioAtualId = item.id;
      else estadoPainel.apresentacaoArquivoSelecionadoId = item.id || null;
      salvarEstadoModoApresentacaoNoStorage();
      renderBibliotecaMidiasApresentacao();
    };
    const ehControle = (ev) =>
      ev.target instanceof HTMLElement && ev.target.closest('.ap-lib-more, .ap-lib-menu, .ap-menu-edit-input');
    row.addEventListener('click', (ev) => {
      if (ehControle(ev)) return;
      escolher();
    });
    row.addEventListener('dblclick', (ev) => {
      if (ehControle(ev)) return;
      projetarItemApresentacao(item);
      if (origem === 'audio') renderBibliotecaMidiasApresentacao();
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.target !== row) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        escolher();
      }
    });
    row.append(thumb, main, more, menu);
    list.appendChild(row);
  });
}

export function configurarBibliotecaMidiasApresentacao() {
  document.querySelectorAll('#painel-modo-apresentacao .ap-lib-tab').forEach((t) => {
    t.addEventListener('click', () => apLibDefinirAba(t.dataset.tab));
  });
  document.getElementById('ap-lib-search')?.addEventListener('input', (e) => {
    apLibBusca = String(e.target.value || '');
    renderBibliotecaMidiasApresentacao();
  });
  document.getElementById('ap-lib-list')?.addEventListener('scroll', apLibFecharMenus, { passive: true });
  document.getElementById('ap-lib-import')?.addEventListener('click', () => escolherArquivoModoApresentacao());
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.ap-lib-more, .ap-lib-menu')) apLibFecharMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') apLibFecharMenus();
  });
}

/** Mantidos como pontos de entrada: muitos fluxos chamam estes nomes ao mudar os dados. */
export function renderMenuApresentacao() {
  renderBibliotecaMidiasApresentacao();
}

export function renderListaAudiosApresentacao() {
  renderBibliotecaMidiasApresentacao();
}

/** Importação única: áudio segue o fluxo do Player; o resto, o de "Arquivos no menu". */
export function importarArquivosBibliotecaMidias(files) {
  const lista = Array.from(files || []);
  if (!lista.length) return;
  const kindDe = (f) => detectarKindApresentacaoPorMimeOuNome(String(f.type || ''), String(f.name || ''));
  const audios = lista.filter((f) => kindDe(f) === 'audio');
  const demais = lista.filter((f) => kindDe(f) !== 'audio');
  const primeiro = kindDe(lista[0]);
  apLibDefinirAba(primeiro === 'video' || primeiro === 'audio' ? primeiro : 'image', { render: false });
  apLibBusca = '';
  const campo = document.getElementById('ap-lib-search');
  if (campo) campo.value = '';
  if (audios.length) adicionarAudiosAoMenu(audios);
  if (demais.length) adicionarArquivosAoMenu(demais);
  renderBibliotecaMidiasApresentacao();
}

function adicionarAudiosAoMenu(files) {
  Array.from(files || []).forEach((file) => {
    criarItemApresentacaoDeArquivo(file, (item) => {
      if (item.kind !== 'audio') return;
      estadoPainel.apresentacaoAudios.push(item);
      salvarEstadoModoApresentacaoNoStorage();
      renderListaAudiosApresentacao();
    });
  });
}
