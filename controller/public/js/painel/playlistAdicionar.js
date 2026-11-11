/**
 * Playlist: adicionar música ou versão (com escolha de versão) e modal de novas músicas sincronizadas.
 * Movido verbatim do núcleo (`controllerAppCore.js`); o que o núcleo ainda possui entra por
 * `registrarDependenciasPlaylistAdicionar`.
 */
import { ACAO_CONFIRMAR_TROCA_VERSAO_PLAYLIST, ACAO_JA_PRESENTE_PLAYLIST, decidirAcaoAdicionarVersaoAtivaNaPlaylist, fonteBancoItemPlaylist, fonteBancoNormalizada, opcoesVersaoDistintasPorConteudo, playlistJaContemMesmaMusicaEVersao, substituirVersaoItemPlaylist, versaoLocalIdTrimado } from '../modules/playlistVersaoMusica.js';
import { appAlert, appConfirm, appEscolherOpcao } from './appDialog.js';
import { camposMinistranteTomParaNovaMusicaNaPlaylist, garantirTemaNoCatalogoAtual, inserirMusicaNoBlocoTema, listarMarcadoresTemaPlaylist, normalizarListaTemas, normalizarTemaPlaylist, obterUltimoMarcadorTema, playlistPossuiMarcadoresTema, saveTemasPorCulto } from './playlistTemas.js';
import { carregarMusicas, refreshListaBanco } from './bibliotecaMusicas.js';
import { ehVersaoLocalLegada, ehVersaoServidorId } from '../modules/copiasLocaisLetra.js';
import { encontrarCopiaLocal, getCopiasParaMusica, obterRootIdMusicaAtiva, versaoAtivaParaCompararPlaylist } from './copiasLocaisPainel.js';
import { listarCultosDisponiveis } from './cultoDoDia.js';
import { rotuloExibicaoVersaoServidor } from './versoesMusica.js';
import { renderPlaylist } from './playlistLista.js';
import { estadoPainel } from './estadoPainel.js';
import { formatarRotuloVersaoExibicao, rotuloVersaoMaiusculo } from './playlistLinhaUi.js';
import { getControllerApiBase } from './servidorAlvo.js';
import { getPlaylist, savePlaylists } from './playlistServidor.js';
import { getTemaSelecionadoAtual } from './temasPlaylistUi.js';
import { onCultoChange } from './cultoSeletor.js';

