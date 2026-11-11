/**
 * Versões da música ativa: barra de versões, chips, renomear e remover (servidor e cópias locais)
 * e troca de versão na área central. Movido verbatim do núcleo (`controllerAppCore.js`); o que o
 * núcleo ainda possui entra por `registrarDependenciasVersoesMusica`.
 */
import { appAlert, appConfirm, appPrompt } from './appDialog.js';
import { atualizarVersoesHome, organizarVersoesHome } from './homeLayout.js';
import { carregarMusicas } from './bibliotecaMusicas.js';
import { ehVersaoLocalLegada, ehVersaoServidorId } from '../modules/copiasLocaisLetra.js';
import { versoesConteudoRigorosamenteIdentico } from '../modules/playlistVersaoMusica.js';
import { estadoPainel } from './estadoPainel.js';

let dep = {};

/**
 * Dependências do núcleo (funções e estado). O corpo abaixo é o original; estas ligações são lidas a
 * cada uso porque o núcleo é avaliado depois deste módulo e reatribui o estado mais adiante.
 */
export function registrarDependenciasVersoesMusica(d) {
  dep = d || {};
}
const atualizarCopiaLocal = (...a) => dep.atualizarCopiaLocal(...a);
const atualizarEstrofesEditorInPlace = (...a) => dep.atualizarEstrofesEditorInPlace(...a);
const atualizarRotuloVersaoNasPlaylists = (...a) => dep.atualizarRotuloVersaoNasPlaylists(...a);
const atualizarSomenteAtivoFaixaSlides = (...a) => dep.atualizarSomenteAtivoFaixaSlides(...a);
const atualizarTextoPainelLetraCompleta = (...a) => dep.atualizarTextoPainelLetraCompleta(...a);
const atualizarToolbarModoEdicao = (...a) => dep.atualizarToolbarModoEdicao(...a);
const carregarVersoesMusicaServidor = (...a) => dep.carregarVersoesMusicaServidor(...a);
const ehModoSlidesOperador = (...a) => dep.ehModoSlidesOperador(...a);
const encontrarCopiaLocal = (...a) => dep.encontrarCopiaLocal(...a);
const estrofesArraysIguaisParaEdicao = (...a) => dep.estrofesArraysIguaisParaEdicao(...a);
const formatarRotuloVersaoExibicao = (...a) => dep.formatarRotuloVersaoExibicao(...a);
const getControllerApiBase = (...a) => dep.getControllerApiBase(...a);
const getCopiasParaMusica = (...a) => dep.getCopiasParaMusica(...a);
const iniciarCriarNovaVersao = (...a) => dep.iniciarCriarNovaVersao(...a);
const marcacaoEstrofeEditor = (...a) => dep.marcacaoEstrofeEditor(...a);
const musicaAtivaEhOriginalServidor = (...a) => dep.musicaAtivaEhOriginalServidor(...a);
const obterRootIdMusicaAtiva = (...a) => dep.obterRootIdMusicaAtiva(...a);
const removerCopiaLocal = (...a) => dep.removerCopiaLocal(...a);
const removerVersaoLocalDasPlaylists = (...a) => dep.removerVersaoLocalDasPlaylists(...a);
const renderEstrofesEditor = (...a) => dep.renderEstrofesEditor(...a);
const renderPlaylist = (...a) => dep.renderPlaylist(...a);
const renderSlidesStrip = (...a) => dep.renderSlidesStrip(...a);
const rotuloVersaoMaiusculo = (...a) => dep.rotuloVersaoMaiusculo(...a);
const splitTextoLetraCompletaEmEstrofes = (...a) => dep.splitTextoLetraCompletaEmEstrofes(...a);
const temEdicaoMusicaNaoGravada = (...a) => dep.temEdicaoMusicaNaoGravada(...a);

