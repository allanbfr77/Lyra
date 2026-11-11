/**
 * Barra de edição da Home: metadados editáveis (título/artista), botões Editar/Salvar/Cancelar, caixa de
 * letras, adicionar à playlist e renomear versão. Movido verbatim do núcleo (`controllerAppCore.js`); o que
 * o núcleo ainda possui entra por `registrarDependenciasToolbarEdicaoHome`.
 */
import { ERRO_ROTULO_DUPLICADO_API, concluirRenomearVersaoServidor, nomeVersaoJaUsadoNaMusica, renderMusicaVersoesBar, versaoCopiaSelecionadaAtual } from './versoesMusica.js';
import { alternarModoLetraCompletaCentral, atualizarToolbarModoLetraCompleta, confirmarProsseguirDescartandoEdicaoPendente, descartarEdicaoLetraCompletaSemSair, letraCompletaSujaVsSnapshot, temEdicaoMusicaNaoGravada } from './letraCompleta.js';
import { appAlert, appConfirm } from './appDialog.js';
import { atualizarCopiaLocal } from './copiasLocaisPainel.js';
import { comparativoSujoVsSnapshot, fecharModoComparativo, sairModoComparativoParaTrocarModo, salvarComparativoNoServidor } from './comparativoVersoes.js';
import { entrarModoEdicao, sairModoEdicao, salvarMusicaServidor } from './editorEstrofes.js';
import { renderPlaylist } from './playlistLista.js';
import { estadoPainel } from './estadoPainel.js';
import { atualizarRotuloVersaoNasPlaylists } from './playlistServidor.js';
import { getControllerApiBase } from './servidorAlvo.js';

export function marcacaoEstrofeEditor() {
  document.querySelectorAll('.estrofe-slide-edit').forEach((el, i) => {
    el.classList.toggle('ativa', estadoPainel.estrofeAtiva === i);
  });
}

function metadadosMusicaEditaveisNaHome() {
  return !!estadoPainel.musicaAtiva && estadoPainel.musicaBancoFonte !== 'catalog';
}

function tituloMusicaEditavelNaHome() {
  return metadadosMusicaEditaveisNaHome();
}

export function metadadosMusicaSujosNaHome() {
  if (!metadadosMusicaEditaveisNaHome()) return false;
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (!et || !ea) return false;
  return et.value !== String(estadoPainel.musicaAtiva?.titulo || '') || ea.value !== String(estadoPainel.musicaAtiva?.artista || '');
}

/**
 * Barra de ações central («menu padrão») — SECÇÃO A: itens que dependem só de
 * `musicaAtiva` / `modoEdicaoEstrofes` / `modoLetraCompletaCentral` / `modoComparativoCentral`.
 *
 * Regra geral do menu padrão (mesma barra nos dois modos, Grade/Slide e Letra
 * Completa — ver `atualizarToolbarModoLetraCompleta`, `atualizarToolbarModoComparativo`
 * e `atualizarBotoesSalvarCancelarBarraPadrao`): trocar de modo NUNCA esconde ou troca
 * o conjunto de botões — só habilita/desabilita os que não fazem sentido no estado
 * atual. A única exceção continua a ser «Editar tag» / «Apagar esta versão», que somem
 * (e não apenas desabilitam) quando não há cópia/versão selecionada — isso é uma
 * questão de qual versão está ativa, não de qual modo a barra está.
 */