export async function addMusicaNaPlaylist(meta) {
  if (!estadoPainel.cultoId) {
    alert('Selecione primeiro o dia do culto.');
    return;
  }
  const idNum = Number(meta.id);
  const bancoFonte = fonteBancoItemPlaylist(meta);
  let versaoLocalId = null;
  let tituloPl = meta.titulo;
  let artistaPl = meta.artista || '';
  const opcoesVersao = [{ value: '__ORIGINAL__', label: rotuloVersaoMaiusculo('Original') }];
  if (bancoFonte !== 'catalog') {
    try {
      const resV = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/versoes`);
      if (resV.ok) {
        const dataV = await resV.json();
        const rootId = Number(dataV.rootId) || idNum;
        for (const v of dataV.versoes || []) {
          if (Number(v.id) === rootId || v.parent_id == null) {
            // Conteúdo da Original, para comparar com o das outras versões.
            if (Number(v.id) === rootId) opcoesVersao[0].conteudo = v;
            continue;
          }
          const rotulo = String(v.rotulo || '').trim() || 'Cópia';
          opcoesVersao.push({
            value: String(v.id),
            label: rotuloVersaoMaiusculo(formatarRotuloVersaoExibicao(rotulo, v.origem_importacao)),
            conteudo: v,
          });
        }
      }
    } catch (_) {
      // intencional — falha ao listar versões do servidor
    }
    for (const c of getCopiasParaMusica(idNum)) {
      opcoesVersao.push({
        value: c.id,
        label: `${rotuloVersaoMaiusculo(formatarRotuloVersaoExibicao(c.rotulo))} (LOCAL)`,
        conteudo: c,
      });
    }
  }
  // Versões rigorosamente idênticas (mesmo título, artista e estrofes, caractere
  // por caractere) contam como uma só; quando a repetida é a Original, quem fica
  // na lista é a Cópia (a Original é imutável). Sobrando uma opção só, importa
  // essa opção sem perguntar; senão, pergunta só entre as versões distintas.
  const opcoesVersaoDistintas = opcoesVersaoDistintasPorConteudo(opcoesVersao);
  let esc = null;
  if (opcoesVersaoDistintas.length > 1) {
    esc = await appEscolherOpcao('Qual versão deseja adicionar à playlist?', opcoesVersaoDistintas);
    if (esc == null) return;
  } else if (opcoesVersaoDistintas.length === 1) {
    esc = opcoesVersaoDistintas[0].value;
  }
  if (esc != null && esc !== '__ORIGINAL__') {
    versaoLocalId = esc;
    if (ehVersaoServidorId(esc)) {
      try {
        const resM = await fetch(`${getControllerApiBase()}/api/musicas/${encodeURIComponent(esc)}`);
        if (resM.ok) {
          const m = await resM.json();
          tituloPl = m.titulo || tituloPl;
          artistaPl = m.artista || artistaPl;
        }
      } catch (_) {
        // intencional — falha ao carregar metadados da versão
      }
    } else {
      const c = encontrarCopiaLocal(idNum, esc);
      if (c) {
        tituloPl = c.titulo;
        artistaPl = c.artista || '';
      }
    }
  }
  const pl = getPlaylist(estadoPainel.cultoId);
  if (playlistJaContemMesmaMusicaEVersao(pl, idNum, versaoLocalId, bancoFonte)) {
    appAlert('Esta música (mesma versão e mesma origem catálogo/servidor) já está na playlist deste culto.', 'Playlist');
    return;
  }
  let tema;
  const temMarcadores = playlistPossuiMarcadoresTema(pl);
  if (temMarcadores) {
    const marcadores = listarMarcadoresTemaPlaylist(pl);
    if (marcadores.length === 0) {
      alert('Use o botão «Inserir tema na playlist abaixo» (seta até à linha) para adicionar um bloco de tema no fim da playlist antes de incluir músicas.');
      return;
    }
    if (marcadores.length === 1) {
      // Só um tema (ex.: apenas ABERTURA) → mantém o comportamento atual, sem perguntar.
      tema = marcadores[0];
    } else {
      // Mais de um tema → deixa o usuário escolher em qual bloco adicionar (Modal 2).
      const ultimo = obterUltimoMarcadorTema(pl);
      const opcoesTema = marcadores.map((t) => ({
        value: t,
        label: t === ultimo ? `${t} (ÚLTIMO)` : t,
      }));
      const escTema = await appEscolherOpcao(
        'Em qual tema adicionar esta música?',
        opcoesTema,
        `«${tituloPl}» será adicionada ao tema escolhido.`
      );
      if (escTema == null) return; // cancelou
      tema = normalizarTemaPlaylist(escTema);
    }
  } else {
    tema = getTemaSelecionadoAtual();
    if (!tema) {
      alert('Selecione um tema na lista e use «Inserir tema na playlist abaixo» para ativá-lo na playlist.');
      return;
    }
  }
  garantirTemaNoCatalogoAtual(tema);
  const mt = await camposMinistranteTomParaNovaMusicaNaPlaylist(estadoPainel.cultoId, {
    id: idNum,
    titulo: tituloPl,
    bancoFonte,
  });
  const novoItem = {
    id: meta.id,
    titulo: tituloPl,
    artista: artistaPl,
    tema,
    versaoLocalId,
    // Tags (rótulos de versão) nunca entram na playlist, seja qual for a versão escolhida.
    versaoRotulo: '',
    bancoFonte,
    ministranteId: mt.ministranteId,
    tom: mt.tom,
  };
  if (temMarcadores) {
    // Insere no fim do bloco do tema escolhido (posição correta na playlist plana).
    inserirMusicaNoBlocoTema(pl, tema, novoItem);
  } else {
    pl.push(novoItem);
  }
  savePlaylists();
  renderPlaylist();
}

/**
 * Rótulo de exibição de uma versão para o popup de troca de versão do botão
 * «Adicionar à playlist» do HOME (ver `adicionarVersaoAtivaNaPlaylistHome`).
 * Mesmo critério de rótulo da barra de versões (`renderMusicaVersoesBar`):
 * ORIGINAL sem `versaoLocalId`, cópia local `c_*` ou versão do servidor.
 */
function rotuloVersaoParaPopupPlaylist(rootId, versaoLocalId) {
  const vid = versaoLocalIdTrimado(versaoLocalId);
  if (!vid) return rotuloVersaoMaiusculo('Original');
  if (ehVersaoLocalLegada(vid)) {
    const c = encontrarCopiaLocal(rootId, vid);
    if (c) return rotuloVersaoMaiusculo(formatarRotuloVersaoExibicao(c.rotulo));
    return rotuloVersaoMaiusculo('Cópia');
  }
  const versoesSrv =
    Number(estadoPainel.versoesMusicaServidorCache.rootId) === Number(rootId)
      ? estadoPainel.versoesMusicaServidorCache.versoes || []
      : [];
  const v = versoesSrv.find((x) => String(x.id) === vid);
  if (v) return rotuloVersaoMaiusculo(rotuloExibicaoVersaoServidor(v));
  return rotuloVersaoMaiusculo('Versão');
}

/**
 * Botão «Adicionar à playlist» da barra padrão (HOME).
 *
 * Mesma função básica do «+» da Biblioteca (`addMusicaNaPlaylist`, que esta
 * função NÃO altera nem chama por baixo dos panos além dos mesmos helpers de
 * tema/ministrante), com uma diferença: nunca pergunta qual versão adicionar —
 * usa exatamente a versão ativa no HOME, via `versaoAtivaParaCompararPlaylist()`
 * (cobre tanto cópia local quanto versão do servidor; ORIGINAL quando vazia).
 *
 * - Música ainda não presente na playlist do culto: adiciona normalmente com
 *   a versão ativa (mesma lógica de tema/ministrante do «+» da Biblioteca).
 * - Já presente com a MESMA versão: não faz nada, só avisa.
 * - Já presente com OUTRA versão: pede confirmação e, confirmando, substitui
 *   a versão da entrada já existente NO LUGAR — mesma posição, sem duplicar
 *   a música e sem tocar em tema/ministrante/tom já gravados.
 */
export async function adicionarVersaoAtivaNaPlaylistHome() {
  if (!estadoPainel.musicaAtiva || estadoPainel.musicaAtiva.id == null) return;
  if (!estadoPainel.cultoId) {
    alert('Selecione primeiro o dia do culto.');
    return;
  }
  const idNum = obterRootIdMusicaAtiva();
  if (!Number.isFinite(idNum)) return;
  const bancoFonte = fonteBancoNormalizada(estadoPainel.musicaBancoFonte);
  /* Fonte da verdade da versão ativa no HOME — a MESMA já usada para comparar
     a música ativa com a playlist (`playlistItemMesmaVersaoQueAtiva`). NUNCA
     usar `musicaVersaoLocalId` sozinho aqui: ele só cobre cópias locais
     (`c_*`) — para uma versão do SERVIDOR (fork) ele já vem `null` depois de
     carregada (a identidade dela mora em `musicaAtiva.id`), então lê-lo puro
     confundiria «versão do servidor selecionada» com ORIGINAL. */
  const versaoLocalId = versaoAtivaParaCompararPlaylist() || null;
  const tituloPl = estadoPainel.musicaAtiva.titulo;
  const artistaPl = estadoPainel.musicaAtiva.artista || '';

  const pl = getPlaylist(estadoPainel.cultoId);
  const decisao = decidirAcaoAdicionarVersaoAtivaNaPlaylist(pl, idNum, versaoLocalId, bancoFonte);

  if (decisao.acao === ACAO_JA_PRESENTE_PLAYLIST) {
    appAlert(
      'Esta música (mesma versão e mesma origem catálogo/servidor) já está na playlist deste culto.',
      'Playlist'
    );
    return;
  }

  if (decisao.acao === ACAO_CONFIRMAR_TROCA_VERSAO_PLAYLIST) {
    const rotuloAtual = rotuloVersaoParaPopupPlaylist(idNum, decisao.item.versaoLocalId);
    const rotuloNovo = rotuloVersaoParaPopupPlaylist(idNum, versaoLocalId);
    const ok = await appConfirm(
      `Esta música já está na playlist com outra versão.\n\nAtualmente: ${rotuloAtual}\nNova versão: ${rotuloNovo}\n\nDeseja substituir a versão atual pela versão selecionada?`,
      'Playlist',
      { okLabel: 'Confirmar alteração', cancelLabel: 'Cancelar' }
    );
    if (!ok) return; // cancelou: playlist continua exatamente como estava.
    substituirVersaoItemPlaylist(decisao.item, versaoLocalId);
    savePlaylists();
    renderPlaylist();
    return;
  }

  // ACAO_ADICIONAR_PLAYLIST — música ainda não presente na playlist deste culto.
  // Daqui em diante, mesma lógica de tema/ministrante do «+» da Biblioteca
  // (`addMusicaNaPlaylist`), só que sem o prompt de versão — já resolvida acima.
  let tema;
  const temMarcadores = playlistPossuiMarcadoresTema(pl);
  if (temMarcadores) {
    const marcadores = listarMarcadoresTemaPlaylist(pl);
    if (marcadores.length === 0) {
      alert('Use o botão «Inserir tema na playlist abaixo» (seta até à linha) para adicionar um bloco de tema no fim da playlist antes de incluir músicas.');
      return;
    }
    if (marcadores.length === 1) {
      tema = marcadores[0];
    } else {
      const ultimo = obterUltimoMarcadorTema(pl);
      const opcoesTema = marcadores.map((t) => ({
        value: t,
        label: t === ultimo ? `${t} (ÚLTIMO)` : t,
      }));
      const escTema = await appEscolherOpcao(
        'Em qual tema adicionar esta música?',
        opcoesTema,
        `«${tituloPl}» será adicionada ao tema escolhido.`
      );
      if (escTema == null) return; // cancelou
      tema = normalizarTemaPlaylist(escTema);
    }
  } else {
    tema = getTemaSelecionadoAtual();
    if (!tema) {
      alert('Selecione um tema na lista e use «Inserir tema na playlist abaixo» para ativá-lo na playlist.');
      return;
    }
  }
  garantirTemaNoCatalogoAtual(tema);
  const mt = await camposMinistranteTomParaNovaMusicaNaPlaylist(estadoPainel.cultoId, {
    id: idNum,
    titulo: tituloPl,
    bancoFonte,
  });
  const novoItemHome = {
    id: idNum,
    titulo: tituloPl,
    artista: artistaPl,
    tema,
    versaoLocalId,
    // Tags (rótulos de versão) nunca entram na playlist, seja qual for a versão escolhida.
    versaoRotulo: '',
    bancoFonte,
    ministranteId: mt.ministranteId,
    tom: mt.tom,
  };
  if (temMarcadores) {
    inserirMusicaNoBlocoTema(pl, tema, novoItemHome);
  } else {
    pl.push(novoItemHome);
  }
  savePlaylists();
  renderPlaylist();
}

/** Adiciona ao culto indicado (sem mudar o culto atualmente selecionado até `onCultoChange`). */
export async function addMusicaNaPlaylistParaCulto(cid, meta) {
  if (!cid || meta == null || meta.id == null) return;
  const pl = getPlaylist(cid);
  const vid = versaoLocalIdTrimado(meta.versaoLocalId) || null;
  const bfAdd = fonteBancoItemPlaylist(meta);
  if (playlistJaContemMesmaMusicaEVersao(pl, meta.id, vid, bfAdd)) return;
  let tema = normalizarTemaPlaylist(meta.tema);
  if (playlistPossuiMarcadoresTema(pl)) {
    const ult = obterUltimoMarcadorTema(pl);
    if (ult) tema = ult;
  }
  if (tema) {
    if (!Array.isArray(estadoPainel.temasPorCulto[cid])) estadoPainel.temasPorCulto[cid] = [];
    estadoPainel.temasPorCulto[cid] = normalizarListaTemas([...(estadoPainel.temasPorCulto[cid] || []), tema]);
    saveTemasPorCulto();
  }
  const mt = await camposMinistranteTomParaNovaMusicaNaPlaylist(cid, {
    ...meta,
    id: meta.id,
    bancoFonte: bfAdd,
    titulo: meta.titulo,
  });
  pl.push({
    id: meta.id,
    titulo: meta.titulo,
    artista: meta.artista || '',
    tema,
    versaoLocalId: vid,
    // Tags (rótulos de versão) nunca entram na playlist, qualquer que seja a origem do import.
    versaoRotulo: '',
    bancoFonte: bfAdd,
    ministranteId: mt.ministranteId,
    tom: mt.tom,
  });
}

/**
 * Aplica músicas vindas do telemóvel (HTTP :3001 ou socket) nas playlists do painel.
 *
 * @param {{ musicas?: Array }} payload
 */
export async function processarMusicasSincronizadasPayload(payload) {
  try {
    await carregarMusicas();
    refreshListaBanco();
  } catch (_) {
  // intencional — erro ignorado
}
  if (!payload || !Array.isArray(payload.musicas) || !payload.musicas.length) return;

  const semCulto = [];
  for (const m of payload.musicas) {
    const cid = m.cultoId != null ? String(m.cultoId).trim() : '';
    if (cid) await addMusicaNaPlaylistParaCulto(cid, m);
    else semCulto.push(m);
  }

  let mudouPlaylist = false;
  for (const m of payload.musicas) {
    const cid = m.cultoId != null ? String(m.cultoId).trim() : '';
    if (cid) mudouPlaylist = true;
  }
  if (mudouPlaylist) savePlaylists();

  const comCulto = payload.musicas.filter((m) => m.cultoId != null && String(m.cultoId).trim());
  const cids = [...new Set(comCulto.map((m) => String(m.cultoId).trim()))];
  const mainSel = document.getElementById('culto-sel');
  if (mainSel && cids.length === 1) {
    mainSel.value = cids[0];
    onCultoChange();
  } else if (mudouPlaylist) {
    renderPlaylist();
  }

  if (semCulto.length) abrirModalNovasMusicasSync({ musicas: semCulto });
}

let syncPlaylistModalPayload = null;

function preencherSyncPlaylistCultoSel() {
  const sel = document.getElementById('sync-playlist-culto-sel');
  if (!sel) return;
  sel.innerHTML = '';
  const lista = listarCultosDisponiveis();
  const vazio = document.createElement('option');
  vazio.value = '';
  vazio.textContent = 'Selecione o dia do culto...';
  sel.appendChild(vazio);
  lista.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.label;
    sel.appendChild(o);
  });
  sel.value =
    estadoPainel.cultoId && lista.some((c) => c.id === estadoPainel.cultoId) ? estadoPainel.cultoId : '';
}

function abrirModalNovasMusicasSync(payload) {
  syncPlaylistModalPayload = payload && Array.isArray(payload.musicas) ? payload.musicas : [];
  const bd = document.getElementById('sync-playlist-backdrop');
  const desc = document.getElementById('sync-playlist-desc');
  const ul = document.getElementById('sync-playlist-lista');
  if (!bd || !desc || !ul) return;
  const n = syncPlaylistModalPayload.length;
  if (n === 0) return;
  desc.textContent =
    n === 1
      ? 'Uma música foi gravada no PC (sincronização do telemóvel).'
      : `${n} músicas foram gravadas no PC (sincronização do telemóvel).`;
  ul.innerHTML = '';
  syncPlaylistModalPayload.forEach((m) => {
    const li = document.createElement('li');
    li.textContent = `${m.titulo || ''}${m.artista ? ' — ' + m.artista : ''}`;
    ul.appendChild(li);
  });
  preencherSyncPlaylistCultoSel();
  bd.hidden = false;
  bd.setAttribute('aria-hidden', 'false');
}

export function fecharModalNovasMusicasSync() {
  const bd = document.getElementById('sync-playlist-backdrop');
  if (bd) {
    bd.hidden = true;
    bd.setAttribute('aria-hidden', 'true');
  }
  syncPlaylistModalPayload = null;
}

export function confirmarSyncPlaylistModal() {
  const sel = document.getElementById('sync-playlist-culto-sel');
  const cid = sel ? String(sel.value || '').trim() : '';
  if (!cid || !syncPlaylistModalPayload || syncPlaylistModalPayload.length === 0) {
    fecharModalNovasMusicasSync();
    return;
  }
  void (async () => {
    for (const m of syncPlaylistModalPayload) {
      await addMusicaNaPlaylistParaCulto(cid, m);
    }
    savePlaylists();
    const mainSel = document.getElementById('culto-sel');
    if (mainSel) {
      mainSel.value = cid;
      onCultoChange();
    } else {
      renderPlaylist();
    }
    fecharModalNovasMusicasSync();
  })();
}