export function aplicarBaseMusicaSelecionada(base, id, versaoLocalId) {
  const idNum = Number(id);
  estadoPainel.musicaRootId = Number(base?.root_id ?? idNum);
  estadoPainel.musicaVersaoLocalId = versaoLocalId && String(versaoLocalId).trim() ? String(versaoLocalId) : null;
  if (estadoPainel.musicaVersaoLocalId && ehVersaoLocalLegada(estadoPainel.musicaVersaoLocalId)) {
    const c = encontrarCopiaLocal(idNum, estadoPainel.musicaVersaoLocalId);
    if (c) {
      estadoPainel.musicaAtiva = {
        ...base,
        titulo: c.titulo,
        artista: c.artista || '',
        estrofes: (c.estrofes || []).map((s) => String(s)),
      };
    } else {
      estadoPainel.musicaAtiva = base;
      estadoPainel.musicaVersaoLocalId = null;
    }
  } else {
    estadoPainel.musicaAtiva = base;
    if (estadoPainel.musicaVersaoLocalId && ehVersaoServidorId(estadoPainel.musicaVersaoLocalId)) {
      estadoPainel.musicaVersaoLocalId = null;
    }
  }
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) et.value = estadoPainel.musicaAtiva.titulo || '';
  if (ea) ea.value = estadoPainel.musicaAtiva.artista || '';
  void sincronizarBarraVersoesAposTroca();
  atualizarToolbarModoEdicao();
}

async function confirmarRemoverVersaoLocal(idMusica, copiaId) {
  const ok = await appConfirm(
    'Remover esta versão local? Itens da playlist que usavam esta versão passarão a usar o texto original.',
    'Remover versão'
  );
  if (!ok) return;
  removerCopiaLocal(idMusica, copiaId);
  removerVersaoLocalDasPlaylists(idMusica, copiaId);
  const idNum = Number(idMusica);
  if (estadoPainel.musicaAtiva && Number(estadoPainel.musicaAtiva.id) === idNum && estadoPainel.musicaVersaoLocalId === copiaId) {
    await trocarVersaoMusicaCentral(null);
  }
  renderMusicaVersoesBar();
  renderPlaylist();
  await carregarMusicas();
  atualizarToolbarModoEdicao();
}

export function rotuloExibicaoVersaoServidor(v) {
  return formatarRotuloVersaoExibicao(v?.rotulo, v?.origem_importacao);
}

/**
 * Descreve a versão «cópia» atualmente selecionada (não-ORIGINAL), para as ações
 * contextuais do menu inferior. Devolve `null` quando ORIGINAL, catálogo ou sem
 * música — casos em que Editar nome / Apagar cópia não se aplicam.
 * @returns {{ tipo: 'local'|'servidor', rootId: number, id: string, rotulo: string } | null}
 */
export function versaoCopiaSelecionadaAtual() {
  if (!estadoPainel.musicaAtiva || estadoPainel.musicaAtiva.id == null || estadoPainel.musicaBancoFonte === 'catalog') return null;
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) return null;
  if (estadoPainel.musicaVersaoLocalId) {
    const copia = encontrarCopiaLocal(rootId, estadoPainel.musicaVersaoLocalId);
    if (!copia) return null;
    return { tipo: 'local', rootId, id: copia.id, rotulo: copia.rotulo || '' };
  }
  if (!musicaAtivaEhOriginalServidor()) {
    return { tipo: 'servidor', rootId, id: String(estadoPainel.musicaAtiva.id), rotulo: estadoPainel.musicaAtiva.rotulo || '' };
  }
  return null;
}

/** Editar nome (menu inferior): renomeia a cópia selecionada — servidor ou local. */
export function editarNomeVersaoSelecionada() {
  const c = versaoCopiaSelecionadaAtual();
  if (!c) return;
  if (c.tipo === 'local') void iniciarRenomearVersaoLocal(c.rootId, c.id, c.rotulo);
  else void iniciarRenomearVersaoServidor(c.rootId, c.id, c.rotulo);
}

/** Apagar cópia (menu inferior): remove a cópia selecionada — servidor ou local. */
export function apagarCopiaVersaoSelecionada() {
  const c = versaoCopiaSelecionadaAtual();
  if (!c) return;
  if (c.tipo === 'local') void confirmarRemoverVersaoLocal(c.rootId, c.id);
  else void confirmarRemoverVersaoServidor(c.rootId, c.id);
}