export function atualizarToolbarModoEdicao() {
  const m = !!estadoPainel.musicaAtiva;
  const ed = estadoPainel.modoEdicaoEstrofes;
  const full = estadoPainel.modoLetraCompletaCentral;
  const comp = estadoPainel.modoComparativoCentral;
  /* Setas de navegação e Sair continuam disponíveis também no modo Letra Completa —
     o utilizador quer poder controlar a projeção enquanto edita a letra inteira.
     Só a edição por estrofes e o modo comparativo (telas de edição exclusivas,
     sem projeção visível por trás) escondem esse grupo. */
  const emModoEdicaoVisual = ed || comp;
  /* «Criar nova versão» deixou de ser um botão desta barra — passou a ser o chip
     «Nova versão» na barra de versões (renderMusicaVersoesBar). */
  const metadadosEditaveis = metadadosMusicaEditaveisNaHome();
  const tituloEditavel = tituloMusicaEditavelNaHome();
  document.getElementById('btn-editar-letra').style.display = m ? '' : 'none';
  document.getElementById('btn-editar-letra').disabled = !m || full;
  document.getElementById('btn-nova-estrofe').style.display = m ? '' : 'none';
  document.getElementById('btn-nova-estrofe').disabled = !m || !ed;
  const bAnt = document.getElementById('btn-seta-anterior');
  const bProx = document.getElementById('btn-seta-proxima');
  const bSair = document.getElementById('btn-sair-projecao');
  /* Navegar/encerrar só faz sentido com música carregada — sem o `m` estas
     ficavam visíveis sobre o placeholder «Escolha uma música…». */
  const mostrarNavegacaoProjecao = m && !emModoEdicaoVisual;
  if (bAnt) bAnt.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  if (bProx) bProx.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  if (bSair) bSair.style.display = mostrarNavegacaoProjecao ? '' : 'none';
  const et = document.getElementById('edit-titulo');
  const ea = document.getElementById('edit-artista');
  if (et) {
    et.disabled = !tituloEditavel;
    et.readOnly = !tituloEditavel;
    et.title = '';
  }
  if (ea) {
    ea.disabled = !metadadosEditaveis;
    ea.readOnly = !metadadosEditaveis;
  }

  /* Ações contextuais da cópia (Editar tag / Apagar esta versão): só aparecem
     quando há uma cópia selecionada (não ORIGINAL) — somem, não ficam
     desabilitadas por isso. Isso vale nos dois modos da barra padrão (Grade/Slide
     e Letra Completa) igualmente, mesmo durante a edição por estrofes — só o
     modo comparativo (tela de edição exclusiva, sem a versão selecionada à
     vista) as desabilita: a versão selecionada não muda, só não é hora de
     mexer nela por cima do comparativo. */
  const copiaSel = versaoCopiaSelecionadaAtual();
  const mostrarAcoesCopia = !!copiaSel;
  const btnEditarNome = document.getElementById('btn-editar-nome-versao');
  const btnApagarCopia = document.getElementById('btn-apagar-copia-versao');
  if (btnEditarNome) {
    btnEditarNome.style.display = mostrarAcoesCopia ? '' : 'none';
    btnEditarNome.disabled = !mostrarAcoesCopia || comp;
  }
  if (btnApagarCopia) {
    btnApagarCopia.style.display = mostrarAcoesCopia ? '' : 'none';
    btnApagarCopia.disabled = !mostrarAcoesCopia || comp;
  }
  const sep1 = document.getElementById('toolbar-sep-1');
  if (sep1) sep1.style.display = mostrarAcoesCopia ? '' : 'none';

  atualizarToolbarCaixaLetrasEdicao();
  atualizarToolbarAdicionarPlaylistHome();

  /* Sem música a linha fica sem nenhum botão: esconder remove também a
     divisória que ela desenha por baixo dos campos de título/artista. */
  document
    .getElementById('centro-toolbar-acoes')
    ?.classList.toggle('centro-toolbar-acoes--sem-musica', !m);

  atualizarToolbarModoLetraCompleta();
  atualizarToolbarModoComparativo();
  /* Por último: «Salvar alterações» e «Cancelar» dependem do resultado de todos
     os outros — cada um decide, pelo sub-modo activo, o que salvar/descartar. */
  atualizarBotoesSalvarCancelarBarraPadrao();
  estadoPainel.homeLayout?.update({
    ...estadoFaixaEdicaoHome(),
    key: estadoPainel.musicaAtiva ? `${estadoPainel.musicaBancoFonte}:${estadoPainel.musicaAtiva.id}:${estadoPainel.musicaVersaoLocalId || ''}` : '',
    title: estadoPainel.musicaAtiva?.titulo, artist: estadoPainel.musicaAtiva?.artista,
    slides: estadoPainel.musicaAtiva?.estrofes?.length || 0,
    metadataEditable: metadadosEditaveis, full, comparison: comp,
    editing: ed || full || comp,
  });
}

/** Estado que decide a faixa de edição da Home (recalculado também a cada tecla). */
function estadoFaixaEdicaoHome() {
  return {
    full: estadoPainel.modoLetraCompletaCentral,
    comparison: estadoPainel.modoComparativoCentral,
    dirty: temEdicaoMusicaNaoGravada(),
    // Na letra completa/comparativo a faixa só vale com texto alterado (dirty).
    editingSlides: estadoPainel.modoEdicaoEstrofes && !estadoPainel.modoLetraCompletaCentral && !estadoPainel.modoComparativoCentral,
    editingFull: estadoPainel.modoLetraCompletaCentral && estadoPainel.letraCompletaEditando && !estadoPainel.modoComparativoCentral,
    // Nome da cópia/versão selecionada (null no Original, que não é renomeável).
    versionName: versaoCopiaSelecionadaAtual()?.rotulo ?? null,
  };
}

