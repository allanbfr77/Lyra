/**
 * Ministrantes e tons da playlist: seletor do culto, lista/cadastro nos Ajustes, importação de tons,
 * sincronização de tons e da playlist com o site. Movido verbatim do núcleo (`controllerAppCore.js`);
 * o que o núcleo ainda possui entra por `registrarDependenciasMinistrantesTons`.
 */
import { CLOUD_INVB_TONS_SYNC_URL, LS_INVB_TONS_SYNC_AT, LS_PLAYLISTS } from '../modules/chavesArmazenamentoLocal.js';
import { appConfirm, appEscolherOpcao, appPrompt } from './appDialog.js';
import { buscarTomMemoria, carregarMinistrantesDoServidor, criarMinistranteNoServidor, excluirMinistranteNoServidor, htmlCorpoLinhaPlaylistComTom, htmlCorpoLinhaPlaylistSimples, limparMinistranteDasPlaylists, limparMinistrantePadraoPorCulto, normalizarMinistranteIdPlaylist, normalizarTomPlaylist, obterCacheMinistrantes, renomearMinistranteNoServidor } from '../modules/playlistMinistranteTom.js';
import { carregarMusicas, refreshListaBanco } from './bibliotecaMusicas.js';
import { ehMarcadorTemaPlaylist, fonteBancoItemPlaylist } from '../modules/playlistVersaoMusica.js';
import { escapeHtml } from './textoHtmlSeguro.js';
import { getMinistrantePadraoCulto, getMinistrantePadraoPorCulto, normalizarTemaPlaylist, playlistPossuiMarcadoresTema, saveMinistrantePadraoPorCulto, setMinistrantePadraoCulto } from './playlistTemas.js';
import { estadoPainel, projecao } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasMinistrantesTons(d) {
  dep = d || {};
}
const atualizarPreviewOperador = (...a) => dep.atualizarPreviewOperador(...a);
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const emitirEstadoMinistranteAoServidor = (...a) => dep.emitirEstadoMinistranteAoServidor(...a);
const emitirEstrofeAoServidor = (...a) => dep.emitirEstrofeAoServidor(...a);
const formatarRotuloVersaoExibicao = (...a) => dep.formatarRotuloVersaoExibicao(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const getPlaylist = (...a) => dep.getPlaylist(...a);
const playlistItemMesmaVersaoQueAtiva = (...a) => dep.playlistItemMesmaVersaoQueAtiva(...a);
const renderItensLyraSelectDropdown = (...a) => dep.renderItensLyraSelectDropdown(...a);
const rotuloVersaoMaiusculo = (...a) => dep.rotuloVersaoMaiusculo(...a);
const savePlaylists = (...a) => dep.savePlaylists(...a);
const setupLyraSelectDropdownWrap = (...a) => dep.setupLyraSelectDropdownWrap(...a);
const renderPlaylist = (...a) => dep.renderPlaylist(...a);

/**
 * Limpa ministrante e tom de TODAS as músicas desta playlist (não remove músicas).
 *
 * É o «Resetar» do menu de cada linha. Era o botão que aparecia no hover da Música 1 e
 * mudou de lugar com a passagem para o menu — o que faz é exactamente o mesmo, e de
 * propósito: repor é uma operação sobre o culto inteiro (o ministrante é um só para todas
 * as músicas), e não sobre a linha de onde o menu foi aberto.
 *
 * Zerar o ministrante padrão do culto faz parte do gesto: sem isso, o seletor do topo
 * continuaria a mostrar uma pessoa cujos tons acabaram de ser apagados da lista.
 */
export function limparMinistranteTomDeTodaPlaylist() {
  if (!estadoPainel.cultoId) return;
  const pl = getPlaylist(estadoPainel.cultoId);
  if (!Array.isArray(pl) || !pl.length) return;
  let mudou = false;
  for (const it of pl) {
    if (!it || ehMarcadorTemaPlaylist(it)) continue;
    if (it.ministranteId != null || it.tom) {
      it.ministranteId = null;
      it.tom = '';
      mudou = true;
    }
  }
  if (!mudou) return;
  setMinistrantePadraoCulto(estadoPainel.cultoId, null);
  savePlaylists();
  renderPlaylist();
  refrescarAberturaM3SeMusicaAtivaNaPlaylist();
}

export function nomeMinistrantePorId(id) {
  const n = Number(id);
  const m = obterCacheMinistrantes().find((x) => Number(x.id) === n);
  return m ? String(m.nome || '').trim() : '';
}

/**
 * Aplica o ministrante do culto a todas as músicas e repõe os tons a partir do cadastro
 * dele (a memória ministrante+música do banco, que esta função só lê).
 *
 * O tom passa a refletir estritamente o ministrante escolhido: onde ele tem tom cadastrado,
 * fica esse; onde não tem, a linha fica vazia em vez de herdar o tom de outra pessoa. O
 * operador continua livre para escrever o tom que quiser na linha depois disto.
 *
 * Uma falha de rede na consulta não apaga nada: sem resposta do banco, o tom que já estava
 * na linha fica onde está.
 */
async function aplicarMinistranteETonsEmTodasMusicas(pl, ministranteId) {
  const api = getControllerApiBase();
  const mid = normalizarMinistranteIdPlaylist(ministranteId);
  if (!mid || !Array.isArray(pl)) return;
  for (const it of pl) {
    if (!it || ehMarcadorTemaPlaylist(it)) continue;
    it.ministranteId = mid;
    try {
      const tomMem = await buscarTomMemoria(
        api,
        mid,
        Number(it.id),
        fonteBancoItemPlaylist(it),
        it.titulo
      );
      it.tom = normalizarTomPlaylist(tomMem);
    } catch (_) {
      // intencional — banco indisponível: mantém o tom que já estava na linha
    }
  }
}

/** Zera ministrante e tom de todas as músicas do culto (escolha vazia no seletor). */
function limparMinistranteETonsDeTodasMusicas(pl) {
  if (!Array.isArray(pl)) return;
  for (const it of pl) {
    if (!it || ehMarcadorTemaPlaylist(it)) continue;
    it.ministranteId = null;
    it.tom = '';
  }
}

/**
 * Repõe as opções e a seleção do seletor único de ministrante do culto.
 *
 * A lista de pessoas vem do cache do cadastro; o valor escolhido vem de
 * `getMinistrantePadraoCulto`, que também infere o ministrante de playlists montadas
 * antes de existir um seletor único (todas as músicas com a mesma pessoa).
 */
export function renderSeletorMinistranteCulto() {
  const wrap = document.getElementById('culto-ministrante-dd');
  const btn = document.getElementById('culto-ministrante-dd-btn');
  if (!wrap || !btn) return;
  const atual = estadoPainel.cultoId ? getMinistrantePadraoCulto(estadoPainel.cultoId) : null;
  const items = [{ value: '', label: 'Selecione o ministrante...' }];
  for (const m of obterCacheMinistrantes()) {
    const id = Number(m.id);
    if (!Number.isFinite(id)) continue;
    items.push({
      value: String(id),
      label: String(m.nome || '').toLocaleUpperCase('pt-BR'),
    });
  }
  renderItensLyraSelectDropdown(wrap, items, {
    valorAtual: atual != null ? String(atual) : '',
    placeholder: 'Selecione o ministrante...',
    aoSelecionar: (v) => {
      onMinistranteCultoChange(v).catch(() => {});
    },
  });
  btn.disabled = !estadoPainel.cultoId;
}

/**
 * Troca do ministrante do culto — sem confirmação: é uma escolha por culto, não por música,
 * e o operador vê o efeito na hora nos tons da lista.
 */
async function onMinistranteCultoChange(valorSelect) {
  if (!estadoPainel.cultoId) return;
  const btn = document.getElementById('culto-ministrante-dd-btn');
  const novoId = normalizarMinistranteIdPlaylist(valorSelect);
  const pl = getPlaylist(estadoPainel.cultoId);
  setMinistrantePadraoCulto(estadoPainel.cultoId, novoId);
  if (btn) btn.disabled = true;
  try {
    if (novoId) await aplicarMinistranteETonsEmTodasMusicas(pl, novoId);
    else limparMinistranteETonsDeTodasMusicas(pl);
  } finally {
    if (btn) btn.disabled = !estadoPainel.cultoId;
  }
  savePlaylists();
  renderPlaylist();
  refrescarAberturaM3SeMusicaAtivaNaPlaylist();
}

export function configurarSeletorMinistranteCulto() {
  const wrap = document.getElementById('culto-ministrante-dd');
  if (wrap) setupLyraSelectDropdownWrap(wrap);
}

export function onPlaylistTomChange(idxPl, valorSelect) {
  if (!estadoPainel.cultoId) return;
  const pl = getPlaylist(estadoPainel.cultoId);
  const item = pl[idxPl];
  if (!item || ehMarcadorTemaPlaylist(item)) return;
  const tom = normalizarTomPlaylist(valorSelect);
  item.tom = tom;
  savePlaylists();
  if (playlistItemMesmaVersaoQueAtiva(item)) {
    refrescarAberturaM3SeMusicaAtivaNaPlaylist();
  }
}

/** Atualiza título (+ tom) do 1.º slide no preview/M3 quando a playlist muda. */
function refrescarAberturaM3SeMusicaAtivaNaPlaylist() {
  atualizarPreviewOperador();
  emitirEstadoMinistranteAoServidor();
  if (estadoPainel.projecaoMusicaEmitidaNoServidor && projecao.pronta() && estadoPainel.musicaAtiva && estadoPainel.estrofeAtiva === 0) {
    emitirEstrofeAoServidor(0);
  }
}

/**
 * Tema do bloco onde a linha `idx` está — o do cabeçalho acima dela, não o `item.tema`.
 *
 * Os dois divergem: com marcadores, o cabeçalho manda, e `item.tema` de linhas antigas
 * pode estar vazio ou desactualizado. Quem quer saber «em que tema esta música está»
 * quer o que a lista mostra.
 *
 * Dar-lhe o índice de um cabeçalho devolve o tema do bloco ACIMA dele — andar para trás a
 * partir de um marcador encontra o marcador anterior. É assim que se pergunta «para que
 * tema é que esta seta me leva».
 */
export function temaDoBlocoNaPlaylist(pl, idx) {
  if (!Array.isArray(pl) || !pl[idx]) return '';
  if (playlistPossuiMarcadoresTema(pl)) {
    for (let i = idx - 1; i >= 0; i--) {
      if (ehMarcadorTemaPlaylist(pl[i])) return normalizarTemaPlaylist(pl[i].tema) || '';
    }
    /* Antes do primeiro marcador não há cabeçalho de marcador: o render tira o rótulo do
       `tema` da primeira linha, e aqui segue-se a mesma regra para os dois concordarem. */
    return normalizarTemaPlaylist(pl[0]?.tema) || '';
  }
  return normalizarTemaPlaylist(pl[idx]?.tema) || '';
}

/**
 * HTML da linha da playlist: Home com o tom; Slide compacto como antes.
 * O ministrante é do culto inteiro e vive no seletor único acima da lista.
 */
export function htmlLinhaPlaylistModoAtual(item, songNum, rotuloVersao) {
  if (ehModoSlidesOperador()) {
    return htmlCorpoLinhaPlaylistSimples(item, songNum, rotuloVersao, escapeHtml);
  }
  return htmlCorpoLinhaPlaylistComTom(item, songNum, rotuloVersao, escapeHtml);
}

export async function garantirMinistrantesCarregados() {
  try {
    await carregarMinistrantesDoServidor(getControllerApiBase());
    renderPlaylist();
  } catch (_) {
    // intencional — API ainda a subir; dropdowns ficam só com «—»
  }
}

export async function renderListaCfgMinistrantes() {
  const el = document.getElementById('cfg-ministrantes-lista');
  if (!el) return;
  try {
    await carregarMinistrantesDoServidor(getControllerApiBase());
  } catch (e) {
    el.innerHTML = `<div class="placeholder-msg">${escapeHtml(e.message || 'Falha ao carregar.')}</div>`;
    return;
  }
  const lista = obterCacheMinistrantes();
  if (!lista.length) {
    el.innerHTML = '<div class="placeholder-msg">Nenhum ministrante cadastrado ainda.</div>';
    return;
  }
  el.innerHTML = '';
  for (const m of lista) {
    const row = document.createElement('div');
    row.className = 'cfg-ministrante-row';
    row.innerHTML = `
      <span class="cfg-ministrante-nome">${escapeHtml(m.nome)}</span>
      <button type="button" class="btn sm" data-acao="edit" title="Renomear">✎</button>
      <button type="button" class="btn sm danger" data-acao="del" title="Excluir">✕</button>
    `;
    row.querySelector('[data-acao="edit"]').onclick = () => onCfgMinistranteRenomear(m.id, m.nome);
    row.querySelector('[data-acao="del"]').onclick = () => onCfgMinistranteExcluir(m.id, m.nome);
    el.appendChild(row);
  }
}

export async function onCfgMinistranteAdicionar() {
  const input = document.getElementById('cfg-ministrante-novo-nome');
  const nome = String(input?.value || '').trim();
  if (!nome) {
    alert('Digite o nome do ministrante.');
    return;
  }
  try {
    await criarMinistranteNoServidor(getControllerApiBase(), nome);
    if (input) input.value = '';
    await renderListaCfgMinistrantes();
    renderPlaylist();
  } catch (e) {
    alert(e.message || 'Falha ao adicionar.');
  }
}

async function onCfgMinistranteRenomear(id, nomeAtual) {
  /* Electron bloqueia `window.prompt` — usar o diálogo interno do painel. */
  const novo = await appPrompt('Novo nome do ministrante:', {
    title: 'Renomear ministrante',
    defaultValue: nomeAtual || '',
    emptyMsg: 'Digite um nome válido.',
    maxLength: 80,
    normalizar: (v) => String(v ?? '').trim().slice(0, 80),
  });
  if (novo == null) return;
  const nome = String(novo).trim();
  if (!nome) {
    alert('Nome inválido.');
    return;
  }
  try {
    await renomearMinistranteNoServidor(getControllerApiBase(), id, nome);
    await renderListaCfgMinistrantes();
    renderPlaylist();
  } catch (e) {
    alert(e.message || 'Falha ao renomear.');
  }
}

async function onCfgMinistranteExcluir(id, nome) {
  const ok = await appConfirm(
    `Excluir o ministrante «${nome}»?\n\nAs músicas que o tinham selecionado ficam sem ministrante. Os tons memorizados deste nome também são removidos.`,
    'Excluir ministrante'
  );
  if (!ok) return;
  try {
    await excluirMinistranteNoServidor(getControllerApiBase(), id);
    if (limparMinistranteDasPlaylists(estadoPainel.playlists, id)) savePlaylists();
    if (limparMinistrantePadraoPorCulto(getMinistrantePadraoPorCulto(), id)) saveMinistrantePadraoPorCulto();
    await renderListaCfgMinistrantes();
    renderPlaylist();
  } catch (e) {
    alert(e.message || 'Falha ao excluir.');
  }
}

export async function onCfgImportTonsArquivoChange(ev) {
  const file = ev?.target?.files?.[0];
  const outEl = document.getElementById('cfg-tom-import-resultado');
  if (ev?.target) ev.target.value = '';
  if (!file) return;
  let payload;
  try {
    const texto = await file.text();
    payload = JSON.parse(texto);
  } catch (_) {
    alert('Arquivo JSON inválido.');
    return;
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/tom-memoria/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detalhe = data.erro || (res.status === 404
        ? 'Rota de importação não encontrada. Reinicie o Lyra Controlador e tente de novo.'
        : `Falha na importação (HTTP ${res.status}).`);
      throw new Error(detalhe);
    }
    await aposSyncTonsInvb(data);
    const msg =
      `Importação concluída.\n` +
      `Aplicados agora: ${data.aplicados || 0}\n` +
      `Pendentes (música ainda não no banco): ${data.pendentes || 0}\n` +
      `Ministrantes criados: ${data.ministrantesCriados || 0}\n` +
      `Ignorados: ${data.ignorados || 0}`;
    if (outEl) {
      outEl.hidden = false;
      outEl.textContent = msg;
    }
    alert(msg);
  } catch (e) {
    alert(e.message || 'Falha ao importar tons.');
  }
}