/* Ícones (SVG contorno) da barra de versões. currentColor acompanha o estado do chip. */
const SVG_VERSAO = {
  ramo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  original: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1L12 2z"/></svg>',
  modificada: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  importada: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  local: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1"/><path d="M7 20h10M9 16v4M15 16v4"/></svg>',
  copia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  nova: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

/**
 * A Cópia padrão tem hoje o mesmo conteúdo do Original?
 *
 * Cópia padrão é a primeira versão filha da música — a que nasce junto com o
 * Original (mesmo critério do servidor, `obterCopiaPadraoDoRoot`: o menor id
 * entre os filhos). Vale pelo conteúdo, não pelo nome: uma cópia já renomeada
 * para «Editada» que volte a ficar igual continua a valer.
 *
 * A igualdade é a mesma do resto do sistema: título, artista e estrofes,
 * caractere por caractere.
 */
function copiaPadraoIdenticaAoOriginal(versoes, rootId) {
  const lista = Array.isArray(versoes) ? versoes : [];
  const alvo = Number(rootId);
  const original = lista.find((v) => Number(v.id) === alvo) || null;
  if (!original) return false;
  const copiaPadrao = lista
    .filter((v) => v && v.parent_id != null && Number(v.id) !== alvo)
    .sort((a, b) => Number(a.id) - Number(b.id))[0];
  if (!copiaPadrao) return false;
  return versoesConteudoRigorosamenteIdentico(original, copiaPadrao);
}

/** Ícone da cópia a partir do rótulo (rótulos automáticos conhecidos; nome próprio = cópia genérica). */
function iconeVersaoServidorPorRotulo(labelUpper) {
  const s = String(labelUpper || '').normalize('NFC').toLocaleUpperCase('pt-BR');
  if (s.includes('IMPORTAD')) return SVG_VERSAO.importada;
  /* «VERSÃO <ORIGEM>» é o nome exibido da cópia importada — mesmo ícone. */
  if (s.startsWith('VERSÃO ')) return SVG_VERSAO.importada;
  /* «CÓPIA/ORIGINAL» é o nome exibido da Cópia padrão — mesmo ícone de sempre. */
  if (s.includes('MODIFICAD') || s === 'CÓPIA' || s === 'COPIA') return SVG_VERSAO.modificada;
  if (s === 'CÓPIA/ORIGINAL' || s === 'COPIA/ORIGINAL') return SVG_VERSAO.modificada;
  return SVG_VERSAO.copia;
}

function idChipVersaoAtiva() {
  if (estadoPainel.musicaVersaoLocalId) return String(estadoPainel.musicaVersaoLocalId);
  if (musicaAtivaEhOriginalServidor()) return '__original__';
  if (estadoPainel.musicaAtiva?.id != null) return String(estadoPainel.musicaAtiva.id);
  return '';
}

/** Só troca o chip activo — evita reconstruir a barra (e tremer os slides por baixo). */
function atualizarChipAtivoBarraVersoes() {
  const bar = document.getElementById('musica-versoes-bar');
  if (!bar || bar.hidden) return false;
  const chips = bar.querySelectorAll('.versao-chip[data-versao-id]');
  if (!chips.length) return false;
  const ativo = idChipVersaoAtiva();
  let achou = false;
  chips.forEach((chip) => {
    const on = chip.dataset.versaoId === ativo;
    if (on) achou = true;
    chip.classList.toggle('versao-musica-ativa', on);
  });
  atualizarVersoesHome(bar);
  return achou;
}

function sincronizarBarraVersoesAposTroca() {
  const root = obterRootIdMusicaAtiva();
  if (Number(estadoPainel.versoesMusicaServidorCache.rootId) === Number(root)) {
    if (!atualizarChipAtivoBarraVersoes()) renderMusicaVersoesBar();
    return Promise.resolve();
  }
  return carregarVersoesMusicaServidor(root);
}

export function renderMusicaVersoesBar() {
  const bar = document.getElementById('musica-versoes-bar');
  if (!bar) return;
  if (!estadoPainel.musicaAtiva || estadoPainel.musicaAtiva.id == null) {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) {
    bar.hidden = true;
    return;
  }
  /* Catálogo é só-leitura: não há versões nem criação. */
  if (estadoPainel.musicaBancoFonte === 'catalog') {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  const versoesSrv =
    Number(estadoPainel.versoesMusicaServidorCache.rootId) === rootId
      ? estadoPainel.versoesMusicaServidorCache.versoes || []
      : [];
  const copiasLocais = getCopiasParaMusica(rootId);

  /* Sempre visível (com música editável carregada): mesmo sem cópias, o chip «Nova versão»
     é o único ponto de criação — antes isto ficava no botão da barra de baixo, agora saiu. */
  bar.hidden = false;
  bar.innerHTML = '';

  const mkChip = (label, copiaId, ativo, svg, rotuloOriginal) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn sm versao-chip' + (ativo ? ' versao-musica-ativa' : '');
    b.dataset.versaoId = copiaId == null || copiaId === '' ? '__original__' : String(copiaId);
    b.innerHTML = (svg || '') + '<span class="versao-chip-txt"></span>';
    b.querySelector('.versao-chip-txt').textContent = label;
    if (rotuloOriginal != null) b.dataset.rotuloOriginal = rotuloOriginal;
    b.onclick = () => void trocarVersaoMusicaCentral(copiaId);
    return b;
  };

  const lbl = document.createElement('span');
  lbl.className = 'versao-bar-label';
  lbl.innerHTML = SVG_VERSAO.ramo + '<span>Versões</span>';
  bar.appendChild(lbl);

  const originalAtivo = musicaAtivaEhOriginalServidor() && !estadoPainel.musicaVersaoLocalId;
  /* Enquanto a Cópia padrão tiver exactamente o conteúdo do Original, o chip do
     ORIGINAL é redundante e some do cabeçalho — o registo continua no banco,
     intacto. Editada a cópia, os conteúdos deixam de bater e o ORIGINAL
     reaparece sozinho; voltando a ficar iguais, some outra vez.
     Excepção: se o ORIGINAL for a versão activa, fica — sem ele o cabeçalho não
     mostraria nenhuma versão assinalada. */
  if (originalAtivo || !copiaPadraoIdenticaAoOriginal(versoesSrv, rootId)) {
    bar.appendChild(
      mkChip(rotuloVersaoMaiusculo('Original'), null, originalAtivo, SVG_VERSAO.original, 'Original')
    );
  }

  for (const v of versoesSrv) {
    if (v.parent_id == null && Number(v.id) === rootId) continue;
    if (v.parent_id == null) continue;
    const vid = String(v.id);
    const ativo = !estadoPainel.musicaVersaoLocalId && Number(estadoPainel.musicaAtiva.id) === Number(v.id);
    const rotulo = rotuloExibicaoVersaoServidor(v);
    /* Só o nome/badge — editar e apagar ficam no menu inferior contextual. */
    bar.appendChild(
      mkChip(rotuloVersaoMaiusculo(rotulo), vid, ativo, iconeVersaoServidorPorRotulo(rotulo), rotulo)
    );
  }

  copiasLocais.forEach((c) => {
    const rotuloVis = `${rotuloVersaoMaiusculo(formatarRotuloVersaoExibicao(c.rotulo))} (LOCAL)`;
    bar.appendChild(mkChip(rotuloVis, c.id, estadoPainel.musicaVersaoLocalId === c.id, SVG_VERSAO.local, `${formatarRotuloVersaoExibicao(c.rotulo)} (local)`));
  });

  /* Chip de criação: mesmo destino do antigo botão «Criar nova versão». */
  const nova = document.createElement('button');
  nova.type = 'button';
  nova.className = 'btn sm versao-nova-chip';
  nova.title = 'Cria uma cópia editável a partir do texto gravado no servidor';
  nova.innerHTML = SVG_VERSAO.nova + '<span class="versao-chip-txt">Nova versão</span>';
  nova.onclick = () => void iniciarCriarNovaVersao();
  bar.appendChild(nova);
  organizarVersoesHome(bar);
}

async function iniciarRenomearVersaoServidor(rootId, versaoId, rotuloAtual) {
  const idNum = parseInt(versaoId, 10);
  if (!Number.isFinite(idNum)) return;
  let sugestao = String(rotuloAtual || '').trim();
  let avisoNomeRepetido = '';
  for (;;) {
    /* Nome repetido: avisa e volta a pedir, já com o que foi escrito. */
    const nome = await appPrompt('Novo nome da versão:', {
      title: 'Renomear versão',
      defaultValue: sugestao,
      emptyMsg: 'Digite um nome para a versão.',
      auxText: avisoNomeRepetido || undefined,
    });
    if (!nome) return;
    try {
      let res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/rotulo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotulo: nome }),
      });
      if (res.status === 404) {
        res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/rotulo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rotulo: nome }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.codigo === ERRO_ROTULO_DUPLICADO_API) {
          await appAlert(data.erro, 'Nome de versão repetido');
          sugestao = nome;
          avisoNomeRepetido = data.erro;
          continue;
        }
        await appAlert(data.erro || `Não foi possível renomear (HTTP ${res.status}).`);
        return;
      }
      await concluirRenomearVersaoServidor(rootId, versaoId, idNum, String(data.rotulo || nome).trim());
    } catch (e) {
      await appAlert(e?.message || 'Não foi possível renomear a versão.');
    }
    return;
  }
}