/**
 * Renomeia a cópia/versão selecionada a partir do campo do cabeçalho (modo Editar).
 * Mesmas regras do diálogo «Renomear versão»: nome vazio não grava, nome repetido avisa
 * e não grava. Devolve true quando o nome foi gravado.
 */
export async function renomearVersaoSelecionadaComNome(nomeBruto) {
  const c = versaoCopiaSelecionadaAtual();
  const nome = String(nomeBruto ?? '').trim();
  if (!c || !nome || nome === String(c.rotulo || '').trim()) return false;
  if (c.tipo === 'local') {
    if (nomeVersaoJaUsadoNaMusica(c.rootId, nome, c.id)) {
      await appAlert(`Já existe uma versão chamada «${nome}» nesta música. Escolha um nome diferente.`, 'Nome de versão repetido');
      return false;
    }
    const up = atualizarCopiaLocal(c.rootId, c.id, { rotulo: nome });
    if (!up.ok) {
      await appAlert(up.erro || 'Não foi possível renomear a versão local.');
      return false;
    }
    atualizarRotuloVersaoNasPlaylists(c.rootId, c.id, nome);
    renderMusicaVersoesBar();
    renderPlaylist();
    return true;
  }
  const idNum = parseInt(c.id, 10);
  if (!Number.isFinite(idNum)) return false;
  try {
    const url = `${getControllerApiBase()}/api/musicas/${idNum}/rotulo`;
    const opts = { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rotulo: nome }) };
    let res = await fetch(url, { method: 'PATCH', ...opts });
    if (res.status === 404) res = await fetch(url, { method: 'POST', ...opts });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.codigo === ERRO_ROTULO_DUPLICADO_API) await appAlert(data.erro, 'Nome de versão repetido');
      else await appAlert(data.erro || `Não foi possível renomear (HTTP ${res.status}).`);
      return false;
    }
    await concluirRenomearVersaoServidor(c.rootId, c.id, idNum, String(data.rotulo || nome).trim());
    return true;
  } catch (e) {
    await appAlert(e?.message || 'Não foi possível renomear a versão.');
    return false;
  }
}

// (extraído) letra completa → painel/letraCompleta.js

// (extraído) modo comparativo → painel/comparativoVersoes.js

/** Botão «Editar letra»: no comparativo, sai dele primeiro. */
export async function acionarEditarLetraBarraPadrao() {
  if (!estadoPainel.musicaAtiva) return;
  if (!(await sairModoComparativoParaTrocarModo())) return;
  if (estadoPainel.homeLayout?.isHome() && estadoPainel.modoLetraCompletaCentral) {
    // Na letra completa, «Editar» só libera o texto para edição (continua na letra completa).
    if (!estadoPainel.letraCompletaEditando) {
      estadoPainel.letraCompletaEditando = true;
      atualizarToolbarModoEdicao();
      document.getElementById('centro-letra-completa-ta')?.focus();
    }
    return;
  }
  if (estadoPainel.homeLayout?.isHome()) {
    // Na Home «Editar letra» abre a edição por slides (antigo botão do lápis).
    if (estadoPainel.modoEdicaoEstrofes) return;
    if (!(await confirmarProsseguirDescartandoEdicaoPendente())) return;
  }
  entrarModoEdicao();
}

/** Sai do modo sem gravar nada — o que foi digitado nas colunas é descartado. */
export async function cancelarModoComparativoCentral() {
  if (!estadoPainel.modoComparativoCentral) return;
  if (comparativoSujoVsSnapshot()) {
    const ok = await appConfirm(
      'Descartar as alterações feitas nesta comparação?',
      'Modo comparativo'
    );
    if (!ok) return;
  }
  fecharModoComparativo();
}

/**
 * Botão «Modo comparativo» na barra padrão.
 *
 * Fica visível sempre que há música (nunca some — ver a regra geral no topo de
 * `atualizarToolbarModoEdicao`), e desabilitado quando não é possível abrir
 * (catálogo, sem versões) ou quando já está aberto — reabrir por cima de si
 * mesmo não faz sentido; para sair usa-se «Salvar alterações» ou «Cancelar»
 * da própria barra padrão. Pode ser aberto tanto durante a edição por
 * estrofes quanto durante a letra completa — `abrirModoComparativo` já pede
 * confirmação antes de descartar o que estiver pendente em qualquer um dos
 * dois (via `confirmarProsseguirDescartandoEdicaoPendente`).
 */