/** Após sync/import de tons: refresca UI e playlists do disco se o servidor as alterou. */
async function aposSyncTonsInvb(data) {
  if (data?.updatedAt) {
    try {
      localStorage.setItem(LS_INVB_TONS_SYNC_AT, String(data.updatedAt));
    } catch (_) {
      // intencional
    }
  }
  if (Number(data?.playlistsAtualizadas) > 0) {
    try {
      const res = await fetch(`${getControllerApiBase()}/api/playlists`);
      if (res.ok) {
        const remoto = await res.json();
        if (remoto && typeof remoto === 'object' && !Array.isArray(remoto)) {
          estadoPainel.playlists = remoto;
          try {
            localStorage.setItem(LS_PLAYLISTS, JSON.stringify(estadoPainel.playlists));
          } catch (_) {
            // intencional
          }
        }
      }
    } catch (_) {
      // intencional
    }
  }
  await renderListaCfgMinistrantes();
  renderPlaylist();
  refrescarAberturaM3SeMusicaAtivaNaPlaylist();
}

/**
 * Sincroniza tons/ministrantes do site Tom Louvores.
 * @param {{ silencioso?: boolean }} [opts]
 */
async function sincronizarTonsInvbDoSite(opts = {}) {
  const silencioso = opts.silencioso === true;
  const outEl = document.getElementById('cfg-tom-import-resultado');
  const since = (() => {
    try {
      return String(localStorage.getItem(LS_INVB_TONS_SYNC_AT) || '').trim();
    } catch (_) {
      return '';
    }
  })();
  const body = {};
  if (CLOUD_INVB_TONS_SYNC_URL) {
    body.fonte = 'cloud';
    body.cloudUrl = CLOUD_INVB_TONS_SYNC_URL;
    if (since) body.since = since;
  } else {
    body.fonte = 'supabase';
  }
  try {
    const res = await fetch(`${getControllerApiBase()}/api/tom-memoria/sync-invb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || `Falha no sync (HTTP ${res.status}).`);
    if (data.semMudanca) {
      if (!silencioso && outEl) {
        outEl.hidden = false;
        outEl.textContent = 'Tons do site já estavam atualizados.';
      }
      return data;
    }
    await aposSyncTonsInvb(data);
    const msg =
      `Sync do site (${data.origem || 'supabase'}).\n` +
      `Aplicados: ${data.aplicados || 0} · Pendentes: ${data.pendentes || 0} · ` +
      `Ministrantes novos: ${data.ministrantesCriados || 0}` +
      (data.playlistsAtualizadas
        ? `\nPlaylist: ${data.playlistsAtualizadas} tom(ns) atualizado(s).`
        : '');
    if (outEl) {
      outEl.hidden = false;
      outEl.textContent = msg;
    }
    if (!silencioso) alert(msg);
    return data;
  } catch (e) {
    if (!silencioso) alert(e.message || 'Falha ao sincronizar tons do site.');
    throw e;
  }
}

export async function onCfgSyncTonsInvbClick() {
  try {
    await sincronizarTonsInvbDoSite({ silencioso: false });
  } catch (_) {
    // alerta já mostrado
  }
}

/**
 * Pergunta, uma a uma, qual versão das músicas pendentes entra na playlist.
 *
 * O servidor só escolhe sozinho quando a família é exatamente «Original + uma
 * Cópia rigorosamente idêntica» (aí entra a Cópia). Cópia com alterações, ou uma
 * terceira versão, chegam aqui em `pendentesVersao`. Cancelar salta a música:
 * ela não entra na playlist. Devolve quantas foram efetivamente adicionadas.
 */
async function perguntarVersoesPendentesSyncLyra(pendentes) {
  const lista = Array.isArray(pendentes) ? pendentes : [];
  if (!lista.length) return 0;
  const escolhas = [];
  let posicaoAtual = 0;
  for (const p of lista) {
    const opcoes = (Array.isArray(p && p.opcoes) ? p.opcoes : []).map((o) => ({
      value: String(o.id),
      label: rotuloVersaoMaiusculo(
        o.ehOriginal ? 'Original' : formatarRotuloVersaoExibicao(o.rotulo, o.origem)
      ),
    }));
    if (opcoes.length < 2) continue;
    /* O nome da música vai no cabeçalho: é a primeira coisa que se lê no diálogo.
       Em baixo, só o secundário — artista e a posição na fila de pendentes. */
    const artista = String(p.artista || '').trim();
    posicaoAtual++;
    const posicao = lista.length > 1 ? `Música ${posicaoAtual} de ${lista.length}` : '';
    const detalhe = [
      artista ? `${artista}` : '',
      'Esta música tem mais de uma versão na biblioteca.',
      posicao,
    ]
      .filter(Boolean)
      .join('\n');
    const esc = await appEscolherOpcao(
      `${p.nome} — qual versão adicionar à playlist?`,
      opcoes,
      detalhe
    );
    if (esc == null) continue; // cancelou → a música não entra
    escolhas.push({
      cultoId: p.cultoId,
      rootId: p.rootId,
      versaoId: Number(esc),
      tema: p.tema,
    });
  }
  if (!escolhas.length) return 0;
  try {
    const res = await fetch(getControllerApiBase() + '/api/sync-invb-playlist/aplicar-versoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ escolhas }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Erro ao aplicar as versões escolhidas: ' + (data.erro || res.status));
      return 0;
    }
    return Number(data.adicionadas) || 0;
  } catch (e) {
    alert('Erro ao aplicar as versões escolhidas: ' + e.message);
    return 0;
  }
}

export async function onSincronizarPlaylistLyraClick() {
  const btn = document.getElementById('btn-sync-invb-playlist');
  const btnShortcut = document.getElementById('playlist-sync-lyra-btn');
  const setLoading = (on) => {
    if (btn) { btn.disabled = on; btn.textContent = on ? 'Sincronizando…' : 'Sincronizar com Lyra'; }
    if (btnShortcut) {
      btnShortcut.disabled = on;
      /* Só o nome muda: escrever no botão inteiro apagaria o ícone do cartão. */
      const txtShortcut = btnShortcut.querySelector('.playlist-acao-card-txt');
      if (txtShortcut) txtShortcut.textContent = on ? 'Sincronizando…' : 'Sinc. Lyra DB';
      btnShortcut.title = on ? 'Sincronizando com Lyra…' : 'Sincronizar playlist com Lyra — importa músicas da escala do site usando o banco online do Lyra';
    }
  };
  /* Importa só a playlist do site do culto selecionado (data + turno). */
  const cultoIdSelecionado = String(estadoPainel.cultoId || '').trim();
  if (!cultoIdSelecionado) {
    alert('Selecione primeiro o culto para importar a playlist do site.');
    return;
  }
  setLoading(true);
  try {
    const res = await fetch(getControllerApiBase() + '/api/sync-invb-playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cultoId: cultoIdSelecionado }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Erro ao sincronizar: ' + (data.erro || res.status));
      return;
    }
    /* Versões que o servidor não resolve sozinho: perguntar ANTES de a música
       entrar na playlist e só então mandar aplicar. Cancelar salta a música. */
    const adicionadasPorEscolha = await perguntarVersoesPendentesSyncLyra(data.pendentesVersao);

    // Recarregar playlists do servidor
    const resP = await fetch(getControllerApiBase() + '/api/playlists');
    if (resP.ok) {
      estadoPainel.playlists = await resP.json();
      localStorage.setItem(LS_PLAYLISTS, JSON.stringify(estadoPainel.playlists));
    }

    // Selecionar ministrante e aplicar tons automaticamente por cultoId
    if (data.ministrantePorCulto && typeof data.ministrantePorCulto === 'object') {
      const ministrantes = obterCacheMinistrantes();
      for (const [cultoId, nomeRaw] of Object.entries(data.ministrantePorCulto)) {
        if (!nomeRaw) continue;
        const nomeBusca = nomeRaw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const encontrado = ministrantes.find(m => {
          const n = String(m.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
          return n === nomeBusca || n.startsWith(nomeBusca) || nomeBusca.startsWith(n);
        });
        if (encontrado) {
          setMinistrantePadraoCulto(cultoId, encontrado.id);
          const pl = estadoPainel.playlists[cultoId];
          if (Array.isArray(pl)) {
            await aplicarMinistranteETonsEmTodasMusicas(pl, encontrado.id);
          }
        }
      }
      savePlaylists();
    }

    await renderListaCfgMinistrantes();
    // Biblioteca: refletir de imediato as músicas acabadas de importar no DB
    await carregarMusicas();
    refreshListaBanco();
    renderPlaylist();

    const totalAdicionadas = (Number(data.adicionadas) || 0) + adicionadasPorEscolha;
    let msg = 'Sincronização concluída\n' + totalAdicionadas + ' músicas adicionadas';
    if (data.aviso) msg += '\n' + data.aviso;
    if (data.naoEncontradas && data.naoEncontradas.length > 0) {
      msg += '\n' + data.naoEncontradas.length + ' músicas não encontradas:\n';
      msg += data.naoEncontradas.map(m => '  • ' + m.nome + ' (' + m.tipo + ')').join('\n');
    }
    alert(msg);
  } catch (e) {
    alert('Erro ao sincronizar playlist: ' + e.message);
  } finally {
    setLoading(false);
  }
}

let invbTonsSyncTimer = null;
export function iniciarSyncPeriodicoTonsInvb() {
  clearInterval(invbTonsSyncTimer);
  /* Primeira passagem após arranque (site → memória local). */
  setTimeout(() => {
    sincronizarTonsInvbDoSite({ silencioso: true }).catch(() => {});
  }, 8000);
  invbTonsSyncTimer = setInterval(() => {
    sincronizarTonsInvbDoSite({ silencioso: true }).catch(() => {});
  }, 5 * 60 * 1000);
}