/** Código devolvido pela API quando o nome já pertence a outra versão da música. */
export const ERRO_ROTULO_DUPLICADO_API = 'rotulo-duplicado';

/** Depois de gravado o novo nome: playlists, música activa e barra de versões. */
export async function concluirRenomearVersaoServidor(rootId, versaoId, idNum, rotuloFinal) {
  atualizarRotuloVersaoNasPlaylists(rootId, versaoId, rotuloFinal);
  if (estadoPainel.musicaAtiva && Number(estadoPainel.musicaAtiva.id) === idNum) {
    estadoPainel.musicaAtiva.rotulo = rotuloFinal;
  }
  await carregarVersoesMusicaServidor(rootId);
  renderPlaylist();
}

/**
 * Nome já usado por outra versão desta música (servidor ou local)?
 * Mesma regra do servidor (`existeRotuloVersaoNaFamilia`): caixa não conta, e o
 * original entra com o nome por que é exibido. `idIgnorar` é a versão em causa.
 */
export function nomeVersaoJaUsadoNaMusica(rootId, nome, idIgnorar) {
  const chave = String(nome || '').trim().normalize('NFC').toLocaleLowerCase('pt-BR');
  if (!chave) return false;
  const mesmo = (r) => String(r || '').trim().normalize('NFC').toLocaleLowerCase('pt-BR') === chave;
  if (mesmo('Original')) return true;
  const versoesSrv =
    Number(estadoPainel.versoesMusicaServidorCache.rootId) === Number(rootId)
      ? estadoPainel.versoesMusicaServidorCache.versoes || []
      : [];
  const naoEhAPropria = (id) => String(id) !== String(idIgnorar);
  return (
    versoesSrv.some(
      (v) => v.parent_id != null && naoEhAPropria(v.id) && mesmo(v.rotulo)
    ) || getCopiasParaMusica(rootId).some((c) => naoEhAPropria(c.id) && mesmo(c.rotulo))
  );
}