function atualizarToolbarModoComparativo() {
  const btn = document.getElementById('btn-modo-comparativo');
  const on = estadoPainel.modoComparativoCentral;
  const m = !!estadoPainel.musicaAtiva;
  const podeAbrir = m && estadoPainel.musicaBancoFonte !== 'catalog';

  if (!btn) return;
  btn.style.display = m ? '' : 'none';
  /* Aberto, o botão é o toggle de saída — nunca pode ficar preso desabilitado. */
  btn.disabled = !m || (!on && !podeAbrir);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('ativo', on);
  btn.title = on
    ? 'Sai do modo comparativo (pede confirmação se houver alterações não gravadas)'
    : 'Abrir duas versões lado a lado e destacar as diferenças';
}

/**
 * «Salvar alterações» e «Cancelar» da barra padrão — um único par de botões
 * reaproveitado pelos três sub-modos de edição (estrofes, letra completa,
 * comparativo) e pela edição solta de título/artista, em vez de um par por
 * sub-modo. Cada um decide, pelo sub-modo activo no momento do clique, qual
 * função já existente chamar — nenhuma delas muda de comportamento.
 */

/**
 * «Salvar alterações»: habilitado só quando há alteração concreta e ainda não
 * gravada — nunca só por estar num sub-modo de edição. `temEdicaoMusicaNaoGravada`
 * já compara o conteúdo actual com o snapshot de quando o sub-modo abriu (não a
 * simples presença de um `<textarea>` focado), por isso digitar e depois desfazer
 * até voltar ao texto original mantém o botão desabilitado.
 *
 * «Cancelar» segue o mesmo critério — precisa de alteração pendente de facto,
 * não só de estar num sub-modo — EXCETO na edição por estrofes (Grade/Slide):
 * esse sub-modo não tem nenhum outro botão para sair dele (a Letra Completa
 * tem o próprio botão «Grade/Slide»; o Comparativo satura o «Comparativo» já
 * aberto), então «Cancelar» precisa ficar habilitado assim que o usuário
 * clica em «Editar letra», mesmo sem ter digitado nada ainda, só para poder
 * sair do modo edição.
 */
export function atualizarBotoesSalvarCancelarBarraPadrao() {
  const m = !!estadoPainel.musicaAtiva;
  const emSubModoEdicao = estadoPainel.modoEdicaoEstrofes || estadoPainel.modoLetraCompletaCentral || estadoPainel.modoComparativoCentral;
  const temAlteracaoPendente = temEdicaoMusicaNaoGravada();
  const btnSalvar = document.getElementById('btn-salvar-musica');
  if (btnSalvar) {
    btnSalvar.style.display = m ? '' : 'none';
    btnSalvar.disabled = !m || !temAlteracaoPendente;
  }
  const btnCancelar = document.getElementById('btn-cancelar-padrao');
  if (btnCancelar) {
    btnCancelar.style.display = m ? '' : 'none';
    btnCancelar.disabled =
      !m || (!emSubModoEdicao && !estadoPainel.homeLayout?.metadataOpen()) ||
      (!estadoPainel.modoEdicaoEstrofes && !temAlteracaoPendente && !estadoPainel.homeLayout?.isHome());
  }
  // Cada edição passa por aqui: mantém a faixa da Home em dia sem recalcular o resto.
  estadoPainel.homeLayout?.updateStrip?.(estadoFaixaEdicaoHome());
}

/**
 * Grava o que estiver pendente no sub-modo activo no momento do clique.
 * Reaproveita, sem alterar, a função de gravação própria de cada sub-modo —
 * inclusive o tratamento do catálogo (letra completa grava só na sessão;
 * estrofes/metadados bloqueiam com aviso; comparativo grava por versão e
 * bifurca o ORIGINAL quando necessário).
 */
export async function acionarSalvarAlteracoesBarraPadrao() {
  if (!estadoPainel.musicaAtiva) return;
  if (estadoPainel.modoComparativoCentral) {
    if (!comparativoSujoVsSnapshot()) return;
    const ok = await salvarComparativoNoServidor();
    if (ok) fecharModoComparativo();
    return;
  }
  if (estadoPainel.modoLetraCompletaCentral) {
    if (!letraCompletaSujaVsSnapshot() && !metadadosMusicaSujosNaHome()) return;
    // Mesmo caminho do antigo botão «Modo letra completa» quando clicado já activo.
    await alternarModoLetraCompletaCentral();
    return;
  }
  // Cobre tanto a edição por estrofes quanto título/artista sozinhos.
  await salvarMusicaServidor();
}