async function iniciarRenomearVersaoLocal(rootId, copiaId, rotuloAtual) {
  let sugestao = String(rotuloAtual || '').trim();
  let avisoNomeRepetido = '';
  for (;;) {
    const nome = await appPrompt('Novo nome da versão:', {
      title: 'Renomear versão',
      defaultValue: sugestao,
      emptyMsg: 'Digite um nome para a versão.',
      auxText: avisoNomeRepetido || undefined,
    });
    if (!nome) return;
    /* Nome repetido: avisa e volta a pedir outro — sem gravar nada. */
    if (nomeVersaoJaUsadoNaMusica(rootId, nome, copiaId)) {
      const msg = `Já existe uma versão chamada «${nome.trim()}» nesta música. Escolha um nome diferente.`;
      await appAlert(msg, 'Nome de versão repetido');
      sugestao = nome;
      avisoNomeRepetido = msg;
      continue;
    }
    const up = atualizarCopiaLocal(rootId, copiaId, { rotulo: nome });
    if (!up.ok) {
      await appAlert(up.erro || 'Não foi possível renomear a versão local.');
      return;
    }
    atualizarRotuloVersaoNasPlaylists(rootId, copiaId, nome);
    renderMusicaVersoesBar();
    renderPlaylist();
    return;
  }
}

async function confirmarRemoverVersaoServidor(rootId, versaoId) {
  const ok = await appConfirm(
    'Remover esta versão do banco? Itens da playlist que usavam esta versão passarão a usar o original.',
    'Remover versão'
  );
  if (!ok) return;
  const idNum = parseInt(versaoId, 10);
  if (!Number.isFinite(idNum)) return;
  /* Original nunca se exclui como versão individual — só pela Biblioteca (música inteira). */
  if (Number(rootId) === idNum) {
    await appAlert(
      'A Original não pode ser excluída individualmente. Exclua a música pela Biblioteca.',
      'Remover versão'
    );
    return;
  }
  try {
    let res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}/excluir`, {
      method: 'POST',
    });
    if (!res.ok) {
      res = await fetch(`${getControllerApiBase()}/api/musicas/${idNum}`, { method: 'DELETE' });
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      await appAlert(data.erro || `Não foi possível remover (HTTP ${res.status}).`);
      return;
    }
    removerVersaoLocalDasPlaylists(rootId, String(versaoId));
    if (estadoPainel.musicaAtiva && Number(estadoPainel.musicaAtiva.id) === idNum) {
      await trocarVersaoMusicaCentral(null);
    }
    /* Sempre recarregar do servidor: o cache da barra mantinha a versão apagada
       (ex.: «Cópia»), parecendo que a exclusão não tinha funcionado. */
    await carregarVersoesMusicaServidor(rootId);
    renderPlaylist();
    await carregarMusicas();
    atualizarToolbarModoEdicao();
  } catch (e) {
    appAlert(e?.message || 'Não foi possível remover a versão.');
  }
}

async function trocarVersaoMusicaCentral(copiaId) {
  if (!estadoPainel.musicaAtiva) return;
  const rootId = obterRootIdMusicaAtiva();
  if (!Number.isFinite(rootId)) return;
  if (temEdicaoMusicaNaoGravada()) {
    const ok = await appConfirm(
      'Você tem alterações não salvas. Descartar e trocar de versão?',
      'Trocar versão',
      { okLabel: 'Descartar', cancelLabel: 'Cancelar' }
    );
    if (!ok) return;
  }

  const manterLetraCompleta = estadoPainel.modoLetraCompletaCentral;
  const estrofesAntes = (estadoPainel.musicaAtiva.estrofes || []).map((s) => String(s ?? ''));

  try {
    const vid = copiaId && String(copiaId).trim() ? String(copiaId) : null;
    let url;
    if (!vid) {
      url = `${getControllerApiBase()}/api/musicas/${rootId}`;
    } else if (ehVersaoLocalLegada(vid)) {
      url = `${getControllerApiBase()}/api/musicas/${rootId}`;
    } else {
      url = `${getControllerApiBase()}/api/musicas/${encodeURIComponent(vid)}`;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Falha ao carregar música (HTTP ${res.status}).`);
    const base = await res.json();
    if (!base || !Array.isArray(base.estrofes)) throw new Error('Resposta inválida do controlador.');
    estadoPainel.musicaBancoFonte = 'user';
    if (!vid || ehVersaoServidorId(vid)) {
      estadoPainel.musicaAtiva = base;
      estadoPainel.musicaVersaoLocalId = vid && ehVersaoLocalLegada(vid) ? vid : null;
      estadoPainel.musicaRootId = Number(base.root_id ?? rootId);
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = estadoPainel.musicaAtiva.titulo || '';
      if (ea) ea.value = estadoPainel.musicaAtiva.artista || '';
      await sincronizarBarraVersoesAposTroca();
    } else {
      aplicarBaseMusicaSelecionada(base, rootId, vid);
    }
    estadoPainel.estrofeAtiva = Math.min(
      Math.max(estadoPainel.estrofeAtiva < 0 ? 0 : estadoPainel.estrofeAtiva, 0),
      Math.max(0, estadoPainel.musicaAtiva.estrofes.length - 1)
    );
    estadoPainel.projecaoMusicaEmitidaNoServidor = false;
    estadoPainel.bloqueioSincronizarEstrofeDoServidor = true;

    const mesmaLetra = estrofesArraysIguaisParaEdicao(estrofesAntes, estadoPainel.musicaAtiva.estrofes);

    if (manterLetraCompleta) {
      atualizarTextoPainelLetraCompleta();
      const ta = document.getElementById('centro-letra-completa-ta');
      estadoPainel.snapshotLetraCompleta = {
        estrofes: ta
          ? splitTextoLetraCompletaEmEstrofes(ta.value)
          : estadoPainel.musicaAtiva.estrofes.map((s) => String(s ?? '')),
        estrofeAtiva: estadoPainel.estrofeAtiva,
      };
    } else if (!mesmaLetra) {
      if (!atualizarEstrofesEditorInPlace()) renderEstrofesEditor();
    } else {
      marcacaoEstrofeEditor();
    }

    if (estadoPainel.modoEdicaoEstrofes) {
      estadoPainel.snapshotEdicaoEstrofes = {
        titulo: String(estadoPainel.musicaAtiva.titulo || ''),
        artista: String(estadoPainel.musicaAtiva.artista || ''),
        estrofes: estadoPainel.musicaAtiva.estrofes.map((s) => String(s ?? '')),
        estrofeAtiva: estadoPainel.estrofeAtiva,
      };
    }

    if (ehModoSlidesOperador()) {
      if (mesmaLetra) {
        const grid = document.getElementById('slides-grid');
        if (grid && estadoPainel.musicaAtiva) {
          grid.dataset.stripMusicaId = String(estadoPainel.musicaAtiva.id ?? '');
          grid.dataset.stripProjecao = estadoPainel.projecaoMusicaEmitidaNoServidor ? '1' : '0';
        }
        atualizarSomenteAtivoFaixaSlides();
      } else {
        renderSlidesStrip();
      }
    }

    atualizarToolbarModoEdicao();
  } catch (e) {
    appAlert(e?.message || 'Não foi possível trocar de versão.');
  }
}