/**
 * Descarta o que estiver pendente no sub-modo activo no momento do clique.
 * Cada sub-modo mantém o seu próprio destino/confirmação de sempre — só a
 * posição do botão na barra é que passou a ser uma só. Na Letra Completa,
 * «Cancelar» só desfaz a digitação (`descartarEdicaoLetraCompletaSemSair`) e
 * permanece na Letra Completa — trocar de tela é só o botão «Grade/Slide».
 */
export async function acionarCancelarBarraPadrao() {
  if (estadoPainel.modoComparativoCentral) {
    await cancelarModoComparativoCentral();
    return;
  }
  if (estadoPainel.modoLetraCompletaCentral) {
    descartarEdicaoLetraCompletaSemSair();
    if (estadoPainel.homeLayout?.isHome()) {
      // Cancelar volta à visualização da letra completa (não à grade) e restaura título/artista.
      estadoPainel.letraCompletaEditando = false;
      const et = document.getElementById('edit-titulo');
      const ea = document.getElementById('edit-artista');
      if (et) et.value = estadoPainel.musicaAtiva?.titulo || '';
      if (ea) ea.value = estadoPainel.musicaAtiva?.artista || '';
      atualizarToolbarModoEdicao();
    }
    return;
  }
  if (estadoPainel.modoEdicaoEstrofes) {
    await sairModoEdicao();
    return;
  }
  if (estadoPainel.homeLayout?.isHome() && estadoPainel.homeLayout.metadataOpen()) {
    document.getElementById('edit-titulo').value = estadoPainel.musicaAtiva?.titulo || '';
    document.getElementById('edit-artista').value = estadoPainel.musicaAtiva?.artista || '';
    estadoPainel.homeLayout.closeMetadata();
    atualizarToolbarModoEdicao();
  }
}

/** Caixa das letras — habilitada só no modo edição (slides ou letra completa), mas
 *  sempre visível na barra padrão, como os demais itens (ver nota no topo de
 *  `atualizarToolbarModoEdicao`). */
export function atualizarToolbarCaixaLetrasEdicao() {
  const btn = document.getElementById('btn-caixa-letras-edicao');
  const sep = document.getElementById('toolbar-sep-caixa-letras');
  const m = !!estadoPainel.musicaAtiva;
  const habilitado = m && (estadoPainel.modoEdicaoEstrofes || estadoPainel.modoLetraCompletaCentral);
  /* aA fica sempre no fim da fila de ações; o «|» separa das ações à esquerda. */
  if (sep) sep.style.display = m ? '' : 'none';
  if (!btn) return;
  btn.style.display = m ? '' : 'none';
  btn.disabled = !habilitado;
  btn.classList.toggle('ativo', !!estadoPainel.caixaLetrasEdicaoMaiuscula);
  btn.setAttribute('aria-pressed', estadoPainel.caixaLetrasEdicaoMaiuscula ? 'true' : 'false');
  // Habilitado só ao editar a letra (por slides ou letra completa): explica o motivo quando apagado.
  const tituloCaixa = !habilitado
    ? 'Caixa das letras: disponível ao editar a letra (clique em «Editar letra» ou use a visualização em lista)'
    : estadoPainel.caixaLetrasEdicaoMaiuscula
      ? 'Caixa: MAIÚSCULAS (clique para 1.ª maiúscula + resto minúsculas)'
      : 'Caixa: 1.ª maiúscula + resto minúsculas (clique para MAIÚSCULAS)';
  btn.title = tituloCaixa;
  btn.setAttribute('aria-label', tituloCaixa);
}

/**
 * «Adicionar à playlist» (HOME), ao lado do aA: visível sempre que há música
 * ativa, como o próprio aA (ver `atualizarToolbarCaixaLetrasEdicao` acima) —
 * não depende do sub-modo (Grade/Slide, Letra Completa ou Comparativo).
 */
function atualizarToolbarAdicionarPlaylistHome() {
  const btn = document.getElementById('btn-adicionar-playlist-home');
  const sep = document.getElementById('toolbar-sep-playlist');
  const m = !!estadoPainel.musicaAtiva;
  if (sep) sep.style.display = m ? '' : 'none';
  if (!btn) return;
  btn.style.display = m ? '' : 'none';
  btn.disabled = !m;
}
